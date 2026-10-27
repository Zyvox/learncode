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
	| { t: 'stopped'; reason: 'max-steps' | 'timeout' };

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
	/** Number of world commands executed */
	steps: number;
	timedOut: boolean;
}

export interface EvaluateResult {
	passed: boolean;
	/** Learner-facing reasons as ThemedText; the UI renders them with renderText() */
	failures: ThemedText[];
}

/**
 * Runs learner code against a world spec.
 * - Browser: `runInWorker(code, world, { timeoutMs })` from `#lib/engine/worker`
 * - Node/tests: `runInNode(code, world)` from `#lib/engine/node`
 * Both return a RunResult and never throw for learner mistakes.
 */
export type Runner = (
	code: string,
	world: WorldSpec,
	opts?: { timeoutMs?: number }
) => Promise<RunResult>;
