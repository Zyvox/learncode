/**
 * Curriculum registry. Everything other parts of the app need from the curriculum is
 * exported from here: `import { getLesson, renderText } from '#lib/curriculum/index.ts'`.
 */
import type { Lesson, Module, TrackId } from '#lib/curriculum/types.ts';
import { TRACKS, TRACK_ORDER } from './tracks.ts';

export type * from '#lib/curriculum/types.ts';
export { THEME_IDS } from '#lib/curriculum/types.ts';
export { THEMES, getTheme, DEFAULT_THEME_ID, VOCAB_KEYS } from './themes.ts';
export { renderText, pickThemed, placeholderValues } from './render.ts';
export { TRACKS, TRACK_ORDER, getTrack } from './tracks.ts';
export { CAST } from './cast.ts';

/**
 * Every file in ./modules is a module. Each file exports one `Module` object (any export name).
 * Drop a file in, and it appears on the map; nothing else to register.
 */
const moduleFiles = import.meta.glob<Record<string, unknown>>('./modules/*.ts', { eager: true });

function isModule(value: unknown): value is Module {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as Module).id === 'string' &&
		Array.isArray((value as Module).lessons)
	);
}

export function trackOf(module: Module): TrackId {
	return module.track ?? 'code';
}

/**
 * All modules in map order: track by track (code, then web), then by `order` within the track.
 * Includes `comingSoon` modules with no lessons.
 */
export const MODULES: Module[] = Object.values(moduleFiles)
	.flatMap((file) => Object.values(file).filter(isModule))
	.sort((a, b) => {
		const t = TRACK_ORDER.indexOf(trackOf(a)) - TRACK_ORDER.indexOf(trackOf(b));
		return t !== 0 ? t : a.order - b.order;
	});

export interface LessonContext {
	module: Module;
	lesson: Lesson;
	/** 0-based position of the lesson inside its module */
	index: number;
	/** Previous lesson in the same track (may be in the previous module); never crosses tracks */
	prev: Lesson | undefined;
	/** Next lesson in the same track (may be in the next module); never crosses tracks */
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
	const track = trackOf(module);
	const prevEntry = ALL[pos - 1];
	const nextEntry = ALL[pos + 1];
	return {
		module,
		lesson,
		index,
		prev: prevEntry && trackOf(prevEntry.module) === track ? prevEntry.lesson : undefined,
		next: nextEntry && trackOf(nextEntry.module) === track ? nextEntry.lesson : undefined
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

/** Modules of one track, in map order. */
export function getModulesForTrack(track: TrackId): Module[] {
	return MODULES.filter((m) => trackOf(m) === track);
}

/** Playable lessons of one track, in course order. */
export function getLessonsForTrack(track: TrackId): Lesson[] {
	return ALL.filter((e) => trackOf(e.module) === track).map((e) => e.lesson);
}

/** The track a lesson belongs to. */
export function getTrackOfLesson(id: string): TrackId | undefined {
	const module = getModuleOfLesson(id);
	return module ? trackOf(module) : undefined;
}

/** Re-exported so callers can get the track list without importing tracks.ts. */
export function getTracks() {
	return TRACKS;
}
