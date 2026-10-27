/**
 * /login — form contract (the UI's +page.svelte builds the form from this):
 *
 *   <form method="POST">  (default action)
 *     email, password,
 *     redirectTo (optional hidden field; must start with '/', otherwise /learn is used)
 *
 *   load:     redirects (303) to `?redirectTo` (or /learn) when already logged in;
 *             otherwise returns { redirectTo: string | null } (the safe value from the query string,
 *             to put in the hidden field).
 *   failure:  fail(400 | 429, { error: string, values: { email: string, redirectTo: string } })
 *             400 = missing fields or "That email and password don't match." (never says which)
 *             429 = too many failed tries for this IP + email (10 per 15 minutes)
 *   success:  sets the session cookie and redirects (303) to redirectTo or /learn.
 */
import { fail, redirect } from '@sveltejs/kit';
import {
	AuthError,
	createSession,
	invalidateSession,
	SESSION_COOKIE,
	setSessionCookie,
	verifyLogin
} from '#lib/server/auth.ts';
import { field, safeRedirect } from '#lib/server/forms.ts';
import type { Actions, PageServerLoad } from './$types';

const MISMATCH = 'That email and password don’t match.';

export const load: PageServerLoad = ({ locals, url }) => {
	const requested = url.searchParams.get('redirectTo');
	if (locals.user) redirect(303, safeRedirect(requested));
	return { redirectTo: requested && safeRedirect(requested, '') ? requested : null };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const form = await request.formData();
		const email = field(form, 'email');
		const password = field(form, 'password');
		const redirectTo = safeRedirect(field(form, 'redirectTo'));
		const values = { email: email.trim(), redirectTo };

		if (!email.trim() || !password) {
			return fail(400, { error: 'Pop in your email and password to log in.', values });
		}

		let ip = 'unknown';
		try {
			ip = getClientAddress();
		} catch {
			// Not available (e.g. some adapters/tests) — fall back to a shared bucket per email.
		}

		let user;
		try {
			user = await verifyLogin(email, password, { ip });
		} catch (err) {
			if (err instanceof AuthError && err.code === 'rate-limited') {
				return fail(429, { error: err.message, values });
			}
			throw err;
		}
		if (!user) return fail(400, { error: MISMATCH, values });

		// Always a brand-new token; whatever session this browser had before is ended.
		invalidateSession(cookies.get(SESSION_COOKIE));
		const session = createSession(user.id);
		setSessionCookie(cookies, session.id, session.expiresAt, url);
		redirect(303, redirectTo);
	}
};
