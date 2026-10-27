import { json } from '@sveltejs/kit';
import { apiError, profileSchema, readJson, unauthorized } from '#lib/server/api.ts';
import { AuthError } from '#lib/server/auth.ts';
import { updateProfile } from '#lib/server/progress.ts';
import type { RequestHandler } from './$types';

/** POST { displayName?, themeId? } -> { ok: true } */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return unauthorized();
	const { data, response } = await readJson(request, profileSchema);
	if (response) return response;
	try {
		updateProfile(locals.user.id, data);
		return json({ ok: true });
	} catch (err) {
		if (err instanceof AuthError) return apiError(400, err.code, err.message);
		throw err;
	}
};
