import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.DATABASE_PATH = ':memory:';
});

import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import {
	AuthError,
	clearSessionCookie,
	createSession,
	createUser,
	invalidateSession,
	invalidateUserSessions,
	LOGIN_MAX_FAILURES,
	resetLoginRateLimits,
	SESSION_TTL_MS,
	setSessionCookie,
	validateSession,
	verifyLogin
} from './auth.ts';
import { db } from './db.ts';
import { sessions, users } from './schema.ts';
import { clearTables, resetTestDb } from './test-utils.ts';

const DAY = 24 * 60 * 60 * 1000;

const valid = {
	email: '  Ada@Example.COM ',
	password: 'correct horse',
	displayName: '  Ada   Lovelace ',
	themeId: 'space'
};

async function expectAuthError(p: Promise<unknown>, code: string) {
	await expect(p).rejects.toBeInstanceOf(AuthError);
	await expect(p).rejects.toMatchObject({ code });
}

beforeAll(() => resetTestDb());
beforeEach(() => {
	clearTables();
	resetLoginRateLimits();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('createUser', () => {
	it('creates a user with a normalized email and name', async () => {
		const user = await createUser(valid);
		expect(user).toMatchObject({
			email: 'ada@example.com',
			displayName: 'Ada Lovelace',
			themeId: 'space',
			xp: 0,
			streak: 0
		});
		expect(typeof user.id).toBe('number');
		const row = db.select().from(users).where(eq(users.id, user.id)).get();
		expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
		expect(row?.passwordHash).not.toContain('correct horse');
	});

	it('rejects a duplicate email (case-insensitive)', async () => {
		await createUser(valid);
		await expectAuthError(createUser({ ...valid, email: 'ADA@example.com' }), 'email-taken');
	});

	it('rejects bad input', async () => {
		await expectAuthError(createUser({ ...valid, password: 'short' }), 'weak-password');
		await expectAuthError(createUser({ ...valid, email: 'not-an-email' }), 'invalid-email');
		await expectAuthError(createUser({ ...valid, displayName: '   ' }), 'invalid-name');
		await expectAuthError(createUser({ ...valid, displayName: 'x'.repeat(41) }), 'invalid-name');
		await expectAuthError(createUser({ ...valid, themeId: 'disco' }), 'invalid-theme');
	});
});

describe('verifyLogin', () => {
	it('accepts the right password with any email casing', async () => {
		const user = await createUser(valid);
		const found = await verifyLogin('ADA@example.com ', 'correct horse');
		expect(found?.id).toBe(user.id);
	});

	it('rejects a wrong password and an unknown email the same way', async () => {
		await createUser(valid);
		expect(await verifyLogin('ada@example.com', 'wrong password')).toBeNull();
		expect(await verifyLogin('nobody@example.com', 'correct horse')).toBeNull();
		expect(await verifyLogin('garbage', 'correct horse')).toBeNull();
	});

	it('rate-limits repeated failures per ip+email', async () => {
		await createUser(valid);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));

		for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
			expect(await verifyLogin('ada@example.com', 'nope', { ip: '1.2.3.4' })).toBeNull();
		}
		// Even the right password is refused while locked out...
		await expectAuthError(
			verifyLogin('ada@example.com', 'correct horse', { ip: '1.2.3.4' }),
			'rate-limited'
		);
		// ...but only for that ip+email.
		expect(await verifyLogin('ada@example.com', 'correct horse', { ip: '5.6.7.8' })).not.toBeNull();

		vi.setSystemTime(new Date('2026-01-01T12:15:01Z'));
		expect(await verifyLogin('ada@example.com', 'correct horse', { ip: '1.2.3.4' })).not.toBeNull();
	});

	it('clears the failure count after a success', async () => {
		await createUser(valid);
		for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) {
			await verifyLogin('ada@example.com', 'nope', { ip: 'ip' });
		}
		expect(await verifyLogin('ada@example.com', 'correct horse', { ip: 'ip' })).not.toBeNull();
		for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) {
			await verifyLogin('ada@example.com', 'nope', { ip: 'ip' });
		}
		expect(await verifyLogin('ada@example.com', 'correct horse', { ip: 'ip' })).not.toBeNull();
	});
});

describe('sessions', () => {
	it('creates and validates a session without storing the token', async () => {
		const user = await createUser(valid);
		const { id: token, expiresAt } = createSession(user.id);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);

		const stored = db.select().from(sessions).all();
		expect(stored).toHaveLength(1);
		expect(stored[0].id).not.toBe(token);
		expect(stored[0].id).toMatch(/^[0-9a-f]{64}$/);

		const result = validateSession(token);
		expect(result?.user).toMatchObject({ id: user.id, email: 'ada@example.com' });
		expect(result?.session.id).toBe(stored[0].id);
		expect(result?.renewed).toBe(false);
	});

	it('rejects junk tokens', () => {
		expect(validateSession(undefined)).toBeNull();
		expect(validateSession('')).toBeNull();
		expect(validateSession('x'.repeat(43))).toBeNull();
		expect(validateSession('not a token')).toBeNull();
	});

	it('renews when less than 15 days remain', async () => {
		const user = await createUser(valid);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const { id: token } = createSession(user.id);

		vi.setSystemTime(new Date('2026-01-10T00:00:00Z'));
		expect(validateSession(token)?.renewed).toBe(false);

		vi.setSystemTime(new Date('2026-01-20T00:00:00Z'));
		const renewed = validateSession(token);
		expect(renewed?.renewed).toBe(true);
		expect(renewed?.session.expiresAt.getTime()).toBe(
			new Date('2026-01-20T00:00:00Z').getTime() + SESSION_TTL_MS
		);
	});

	it('expires and deletes old sessions', async () => {
		const user = await createUser(valid);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const { id: token } = createSession(user.id);
		vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
		expect(validateSession(token)).toBeNull();
		expect(db.select().from(sessions).all()).toHaveLength(0);
	});

	it('invalidates a session', async () => {
		const user = await createUser(valid);
		const a = createSession(user.id).id;
		const b = createSession(user.id).id;
		invalidateSession(a);
		expect(validateSession(a)).toBeNull();
		expect(validateSession(b)).not.toBeNull();
		invalidateUserSessions(user.id);
		expect(validateSession(b)).toBeNull();
	});

	it('removes sessions when the user is deleted', async () => {
		const user = await createUser(valid);
		createSession(user.id);
		db.delete(users).where(eq(users.id, user.id)).run();
		expect(db.select().from(sessions).all()).toHaveLength(0);
	});
});

describe('cookies', () => {
	function fakeCookies() {
		return { set: vi.fn(), delete: vi.fn() } as unknown as Cookies & {
			set: ReturnType<typeof vi.fn>;
			delete: ReturnType<typeof vi.fn>;
		};
	}

	it('sets an httpOnly lax cookie, secure only on https', () => {
		const expires = new Date('2026-02-01T00:00:00Z');
		const cookies = fakeCookies();
		const before = process.env.ORIGIN;
		try {
			process.env.ORIGIN = 'http://localhost:3000';
			setSessionCookie(cookies, 'tok', expires);
			expect(cookies.set).toHaveBeenCalledWith('session', 'tok', {
				httpOnly: true,
				sameSite: 'lax',
				path: '/',
				secure: false,
				expires
			});
			process.env.ORIGIN = 'https://learn.example.com';
			setSessionCookie(cookies, 'tok', expires);
			expect(cookies.set.mock.calls[1][2].secure).toBe(true);
			clearSessionCookie(cookies);
			expect(cookies.delete).toHaveBeenCalledWith(
				'session',
				expect.objectContaining({ path: '/', secure: true })
			);
		} finally {
			if (before === undefined) delete process.env.ORIGIN;
			else process.env.ORIGIN = before;
		}
	});
});
