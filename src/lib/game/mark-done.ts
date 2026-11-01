/**
 * "Mark as done" on the map, for progress kept on the device: every level of one module becomes
 * finished, with XP by the normal first-completion rules (#lib/game/xp.ts), as if each one had been
 * passed without hints. Levels that are already done keep their entry and earn nothing again; the
 * module bonus goes with the level that finishes the module. Pure: no DOM, no storage.
 * (Signed-in users go through `POST /api/progress/import`, which applies the same rules.)
 */
import type { ProgressEntry } from './backup.ts';
import { completionXp } from './xp.ts';

export interface MarkDoneResult {
	entries: Record<string, ProgressEntry>;
	/** Lesson ids that were newly marked done, in module order */
	marked: string[];
	xpGained: number;
}

export function markLessonsDone(
	entries: Readonly<Record<string, ProgressEntry>>,
	/** Every lesson of the module, in order */
	lessons: readonly { id: string; xp: number }[],
	now = new Date()
): MarkDoneResult {
	const out: Record<string, ProgressEntry> = { ...entries };
	const todo = lessons.filter((l) => !out[l.id]?.completedAt);
	const completedAt = now.toISOString();
	let xpGained = 0;
	todo.forEach((lesson, i) => {
		const prev = out[lesson.id];
		out[lesson.id] = {
			// A draft's code stays, so nothing typed on this device is thrown away.
			code: prev?.code ?? '',
			hintsUsed: 0,
			attempts: prev?.attempts ?? 0,
			completedAt
		};
		xpGained += completionXp(lesson.xp, { hintsUsed: 0, completesModule: i === todo.length - 1 });
	});
	return { entries: out, marked: todo.map((l) => l.id), xpGained };
}
