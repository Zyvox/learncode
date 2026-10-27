import type { Module, SimRequest, WebWorldSpec } from '#lib/curriculum/types.ts';
import { INKWELL_AT } from '#lib/curriculum/inkwell.ts';

const M = 'launch-inkwell';

/**
 * Inkwell as the test readers left it (the 'live' stage: last week's comments and likes, Mina and
 * Ravi logged in), plus Mina's next episode in progress. As usual she calls it Sketches until
 * it's done, so the published-only rules have something to hide.
 */
const LAUNCH_SCHEMA =
	INKWELL_AT('live') +
	"\nINSERT INTO episodes (id, series_id, number, title, published, likes) VALUES (9, 1, 5, 'Sketches', 0, 0);\n";

const MINA = { token: 'tok_mina_123' };
const RAVI = { token: 'tok_ravi_456' };

function world(requests: SimRequest[], extra: Partial<WebWorldSpec> = {}): WebWorldSpec {
	return { kind: 'web', role: 'server', schema: LAUNCH_SCHEMA, requests, ...extra };
}

// ---- The program, one checkpoint at a time. Each level's starter is the previous solution. ----

const HEADER = `// Inkwell API: the launch build

// From "Who are you?": who is asking? Gives back { id, name } or undefined.
function currentUser(req) {
  const token = req.headers.token;
  if (!token) return undefined;
  return db.get(
    'SELECT users.id, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?',
    [token]
  );
}
`;

/** Checkpoint 1: the plain front page. */
const FRONT_PAGE = `
app.get('/series', (req, res) => {
  res.json(db.all('SELECT id, title, genre FROM series ORDER BY title'));
});
`;

/** The SQL that counts each series' published episodes (handed over in checkpoint 2). */
const COUNT_SQL = `    'SELECT series.id, series.title, series.genre, COUNT(episodes.id) AS episodes ' +
    'FROM series JOIN episodes ON episodes.series_id = series.id ' +
    'WHERE episodes.published = 1 ' +
    'GROUP BY series.id ORDER BY series.title'`;

/** Checkpoint 2: the front page with episode counts. */
const SERIES_LIST = `
app.get('/series', (req, res) => {
  res.json(db.all(
${COUNT_SQL}
  ));
});
`;

const EPISODE_PAGE = `
app.get('/episodes/:id', (req, res) => {
  const ep = db.get(
    'SELECT episodes.id, episodes.number, episodes.title, episodes.likes, series.title AS series ' +
    'FROM episodes JOIN series ON series.id = episodes.series_id ' +
    'WHERE episodes.id = ? AND episodes.published = 1',
    [req.params.id]
  );
  if (!ep) {
    res.status(404).json({ error: 'No such episode' });
  } else {
    res.json(ep);
  }
});
`;

const COMMENTS = `
app.get('/episodes/:id/comments', (req, res) => {
  res.json(db.all(
    'SELECT id, author, text, created_at FROM comments WHERE episode_id = ? ORDER BY id',
    [req.params.id]
  ));
});

app.post('/episodes/:id/comments', (req, res) => {
  const user = currentUser(req);
  const text = req.body.text;
  if (!user) {
    res.status(401).json({ error: 'Please log in to comment' });
  } else if (!text) {
    res.status(400).json({ error: 'A comment needs some text' });
  } else {
    const r = db.run(
      'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)',
      [req.params.id, user.name, text]
    );
    res.status(201).json({ id: r.lastId, author: user.name, text: text });
  }
});
`;

const LIKES = `
app.put('/episodes/:id/like', (req, res) => {
  const r = db.run(
    'UPDATE episodes SET likes = likes + 1 WHERE id = ? AND published = 1',
    [req.params.id]
  );
  if (r.changes === 0) {
    res.status(404).json({ error: 'No such episode' });
  } else {
    res.json(db.get('SELECT id, likes FROM episodes WHERE id = ?', [req.params.id]));
  }
});
`;

const SEARCH = `
app.get('/search', (req, res) => {
  const q = req.query.q;
  if (!q) {
    res.status(400).json({ error: 'Type something to search for' });
  } else {
    res.json(db.all(
      'SELECT id, title FROM episodes WHERE title LIKE ? AND published = 1 ORDER BY id',
      ['%' + q + '%']
    ));
  }
});
`;

const LAUNCH_DAY = `
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: env.APP_NAME });
});

app.get('/series/:id/episodes', (req, res) => {
  res.json(db.all(
    'SELECT id, number, title, likes FROM episodes WHERE series_id = ? AND published = 1 ORDER BY number',
    [req.params.id]
  ));
});
`;

const CHECKPOINT = [
	HEADER,
	HEADER + FRONT_PAGE,
	HEADER + SERIES_LIST + EPISODE_PAGE,
	HEADER + SERIES_LIST + EPISODE_PAGE + COMMENTS,
	HEADER + SERIES_LIST + EPISODE_PAGE + COMMENTS + LIKES,
	HEADER + SERIES_LIST + EPISODE_PAGE + COMMENTS + LIKES + SEARCH,
	HEADER + SERIES_LIST + EPISODE_PAGE + COMMENTS + LIKES + SEARCH + LAUNCH_DAY
];

/** Where the next endpoint goes, so the starter says what to do. */
const next = (code: string, todo: string) => `${code}\n// ${todo}\n`;

export const launchInkwell: Module = {
	id: M,
	track: 'web',
	order: 13,
	emoji: '🚀',
	title: 'Launch Inkwell',
	blurb:
		'Build the whole Inkwell API, one checkpoint at a time, and open the doors to real readers on launch day.',
	prereq: 'Builds on everything in this track so far, especially modules 8–11.',
	lessons: [
		{
			id: `${M}/01-series-list`,
			slug: '01-series-list',
			kind: 'code',
			title: 'Checkpoint 1: the front page',
			xp: 20,
			story:
				'Launch is Monday. Theo has cleared a wall for the plan, and you’re building the launch version of the Inkwell API in one clean file, each checkpoint starting where the last one finished. The test readers’ comments and likes from last week are all in the database, and they’re coming with you. First up: the front page, the list of series.',
			task: 'Write `GET /series`: every series with its `id`, `title` and `genre`, ordered by title. One `db.all` is enough. The clever bits come later.',
			concept: {
				title: 'The launch plan',
				panels: [
					{
						who: 'theo',
						text: 'Monday, real readers: front page, episode pages, comments, likes, search. Can we do it?',
						scene: 'none'
					},
					{
						who: 'you',
						text: 'Every piece is something we’ve already built once. This time it all goes into one program.',
						scene: 'server'
					},
					{
						who: 'mina',
						text: 'And comments work? With real names nobody can borrow?',
						scene: 'lock'
					},
					{
						who: 'you',
						text: 'That’s why `currentUser` is already at the top. Checkpoint 3.',
						scene: 'server'
					},
					{
						who: 'bit',
						text: 'Five checkpoints and a launch. I’ll be doing a lot of running.',
						scene: 'wire'
					}
				]
			},
			hints: [
				'The SQL is the kind you wrote in “Where the data lives”: pick three columns `FROM series`, then `ORDER BY title`.',
				'Put it in `db.all(…)` inside the handler and send the rows with `res.json(…)`, like the very first handler in “Server meets database”.',
				"The route:\n```js\napp.get('/series', (req, res) => {\n  res.json(db.all('SELECT id, title, genre FROM series ORDER BY title'));\n});\n```"
			],
			world: world([{ method: 'GET', path: '/series', label: 'reader opens the app' }]),
			starterCode: next(CHECKPOINT[0], 'Checkpoint 1: GET /series'),
			solution: CHECKPOINT[1],
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-json',
					request: 0,
					expected: [
						{ id: 2, title: 'Grove & Gear', genre: 'fantasy' },
						{ id: 1, title: 'Moonlit Deliveries', genre: 'slice of life' },
						{ id: 3, title: 'Night Shift Noodles', genre: 'comedy' }
					],
					message:
						'The front page should list the three series with `id`, `title` and `genre`, ordered by title: Grove & Gear first.'
				}
			]
		},
		{
			id: `${M}/02-episode-page`,
			slug: '02-episode-page',
			kind: 'code',
			title: 'Checkpoint 2: counts and the episode page',
			xp: 25,
			story:
				'Theo wants every series on the front page to say how many episodes it has. Readers who tap an episode need a page for it, with the series name at the top. And Mina has started her next episode: as usual, the database calls it Sketches (episode 9) until it’s finished, and as far as readers are concerned it doesn’t exist yet.',
			task:
				'1. In `GET /series`, swap the SQL for this one. It joins the tables, keeps the published episodes, and counts them per series:\n```js\n' +
				COUNT_SQL.trim() +
				"\n```\n2. Add `GET /episodes/:id`: the episode's `id`, `number`, `title`, `likes`, and the series title as `series` (join `series`). Only published episodes. Not found, or not published: `404`.",
			hints: [
				'For the front page, replace the text inside `db.all(…)` with the four lines from the task. Nothing else in that handler changes.',
				'For the episode page, use `db.get` with a JOIN: `SELECT episodes.id, episodes.number, episodes.title, episodes.likes, series.title AS series FROM episodes JOIN series ON series.id = episodes.series_id WHERE episodes.id = ? AND episodes.published = 1`. Then the familiar `if (!ep) { 404 } else { res.json(ep) }`.',
				"The episode page:\n```js\napp.get('/episodes/:id', (req, res) => {\n  const ep = db.get(\n    'SELECT episodes.id, episodes.number, episodes.title, episodes.likes, series.title AS series ' +\n    'FROM episodes JOIN series ON series.id = episodes.series_id ' +\n    'WHERE episodes.id = ? AND episodes.published = 1',\n    [req.params.id]\n  );\n  if (!ep) {\n    res.status(404).json({ error: 'No such episode' });\n  } else {\n    res.json(ep);\n  }\n});\n```"
			],
			world: world([
				{ method: 'GET', path: '/series', label: 'reader opens the app' },
				{ method: 'GET', path: '/episodes/4', label: 'reader opens The night market' },
				{ method: 'GET', path: '/episodes/9', label: 'someone guesses the link to episode 9' },
				{ method: 'GET', path: '/episodes/99', label: 'reader follows a broken link' }
			]),
			starterCode: next(
				CHECKPOINT[1],
				'Checkpoint 2: count the episodes in GET /series, then add GET /episodes/:id'
			),
			solution: CHECKPOINT[2],
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: [
						{ id: 2, title: 'Grove & Gear', episodes: 2 },
						{ id: 1, title: 'Moonlit Deliveries', episodes: 4 },
						{ id: 3, title: 'Night Shift Noodles', episodes: 2 }
					],
					message:
						'Each series on the front page should have `episodes`: its number of **published** episodes. Moonlit Deliveries has 4: The night market counts, the new Sketches doesn’t. Use the SQL from the task.'
				},
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: {
						id: 4,
						number: 4,
						title: 'The night market',
						likes: 1,
						series: 'Moonlit Deliveries'
					},
					message:
						"The night market should come back with its number, title and likes, plus `series: 'Moonlit Deliveries'` from the joined `series` table (`series.title AS series`)."
				},
				{
					type: 'response-status',
					request: 2,
					status: 404,
					message:
						'Episode 9 exists but isn’t published. Add `AND episodes.published = 1` so it answers 404 like a missing one.'
				},
				{ type: 'response-status', request: 3, status: 404 },
				{ type: 'queries-parameterized' }
			]
		},
		{
			id: `${M}/03-comments`,
			slug: '03-comments',
			kind: 'code',
			title: 'Checkpoint 3: comments that work',
			xp: 25,
			story:
				'This is the one Mina cares about: comments under every episode, signed with the name of whoever is logged in, and no empty ones. “People will tap Send by accident. A blank comment is just sad.”',
			task: "Add two routes.\n\n**`GET /episodes/:id/comments`**: the episode's comments (`id`, `author`, `text`, `created_at`), oldest first (`ORDER BY id`).\n\n**`POST /episodes/:id/comments`**: no user → `401`. No `text` in the body (or an empty one) → `400`. Otherwise save it with `user.name` as the author and answer `201` with `{ id, author, text }`.",
			hints: [
				'The GET is one `db.all` with `WHERE episode_id = ? ORDER BY id`.',
				"For the POST: `const user = currentUser(req);` and `const text = req.body.text;`, then `if (!user) … else if (!text) … else …`. An empty text `''` counts as false, so `!text` catches it.",
				"The POST:\n```js\napp.post('/episodes/:id/comments', (req, res) => {\n  const user = currentUser(req);\n  const text = req.body.text;\n  if (!user) {\n    res.status(401).json({ error: 'Please log in to comment' });\n  } else if (!text) {\n    res.status(400).json({ error: 'A comment needs some text' });\n  } else {\n    const r = db.run('INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)', [req.params.id, user.name, text]);\n    res.status(201).json({ id: r.lastId, author: user.name, text: text });\n  }\n});\n```"
			],
			world: world([
				{ method: 'GET', path: '/episodes/1/comments', label: 'reader opens the comments' },
				{
					method: 'POST',
					path: '/episodes/1/comments',
					headers: MINA,
					body: { text: 'The cat says thank you.' },
					label: 'Mina comments on episode 1'
				},
				{
					method: 'POST',
					path: '/episodes/1/comments',
					headers: MINA,
					body: { text: '' },
					label: 'Mina taps Send by accident'
				},
				{
					method: 'POST',
					path: '/episodes/1/comments',
					body: { text: 'hello??' },
					label: 'a phone with no token comments'
				},
				{ method: 'GET', path: '/episodes/1/comments', label: 'reader reloads the comments' }
			]),
			starterCode: next(CHECKPOINT[2], 'Checkpoint 3: GET and POST /episodes/:id/comments'),
			solution: CHECKPOINT[3],
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: [
						{ author: 'ravi', text: 'That last panel. Wow.' },
						{ author: 'june_b', text: 'The cat is the real main character' }
					],
					message: 'Episode 1 starts with two comments, ravi’s then june_b’s.'
				},
				{
					type: 'response-status',
					request: 1,
					status: 201,
					message: 'Mina is logged in and wrote something: save it and answer 201.'
				},
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: { id: 9, author: 'mina', text: 'The cat says thank you.' },
					message:
						'Answer with `{ id, author, text }` for the new comment. The author comes from the session: `user.name`.'
				},
				{
					type: 'response-status',
					request: 2,
					status: 400,
					message: 'An empty comment should get 400, and not be saved.'
				},
				{
					type: 'response-status',
					request: 3,
					status: 401,
					message: 'No token, no comment: 401.'
				},
				{
					type: 'response-json',
					request: 4,
					mode: 'subset',
					expected: [{ author: 'ravi' }, { author: 'june_b' }, { author: 'mina' }],
					message: 'After all that, episode 1 should have exactly three comments, Mina’s last.'
				},
				{ type: 'queries-parameterized' }
			]
		},
		{
			id: `${M}/04-likes`,
			slug: '04-likes',
			kind: 'code',
			title: 'Checkpoint 4: the ♥ button',
			xp: 20,
			story:
				'Theo’s favourite feature. He’s already planning a “most loved episodes” banner. Likes only count on published episodes, of course: nobody gets to like Mina’s new Sketches (episode 9) before it’s finished.',
			task: 'Add `PUT /episodes/:id/like`: add one like to a **published** episode and answer with `{ id, likes }`. If nothing changed (missing or unpublished), answer `404`.',
			hints: [
				"`db.run('UPDATE episodes SET likes = likes + 1 WHERE id = ? AND published = 1', [req.params.id])` gives a receipt with `changes`.",
				"`if (r.changes === 0) { 404 } else { …answer with db.get('SELECT id, likes FROM episodes WHERE id = ?', …) }`",
				"The route:\n```js\napp.put('/episodes/:id/like', (req, res) => {\n  const r = db.run('UPDATE episodes SET likes = likes + 1 WHERE id = ? AND published = 1', [req.params.id]);\n  if (r.changes === 0) {\n    res.status(404).json({ error: 'No such episode' });\n  } else {\n    res.json(db.get('SELECT id, likes FROM episodes WHERE id = ?', [req.params.id]));\n  }\n});\n```"
			],
			world: world([
				{ method: 'PUT', path: '/episodes/7/like', label: 'reader taps ♥ on Opening night' },
				{ method: 'PUT', path: '/episodes/9/like', label: 'someone tries to ♥ Sketches early' },
				{ method: 'PUT', path: '/episodes/99/like', label: 'an old link taps ♥ on episode 99' },
				{ method: 'GET', path: '/episodes/7', label: 'reader reloads Opening night' }
			]),
			starterCode: next(CHECKPOINT[3], 'Checkpoint 4: PUT /episodes/:id/like'),
			solution: CHECKPOINT[4],
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: { id: 7, likes: 211 },
					message: 'One ♥ on episode 7 should answer exactly `{ id: 7, likes: 211 }`.'
				},
				{
					type: 'response-status',
					request: 1,
					status: 404,
					message:
						'Sketches isn’t published. Add `AND published = 1` to the UPDATE, so nothing changes and the answer is 404.'
				},
				{ type: 'response-status', request: 2, status: 404 },
				{
					type: 'response-json',
					request: 3,
					mode: 'subset',
					expected: { id: 7, likes: 211 },
					message: 'The episode page should show the new number of likes too.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT likes FROM episodes WHERE id = 9',
					expected: [{ likes: 0 }],
					message: 'Sketches should still have 0 likes.'
				}
			]
		},
		{
			id: `${M}/05-search`,
			slug: '05-search',
			kind: 'code',
			title: 'Checkpoint 5: search',
			xp: 25,
			story:
				'The last feature on Theo’s wall: a search box. A reader types a few letters and gets every episode whose title contains them. Somebody will, of course, also type something sneaky into it.',
			task: "Add `GET /search?q=…`: published episodes (`id`, `title`) whose title contains `q`, ordered by `id`. No `q` at all → `400`.\n\nFor “contains”, SQL has `LIKE`: `title LIKE '%fox%'` matches any title with fox in it (`%` means “anything here”), ignoring capital letters. Build the pattern in JavaScript and pass it as a value: `['%' + q + '%']`.",
			concept: {
				title: '`LIKE`: “contains”',
				panels: [
					{
						who: 'mina',
						text: 'If I search “fox”, I want The clockwork fox. I shouldn’t have to type the whole title.',
						scene: 'phone'
					},
					{
						who: 'you',
						text: '`=` wants an exact match. `LIKE` takes a pattern, where `%` means “anything at all here”.',
						scene: 'database',
						code: "SELECT id, title FROM episodes WHERE title LIKE '%fox%'"
					},
					{
						who: 'bit',
						text: 'The `%` signs go in the value, not glued into the SQL. The SQL just says `LIKE ?`.',
						scene: 'wire',
						code: "db.all('… WHERE title LIKE ? …', ['%' + q + '%'])"
					}
				]
			},
			hints: [
				'Start with `const q = req.query.q;` and `if (!q) { 400 } else { … }`.',
				"In the else part: `db.all('SELECT id, title FROM episodes WHERE title LIKE ? AND published = 1 ORDER BY id', ['%' + q + '%'])`, then send the rows.",
				"The route:\n```js\napp.get('/search', (req, res) => {\n  const q = req.query.q;\n  if (!q) {\n    res.status(400).json({ error: 'Type something to search for' });\n  } else {\n    res.json(db.all(\n      'SELECT id, title FROM episodes WHERE title LIKE ? AND published = 1 ORDER BY id',\n      ['%' + q + '%']\n    ));\n  }\n});\n```"
			],
			world: world([
				{ method: 'GET', path: '/search?q=fox', label: 'reader searches “fox”' },
				{ method: 'GET', path: '/search?q=the', label: 'reader searches “the”' },
				{ method: 'GET', path: '/search?q=sketch', label: 'reader searches “sketch”' },
				{ method: 'GET', path: '/search', label: 'reader taps Search with an empty box' },
				{
					method: 'GET',
					path: '/search?q=%27%20OR%201%3D1%20--',
					label: "someone searches for ' OR 1=1 --"
				}
			]),
			starterCode: next(CHECKPOINT[4], 'Checkpoint 5: GET /search?q=…'),
			solution: CHECKPOINT[5],
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: [{ id: 6, title: 'The clockwork fox' }],
					message:
						"Searching “fox” should find exactly one episode: `{ id: 6, title: 'The clockwork fox' }`."
				},
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: [
						{ title: 'The first parcel' },
						{ title: 'The locked gate' },
						{ title: 'The night market' },
						{ title: 'A seed in the gears' },
						{ title: 'The clockwork fox' }
					],
					message:
						'Searching “the” should find five episodes, in `id` order. `LIKE` ignores capitals, so “The” counts, and so does “gears” in A seed in the gears.'
				},
				{
					type: 'response-json',
					request: 2,
					expected: [],
					message:
						'Sketches isn’t published, so searching “sketch” should find nothing. Add `AND published = 1`.'
				},
				{ type: 'response-status', request: 3, status: 400 },
				{
					type: 'response-json',
					request: 4,
					expected: [],
					message:
						"The sneaky search should find nothing. If it found everything, the search text was glued into the SQL: use `LIKE ?` and pass `['%' + q + '%']`."
				},
				{ type: 'queries-parameterized' }
			]
		},
		{
			id: `${M}/06-boss-launch-day`,
			slug: '06-boss-launch-day',
			kind: 'code',
			title: 'Launch day',
			xp: 50,
			boss: true,
			story:
				'Monday, 8:59. Theo is refreshing the app store page, and Mina has made coffee for everyone and is pretending not to be nervous. Two things never made it onto the wall: the `/health` check the receptionist wants before it lets anyone in, and the series page, where a reader taps a series and sees its episodes. At 9:00 the doors open, and the readers won’t all be polite.',
			task: "Add the last two routes, then let launch day run.\n\n**`GET /health`**: `{ status: 'ok', app: env.APP_NAME }`.\n\n**`GET /series/:id/episodes`**: the series' published episodes (`id`, `number`, `title`, `likes`), in `number` order.\n\nNot every answer should be a 200. A comment with no token should still get its 401, an empty one its 400, and a guessed link to Sketches its 404. The checks look at each request on its own.",
			outro: {
				panels: [
					{
						who: 'narrator',
						scene: 'phone',
						text: '9:00. Then 9:01. The front page loads, The night market gets its second like, Ravi is first in the comments, and a stranger searches “spicy” and stays for both episodes.'
					},
					{
						who: 'theo',
						scene: 'cloud',
						text: 'Fifteen requests in the first minute and not one of them was our fault. Someone even got a 401, and it was the right 401. I’m framing the log.'
					},
					{
						who: 'mina',
						scene: 'phone',
						text: 'My note from publish day is still the first thing under The night market. And now I know the whole trip it takes: phone, server, database, and back.'
					},
					{
						who: 'you',
						scene: 'server',
						text: 'Endpoints, a real database behind them, a phone that calls them, logins, settings in the environment. “The endpoint 404s”, “check the logs”, “that UPDATE had no WHERE”: I can read every one of those now.'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'Remember my first trip? Phone to server and back with a 200, and none of us knew what a 200 was. Doors are open. I’ve got readers to carry.'
					}
				]
			},
			hints: [
				"`/health` is one line inside the handler: `res.json({ status: 'ok', app: env.APP_NAME });`.",
				"The series page is one `db.all`: `'SELECT id, number, title, likes FROM episodes WHERE series_id = ? AND published = 1 ORDER BY number'` with `[req.params.id]`.",
				"The two routes:\n```js\napp.get('/health', (req, res) => {\n  res.json({ status: 'ok', app: env.APP_NAME });\n});\n\napp.get('/series/:id/episodes', (req, res) => {\n  res.json(db.all(\n    'SELECT id, number, title, likes FROM episodes WHERE series_id = ? AND published = 1 ORDER BY number',\n    [req.params.id]\n  ));\n});\n```"
			],
			world: world(
				[
					{ method: 'GET', path: '/health', label: '8:59, the receptionist checks the app' },
					{ method: 'GET', path: '/series', label: '9:00, the first reader opens the app' },
					{ method: 'GET', path: '/series/1/episodes', label: 'reader taps Moonlit Deliveries' },
					{ method: 'GET', path: '/episodes/4', label: 'reader opens The night market' },
					{ method: 'GET', path: '/episodes/4/comments', label: 'reader scrolls to the comments' },
					{ method: 'PUT', path: '/episodes/4/like', label: 'reader taps ♥' },
					{
						method: 'POST',
						path: '/episodes/4/comments',
						headers: RAVI,
						body: { text: 'Launch day. Reading it all again from the start.' },
						label: 'Ravi leaves the first launch-day comment'
					},
					{
						method: 'POST',
						path: '/episodes/4/comments',
						body: { text: 'how do i comment??' },
						label: 'a reader with no account tries to comment'
					},
					{
						method: 'POST',
						path: '/episodes/4/comments',
						headers: MINA,
						body: { text: '' },
						label: 'Mina taps Send by accident (again)'
					},
					{ method: 'GET', path: '/search?q=spicy', label: 'a new reader searches “spicy”' },
					{ method: 'GET', path: '/series/3/episodes', label: 'they tap Night Shift Noodles' },
					{ method: 'PUT', path: '/episodes/8/like', label: 'they ♥ Extra spicy' },
					{ method: 'GET', path: '/episodes/9', label: 'someone guesses the link to episode 9' },
					{ method: 'GET', path: '/search', label: 'someone taps Search with an empty box' },
					{ method: 'GET', path: '/episodes/4/comments', label: 'Mina checks the comments' }
				],
				{ env: { APP_NAME: 'Inkwell', PORT: '8080' } }
			),
			starterCode: next(CHECKPOINT[5], 'Launch day: GET /health and GET /series/:id/episodes'),
			solution: CHECKPOINT[6],
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: { status: 'ok', app: 'Inkwell' },
					message:
						"The receptionist checks `/health` first. It should answer `{ status: 'ok', app: env.APP_NAME }`."
				},
				{
					type: 'response-status',
					request: 1,
					status: 200,
					message: 'The front page from checkpoint 2 should still answer 200.'
				},
				{
					type: 'response-json',
					request: 2,
					expected: [
						{ id: 1, number: 1, title: 'The first parcel', likes: 120 },
						{ id: 2, number: 2, title: 'Rain on Pine Street', likes: 98 },
						{ id: 3, number: 3, title: 'The locked gate', likes: 143 },
						{ id: 4, number: 4, title: 'The night market', likes: 1 }
					],
					message:
						'The Moonlit Deliveries page should list its four published episodes by `number`, with `id`, `number`, `title` and `likes`. The new Sketches stays hidden.'
				},
				{
					type: 'response-json',
					request: 5,
					expected: { id: 4, likes: 2 },
					message: 'The ♥ on The night market should take it from 1 like to 2.'
				},
				{
					type: 'response-status',
					request: 6,
					status: 201,
					message: 'Ravi is logged in and wrote something: his comment should be saved with a 201.'
				},
				{
					type: 'response-status',
					request: 7,
					status: 401,
					message:
						'A reader with no token can’t comment yet: that’s a 401, and it’s the right answer. Don’t let it through.'
				},
				{
					type: 'response-status',
					request: 8,
					status: 400,
					message: 'An empty comment gets a 400 and isn’t saved, launch day or not.'
				},
				{
					type: 'response-json',
					request: 9,
					expected: [{ id: 8, title: 'Extra spicy' }],
					message: 'Searching “spicy” should find Extra spicy.'
				},
				{
					type: 'response-json',
					request: 10,
					mode: 'subset',
					expected: [{ title: 'Opening night' }, { title: 'Extra spicy' }],
					message: 'The Night Shift Noodles page should list Opening night and Extra spicy.'
				},
				{
					type: 'response-status',
					request: 12,
					status: 404,
					message: 'Episode 9 isn’t published yet. Guessing its link should get a 404.'
				},
				{
					type: 'response-status',
					request: 13,
					status: 400,
					message: 'A search with nothing in the box should get a 400.'
				},
				{
					type: 'response-json',
					request: 14,
					mode: 'subset',
					expected: [
						{ author: 'mina', text: 'Finally out. Thank you for waiting.' },
						{ author: 'ravi', text: 'Worth the wait. The lantern panel.' },
						{ author: 'ravi', text: 'Launch day. Reading it all again from the start.' }
					],
					message:
						'Under The night market: Mina’s note from publish day, Ravi’s from last week, and his launch-day comment, in that order.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT (SELECT COUNT(*) FROM comments) AS comments, (SELECT likes FROM episodes WHERE id = 4) AS night_market, (SELECT likes FROM episodes WHERE id = 8) AS extra_spicy, (SELECT likes FROM episodes WHERE id = 9) AS sketches',
					expected: [{ comments: 9, night_market: 2, extra_spicy: 190, sketches: 0 }],
					message:
						'At the end of the wave the database should hold exactly one new comment (9 in all), The night market at 2 likes, Extra spicy at 190, and Sketches untouched at 0.'
				}
			]
		}
	]
};
