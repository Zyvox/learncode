/**
 * Guest mode: anyone can play without an account. Their progress lives in localStorage
 * (`lc:progress:v1`) and is handed to the server on signup (hidden `guestProgress` field) or
 * imported after login (`POST /api/progress/import`).
 *
 * It also keeps the parts someone chose to "Jump in here" on the map (`lc:unlocked:v1`). That
 * list is about this device, for guests and signed-in users alike: it survives signup and is not
 * sent to the server, but it is part of the backup file.
 *
 * The store is a module-level singleton, so it must only ever be *written* in the browser.
 * On the server it simply stays at its defaults.
 */
import { browser } from '$app/env';
import { resolve } from '$app/paths';
import { THEME_IDS, type ThemeId } from '#lib/curriculum/types.ts';
import { mergeProgress, type DeviceProgress } from '#lib/game/backup.ts';
import { markLessonsDone } from '#lib/game/mark-done.ts';

export const GUEST_PROGRESS_KEY = 'lc:progress:v1';
export const GUEST_THEME_KEY = 'lc:theme';
export const UNLOCKED_KEY = 'lc:unlocked:v1';
const NUDGE_KEY = 'lc:signup-nudge-dismissed';

export interface GuestEntry {
	code: string;
	hintsUsed: number;
	attempts: number;
	/** ISO string once the level has been passed, null while it's only a draft */
	completedAt: string | null;
}

export interface GuestProgress {
	themeId: ThemeId | null;
	entries: Record<string, GuestEntry>;
	xp: number;
	/** Only in snapshots (backups); stored under its own key */
	unlocked?: string[];
}

export interface ImportEntry {
	lessonId: string;
	code: string;
	hintsUsed: number;
	attempts: number;
	completedAt: string | null;
}

function isThemeId(v: unknown): v is ThemeId {
	return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}

function safeGet(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function safeSet(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Private mode or storage full: progress just won't persist. Nothing to tell the learner.
	}
}

function safeRemove(key: string) {
	try {
		localStorage.removeItem(key);
	} catch {
		/* ignore */
	}
}

function sanitizeEntry(raw: unknown): GuestEntry | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	return {
		code: typeof r.code === 'string' ? r.code : '',
		hintsUsed: typeof r.hintsUsed === 'number' ? Math.max(0, Math.floor(r.hintsUsed)) : 0,
		attempts: typeof r.attempts === 'number' ? Math.max(0, Math.floor(r.attempts)) : 0,
		completedAt: typeof r.completedAt === 'string' ? r.completedAt : null
	};
}

class GuestStore {
	/** The vibe a guest picked, or null if they never picked one */
	themeId = $state<ThemeId | null>(null);
	entries = $state<Record<string, GuestEntry>>({});
	xp = $state(0);
	/** Module ids opened with "Jump in here" on this device */
	unlocked = $state<string[]>([]);
	nudgeDismissed = $state(false);
	/** True once localStorage has been read (always false during SSR) */
	loaded = $state(false);

	/** Number of levels passed as a guest */
	completedCount = $derived(
		Object.values(this.entries).filter((e) => e.completedAt !== null).length
	);
	hasProgress = $derived(Object.keys(this.entries).length > 0);
	hasCompleted = $derived(this.completedCount > 0);

	load() {
		if (!browser || this.loaded) return;
		const raw = safeGet(GUEST_PROGRESS_KEY);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as Partial<GuestProgress>;
				const entries: Record<string, GuestEntry> = {};
				if (parsed.entries && typeof parsed.entries === 'object') {
					for (const [id, e] of Object.entries(parsed.entries)) {
						const clean = sanitizeEntry(e);
						if (clean) entries[id] = clean;
					}
				}
				this.entries = entries;
				this.xp = typeof parsed.xp === 'number' && parsed.xp > 0 ? Math.floor(parsed.xp) : 0;
				if (isThemeId(parsed.themeId)) this.themeId = parsed.themeId;
			} catch {
				// Corrupt data: start fresh rather than crash.
			}
		}
		const theme = safeGet(GUEST_THEME_KEY);
		if (isThemeId(theme)) this.themeId = theme;
		this.nudgeDismissed = safeGet(NUDGE_KEY) === '1';
		try {
			const ids: unknown = JSON.parse(safeGet(UNLOCKED_KEY) ?? '[]');
			if (Array.isArray(ids)) {
				this.unlocked = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
			}
		} catch {
			// Corrupt: nothing jumped into.
		}
		this.loaded = true;
	}

	private persist() {
		if (!browser) return;
		const data: GuestProgress = { themeId: this.themeId, entries: this.entries, xp: this.xp };
		safeSet(GUEST_PROGRESS_KEY, JSON.stringify(data));
		if (this.themeId) safeSet(GUEST_THEME_KEY, this.themeId);
	}

	private persistUnlocked() {
		if (!browser) return;
		if (this.unlocked.length) safeSet(UNLOCKED_KEY, JSON.stringify(this.unlocked));
		else safeRemove(UNLOCKED_KEY);
	}

	/** "Jump in here": open a module on the map without finishing the ones before it. */
	unlockModule(moduleId: string) {
		if (!browser) return;
		this.load();
		if (this.unlocked.includes(moduleId)) return;
		this.unlocked = [...this.unlocked, moduleId];
		this.persistUnlocked();
	}

	setTheme(id: ThemeId) {
		if (!browser) return;
		this.load();
		this.themeId = id;
		this.persist();
	}

	isDone(lessonId: string) {
		return !!this.entries[lessonId]?.completedAt;
	}

	saveDraft(lessonId: string, code: string) {
		if (!browser) return;
		this.load();
		const prev = this.entries[lessonId];
		this.entries[lessonId] = {
			code,
			hintsUsed: prev?.hintsUsed ?? 0,
			attempts: prev?.attempts ?? 0,
			completedAt: prev?.completedAt ?? null
		};
		this.persist();
	}

	/**
	 * Record a passed level. `xp` is what a first clear is worth (the caller computes it with
	 * `completionXp` from #lib/game/xp.ts); replays earn nothing.
	 */
	complete(
		lessonId: string,
		opts: { code: string; hintsUsed: number; attempts: number; xp: number }
	): { firstTime: boolean; xpGained: number; totalXp: number } {
		this.load();
		const prev = this.entries[lessonId];
		const firstTime = !prev?.completedAt;
		const xpGained = firstTime ? Math.max(0, Math.round(opts.xp)) : 0;
		this.entries[lessonId] = {
			code: opts.code,
			hintsUsed: firstTime ? opts.hintsUsed : (prev?.hintsUsed ?? opts.hintsUsed),
			attempts: (prev?.attempts ?? 0) + opts.attempts,
			completedAt: prev?.completedAt ?? new Date().toISOString()
		};
		this.xp += xpGained;
		this.persist();
		return { firstTime, xpGained, totalXp: this.xp };
	}

	/**
	 * "Mark as done": every lesson of a module becomes finished, with XP by the usual
	 * first-completion rules (no hints, module bonus once). Levels already done earn nothing.
	 */
	markModuleDone(lessons: readonly { id: string; xp: number }[]): {
		marked: number;
		xpGained: number;
	} {
		if (!browser) return { marked: 0, xpGained: 0 };
		this.load();
		const res = markLessonsDone($state.snapshot(this.entries), lessons);
		if (res.marked.length === 0) return { marked: 0, xpGained: 0 };
		this.entries = res.entries;
		this.xp += res.xpGained;
		this.persist();
		return { marked: res.marked.length, xpGained: res.xpGained };
	}

	/**
	 * Finished levels in the shape `POST /api/progress/import` and the signup form expect.
	 * (The server treats every imported entry as a completion, so drafts are left out.)
	 */
	importEntries(): ImportEntry[] {
		this.load();
		return Object.entries(this.entries)
			.filter(([, e]) => e.completedAt !== null)
			.map(([lessonId, e]) => ({
				lessonId,
				code: e.code,
				hintsUsed: e.hintsUsed,
				attempts: e.attempts,
				completedAt: e.completedAt
			}));
	}

	/**
	 * Hand everything to a freshly logged-in account: unfinished drafts go to
	 * `/api/progress/draft`, and (unless the signup form already sent them) finished levels to
	 * `/api/progress/import`. Clears local progress when that worked. Never throws.
	 */
	async transferToAccount(opts: { importCompleted: boolean }): Promise<void> {
		this.load();
		if (!this.hasProgress) return;
		const post = (url: '/api/progress/draft' | '/api/progress/import', body: unknown) =>
			fetch(resolve(url), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			}).then((r) => r.ok);
		try {
			const drafts = Object.entries(this.entries).filter(([, e]) => !e.completedAt && e.code);
			const results = await Promise.all(
				drafts.map(([lessonId, e]) => post('/api/progress/draft', { lessonId, code: e.code }))
			);
			let ok = results.every(Boolean);
			const completed = this.importEntries();
			if (opts.importCompleted && completed.length) {
				ok = (await post('/api/progress/import', { entries: completed })) && ok;
			}
			if (ok) this.clearProgress();
		} catch {
			// Keep it locally; nothing is lost.
		}
	}

	/** A plain copy of everything stored on this device (for a backup file). */
	snapshot(): GuestProgress {
		this.load();
		return {
			themeId: this.themeId,
			entries: $state.snapshot(this.entries),
			xp: this.xp,
			...(this.unlocked.length ? { unlocked: [...this.unlocked] } : {})
		};
	}

	/**
	 * Merge progress from a backup (already validated by `parseBackup`): finished levels stay
	 * finished, the higher XP total is kept. Returns how many levels became newly done.
	 */
	restore(incoming: DeviceProgress): number {
		if (!browser) return 0;
		const { progress, newlyDone } = mergeProgress(this.snapshot(), incoming);
		this.entries = progress.entries;
		this.xp = progress.xp;
		this.themeId = progress.themeId;
		this.unlocked = progress.unlocked ?? [];
		this.persist();
		this.persistUnlocked();
		return newlyDone;
	}

	dismissNudge() {
		this.nudgeDismissed = true;
		safeSet(NUDGE_KEY, '1');
	}

	/**
	 * Forget guest progress (after it has been saved to an account). Keeps the vibe and the parts
	 * jumped into, which belong to the device.
	 */
	clearProgress() {
		this.entries = {};
		this.xp = 0;
		safeRemove(GUEST_PROGRESS_KEY);
		safeRemove(NUDGE_KEY);
		this.nudgeDismissed = false;
	}
}

export const guest = new GuestStore();
