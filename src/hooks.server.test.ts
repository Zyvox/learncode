import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.DATABASE_PATH = ':memory:';
});

import { createSession, createUser } from '#lib/server/auth.ts';
import { handle, init } from './hooks.server.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function fakeEvent(cookie?: string) {
	const jar = new Map<string, string>(cookie ? [['session', cookie]] : []);
	return {
		jar,
		locals: {} as App.Locals,
		cookies: {
			get: (n: string) => jar.get(n),
			set: (n: string, v: string) => void jar.set(n, v),
			delete: (n: string) => void jar.delete(n)
		}
	};
}

const plain = (async () => new Response('ok')) as Any;

beforeAll(async () => {
	await init();
});

describe('handle', () => {
	it('sets locals from a valid session cookie', async () => {
		const user = await createUser({
			email: 'h@example.com',
			password: 'long enough',
			displayName: 'H',
			themeId: 'nature'
		});
		const { id: token } = createSession(user.id);
		const event = fakeEvent(token);
		await handle({ event: event as Any, resolve: plain });
		expect(event.locals.user).toMatchObject({ id: user.id, themeId: 'nature' });
		expect(event.locals.session?.expiresAt).toBeInstanceOf(Date);
	});

	it('clears a bogus cookie and leaves locals empty', async () => {
		const event = fakeEvent('x'.repeat(43));
		await handle({ event: event as Any, resolve: plain });
		expect(event.locals).toEqual({ user: null, session: null });
		expect(event.jar.has('session')).toBe(false);
	});

	it('adds security headers and nonces inline scripts', async () => {
		const event = fakeEvent();
		const resolve = async (_e: Any, opts: Any) => {
			const html =
				'<script>boot()</script><script type="module" src="/a.js"></script><p>&lt;script</p>';
			return new Response(opts.transformPageChunk({ html, done: true }), {
				headers: { 'content-type': 'text/html' }
			});
		};
		const res = await handle({ event: event as Any, resolve: resolve as Any });
		const csp = res.headers.get('content-security-policy')!;
		const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
		expect(nonce).toBeTruthy();
		expect(await res.text()).toBe(
			`<script nonce="${nonce}">boot()</script><script nonce="${nonce}" type="module" src="/a.js"></script><p>&lt;script</p>`
		);
		expect(csp).toContain("worker-src 'self' blob:");
		expect(csp).toContain("'unsafe-eval'");
		expect(csp).toContain("frame-ancestors 'self'");
		expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
	});

	it('does not put a CSP on JSON responses', async () => {
		const res = await handle({
			event: fakeEvent() as Any,
			resolve: (async () => Response.json({ ok: true })) as Any
		});
		expect(res.headers.get('content-security-policy')).toBeNull();
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
	});
});
