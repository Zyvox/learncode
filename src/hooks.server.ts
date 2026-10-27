import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building, dev } from '$app/env';
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
 * Content-Security-Policy. Notes:
 * - SvelteKit's hydration bootstrap is an inline <script>; we tag every <script> in the
 *   rendered HTML with a per-request nonce instead of allowing all inline scripts.
 * - 'unsafe-eval' is required: the engine compiles learner code with `new Function` (the page may
 *   do it for syntax checks; a Blob worker would inherit this policy). `worker-src 'self' blob:`
 *   allows both a bundled worker file and a Blob worker.
 * - Inline styles are allowed (Svelte style directives, CodeMirror).
 * If `kit.csp` is ever configured in vite.config.ts, SvelteKit sets its own header and we keep it.
 */
function contentSecurityPolicy(nonce: string): string {
	const connect = dev ? "'self' ws: wss:" : "'self'";
	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}' 'unsafe-eval' blob:`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self' data:",
		`connect-src ${connect}`,
		"worker-src 'self' blob:",
		"child-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'self'"
	].join('; ');
}

const SCRIPT_TAG = /<script(?=[\s>])(?![^>]*\snonce=)/g;

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token && !building) {
		const result = validateSession(token);
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
			if (result.renewed) setSessionCookie(event.cookies, token, result.session.expiresAt);
		} else {
			// Stale or forged cookie: drop it so we stop looking it up.
			clearSessionCookie(event.cookies);
		}
	}

	const nonce = crypto.randomUUID().replaceAll('-', '');
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace(SCRIPT_TAG, `<script nonce="${nonce}"`)
	});

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
		set('Content-Security-Policy', contentSecurityPolicy(nonce));
	}
	if (event.locals.user) set('Cache-Control', 'private, no-store');
	return response;
};
