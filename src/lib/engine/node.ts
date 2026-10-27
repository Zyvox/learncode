/**
 * Node runner (tests, curriculum checks). Uses `node:vm` so `while (true) {}` is cut off.
 * Import directly (`#lib/engine/node.ts`); never import this from client code.
 * Not a security boundary — the API functions come from the host realm.
 */
import vm from 'node:vm';
import type { SqlJsStatic } from 'sql.js';
import type { WorldSpec } from '#lib/curriculum/types.ts';
import { RunTimeout } from './core.ts';
import { functionSource } from './program.ts';
import { DB_LOAD_MESSAGE, failureResult, runProgram } from './run.ts';
import type { RunResult, RunnerOptions } from './types.ts';

export const DEFAULT_NODE_TIMEOUT_MS = 2000;

let sqlModule: SqlJsStatic | undefined;
let sqlLoading: Promise<SqlJsStatic> | undefined;

/** Loads sql.js once per process (the wasm file is found in node_modules). */
export function loadSqlInNode(): Promise<SqlJsStatic> {
	sqlLoading ??= import('sql.js')
		.then((m) => {
			const init = (m as unknown as { default?: typeof m }).default ?? m;
			return (init as unknown as () => Promise<SqlJsStatic>)();
		})
		.then((SQL) => (sqlModule = SQL))
		.catch((e) => {
			sqlLoading = undefined;
			throw e;
		});
	return sqlLoading;
}

/**
 * Synchronous runner. For a `web` spec sql.js must already be loaded: pass `sql`, or call
 * `loadSqlInNode()` (or `runInNode`) once before.
 */
export function runProgramInNode(
	code: string,
	world: WorldSpec,
	{
		timeoutMs = DEFAULT_NODE_TIMEOUT_MS,
		verifySql,
		sql
	}: RunnerOptions & { sql?: SqlJsStatic } = {}
): RunResult {
	return runProgram(
		code,
		world,
		(names, values, body) => {
			const context = vm.createContext({}, { microtaskMode: 'afterEvaluate' });
			// Same source text as `new Function(...names, body)`, so line numbers match the worker.
			const fn = vm.runInContext(`(${functionSource(names, body)})`, context);
			(context as Record<string, unknown>).__learncode__ = { fn, values };
			try {
				vm.runInContext(
					'(function (l) { delete globalThis.__learncode__; return l.fn.apply(undefined, l.values); })(__learncode__)',
					context,
					{ timeout: timeoutMs }
				);
			} catch (err) {
				if ((err as { code?: string })?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
					throw new RunTimeout(timeoutMs);
				}
				throw err;
			}
		},
		{ sql: sql ?? sqlModule, verifySql }
	);
}

/** Same contract as `runInWorker`: resolves a RunResult, never rejects for learner mistakes. */
export async function runInNode(
	code: string,
	world: WorldSpec,
	opts: RunnerOptions = {}
): Promise<RunResult> {
	if (world?.kind === 'web') {
		try {
			const sql = await loadSqlInNode();
			return runProgramInNode(code, world, { ...opts, sql });
		} catch (e) {
			return failureResult(world, { message: DB_LOAD_MESSAGE, raw: String(e) });
		}
	}
	return runProgramInNode(code, world, opts);
}
