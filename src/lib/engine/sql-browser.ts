/**
 * Loads sql.js inside the sandbox worker (browser only). Imported dynamically by
 * sandbox.worker.ts for web lessons, so other worlds never download it.
 */
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let loading: Promise<SqlJsStatic> | undefined;

export function loadSqlInBrowser(): Promise<SqlJsStatic> {
	loading ??= initSqlJs({ locateFile: () => wasmUrl }).catch((e) => {
		loading = undefined;
		throw e;
	});
	return loading;
}
