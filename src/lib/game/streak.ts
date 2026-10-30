/**
 * Streaks: consecutive UTC days with at least one completed lesson. Pure.
 * Days are `YYYY-MM-DD` strings in UTC.
 */

export interface StreakState {
	streak: number;
	lastActiveDay: string | null;
}

/** `YYYY-MM-DD` for the UTC day of `date`. */
export function utcDay(date: Date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

/** The UTC day before `day` (`YYYY-MM-DD`). */
export function previousDay(day: string): string {
	const d = new Date(`${day}T00:00:00.000Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return utcDay(d);
}

/**
 * New streak after a completion on `today`.
 * Same day: unchanged. Yesterday: +1. Anything else (gap, first ever, clock weirdness): 1.
 */
export function advanceStreak(state: StreakState, today: string): StreakState {
	if (state.lastActiveDay === today) {
		return { streak: Math.max(1, state.streak), lastActiveDay: today };
	}
	if (state.lastActiveDay !== null && state.lastActiveDay === previousDay(today)) {
		return { streak: state.streak + 1, lastActiveDay: today };
	}
	return { streak: 1, lastActiveDay: today };
}

/**
 * The streak to *show* on `today`: the stored streak if they were active today or yesterday
 * (still alive, they can keep it going today), otherwise 0.
 */
export function currentStreak(state: StreakState, today: string): number {
	if (state.lastActiveDay === null) return 0;
	if (state.lastActiveDay === today || state.lastActiveDay === previousDay(today)) {
		return state.streak;
	}
	return 0;
}

/**
 * Streaks from a list of completion times (progress kept on the device has no stored streak):
 * `current` as `currentStreak` would show it on `today`, `longest` the best run ever (for badges).
 */
export function streaksFromCompletions(
	completedAt: readonly string[],
	today: string
): { current: number; longest: number } {
	const days = [...new Set(completedAt.map((iso) => iso.slice(0, 10)))].sort();
	let state: StreakState = { streak: 0, lastActiveDay: null };
	let longest = 0;
	for (const day of days) {
		state = advanceStreak(state, day);
		longest = Math.max(longest, state.streak);
	}
	return { current: currentStreak(state, today), longest };
}
