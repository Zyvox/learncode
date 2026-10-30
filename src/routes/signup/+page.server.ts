/**
 * /signup — form contract (the UI's +page.svelte builds the form from this):
 *
 *   <form method="POST">  (default action)
 *     email, password, displayName, themeId (one of THEME_IDS),
 *     guestProgress (optional hidden field: JSON string of the guest's progress, see
 *                    parseGuestProgress in #lib/server/forms.ts for accepted shapes)
 *
 *   load:     redirects (303) to /learn when already logged in; otherwise returns {}.
 *   failure:  fail(400 | 429, { error: string, values: { email: string, displayName: string, themeId: string } })
 *             `error` is a human sentence ready to show; `values` refill the form (never the password).
 *             429 = too many new accounts from this IP (20 per hour, `SIGNUPS_PER_IP_PER_HOUR`).
 *   success:  sets the session cookie and redirects (303) to /learn.
 */
import { fail, redirect } from '@sveltejs/kit';
import { STATIC } from '#lib/config.ts';
import {
	AuthError,
	createSession,
	createUser,
	invalidateSession,
	isSignupRateLimited,
	recordSignup,
	SESSION_COOKIE,
	setSessionCookie
} from '#lib/server/auth.ts';
import { field, parseGuestProgress } from '#lib/server/forms.ts';
import { importProgress } from '#lib/server/progress.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (STATIC) return {};
	if (locals.user) redirect(303, '/learn');
	return {};
};

const serverActions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const form = await request.formData();
		const email = field(form, 'email');
		const password = field(form, 'password');
		const displayName = field(form, 'displayName');
		const themeId = field(form, 'themeId');
		const values = { email: email.trim(), displayName, themeId };

		let ip = 'unknown';
		try {
			ip = getClientAddress();
		} catch {
			// Not available (e.g. some adapters/tests) — everyone shares one bucket.
		}
		if (isSignupRateLimited(ip)) {
			return fail(429, { error: new AuthError('too-many-signups').message, values });
		}

		let user;
		try {
			user = await createUser({ email, password, displayName, themeId });
		} catch (err) {
			if (err instanceof AuthError) return fail(400, { error: err.message, values });
			throw err;
		}
		recordSignup(ip);

		const guest = parseGuestProgress(field(form, 'guestProgress'));
		if (guest.length > 0) {
			try {
				importProgress(user.id, guest);
			} catch (err) {
				// The account exists; losing guest progress is sad but shouldn't fail the signup.
				console.error('Importing guest progress failed', err);
			}
		}

		invalidateSession(cookies.get(SESSION_COOKIE));
		const session = createSession(user.id);
		setSessionCookie(cookies, session.id, session.expiresAt, url);
		redirect(303, '/learn');
	}
} satisfies Actions;

// No accounts (and no actions, which SvelteKit can't prerender) in the static build.
export const actions = (STATIC ? undefined : serverActions) as typeof serverActions;
