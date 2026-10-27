/**
 * Small helpers for JSON endpoints under src/routes/api. Errors are always JSON:
 * `{ error: <code>, message: <human sentence> }` with a matching status.
 */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { THEME_IDS } from '#lib/curriculum/types.ts';

export const MAX_CODE_LENGTH = 50_000;
export const MAX_IMPORT_ENTRIES = 1_000;

export function apiError(status: number, error: string, message: string): Response {
	return json({ error, message }, { status });
}

export const unauthorized = () =>
	apiError(401, 'not-logged-in', 'You need to be logged in to do that.');

export const unknownLesson = () => apiError(404, 'unknown-lesson', 'We couldn’t find that level.');

/** Parse a JSON body with a zod schema. Returns the data, or a 400 Response to send back. */
export async function readJson<T extends z.ZodType>(
	request: Request,
	schema: T
): Promise<{ data: z.infer<T>; response?: undefined } | { data?: undefined; response: Response }> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return { response: apiError(400, 'bad-json', 'The request body must be JSON.') };
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return {
			response: json(
				{
					error: 'invalid-input',
					message: 'Some of that data doesn’t look right.',
					issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
				},
				{ status: 400 }
			)
		};
	}
	return { data: parsed.data };
}

const lessonId = z.string().min(1).max(200);
const code = z.string().max(MAX_CODE_LENGTH);
const smallCount = z.number().int().min(0).max(1_000_000);

export const completeSchema = z.object({
	lessonId,
	code,
	hintsUsed: smallCount,
	attempts: smallCount
});

export const draftSchema = z.object({ lessonId, code });

export const importEntrySchema = z.object({
	lessonId,
	code: code.nullish().transform((v) => v ?? null),
	hintsUsed: smallCount.default(0),
	attempts: smallCount.default(1),
	completedAt: z
		.string()
		.max(64)
		.nullish()
		.transform((v) => v ?? null)
});

export const importSchema = z.object({
	entries: z.array(importEntrySchema).max(MAX_IMPORT_ENTRIES)
});

export const profileSchema = z
	.object({
		displayName: z.string().max(200).optional(),
		themeId: z.enum(THEME_IDS as [string, ...string[]]).optional()
	})
	.refine((v) => v.displayName !== undefined || v.themeId !== undefined, {
		message: 'Nothing to update.'
	});
