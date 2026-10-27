import { describe, expect, it } from 'vitest';
import type { Check, CodeLesson, WebWorldSpec } from '#lib/curriculum/types.ts';
import { evaluate, gluedQuery, jsonDiff, rowsDiff, verifySqlFor } from './evaluate.ts';
import { runInNode } from './node.ts';
import { INKWELL_TEST_SCHEMA } from './worlds/web.fixtures.ts';

function lesson(world: WebWorldSpec, checks: Check[]): CodeLesson {
	return {
		id: 'm/l',
		slug: 'l',
		title: 'T',
		kind: 'code',
		xp: 10,
		story: '',
		task: '',
		hints: [],
		world,
		language: world.role === 'sql' ? 'sql' : 'js',
		starterCode: '',
		solution: '',
		checks
	};
}

/** Runs like the UI does: verifySql comes from the lesson's db-rows checks. */
async function check(code: string, world: WebWorldSpec, checks: Check[]) {
	const r = await runInNode(code, world, { verifySql: verifySqlFor(checks) });
	return evaluate(lesson(world, checks), r, code);
}

const server = (
	requests: WebWorldSpec['requests'],
	extra: Partial<WebWorldSpec> = {}
): WebWorldSpec => ({
	kind: 'web',
	role: 'server',
	schema: INKWELL_TEST_SCHEMA,
	requests,
	...extra
});
const sql: WebWorldSpec = { kind: 'web', role: 'sql', schema: INKWELL_TEST_SCHEMA };

const EPISODE_ROUTE = `app.get('/episodes/:id', (req, res) => {
  const ep = db.get('SELECT id, title, likes FROM episodes WHERE id = ?', [req.params.id])
  if (!ep) return res.status(404).json({ error: 'No such episode' })
  res.json(ep)
})`;

describe('evaluate: web responses', () => {
	const world = server([
		{ method: 'GET', path: '/episodes/2' },
		{ method: 'GET', path: '/episodes/99' }
	]);

	it('response-status', async () => {
		const checks: Check[] = [
			{ type: 'response-status', request: 0, status: 200 },
			{ type: 'response-status', request: 1, status: 404 }
		];
		expect((await check(EPISODE_ROUTE, world, checks)).passed).toBe(true);
		const res = await check('', world, [checks[0]]);
		expect(res.failures).toEqual([
			'`GET /episodes/2` should get the status `200`, but it got `404`. No endpoint matched it, so the server answered 404 (not found).'
		]);
		const boom = await check(
			"app.get('/episodes/:id', (req, res) => res.json(db.all('SELECT * FROM episode')))",
			world,
			[checks[0]]
		);
		expect(boom.failures[0]).toMatch(
			/should get the status `200`, but it got `500`\. The server log says: "Error in GET \/episodes\/2: There's no table called `episode`/
		);
		const missing = await check(EPISODE_ROUTE, world, [
			{ type: 'response-status', request: 5, status: 200 }
		]);
		expect(missing.failures[0]).toMatch(/Only 2 requests were sent/);
	});

	it('response-json: equal, subset and readable differences', async () => {
		const equal: Check = {
			type: 'response-json',
			request: 0,
			expected: { id: 2, title: 'Rain on the roofs', likes: 30 }
		};
		expect((await check(EPISODE_ROUTE, world, [equal])).passed).toBe(true);
		const subset: Check = {
			type: 'response-json',
			request: 0,
			expected: { id: 2 },
			mode: 'subset'
		};
		expect((await check(EPISODE_ROUTE, world, [subset])).passed).toBe(true);
		expect((await check(EPISODE_ROUTE, world, [{ ...subset, mode: 'equal' }])).failures).toEqual([
			"The answer to `GET /episodes/2` has `body.title`, which shouldn't be there."
		]);
		const stringId = await check(
			"app.get('/episodes/:id', (req, res) => res.json({ id: req.params.id }))",
			world,
			[subset]
		);
		expect(stringId.failures[0]).toBe(
			'In the answer to `GET /episodes/2`, `body.id` should be `2`, but it is `"2"`. One is a number and the other is text. Check for quotes, and remember that `req.params` and `req.query` values are always text.'
		);
		const notFound = await check('', world, [subset]);
		expect(notFound.failures[0]).toMatch(
			/^`body\.id` is missing from the answer to `GET \/episodes\/2`\. It should be `2`\. \(It got the status 404\./
		);
	});

	it('jsonDiff', () => {
		expect(jsonDiff([{ a: 1 }], [{ a: 1, b: 2 }], true)).toBeNull();
		expect(jsonDiff([{ a: 1 }], [{ a: 1 }, { a: 2 }], true)).toEqual({
			why: 'length',
			path: '',
			expected: 1,
			actual: 2
		});
		expect(jsonDiff({ a: { b: [1, 2] } }, { a: { b: [1, 3] } })).toEqual({
			why: 'value',
			path: '.a.b[1]',
			expected: 2,
			actual: 3
		});
	});

	it('response-includes and all-responses-ok', async () => {
		expect(
			(
				await check(EPISODE_ROUTE, world, [
					{ type: 'response-includes', request: 0, text: 'roofs' },
					{ type: 'response-includes', request: 1, text: 'No such episode' }
				])
			).passed
		).toBe(true);
		const res = await check(EPISODE_ROUTE, world, [{ type: 'all-responses-ok' }]);
		expect(res.failures).toEqual([
			'`GET /episodes/99` got the status `404`. Every request should get an answer in the 200s.'
		]);
		const ok = await check(EPISODE_ROUTE, server([{ method: 'GET', path: '/episodes/1' }]), [
			{ type: 'all-responses-ok' }
		]);
		expect(ok.passed).toBe(true);
	});
});

describe('evaluate: database checks', () => {
	const post = server([
		{ method: 'POST', path: '/comments', body: { episodeId: 1, author: 'Mina', text: 'So good' } }
	]);
	const SOLUTION = `app.post('/comments', (req, res) => {
  const { episodeId, author, text } = req.body
  const info = db.run('INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)', [episodeId, author, text])
  res.status(201).json({ id: info.lastId })
})`;
	const dbRows: Check[] = [
		{
			type: 'db-rows',
			sql: 'SELECT author, text FROM comments WHERE episode_id = 1',
			expected: [
				{ text: 'Lovely', author: 'reader1' },
				{ author: 'Mina', text: 'So good' }
			]
		},
		{ type: 'db-rows', sql: 'SELECT COUNT(*) AS n FROM comments', expected: [{ n: '3' }] }
	];

	it('verifySqlFor collects the db-rows SQL in order', () => {
		expect(verifySqlFor(dbRows)).toEqual([
			'SELECT author, text FROM comments WHERE episode_id = 1',
			'SELECT COUNT(*) AS n FROM comments'
		]);
	});

	it('db-rows compares rows after the run (loose values, key order ignored)', async () => {
		expect(await check(SOLUTION, post, dbRows)).toEqual({ passed: true, failures: [] });
		const res = await check(
			"app.post('/comments', (req, res) => res.status(201).json({}))",
			post,
			dbRows
		);
		expect(res.failures).toEqual([
			"The data in the database isn't right yet: there should be 2 rows, but there is 1 row.",
			'The data in the database isn\'t right yet: row 1 should be `{"n":"3"}`, but it is `{"n":2}`.'
		]);
	});

	it('db-rows without verification results says it is our fault', async () => {
		const r = await runInNode(SOLUTION, post);
		const res = evaluate(lesson(post, dbRows), r, SOLUTION);
		expect(res.failures[0]).toMatch(/our mistake/);
	});

	it('queries-parameterized: positive and negative', async () => {
		const checks: Check[] = [{ type: 'queries-parameterized' }];
		expect((await check(SOLUTION, post, checks)).passed).toBe(true);
		const glued = `app.post('/comments', (req, res) => {
  db.run("INSERT INTO comments (episode_id, author, text) VALUES (1, '" + req.body.author + "', '" + req.body.text + "')")
  res.status(201).json({})
})`;
		const res = await check(glued, post, checks);
		expect(res.failures[0]).toMatch(
			/^A query has a value from the request glued right into the SQL: `INSERT INTO comments .*'Mina'.*`\. Put a `\?` in the SQL/
		);
		// numbers from path params count too, in queries without parameters
		const byId = server([{ method: 'GET', path: '/episodes/2' }]);
		const gluedId =
			"app.get('/episodes/:id', (req, res) => res.json(db.get('SELECT * FROM episodes WHERE id = ' + req.params.id)))";
		expect((await check(gluedId, byId, checks)).passed).toBe(false);
		expect((await check(EPISODE_ROUTE, byId, checks)).passed).toBe(true);
		// a literal that only looks like a request value is fine when the query uses parameters
		const limit = server([{ method: 'GET', path: '/episodes?series=1&limit=2' }]);
		const ok =
			"app.get('/episodes', (req, res) => res.json(db.all('SELECT * FROM episodes WHERE series_id = ? LIMIT 2', [req.query.series])))";
		expect((await check(ok, limit, checks)).passed).toBe(true);
	});

	it('gluedQuery ignores queries without request values', () => {
		expect(gluedQuery([{ t: 'query', sql: 'SELECT 1', params: [] }])).toBeUndefined();
	});

	it('max-queries', async () => {
		const world = server([{ method: 'GET', path: '/all' }]);
		const nPlusOne = `app.get('/all', (req, res) => {
  const series = db.all('SELECT id FROM series')
  res.json(series.map((s) => db.all('SELECT title FROM episodes WHERE series_id = ?', [s.id])))
})`;
		const res = await check(nPlusOne, world, [{ type: 'max-queries', count: 2 }]);
		expect(res.failures).toEqual([
			'Your code ran 4 database queries. It can be done with at most 2.'
		]);
	});
});

describe('evaluate: sql role', () => {
	it('sql-result with order, anyOrder and loose values', async () => {
		const code = 'SELECT title, likes FROM episodes WHERE series_id = 1 ORDER BY likes DESC;';
		const expected = [
			{ title: 'Rain on the roofs', likes: 30 },
			{ likes: '12', title: 'The first night' }
		];
		expect((await check(code, sql, [{ type: 'sql-result', expected }])).passed).toBe(true);
		const reversed = [...expected].reverse();
		expect((await check(code, sql, [{ type: 'sql-result', expected: reversed }])).failures).toEqual(
			[
				'Your result isn\'t quite right yet: row 1 should be `{"likes":"12","title":"The first night"}`, but it is `{"title":"Rain on the roofs","likes":30}`.'
			]
		);
		expect(
			(await check(code, sql, [{ type: 'sql-result', expected: reversed, anyOrder: true }])).passed
		).toBe(true);
		const star = await check('SELECT * FROM episodes WHERE series_id = 1', sql, [
			{ type: 'sql-result', expected }
		]);
		expect(star.failures[0]).toMatch(
			/the columns aren't right: `id`, `number`, `published`, `series_id` shouldn't be there/
		);
		const empty = await check('SELECT title, likes FROM episodes WHERE series_id = 7', sql, [
			{ type: 'sql-result', expected }
		]);
		expect(empty.failures[0]).toBe(
			'Your result is empty: no rows matched. Check the `WHERE` part.'
		);
		const none = await check('UPDATE episodes SET likes = 0', sql, [
			{ type: 'sql-result', expected }
		]);
		expect(none.failures[0]).toMatch(/didn't give back any rows/);
	});

	it('sql-columns and sql-row-count', async () => {
		const code = 'SELECT title AS Title, genre FROM series';
		expect(
			(
				await check(code, sql, [
					{ type: 'sql-columns', columns: ['genre', 'title'] },
					{ type: 'sql-row-count', min: 3, max: 3 }
				])
			).passed
		).toBe(true);
		const res = await check(code, sql, [
			{ type: 'sql-columns', columns: ['title'] },
			{ type: 'sql-row-count', max: 2 }
		]);
		expect(res.failures).toEqual([
			'Your result has the columns `Title`, `genre`, but it should have `title`.',
			'Your result has 3 rows. It should have at most 2.'
		]);
	});

	it('a failed SQL run reports the friendly error', async () => {
		const res = await check('SELECT * FORM series', sql, [{ type: 'sql-row-count', min: 1 }]);
		expect(res).toEqual({
			passed: false,
			failures: ["SQLite didn't understand `FORM`. Did you mean `FROM`?"]
		});
	});

	it('rowsDiff', () => {
		expect(rowsDiff([{ a: null }], [{ a: null }])).toBeNull();
		expect(rowsDiff([{ a: 1 }], [{ a: 1 }, { a: 2 }])).toBe(
			'there should be 1 row, but there are 2 rows.'
		);
	});
});

describe('evaluate: client role', () => {
	const client: WebWorldSpec = {
		kind: 'web',
		role: 'client',
		schema: INKWELL_TEST_SCHEMA,
		serverCode: "app.get('/series', (req, res) => res.json(db.all('SELECT title FROM series')))"
	};

	it('screen-includes and log-includes', async () => {
		const checks: Check[] = [
			{ type: 'screen-includes', text: 'Grove & Gear' },
			{ type: 'log-includes', text: 'loaded 3' }
		];
		const code = "const res = get('/series')\nshow(res.body)\nlog('loaded', res.body.length)";
		expect((await check(code, client, checks)).passed).toBe(true);
		const res = await check("get('/series')", client, checks);
		expect(res.failures).toEqual([
			'Nothing is on the phone screen yet. Use `show(…)` to put something there.',
			'Nothing was written to the log. Use `log(…)` to write a line.'
		]);
		const errorScreen = await check("show('oops')", { ...client, serverDown: true }, [
			{ type: 'screen-includes', text: 'Grove' }
		]);
		expect(errorScreen.failures[0]).toBe(
			"The phone screen should show `Grove`, but it doesn't yet."
		);
	});

	it('response checks index the calls the client made', async () => {
		const res = await check("get('/nope')\nget('/series')", client, [
			{ type: 'response-status', request: 1, status: 200 },
			{ type: 'response-status', request: 0, status: 200 }
		]);
		expect(res.failures).toEqual([
			'`GET /nope` should get the status `200`, but it got `404`. No endpoint matched it, so the server answered 404 (not found).'
		]);
	});

	it('points out client commands written without brackets', async () => {
		const res = await check('const s = get\nshow', client, [
			{ type: 'screen-includes', text: 'x' }
		]);
		expect(res.failures.slice(0, 2)).toEqual([
			"`get` needs round brackets to work: `get()`. Without them JavaScript only looks at the name and doesn't run it.",
			"`show` needs round brackets to work: `show()`. Without them JavaScript only looks at the name and doesn't run it."
		]);
	});
});

describe('evaluate: security checks', () => {
	const evilSchema =
		INKWELL_TEST_SCHEMA +
		"INSERT INTO comments (episode_id, author, text) VALUES (3, 'eve', '<script>steal()</script>');";
	const world = server([{ method: 'GET', path: '/comments' }], {
		schema: evilSchema,
		renderHtml: true
	});
	const comments = (out: string) => `app.get('/comments', (req, res) => {
  const rows = db.all('SELECT author, text FROM comments WHERE episode_id = 3')
  res.json(rows.map((c) => ({ author: c.author, text: ${out} })))
})`;
	const xssChecks: Check[] = [
		{ type: 'screen-no-script' },
		{ type: 'response-no-script', request: 0 }
	];

	it('screen-no-script and response-no-script fail when the script reaches the phone', async () => {
		const res = await check(comments('c.text'), world, xssChecks);
		expect(res.passed).toBe(false);
		expect(res.failures).toEqual([
			"A script ran on the reader's phone: the screen got text with a `<script>` tag in it, and the phone ran it instead of showing it. Escape text before it goes out, like `escape(comment.text)`, so `<` becomes `&lt;` and the tag is shown as plain text.",
			'The answer to `GET /comments` still has a raw `<script` tag in it, so a phone that shows it would run it. Escape the text with `escape(…)` before sending it.'
		]);
	});

	it('pass once the output is escaped', async () => {
		const res = await check(comments('escape(c.text)'), world, [
			...xssChecks,
			{ type: 'screen-includes', text: '&lt;script&gt;' }
		]);
		expect(res.failures).toEqual([]);
	});

	it('response-no-script without that request', async () => {
		const res = await check('', world, [{ type: 'response-no-script', request: 1 }]);
		expect(res.failures[0]).toContain('no answer');
	});

	it('screen-includes searches html items too', async () => {
		const res = await check(comments('c.text'), world, [
			{ type: 'screen-includes', text: 'steal()' },
			{ type: 'screen-includes', text: 'eve' }
		]);
		expect(res.failures).toEqual([]);
	});

	it('log-excludes', async () => {
		const login = server([{ method: 'POST', path: '/login', body: { password: 'mina-pass' } }]);
		const checks: Check[] = [{ type: 'log-excludes', text: 'mina-pass' }];
		const leaky = await check(
			"app.post('/login', (req, res) => {\n  log('login attempt', req.body)\n  res.json({ ok: true })\n})",
			login,
			checks
		);
		expect(leaky.failures).toEqual([
			'The server log contains `mina-pass`. Secrets and passwords must never be logged.'
		]);
		const careful = await check(
			"app.post('/login', (req, res) => {\n  log('login attempt')\n  res.json({ ok: true })\n})",
			login,
			checks
		);
		expect(careful.passed).toBe(true);
		const custom = await check("log('mina-pass')", login, [
			{ type: 'log-excludes', text: 'mina-pass', message: 'Keep it secret.' }
		]);
		expect(custom.failures).toEqual(['Keep it secret.']);
	});

	it('points out hashMatches without brackets, but not an object key', async () => {
		const code = `app.post('/login', (req, res) => {
  if (hashMatches) res.status(401).json({ hash: 1, escape: 2 })
})`;
		const res = await check(code, server([{ method: 'POST', path: '/login' }]), [
			{ type: 'all-responses-ok' }
		]);
		expect(res.failures[0]).toBe(
			"`hashMatches` needs round brackets to work: `hashMatches()`. Without them JavaScript only looks at the name and doesn't run it."
		);
		expect(res.failures).toHaveLength(2);
	});
});
