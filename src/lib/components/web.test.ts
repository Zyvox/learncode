import { describe, expect, it } from 'vitest';
import {
	emptyTables,
	sqlVerb,
	statusFamily,
	statusLabel,
	tableOfQuery,
	tablesFromSchema,
	viewOfJson
} from './web.ts';

describe('status helpers', () => {
	it('groups status codes into families', () => {
		expect(statusFamily(200)).toBe('ok');
		expect(statusFamily(201)).toBe('ok');
		expect(statusFamily(404)).toBe('client');
		expect(statusFamily(500)).toBe('server');
		expect(statusFamily(0)).toBe('none');
	});
	it('labels statuses in plain words', () => {
		expect(statusLabel(200)).toBe('200 OK');
		expect(statusLabel(404)).toBe('404 Not found');
		expect(statusLabel(0)).toBe('no connection');
		expect(statusLabel(418)).toBe('418');
	});
});

describe('tablesFromSchema', () => {
	const schema = `
CREATE TABLE series   (id INTEGER PRIMARY KEY, title TEXT NOT NULL, genre TEXT, author TEXT);
CREATE TABLE episodes (id INTEGER PRIMARY KEY, series_id INTEGER NOT NULL, number INTEGER NOT NULL,
                       title TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 1, likes INTEGER NOT NULL DEFAULT 0,
                       FOREIGN KEY (series_id) REFERENCES series(id));
INSERT INTO series (title) VALUES ('Moonlit (Deliveries)');
create table if not exists sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL);`;

	it('finds tables and columns', () => {
		expect(tablesFromSchema(schema)).toEqual([
			{ name: 'series', columns: ['id', 'title', 'genre', 'author'] },
			{
				name: 'episodes',
				columns: ['id', 'series_id', 'number', 'title', 'published', 'likes']
			},
			{ name: 'sessions', columns: ['token', 'user_id'] }
		]);
	});
	it('builds empty snapshots', () => {
		expect(emptyTables(schema).series).toEqual({
			columns: ['id', 'title', 'genre', 'author'],
			rows: []
		});
		expect(emptyTables(undefined)).toEqual({});
	});
});

describe('query helpers', () => {
	it('finds the table and verb', () => {
		expect(tableOfQuery('SELECT * FROM episodes WHERE id = ?')).toBe('episodes');
		expect(tableOfQuery('insert into comments (text) values (?)')).toBe('comments');
		expect(tableOfQuery('UPDATE episodes SET likes = likes + 1')).toBe('episodes');
		expect(tableOfQuery('SELECT 1')).toBe(null);
		expect(sqlVerb('  select * from x')).toBe('SELECT');
		expect(sqlVerb('-- note\nDELETE FROM x')).toBe('DELETE');
	});
});

describe('viewOfJson', () => {
	it('turns arrays of objects into cards with a heading', () => {
		const v = viewOfJson([
			{ id: 1, title: 'Moonlit Deliveries', genre: 'slice of life' },
			{ id: 2, title: 'Grove & Gear', genre: null }
		]);
		expect(v).toEqual({
			kind: 'cards',
			more: 0,
			cards: [
				{
					heading: 'Moonlit Deliveries',
					rows: [
						['id', '1'],
						['genre', 'slice of life']
					]
				},
				{
					heading: 'Grove & Gear',
					rows: [
						['id', '2'],
						['genre', '—']
					]
				}
			]
		});
	});
	it('one object is one card, primitives are text, mixed arrays are a list', () => {
		expect(viewOfJson({ error: 'Not found' })).toEqual({
			kind: 'cards',
			more: 0,
			cards: [{ rows: [['error', 'Not found']] }]
		});
		expect(viewOfJson(42)).toEqual({ kind: 'text', text: '42' });
		expect(viewOfJson(['a', 2])).toEqual({ kind: 'list', items: ['a', '2'], more: 0 });
	});
});
