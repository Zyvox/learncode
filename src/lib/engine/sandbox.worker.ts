/**
 * Module Web Worker that runs one learner program. No DOM: it only uses the engine core.
 * Protocol: receives { code, world, verifySql? } → posts { type: 'started' } then
 * { type: 'result', result }. For web lessons sql.js (WebAssembly) is loaded first, before
 * 'started', so loading doesn't eat into the learner's time limit.
 */
import type { WorldSpec } from '#lib/curriculum/types.ts';
import {
	DB_LOAD_MESSAGE,
	failureResult,
	functionExecutor,
	runProgram,
	type RunProgramOptions
} from './run.ts';
import type { RunResult } from './types.ts';

export type WorkerRequest = { code: string; world: WorldSpec; verifySql?: string[] };
export type WorkerResponse = { type: 'started' } | { type: 'result'; result: RunResult };

const scope = self as unknown as {
	postMessage(message: WorkerResponse): void;
	addEventListener(type: 'message', listener: (e: { data: WorkerRequest }) => void): void;
};

let sqlLoading: Promise<RunProgramOptions['sql']> | undefined;
/** sql.js, loaded once per worker and only for web lessons. */
function loadSql(): Promise<RunProgramOptions['sql']> {
	sqlLoading ??= import('./sql-browser.ts')
		.then((m) => m.loadSqlInBrowser())
		.catch((e) => {
			sqlLoading = undefined;
			throw e;
		});
	return sqlLoading;
}

function run({ code, world, verifySql }: WorkerRequest, sql?: RunProgramOptions['sql']) {
	scope.postMessage({ type: 'started' });
	const result = runProgram(code, world, functionExecutor, { sql, verifySql });
	scope.postMessage({ type: 'result', result });
}

scope.addEventListener('message', (e) => {
	const request = e.data;
	if (request.world?.kind !== 'web') return run(request);
	loadSql().then(
		(sql) => run(request, sql),
		(err) =>
			scope.postMessage({
				type: 'result',
				result: failureResult(request.world, { message: DB_LOAD_MESSAGE, raw: String(err) })
			})
	);
});
