/**
 * Curriculum registry. Everything other parts of the app need from the curriculum is
 * exported from here: `import { getLesson, renderText } from '#lib/curriculum/index.ts'`.
 */
import type { Lesson, Module } from '#lib/curriculum/types.ts';
import { firstSteps } from './modules/first-steps.ts';
import { doingItAgain } from './modules/doing-it-again.ts';
import { makingChoices } from './modules/making-choices.ts';
import { yourOwnCommands } from './modules/your-own-commands.ts';
import { rememberingThings } from './modules/remembering-things.ts';
import { drawingWithCode } from './modules/drawing-with-code.ts';
import { tinyGame } from './modules/tiny-game.ts';
import { pythonBasics } from './modules/python-basics.ts';
import { webPages } from './modules/web-pages.ts';

export type * from '#lib/curriculum/types.ts';
export { THEME_IDS } from '#lib/curriculum/types.ts';
export { THEMES, getTheme, DEFAULT_THEME_ID, VOCAB_KEYS } from './themes.ts';
export { renderText, pickThemed, placeholderValues } from './render.ts';

/** All modules, sorted by `order` (map order). Includes `comingSoon` modules with no lessons. */
export const MODULES: Module[] = [
	firstSteps,
	doingItAgain,
	makingChoices,
	yourOwnCommands,
	rememberingThings,
	drawingWithCode,
	tinyGame,
	pythonBasics,
	webPages
].sort((a, b) => a.order - b.order);

export interface LessonContext {
	module: Module;
	lesson: Lesson;
	/** 0-based position of the lesson inside its module */
	index: number;
	/** Previous lesson in the whole course (may be in the previous module) */
	prev: Lesson | undefined;
	/** Next lesson in the whole course (may be in the next module) */
	next: Lesson | undefined;
}

interface Entry {
	module: Module;
	lesson: Lesson;
	index: number;
}

/** Every playable lesson in course order. */
const ALL: Entry[] = MODULES.flatMap((module) =>
	module.lessons.map((lesson, index) => ({ module, lesson, index }))
);
const POSITION = new Map<string, number>(ALL.map((e, i) => [e.lesson.id, i]));
const MODULE_BY_ID = new Map<string, Module>(MODULES.map((m) => [m.id, m]));

export function getModules(): Module[] {
	return MODULES;
}

export function getModule(id: string): Module | undefined {
	return MODULE_BY_ID.get(id);
}

export function getLesson(id: string): Lesson | undefined {
	const pos = POSITION.get(id);
	return pos === undefined ? undefined : ALL[pos].lesson;
}

export function getLessonContext(id: string): LessonContext | undefined {
	const pos = POSITION.get(id);
	if (pos === undefined) return undefined;
	const { module, lesson, index } = ALL[pos];
	return {
		module,
		lesson,
		index,
		prev: ALL[pos - 1]?.lesson,
		next: ALL[pos + 1]?.lesson
	};
}

/** All playable lessons, in course order. */
export function getAllLessons(): Lesson[] {
	return ALL.map((e) => e.lesson);
}

/** The lesson after `id` in course order (crossing module boundaries), if any. */
export function getNextLessonAfter(id: string): Lesson | undefined {
	return getLessonContext(id)?.next;
}

/** The module a lesson belongs to. */
export function getModuleOfLesson(id: string): Module | undefined {
	const pos = POSITION.get(id);
	return pos === undefined ? undefined : ALL[pos].module;
}

export function totalLessonCount(): number {
	return ALL.length;
}
