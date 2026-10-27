/**
 * /signup — form contract (the UI's +page.svelte builds the form from this):
 *
 *   <form method="POST">  (default action)
 *     email, password, displayName, themeId (one of THEME_IDS),
 *     guestProgress (optional hidden field: JSON string of the guest's progress, see
 *                    parseGuestProgress in #lib/server/forms.ts for accepted shapes)
 *
 *   load:     redirects (303) to /learn when already logged in; otherwise returns {}.
 *   failure:  fail(400, { error: string, values: { email: string, displayName: string, themeId: string } })
 *             `error` is a human sentence ready to show; `values` refill the form (never the password).
 *   success:  sets the session cookie and redirects (303) to /learn.
 */
import { fail, redirect } from '@sveltejs/kit';
import { AuthError, createSession, createUser, setSessionCookie } from '#lib/server/auth.ts';
import { field, parseGuestProgress } from '#lib/server/forms.ts';
import { importProgress } from '#lib/server/progress.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/learn');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = field(form, 'email');
		const password = field(form, 'password');
		const displayName = field(form, 'displayName');
		const themeId = field(form, 'themeId');
		const values = { email: email.trim(), displayName, themeId };

		let user;
		try {
			user = await createUser({ email, password, displayName, themeId });
		} catch (err) {
			if (err instanceof AuthError) return fail(400, { error: err.message, values });
			throw err;
		}

		const guest = parseGuestProgress(field(form, 'guestProgress'));
		if (guest.length > 0) {
			try {
				importProgress(user.id, guest);
			} catch (err) {
				// The account exists; losing guest progress is sad but shouldn't fail the signup.
				console.error('Importing guest progress failed', err);
			}
		}

		const session = createSession(user.id);
		setSessionCookie(cookies, session.id, session.expiresAt);
		redirect(303, '/learn');
	}
};
