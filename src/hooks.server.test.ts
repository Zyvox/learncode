import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.DATABASE_PATH = ':memory:';
});

import { createSession, createUser } from '#lib/server/auth.ts';
import { handle, handleError, init, isCrossSiteApiRequest } from './hooks.server.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function fakeEvent(
	cookie?: string,
	request: Request = new Request('http://localhost/learn'),
	url = new URL(request.url)
) {
	const jar = new Map<string, string>(cookie ? [['session', cookie]] : []);
	return {
		jar,
		request,
		url,
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

	it('adds security headers and a script-tight fallback CSP to HTML', async () => {
		const event = fakeEvent();
		const resolve = async () =>
			new Response('<p>hi</p>', { headers: { 'content-type': 'text/html' } });
		const res = await handle({ event: event as Any, resolve: resolve as Any });
		const csp = res.headers.get('content-security-policy')!;
		expect(csp).toContain("script-src 'self'");
		expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
		expect(csp).toContain("frame-ancestors 'self'");
		expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
	});

	it('keeps the CSP SvelteKit set (with its nonce) and never nonces other scripts', async () => {
		const kitCsp = "script-src 'self' 'nonce-abc' 'unsafe-eval'";
		const html = '<script nonce="abc">boot()</script><p><script>evil()</script></p>';
		const resolve = async (_e: Any, opts: Any) => {
			expect(opts?.transformPageChunk).toBeUndefined();
			return new Response(html, {
				headers: { 'content-type': 'text/html', 'content-security-policy': kitCsp }
			});
		};
		const res = await handle({ event: fakeEvent() as Any, resolve: resolve as Any });
		expect(res.headers.get('content-security-policy')).toBe(kitCsp);
		expect(await res.text()).toBe(html);
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

describe('cross-site API guard', () => {
	type HeaderMap = Record<string, string>;
	const post = (headers: HeaderMap, path = '/api/progress/complete') =>
		new Request(`http://localhost${path}`, { method: 'POST', headers, body: '{}' });
	const url = (r: Request) => new URL(r.url);

	it('blocks browser POSTs to /api/ from other sites', async () => {
		const crossSite: HeaderMap[] = [
			{ 'sec-fetch-site': 'cross-site' },
			{ 'sec-fetch-site': 'same-site' },
			{ origin: 'https://evil.example' }
		];
		for (const headers of crossSite) {
			const r = post(headers);
			expect(isCrossSiteApiRequest(r, url(r))).toBe(true);
		}
		const r = post({ 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain' });
		const res = await handle({ event: fakeEvent(undefined, r) as Any, resolve: plain });
		expect(res.status).toBe(403);
		expect((await res.json()).error).toBe('cross-site');
	});

	it('lets same-origin, header-less and non-API requests through', () => {
		const allowed: HeaderMap[] = [
			{ 'sec-fetch-site': 'same-origin' },
			{ origin: 'http://localhost' },
			{}
		];
		for (const headers of allowed) {
			const r = post(headers);
			expect(isCrossSiteApiRequest(r, url(r))).toBe(false);
		}
		const form = post({ 'sec-fetch-site': 'cross-site' }, '/login');
		expect(isCrossSiteApiRequest(form, url(form))).toBe(false); // SvelteKit checks forms
		const get = new Request('http://localhost/api/health', {
			headers: { 'sec-fetch-site': 'cross-site' }
		});
		expect(isCrossSiteApiRequest(get, url(get))).toBe(false);
	});
});

describe('handleError', () => {
	it('logs unexpected errors and sends only a generic message', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const body = handleError({
				kind: 'unknown',
				error: new Error('SQLITE_BUSY at /srv/app/secret.ts:12'),
				event: fakeEvent(undefined, new Request('http://localhost/learn?x=1')) as Any
			} as Any);
			expect(body).toEqual({ status: 500, message: 'Internal Error' });
			expect(spy).toHaveBeenCalledOnce();
			expect(String(spy.mock.calls[0][0])).toContain('GET /learn');
		} finally {
			spy.mockRestore();
		}
	});

	it('leaves expected errors alone', () => {
		const body = handleError({
			kind: 'app',
			error: { status: 404, message: 'We couldn’t find that level.' },
			event: fakeEvent() as Any
		} as Any);
		expect(body).toBeUndefined();
	});
});
