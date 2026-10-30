/**
 * Backup files for progress kept on the device (the static build, and guests in general):
 * `makeBackup` writes the guest store's data as JSON, `parseBackup` validates a file with the same
 * rules the server applies to `POST /api/progress/import` (#lib/server/api.ts, progress.ts), and
 * `mergeProgress` folds it into what's already on the device without ever losing a finished level.
 * Pure: no DOM, no storage.
 */
import { THEME_IDS, type ThemeId } from '#lib/curriculum/types.ts';

export const BACKUP_KIND = 'learncode-progress';
export const BACKUP_VERSION = 1;
/** Same limits as #lib/server/api.ts (which client code can't import) */
export const MAX_CODE_LENGTH = 20_000;
const MAX_ENTRIES = 1_000;
const MAX_COUNT = 1_000_000;
const MAX_XP = 1_000_000_000;
const MAX_FILE_CHARS = 30_000_000;

export interface ProgressEntry {
	code: string;
	hintsUsed: number;
	attempts: number;
	/** ISO string once passed, null while it's a draft */
	completedAt: string | null;
}

export interface DeviceProgress {
	themeId: ThemeId | null;
	entries: Record<string, ProgressEntry>;
	xp: number;
}

export interface Backup extends DeviceProgress {
	kind: typeof BACKUP_KIND;
	version: typeof BACKUP_VERSION;
	app: string;
	exportedAt: string;
}

export type ParseResult =
	{ ok: true; progress: DeviceProgress; skipped: number } | { ok: false; error: string };

export function makeBackup(progress: DeviceProgress, app: string, now = new Date()): Backup {
	return {
		kind: BACKUP_KIND,
		version: BACKUP_VERSION,
		app,
		exportedAt: now.toISOString(),
		themeId: progress.themeId,
		xp: progress.xp,
		entries: progress.entries
	};
}

/** e.g. `hatch-progress-2026-10-30.json` (local date) */
export function backupFileName(app: string, now = new Date()): string {
	const slug =
		app
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'app';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${slug}-progress-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

const isCount = (v: unknown): v is number =>
	typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT;

/** Like the server: a sane date between 2020 and now, otherwise "now". */
function cleanCompletedAt(value: string, now: Date): string {
	const t = Date.parse(value);
	if (Number.isFinite(t) && t <= now.getTime() && t >= Date.UTC(2020, 0, 1)) {
		return new Date(t).toISOString();
	}
	return now.toISOString();
}

/** One entry, or null when it breaks the rules (the rest of the file still counts). */
function cleanEntry(raw: unknown, now: Date): ProgressEntry | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;
	const code = r.code ?? r.lastCode ?? null;
	if (code !== null && typeof code !== 'string') return null;
	if (r.hintsUsed !== undefined && !isCount(r.hintsUsed)) return null;
	if (r.attempts !== undefined && !isCount(r.attempts)) return null;
	const completedAt = r.completedAt ?? null;
	if (completedAt !== null && (typeof completedAt !== 'string' || completedAt.length > 64)) {
		return null;
	}
	return {
		// An oversized program is dropped rather than the level: it still counts as done.
		code: typeof code === 'string' && code.length <= MAX_CODE_LENGTH ? code : '',
		hintsUsed: (r.hintsUsed as number | undefined) ?? 0,
		attempts: (r.attempts as number | undefined) ?? 0,
		completedAt: completedAt === null ? null : cleanCompletedAt(completedAt, now)
	};
}

/**
 * Read a backup file. Accepts this module's format, the guest store's own localStorage blob, and
 * the `{ entries: [{ lessonId, … }] }` body of the server's import endpoint. Unknown lessons and
 * broken entries are skipped and counted; a file with nothing usable is an error.
 */
export function parseBackup(
	raw: string,
	isKnownLesson: (lessonId: string) => boolean,
	now = new Date()
): ParseResult {
	const notOurs = 'That file doesn’t look like a progress backup.';
	if (raw.length > MAX_FILE_CHARS)
		return { ok: false, error: 'That file is far too big to be a backup.' };
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { ok: false, error: notOurs };
	}
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return { ok: false, error: notOurs };
	const data = value as Record<string, unknown>;

	let pairs: [unknown, unknown][];
	if (Array.isArray(data.entries)) {
		pairs = data.entries.map((e) => [(e as Record<string, unknown> | null)?.lessonId, e]);
	} else if (data.entries && typeof data.entries === 'object') {
		pairs = Object.entries(data.entries as Record<string, unknown>);
	} else {
		return { ok: false, error: notOurs };
	}

	const entries: Record<string, ProgressEntry> = {};
	let skipped = 0;
	for (const [id, e] of pairs.slice(0, MAX_ENTRIES)) {
		const ok = typeof id === 'string' && id.length >= 1 && id.length <= 200 && isKnownLesson(id);
		const entry = ok ? cleanEntry(e, now) : null;
		if (!ok || !entry || entries[id]) {
			skipped++;
			continue;
		}
		entries[id] = entry;
	}
	skipped += Math.max(0, pairs.length - MAX_ENTRIES);

	const xp =
		typeof data.xp === 'number' && Number.isFinite(data.xp) && data.xp > 0
			? Math.min(Math.floor(data.xp), MAX_XP)
			: 0;
	const themeId =
		typeof data.themeId === 'string' && (THEME_IDS as readonly string[]).includes(data.themeId)
			? (data.themeId as ThemeId)
			: null;

	if (Object.keys(entries).length === 0 && xp === 0) {
		return {
			ok: false,
			error: pairs.length
				? 'None of the levels in that file match this app, so there was nothing to restore.'
				: 'That backup is empty, so there was nothing to restore.'
		};
	}
	return { ok: true, progress: { themeId, entries, xp }, skipped };
}

/**
 * Fold a backup into the progress on this device. A finished level never goes back to unfinished
 * (the earliest finish date wins), attempts add up to the larger count, drafts only fill gaps, the
 * higher XP total is kept, and the device's own vibe stays if it has one.
 */
export function mergeProgress(
	current: DeviceProgress,
	incoming: DeviceProgress
): { progress: DeviceProgress; newlyDone: number } {
	const entries: Record<string, ProgressEntry> = { ...current.entries };
	let newlyDone = 0;
	for (const [id, inc] of Object.entries(incoming.entries)) {
		const cur = entries[id];
		if (!cur) {
			entries[id] = { ...inc };
			if (inc.completedAt) newlyDone++;
			continue;
		}
		const attempts = Math.max(cur.attempts, inc.attempts);
		if (cur.completedAt && inc.completedAt) {
			const completedAt = inc.completedAt < cur.completedAt ? inc.completedAt : cur.completedAt;
			entries[id] = { ...cur, attempts, completedAt };
		} else if (inc.completedAt) {
			entries[id] = { ...inc, attempts };
			newlyDone++;
		} else if (cur.completedAt) {
			entries[id] = { ...cur, attempts };
		} else {
			entries[id] = { ...cur, code: cur.code || inc.code, attempts };
		}
	}
	return {
		progress: {
			themeId: current.themeId ?? incoming.themeId,
			entries,
			xp: Math.max(current.xp, incoming.xp)
		},
		newlyDone
	};
}
