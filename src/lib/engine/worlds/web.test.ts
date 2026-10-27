import { beforeAll, describe, expect, it } from 'vitest';
import type { SqlJsStatic } from 'sql.js';
import type { WebWorldSpec } from '#lib/curriculum/types.ts';
import { loadSqlInNode, runInNode, runProgramInNode } from '../node.ts';
import { DB_LOAD_MESSAGE, SPEC_ERROR_MESSAGE, functionExecutor, runProgram } from '../run.ts';
import type { RunResult, TraceEvent } from '../types.ts';
import { INKWELL_TEST_SCHEMA as INKWELL_SCHEMA } from './web.fixtures.ts';
import { createWebWorld, matchRoute, parseQuery, segmentsOf } from './web.ts';

const server = (extra: Partial<WebWorldSpec> = {}): WebWorldSpec => ({
	kind: 'web',
	role: 'server',
	schema: INKWELL_SCHEMA,
	...extra
});

const kinds = (r: RunResult) => r.trace.map((e) => e.t);
const of = <T extends TraceEvent['t']>(r: RunResult, t: T) =>
	r.trace.filter((e): e is Extract<TraceEvent, { t: T }> => e.t === t);

let SQL: SqlJsStatic;
beforeAll(async () => {
	SQL = await loadSqlInNode();
});

describe('router helpers', () => {
	it('parses query strings', () => {
		expect(parseQuery('a=1&b=two%20words&c&a=3&d=x+y')).toEqual({
			a: '3',
			b: 'two words',
			c: '',
			d: 'x y'
		});
		expect(parseQuery('bad=%E0%A4%A')).toEqual({ bad: '%E0%A4%A' });
	});

	it('matches patterns with params and ignores trailing slashes', () => {
		expect(matchRoute(segmentsOf('/episodes/:id'), segmentsOf('/episodes/12'))).toEqual({
			id: '12'
		});
		expect(matchRoute(segmentsOf('/episodes'), segmentsOf('/episodes/'))).toEqual({});
		expect(matchRoute(segmentsOf('/'), segmentsOf('/'))).toEqual({});
		expect(matchRoute(segmentsOf('/episodes/:id'), segmentsOf('/episodes'))).toBeNull();
		expect(matchRoute(segmentsOf('/a/:x/b/:y'), segmentsOf('/a/1/b/hi%20there'))).toEqual({
			x: '1',
			y: 'hi there'
		});
	});
});

describe('web world: server role', () => {
	it('routes requests in order, with params, query, body and headers', async () => {
		const spec = server({
			requests: [
				{ method: 'GET', path: '/episodes/12?lang=en&page=2', label: 'open episode' },
				{ method: 'GET', path: '/episodes/' },
				{
					method: 'POST',
					path: '/comments',
					body: { text: 'hi' },
					headers: { Token: 'abc' }
				},
				{ method: 'DELETE', path: '/episodes/1' }
			]
		});
		const code = `
app.get('/episodes/:id', (req, res) => {
  res.json({ id: req.params.id, query: req.query, method: req.method, path: req.path })
})
app.get('/episodes/:id', (req, res) => res.json('never'))
app.get('/episodes', (req, res) => res.json('list'))
app.post('/comments', (req, res) => {
  res.status(201).json({ got: req.body.text, token: req.headers.token })
})
`;
		const r = await runInNode(code, spec);
		expect(r.error).toBeUndefined();
		expect(r.ok).toBe(true);
		const res = r.web!.responses;
		expect(res[0]).toEqual({
			id: 0,
			method: 'GET',
			path: '/episodes/12?lang=en&page=2',
			status: 200,
			body: { id: '12', query: { lang: 'en', page: '2' }, method: 'GET', path: '/episodes/12' },
			route: '/episodes/:id'
		});
		expect(res[1]).toMatchObject({ status: 200, body: 'list', route: '/episodes' });
		expect(res[2]).toMatchObject({ status: 201, body: { got: 'hi', token: 'abc' } });
		// method mismatch → 404
		expect(res[3]).toMatchObject({
			status: 404,
			body: { error: 'Not found: DELETE /episodes/1' },
			route: null
		});
		expect(of(r, 'route').map((e) => e.pattern)).toEqual([
			'/episodes/:id',
			'/episodes',
			'/comments',
			null
		]);
		expect(of(r, 'request')[0]).toEqual({
			t: 'request',
			id: 0,
			method: 'GET',
			path: '/episodes/12?lang=en&page=2',
			label: 'open episode'
		});
		expect(of(r, 'request')[2].body).toEqual({ text: 'hi' });
		// auto screen items: json for 2xx, error otherwise
		expect(r.web!.screen).toEqual([
			{ kind: 'json', value: res[0].body },
			{ kind: 'text', text: 'list' },
			{ kind: 'json', value: { got: 'hi', token: 'abc' } },
			{ kind: 'error', status: 404, text: 'Not found: DELETE /episodes/1' }
		]);
		expect(r.steps).toBe(4);
	});

	it('traces request → route → log/query → response → screen', async () => {
		const r = await runInNode(
			`app.get('/series/:id', (req, res) => {
  log('looking up', req.params.id)
  const s = db.get('SELECT title FROM series WHERE id = ?', [req.params.id])
  res.json(s)
})`,
			server({ requests: [{ method: 'GET', path: '/series/2' }] })
		);
		expect(kinds(r)).toEqual(['request', 'route', 'log', 'query', 'response', 'screen']);
		expect(of(r, 'log')[0]).toEqual({ t: 'log', id: 0, where: 'server', text: 'looking up 2' });
		expect(of(r, 'query')[0]).toEqual({
			t: 'query',
			id: 0,
			sql: 'SELECT title FROM series WHERE id = ?',
			params: ['2'],
			rows: 1
		});
		expect(r.web!.responses[0].body).toEqual({ title: 'Grove & Gear' });
		expect(r.web!.queryCount).toBe(1);
		expect(r.steps).toBe(3);
	});

	it('404 for unknown paths', async () => {
		const r = await runInNode('', server({ requests: [{ method: 'GET', path: '/nope?x=1' }] }));
		expect(r.ok).toBe(true);
		expect(r.web!.responses[0]).toMatchObject({
			status: 404,
			body: { error: 'Not found: GET /nope' },
			route: null
		});
		expect(kinds(r)).toEqual(['request', 'route', 'response', 'screen']);
	});

	it('a handler that throws → 500 and the error in the log', async () => {
		const r = await runInNode(
			`app.get('/boom', (req, res) => {
  const ep = undefined
  res.json(ep.title)
})`,
			server({ requests: [{ method: 'GET', path: '/boom' }] })
		);
		expect(r.ok).toBe(true);
		expect(r.web!.responses[0]).toMatchObject({ status: 500, body: { error: 'Server error' } });
		expect(of(r, 'log')[0].text).toMatch(
			/^Error in GET \/boom: Cannot read properties of undefined/
		);
		expect(r.web!.screen[0]).toEqual({ kind: 'error', status: 500, text: 'Server error' });
	});

	it('a handler that sends nothing → 500 and a log line', async () => {
		const r = await runInNode(
			"app.get('/quiet', (req, res) => { log('hmm') })",
			server({ requests: [{ method: 'GET', path: '/quiet/' }] })
		);
		expect(r.web!.responses[0]).toMatchObject({ status: 500, body: { error: 'Server error' } });
		expect(of(r, 'log').map((e) => e.text)).toEqual([
			'hmm',
			'The handler for GET /quiet/ finished without sending a response.'
		]);
	});

	it('sending twice keeps the first answer and logs a warning', async () => {
		const r = await runInNode(
			"app.get('/twice', (req, res) => {\n  res.json({ a: 1 })\n  res.status(404).json({ b: 2 })\n})",
			server({ requests: [{ method: 'GET', path: '/twice' }] })
		);
		expect(r.web!.responses[0]).toMatchObject({ status: 200, body: { a: 1 } });
		expect(of(r, 'log')[0].text).toMatch(/second response/);
	});

	it('res.send, res.end and res.status validation', async () => {
		const r = await runInNode(
			`app.get('/text', (req, res) => res.send('pong'))
app.get('/obj', (req, res) => res.send({ a: 1 }))
app.delete('/x', (req, res) => res.status(204).end())
app.get('/bad', (req, res) => res.status('404').json({}))`,
			server({
				requests: [
					{ method: 'GET', path: '/text' },
					{ method: 'GET', path: '/obj' },
					{ method: 'DELETE', path: '/x' },
					{ method: 'GET', path: '/bad' }
				]
			})
		);
		const res = r.web!.responses;
		expect(res.map((x) => [x.status, x.body])).toEqual([
			[200, 'pong'],
			[200, { a: 1 }],
			[204, ''],
			[500, { error: 'Server error' }]
		]);
		expect(of(r, 'log')[0].text).toBe(
			'Error in GET /bad: `res.status()` needs a status code number, like `res.status(404)`.'
		);
	});

	it('app.get validation errors are friendly and point at the line', async () => {
		let r = await runInNode("\napp.get('episodes', (req, res) => res.json(1))", server());
		expect(r.ok).toBe(false);
		expect(r.error?.message).toMatch(
			/needs a path like `'\/episodes'` and a function to run\. The path has to start with `\/`/
		);
		expect(r.error?.line).toBe(2);
		r = await runInNode("app.post('/x')", server());
		expect(r.error?.message).toMatch(/^`app\.post\(\)` needs a path like/);
	});

	it('db.all / db.get / db.run return rows, first row and { changes, lastId }', async () => {
		const r = await runInNode(
			`app.post('/comments', (req, res) => {
  const info = db.run('INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)', [req.body.episodeId, 'me', req.body.text])
  res.status(201).json(info)
})
app.get('/episodes', (req, res) => {
  res.json(db.all('SELECT id, title FROM episodes WHERE series_id = ? ORDER BY number', [Number(req.query.series)]))
})
app.get('/none', (req, res) => res.json({ found: db.get('SELECT * FROM series WHERE id = 99') === undefined }))`,
			server({
				requests: [
					{ method: 'POST', path: '/comments', body: { episodeId: 1, text: 'nice' } },
					{ method: 'GET', path: '/episodes?series=1' },
					{ method: 'GET', path: '/none' }
				]
			})
		);
		expect(r.error).toBeUndefined();
		const [a, b, c] = r.web!.responses;
		expect(a.body).toEqual({ changes: 1, lastId: 3 });
		expect(b.body).toEqual([
			{ id: 1, title: 'The first night' },
			{ id: 2, title: 'Rain on the roofs' }
		]);
		expect(c.body).toEqual({ found: true });
		const q = of(r, 'query');
		expect(q.map((e) => [e.id, e.rows, e.changes])).toEqual([
			[0, undefined, 1],
			[1, 2, undefined],
			[2, 0, undefined]
		]);
		expect(r.web!.tables.comments.rows).toHaveLength(3);
		expect(r.web!.queryCount).toBe(3);
	});

	it('an SQL error inside a handler → 500 with the friendly message in the log', async () => {
		const r = await runInNode(
			"app.get('/s', (req, res) => res.json(db.all('SELECT * FROM serie')))",
			server({ requests: [{ method: 'GET', path: '/s' }] })
		);
		expect(r.ok).toBe(true);
		expect(r.web!.responses[0].status).toBe(500);
		expect(of(r, 'log')[0].text).toMatch(
			/^Error in GET \/s: There's no table called `serie`\. Did you mean `series`\?/
		);
		expect(of(r, 'query')[0].error).toBe('no such table: serie');
	});

	it('an SQL error outside a handler fails the run with a friendly message and line', async () => {
		const r = await runInNode("log('start')\ndb.all('SELEC * FROM series')", server());
		expect(r.ok).toBe(false);
		expect(r.error).toEqual({
			message: "SQLite didn't understand `SELEC`. Did you mean `SELECT`?",
			raw: 'near "SELEC": syntax error',
			line: 2,
			column: expect.any(Number)
		});
	});

	it('db usage mistakes are explained', async () => {
		const run = async (code: string) => (await runInNode(code, server())).error?.message;
		expect(await run("db.get('SELECT * FROM series WHERE id = ?', 1)")).toMatch(/square brackets/);
		expect(await run("db.get('SELECT * FROM series WHERE id = ?', [])")).toMatch(
			/has 1 `\?` placeholder, but 0 values were given/
		);
		expect(await run("db.get('SELECT * FROM series', [1])")).toMatch(/has no `\?`/);
		expect(await run("db.get('SELECT * FROM series WHERE id = ?', [undefined])")).toMatch(
			/is `undefined`/
		);
		expect(await run('db.all()')).toMatch(/needs an SQL statement in quotes/);
		expect(await run("db.al('SELECT 1')")).toBe(
			"`db.al` isn't a database command. Did you mean `db.all()`?"
		);
		expect(await run("app.gte('/x', () => {})")).toBe(
			"`app.gte` isn't something `app` can do. Did you mean `app.get()`?"
		);
		expect(await run("print('hi')")).toMatch(/Did you mean `log\(\)`\?/);
	});

	it('res typos inside handlers become a 500 with a helpful log line', async () => {
		const r = await runInNode(
			"app.get('/x', (req, res) => res.status(404).jsn({}))",
			server({ requests: [{ method: 'GET', path: '/x' }] })
		);
		expect(of(r, 'log')[0].text).toBe('Error in GET /x: res.status(...).jsn is not a function');
	});

	it('several statements in one string all run (that is how injection does damage)', async () => {
		const r = await runInNode(
			`app.get('/c', (req, res) => {
  res.json(db.all("SELECT * FROM comments WHERE author = '" + req.query.name + "'"))
})`,
			server({
				requests: [{ method: 'GET', path: "/c?name=x'; DELETE FROM comments; --" }]
			})
		);
		expect(r.web!.responses[0]).toMatchObject({ status: 200, body: [] });
		expect(of(r, 'query').map((q) => q.sql)).toEqual([
			"SELECT * FROM comments WHERE author = 'x'",
			'DELETE FROM comments'
		]);
		expect(r.web!.tables.comments.rows).toEqual([]);
	});

	it('serverCode registers routes before the learner code; env is available', async () => {
		const spec = server({
			serverCode:
				"app.get('/series', (req, res) => res.json(db.all('SELECT title FROM series')))\ndb.run(\"INSERT INTO series (title) VALUES ('Setup')\")",
			env: { GREETING: 'hi' },
			requests: [
				{ method: 'GET', path: '/series' },
				{ method: 'GET', path: '/hello' }
			]
		});
		const r = await runInNode("app.get('/hello', (req, res) => res.json(env.GREETING))", spec);
		expect(r.web!.responses.map((x) => x.status)).toEqual([200, 200]);
		expect((r.web!.responses[0].body as unknown[]).length).toBe(4);
		expect(r.web!.responses[1].body).toBe('hi');
		// setup queries are silent
		expect(r.trace[0].t).toBe('request');
		expect(r.web!.queryCount).toBe(1);
	});

	it('a broken serverCode or schema is a level setup error', async () => {
		let r = await runInNode('', server({ serverCode: 'nope()' }));
		expect(r.error?.message).toBe(SPEC_ERROR_MESSAGE);
		expect(r.error?.raw).toMatch(/serverCode failed: nope is not defined/);
		r = await runInNode('', server({ schema: 'CREATE TABLE (' }));
		expect(r.error?.message).toBe(SPEC_ERROR_MESSAGE);
		expect(r.web).toEqual({ responses: [], tables: {}, screen: [], queryCount: 0 });
		r = await runInNode('', server({ requests: [{ method: 'GET', path: 'x' }] }));
		expect(r.error?.raw).toMatch(/requests\[0\]\.path/);
	});

	it('serverDown: every request fails with status 0', async () => {
		const r = await runInNode(
			"app.get('/x', (req, res) => res.json(1))",
			server({ serverDown: true, requests: [{ method: 'GET', path: '/x' }] })
		);
		expect(r.web!.responses[0]).toEqual({
			id: 0,
			method: 'GET',
			path: '/x',
			status: 0,
			body: { error: 'Could not reach the server' },
			route: null
		});
		expect(kinds(r)).toEqual(['request', 'response', 'screen']);
		expect(r.web!.screen).toEqual([
			{ kind: 'error', status: 0, text: 'Could not reach the server' }
		]);
	});

	it('an endless loop in a handler hits the step cap', async () => {
		const r = await runInNode(
			"app.get('/x', (req, res) => { while (true) { log('again') } })",
			server({ requests: [{ method: 'GET', path: '/x' }] })
		);
		expect(r.ok).toBe(false);
		expect(r.error?.message).toMatch(/more than 500 things/);
		expect(r.trace.at(-1)).toEqual({ t: 'stopped', reason: 'max-steps' });
	});

	it('a handler that never ends times out inside the time limit', async () => {
		const r = await runInNode(
			"app.get('/x', (req, res) => { while (true) {} })",
			server({ requests: [{ method: 'GET', path: '/x' }] }),
			{ timeoutMs: 200 }
		);
		expect(r.timedOut).toBe(true);
		expect(r.web).toEqual({ responses: [], tables: {}, screen: [], queryCount: 0 });
	});

	it('tables snapshot: every table in creation order, at most 25 rows', async () => {
		const many = Array.from({ length: 30 }, (_, i) => `('t${i}')`).join(',');
		const r = await runInNode(`db.run("INSERT INTO series (title) VALUES ${many}")`, server());
		expect(Object.keys(r.web!.tables)).toEqual([
			'series',
			'episodes',
			'comments',
			'users',
			'sessions'
		]);
		expect(r.web!.tables.series.rows).toHaveLength(25);
		expect(r.web!.tables.series.columns).toEqual(['id', 'title', 'genre', 'author']);
		expect(r.web!.tables.users).toEqual({
			columns: ['id', 'name', 'password_hash'],
			rows: []
		});
	});

	it('verification SQL runs after the requests', async () => {
		const r = await runInNode(
			"app.post('/c', (req, res) => res.json(db.run(\"INSERT INTO comments (episode_id, author, text) VALUES (1, 'a', 'b')\")))",
			server({ requests: [{ method: 'POST', path: '/c' }] }),
			{ verifySql: ['SELECT COUNT(*) AS n FROM comments', 'SELECT * FROM nope'] }
		);
		expect(r.web!.verification).toEqual([
			{ columns: ['n'], rows: [{ n: 3 }] },
			{ columns: [], rows: [], error: 'no such table: nope' }
		]);
		// results survive structured cloning (postMessage)
		expect(structuredClone(r)).toEqual(r);
	});
});

describe('web world: client role', () => {
	const serverCode = `
app.get('/series', (req, res) => res.json(db.all('SELECT id, title FROM series ORDER BY id')))
app.get('/series/:id', (req, res) => {
  const s = db.get('SELECT id, title FROM series WHERE id = ?', [req.params.id])
  if (!s) return res.status(404).json({ error: 'No such series' })
  res.json(s)
})
app.post('/comments', (req, res) => {
  const info = db.run('INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)', [req.body.episodeId, req.body.author, req.body.text])
  res.status(201).json({ id: info.lastId })
})
app.get('/me', (req, res) => res.json({ token: req.headers.token ?? null }))
`;
	const client = (extra: Partial<WebWorldSpec> = {}): WebWorldSpec => ({
		kind: 'web',
		role: 'client',
		schema: INKWELL_SCHEMA,
		serverCode,
		...extra
	});

	it('get/post return Response objects and show() fills the screen', async () => {
		const r = await runInNode(
			`const list = get('/series')
show(list.status + ' ' + list.ok)
show(list.json()[0])
const missing = get('/series/9')
show(missing.body.error)
log(missing.ok, missing.text())
const made = post('/comments', { episodeId: 1, author: 'me', text: 'hi' })
show(made.body)
show(42)
show(get('/me', { headers: { Token: 'abc' } }).body)`,
			client()
		);
		expect(r.error).toBeUndefined();
		expect(r.web!.screen).toEqual([
			{ kind: 'text', text: '200 true' },
			{ kind: 'json', value: { id: 1, title: 'Moonlit Deliveries' } },
			{ kind: 'text', text: 'No such series' },
			{ kind: 'json', value: { id: 3 } },
			{ kind: 'json', value: 42 },
			{ kind: 'json', value: { token: 'abc' } }
		]);
		expect(r.web!.responses.map((x) => [x.id, x.method, x.status])).toEqual([
			[0, 'GET', 200],
			[1, 'GET', 404],
			[2, 'POST', 201],
			[3, 'GET', 200]
		]);
		expect(of(r, 'log')).toEqual([
			{ t: 'log', where: 'client', text: 'false {"error":"No such series"}' }
		]);
		expect(kinds(r).slice(0, 6)).toEqual([
			'request',
			'route',
			'query',
			'response',
			'screen',
			'screen'
		]);
		expect(r.web!.tables.comments.rows).toHaveLength(3);
	});

	it('the learner can change the body without changing the recorded response', async () => {
		const r = await runInNode(
			"const res = get('/series')\nres.body.length = 0\nshow(res.body)",
			client()
		);
		expect((r.web!.responses[0].body as unknown[]).length).toBe(3);
		expect(r.web!.screen[0]).toEqual({ kind: 'json', value: [] });
	});

	it('explains wrong paths and wrong names', async () => {
		const run = async (code: string) => (await runInNode(code, client())).error?.message;
		expect(await run("get('series')")).toBe(
			"`get()` needs a path in quotes that starts with `/`, like `get('/episodes')`."
		);
		expect(await run("get('https://inkwell.app/series')")).toMatch(/only needs the path/);
		expect(await run("fetch('/series')")).toMatch(/Did you mean `get\(\)`\?/);
		expect(await run("const res = get('/series')\nres.jsno()")).toBe(
			"`res.jsno` isn't something a response can do. Did you mean `res.json()`?"
		);
		expect(await run("get('/series').then((r) => show(r))")).toMatch(
			/no `\.then\(\)` or `await` needed/
		);
	});

	it('the screen holds at most 50 items', async () => {
		const r = await runInNode('for (let i = 0; i < 60; i++) show(i)', client());
		expect(r.ok).toBe(false);
		expect(r.error?.message).toMatch(/The phone screen is full/);
		expect(r.web!.screen).toHaveLength(50);
	});

	it('serverDown in a client lesson', async () => {
		const r = await runInNode(
			"const res = get('/series')\nshow(res.status)",
			client({ serverDown: true })
		);
		expect(r.web!.screen).toEqual([
			{ kind: 'error', status: 0, text: 'Could not reach the server' },
			{ kind: 'json', value: 0 }
		]);
	});
});

describe('web world: sql role', () => {
	const sql = (extra: Partial<WebWorldSpec> = {}): WebWorldSpec => ({
		kind: 'web',
		role: 'sql',
		schema: INKWELL_SCHEMA,
		...extra
	});

	it('runs every statement; the last one that returns columns is the result', async () => {
		const r = await runInNode(
			`-- a comment; with a semicolon
INSERT INTO comments (episode_id, author, text) VALUES (1, 'Mina', 'semi; colon');
SELECT author, text FROM comments WHERE text LIKE '%;%';
UPDATE episodes SET likes = likes + 1;`,
			sql()
		);
		expect(r.error).toBeUndefined();
		expect(r.web!.sqlResult).toEqual({
			columns: ['author', 'text'],
			rows: [{ author: 'Mina', text: 'semi; colon' }]
		});
		expect(of(r, 'query').map((q) => [q.rows, q.changes])).toEqual([
			[undefined, 1],
			[1, undefined],
			[undefined, 4]
		]);
		expect(r.web!.queryCount).toBe(3);
		expect(r.trace.every((e) => e.t === 'query')).toBe(true);
	});

	it('an empty result still has its columns', async () => {
		const r = await runInNode("SELECT title FROM series WHERE genre = 'horror'", sql());
		expect(r.web!.sqlResult).toEqual({ columns: ['title'], rows: [] });
	});

	it('errors are friendly and point at the statement line', async () => {
		let r = await runInNode('SELECT * FROM series;\n\nselec title\nFROM series;', sql());
		expect(r.ok).toBe(false);
		expect(r.error).toEqual({
			message: "SQLite didn't understand `selec`. Did you mean `SELECT`?",
			raw: 'near "selec": syntax error',
			line: 3
		});
		// the statement before the error still ran
		expect(r.web!.sqlResult?.rows).toHaveLength(3);
		r = await runInNode('SELECT * FROM episode', sql());
		expect(r.error?.message).toBe(
			"There's no table called `episode`. Did you mean `episodes`? The tables are `series`, `episodes`, `comments`, `users` and `sessions`."
		);
		r = await runInNode('SELECT titel FROM series', sql());
		expect(r.error?.message).toMatch(/^There's no column called `titel`\. Did you mean `title`\?/);
		r = await runInNode("SELECT * FROM series WHERE title = 'Moon", sql());
		expect(r.error?.message).toMatch(/missing its closing quote/);
		r = await runInNode('   \n-- nothing here\n', sql());
		expect(r.error?.message).toMatch(/There's no SQL to run yet/);
	});

	it('can fire requests at serverCode after the SQL ran', async () => {
		const r = await runInNode(
			"INSERT INTO series (title) VALUES ('New one');",
			sql({
				serverCode:
					"app.get('/series', (req, res) => res.json(db.all('SELECT title FROM series')))",
				requests: [{ method: 'GET', path: '/series' }]
			})
		);
		expect((r.web!.responses[0].body as unknown[]).at(-1)).toEqual({ title: 'New one' });
		expect(kinds(r)).toEqual(['query', 'request', 'route', 'query', 'response', 'screen']);
	});
});

describe('web world: plumbing', () => {
	it('without sql.js the run fails with a friendly message', () => {
		const r = runProgram('', { kind: 'web', role: 'sql' }, functionExecutor);
		expect(r.error?.message).toBe(DB_LOAD_MESSAGE);
		expect(r.web).toEqual({ responses: [], tables: {}, screen: [], queryCount: 0 });
	});

	it('runProgramInNode reuses the loaded sql.js', () => {
		const r = runProgramInNode('SELECT 1 AS one', { kind: 'web', role: 'sql' });
		expect(r.web!.sqlResult).toEqual({ columns: ['one'], rows: [{ one: 1 }] });
	});

	it('createWebWorld can be driven directly', () => {
		const w = createWebWorld(
			{ kind: 'web', role: 'server', serverCode: "app.get('/', (req, res) => res.send('home'))" },
			{ SQL }
		);
		expect(w.dispatch({ method: 'GET', path: '/' }, 7)).toMatchObject({
			id: 7,
			status: 200,
			body: 'home'
		});
		expect(w.finish().web?.responses).toHaveLength(1);
	});
});
