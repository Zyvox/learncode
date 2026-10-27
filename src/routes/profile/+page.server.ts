import { fail, redirect } from '@sveltejs/kit';
import { AuthError } from '#lib/server/auth.ts';
import { getBadges, getProgress, updateProfile } from '#lib/server/progress.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login?redirectTo=/profile');
	const progress = getProgress(locals.user.id);
	return {
		earned: getBadges(locals.user.id),
		doneCount: Object.values(progress).filter((p) => p.status === 'done').length
	};
};

export const actions: Actions = {
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
};
