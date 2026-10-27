/**
 * Levels and XP. Pure: runs on the server and in the browser.
 */

export interface LevelInfo {
	/** 1-based level number. 0 XP is level 1. */
	level: number;
	/** Playful title for the level, e.g. "Tinkerer". */
	title: string;
	/** XP earned since reaching this level. */
	xpIntoLevel: number;
	/** Size of this level: XP needed to get from this level to the next one. */
	xpForNext: number;
	/** 0..1, how far through this level (`xpIntoLevel / xpForNext`). */
	progress: number;
	/** Total XP at which this level started. */
	levelStartXp: number;
	/** Total XP at which the next level starts (`levelStartXp + xpForNext`). */
	nextLevelXp: number;
}

export const LEVEL_TITLES: readonly string[] = [
	'Curious',
	'Tinkerer',
	'Pattern Spotter',
	'Loop Wrangler',
	'Decider',
	'Builder',
	'Debugger',
	'Maker',
	'Problem Solver',
	'Architect',
	'Code Whisperer',
	'Wizard'
];

/** Total XP needed to *reach* each level (index 0 = level 1). Grows roughly 20–40% per level. */
const BASE_THRESHOLDS = [0, 50, 120, 220, 350, 520, 740, 1000, 1300, 1650, 2050];

/** Cumulative XP needed to reach `level` (1-based). Extends the table geometrically. */
export function xpForLevel(level: number): number {
	if (level <= 1) return 0;
	const idx = level - 1;
	if (idx < BASE_THRESHOLDS.length) return BASE_THRESHOLDS[idx];
	let total = BASE_THRESHOLDS[BASE_THRESHOLDS.length - 1];
	let step = total - BASE_THRESHOLDS[BASE_THRESHOLDS.length - 2];
	for (let i = BASE_THRESHOLDS.length; i <= idx; i++) {
		step = Math.round((step * 1.2) / 10) * 10;
		total += step;
	}
	return total;
}

export function titleForLevel(level: number): string {
	const i = Math.min(Math.max(level, 1), LEVEL_TITLES.length) - 1;
	return LEVEL_TITLES[i];
}

export function levelForXp(xp: number): LevelInfo {
	const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
	let level = 1;
	// Cheap enough: the curve grows geometrically, so this is ~log(xp) iterations.
	while (xpForLevel(level + 1) <= total) level++;
	const levelStartXp = xpForLevel(level);
	const nextLevelXp = xpForLevel(level + 1);
	const xpForNext = nextLevelXp - levelStartXp;
	const xpIntoLevel = total - levelStartXp;
	return {
		level,
		title: titleForLevel(level),
		xpIntoLevel,
		xpForNext,
		progress: xpForNext > 0 ? xpIntoLevel / xpForNext : 0,
		levelStartXp,
		nextLevelXp
	};
}

/** Bonus for finishing every lesson in a module (awarded once, with the lesson that finishes it). */
export const MODULE_BONUS_XP = 10;

/**
 * XP for a *first* completion of a lesson. Replays give 0 (the caller decides that).
 * ×1.5 (rounded) without hints, +10 when this completion finishes the module.
 */
export function completionXp(
	lessonXp: number,
	opts: { hintsUsed: number; completesModule: boolean }
): number {
	const base = opts.hintsUsed === 0 ? Math.round(lessonXp * 1.5) : lessonXp;
	return base + (opts.completesModule ? MODULE_BONUS_XP : 0);
}
