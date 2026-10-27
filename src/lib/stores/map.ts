/**
 * Pure helpers for the learning map: which lessons are done, which one is "up next", and what is
 * still locked. Rules:
 *  - Lessons unlock one after another inside a module.
 *  - A module unlocks when the previous playable module's boss level (or its last level) is done.
 *  - Anything the learner already started or finished stays open, whatever the rules say.
 *  - `comingSoon` modules are shown but never playable.
 *  - Each track has its own map: the first module of every track is open (`buildTrackMap`).
 */
import type { Lesson, Module, TrackId } from '#lib/curriculum/types.ts';

export type LessonStatus = 'done' | 'started';
export type StatusMap = Record<string, LessonStatus>;
export type NodeState = 'done' | 'current' | 'available' | 'locked';

export interface MapLesson {
	lesson: Lesson;
	state: NodeState;
	href: string;
}

export interface MapModule {
	module: Module;
	unlocked: boolean;
	comingSoon: boolean;
	done: number;
	total: number;
	lessons: MapLesson[];
}

export function lessonHref(lesson: Lesson): string {
	return `/learn/${lesson.id}`;
}

function bossOf(module: Module): Lesson | undefined {
	return module.lessons.find((l) => l.boss) ?? module.lessons[module.lessons.length - 1];
}

export function buildMap(
	modules: readonly Module[],
	status: StatusMap
): { modules: MapModule[]; current: Lesson | null } {
	const sorted = [...modules].sort((a, b) => a.order - b.order);
	let prevCleared = true;
	let current: Lesson | null = null;
	const out: MapModule[] = [];

	for (const module of sorted) {
		const comingSoon = !!module.comingSoon;
		const touched = module.lessons.some((l) => status[l.id]);
		const unlocked = !comingSoon && (prevCleared || touched);
		const lessons: MapLesson[] = [];
		let prevDone = true;
		for (const lesson of module.lessons) {
			const s = status[lesson.id];
			let state: NodeState;
			if (s === 'done') state = 'done';
			else if (unlocked && (prevDone || s === 'started')) state = 'available';
			else state = 'locked';
			if (state === 'available' && !current) {
				current = lesson;
				state = 'current';
			}
			lessons.push({ lesson, state, href: lessonHref(lesson) });
			prevDone = s === 'done';
		}
		const done = lessons.filter((l) => l.state === 'done').length;
		out.push({ module, unlocked, comingSoon, done, total: module.lessons.length, lessons });
		if (!comingSoon) {
			const boss = bossOf(module);
			prevCleared = !!boss && status[boss.id] === 'done';
		}
	}
	return { modules: out, current };
}

export interface TrackMap {
	track: TrackId;
	modules: MapModule[];
	/** The first not-done lesson that is open in this track */
	current: Lesson | null;
	/** Lessons done / playable lessons in this track */
	done: number;
	total: number;
}

/** The map for one track. Modules without `track` belong to 'code'. */
export function buildTrackMap(
	modules: readonly Module[],
	status: StatusMap,
	track: TrackId
): TrackMap {
	const own = modules.filter((m) => (m.track ?? 'code') === track);
	const map = buildMap(own, status);
	let done = 0;
	let total = 0;
	for (const m of map.modules) {
		if (m.comingSoon) continue;
		total += m.total;
		done += m.lessons.filter((l) => status[l.lesson.id] === 'done').length;
	}
	return { track, modules: map.modules, current: map.current, done, total };
}

/** Commands introduced by every lesson up to and including `lessonId`, in curriculum order. */
export function commandsUnlockedThrough(allLessons: Lesson[], lessonId: string): string[] {
	const seen = new Set<string>();
	for (const l of allLessons) {
		for (const c of l.newCommands ?? []) seen.add(c);
		if (l.id === lessonId) break;
	}
	return [...seen];
}

/**
 * Which JavaScript basics (SYNTAX ids from #lib/engine/commands.ts) the learner has met by now.
 * Lessons don't list syntax in `newCommands`, so we look at the code they have been shown:
 * concept examples, starter code and predict snippets of every lesson up to this one.
 */
const SYNTAX_PATTERNS: Record<string, RegExp> = {
	comment: /\/\//,
	'let-variable': /\blet\s+\w/,
	'text-join': /["'`]\s*\+|\+\s*["'`]/,
	compare: /===|!==|[^=!<>]\s*(<=|>=|<|>)\s*[\w(]/,
	'and-or-not': /&&|\|\||!\w/,
	if: /\bif\s*\(/,
	'if-else': /\belse\b/,
	'while-loop': /\bwhile\s*\(/,
	'for-loop': /\bfor\s*\(/,
	function: /\bfunction\s+\w+\s*\(/,
	'function-params': /\bfunction\s+\w+\s*\(\s*\w/,
	return: /\breturn\b/,
	array: /=\s*\[|\.length\b|\.push\(/
};

function shownCode(lesson: Lesson): string {
	const parts: string[] = [];
	const body = lesson.concept?.body;
	const texts = body === undefined ? [] : typeof body === 'string' ? [body] : Object.values(body);
	for (const t of texts) {
		for (const m of (t ?? '').matchAll(/```[a-z]*\n([\s\S]*?)```/g)) parts.push(m[1]);
	}
	if (lesson.kind === 'predict') parts.push(lesson.code);
	else parts.push(lesson.starterCode);
	return parts.join('\n');
}

export function syntaxUnlockedThrough(allLessons: Lesson[], lessonId: string): Set<string> {
	const seen = new Set<string>();
	for (const l of allLessons) {
		const src = shownCode(l);
		for (const [id, re] of Object.entries(SYNTAX_PATTERNS)) if (re.test(src)) seen.add(id);
		if (l.id === lessonId) break;
	}
	return seen;
}
