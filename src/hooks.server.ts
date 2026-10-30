import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import {
	clearSessionCookie,
	deleteExpiredSessions,
	SESSION_COOKIE,
	setSessionCookie,
	validateSession
} from '#lib/server/auth.ts';
import { runMigrations } from '#lib/server/db.ts';

export const init: ServerInit = () => {
	if (building) return;
	runMigrations();
	deleteExpiredSessions();
};

/**
 * Content-Security-Policy. The real policy for rendered pages is `csp` in vite.config.ts:
 * SvelteKit nonces only the scripts it renders itself (app.html's one script is allowed by hash), so
 * markup that ever slipped into a page could not run a <script>. This fallback covers any other
 * HTML response (e.g. SvelteKit's static error page); it allows no inline scripts at all.
 */
const FALLBACK_CSP = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'self'"
].join('; ');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for the JSON API. SvelteKit's origin check covers form posts; JSON posts are already
 * protected by CORS preflight plus `SameSite=Lax`, and this makes it explicit: a browser request
 * that changes something under /api/ must come from our own pages. Requests without these
 * headers (curl, tests) carry no victim's cookies, so they are let through.
 */
export function isCrossSiteApiRequest(request: Request, url: URL): boolean {
	if (SAFE_METHODS.has(request.method) || !url.pathname.startsWith('/api/')) return false;
	const site = request.headers.get('sec-fetch-site');
	if (site) return site !== 'same-origin' && site !== 'none';
	const origin = request.headers.get('origin');
	if (!origin) return false;
	return origin !== url.origin && origin !== process.env.ORIGIN?.replace(/\/+$/, '');
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;

	if (isCrossSiteApiRequest(event.request, event.url)) {
		return Response.json(
			{ error: 'cross-site', message: 'That request has to come from this site.' },
			{ status: 403 }
		);
	}

	const token = event.cookies.get(SESSION_COOKIE);
	if (token && !building) {
		const result = validateSession(token);
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
			if (result.renewed) {
				setSessionCookie(event.cookies, token, result.session.expiresAt, event.url);
			}
		} else {
			// Stale or forged cookie: drop it so we stop looking it up.
			clearSessionCookie(event.cookies, event.url);
		}
	}

	const response = await resolve(event);

	const headers = response.headers;
	const set = (name: string, value: string) => {
		try {
			if (!headers.has(name)) headers.set(name, value);
		} catch {
			// Immutable headers (e.g. a fetched Response passed through) — leave them alone.
		}
	};
	set('X-Content-Type-Options', 'nosniff');
	set('Referrer-Policy', 'strict-origin-when-cross-origin');
	set('X-Frame-Options', 'SAMEORIGIN');
	set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	if (headers.get('content-type')?.startsWith('text/html')) {
		set('Content-Security-Policy', FALLBACK_CSP);
	}
	if (event.locals.user) set('Cache-Control', 'private, no-store');
	return response;
};

/**
 * Unexpected errors: log the details on the server, send only a generic message to the browser
 * (SvelteKit's default "Internal Error", which the error page knows to hide). Expected errors
 * (`error(404, …)`, framework 404s) keep their own status and message. Must never throw.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return;
	try {
		console.error(`Unexpected error on ${event.request.method} ${event.url.pathname}:`, error);
	} catch {
		// Logging must not take the error page down with it.
	}
	return { status: 500, message: 'Internal Error' };
};
