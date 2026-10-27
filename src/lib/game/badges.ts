/**
 * Badges: a short list of things worth celebrating. Pure — the caller passes in everything.
 *
 * Static badges live in `BADGES`. Finishing a module earns `module-${moduleId}`; use
 * `moduleBadge(module)` / `allBadges(modules)` / `describeBadge(id, modules)` to get its display info.
 */
import type { LessonKind, Module, ThemedText } from '#lib/curriculum/types.ts';

export interface Badge {
	id: string;
	name: string;
	description: string;
	emoji: string;
}

export const BADGES: readonly Badge[] = [
	{
		id: 'first-level',
		name: 'First Steps',
		description: 'Finished your very first level.',
		emoji: '👣'
	},
	{
		id: 'first-loop',
		name: 'Round and Round',
		description: 'Finished a level with loops.',
		emoji: '🔁'
	},
	{
		id: 'first-choice',
		name: 'Fork in the Road',
		description: 'Finished a level where your code makes a choice.',
		emoji: '🔀'
	},
	{
		id: 'first-function',
		name: 'Name It',
		description: 'Finished a level where you made your own command.',
		emoji: '🧩'
	},
	{
		id: 'bug-squasher',
		name: 'Bug Squasher',
		description: 'Fixed three pieces of broken code.',
		emoji: '🐞'
	},
	{
		id: 'no-hints-5',
		name: 'Solo Run',
		description: 'Finished five levels without opening a hint.',
		emoji: '🧠'
	},
	{
		id: 'streak-3',
		name: 'Warming Up',
		description: 'Coded three days in a row.',
		emoji: '🔥'
	},
	{
		id: 'streak-7',
		name: 'A Whole Week',
		description: 'Coded seven days in a row.',
		emoji: '📅'
	},
	{
		id: 'night-owl',
		name: 'Night Owl',
		description: 'Finished a level somewhere between midnight and 4am.',
		emoji: '🦉'
	},
	{
		id: 'early-bird',
		name: 'Early Bird',
		description: 'Finished a level between 5 and 7 in the morning.',
		emoji: '🐦'
	},
	{
		id: 'halfway',
		name: 'Halfway There',
		description: 'Finished half of all the levels.',
		emoji: '⛰️'
	},
	{
		id: 'all-done',
		name: 'The Whole Map',
		description: 'Finished every single level.',
		emoji: '🏆'
	}
];

/** Badges earned by having finished at least one lesson in a given module. */
const FIRST_IN_MODULE: Record<string, string> = {
	'first-loop': 'doing-it-again',
	'first-choice': 'making-choices',
	'first-function': 'your-own-commands'
};

export const MODULE_BADGE_PREFIX = 'module-';

/** Just enough of a module for badge logic (a real `Module` fits). */
export interface BadgeModule {
	id: string;
	title: ThemedText;
	emoji: string;
	comingSoon?: boolean;
	lessons: { id: string; kind: LessonKind }[];
}

export interface BadgeContext {
	/** Progress by lesson id, after the completion being evaluated has been applied. */
	progress: Record<string, { status: 'started' | 'done'; hintsUsed: number }>;
	/** The whole curriculum (`getModules()`). */
	modules: readonly BadgeModule[];
	/** Streak after this completion. */
	streak: number;
	/** The lesson just completed, or null when evaluating in bulk (e.g. importing guest progress). */
	lesson: { id: string; kind: LessonKind; moduleId: string } | null;
	/** UTC hour (0–23) of the completion, or null when unknown. Time-of-day badges need it. */
	hour: number | null;
	/** Badge ids the user already has. */
	earned: Iterable<string>;
}

function plain(text: ThemedText): string {
	return typeof text === 'string' ? text : text.default;
}

export function moduleBadgeId(moduleId: string): string {
	return `${MODULE_BADGE_PREFIX}${moduleId}`;
}

export function moduleBadge(module: Pick<BadgeModule, 'id' | 'title' | 'emoji'>): Badge {
	const title = plain(module.title);
	return {
		id: moduleBadgeId(module.id),
		name: title,
		description: `Finished every level in “${title}”.`,
		emoji: module.emoji
	};
}

/** Every badge that can be earned: the static ones plus one per playable module. */
export function allBadges(modules: readonly BadgeModule[]): Badge[] {
	return [...BADGES, ...modules.filter((m) => !m.comingSoon).map(moduleBadge)];
}

/** Display info for a badge id (static or `module-*`). Undefined for unknown ids. */
export function describeBadge(id: string, modules: readonly BadgeModule[]): Badge | undefined {
	const known = BADGES.find((b) => b.id === id);
	if (known) return known;
	if (id.startsWith(MODULE_BADGE_PREFIX)) {
		const module = modules.find((m) => moduleBadgeId(m.id) === id);
		if (module) return moduleBadge(module);
	}
	return undefined;
}

/** Ids of badges newly earned in this context (never includes ones already in `ctx.earned`). */
export function evaluateBadges(ctx: BadgeContext): string[] {
	const earned = new Set(ctx.earned);
	const fresh: string[] = [];
	const award = (id: string, condition: boolean) => {
		if (condition && !earned.has(id)) {
			earned.add(id);
			fresh.push(id);
		}
	};

	const isDone = (lessonId: string) => ctx.progress[lessonId]?.status === 'done';
	const playable = ctx.modules.filter((m) => !m.comingSoon);
	const allLessons = playable.flatMap((m) => m.lessons);
	const done = allLessons.filter((l) => isDone(l.id));
	const doneInModule = (moduleId: string) =>
		ctx.modules.find((m) => m.id === moduleId)?.lessons.some((l) => isDone(l.id)) ?? false;

	award('first-level', done.length >= 1);
	for (const [badgeId, moduleId] of Object.entries(FIRST_IN_MODULE)) {
		award(badgeId, doneInModule(moduleId));
	}
	award('bug-squasher', done.filter((l) => l.kind === 'fix').length >= 3);
	award('no-hints-5', done.filter((l) => ctx.progress[l.id]?.hintsUsed === 0).length >= 5);
	award('streak-3', ctx.streak >= 3);
	award('streak-7', ctx.streak >= 7);

	if (ctx.lesson && ctx.hour !== null) {
		award('night-owl', ctx.hour >= 0 && ctx.hour < 4);
		award('early-bird', ctx.hour >= 5 && ctx.hour < 7);
	}

	if (allLessons.length > 0) {
		award('halfway', done.length >= Math.ceil(allLessons.length / 2));
		award('all-done', done.length === allLessons.length);
	}

	for (const module of playable) {
		award(
			moduleBadgeId(module.id),
			module.lessons.length > 0 && module.lessons.every((l) => isDone(l.id))
		);
	}

	return fresh;
}
