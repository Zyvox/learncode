import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.DATABASE_PATH = ':memory:';
});

// A tiny fake curriculum so these tests don't depend on real content.
vi.mock('#lib/curriculum/index.ts', () => import('./test-curriculum.ts'));

import { eq } from 'drizzle-orm';
import { AuthError, createUser, getUserById } from './auth.ts';
import { db } from './db.ts';
import {
	completeLesson,
	getBadges,
	getEarnedBadges,
	getProgress,
	importProgress,
	saveDraft,
	UnknownLessonError,
	updateProfile
} from './progress.ts';
import { users } from './schema.ts';
import { clearTables, resetTestDb } from './test-utils.ts';

let userId: number;
const noon = (day: string) => new Date(`${day}T12:00:00Z`);
const run = (code = 'move()', hintsUsed = 0, attempts = 1) => ({ code, hintsUsed, attempts });

beforeAll(() => resetTestDb());
beforeEach(async () => {
	clearTables();
	const user = await createUser({
		email: 'grace@example.com',
		password: 'long enough',
		displayName: 'Grace',
		themeId: 'games'
	});
	userId = user.id;
});

function userRow() {
	return db.select().from(users).where(eq(users.id, userId)).get()!;
}

describe('completeLesson', () => {
	it('gives lesson xp on a first clear with hints', () => {
		const result = completeLesson(userId, 'first-steps/a', run('move()', 2, 3), noon('2026-05-01'));
		expect(result).toMatchObject({ firstTime: true, xpGained: 10, totalXp: 10, streak: 1 });
		expect(result.level.level).toBe(1);
		expect(getProgress(userId)['first-steps/a']).toEqual({
			status: 'done',
			attempts: 3,
			hintsUsed: 2,
			lastCode: 'move()',
			completedAt: '2026-05-01T12:00:00.000Z',
			xpEarned: 10
		});
	});

	it('gives x1.5 (rounded) with no hints', () => {
		const result = completeLesson(userId, 'doing-it-again/a', run(), noon('2026-05-01'));
		expect(result.xpGained).toBe(23);
	});

	it('gives 0 xp on replay but updates attempts and code', () => {
		completeLesson(userId, 'first-steps/a', run('one', 1, 2), noon('2026-05-01'));
		const replay = completeLesson(userId, 'first-steps/a', run('two', 0, 1), noon('2026-05-01'));
		expect(replay).toMatchObject({ firstTime: false, xpGained: 0, totalXp: 10 });
		const p = getProgress(userId)['first-steps/a'];
		expect(p).toMatchObject({ attempts: 3, lastCode: 'two', hintsUsed: 0, xpEarned: 10 });
		expect(p.completedAt).toBe('2026-05-01T12:00:00.000Z');
	});

	it('adds the module bonus when the last lesson of a module is done', () => {
		completeLesson(userId, 'first-steps/a', run('x', 1), noon('2026-05-01'));
		const result = completeLesson(userId, 'first-steps/b', run('x', 1), noon('2026-05-01'));
		expect(result.xpGained).toBe(20 + 10);
		expect(result.totalXp).toBe(40);
		expect(result.newBadges.map((b) => b.id)).toContain('module-first-steps');
		expect(userRow().xp).toBe(40);
	});

	it('upgrades a draft to done', () => {
		saveDraft(userId, 'first-steps/a', 'draft', noon('2026-05-01'));
		expect(getProgress(userId)['first-steps/a']).toMatchObject({
			status: 'started',
			lastCode: 'draft'
		});
		const result = completeLesson(userId, 'first-steps/a', run('final', 1), noon('2026-05-01'));
		expect(result.firstTime).toBe(true);
		expect(getProgress(userId)['first-steps/a']).toMatchObject({
			status: 'done',
			lastCode: 'final'
		});
	});

	it('tracks the streak across days', () => {
		expect(completeLesson(userId, 'first-steps/a', run(), noon('2026-05-01')).streak).toBe(1);
		expect(completeLesson(userId, 'first-steps/b', run(), noon('2026-05-01')).streak).toBe(1);
		expect(completeLesson(userId, 'doing-it-again/a', run(), noon('2026-05-02')).streak).toBe(2);
		const third = completeLesson(userId, 'doing-it-again/b', run(), noon('2026-05-03'));
		expect(third.streak).toBe(3);
		expect(third.newBadges.map((b) => b.id)).toContain('streak-3');
		// A gap resets it; replays count as activity.
		expect(completeLesson(userId, 'first-steps/a', run(), noon('2026-05-06')).streak).toBe(1);
		expect(userRow().lastActiveDay).toBe('2026-05-06');
	});

	it('awards badges once, with display info', () => {
		const first = completeLesson(
			userId,
			'doing-it-again/a',
			run(),
			new Date('2026-05-01T02:30:00Z')
		);
		expect(first.newBadges.map((b) => b.id).sort()).toEqual([
			'first-level',
			'first-loop',
			'night-owl'
		]);
		expect(first.newBadges.find((b) => b.id === 'first-loop')).toMatchObject({
			name: expect.any(String),
			emoji: expect.any(String)
		});
		const again = completeLesson(
			userId,
			'doing-it-again/b',
			run(),
			new Date('2026-05-01T03:00:00Z')
		);
		expect(again.newBadges).toEqual([]);
		expect(
			getBadges(userId)
				.map((b) => b.badgeId)
				.sort()
		).toEqual(['first-level', 'first-loop', 'night-owl']);
		expect(getEarnedBadges(userId)).toHaveLength(3);
	});

	it('awards bug-squasher after three fixes', () => {
		completeLesson(userId, 'first-steps/b', run(), noon('2026-05-01'));
		completeLesson(userId, 'doing-it-again/a', run(), noon('2026-05-01'));
		const third = completeLesson(userId, 'doing-it-again/b', run(), noon('2026-05-01'));
		expect(third.newBadges.map((b) => b.id)).toContain('bug-squasher');
	});

	it('rejects unknown lessons', () => {
		expect(() => completeLesson(userId, 'nope/nope', run())).toThrow(UnknownLessonError);
		expect(() => saveDraft(userId, 'nope/nope', '')).toThrow(UnknownLessonError);
	});

	it('shows a lapsed streak as 0 on the user', () => {
		completeLesson(userId, 'first-steps/a', run(), noon('2020-05-01'));
		expect(userRow().streak).toBe(1);
		expect(getUserById(userId)?.streak).toBe(0);
	});
});

describe('saveDraft', () => {
	it('never turns a done lesson back into started', () => {
		completeLesson(userId, 'first-steps/a', run('done'), noon('2026-05-01'));
		saveDraft(userId, 'first-steps/a', 'tinkering');
		expect(getProgress(userId)['first-steps/a']).toMatchObject({
			status: 'done',
			lastCode: 'tinkering',
			xpEarned: 15
		});
	});
});

describe('importProgress', () => {
	const entry = (lessonId: string, hintsUsed = 0) => ({
		lessonId,
		code: `// ${lessonId}`,
		hintsUsed,
		attempts: 2,
		completedAt: '2026-04-30T10:00:00.000Z'
	});

	it('imports guest progress with normal xp rules and badges', () => {
		const imported = importProgress(
			userId,
			[
				entry('first-steps/a'),
				entry('first-steps/b', 1),
				entry('unknown/x'),
				entry('first-steps/a')
			],
			noon('2026-05-01')
		);
		expect(imported).toBe(2);
		const user = userRow();
		// 15 (no hints) + 20 + 10 module bonus
		expect(user.xp).toBe(45);
		expect(user.streak).toBe(1);
		expect(user.lastActiveDay).toBe('2026-05-01');
		expect(getProgress(userId)['first-steps/a']).toMatchObject({
			status: 'done',
			completedAt: '2026-04-30T10:00:00.000Z',
			lastCode: '// first-steps/a'
		});
		expect(
			getBadges(userId)
				.map((b) => b.badgeId)
				.sort()
		).toEqual(['first-level', 'module-first-steps']);
	});

	it('skips lessons already done and never duplicates badges', () => {
		completeLesson(userId, 'first-steps/a', run('mine', 1), noon('2026-05-01'));
		const imported = importProgress(
			userId,
			[entry('first-steps/a'), entry('doing-it-again/a')],
			noon('2026-05-01')
		);
		expect(imported).toBe(1);
		expect(getProgress(userId)['first-steps/a'].lastCode).toBe('mine');
		expect(userRow().xp).toBe(10 + 23);
		const ids = getBadges(userId).map((b) => b.badgeId);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toContain('first-loop');
		expect(importProgress(userId, [entry('first-steps/a')], noon('2026-05-01'))).toBe(0);
	});

	it('clamps bogus completion times to now', () => {
		importProgress(
			userId,
			[{ ...entry('first-steps/a'), completedAt: '2999-01-01T00:00:00Z' }],
			noon('2026-05-01')
		);
		expect(getProgress(userId)['first-steps/a'].completedAt).toBe('2026-05-01T12:00:00.000Z');
	});
});

describe('updateProfile', () => {
	it('updates name and theme', () => {
		updateProfile(userId, { displayName: ' Grace H ', themeId: 'music' });
		expect(getUserById(userId)).toMatchObject({ displayName: 'Grace H', themeId: 'music' });
	});

	it('validates', () => {
		expect(() => updateProfile(userId, { displayName: '' })).toThrow(AuthError);
		expect(() => updateProfile(userId, { themeId: 'disco' })).toThrow(AuthError);
	});
});
