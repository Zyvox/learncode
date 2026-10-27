import { json } from '@sveltejs/kit';
import { importSchema, readJson, unauthorized } from '#lib/server/api.ts';
import { importProgress } from '#lib/server/progress.ts';
import type { RequestHandler } from './$types';

/**
 * POST { entries: { lessonId, code?, hintsUsed?, attempts?, completedAt? }[] } -> { imported }
 * Unknown lessons and lessons already done are skipped (not an error).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return unauthorized();
	const { data, response } = await readJson(request, importSchema);
	if (response) return response;
	return json({ imported: importProgress(locals.user.id, data.entries) });
};
