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

/** A request the simulated reader app ("the phone") sends to the learner's server. */
export interface SimRequest {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE';
	/** Path including any query string, e.g. '/episodes/12?lang=en' */
	path: string;
	/** JSON body for POST/PUT */
	body?: unknown;
	headers?: Record<string, string>;
	/** Short label shown on the packet in the animation, e.g. "reader opens episode 12" */
	label?: string;
}

/**
 * The "behind the app" world: a phone (client), a server with endpoints, and a real SQLite
 * database (sql.js). The learner's code runs in ONE role per lesson. See docs/WEB_TRACK.md
 * for the exact learner-facing API.
 */
export interface WebWorldSpec {
	kind: 'web';
	/**
	 * client: learner code runs on the phone (get/post/show). Routes come from `serverCode`.
	 * server: learner code registers routes with `app`; then `requests` are fired at it.
	 * sql:    the editor holds SQL; it runs against the database; the last result set is shown.
	 */
	role: 'client' | 'server' | 'sql';
	/** SQL run on a fresh in-memory database before anything else (CREATE TABLE + seed rows). */
	schema?: string;
	/**
	 * Server code that exists before the learner's code (same `app`/`db` API). In client and sql
	 * lessons this IS the server; in server lessons it provides routes the learner adds to.
	 */
	serverCode?: string;
	/** Requests the phone sends after the learner's server code has registered its routes. */
	requests?: SimRequest[];
	/** Values exposed as `env.NAME` to server code (configuration lessons). */
	env?: Record<string, string>;
	/** Which boxes to draw. Default: all three. */
	show?: ('client' | 'server' | 'database')[];
	/** Simulated conditions for predict/story levels */
	serverDown?: boolean;
	/** Security lessons: the server's database connection may only read (db.run on writes fails) */
	dbReadOnly?: boolean;
	/**
	 * Security lessons: the phone renders text as HTML, like a careless app would. Text that
	 * contains a <script> tag produces a 'scripted' screen item (the simulated XSS).
	 */
	renderHtml?: boolean;
	/** Security lessons: requests arrive over plain http (headers can be read on the wire) */
	plainHttp?: boolean;
}

/* ------------------------------------------------------------------------------------------ */
/* net world: a small network (or a cloud region) drawn as nodes and wires. See docs/INFRA.md  */
/* ------------------------------------------------------------------------------------------ */

export type NetNodeKind =
	| 'laptop'
	| 'phone'
	| 'router'
	| 'dns'
	| 'server'
	| 'firewall'
	| 'lb'
	| 'db'
	| 'cloud'
	| 'container';

export interface NetNode {
	id: string;
	kind: NetNodeKind;
	/** Shown under the icon; defaults to id */
	label?: string;
	ip?: string;
	/** Services listening: port -> name, e.g. { 443: 'inkwell reader', 22: 'ssh' } */
	listens?: Record<number, string>;
	/** Inbound ports this node (or firewall) lets through. undefined = everything. */
	allow?: number[];
	/** Ports explicitly blocked on a node that otherwise allows everything (set by `block()`) */
	block?: number[];
	/** The machine is switched off / crashed */
	down?: boolean;
	/** cloud: how many requests one container handles per traffic batch before it starts failing */
	capacity?: number;
	/** cloud: the image a container runs */
	image?: string;
	/** cloud: the service name a container belongs to */
	service?: string;
	/** cloud: fails health checks */
	unhealthy?: boolean;
}

export interface NetLink {
	from: string;
	to: string;
	latencyMs?: number;
}

export interface NetWorldSpec {
	kind: 'net';
	/** 'network': lookup/ping/connect/trace/allow… ; 'cloud': deploy/scale/route/traffic… */
	flavour: 'network' | 'cloud';
	nodes: NetNode[];
	links: NetLink[];
	/** DNS records the dns node knows: name -> ip */
	dns?: Record<string, string>;
	/** The node the learner's code runs on (network flavour), or the client that sends traffic (cloud) */
	at: string;
	/** cloud: images that can be deployed. capacity = requests per batch one container handles */
	images?: Record<string, { port: number; capacity?: number; unhealthy?: boolean }>;
	/** cloud: traffic fired after the learner's code: batches of requests to a path via the lb */
	traffic?: { count: number; path: string; label?: string }[];
}

/* ------------------------------------------------------------------------------------------ */
/* git world: a working folder, a staging area and a history, driven by a tiny shell           */
/* ------------------------------------------------------------------------------------------ */

export interface GitWorldSpec {
	kind: 'git';
	/** Files in the working folder before anything runs */
	files?: Record<string, string>;
	/** Shell lines run before the learner's (e.g. 'git init', 'git add .', 'git commit -m "start"') */
	setup?: string;
	/** Name used as the commit author */
	user?: string;
}

export type WorldSpec =
	GridWorldSpec | ConsoleWorldSpec | CanvasWorldSpec | WebWorldSpec | NetWorldSpec | GitWorldSpec;
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
	| { type: 'draw-background'; message?: ThemedText }
	/* ---- web world ---- */
	/** `request` is the index into spec.requests (server role) or into the calls the client made (client role) */
	| { type: 'response-status'; request: number; status: number; message?: ThemedText }
	/** Deep-equal (mode 'equal', default) or every key in `expected` must match (mode 'subset'; arrays compared element-wise as subsets) */
	| {
			type: 'response-json';
			request: number;
			expected: unknown;
			mode?: 'equal' | 'subset';
			message?: ThemedText;
	  }
	| { type: 'response-includes'; request: number; text: string; message?: ThemedText }
	/** Every request got a 2xx */
	| { type: 'all-responses-ok'; message?: ThemedText }
	/** Run `sql` after the learner's code and compare rows (array of objects; key order ignored; row order matters unless `anyOrder`) */
	| {
			type: 'db-rows';
			sql: string;
			expected: Record<string, unknown>[];
			anyOrder?: boolean;
			message?: ThemedText;
	  }
	/** sql role: the last result set equals these rows */
	| {
			type: 'sql-result';
			expected: Record<string, unknown>[];
			anyOrder?: boolean;
			message?: ThemedText;
	  }
	/** sql role: the last result set has exactly these columns (order ignored) */
	| { type: 'sql-columns'; columns: string[]; message?: ThemedText }
	/** sql role: at least/at most N rows in the last result set */
	| { type: 'sql-row-count'; min?: number; max?: number; message?: ThemedText }
	/** Something shown on the phone (via show() or the auto-rendered response) contains this text */
	| { type: 'screen-includes'; text: string; message?: ThemedText }
	/** A log line (server or client) contains this text */
	| { type: 'log-includes'; text: string; message?: ThemedText }
	/** Every db query that ran used bound parameters (no user-derived values glued into SQL). Approximated: no query text contains a value from req.params/query/body. */
	| { type: 'queries-parameterized'; message?: ThemedText }
	/** At most N queries ran in total (nudges away from N+1) */
	| { type: 'max-queries'; count: number; message?: ThemedText }
	/* ---- web world: security ---- */
	/** No screen item was rendered with a script in it (renderHtml lessons) */
	| { type: 'screen-no-script'; message?: ThemedText }
	/** No log line contains this text (secrets in logs) */
	| { type: 'log-excludes'; text: string; message?: ThemedText }
	/** A response body contains no raw <script (the server escaped/stripped it) */
	| { type: 'response-no-script'; request: number; message?: ThemedText }
	/* ---- net world ---- */
	/** At the end, `from` can reach `to` on `port` (route exists, not blocked, service listening) */
	| { type: 'net-reachable'; from: string; to: string; port: number; message?: ThemedText }
	| { type: 'net-unreachable'; from: string; to: string; port: number; message?: ThemedText }
	/** The dns node resolves `name` to `ip` */
	| { type: 'net-resolves'; name: string; ip: string; message?: ThemedText }
	/** A node ended in this state */
	| { type: 'net-node'; id: string; up?: boolean; message?: ThemedText }
	/** A firewall/node allows (or does not allow) a port */
	| { type: 'net-allows'; id: string; port: number; allowed: boolean; message?: ThemedText }
	/** cloud: a service has at least N (healthy) running containers */
	| { type: 'cloud-replicas'; service: string; min: number; max?: number; message?: ThemedText }
	/** cloud: the load balancer routes `path` to `service` */
	| { type: 'cloud-route'; path: string; service: string; message?: ThemedText }
	/** cloud: share of traffic requests that got a 200, e.g. min 0.95 */
	| { type: 'cloud-success-rate'; min: number; message?: ThemedText }
	/** One of the learner's calls returned this (stringified) result, e.g. lookup -> '10.0.0.5' */
	| { type: 'net-call-result'; call: string; result: string; message?: ThemedText }
	/* ---- git world ---- */
	| { type: 'git-commits'; min?: number; max?: number; message?: ThemedText }
	| { type: 'git-branch'; name: string; exists?: boolean; message?: ThemedText }
	| { type: 'git-head'; branch: string; message?: ThemedText }
	/** A file in the working folder (committed: in HEAD's tree) contains/equals text */
	| {
			type: 'git-file';
			path: string;
			includes?: string;
			equals?: string;
			committed?: boolean;
			exists?: boolean;
			message?: ThemedText;
	  }
	/** Nothing unstaged, nothing untracked */
	| { type: 'git-clean'; message?: ThemedText }
	/** `branch` has been merged into `into` (its tip is an ancestor of `into`) */
	| { type: 'git-merged'; branch: string; into: string; message?: ThemedText }
	/** Some commit message contains this text */
	| { type: 'git-message-includes'; text: string; message?: ThemedText }
	/** Output of some shell command contained this text */
	| { type: 'shell-output-includes'; text: string; message?: ThemedText };

export type LessonKind =
	/** Write code from a starter to satisfy checks */
	| 'code'
	/** Starter code is broken; fix it. Same checks as 'code'. */
	| 'fix'
	/** Read code, pick what it will do. No editor. */
	| 'predict';

/** A speaker in webtoon-style concept panels. Defined in curriculum/cast.ts. */
export type CastId = 'you' | 'mina' | 'theo' | 'bit' | 'narrator';

/**
 * One panel of a vertical, webtoon-style explainer strip. The UI renders panels top to bottom:
 * avatar + speech bubble, optional little scene icon. Keep each panel to one or two sentences.
 */
export interface Panel {
	who?: CastId;
	text: ThemedText;
	/** A small illustration hint for the panel */
	scene?: 'phone' | 'server' | 'database' | 'wire' | 'cloud' | 'lock' | 'none';
	/** Optional code shown under the bubble (monospace, short) */
	code?: string;
}

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
	concept?: {
		title: ThemedText;
		/** Prose explainer (markdown-lite). Optional when `panels` is given. */
		body?: ThemedText;
		/** Webtoon-style strip. When present the UI shows it instead of (or above) `body`. */
		panels?: Panel[];
	};
	/**
	 * Language in the editor. Default 'js'. 'sql' lessons use the web world in the sql role;
	 * 'shell' lessons use the git world (one command per line).
	 */
	language?: 'js' | 'sql' | 'shell';
	/**
	 * Shown after the level is cleared (bosses especially): the story beat that happens
	 * because of what the learner just did. Panels render as a strip, text as prose.
	 */
	outro?: { text?: ThemedText; panels?: Panel[] };
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

export type TrackId = 'code' | 'web';

export interface Track {
	id: TrackId;
	title: ThemedText;
	blurb: ThemedText;
	emoji: string;
	/** Who it's for, one line, shown on the landing page */
	audience: ThemedText;
}

export interface Module {
	id: string; // kebab-case, e.g. 'first-steps'
	/** Which track the module belongs to. Default 'code'. */
	track?: TrackId;
	/** Soft prerequisite shown as a friendly note (never a lock), e.g. "Needs the basics from Learn to code, parts 1–5." */
	prereq?: ThemedText;
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
