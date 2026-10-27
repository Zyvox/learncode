import { describe, expect, it } from 'vitest';
import {
	countPlaceholders,
	friendlySqlMessage,
	splitSqlStatements,
	sqlCodeOnly,
	sqlStringLiterals,
	type SqlErrorContext
} from './sql-errors.ts';

const ctx = (sql: string): SqlErrorContext => ({
	sql,
	tables: ['series', 'episodes', 'comments'],
	columns: {
		series: ['id', 'title', 'genre', 'author'],
		episodes: ['id', 'series_id', 'number', 'title', 'published', 'likes'],
		comments: ['id', 'episode_id', 'author', 'text', 'created_at']
	}
});
const f = (raw: string, sql = '') => friendlySqlMessage(raw, ctx(sql));

describe('splitting SQL', () => {
	it('splits at semicolons outside strings, names and comments', () => {
		const src = [
			"SELECT 'a;b' AS x; -- note; here",
			'/* block; comment */ SELECT "we;ird" FROM t;',
			'',
			'  SELECT [c;d] FROM `e;f`',
			';;'
		].join('\n');
		expect(splitSqlStatements(src)).toEqual([
			{ sql: "SELECT 'a;b' AS x", line: 1 },
			{ sql: '-- note; here\n/* block; comment */ SELECT "we;ird" FROM t', line: 2 },
			{ sql: 'SELECT [c;d] FROM `e;f`', line: 4 }
		]);
	});

	it("handles escaped quotes ('') and unterminated strings", () => {
		expect(splitSqlStatements("SELECT 'it''s; fine'; SELECT 2")).toEqual([
			{ sql: "SELECT 'it''s; fine'", line: 1 },
			{ sql: 'SELECT 2', line: 1 }
		]);
		expect(splitSqlStatements("SELECT 'oops; SELECT 2")).toEqual([
			{ sql: "SELECT 'oops; SELECT 2", line: 1 }
		]);
		expect(splitSqlStatements('-- only a comment')).toEqual([]);
	});

	it('counts ? placeholders outside strings', () => {
		expect(countPlaceholders("SELECT * FROM t WHERE a = ? AND b = '?' -- ?")).toBe(1);
		expect(countPlaceholders('SELECT ?, ?')).toBe(2);
		expect(countPlaceholders('SELECT ?1')).toBeNull();
		expect(countPlaceholders('SELECT :name')).toBeNull();
	});

	it('finds string literals and bare code', () => {
		expect(sqlStringLiterals("SELECT 'a', 'it''s' -- 'no'")).toEqual(['a', "it's"]);
		expect(sqlCodeOnly("SELECT 'abc' FROM t -- x").trim()).toBe('SELECT   FROM t');
	});
});

describe('friendly SQLite errors', () => {
	it('suggests keywords for syntax errors', () => {
		expect(f('near "selec": syntax error', 'selec * from series')).toBe(
			"SQLite didn't understand `selec`. Did you mean `SELECT`?"
		);
		expect(f('near "form": syntax error', 'SELECT * form series')).toBe(
			"SQLite didn't understand `form`. Did you mean `FROM`?"
		);
		// the typo isn't where SQLite stopped: LIMT is read as a table alias
		expect(f('near "1": syntax error', 'SELECT * FROM series LIMT 1')).toBe(
			"SQLite didn't understand `LIMT`. Did you mean `LIMIT`?"
		);
		expect(f('near "FROM": syntax error', 'SELECT FROM series')).toMatch(
			/^SQLite got confused just before `FROM`/
		);
		expect(f('near ",": syntax error', 'SELECT a,, b FROM series')).toMatch(
			/^SQLite didn't understand the statement near `,`/
		);
	});

	it('unknown tables list the real ones', () => {
		expect(f('no such table: seris', 'SELECT * FROM seris')).toBe(
			"There's no table called `seris`. Did you mean `series`? The tables are `series`, `episodes` and `comments`."
		);
		expect(friendlySqlMessage('no such table: x', { sql: '', tables: [], columns: {} })).toMatch(
			/no tables yet/
		);
	});

	it('unknown columns suggest columns of the tables used', () => {
		expect(f('no such column: titel', 'SELECT titel FROM series')).toBe(
			"There's no column called `titel`. Did you mean `title`? The columns in `series` are `id`, `title`, `genre` and `author`."
		);
		expect(
			f('no such column: Moonlit', 'SELECT * FROM series s JOIN episodes e WHERE x = Moonlit')
		).toBe(
			"There's no column called `Moonlit`. If you meant a piece of text, put it in single quotes: `'Moonlit'`."
		);
	});

	it('constraints, unfinished input, quotes and counts', () => {
		expect(f('NOT NULL constraint failed: series.title')).toBe(
			'Every row in `series` needs a value for `title`.'
		);
		expect(f('UNIQUE constraint failed: users.name')).toBe(
			"There's already a row in `users` with that `name`. Each `name` can only be used once."
		);
		expect(f('incomplete input')).toBe(
			'The statement seems unfinished. Maybe something is missing at the end, or a closing quote or bracket.'
		);
		expect(f('unrecognized token: "\'abc"')).toMatch(/missing its closing quote/);
		expect(f('table series has 4 columns but 1 values were supplied')).toBe(
			"`series` has 4 columns, but you gave 1 value. Name the columns you're filling in, like `INSERT INTO series (title, genre) VALUES (…)`."
		);
		expect(f('no such function: CONT')).toBe(
			"SQLite doesn't have a function called `CONT`. Did you mean `COUNT`?"
		);
		expect(f('ambiguous column name: title', 'SELECT title FROM episodes JOIN series')).toBe(
			'`title` is a column in more than one of the tables here. Say which one you mean, like `series.title`.'
		);
		expect(f('something else entirely')).toBe('The database said: something else entirely');
	});
});
