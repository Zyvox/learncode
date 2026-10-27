/**
 * Test-only helpers for server tests. Import AFTER setting `process.env.DATABASE_PATH`
 * (use `vi.hoisted`), e.g.:
 *
 *   vi.hoisted(() => { process.env.DATABASE_PATH = ':memory:'; });
 */
import { closeDb, db, runMigrations } from './db.ts';
import { badges, progress, sessions, users } from './schema.ts';

/** Fresh in-memory database with all migrations applied. */
export function resetTestDb(): void {
	closeDb();
	runMigrations();
}

/** Empty all tables (faster than re-migrating between tests). */
export function clearTables(): void {
	db.delete(badges).run();
	db.delete(progress).run();
	db.delete(sessions).run();
	db.delete(users).run();
}
