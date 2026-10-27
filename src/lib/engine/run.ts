/**
 * The run core shared by the browser worker and the Node runner. Pure: the actual execution
 * is injected (`new Function` in the worker, `node:vm` in Node), so both produce the same
 * RunResult for the same code.
 */
import { emptyGitResult } from './worlds/git.ts';
import type { SqlJsStatic } from 'sql.js';
import type { WorldSpec } from '#lib/curriculum/types.ts';
import { RunTimeout, SpecError, isFriendlyEngineError, type World } from './core.ts';
import { TIMEOUT_MESSAGE, findSyntaxErrorLine, toFriendlyError } from './errors.ts';
import { buildBody, buildProgram } from './program.ts';
import type { FriendlyError, RunResult, WebResult } from './types.ts';
import { SqlNotLoaded, createWorld } from './worlds/index.ts';
import { gridStateFromSpec } from './worlds/grid.ts';
import { DB_LOAD_MESSAGE } from './worlds/web.ts';

export { DB_LOAD_MESSAGE };

/**
 * Runs the program. Must run it synchronously and let errors propagate. Throw `RunTimeout`
 * when a time limit cut the program off.
 */
export type Executor = (names: string[], values: unknown[], body: string) => void;
/** Compiles without running; throws the engine's SyntaxError. */
export type Compiler = (names: string[], body: string) => void;

export const defaultCompile: Compiler = (names, body) => {
	// Compiling is enough to surface syntax errors; nothing runs.
	new Function(...names, body);
};

/** Executes with `new Function` (used by the worker). */
export const functionExecutor: Executor = (names, values, body) => {
	new Function(...names, body).apply(undefined, values);
};

export interface RunProgramOptions {
	/** Defaults to `new Function` compile (same engine as the executor in both runners). */
	compile?: Compiler;
	/** web world: the loaded sql.js module (the runners load it before calling runProgram) */
	sql?: SqlJsStatic;
	/** web world: SQL run after the program; results in `web.verification` (same order) */
	verifySql?: string[];
}

export const SPEC_ERROR_MESSAGE =
	"This level isn't set up quite right, so your code couldn't run. That's our mistake, not yours.";

export function emptyWebResult(): WebResult {
	return { responses: [], tables: {}, screen: [], queryCount: 0 };
}

/** The world-specific empty parts of a result, built straight from the spec. */
function emptyWorldParts(
	spec: WorldSpec
): Pick<RunResult, 'grid' | 'draws' | 'web' | 'net' | 'git'> {
	if (spec?.kind === 'grid') {
		try {
			return { grid: gridStateFromSpec(spec) };
		} catch {
			return {};
		}
	}
	if (spec?.kind === 'canvas') return { draws: [] };
	if (spec?.kind === 'web') return { web: emptyWebResult() };
	if (spec?.kind === 'net')
		return {
			net: {
				nodes: spec.nodes ?? [],
				links: spec.links ?? [],
				dns: spec.dns ?? {},
				calls: [],
				routes: {},
				traffic: { total: 0, ok: 0, failed: 0, byStatus: {} }
			}
		};
	if (spec?.kind === 'git') return { git: emptyGitResult() };
	return {};
}

/**
 * The result when the time limit stopped the program. Identical for both runners (the worker
 * can't report anything from a program that never finished, so neither does Node).
 */
export function timeoutResult(spec: WorldSpec, timeoutMs: number): RunResult {
	return {
		ok: false,
		error: { message: TIMEOUT_MESSAGE, raw: new RunTimeout(timeoutMs).message },
		trace: [{ t: 'stopped', reason: 'timeout' }],
		output: [],
		...emptyWorldParts(spec),
		steps: 0,
		timedOut: true
	};
}

/** A result for problems outside the learner's code (bad spec, worker failed to start). */
export function failureResult(spec: WorldSpec, error: FriendlyError): RunResult {
	return {
		ok: false,
		error,
		trace: [],
		output: [],
		...emptyWorldParts(spec),
		steps: 0,
		timedOut: false
	};
}

function resultFrom(world: World, error?: FriendlyError): RunResult {
	const result: RunResult = {
		ok: !error,
		trace: world.trace,
		output: world.output,
		...world.finish(),
		steps: world.steps,
		timedOut: false
	};
	if (error) result.error = error;
	return result;
}

export function runProgram(
	code: string,
	spec: WorldSpec,
	execute: Executor,
	opts: RunProgramOptions = {}
): RunResult {
	code = String(code ?? '');
	let world: World;
	try {
		world = createWorld(spec, { SQL: opts.sql, verifySql: opts.verifySql });
	} catch (e) {
		if (e instanceof SqlNotLoaded) {
			return failureResult(spec, { message: DB_LOAD_MESSAGE, raw: e.message });
		}
		const raw = e instanceof SpecError ? `Invalid world spec: ${e.message}` : String(e);
		return failureResult(spec, { message: SPEC_ERROR_MESSAGE, raw });
	}

	if (world.executeSource) return runSource(code, spec, world);

	const program = buildProgram(code, world);
	const friendly = (err: unknown, line?: number) =>
		toFriendlyError(err, code, program.knownNames, program.prefixLines, {
			commandNames: program.commandNames,
			aliases: world.aliases,
			objectMethods: world.objectMethods,
			line
		});

	// 1. Syntax check (V8 gives no line number for these, so find it ourselves).
	const compile = opts.compile ?? defaultCompile;
	try {
		compile(program.names, program.body);
	} catch (err) {
		const message = (err as Error)?.message ?? '';
		const line = findSyntaxErrorLine(code, message, (prefix) =>
			compile(program.names, buildBody(prefix))
		);
		return resultFrom(world, friendly(err, line));
	}

	// 2. Run (the world's afterProgram hook runs at the end of the same call).
	try {
		execute(program.names, program.values, program.body);
	} catch (err) {
		if (err instanceof RunTimeout) return timedOut(world, spec, err.timeoutMs);
		// A halt wins even if the learner caught it and something else went wrong later.
		return resultFrom(world, friendly(world.halted ?? err));
	}
	if (world.halted) return resultFrom(world, friendly(world.halted));
	return resultFrom(world);
}

/** Timeout: the result has nothing from the run, but the world still gets to clean up. */
function timedOut(world: World, spec: WorldSpec, timeoutMs: number): RunResult {
	try {
		world.finish();
	} catch {
		// nothing to report from a program that never finished
	}
	return timeoutResult(spec, timeoutMs);
}

/** A world that runs the source itself (SQL): no JavaScript compile step. */
function runSource(code: string, spec: WorldSpec, world: World): RunResult {
	const friendly = (err: unknown): FriendlyError => {
		if (!isFriendlyEngineError(err)) {
			return {
				message: 'Something went wrong while running this. Press Run to try again.',
				raw: String((err as Error)?.message ?? err)
			};
		}
		const raw = (err as { raw?: unknown }).raw;
		const line = (err as { line?: unknown }).line;
		const out: FriendlyError = {
			message: err.friendly,
			raw: typeof raw === 'string' ? raw : err.message
		};
		if (typeof line === 'number') out.line = line;
		return out;
	};
	try {
		world.executeSource!(code);
		world.afterProgram?.();
	} catch (err) {
		if (err instanceof RunTimeout) return timedOut(world, spec, err.timeoutMs);
		return resultFrom(world, friendly(world.halted ?? err));
	}
	if (world.halted) return resultFrom(world, friendly(world.halted));
	return resultFrom(world);
}
