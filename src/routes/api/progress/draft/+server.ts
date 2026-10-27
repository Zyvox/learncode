import { json } from '@sveltejs/kit';
import { draftSchema, readJson, unauthorized, unknownLesson } from '#lib/server/api.ts';
import { saveDraft, UnknownLessonError } from '#lib/server/progress.ts';
import type { RequestHandler } from './$types';

/** POST { lessonId, code } -> { ok: true } */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return unauthorized();
	const { data, response } = await readJson(request, draftSchema);
	if (response) return response;
	try {
		saveDraft(locals.user.id, data.lessonId, data.code);
		return json({ ok: true });
	} catch (err) {
		if (err instanceof UnknownLessonError) return unknownLesson();
		throw err;
	}
};
