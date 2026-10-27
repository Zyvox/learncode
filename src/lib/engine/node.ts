/**
 * Node runner (tests, curriculum checks). Uses `node:vm` so `while (true) {}` is cut off.
 * Import directly (`#lib/engine/node.ts`); never import this from client code.
 * Not a security boundary — the API functions come from the host realm.
 */
import vm from 'node:vm';
import type { WorldSpec } from '#lib/curriculum/types.ts';
import { RunTimeout } from './core.ts';
import { functionSource } from './program.ts';
import { runProgram } from './run.ts';
import type { RunResult } from './types.ts';

export const DEFAULT_NODE_TIMEOUT_MS = 2000;

export function runProgramInNode(
	code: string,
	world: WorldSpec,
	{ timeoutMs = DEFAULT_NODE_TIMEOUT_MS }: { timeoutMs?: number } = {}
): RunResult {
	return runProgram(code, world, (names, values, body) => {
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
	});
}

/** Same contract as `runInWorker`: resolves a RunResult, never rejects for learner mistakes. */
export async function runInNode(
	code: string,
	world: WorldSpec,
	opts: { timeoutMs?: number } = {}
): Promise<RunResult> {
	return runProgramInNode(code, world, opts);
}
