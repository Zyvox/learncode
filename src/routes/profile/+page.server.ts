import { fail, redirect } from '@sveltejs/kit';
import { STATIC } from '#lib/config.ts';
import { AuthError } from '#lib/server/auth.ts';
import { getBadges, getProgress, updateProfile } from '#lib/server/progress.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	// The static build has no accounts: its profile page is the device-only one.
	if (STATIC) return { earned: [], doneCount: 0 };
	if (!locals.user) redirect(303, '/login?redirectTo=/profile');
	const progress = getProgress(locals.user.id);
	return {
		earned: getBadges(locals.user.id),
		doneCount: Object.values(progress).filter((p) => p.status === 'done').length
	};
};

const serverActions = {
	save: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login?redirectTo=/profile');
		const form = await request.formData();
		const displayName = String(form.get('displayName') ?? '');
		const themeId = String(form.get('themeId') ?? '');
		const values = { displayName, themeId };
		try {
			updateProfile(locals.user.id, {
				displayName,
				...(themeId ? { themeId } : {})
			});
		} catch (err) {
			if (err instanceof AuthError) return fail(400, { error: err.message, values });
			throw err;
		}
		return { saved: true, values };
	}
} satisfies Actions;

// SvelteKit won't prerender a page that has actions, and the static build has nowhere to post
// them anyway, so there are none there. (Typed as the real ones so `form` keeps its type.)
export const actions = (STATIC ? undefined : serverActions) as typeof serverActions;
