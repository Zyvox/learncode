/**
 * /logout — form contract:
 *
 *   <form method="POST" action="/logout">  (default action, no fields)
 *     -> ends the session, clears the cookie, redirects (303) to /.
 *   A plain GET /logout just redirects to / (logging out must be a POST).
 */
import { redirect } from '@sveltejs/kit';
import { STATIC } from '#lib/config.ts';
import { clearSessionCookie, invalidateSession, SESSION_COOKIE } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	// Static build: prerendered as a "no accounts here" note (+page.svelte).
	if (STATIC) return {};
	redirect(303, '/');
};

const serverActions = {
	default: ({ cookies, url }) => {
		invalidateSession(cookies.get(SESSION_COOKIE));
		clearSessionCookie(cookies, url);
		redirect(303, '/');
	}
} satisfies Actions;

// No accounts (and no actions, which SvelteKit can't prerender) in the static build.
export const actions = (STATIC ? undefined : serverActions) as typeof serverActions;
