/**
 * Browser runner: runs learner code in a throwaway module Web Worker and kills it on timeout.
 * Import directly (`#lib/engine/worker.ts`), not via the engine index, so the server bundle
 * never needs it. Only call it in the browser (event handlers, $effect, onMount).
 */
import type { WorldSpec } from '#lib/curriculum/types.ts';
import { failureResult, timeoutResult } from './run.ts';
import type { WorkerRequest, WorkerResponse } from './sandbox.worker.ts';
import type { RunResult, RunnerOptions } from './types.ts';

export const DEFAULT_WORKER_TIMEOUT_MS = 3000;
/** Extra time allowed for the worker module to load before the learner's clock starts. */
const STARTUP_GRACE_MS = 10000;

export function runInWorker(
	code: string,
	world: WorldSpec,
	{ timeoutMs = DEFAULT_WORKER_TIMEOUT_MS, verifySql }: RunnerOptions = {}
): Promise<RunResult> {
	if (typeof window === 'undefined' || typeof Worker === 'undefined') {
		throw new Error(
			'runInWorker() can only run in the browser. Call it from an event handler or an effect, not during server-side rendering.'
		);
	}
	// Plain-data copy: Svelte $state proxies can't be posted to a worker.
	const spec = JSON.parse(JSON.stringify(world)) as WorldSpec;

	return new Promise<RunResult>((resolve) => {
		const worker = new Worker(new URL('./sandbox.worker.ts', import.meta.url), {
			type: 'module'
		});
		let settled = false;
		let timer: ReturnType<typeof setTimeout>;

		const finish = (result: RunResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			worker.terminate();
			resolve(result);
		};
		const broken = (raw: string) =>
			finish(
				failureResult(spec, {
					message: 'Something went wrong while starting your program. Press Run to try again.',
					raw
				})
			);

		// Until the worker says it started, allow time for loading the module.
		timer = setTimeout(() => broken('Worker did not start in time'), timeoutMs + STARTUP_GRACE_MS);

		worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			if (e.data?.type === 'started') {
				clearTimeout(timer);
				timer = setTimeout(() => finish(timeoutResult(spec, timeoutMs)), timeoutMs);
			} else if (e.data?.type === 'result') {
				finish(e.data.result);
			}
		};
		worker.onerror = (e) => {
			e.preventDefault();
			broken(e.message || 'Worker error');
		};
		worker.onmessageerror = () => broken('Worker message could not be read');

		const request: WorkerRequest = { code: String(code ?? ''), world: spec };
		if (verifySql?.length) request.verifySql = verifySql.map(String);
		worker.postMessage(request);
	});
}
