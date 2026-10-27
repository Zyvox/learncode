/**
 * Shared building blocks for the worlds: the World shape every world returns, the error
 * classes the runner recognises, value formatting for print()/say(), and a step counter.
 * Pure TS — runs in the worker, in Node tests and on the main thread.
 */
import type { ThemedText, WorldKind } from '#lib/curriculum/types.ts';
import type { RunResult, TraceEvent } from './types.ts';

/** Learner-callable functions. */
export type ApiFunction = (...args: unknown[]) => unknown;

export interface World {
	kind: WorldKind;
	/** Commands the learner can call, by name (move, print, circle, …) */
	api: Record<string, ApiFunction>;
	/** Values that exist as variables when the learner's code starts (lesson variables, canvas size) */
	variables: Record<string, unknown>;
	/** What `console.log(...)` does in this world */
	log: (...args: unknown[]) => void;
	trace: TraceEvent[];
	output: string[];
	/** Number of world commands executed so far */
	readonly steps: number;
	/**
	 * Set when the world stopped the program (bump, step cap). Kept even if learner code
	 * swallowed the throw with try/catch, so the run is still reported as stopped.
	 */
	readonly halted: WorldHalt | null;
	/** Likely wrong names → the command they probably meant, e.g. { forward: 'move' } */
	aliases: Record<string, string>;
	/**
	 * Optional: "object.method" typo help, e.g. { db: { methods: ['all', 'get', 'run'],
	 * what: 'a database command' } } turns `db.al is not a function` into a suggestion.
	 */
	objectMethods?: Record<string, ObjectMethods>;
	/**
	 * Optional: runs right after the learner's program returned, still inside the time limit
	 * (the web world fires the phone's requests at the routes the program registered).
	 * Errors it throws are reported like errors from the program.
	 */
	afterProgram?(): void;
	/**
	 * Optional: the world runs the learner's source itself instead of it being compiled as
	 * JavaScript (the web world's SQL editor). Throws like a program would; an engine error with
	 * a numeric `line` property (SqlError) points at the learner's line.
	 */
	executeSource?(code: string): void;
	/** World-specific parts of the RunResult (grid / draws / web). Called exactly once. */
	finish(): Pick<RunResult, 'grid' | 'draws' | 'web'>;
}

export interface ObjectMethods {
	methods: string[];
	/** How to name one of them, e.g. 'a database command' → "`db.al` isn't a database command." */
	what: string;
}

/**
 * Thrown by a world to stop the program: bumping into a wall, too many steps, too much output.
 * Not a learner *mistake* in JavaScript terms, but the run is `ok: false`.
 */
export class WorldHalt extends Error {
	readonly friendly: ThemedText;
	readonly reason: 'bump' | 'max-steps';
	constructor(reason: 'bump' | 'max-steps', friendly: ThemedText, raw?: string) {
		super(raw ?? (typeof friendly === 'string' ? friendly : friendly.default));
		this.name = 'WorldHalt';
		this.reason = reason;
		this.friendly = friendly;
	}
}

/** A command was called with arguments it can't use, e.g. `circle('big')`. */
export class CommandError extends Error {
	readonly friendly: ThemedText;
	constructor(friendly: ThemedText, raw?: string) {
		super(raw ?? (typeof friendly === 'string' ? friendly : friendly.default));
		this.name = 'CommandError';
		this.friendly = friendly;
	}
}

/** The lesson's world spec is invalid. A content bug, never the learner's fault. */
export class SpecError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SpecError';
	}
}

/** Thrown by an executor when the time limit cut the program off. */
export class RunTimeout extends Error {
	readonly timeoutMs: number;
	constructor(timeoutMs: number) {
		super(`Stopped after ${timeoutMs} ms`);
		this.name = 'RunTimeout';
		this.timeoutMs = timeoutMs;
	}
}

/** True for the engine's own errors that already carry a learner-facing message. */
export function isFriendlyEngineError(err: unknown): err is WorldHalt | CommandError {
	return (
		typeof err === 'object' &&
		err !== null &&
		'friendly' in err &&
		(err instanceof WorldHalt || err instanceof CommandError)
	);
}

// ---------------------------------------------------------------------------------------------
// Value formatting (print / say / console.log)
// ---------------------------------------------------------------------------------------------

function tag(v: unknown): string {
	return Object.prototype.toString.call(v);
}

function formatNested(v: unknown, depth: number, seen: Set<unknown>): string {
	if (typeof v === 'string') return JSON.stringify(v);
	return formatInner(v, depth, seen);
}

function formatInner(v: unknown, depth: number, seen: Set<unknown>): string {
	switch (typeof v) {
		case 'string':
			return v;
		case 'number':
			return Object.is(v, -0) ? '0' : String(v);
		case 'bigint':
			return `${v}n`;
		case 'boolean':
			return String(v);
		case 'undefined':
			return 'undefined';
		case 'symbol':
			return v.toString();
		case 'function':
			return `[function ${(v as { name?: string }).name || 'anonymous'}]`;
	}
	if (v === null) return 'null';
	if (seen.has(v)) return '[circular]';
	const t = tag(v);
	if (t === '[object Date]') {
		const d = v as Date;
		return isNaN(d.getTime()) ? 'Invalid Date' : d.toISOString();
	}
	if (t === '[object Error]') {
		const e = v as Error;
		return `${e.name}: ${e.message}`;
	}
	if (depth >= 3) return Array.isArray(v) ? '[…]' : '{…}';
	seen.add(v);
	try {
		if (Array.isArray(v)) {
			const shown = v.slice(0, 100).map((x) => formatNested(x, depth + 1, seen));
			if (v.length > 100) shown.push(`… ${v.length - 100} more`);
			return `[${shown.join(', ')}]`;
		}
		if (t === '[object Map]' || t === '[object Set]') {
			const kind = t === '[object Map]' ? 'Map' : 'Set';
			return `${kind}(${(v as Map<unknown, unknown>).size})`;
		}
		const keys = Object.keys(v as object);
		if (keys.length === 0) return '{}';
		const parts = keys.slice(0, 50).map((k) => {
			const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
			return `${key}: ${formatNested((v as Record<string, unknown>)[k], depth + 1, seen)}`;
		});
		if (keys.length > 50) parts.push(`… ${keys.length - 50} more`);
		return `{ ${parts.join(', ')} }`;
	} catch {
		return '[object]';
	} finally {
		seen.delete(v);
	}
}

/** Formats one value the way print() shows it: strings as-is, arrays/objects JSON-ish. */
export function formatValue(v: unknown): string {
	return formatInner(v, 0, new Set());
}

/** Formats several values joined by spaces, like console.log. */
export function formatArgs(args: unknown[]): string {
	return args.map(formatValue).join(' ');
}

// ---------------------------------------------------------------------------------------------
// Step counting
// ---------------------------------------------------------------------------------------------

export const MAX_OUTPUT_LINES = 1000;

export const TOO_MUCH_OUTPUT: ThemedText = `Your program printed more than ${MAX_OUTPUT_LINES} lines. That usually means a loop that never ends.`;

/**
 * Bookkeeping every world shares: the trace, the output, the step counter and the halt state.
 * `step()` must be called at the start of every learner-callable command.
 */
export function createBase(maxSteps: number, tooManySteps: ThemedText) {
	const trace: TraceEvent[] = [];
	const output: string[] = [];
	const s = { steps: 0, halted: null as WorldHalt | null };

	function halt(h: WorldHalt): never {
		s.halted = h;
		throw h;
	}

	/** Count one command; stops the program once the cap is exceeded. */
	function step(): void {
		if (s.halted) throw s.halted;
		if (s.steps >= maxSteps) {
			trace.push({ t: 'stopped', reason: 'max-steps' });
			halt(new WorldHalt('max-steps', tooManySteps, `Step limit of ${maxSteps} reached`));
		}
		s.steps++;
	}

	/** Append a line of output (print / console.log), capped at MAX_OUTPUT_LINES. */
	function print(text: string): void {
		if (s.halted) throw s.halted;
		if (output.length >= MAX_OUTPUT_LINES) {
			trace.push({ t: 'stopped', reason: 'max-steps' });
			halt(
				new WorldHalt('max-steps', TOO_MUCH_OUTPUT, `Output limit of ${MAX_OUTPUT_LINES} lines`)
			);
		}
		output.push(text);
		trace.push({ t: 'print', text });
	}

	return {
		trace,
		output,
		step,
		halt,
		print,
		get steps() {
			return s.steps;
		},
		get halted() {
			return s.halted;
		}
	};
}
