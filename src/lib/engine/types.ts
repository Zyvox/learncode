/**
 * Engine contract: what running learner code produces, and what the worlds look like.
 * The UI animates `trace`; the curriculum tests evaluate `checks` against the result.
 */
import type { Direction, ThemedText, WorldSpec } from '#lib/curriculum/types.ts';

export interface GridState {
	width: number;
	height: number;
	hero: { x: number; y: number; dir: Direction };
	walls: [number, number][];
	/** Items still on the floor */
	items: [number, number][];
	goal: [number, number] | null;
	/** Items picked up so far */
	collected: number;
}

export type DrawOp =
	| { op: 'background'; color: string }
	| { op: 'color'; color: string }
	| { op: 'circle'; x: number; y: number; r: number; color: string }
	| { op: 'rect'; x: number; y: number; w: number; h: number; color: string }
	| { op: 'line'; x1: number; y1: number; x2: number; y2: number; color: string }
	| { op: 'text'; x: number; y: number; text: string; color: string };

/**
 * Everything that happened, in order. The UI replays these with a small delay between
 * them so the learner can follow along.
 */
export type TraceEvent =
	| { t: 'move'; from: [number, number]; to: [number, number]; dir: Direction }
	/** Walked into a wall or the edge. Ends the run. */
	| { t: 'bump'; at: [number, number]; dir: Direction }
	| { t: 'turn'; dir: 'left' | 'right'; facing: Direction }
	/** ok=false means there was nothing to pick up (not fatal) */
	| { t: 'pickup'; at: [number, number]; ok: boolean }
	| { t: 'say'; text: string }
	| { t: 'print'; text: string }
	| { t: 'draw'; op: DrawOp }
	/** Step cap or timeout hit */
	| { t: 'stopped'; reason: 'max-steps' | 'timeout' }
	/* ---- web world ---- */
	/** The phone sent a request. `id` is the request index. */
	| { t: 'request'; id: number; method: string; path: string; body?: unknown; label?: string }
	/** The server picked a route (pattern like '/episodes/:id') or found none (null → 404) */
	| { t: 'route'; id: number; pattern: string | null }
	/** A log line from log() on the server or the client */
	| { t: 'log'; id?: number; where: 'server' | 'client'; text: string }
	/** A database query ran (from a handler, or from the SQL editor). `rows` for SELECTs, `changes` for writes. */
	| {
			t: 'query';
			id?: number;
			sql: string;
			params: unknown[];
			rows?: number;
			changes?: number;
			error?: string;
	  }
	/** The server answered request `id` */
	| { t: 'response'; id: number; status: number; body: unknown }
	/** The phone screen shows something (show() on the client, or the auto-rendered response) */
	| { t: 'screen'; item: ScreenItem }
	/* ---- net world ---- */
	/** Something travelled from one node to another. `hops` is the path taken; ok=false means it was dropped at `at`. */
	| {
			t: 'packet';
			from: string;
			to: string;
			label: string;
			ok: boolean;
			hops: string[];
			at?: string;
			status?: number;
	  }
	/** A node changed: came up, went down, got busy, was added (cloud deploy) or removed */
	| {
			t: 'node';
			id: string;
			state: 'up' | 'down' | 'busy' | 'added' | 'removed' | 'unhealthy' | 'changed';
			label?: string;
			kind?: string;
			service?: string;
	  }
	/** The learner's call and what it returned, e.g. "connect('10.0.0.5', 443)" → "open" */
	| { t: 'call'; call: string; result: string }
	/* ---- git world ---- */
	/** One shell line ran. `output` is what the terminal printed. */
	| { t: 'shell'; cmd: string; output: string; ok: boolean };

export interface NetResult {
	/** Final nodes (after allow/block/deploy/scale), same shape as the spec's */
	nodes: import('#lib/curriculum/types.ts').NetNode[];
	links: import('#lib/curriculum/types.ts').NetLink[];
	dns: Record<string, string>;
	/** Every call the learner made and its stringified result, in order */
	calls: { call: string; result: string }[];
	/** cloud: routes on the load balancer, path -> service */
	routes: Record<string, string>;
	/** cloud: traffic outcome */
	traffic: { total: number; ok: number; failed: number; byStatus: Record<number, number> };
}

export interface GitCommit {
	id: string;
	message: string;
	parents: string[];
	author: string;
	/** Snapshot of files at this commit */
	files: Record<string, string>;
}

export interface GitResult {
	/** Working folder */
	files: Record<string, string>;
	staged: string[];
	modified: string[];
	untracked: string[];
	commits: GitCommit[];
	/** branch name -> commit id */
	branches: Record<string, string>;
	head: { branch: string | null; commit: string | null };
	/** Every command and its output, in order (also in trace) */
	terminal: { cmd: string; output: string; ok: boolean }[];
	initialized: boolean;
}

export type ScreenItem =
	| { kind: 'text'; text: string }
	| { kind: 'json'; value: unknown }
	| { kind: 'error'; status: number; text: string }
	/**
	 * renderHtml lessons: the phone "rendered" this text as HTML. `scripted` means a <script>
	 * tag was in it: the simulated XSS. The UI shows the text with tags stripped and, when
	 * scripted, a "a script just ran on the reader's phone" overlay. Never inject the raw text.
	 */
	| { kind: 'html'; raw: string; scripted: boolean };

export interface SimResponse {
	id: number;
	method: string;
	path: string;
	status: number;
	body: unknown;
	/** The route pattern that answered, or null for 404 */
	route: string | null;
}

export interface SqlResultSet {
	columns: string[];
	rows: Record<string, unknown>[];
	/** Set when the statement failed (verification queries only), SQLite's own message */
	error?: string;
}

export interface WebResult {
	responses: SimResponse[];
	/** sql role: the last statement that returned rows, if any */
	sqlResult?: SqlResultSet;
	/** For the database panel: table name -> first rows (max 25) after the run */
	tables: Record<string, SqlResultSet>;
	screen: ScreenItem[];
	queryCount: number;
	/**
	 * Results of the runner's `verifySql` statements (same order), run after the learner's code.
	 * The `db-rows` checks read these: pass `verifySqlFor(lesson.checks)` as `opts.verifySql`.
	 */
	verification?: SqlResultSet[];
}

export interface FriendlyError {
	/**
	 * Learner-facing message, plain language, may name the command they probably meant.
	 * ThemedText so it can say "{hero} walked into a wall" — the UI renders it with renderText().
	 */
	message: ThemedText;
	/** 1-based line in the learner's code, when known */
	line?: number;
	/** 1-based column on `line`, when known (runtime errors only) */
	column?: number;
	/** Original JS error text, for a "show details" toggle */
	raw: string;
}

export interface RunResult {
	/** Finished without a runtime error, crash (bump), step cap or timeout */
	ok: boolean;
	error?: FriendlyError;
	trace: TraceEvent[];
	/** Console lines (also present in trace as 'print' events) */
	output: string[];
	/** Final grid state, when the world is a grid */
	grid?: GridState;
	/** All draw ops, when the world is a canvas (also in trace) */
	draws?: DrawOp[];
	/** Everything the web world produced, when the world is 'web' */
	web?: WebResult;
	/** net world (networks and cloud) */
	net?: NetResult;
	/** git world */
	git?: GitResult;
	/** Number of world commands executed */
	steps: number;
	timedOut: boolean;
}

export interface EvaluateResult {
	passed: boolean;
	/** Learner-facing reasons as ThemedText; the UI renders them with renderText() */
	failures: ThemedText[];
}

export interface RunnerOptions {
	timeoutMs?: number;
	/**
	 * web world: SQL run on the database after the learner's code (and the requests), results in
	 * `web.verification` in the same order. Pass `verifySqlFor(lesson.checks)` so `db-rows`
	 * checks can be evaluated.
	 */
	verifySql?: string[];
}

/**
 * Runs learner code against a world spec.
 * - Browser: `runInWorker(code, world, { timeoutMs, verifySql })` from `#lib/engine/worker`
 * - Node/tests: `runInNode(code, world, { verifySql })` from `#lib/engine/node`
 * Both return a RunResult and never throw for learner mistakes.
 */
export type Runner = (code: string, world: WorldSpec, opts?: RunnerOptions) => Promise<RunResult>;
