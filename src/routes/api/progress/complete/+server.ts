import { json } from '@sveltejs/kit';
import { completeSchema, readJson, unauthorized, unknownLesson } from '#lib/server/api.ts';
import { completeLesson, UnknownLessonError } from '#lib/server/progress.ts';
import type { RequestHandler } from './$types';

/** POST { lessonId, code, hintsUsed, attempts } -> CompletionResult */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return unauthorized();
	const { data, response } = await readJson(request, completeSchema);
	if (response) return response;
	try {
		const { lessonId, ...input } = data;
		return json(completeLesson(locals.user.id, lessonId, input));
	} catch (err) {
		if (err instanceof UnknownLessonError) return unknownLesson();
		throw err;
	}
};
