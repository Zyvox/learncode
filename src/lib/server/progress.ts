/**
 * Lesson progress, XP, streaks and badges for signed-in users.
 *
 * Every write that touches several tables runs in one (synchronous) better-sqlite3 transaction.
 * The `now` parameters exist for tests; callers normally leave them out.
 */
import { and, asc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { RunResult } from './sqlite.ts';
import type { Lesson } from '#lib/curriculum/types.ts';
import { getLesson, getLessonContext, getModules } from '#lib/curriculum/index.ts';
import { describeBadge, evaluateBadges, type Badge, type BadgeModule } from '#lib/game/badges.ts';
import { advanceStreak, utcDay } from '#lib/game/streak.ts';
import { completionXp, levelForXp, type LevelInfo } from '#lib/game/xp.ts';
import { AuthError, isThemeId, normalizeDisplayName } from './auth.ts';
import { db } from './db.ts';
import * as schema from './schema.ts';
import { badges, progress, users } from './schema.ts';

type Tx = BaseSQLiteDatabase<'sync', RunResult, typeof schema>;

export interface LessonProgress {
	status: 'done' | 'started';
	attempts: number;
	hintsUsed: number;
	lastCode: string | null;
	completedAt: string | null;
	xpEarned: number;
}

export interface CompletionResult {
	/** True the first time this lesson is completed (the only time it earns XP). */
	firstTime: boolean;
	xpGained: number;
	totalXp: number;
	level: LevelInfo;
	streak: number;
	newBadges: Badge[];
}

export interface CompletionInput {
	code: string;
	/** Hints opened during this play-through. */
	hintsUsed: number;
	/** Runs during this play-through (added to the stored count). */
	attempts: number;
	/** The learner's local hour (0–23) when they finished; falls back to the server's UTC hour. */
	localHour?: number;
}

export interface ImportEntry {
	lessonId: string;
	code: string | null;
	hintsUsed: number;
	attempts: number;
	completedAt: string | null;
}

/** Thrown for a lesson id the curriculum doesn't know. API routes turn it into a 404. */
export class UnknownLessonError extends Error {
	readonly lessonId: string;
	constructor(lessonId: string) {
		super(`Unknown lesson: ${lessonId}`);
		this.name = 'UnknownLessonError';
		this.lessonId = lessonId;
	}
}

/** Thrown when the user row doesn't exist (e.g. deleted mid-session). */
export class UnknownUserError extends Error {
	constructor(userId: number) {
		super(`Unknown user: ${userId}`);
		this.name = 'UnknownUserError';
	}
}

function count(n: unknown): number {
	const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0;
	return Math.min(Math.max(v, 0), 1_000_000);
}

function badgeModules(): BadgeModule[] {
	return getModules();
}

function readProgress(tx: Tx, userId: number): Record<string, LessonProgress> {
	const rows = tx.select().from(progress).where(eq(progress.userId, userId)).all();
	const out: Record<string, LessonProgress> = {};
	for (const r of rows) {
		out[r.lessonId] = {
			status: r.status,
			attempts: r.attempts,
			hintsUsed: r.hintsUsed,
			lastCode: r.lastCode,
			completedAt: r.completedAt,
			xpEarned: r.xpEarned
		};
	}
	return out;
}

function readEarnedIds(tx: Tx, userId: number): string[] {
	return tx
		.select({ badgeId: badges.badgeId })
		.from(badges)
		.where(eq(badges.userId, userId))
		.all()
		.map((b) => b.badgeId);
}

function readUser(tx: Tx, userId: number) {
	const user = tx.select().from(users).where(eq(users.id, userId)).get();
	if (!user) throw new UnknownUserError(userId);
	return user;
}

function moduleCompletedBy(lessons: readonly Lesson[], done: Set<string>): boolean {
	return lessons.length > 0 && lessons.every((l) => done.has(l.id));
}

/** Evaluate + insert new badges. Returns the newly earned ones. */
function awardBadges(
	tx: Tx,
	userId: number,
	opts: {
		streak: number;
		lesson: Lesson | null;
		moduleId: string | null;
		now: Date;
		localHour?: number;
	}
): Badge[] {
	const modules = badgeModules();
	const ids = evaluateBadges({
		progress: readProgress(tx, userId),
		modules,
		streak: opts.streak,
		lesson:
			opts.lesson && opts.moduleId
				? { id: opts.lesson.id, kind: opts.lesson.kind, moduleId: opts.moduleId }
				: null,
		hour: opts.lesson ? (opts.localHour ?? opts.now.getUTCHours()) : null,
		earned: readEarnedIds(tx, userId)
	});
	const earnedAt = opts.now.toISOString();
	for (const badgeId of ids) {
		tx.insert(badges).values({ userId, badgeId, earnedAt }).onConflictDoNothing().run();
	}
	return ids.map(
		(id) => describeBadge(id, modules) ?? { id, name: id, description: '', emoji: '🏅' }
	);
}

// ---------------------------------------------------------------------------------------------

export function getProgress(userId: number): Record<string, LessonProgress> {
	return readProgress(db, userId);
}

/** Remember the learner's code for a lesson. Never changes a 'done' lesson back to 'started'. */
export function saveDraft(userId: number, lessonId: string, code: string, now = new Date()): void {
	if (!getLesson(lessonId)) throw new UnknownLessonError(lessonId);
	const updatedAt = now.toISOString();
	db.insert(progress)
		.values({
			userId,
			lessonId,
			status: 'started',
			attempts: 0,
			hintsUsed: 0,
			lastCode: code,
			updatedAt
		})
		.onConflictDoUpdate({
			target: [progress.userId, progress.lessonId],
			set: { lastCode: code, updatedAt }
		})
		.run();
}

/**
 * Record a passed lesson. First completion earns XP (lesson.xp, ×1.5 without hints, +10 if it
 * finishes the module); replays earn 0 but still count for the streak and badges.
 */
export function completeLesson(
	userId: number,
	lessonId: string,
	input: CompletionInput,
	now = new Date()
): CompletionResult {
	const ctx = getLessonContext(lessonId);
	if (!ctx) throw new UnknownLessonError(lessonId);
	const { lesson, module } = ctx;
	const hintsUsed = count(input.hintsUsed);
	const runs = Math.max(1, count(input.attempts));
	const nowIso = now.toISOString();

	return db.transaction(
		(tx) => {
			const user = readUser(tx, userId);
			const existing = tx
				.select()
				.from(progress)
				.where(and(eq(progress.userId, userId), eq(progress.lessonId, lessonId)))
				.get();
			const firstTime = existing?.status !== 'done';

			let xpGained = 0;
			if (firstTime) {
				const done = new Set(
					tx
						.select({ lessonId: progress.lessonId })
						.from(progress)
						.where(and(eq(progress.userId, userId), eq(progress.status, 'done')))
						.all()
						.map((r) => r.lessonId)
				);
				done.add(lessonId);
				xpGained = completionXp(lesson.xp, {
					hintsUsed,
					completesModule: moduleCompletedBy(module.lessons, done)
				});
			}

			const attempts = (existing?.attempts ?? 0) + runs;
			if (!existing) {
				tx.insert(progress)
					.values({
						userId,
						lessonId,
						status: 'done',
						attempts,
						hintsUsed,
						lastCode: input.code,
						completedAt: nowIso,
						xpEarned: xpGained,
						updatedAt: nowIso
					})
					.run();
			} else {
				tx.update(progress)
					.set(
						firstTime
							? {
									status: 'done',
									attempts,
									hintsUsed,
									lastCode: input.code,
									completedAt: nowIso,
									xpEarned: xpGained,
									updatedAt: nowIso
								}
							: {
									attempts,
									// A clean replay counts toward "no hints" badges.
									hintsUsed: Math.min(existing.hintsUsed, hintsUsed),
									lastCode: input.code,
									updatedAt: nowIso
								}
					)
					.where(and(eq(progress.userId, userId), eq(progress.lessonId, lessonId)))
					.run();
			}

			const streak = advanceStreak(
				{ streak: user.streak, lastActiveDay: user.lastActiveDay },
				utcDay(now)
			);
			const totalXp = user.xp + xpGained;
			tx.update(users)
				.set({ xp: totalXp, streak: streak.streak, lastActiveDay: streak.lastActiveDay })
				.where(eq(users.id, userId))
				.run();

			const newBadges = awardBadges(tx, userId, {
				streak: streak.streak,
				lesson,
				moduleId: module.id,
				now,
				localHour: input.localHour
			});

			return {
				firstTime,
				xpGained,
				totalXp,
				level: levelForXp(totalXp),
				streak: streak.streak,
				newBadges
			};
		},
		{ behavior: 'immediate' }
	);
}

function sanitizeCompletedAt(value: string | null, now: Date): string {
	if (value) {
		const t = Date.parse(value);
		if (Number.isFinite(t) && t <= now.getTime() && t >= Date.UTC(2020, 0, 1)) {
			return new Date(t).toISOString();
		}
	}
	return now.toISOString();
}

/**
 * Merge a guest's localStorage progress into a (new) account. Lessons already done are skipped,
 * unknown lessons ignored. XP follows the normal first-completion rules. The streak is only
 * touched for today (we don't rebuild history from client clocks). Returns how many were imported.
 */
export function importProgress(
	userId: number,
	entries: readonly ImportEntry[],
	now = new Date()
): number {
	const seen = new Set<string>();
	const valid = entries
		.filter((e) => {
			if (seen.has(e.lessonId) || !getLessonContext(e.lessonId)) return false;
			seen.add(e.lessonId);
			return true;
		})
		.map((e) => ({ ...e, completedAt: sanitizeCompletedAt(e.completedAt, now) }))
		.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
	if (valid.length === 0) return 0;

	return db.transaction(
		(tx) => {
			const user = readUser(tx, userId);
			const current = readProgress(tx, userId);
			const done = new Set(
				Object.entries(current)
					.filter(([, p]) => p.status === 'done')
					.map(([id]) => id)
			);
			const nowIso = now.toISOString();
			let imported = 0;
			let xpGained = 0;

			for (const entry of valid) {
				if (done.has(entry.lessonId)) continue;
				const { lesson, module } = getLessonContext(entry.lessonId)!;
				done.add(entry.lessonId);
				const hintsUsed = count(entry.hintsUsed);
				const xp = completionXp(lesson.xp, {
					hintsUsed,
					completesModule: moduleCompletedBy(module.lessons, done)
				});
				const existing = current[entry.lessonId];
				const values = {
					status: 'done' as const,
					attempts: (existing?.attempts ?? 0) + Math.max(1, count(entry.attempts)),
					hintsUsed,
					lastCode: entry.code ?? existing?.lastCode ?? null,
					completedAt: entry.completedAt,
					xpEarned: xp,
					updatedAt: nowIso
				};
				tx.insert(progress)
					.values({ userId, lessonId: entry.lessonId, ...values })
					.onConflictDoUpdate({ target: [progress.userId, progress.lessonId], set: values })
					.run();
				imported++;
				xpGained += xp;
			}
			if (imported === 0) return 0;

			const streak = advanceStreak(
				{ streak: user.streak, lastActiveDay: user.lastActiveDay },
				utcDay(now)
			);
			tx.update(users)
				.set({
					xp: user.xp + xpGained,
					streak: streak.streak,
					lastActiveDay: streak.lastActiveDay
				})
				.where(eq(users.id, userId))
				.run();
			awardBadges(tx, userId, { streak: streak.streak, lesson: null, moduleId: null, now });
			return imported;
		},
		{ behavior: 'immediate' }
	);
}

export function getBadges(userId: number): { badgeId: string; earnedAt: string }[] {
	return db
		.select({ badgeId: badges.badgeId, earnedAt: badges.earnedAt })
		.from(badges)
		.where(eq(badges.userId, userId))
		.orderBy(asc(badges.earnedAt), asc(badges.badgeId))
		.all();
}

/** Earned badges with display info (name, emoji, description), oldest first. */
export function getEarnedBadges(userId: number): (Badge & { earnedAt: string })[] {
	const modules = badgeModules();
	return getBadges(userId).flatMap(({ badgeId, earnedAt }) => {
		const badge = describeBadge(badgeId, modules);
		return badge ? [{ ...badge, earnedAt }] : [];
	});
}

/** Change name and/or vibe. Throws `AuthError('invalid-name' | 'invalid-theme')`. */
export function updateProfile(
	userId: number,
	changes: { displayName?: string; themeId?: string }
): void {
	const set: { displayName?: string; themeId?: string } = {};
	if (changes.displayName !== undefined) {
		const name = normalizeDisplayName(changes.displayName);
		if (!name) throw new AuthError('invalid-name');
		set.displayName = name;
	}
	if (changes.themeId !== undefined) {
		if (!isThemeId(changes.themeId)) throw new AuthError('invalid-theme');
		set.themeId = changes.themeId;
	}
	if (Object.keys(set).length === 0) return;
	db.update(users).set(set).where(eq(users.id, userId)).run();
}
