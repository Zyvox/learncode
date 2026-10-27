/**
 * Curriculum contract. Content (`modules/*.ts`, `themes.ts`), the engine and the UI all
 * depend on these shapes. Change with care and update docs/ARCHITECTURE.md.
 */

export type ThemeId = 'games' | 'stories' | 'music' | 'space' | 'nature' | 'sports' | 'food';

export const THEME_IDS: readonly ThemeId[] = [
	'games',
	'stories',
	'music',
	'space',
	'nature',
	'sports',
	'food'
] as const;

/**
 * A "vibe" the learner picks. Swaps the character, the collectible, the goal, story framing
 * and accent colour. Puzzles themselves never change between themes.
 */
export interface Theme {
	id: ThemeId;
	/** Short label on the picker, e.g. "Games" */
	name: string;
	/** One line under the label, e.g. "Guide a hero through dungeons" */
	tagline: string;
	/** Emoji shown on the picker card */
	emoji: string;
	/** The character the learner controls on the grid */
	hero: { name: string; emoji: string };
	/** The thing the hero collects */
	item: { singular: string; plural: string; emoji: string };
	/** The target tile */
	goal: { name: string; emoji: string };
	/** Obstacles */
	wall: { name: string; emoji: string };
	/** Accent colour (hex) used for buttons, progress, the map region */
	accent: string;
	/**
	 * Extra placeholders available in themed text, e.g. { place: 'the dungeon', friend: 'the wizard' }.
	 * Every theme must define the same keys (see themes.ts).
	 */
	vocab: Record<string, string>;
}

/**
 * Text that may differ per theme. A plain string is used for every theme.
 * Placeholders are replaced by `renderText()`:
 *   {hero} {Hero} {item} {items} {Item} {Items} {goal} {Goal} {wall} {walls}
 *   {itemEmoji} {heroEmoji} {goalEmoji} and any key from theme.vocab, e.g. {place}.
 * Capitalised placeholder = capitalised first letter.
 * Markdown-lite is allowed: `code`, **bold**, line breaks. Nothing else.
 */
export type ThemedText = string | ({ default: string } & Partial<Record<ThemeId, string>>);

export type Direction = 'N' | 'E' | 'S' | 'W';

export interface GridWorldSpec {
	kind: 'grid';
	width: number; // 3..10
	height: number; // 3..8
	hero: { x: number; y: number; dir: Direction };
	walls?: [number, number][];
	items?: [number, number][];
	goal?: [number, number];
	/** Default 500. Runaway programs stop here with a friendly message. */
	maxSteps?: number;
}

export interface ConsoleWorldSpec {
	kind: 'console';
	/** Variables that already exist when the learner's code starts, e.g. { score: 7, name: 'Ada' } */
	variables?: Record<string, number | string | boolean>;
}

export interface CanvasWorldSpec {
	kind: 'canvas';
	width?: number; // default 300
	height?: number; // default 300
	background?: string; // default 'white'
}

export type WorldSpec = GridWorldSpec | ConsoleWorldSpec | CanvasWorldSpec;
export type WorldKind = WorldSpec['kind'];

/**
 * Checks are data so the UI, the engine and the content tests all agree on what "passed" means.
 * `message` is what the learner sees when that check fails (friendly, specific, themed).
 */
export type Check =
	| { type: 'reach-goal'; message?: ThemedText }
	| { type: 'collect-all'; message?: ThemedText }
	| { type: 'hero-at'; x: number; y: number; message?: ThemedText }
	| { type: 'output-equals'; lines: string[]; message?: ThemedText }
	| { type: 'output-includes'; text: string; message?: ThemedText }
	| { type: 'output-line-count'; min?: number; max?: number; message?: ThemedText }
	| { type: 'output-matches'; pattern: string; flags?: string; message?: ThemedText }
	| { type: 'said'; text: string; message?: ThemedText } // hero said this (grid world)
	/** Source-level checks nudge the learner toward the concept being taught. `pattern` is a regex source. */
	| { type: 'code-includes'; pattern: string; message: ThemedText }
	| { type: 'code-excludes'; pattern: string; message: ThemedText }
	| { type: 'max-lines'; count: number; message: ThemedText } // non-empty, non-comment lines
	/** At most N textual calls of a command, e.g. move() <= 2 forces a loop */
	| { type: 'max-calls'; command: string; count: number; message: ThemedText }
	| {
			type: 'draw-count';
			shape: 'circle' | 'rect' | 'line' | 'text' | 'any';
			min?: number;
			max?: number;
			message?: ThemedText;
	  }
	| { type: 'draw-colors'; min: number; message?: ThemedText } // distinct fill colours used
	| { type: 'draw-background'; message?: ThemedText };

export type LessonKind =
	/** Write code from a starter to satisfy checks */
	| 'code'
	/** Starter code is broken; fix it. Same checks as 'code'. */
	| 'fix'
	/** Read code, pick what it will do. No editor. */
	| 'predict';

export interface LessonBase {
	/** `${moduleId}/${slug}` */
	id: string;
	slug: string;
	title: ThemedText;
	kind: LessonKind;
	/** XP for a first-time clear. 10–30 typical, boss levels 50. */
	xp: number;
	/** The narrative framing. 1–3 short sentences. Themed. */
	story: ThemedText;
	/** What to do, concrete and short. Themed. */
	task: ThemedText;
	/**
	 * Shown when this lesson introduces a new idea. Plain language, an example, nothing else.
	 * `body` may contain fenced code: ```js ... ```.
	 */
	concept?: { title: ThemedText; body: ThemedText };
	/** Progressive hints. Last hint may be the full solution with a nudge to retry next time. */
	hints: ThemedText[];
	/** Commands introduced here (shown in the cheat sheet from now on), e.g. ['move()', 'turnLeft()'] */
	newCommands?: string[];
	/** Optional "boss level" flag: bigger celebration, shown differently on the map */
	boss?: boolean;
}

export interface CodeLesson extends LessonBase {
	kind: 'code' | 'fix';
	world: WorldSpec;
	starterCode: string;
	/** Must pass `checks` — enforced by curriculum tests. */
	solution: string;
	checks: Check[];
}

export interface PredictLesson extends LessonBase {
	kind: 'predict';
	/** Shown read-only */
	code: string;
	world?: WorldSpec;
	question: ThemedText;
	choices: ThemedText[];
	/** Index into choices */
	answer: number;
	/** Shown after answering, right or wrong */
	explanation: ThemedText;
}

export type Lesson = CodeLesson | PredictLesson;

export interface Module {
	id: string; // kebab-case, e.g. 'first-steps'
	title: ThemedText;
	/** One sentence: the idea this module teaches, in the learner's words */
	blurb: ThemedText;
	emoji: string;
	/** Order on the map */
	order: number;
	lessons: Lesson[];
	/** If set, the module is shown on the map but not playable yet */
	comingSoon?: boolean;
}

/** Result of rendering ThemedText for a specific theme: plain string with placeholders filled. */
export type RenderedText = string;
