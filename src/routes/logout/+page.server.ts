/**
 * /logout — form contract:
 *
 *   <form method="POST" action="/logout">  (default action, no fields)
 *     -> ends the session, clears the cookie, redirects (303) to /.
 *   A plain GET /logout just redirects to / (logging out must be a POST).
 */
import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, invalidateSession, SESSION_COOKIE } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: ({ cookies }) => {
		invalidateSession(cookies.get(SESSION_COOKIE));
		clearSessionCookie(cookies);
		redirect(303, '/');
	}
};
