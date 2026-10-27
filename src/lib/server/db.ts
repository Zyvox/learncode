/**
 * The one SQLite database (better-sqlite3 + drizzle).
 *
 * - Path: `DATABASE_PATH` (default `./data/learncode.sqlite`, `:memory:` works for tests).
 * - Migrations: SQL files in `drizzle/` (from `npx drizzle-kit generate`), applied by `runMigrations()`
 *   which the `init` hook calls at startup. The folder is found via `MIGRATIONS_PATH`, then
 *   `<cwd>/drizzle`, then by walking up from this file (covers `node build` from elsewhere).
 * - `db` is a lazy singleton: the file is opened on first use, not at import time, so importing
 *   server modules during `vite build` never touches the disk.
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.ts';

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

let instance: DB | null = null;

function databasePath(): string {
	return process.env.DATABASE_PATH || './data/learncode.sqlite';
}

function open(): DB {
	const file = databasePath();
	const inMemory = file === ':memory:' || file.startsWith('file::memory:');
	if (!inMemory) mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

	const sqlite = new Database(file);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	sqlite.pragma('synchronous = NORMAL');
	return drizzle({ client: sqlite, schema });
}

/** The database, opened on first call. */
export function getDb(): DB {
	instance ??= open();
	return instance;
}

/**
 * Lazy proxy so callers can simply `import { db }`. Every property access goes to the real
 * instance (opened on first use, re-opened after `closeDb()`).
 */
export const db: DB = new Proxy({} as DB, {
	get(_target, prop) {
		const real = getDb();
		const value = Reflect.get(real, prop, real);
		return typeof value === 'function' ? value.bind(real) : value;
	}
});

/** Close the connection. The next `db` access opens a fresh one (tests use this with `:memory:`). */
export function closeDb(): void {
	if (instance) {
		instance.$client.close();
		instance = null;
	}
}

function hasJournal(dir: string): boolean {
	return existsSync(path.join(dir, 'meta', '_journal.json'));
}

/** Where the `drizzle/` migrations folder lives. Throws a clear error if it can't be found. */
export function migrationsFolder(): string {
	const candidates: string[] = [];
	if (process.env.MIGRATIONS_PATH) candidates.push(path.resolve(process.env.MIGRATIONS_PATH));
	candidates.push(path.resolve(process.cwd(), 'drizzle'));

	// Walk up from this module: src/lib/server/ in dev, build/server/chunks/ in production.
	try {
		let dir = path.dirname(fileURLToPath(import.meta.url));
		for (let i = 0; i < 6; i++) {
			candidates.push(path.join(dir, 'drizzle'));
			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	} catch {
		// import.meta.url is not a file: URL (bundled somewhere unusual) — rely on the others.
	}

	const found = candidates.find(hasJournal);
	if (!found) {
		throw new Error(
			`Could not find the drizzle migrations folder. Looked in:\n  ${candidates.join('\n  ')}\n` +
				'Set MIGRATIONS_PATH to the folder that contains meta/_journal.json.'
		);
	}
	return found;
}

/** Apply any pending migrations. Safe to call repeatedly. */
export function runMigrations(): void {
	migrate(getDb(), { migrationsFolder: migrationsFolder() });
}
