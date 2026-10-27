/**
 * Exercises the JSON endpoints and auth form actions as plain functions with fake events.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.DATABASE_PATH = ':memory:';
});
vi.mock('#lib/curriculum/index.ts', () => import('./test-curriculum.ts'));

import { isActionFailure, isRedirect } from '@sveltejs/kit';
import {
	createSession,
	createUser,
	getUserById,
	resetLoginRateLimits,
	validateSession
} from './auth.ts';
import { getProgress } from './progress.ts';
import { clearTables, resetTestDb } from './test-utils.ts';
import { GET as health } from '../../routes/api/health/+server.ts';
import { POST as complete } from '../../routes/api/progress/complete/+server.ts';
import { POST as draft } from '../../routes/api/progress/draft/+server.ts';
import { POST as importRoute } from '../../routes/api/progress/import/+server.ts';
import { POST as profile } from '../../routes/api/profile/+server.ts';
import { actions as signupActions } from '../../routes/signup/+page.server.ts';
import { actions as loginActions } from '../../routes/login/+page.server.ts';
import { actions as logoutActions } from '../../routes/logout/+page.server.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function fakeCookies(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	return {
		jar,
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => void jar.set(name, value),
		delete: (name: string) => void jar.delete(name)
	};
}

function jsonRequest(body: unknown, raw?: string) {
	return new Request('http://localhost/api', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: raw ?? JSON.stringify(body)
	});
}

function formRequest(fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return new Request('http://localhost/form', { method: 'POST', body });
}

let user: NonNullable<App.Locals['user']>;
const locals = () => ({ user, session: null }) as App.Locals;
const anon = { user: null, session: null } as App.Locals;

async function call(handler: Any, event: Any) {
	return (await handler(event)) as Response;
}

async function catchRedirect(fn: () => unknown) {
	try {
		await fn();
	} catch (e) {
		if (isRedirect(e)) return e;
		throw e;
	}
	throw new Error('expected a redirect');
}

beforeAll(() => resetTestDb());
beforeEach(async () => {
	clearTables();
	resetLoginRateLimits();
	user = await createUser({
		email: 'linus@example.com',
		password: 'long enough',
		displayName: 'Linus',
		themeId: 'games'
	});
});

describe('api', () => {
	it('health is public', async () => {
		const res = await call(health, {});
		expect(await res.json()).toEqual({ ok: true });
	});

	it('requires a user', async () => {
		for (const handler of [complete, draft, importRoute, profile]) {
			const res = await call(handler, { request: jsonRequest({}), locals: anon });
			expect(res.status).toBe(401);
		}
	});

	it('completes a lesson', async () => {
		const res = await call(complete, {
			request: jsonRequest({
				lessonId: 'first-steps/a',
				code: 'move()',
				hintsUsed: 0,
				attempts: 1
			}),
			locals: locals()
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ firstTime: true, xpGained: 15, totalXp: 15, streak: 1 });
		expect(body.level).toMatchObject({ level: 1, title: 'Curious' });
		expect(body.newBadges[0]).toMatchObject({ id: 'first-level' });
	});

	it('400s on bad input and 404s on unknown lessons', async () => {
		const bad = await call(complete, { request: jsonRequest({ lessonId: 'x' }), locals: locals() });
		expect(bad.status).toBe(400);
		expect((await bad.json()).error).toBe('invalid-input');
		const notJson = await call(draft, { request: jsonRequest(null, '{oops'), locals: locals() });
		expect(notJson.status).toBe(400);
		const unknown = await call(draft, {
			request: jsonRequest({ lessonId: 'nope/nope', code: '' }),
			locals: locals()
		});
		expect(unknown.status).toBe(404);
	});

	it('saves drafts and imports', async () => {
		const d = await call(draft, {
			request: jsonRequest({ lessonId: 'first-steps/b', code: 'turnLeft()' }),
			locals: locals()
		});
		expect(await d.json()).toEqual({ ok: true });
		const i = await call(importRoute, {
			request: jsonRequest({ entries: [{ lessonId: 'first-steps/a' }, { lessonId: 'zzz' }] }),
			locals: locals()
		});
		expect(await i.json()).toEqual({ imported: 1 });
		expect(getProgress(user.id)['first-steps/b'].status).toBe('started');
	});

	it('updates the profile', async () => {
		const ok = await call(profile, {
			request: jsonRequest({ displayName: 'Linus T', themeId: 'food' }),
			locals: locals()
		});
		expect(ok.status).toBe(200);
		expect(getUserById(user.id)).toMatchObject({ displayName: 'Linus T', themeId: 'food' });
		const bad = await call(profile, {
			request: jsonRequest({ themeId: 'disco' }),
			locals: locals()
		});
		expect(bad.status).toBe(400);
		const empty = await call(profile, { request: jsonRequest({}), locals: locals() });
		expect(empty.status).toBe(400);
		const blank = await call(profile, {
			request: jsonRequest({ displayName: ' ' }),
			locals: locals()
		});
		expect(blank.status).toBe(400);
	});
});

describe('auth actions', () => {
	it('signs up, imports guest progress and sets the cookie', async () => {
		const cookies = fakeCookies();
		const r = await catchRedirect(() =>
			(signupActions.default as Any)({
				request: formRequest({
					email: 'New@Example.com',
					password: 'long enough',
					displayName: 'New',
					themeId: 'space',
					guestProgress: JSON.stringify([{ lessonId: 'first-steps/a', hintsUsed: 0 }])
				}),
				cookies
			})
		);
		expect(r).toMatchObject({ status: 303, location: '/learn' });
		const session = validateSession(cookies.jar.get('session'));
		expect(session?.user).toMatchObject({ email: 'new@example.com', xp: 15 });
	});

	it('returns a friendly failure on signup errors', async () => {
		const result = await (signupActions.default as Any)({
			request: formRequest({
				email: 'linus@example.com',
				password: 'long enough',
				displayName: 'Dup',
				themeId: 'games'
			}),
			cookies: fakeCookies()
		});
		expect(isActionFailure(result)).toBe(true);
		expect(result.status).toBe(400);
		expect(result.data).toEqual({
			error: expect.stringContaining('already an account'),
			values: { email: 'linus@example.com', displayName: 'Dup', themeId: 'games' }
		});
	});

	it('logs in and redirects to a safe target', async () => {
		const cookies = fakeCookies();
		const r = await catchRedirect(() =>
			(loginActions.default as Any)({
				request: formRequest({
					email: 'LINUS@example.com',
					password: 'long enough',
					redirectTo: '/learn/first-steps/a'
				}),
				cookies,
				getClientAddress: () => '127.0.0.1'
			})
		);
		expect(r).toMatchObject({ status: 303, location: '/learn/first-steps/a' });
		expect(validateSession(cookies.jar.get('session'))?.user.id).toBe(user.id);

		const evil = await catchRedirect(() =>
			(loginActions.default as Any)({
				request: formRequest({
					email: 'linus@example.com',
					password: 'long enough',
					redirectTo: '//evil.example'
				}),
				cookies: fakeCookies(),
				getClientAddress: () => '127.0.0.1'
			})
		);
		expect(evil.location).toBe('/learn');
	});

	it('never says which part of the login was wrong, and rate-limits', async () => {
		const attempt = (email: string, password: string) =>
			(loginActions.default as Any)({
				request: formRequest({ email, password }),
				cookies: fakeCookies(),
				getClientAddress: () => '10.0.0.1'
			});
		const wrongPassword = await attempt('linus@example.com', 'nope nope');
		const wrongEmail = await attempt('who@example.com', 'long enough');
		expect(wrongPassword.status).toBe(400);
		expect(wrongPassword.data.error).toBe(wrongEmail.data.error);
		expect(wrongPassword.data.values).toEqual({ email: 'linus@example.com', redirectTo: '/learn' });
		for (let i = 0; i < 9; i++) await attempt('linus@example.com', 'nope nope');
		const limited = await attempt('linus@example.com', 'long enough');
		expect(limited.status).toBe(429);
	});

	it('logs out', async () => {
		const { id: token } = createSession(user.id);
		const cookies = fakeCookies({ session: token });
		const r = await catchRedirect(() => (logoutActions.default as Any)({ cookies }));
		expect(r).toMatchObject({ status: 303, location: '/' });
		expect(cookies.jar.has('session')).toBe(false);
		expect(validateSession(token)).toBeNull();
	});
});
