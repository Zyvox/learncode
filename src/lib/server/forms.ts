/** Helpers shared by the auth form actions. */
import { importSchema, importEntrySchema } from './api.ts';
import type { ImportEntry } from './progress.ts';

/** A string field from FormData ('' when missing or a file). */
export function field(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

/** Only same-site absolute paths, e.g. `/learn/first-steps/hello`. Anything else -> fallback. */
export function safeRedirect(target: string | null | undefined, fallback = '/learn'): string {
	if (!target) return fallback;
	if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
		return fallback;
	}
	if (/[\u0000-\u001f\u007f]/.test(target)) return fallback;
	return target;
}

/**
 * Parse the hidden `guestProgress` field. Accepts any of:
 *   - `[{ lessonId, code, hintsUsed, attempts, completedAt }, ...]`
 *   - `{ entries: [...] }` (same body as POST /api/progress/import)
 *   - `{ [lessonId]: { status?, code?|lastCode?, hintsUsed?, attempts?, completedAt? } }`
 *     (a localStorage-style map; entries with a status other than 'done' are skipped)
 * Anything unparseable yields []: a broken guest blob must never block signing up.
 */
export function parseGuestProgress(raw: string): ImportEntry[] {
	if (!raw.trim() || raw.length > 2_000_000) return [];
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return [];
	}

	let candidates: unknown[] = [];
	if (Array.isArray(value)) {
		candidates = value;
	} else if (value && typeof value === 'object') {
		const asBody = importSchema.safeParse(value);
		if (asBody.success) return asBody.data.entries;
		candidates = Object.entries(value as Record<string, unknown>).flatMap(([lessonId, v]) => {
			if (!v || typeof v !== 'object') return [];
			const entry = v as Record<string, unknown>;
			if (entry.status !== undefined && entry.status !== 'done') return [];
			return [{ ...entry, lessonId, code: entry.code ?? entry.lastCode ?? null }];
		});
	}

	return candidates.slice(0, 1_000).flatMap((c) => {
		const parsed = importEntrySchema.safeParse(c);
		return parsed.success ? [parsed.data] : [];
	});
}
