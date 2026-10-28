/**
 * SQLite without a native build step.
 *
 * Node ships SQLite (`node:sqlite`, unflagged since 22.13). Drizzle's synchronous SQLite driver
 * expects the better-sqlite3 API, so this file wraps `DatabaseSync` in exactly the surface
 * Drizzle and our own code use: `prepare().run/get/all/raw()`, `exec`, `pragma`, `transaction`
 * and `close`. No compiler, no prebuilt binaries, same code on Windows and Linux.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';

export type SqlParam = string | number | bigint | boolean | null | undefined | Uint8Array;

/** node:sqlite binds JS numbers as REAL; integers go in as INTEGER (via bigint), booleans as 0/1. */
function bind(value: SqlParam): string | number | bigint | null | Uint8Array {
	if (value === undefined || value === null) return null;
	if (typeof value === 'boolean') return value ? 1n : 0n;
	if (typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value))
		return BigInt(value);
	return value;
}

function bindAll(params: SqlParam[]) {
	// A single array argument means "here are the params" (better-sqlite3 accepts both forms).
	const flat = params.length === 1 && Array.isArray(params[0]) ? (params[0] as SqlParam[]) : params;
	return flat.map(bind);
}

export interface RunResult {
	changes: number;
	lastInsertRowid: number;
}

type Row = Record<string, unknown>;

export class Statement {
	readonly #stmt: StatementSync;
	readonly #columns: string[] | null;

	constructor(stmt: StatementSync, columns: string[] | null) {
		this.#stmt = stmt;
		this.#columns = columns;
	}

	run(...params: SqlParam[]): RunResult {
		const r = this.#stmt.run(...bindAll(params));
		return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
	}

	get(...params: SqlParam[]): Row | undefined {
		const row = this.#stmt.get(...bindAll(params)) as Row | undefined;
		return row === undefined ? undefined : { ...row };
	}

	all(...params: SqlParam[]): Row[] {
		return (this.#stmt.all(...bindAll(params)) as Row[]).map((r) => ({ ...r }));
	}

	/** Rows as arrays in column order (Drizzle uses this for mapped selects). */
	raw(): {
		get(...params: SqlParam[]): unknown[] | undefined;
		all(...params: SqlParam[]): unknown[][];
	} {
		const toArray = (row: Row) =>
			this.#columns ? this.#columns.map((c) => row[c]) : Object.values(row);
		return {
			get: (...params) => {
				const row = this.get(...params);
				return row === undefined ? undefined : toArray(row);
			},
			all: (...params) => this.all(...params).map(toArray)
		};
	}
}

type TxMode = 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE';

export interface TransactionFn<A extends unknown[], R> {
	(...args: A): R;
	deferred(...args: A): R;
	immediate(...args: A): R;
	exclusive(...args: A): R;
}

export class SqliteDatabase {
	readonly #db: DatabaseSync;
	#depth = 0;

	constructor(file: string) {
		this.#db = new DatabaseSync(file);
	}

	prepare(sql: string): Statement {
		const stmt = this.#db.prepare(sql);
		let columns: string[] | null = null;
		try {
			columns = typeof stmt.columns === 'function' ? stmt.columns().map((c) => c.name) : null;
		} catch {
			// Statements that return no rows (INSERT, PRAGMA …) may not expose columns.
		}
		return new Statement(stmt, columns);
	}

	exec(sql: string): void {
		this.#db.exec(sql);
	}

	/** `pragma('foreign_keys')` → rows; `pragma('foreign_keys', { simple: true })` → the first value. */
	pragma(text: string, opts?: { simple?: boolean }): unknown {
		const rows = this.#db.prepare(`PRAGMA ${text}`).all() as Row[];
		if (!opts?.simple) return rows.map((r) => ({ ...r }));
		const first = rows[0];
		return first === undefined ? undefined : Object.values(first)[0];
	}

	/**
	 * better-sqlite3-style transactions: the returned function runs `fn` inside BEGIN/COMMIT and
	 * rolls back on a throw. Nested calls become savepoints, like better-sqlite3.
	 */
	transaction<A extends unknown[], R>(fn: (...args: A) => R): TransactionFn<A, R> {
		const make =
			(mode: TxMode) =>
			(...args: A): R => {
				const nested = this.#depth > 0;
				const name = `sp_${this.#depth}`;
				this.#db.exec(nested ? `SAVEPOINT ${name}` : `BEGIN ${mode}`);
				this.#depth++;
				try {
					const result = fn(...args);
					this.#depth--;
					this.#db.exec(nested ? `RELEASE SAVEPOINT ${name}` : 'COMMIT');
					return result;
				} catch (err) {
					this.#depth--;
					this.#db.exec(
						nested ? `ROLLBACK TO SAVEPOINT ${name}; RELEASE SAVEPOINT ${name}` : 'ROLLBACK'
					);
					throw err;
				}
			};
		const tx = make('DEFERRED') as TransactionFn<A, R>;
		tx.deferred = make('DEFERRED');
		tx.immediate = make('IMMEDIATE');
		tx.exclusive = make('EXCLUSIVE');
		return tx;
	}

	close(): void {
		this.#db.close();
	}
}
