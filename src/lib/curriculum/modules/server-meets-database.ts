import type { Module } from '#lib/curriculum/types.ts';
import { INKWELL_READING, serverWorld } from '#lib/curriculum/inkwell.ts';

const M = 'server-meets-database';

/** The comments list the phone reads in the comment levels (lets learners see what got saved). */
const COMMENTS_LIST = `
app.get('/episodes/:id/comments', (req, res) => {
  res.json(db.all('SELECT id, author, text FROM comments WHERE episode_id = ? ORDER BY id', [req.params.id]));
});
`;

/** The weekend version of the comments endpoint: every value glued straight into the SQL. */
const GLUED_POST = `app.post('/episodes/:id/comments', (req, res) => {
  const sql = "INSERT INTO comments (episode_id, author, text) VALUES (" +
    req.params.id + ", '" + req.body.author + "', '" + req.body.text + "')";
  db.run(sql);
  res.status(201).json({ saved: true });
});
`;

const TRICK = "'); DELETE FROM comments; --";

export const serverMeetsDatabase: Module = {
	id: M,
	track: 'web',
	order: 9,
	emoji: '🔌',
	title: 'Server meets database',
	blurb:
		'Plug the server into the database, so every tap on the phone turns into a real query, safely.',
	prereq: 'Easier if you’ve done Learn to code, parts 1–5 (variables, if, loops, functions).',
	lessons: [
		{
			id: `${M}/01-ask-the-database`,
			slug: '01-ask-the-database',
			kind: 'code',
			title: 'Ask, then answer',
			xp: 15,
			story:
				'Your server can answer requests, and you can talk to the database in SQL. Right now they’ve never met. The series list on the phone comes back empty, because the handler answers before it has asked anyone anything.',
			task: "In the `GET /series` handler, get every series from the database with `db.all('SELECT id, title, genre FROM series')` and answer with those rows using `res.json(rows)`.",
			concept: {
				title: 'The handler asks the database',
				panels: [
					{
						who: 'mina',
						text: 'In the SQL levels you typed the questions to the database yourself. When a reader taps, who does the typing?',
						scene: 'phone'
					},
					{
						who: 'you',
						text: 'The handler. It asks the database, waits for the rows, then answers the phone.',
						scene: 'server'
					},
					{
						who: 'bit',
						text: 'So I go phone to server, then a smaller packet hops from server to database and back. Then I carry the rows home.',
						scene: 'wire'
					},
					{
						who: 'narrator',
						text: '`db.all()` runs one SQL statement and gives back a list of rows. Each row is an object, like `{ id: 1, title: "Moonlit Deliveries" }`.',
						scene: 'database',
						code: "const rows = db.all('SELECT id, title FROM series');"
					},
					{
						who: 'theo',
						text: 'So the app always shows what’s in the database. Add a series to the table and the phone just has it?',
						scene: 'none'
					},
					{ who: 'you', text: 'No code change needed. That’s the whole point.', scene: 'none' }
				]
			},
			newCommands: ['db.all(sql, params)'],
			hints: [
				'Inside the handler, before `res.json`, make a variable that holds the rows: `const rows = db.all(…)`.',
				"The SQL goes in quotes as the first thing in the brackets: `db.all('SELECT id, title, genre FROM series')`. Then answer with `res.json(rows)` instead of `res.json([])`.",
				"Here's the whole handler:\n```js\napp.get('/series', (req, res) => {\n  const rows = db.all('SELECT id, title, genre FROM series');\n  res.json(rows);\n});\n```"
			],
			world: serverWorld([
				{ method: 'GET', path: '/series', label: 'reader opens the series list' }
			]),
			starterCode: `// The phone asks for the series list.
// Ask the database for the rows first, then answer with them.
app.get('/series', (req, res) => {
  res.json([]);
});
`,
			solution: `app.get('/series', (req, res) => {
  const rows = db.all('SELECT id, title, genre FROM series');
  res.json(rows);
});
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: [
						{ id: 1, title: 'Moonlit Deliveries' },
						{ id: 2, title: 'Grove & Gear' },
						{ id: 3, title: 'Night Shift Noodles' }
					],
					message:
						'The phone should get all three series from the database, as a list. Use `db.all(…)` to fetch them and send what it gives you with `res.json(…)`.'
				},
				{
					type: 'code-includes',
					pattern: 'db\\.all\\s*\\(',
					message:
						'Get the rows with `db.all(…)` rather than typing the list yourself. Then the phone sees whatever is really in the table.'
				}
			]
		},
		{
			id: `${M}/02-one-row`,
			slug: '02-one-row',
			kind: 'code',
			title: 'Just the one, please',
			xp: 20,
			story:
				'A reader taps a series, so the phone asks for `/series/2` and the server needs that one row, not all of them. Somebody else follows an old link to a series that doesn’t exist, and deserves a proper 404, not a mystery.',
			task: "In `GET /series/:id`, get the row with `db.get('SELECT * FROM series WHERE id = ?', [req.params.id])`. If there's no row, answer `404` with `{ error: 'No such series' }`. Otherwise answer with the row.",
			concept: {
				title: 'The `?` is a placeholder',
				panels: [
					{
						who: 'mina',
						text: 'How does the server know which series I tapped?',
						scene: 'phone'
					},
					{
						who: 'you',
						text: 'It’s in the path. For `/series/2`, `req.params.id` is `"2"`.',
						scene: 'server'
					},
					{
						who: 'bit',
						text: 'Now that 2 has to go into the SQL, but don’t glue it in. Leave a **placeholder**, a `?`, and hand the value over separately.',
						scene: 'wire',
						code: "db.get('SELECT * FROM series WHERE id = ?', [req.params.id])"
					},
					{
						who: 'narrator',
						text: 'The list in square brackets fills the placeholders in order, and the database treats each one as a value, never as part of the SQL. Remember that: it matters in a few levels.',
						scene: 'database'
					},
					{
						who: 'bit',
						text: '`db.get()` brings back one row, or `undefined` when nothing matched. `undefined` is your cue for a 404.',
						scene: 'wire'
					}
				]
			},
			newCommands: ['db.get(sql, params)'],
			hints: [
				'Start with `const row = db.get(…);` using the SQL and the list from the task.',
				"Then `if (!row) { … } else { … }`. `!row` is true when the database found nothing. Put `res.status(404).json({ error: 'No such series' })` in the first part and `res.json(row)` in the second.",
				"The whole handler:\n```js\napp.get('/series/:id', (req, res) => {\n  const row = db.get('SELECT * FROM series WHERE id = ?', [req.params.id]);\n  if (!row) {\n    res.status(404).json({ error: 'No such series' });\n  } else {\n    res.json(row);\n  }\n});\n```"
			],
			world: serverWorld([
				{ method: 'GET', path: '/series/2', label: 'reader taps Grove & Gear' },
				{ method: 'GET', path: '/series/9', label: 'reader follows an old link to series 9' }
			]),
			starterCode: `app.get('/series/:id', (req, res) => {
  // 1. Get one row: the series whose id is req.params.id (use ? in the SQL)
  // 2. No row? Answer 404 with { error: 'No such series' }
  // 3. Otherwise answer with the row
});
`,
			solution: `app.get('/series/:id', (req, res) => {
  const row = db.get('SELECT * FROM series WHERE id = ?', [req.params.id]);
  if (!row) {
    res.status(404).json({ error: 'No such series' });
  } else {
    res.json(row);
  }
});
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: { id: 2, title: 'Grove & Gear', genre: 'fantasy' },
					message:
						'Asking for `/series/2` should bring back the Grove & Gear row from the database.'
				},
				{
					type: 'response-status',
					request: 1,
					status: 404,
					message:
						'There is no series 9, so `db.get` gives back `undefined`. In that case answer with `res.status(404)`.'
				},
				{
					type: 'queries-parameterized',
					message:
						'Put a `?` in the SQL where the id goes and pass `[req.params.id]` as the second thing in the brackets, instead of gluing the id into the text.'
				}
			]
		},
		{
			id: `${M}/03-fix-only-one`,
			slug: '03-fix-only-one',
			kind: 'fix',
			title: 'Where did my other series go?',
			xp: 20,
			story:
				'Mina searches the app for her own two series with `/series?author=Mina`. The phone shows one, and not even as a list. “Did somebody delete Night Shift Noodles?” Nobody did: the handler asks the wrong way.',
			task: 'Fix the handler so `/series?author=Mina` answers with a list of both of Mina’s series, and `/series?author=Jun` with a list of one.',
			hints: [
				'Run it and look at the answer to the first request. It’s a single object in curly brackets, not a list in square brackets.',
				'`db.get` stops after the first row it finds. Which command gives back every row?',
				'Change `db.get` to `db.all`. Nothing else needs to change.'
			],
			world: serverWorld([
				{ method: 'GET', path: '/series?author=Mina', label: 'Mina looks for her own series' },
				{ method: 'GET', path: '/series?author=Jun', label: 'a reader looks for Jun’s series' }
			]),
			starterCode: `app.get('/series', (req, res) => {
  const rows = db.get('SELECT id, title, author FROM series WHERE author = ?', [req.query.author]);
  res.json(rows);
});
`,
			solution: `app.get('/series', (req, res) => {
  const rows = db.all('SELECT id, title, author FROM series WHERE author = ?', [req.query.author]);
  res.json(rows);
});
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: [
						{ id: 1, title: 'Moonlit Deliveries' },
						{ id: 3, title: 'Night Shift Noodles' }
					],
					message:
						'Mina should get a list (square brackets) with both of her series. `db.get` stops after the first row; which command brings back all of them?'
				},
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: [{ id: 2, title: 'Grove & Gear' }],
					message:
						'Jun has one series, but the phone still expects a list: `[ … ]` with one row inside.'
				}
			]
		},
		{
			id: `${M}/04-predict-missing-row`,
			slug: '04-predict-missing-row',
			kind: 'predict',
			title: 'The episode that wasn’t there',
			xp: 15,
			story:
				'Someone on the team wrote this handler for the episode page. It works fine for every episode you’ve tried. Then a reader opens episode 42, which doesn’t exist.',
			task: 'Read the handler and decide what the phone gets for each request.',
			code: `app.get('/episodes/:id', (req, res) => {
  const ep = db.get('SELECT * FROM episodes WHERE id = ?', [req.params.id]);
  res.json({ title: ep.title, likes: ep.likes });
});
`,
			world: serverWorld([
				{ method: 'GET', path: '/episodes/3', label: 'reader opens episode 3' },
				{ method: 'GET', path: '/episodes/42', label: 'reader opens episode 42' }
			]),
			question: 'What do the two requests get back?',
			choices: [
				'200 with the episode, then 404 Not found',
				'200 with the episode, then 500 Server error',
				'200 with the episode, then 200 with an empty title',
				'Both get 500, because one bad request breaks the server'
			],
			answer: 1,
			explanation:
				"Finding no rows isn’t an error for the database; it calmly hands back `undefined`. The crash comes one line later: `ep.title` asks for the title of nothing. The handler throws, the phone gets `500 Server error`, and the server log says `Cannot read properties of undefined (reading 'title')`. You’ll meet that exact sentence in real logs. The first request is untouched: every request gets its own run of the handler. The fix is the `if (!ep)` check from earlier, with a 404 of your own choosing.",
			hints: [
				'What does `db.get` give back when no row matches?',
				'Then what happens when the next line reads `.title` from it?'
			]
		},
		{
			id: `${M}/05-new-comment`,
			slug: '05-new-comment',
			kind: 'code',
			title: 'Comments that stay',
			xp: 20,
			story:
				'Your comments endpoint from “Sending data in” kept comments in a list, and the list forgot them at every restart. Theo found out the hard way. Today comments go into the database, starting with noodlefan’s thoughts on episode 3.',
			task: "In `POST /episodes/:id/comments`, save the comment with `db.run('INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)', [req.params.id, req.body.author, req.body.text])`. Answer with status `201` and `{ id: … }`, the new comment's id from what `db.run` gives back.",
			concept: {
				title: 'Changing things: `db.run`',
				panels: [
					{
						who: 'theo',
						text: 'We restarted the server and every comment vanished. Again.',
						scene: 'none'
					},
					{
						who: 'you',
						text: 'Not once they’re in the database. Reading uses `db.all` and `db.get`; changing anything (INSERT, UPDATE, DELETE) uses `db.run`.',
						scene: 'server',
						code: "const r = db.run('INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)', [id, author, text]);"
					},
					{
						who: 'bit',
						text: '`db.run` doesn’t bring rows back. It brings a receipt: how many rows changed, and the id the database gave the new row.',
						scene: 'database',
						code: 'r.changes  // 1\nr.lastId   // 6'
					},
					{
						who: 'narrator',
						text: 'Three placeholders, three values, in the same order. Then the same polite `201` as before, with the new id so the phone can link straight to it.',
						scene: 'phone'
					}
				]
			},
			newCommands: ['db.run(sql, params)'],
			hints: [
				'First line in the handler: `const r = db.run(…)` with the SQL and the list of three values from the task.',
				'`r.lastId` is the new comment’s id. Answer with `res.status(201).json({ id: r.lastId })`.',
				"The whole handler:\n```js\napp.post('/episodes/:id/comments', (req, res) => {\n  const r = db.run(\n    'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)',\n    [req.params.id, req.body.author, req.body.text]\n  );\n  res.status(201).json({ id: r.lastId });\n});\n```"
			],
			world: serverWorld(
				[
					{
						method: 'POST',
						path: '/episodes/3/comments',
						body: { author: 'noodlefan', text: 'Ravi was right about the gate' },
						label: 'noodlefan comments on episode 3'
					},
					{
						method: 'GET',
						path: '/episodes/3/comments',
						label: 'reader reloads the comments'
					}
				],
				{ serverCode: COMMENTS_LIST }
			),
			starterCode: `// The phone sends a body like { author: 'noodlefan', text: '…' }
app.post('/episodes/:id/comments', (req, res) => {
  // 1. INSERT the comment with db.run, a ? for each value
  // 2. Answer 201 with { id: the new comment's id }
});
`,
			solution: `app.post('/episodes/:id/comments', (req, res) => {
  const r = db.run(
    'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)',
    [req.params.id, req.body.author, req.body.text]
  );
  res.status(201).json({ id: r.lastId });
});
`,
			checks: [
				{ type: 'response-status', request: 0, status: 201 },
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: { id: 6 },
					message:
						'Send the new id back: `res.status(201).json({ id: r.lastId })`, where `r` is what `db.run` gave you.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT episode_id, author, text FROM comments WHERE id = 6',
					expected: [{ episode_id: 3, author: 'noodlefan', text: 'Ravi was right about the gate' }],
					message:
						'The comment should be saved in the `comments` table for episode 3, with the author and text from `req.body`.'
				},
				{
					type: 'queries-parameterized',
					message:
						'Use three `?` placeholders in the SQL and pass the values in the list, instead of gluing them into the text.'
				}
			]
		},
		{
			id: `${M}/06-predict-the-comment`,
			slug: '06-predict-the-comment',
			kind: 'predict',
			title: 'The comment that deleted the comments',
			xp: 20,
			story:
				'Before you joined, Theo’s cousin wrote the first comments endpoint over a weekend. Instead of `?` placeholders, it glues the values straight into the SQL with `+`. Today a “reader” posts a very odd comment under episode 7.',
			task: 'Read the code and the three requests. Work out what the third one gets back.',
			concept: {
				title: 'When text turns into SQL',
				panels: [
					{
						who: 'bit',
						text: "I’m carrying a comment. Its text is: `'); DELETE FROM comments; --`",
						scene: 'wire'
					},
					{
						who: 'mina',
						text: 'That’s not a comment, that’s… gibberish?',
						scene: 'phone'
					},
					{
						who: 'you',
						text: 'Gibberish to us. Watch what it turns into once it’s glued in between the quotes in that SQL.',
						scene: 'server'
					}
				]
			},
			code: GLUED_POST,
			world: serverWorld(
				[
					{
						method: 'POST',
						path: '/episodes/7/comments',
						body: { author: 'noodlefan', text: 'Best one yet' },
						label: 'noodlefan comments on episode 7'
					},
					{
						method: 'POST',
						path: '/episodes/7/comments',
						body: { author: 'troll', text: TRICK },
						label: 'a “reader” posts a very odd comment'
					},
					{
						method: 'GET',
						path: '/episodes/7/comments',
						label: 'reader opens the comments on episode 7'
					}
				],
				{ serverCode: COMMENTS_LIST }
			),
			question: 'What does the third request, the comments on episode 7, get back?',
			choices: [
				'Four comments: the two old ones, noodlefan’s, and the odd one',
				'Three comments: the odd one is refused, the rest are there',
				'An empty list: there are no comments left at all, on any episode',
				'A 500 error: the database won’t accept such a strange comment'
			],
			answer: 2,
			explanation:
				"Glued in, the SQL becomes `INSERT INTO comments (…) VALUES (7, 'troll', ''); DELETE FROM comments; --')`. The `')` closes the text early, the `;` starts a brand-new statement, and `--` turns the leftover into a comment. The database sees two instructions and does both: it saves an empty comment, then deletes every comment in the table. This is called **SQL injection**, and it’s one of the oldest attacks on the web. Even an innocent “can’t wait” would break this code, because of the apostrophe. The fix is the `?` placeholder you already know, and that’s the next level.",
			hints: [
				'Write out the SQL string by hand for the second request, with the odd text pasted in where `req.body.text` goes.',
				'Look at what comes after the `;` in the result.'
			]
		},
		{
			id: `${M}/07-fix-the-hole`,
			slug: '07-fix-the-hole',
			kind: 'fix',
			title: 'Close the hole',
			xp: 25,
			story:
				'You restored the comments from last night’s backup (phew). Now the endpoint needs fixing before anyone tries that again. Run it first: june_b’s perfectly normal comment already breaks it, because of one apostrophe.',
			task: 'Rewrite the INSERT with three `?` placeholders and pass `[req.params.id, req.body.author, req.body.text]` as a list. Both comments must be saved, the odd one as plain harmless text, and nothing deleted.',
			hints: [
				'Look at the server log for the first request. SQLite got confused near `t`: that’s the t in “Can’t”. The apostrophe ended the quoted text early, so the rest no longer made sense as SQL.',
				"You don't need the `sql` variable with all the `+` pieces. Write the SQL in one piece with `?` where the values go: `'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)'`.",
				"The fixed handler:\n```js\napp.post('/episodes/:id/comments', (req, res) => {\n  db.run(\n    'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)',\n    [req.params.id, req.body.author, req.body.text]\n  );\n  res.status(201).json({ saved: true });\n});\n```"
			],
			world: serverWorld(
				[
					{
						method: 'POST',
						path: '/episodes/7/comments',
						body: { author: 'june_b', text: "Can't stop laughing" },
						label: 'june_b comments on episode 7'
					},
					{
						method: 'POST',
						path: '/episodes/7/comments',
						body: { author: 'troll', text: TRICK },
						label: 'the “reader” tries the odd comment again'
					},
					{
						method: 'GET',
						path: '/episodes/7/comments',
						label: 'reader opens the comments on episode 7'
					}
				],
				{ serverCode: COMMENTS_LIST }
			),
			starterCode: GLUED_POST,
			solution: `app.post('/episodes/:id/comments', (req, res) => {
  db.run(
    'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)',
    [req.params.id, req.body.author, req.body.text]
  );
  res.status(201).json({ saved: true });
});
`,
			checks: [
				{
					type: 'response-status',
					request: 0,
					status: 201,
					message:
						'june_b’s comment should be saved with a 201. While the text is glued into the SQL, the apostrophe in “Can’t” breaks it.'
				},
				{ type: 'response-status', request: 1, status: 201 },
				{
					type: 'queries-parameterized',
					message:
						'A value from the request is still glued into the SQL. Use `?` placeholders and pass the values in a list.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT author, text FROM comments WHERE episode_id = 7 ORDER BY id',
					expected: [
						{ author: 'noodlefan', text: 'I can smell this episode' },
						{ author: 'june_b', text: 'Extra spicy next, please' },
						{ author: 'june_b', text: "Can't stop laughing" },
						{ author: 'troll', text: TRICK }
					],
					message:
						'Episode 7 should end up with four comments: the two old ones, june_b’s new one, and the odd one saved as plain text.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT COUNT(*) AS n FROM comments',
					expected: [{ n: 7 }],
					message:
						'Every comment on every episode should still be there (7 in total). Something deleted some of them.'
				}
			]
		},
		{
			id: `${M}/08-boss-likes`,
			slug: '08-boss-likes',
			kind: 'code',
			title: 'Hearts and the newest comments',
			xp: 50,
			boss: true,
			story:
				'Theo wants two things before Friday: a working ♥ button, and comments newest first, “like every other app on earth”. After this, every tap on the phone lands in the real database, and your server stops being a demo.',
			task: "Write two endpoints.\n\n**`PUT /episodes/:id/like`**: add one like with `db.run('UPDATE episodes SET likes = likes + 1 WHERE id = ?', …)`. If the receipt says `changes` is `0`, no such episode: answer `404`. Otherwise answer with `{ id, likes }` for that episode, fresh from the database.\n\n**`GET /episodes/:id/comments`**: the episode's comments with `author`, `text` and `created_at`, newest first (`ORDER BY created_at DESC`).",
			hints: [
				"For the like: `const r = db.run(…)`, then `if (r.changes === 0) { 404 } else { … }`. In the else part, fetch the episode again with `db.get('SELECT id, likes FROM episodes WHERE id = ?', [req.params.id])` and send it.",
				"For the comments: `db.all('SELECT author, text, created_at FROM comments WHERE episode_id = ? ORDER BY created_at DESC', [req.params.id])`, then `res.json(…)` with the rows.",
				"Both endpoints:\n```js\napp.put('/episodes/:id/like', (req, res) => {\n  const r = db.run('UPDATE episodes SET likes = likes + 1 WHERE id = ?', [req.params.id]);\n  if (r.changes === 0) {\n    res.status(404).json({ error: 'No such episode' });\n  } else {\n    res.json(db.get('SELECT id, likes FROM episodes WHERE id = ?', [req.params.id]));\n  }\n});\n\napp.get('/episodes/:id/comments', (req, res) => {\n  res.json(db.all('SELECT author, text, created_at FROM comments WHERE episode_id = ? ORDER BY created_at DESC', [req.params.id]));\n});\n```"
			],
			world: serverWorld(
				[
					{ method: 'PUT', path: '/episodes/3/like', label: 'reader taps ♥ on The locked gate' },
					{ method: 'PUT', path: '/episodes/3/like', label: 'another reader taps ♥ too' },
					{ method: 'PUT', path: '/episodes/99/like', label: 'an old app taps ♥ on episode 99' },
					{ method: 'GET', path: '/episodes/3/comments', label: 'reader opens the comments' }
				],
				{
					schema:
						INKWELL_READING +
						"\nINSERT INTO comments (episode_id, author, text, created_at) VALUES (3, 'june_b', 'Read it again. The gate was open the whole time.', '2026-10-09');\n"
				}
			),
			starterCode: `app.put('/episodes/:id/like', (req, res) => {
  // 1. Add one like with db.run (UPDATE … WHERE id = ?)
  // 2. Nothing changed? 404
  // 3. Otherwise answer with { id, likes } from the database
});

app.get('/episodes/:id/comments', (req, res) => {
  // The comments for this episode, newest first
});
`,
			solution: `app.put('/episodes/:id/like', (req, res) => {
  const r = db.run('UPDATE episodes SET likes = likes + 1 WHERE id = ?', [req.params.id]);
  if (r.changes === 0) {
    res.status(404).json({ error: 'No such episode' });
  } else {
    const ep = db.get('SELECT id, likes FROM episodes WHERE id = ?', [req.params.id]);
    res.json(ep);
  }
});

app.get('/episodes/:id/comments', (req, res) => {
  const rows = db.all(
    'SELECT author, text, created_at FROM comments WHERE episode_id = ? ORDER BY created_at DESC',
    [req.params.id]
  );
  res.json(rows);
});
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: { id: 3, likes: 144 },
					message:
						'After one ♥, episode 3 should answer `{ id: 3, likes: 144 }`. Fetch it again with `db.get` after the UPDATE so the number is fresh.'
				},
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: { id: 3, likes: 145 },
					message: 'The second ♥ should bring episode 3 to 145 likes.'
				},
				{
					type: 'response-status',
					request: 2,
					status: 404,
					message:
						'There is no episode 99, so the UPDATE changes nothing (`r.changes` is `0`). Answer 404 in that case.'
				},
				{
					type: 'response-json',
					request: 3,
					mode: 'subset',
					expected: [
						{ author: 'june_b', created_at: '2026-10-09' },
						{ author: 'ravi', created_at: '2026-10-05' }
					],
					message:
						'The comments on episode 3 should come newest first: june_b’s from 9 October, then ravi’s from 5 October. Add `ORDER BY created_at DESC`.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT likes FROM episodes WHERE id = 3',
					expected: [{ likes: 145 }],
					message: 'Episode 3 should have 145 likes in the database after two ♥ taps.'
				},
				{
					type: 'queries-parameterized',
					message: 'Use a `?` for the id in both queries, and pass `[req.params.id]`.'
				}
			]
		}
	]
};
