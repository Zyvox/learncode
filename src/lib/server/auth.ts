/**
 * Accounts, passwords and sessions.
 *
 * - Passwords: argon2id (OWASP params: 19 MiB, t=2, p=1).
 * - Sessions: the cookie holds a random 32-byte base64url token; the DB stores only sha256(token),
 *   so a leaked database can't be replayed as live sessions. 30 days, renewed when < 15 days remain.
 * - Logins are rate-limited in memory: 10 failures per 15 minutes per IP+email.
 */
import { hash, verify } from '@node-rs/argon2';
import type { Cookies } from '@sveltejs/kit';
import { and, eq, lt } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { THEME_IDS, type ThemeId } from '#lib/curriculum/types.ts';
import { currentStreak, utcDay } from '#lib/game/streak.ts';
import { db } from './db.ts';
import { sessions, users, type UserRow } from './schema.ts';

/** The signed-in user as the rest of the app sees it (same shape as `App.Locals['user']`). */
export type User = NonNullable<App.Locals['user']>;
export type Session = NonNullable<App.Locals['session']>;

export type AuthErrorCode =
	| 'email-taken'
	| 'weak-password'
	| 'invalid-email'
	| 'invalid-name'
	| 'invalid-theme'
	| 'rate-limited';

const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
	'email-taken': 'There’s already an account with that email. Want to log in instead?',
	'weak-password': 'Your password needs at least 8 characters.',
	'invalid-email': 'That doesn’t look like an email address. Mind checking it?',
	'invalid-name': 'Pick a name between 1 and 40 characters.',
	'invalid-theme': 'Pick one of the vibes.',
	'rate-limited': 'That’s a lot of tries. Take a short break and try again in a few minutes.'
};

export class AuthError extends Error {
	readonly code: AuthErrorCode;
	constructor(code: AuthErrorCode, message = AUTH_ERROR_MESSAGES[code]) {
		super(message);
		this.name = 'AuthError';
		this.code = code;
	}
}

export const PASSWORD_MIN_LENGTH = 8;
/** Upper bound so nobody can make us hash a megabyte. */
export const PASSWORD_MAX_LENGTH = 256;
export const DISPLAY_NAME_MAX_LENGTH = 40;

export const SESSION_COOKIE = 'session';
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
export const SESSION_RENEW_BELOW_MS = 15 * DAY_MS;

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 };

const emailSchema = z.email().max(254);

/** Trim + lowercase. Returns null if it isn't a valid email. */
export function normalizeEmail(email: unknown): string | null {
	if (typeof email !== 'string') return null;
	const normalized = email.trim().toLowerCase();
	return emailSchema.safeParse(normalized).success ? normalized : null;
}

/** Trimmed, inner whitespace collapsed. Returns null if empty or too long. */
export function normalizeDisplayName(name: unknown): string | null {
	if (typeof name !== 'string') return null;
	const normalized = name.trim().replace(/\s+/g, ' ');
	if (normalized.length < 1 || normalized.length > DISPLAY_NAME_MAX_LENGTH) return null;
	return normalized;
}

export function isThemeId(value: unknown): value is ThemeId {
	return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

function toUser(row: UserRow, now = new Date()): User {
	return {
		id: row.id,
		email: row.email,
		displayName: row.displayName,
		themeId: isThemeId(row.themeId) ? row.themeId : 'games',
		xp: row.xp,
		streak: currentStreak({ streak: row.streak, lastActiveDay: row.lastActiveDay }, utcDay(now)),
		createdAt: row.createdAt
	};
}

export function getUserById(id: number): User | null {
	const row = db.select().from(users).where(eq(users.id, id)).get();
	return row ? toUser(row) : null;
}

// ---------------------------------------------------------------------------------------------
// Accounts

export async function createUser(input: {
	email: string;
	password: string;
	displayName: string;
	themeId: ThemeId | string;
}): Promise<User> {
	const email = normalizeEmail(input.email);
	if (!email) throw new AuthError('invalid-email');
	const displayName = normalizeDisplayName(input.displayName);
	if (!displayName) throw new AuthError('invalid-name');
	if (!isThemeId(input.themeId)) throw new AuthError('invalid-theme');
	if (
		typeof input.password !== 'string' ||
		input.password.length < PASSWORD_MIN_LENGTH ||
		input.password.length > PASSWORD_MAX_LENGTH
	) {
		throw new AuthError('weak-password');
	}

	// Cheap early check so we don't hash for nothing; the unique index is the real guard.
	if (db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) {
		throw new AuthError('email-taken');
	}

	const passwordHash = await hash(input.password, ARGON2_OPTIONS);
	try {
		const row = db
			.insert(users)
			.values({
				email,
				displayName,
				passwordHash,
				themeId: input.themeId,
				createdAt: new Date().toISOString()
			})
			.returning()
			.get();
		return toUser(row);
	} catch (err) {
		if (isUniqueViolation(err)) throw new AuthError('email-taken');
		throw err;
	}
}

function isUniqueViolation(err: unknown): boolean {
	const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
	return [e?.code, e?.cause?.code].some(
		(c) => c === 'SQLITE_CONSTRAINT_UNIQUE' || c === 'SQLITE_CONSTRAINT_PRIMARYKEY'
	);
}

let dummyHash: Promise<string> | null = null;
/** A real hash of a random secret, so unknown emails cost the same time as wrong passwords. */
function getDummyHash(): Promise<string> {
	dummyHash ??= hash(randomBytes(16).toString('hex'), ARGON2_OPTIONS);
	return dummyHash;
}

/**
 * Check an email + password. Returns the user, or null if they don't match (never says which).
 *
 * When `opts.ip` is given, failures are counted per IP+email and, after 10 in 15 minutes, this
 * throws `AuthError('rate-limited')` without checking the password. A success clears the count.
 */
export async function verifyLogin(
	email: string,
	password: string,
	opts: { ip?: string } = {}
): Promise<User | null> {
	const valid = normalizeEmail(email);
	const key =
		opts.ip !== undefined
			? rateLimitKey(
					opts.ip,
					valid ??
						String(email ?? '')
							.trim()
							.toLowerCase()
				)
			: null;
	if (key && isRateLimited(key)) throw new AuthError('rate-limited');

	const row = valid ? db.select().from(users).where(eq(users.email, valid)).get() : undefined;

	// Always run exactly one argon2 verify, so a missing account takes as long as a wrong password.
	const usable = typeof password === 'string' && password.length <= PASSWORD_MAX_LENGTH;
	let ok = false;
	try {
		ok = await verify(row?.passwordHash ?? (await getDummyHash()), usable ? password : '');
	} catch {
		ok = false;
	}
	ok = ok && usable && row !== undefined;

	if (!row || !ok) {
		if (key) recordFailure(key);
		return null;
	}
	if (key) failures.delete(key);
	return toUser(row);
}

export function updateUserPassword(userId: number, passwordHash: string): void {
	db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
}

// ---------------------------------------------------------------------------------------------
// Rate limiting (in memory; resets when the process restarts, which is fine for one Node process)

export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;

const failures = new Map<string, number[]>();

function rateLimitKey(ip: string, email: string): string {
	return `${ip}|${email}`;
}

function recentFailures(key: string, now = Date.now()): number[] {
	const list = (failures.get(key) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
	if (list.length === 0) failures.delete(key);
	else failures.set(key, list);
	return list;
}

function isRateLimited(key: string): boolean {
	return recentFailures(key).length >= LOGIN_MAX_FAILURES;
}

function recordFailure(key: string): void {
	const now = Date.now();
	if (failures.size >= MAX_TRACKED_KEYS) {
		for (const k of failures.keys()) recentFailures(k, now);
		// Still full of live entries: drop the oldest keys (Map keeps insertion order).
		for (const k of failures.keys()) {
			if (failures.size < MAX_TRACKED_KEYS) break;
			failures.delete(k);
		}
	}
	const list = recentFailures(key, now);
	list.push(now);
	failures.set(key, list);
}

/** True if this IP+email is currently locked out of logging in. */
export function isLoginRateLimited(ip: string, email: string): boolean {
	return isRateLimited(rateLimitKey(ip, normalizeEmail(email) ?? email.trim().toLowerCase()));
}

/** Test helper: forget all counted failures. */
export function resetLoginRateLimits(): void {
	failures.clear();
}

// ---------------------------------------------------------------------------------------------
// Sessions

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function sessionIdFromToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Start a session. Returns `{ id, expiresAt }` where `id` is the raw token to put in the cookie
 * (with `setSessionCookie`). Only its sha256 is stored.
 */
export function createSession(userId: number): { id: string; expiresAt: Date } {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	db.insert(sessions)
		.values({ id: sessionIdFromToken(token), userId, expiresAt: expiresAt.toISOString() })
		.run();
	return { id: token, expiresAt };
}

/**
 * Look up the session for a cookie token. Returns null when missing/expired (expired rows are
 * deleted). Sessions with less than 15 days left are extended to 30 days; `renewed` tells the
 * caller to re-send the cookie. `session.id` is the hashed id, not the token.
 */
export function validateSession(
	token: string | undefined | null
): { user: User; session: Session; renewed: boolean } | null {
	if (!token || !TOKEN_PATTERN.test(token)) return null;
	const id = sessionIdFromToken(token);
	const row = db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return null;

	const now = Date.now();
	let expiresAt = new Date(row.session.expiresAt);
	if (!(expiresAt.getTime() > now)) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}

	let renewed = false;
	if (expiresAt.getTime() - now < SESSION_RENEW_BELOW_MS) {
		expiresAt = new Date(now + SESSION_TTL_MS);
		db.update(sessions)
			.set({ expiresAt: expiresAt.toISOString() })
			.where(eq(sessions.id, id))
			.run();
		renewed = true;
	}

	return { user: toUser(row.user, new Date(now)), session: { id, expiresAt }, renewed };
}

/** End the session for this cookie token (no-op if unknown). */
export function invalidateSession(token: string | undefined | null): void {
	if (!token) return;
	db.delete(sessions)
		.where(eq(sessions.id, sessionIdFromToken(token)))
		.run();
}

/** End every session a user has (e.g. after a password change). */
export function invalidateUserSessions(userId: number): void {
	db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

/** Housekeeping: drop expired sessions. Called at startup. */
export function deleteExpiredSessions(now = new Date()): void {
	db.delete(sessions).where(lt(sessions.expiresAt, now.toISOString())).run();
}

/** Delete a session row by its hashed id (as found in `locals.session.id`). */
export function invalidateSessionById(sessionId: string, userId?: number): void {
	db.delete(sessions)
		.where(
			userId === undefined
				? eq(sessions.id, sessionId)
				: and(eq(sessions.id, sessionId), eq(sessions.userId, userId))
		)
		.run();
}

function cookieSecure(): boolean {
	return process.env.ORIGIN?.startsWith('https') ?? false;
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		secure: cookieSecure(),
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		secure: cookieSecure()
	});
}
