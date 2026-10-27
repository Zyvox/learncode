import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.DATABASE_PATH = ':memory:';
});

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeDb, getDb, migrationsFolder, runMigrations } from './db.ts';

const repoDrizzle = path.resolve(process.cwd(), 'drizzle');

afterEach(() => {
	closeDb();
	process.env.DATABASE_PATH = ':memory:';
	delete process.env.MIGRATIONS_PATH;
	vi.restoreAllMocks();
});

describe('migrationsFolder', () => {
	it('finds drizzle/ from the repo root', () => {
		expect(migrationsFolder()).toBe(repoDrizzle);
	});

	it('honours MIGRATIONS_PATH', () => {
		process.env.MIGRATIONS_PATH = repoDrizzle;
		expect(migrationsFolder()).toBe(repoDrizzle);
	});

	it('falls back to walking up from the module when cwd is elsewhere', () => {
		const elsewhere = mkdtempSync(path.join(tmpdir(), 'lc-cwd-'));
		vi.spyOn(process, 'cwd').mockReturnValue(elsewhere);
		try {
			expect(migrationsFolder()).toBe(repoDrizzle);
		} finally {
			rmSync(elsewhere, { recursive: true, force: true });
		}
	});
});

describe('database', () => {
	it('migrates an in-memory database (idempotently)', () => {
		runMigrations();
		runMigrations();
		const tables = getDb()
			.$client.prepare("select name from sqlite_master where type = 'table' order by name")
			.all()
			.map((r) => (r as { name: string }).name);
		expect(tables).toEqual(expect.arrayContaining(['users', 'sessions', 'progress', 'badges']));
		expect(getDb().$client.pragma('foreign_keys', { simple: true })).toBe(1);
	});

	it('creates the directory for a file database and uses WAL', () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'lc-db-'));
		try {
			process.env.DATABASE_PATH = path.join(dir, 'nested', 'deeper', 'test.sqlite');
			runMigrations();
			expect(existsSync(process.env.DATABASE_PATH)).toBe(true);
			expect(getDb().$client.pragma('journal_mode', { simple: true })).toBe('wal');
			closeDb();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
