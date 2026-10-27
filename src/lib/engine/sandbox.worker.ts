/**
 * Module Web Worker that runs one learner program. No DOM: it only uses the engine core.
 * Protocol: receives { code, world } → posts { type: 'started' } then { type: 'result', result }.
 */
import type { WorldSpec } from '#lib/curriculum/types.ts';
import { functionExecutor, runProgram } from './run.ts';
import type { RunResult } from './types.ts';

export type WorkerRequest = { code: string; world: WorldSpec };
export type WorkerResponse = { type: 'started' } | { type: 'result'; result: RunResult };

const scope = self as unknown as {
	postMessage(message: WorkerResponse): void;
	addEventListener(type: 'message', listener: (e: { data: WorkerRequest }) => void): void;
};

scope.addEventListener('message', (e) => {
	const { code, world } = e.data;
	scope.postMessage({ type: 'started' });
	const result = runProgram(code, world, functionExecutor);
	scope.postMessage({ type: 'result', result });
});
