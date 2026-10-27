import type { Module, SimRequest, WebWorldSpec } from '#lib/curriculum/types.ts';
import { INKWELL_SCHEMA } from '#lib/curriculum/inkwell.ts';

const M = 'who-are-you';

/** Everything, plus a session for Ravi so two people can be logged in at once. */
const TWO_SESSIONS =
	INKWELL_SCHEMA + "\nINSERT INTO sessions (token, user_id) VALUES ('tok_ravi_456', 2);\n";

function world(requests: SimRequest[], extra: Partial<WebWorldSpec> = {}): WebWorldSpec {
	return { kind: 'web', role: 'server', schema: INKWELL_SCHEMA, requests, ...extra };
}

const MINA = { token: 'tok_mina_123' };
const RAVI = { token: 'tok_ravi_456' };

/** The login helpers the learner gets in level 2 (a real server would use an argon2 library). */
const LOGIN_HELPERS = `// Already written for you. A real server would use a password library (argon2) here:
// it scrambles the typed password the same way and compares the two scrambles.
// In this simulation, everyone's password is 'inkwell-' + their name.
function checkPassword(user, password) {
  if (!user) return false;
  return password === 'inkwell-' + user.name;
}

// Real tokens are long and random. These are short so you can read them.
function makeToken(user) {
  return 'tok_' + user.name + '_' + Math.floor(Math.random() * 1000000);
}
`;

/** The finished helper from level 3, reused afterwards. */
const CURRENT_USER = `// Who is asking? Gives back the user ({ id, name }) or undefined.
function currentUser(req) {
  const token = req.headers.token;
  if (!token) return undefined;
  return db.get(
    'SELECT users.id, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?',
    [token]
  );
}
`;

/** Used by the boss so logging out can be checked with a request. */
const ME_ROUTE = `
app.get('/me', (req, res) => {
  const token = req.headers.token || '';
  const user = db.get('SELECT users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?', [token]);
  if (!user) return res.status(401).json({ error: 'Who are you? Please log in.' });
  res.json(user);
});
`;

export const whoAreYou: Module = {
	id: M,
	track: 'web',
	order: 11,
	emoji: '🔑',
	title: 'Who are you?',
	blurb:
		'Logins from the inside: why the server never keeps your password, what a session token is, and the difference between 401 and 403.',
	prereq: 'Easier if you’ve done Learn to code, parts 1–5 (variables, if, loops, functions).',
	lessons: [
		{
			id: `${M}/01-predict-the-hash`,
			slug: '01-predict-the-hash',
			kind: 'predict',
			title: 'Even you can’t read it',
			xp: 15,
			story:
				'Inkwell is getting accounts, so comments can have real names that nobody else can borrow. The database now has a `users` table, and Theo’s cousin left a debugging endpoint in that lists it.',
			task: 'Read the endpoint and decide what Mina’s row looks like.',
			concept: {
				title: 'The server never keeps your password',
				panels: [
					{
						who: 'mina',
						text: 'If I make an account, does the server store my password somewhere?',
						scene: 'lock'
					},
					{
						who: 'you',
						text: 'Not the password itself. It stores a **hash**: the password run through a one-way scrambler.',
						scene: 'database',
						code: "'inkwell-mina'  →  '$argon2id$v=19$m=65536…'"
					},
					{
						who: 'bit',
						text: 'When you log in, I carry what you typed to the server. It scrambles that the same way and checks the two scrambles match, and nobody ever unscrambles anything.',
						scene: 'server'
					},
					{ who: 'mina', text: 'So even you can’t read my password?', scene: 'none' },
					{
						who: 'you',
						text: 'Right. And if the database ever leaks, the thieves get scrambles, not passwords.',
						scene: 'lock'
					}
				]
			},
			code: `app.get('/debug/users', (req, res) => {
  res.json(db.all('SELECT name, password_hash FROM users'));
});
`,
			world: world([
				{ method: 'GET', path: '/debug/users', label: 'a developer opens the debug page' }
			]),
			question: 'What is in Mina’s `password_hash`?',
			choices: [
				'Her password, `inkwell-mina`, so the server can compare it',
				'A long scrambled string starting with `$argon2id$`',
				'Nothing: passwords are kept in a separate secret system',
				'Her password, but written backwards'
			],
			answer: 1,
			explanation:
				'The table only has the scrambled version, `$argon2id$v=19$…`, because the server never kept anything else. The start says which scrambler made it (argon2, a modern one) and with which settings, so the server can scramble a typed password the same way later. One thing to take away from this endpoint, though: delete it. Hashes are much safer than passwords, but you still never hand them to the outside world.',
			hints: [
				'Look at the column name the SQL asks for.',
				'If the server stored the real password, anyone who could read the database could read everyone’s password.'
			]
		},
		{
			id: `${M}/02-log-in`,
			slug: '02-log-in',
			kind: 'code',
			title: 'Logging in',
			xp: 25,
			story:
				'Ravi wants to log in so his comments can carry his name. One person on the internet thinks Ravi’s password is hunter2. Someone else tries an account that doesn’t exist.',
			task: "Write `POST /login`. The body is `{ name, password }`.\n\n1. Get the user: `db.get('SELECT * FROM users WHERE name = ?', [req.body.name])`.\n2. If `checkPassword(user, req.body.password)` is false, answer `401` with `{ error: 'Wrong name or password' }`.\n3. Otherwise make a token with `makeToken(user)`, save it with `db.run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, user.id])`, and answer `{ token: token }`.\n\n`checkPassword` and `makeToken` are already written at the top.",
			concept: {
				title: 'A session token is a ticket',
				panels: [
					{
						who: 'theo',
						text: 'So readers type their password every time they tap something?',
						scene: 'phone'
					},
					{
						who: 'you',
						text: 'Once. If it’s right, the server hands the phone a **token**: a long random ticket.',
						scene: 'server',
						code: "{ token: 'tok_ravi_481516' }"
					},
					{
						who: 'bit',
						text: 'The server writes the ticket in the `sessions` table next to the user’s id, and that row is a **session**. From then on, I carry the ticket on every trip.',
						scene: 'database'
					},
					{
						who: 'narrator',
						text: 'Wrong password or unknown name: 401, and the same message for both. Telling a stranger “that name exists” helps them guess.',
						scene: 'lock'
					}
				]
			},
			hints: [
				'Start with `const user = db.get(…)` from the task, then `if (!checkPassword(user, req.body.password)) { … } else { … }`.',
				'In the else part: `const token = makeToken(user);`, then the `db.run` INSERT, then `res.json({ token: token })`.',
				"The route:\n```js\napp.post('/login', (req, res) => {\n  const user = db.get('SELECT * FROM users WHERE name = ?', [req.body.name]);\n  if (!checkPassword(user, req.body.password)) {\n    res.status(401).json({ error: 'Wrong name or password' });\n  } else {\n    const token = makeToken(user);\n    db.run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, user.id]);\n    res.json({ token: token });\n  }\n});\n```"
			],
			world: world([
				{
					method: 'POST',
					path: '/login',
					body: { name: 'ravi', password: 'inkwell-ravi' },
					label: 'Ravi logs in'
				},
				{
					method: 'POST',
					path: '/login',
					body: { name: 'ravi', password: 'hunter2' },
					label: 'someone tries a guess for Ravi'
				},
				{
					method: 'POST',
					path: '/login',
					body: { name: 'nobody', password: 'inkwell-nobody' },
					label: 'someone tries an account that doesn’t exist'
				}
			]),
			starterCode: `${LOGIN_HELPERS}
app.post('/login', (req, res) => {
  // 1. Get the user by name (use ?)
  // 2. Wrong password (or no such user)? 401
  // 3. Otherwise: make a token, save it in sessions, answer { token: token }
});
`,
			solution: `${LOGIN_HELPERS}
app.post('/login', (req, res) => {
  const user = db.get('SELECT * FROM users WHERE name = ?', [req.body.name]);
  if (!checkPassword(user, req.body.password)) {
    res.status(401).json({ error: 'Wrong name or password' });
  } else {
    const token = makeToken(user);
    db.run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, user.id]);
    res.json({ token: token });
  }
});
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-includes',
					request: 0,
					text: 'tok_ravi_',
					message: "Ravi should get his new token back, like `{ token: 'tok_ravi_…' }`."
				},
				{
					type: 'response-status',
					request: 1,
					status: 401,
					message: 'A wrong password gets 401. `checkPassword` gives back `false` for it.'
				},
				{
					type: 'response-status',
					request: 2,
					status: 401,
					message: 'An unknown name gets 401 as well, with the same message as a wrong password.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT user_id FROM sessions ORDER BY user_id',
					expected: [{ user_id: 1 }, { user_id: 2 }],
					message:
						'After this, `sessions` should have Mina’s old ticket and exactly one new one for Ravi (user 2). Only save a token when the password is right.'
				},
				{
					type: 'queries-parameterized',
					message: 'Use `?` for the name and the token values instead of gluing them into the SQL.'
				}
			]
		},
		{
			id: `${M}/03-who-is-asking`,
			slug: '03-who-is-asking',
			kind: 'code',
			title: 'Who is asking?',
			xp: 25,
			story:
				'Mina’s phone sends her token with every request now. The profile screen asks `GET /me`, and the server has to work out who that is. Also knocking: a phone with no token at all, and someone who made one up.',
			task: 'Finish `currentUser(req)`. Read the token from `req.headers.token`. No token: `return undefined`. Otherwise give back the user from `sessions JOIN users` where `sessions.token = ?`. The `/me` route is already written and answers 401 when you give back nothing.',
			concept: {
				title: 'Headers: writing on the envelope',
				panels: [
					{
						who: 'bit',
						text: 'On every trip I carry a few labels on the outside, notes about the message rather than the message itself. They’re called **headers**.',
						scene: 'wire'
					},
					{ who: 'mina', text: 'Like a return address on an envelope?', scene: 'none' },
					{
						who: 'you',
						text: 'Exactly. After logging in, the phone writes its token on every envelope, and the server reads it from `req.headers`.',
						scene: 'server',
						code: "req.headers.token   // 'tok_mina_123'"
					},
					{
						who: 'narrator',
						text: 'The server looks the token up in `sessions`, and if it’s there, it knows who’s asking. Missing or made up means 401: “who are you?”',
						scene: 'database'
					}
				]
			},
			newCommands: ['req.headers'],
			hints: [
				'First line: `const token = req.headers.token;` Then `if (!token) return undefined;`.',
				"Then `return db.get('SELECT users.id, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?', [token]);`. A made-up token finds no row, so `db.get` gives back `undefined` all by itself.",
				"The finished helper:\n```js\nfunction currentUser(req) {\n  const token = req.headers.token;\n  if (!token) return undefined;\n  return db.get(\n    'SELECT users.id, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?',\n    [token]\n  );\n}\n```"
			],
			world: world([
				{ method: 'GET', path: '/me', headers: MINA, label: 'Mina opens her profile' },
				{ method: 'GET', path: '/me', label: 'a phone with no token opens the profile' },
				{
					method: 'GET',
					path: '/me',
					headers: { token: 'tok_made_up' },
					label: 'someone tries a made-up token'
				}
			]),
			starterCode: `// Who is asking? Give back the user ({ id, name }) or undefined.
function currentUser(req) {
  // 1. Read the token from req.headers
  // 2. No token? return undefined
  // 3. Look it up: sessions JOIN users, WHERE sessions.token = ?
}

app.get('/me', (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Who are you? Please log in.' });
  } else {
    res.json({ name: user.name });
  }
});
`,
			solution: `${CURRENT_USER}
app.get('/me', (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Who are you? Please log in.' });
  } else {
    res.json({ name: user.name });
  }
});
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-json',
					request: 0,
					expected: { name: 'mina' },
					message:
						"Mina’s token is `tok_mina_123`. Looking it up in `sessions` (joined with `users`) should find her, so `/me` answers `{ name: 'mina' }`."
				},
				{
					type: 'response-status',
					request: 1,
					status: 401,
					message:
						'No token at all should get 401. Check `if (!token)` before asking the database: a `?` can’t be filled with `undefined`.'
				},
				{
					type: 'response-status',
					request: 2,
					status: 401,
					message: 'A made-up token isn’t in `sessions`, so nobody is found and the answer is 401.'
				},
				{
					type: 'code-includes',
					pattern: 'req\\.headers',
					message: 'Read the token from `req.headers.token`.'
				},
				{
					type: 'code-excludes',
					pattern: '\\+\\s*(token|req\\.headers)',
					message:
						'Don’t glue the token into the SQL. A token comes from outside, just like a comment does. Use `?` and pass `[token]`.'
				}
			]
		},
		{
			id: `${M}/04-predict-401-or-403`,
			slug: '04-predict-401-or-403',
			kind: 'predict',
			title: '401 or 403?',
			xp: 15,
			story:
				'Readers can now delete their own comments, and two phones try to delete comment 1, which Ravi wrote. The first has no token. The second is Mina’s: logged in, but it isn’t her comment.',
			task: 'Read the route and decide what each phone gets back.',
			code: `${CURRENT_USER}
app.delete('/comments/:id', (req, res) => {
  const user = currentUser(req);
  const comment = db.get('SELECT * FROM comments WHERE id = ?', [req.params.id]);
  if (!user) {
    res.status(401).json({ error: 'Who are you? Please log in.' });
  } else if (comment.author !== user.name) {
    res.status(403).json({ error: 'Only the author can delete this' });
  } else {
    db.run('DELETE FROM comments WHERE id = ?', [req.params.id]);
    res.status(204).end();
  }
});
`,
			world: world([
				{ method: 'DELETE', path: '/comments/1', label: 'a phone with no token deletes comment 1' },
				{
					method: 'DELETE',
					path: '/comments/1',
					headers: MINA,
					label: 'Mina’s phone deletes comment 1'
				}
			]),
			question: 'What do the two requests get?',
			choices: ['401, then 403', '403, then 401', '401 both times', '403 both times'],
			answer: 0,
			explanation:
				'**401** means “I don’t know who you are”: no token, or one the server doesn’t recognise. Logging in would help. **403** means “I know exactly who you are, and the answer is no”: Mina is logged in, but comment 1 is Ravi’s. Logging in again won’t change a thing. When you see these in a log, 401 points at the login side (expired session, missing token), 403 at permissions.',
			hints: [
				'The first phone has no token. What does `currentUser` give back then?',
				'Mina is found by her token. Whose comment is number 1?'
			]
		},
		{
			id: `${M}/05-fix-borrowed-name`,
			slug: '05-fix-borrowed-name',
			kind: 'fix',
			title: 'A comment Mina never wrote',
			xp: 25,
			story:
				'There’s a comment under episode 3 signed **mina**: “Mina here: I ran out of ideas.” She didn’t write it. The comments endpoint looks up who’s asking, then ignores the answer: it trusts whatever author the phone puts in the body, and it saves comments from phones with no session at all.',
			task: 'Fix the route: when there’s no user, answer `401` and save nothing. Otherwise save the comment with `user.name` as the author, not `req.body.author`.',
			hints: [
				'Run it and look at the `comments` table: request 2 was Ravi’s phone, but the comment says mina. Request 3 had no token and still got saved.',
				'Replace the `log(…)` part with `if (!user) { res.status(401)… } else { …save and answer 201… }`.',
				"The fixed route:\n```js\napp.post('/episodes/:id/comments', (req, res) => {\n  const user = currentUser(req);\n  if (!user) {\n    res.status(401).json({ error: 'Please log in to comment' });\n  } else {\n    const r = db.run(\n      'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)',\n      [req.params.id, user.name, req.body.text]\n    );\n    res.status(201).json({ id: r.lastId });\n  }\n});\n```"
			],
			world: world(
				[
					{
						method: 'POST',
						path: '/episodes/3/comments',
						headers: MINA,
						body: { author: 'mina', text: 'Thanks for reading, everyone.' },
						label: 'Mina comments on episode 3'
					},
					{
						method: 'POST',
						path: '/episodes/3/comments',
						headers: RAVI,
						body: { author: 'mina', text: 'Mina here: I ran out of ideas.' },
						label: 'Ravi’s phone posts, signed as mina'
					},
					{
						method: 'POST',
						path: '/episodes/3/comments',
						body: { author: 'june_b', text: 'First!' },
						label: 'a phone with no token posts'
					}
				],
				{ schema: TWO_SESSIONS }
			),
			starterCode: `${CURRENT_USER}
app.post('/episodes/:id/comments', (req, res) => {
  const user = currentUser(req);
  if (!user) {
    log('No session for this request');
  }
  const r = db.run(
    'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)',
    [req.params.id, req.body.author, req.body.text]
  );
  res.status(201).json({ id: r.lastId });
});
`,
			solution: `${CURRENT_USER}
app.post('/episodes/:id/comments', (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please log in to comment' });
  } else {
    const r = db.run(
      'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)',
      [req.params.id, user.name, req.body.text]
    );
    res.status(201).json({ id: r.lastId });
  }
});
`,
			checks: [
				{ type: 'response-status', request: 0, status: 201 },
				{ type: 'response-status', request: 1, status: 201 },
				{
					type: 'response-status',
					request: 2,
					status: 401,
					message: 'A phone with no token should get 401, and nothing should be saved.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT author, text FROM comments WHERE episode_id = 3 ORDER BY id',
					expected: [
						{ author: 'ravi', text: 'Called it. The gate was never locked.' },
						{ author: 'mina', text: 'Thanks for reading, everyone.' },
						{ author: 'ravi', text: 'Mina here: I ran out of ideas.' }
					],
					message:
						'Episode 3’s comments should show who really posted them: the author comes from `user.name` (the session), never from the body. And the no-token comment shouldn’t be there.'
				}
			]
		},
		{
			id: `${M}/06-boss-delete-and-log-out`,
			slug: '06-boss-delete-and-log-out',
			kind: 'code',
			title: 'Delete, refuse, log out',
			xp: 50,
			boss: true,
			story:
				'Theo’s list for logins: “People must be able to delete their own comments, nobody else’s, and log out.” Mina adds: “And if a comment doesn’t exist, say so.” Get this through and Inkwell has real accounts, the last big piece before launch.',
			task: 'Write two routes, using `currentUser(req)`.\n\n**`DELETE /comments/:id`**: no user → `401`. No such comment → `404`. Someone else’s comment → `403`. Otherwise delete it and answer `204` with `res.status(204).end()`.\n\n**`DELETE /session`** (log out): no user → `401`. Otherwise delete the row from `sessions` whose token is `req.headers.token`, and answer `204`.',
			hints: [
				"For the comment, fetch both first: `const user = currentUser(req);` and `const comment = db.get('SELECT * FROM comments WHERE id = ?', [req.params.id]);`. Then one chain: `if (!user) … else if (!comment) … else if (comment.author !== user.name) … else …`.",
				"Logging out is just deleting the ticket: `db.run('DELETE FROM sessions WHERE token = ?', [req.headers.token])`. After that, the token finds nobody, so `/me` says 401.",
				"Both routes:\n```js\napp.delete('/comments/:id', (req, res) => {\n  const user = currentUser(req);\n  const comment = db.get('SELECT * FROM comments WHERE id = ?', [req.params.id]);\n  if (!user) {\n    res.status(401).json({ error: 'Who are you? Please log in.' });\n  } else if (!comment) {\n    res.status(404).json({ error: 'No such comment' });\n  } else if (comment.author !== user.name) {\n    res.status(403).json({ error: 'Only the author can delete this' });\n  } else {\n    db.run('DELETE FROM comments WHERE id = ?', [req.params.id]);\n    res.status(204).end();\n  }\n});\n\napp.delete('/session', (req, res) => {\n  const user = currentUser(req);\n  if (!user) {\n    res.status(401).json({ error: 'Who are you? Please log in.' });\n  } else {\n    db.run('DELETE FROM sessions WHERE token = ?', [req.headers.token]);\n    res.status(204).end();\n  }\n});\n```"
			],
			world: world(
				[
					{
						method: 'DELETE',
						path: '/comments/3',
						label: 'a phone with no token deletes comment 3'
					},
					{
						method: 'DELETE',
						path: '/comments/3',
						headers: MINA,
						label: 'Mina tries to delete Ravi’s comment'
					},
					{
						method: 'DELETE',
						path: '/comments/99',
						headers: MINA,
						label: 'Mina deletes a comment that’s already gone'
					},
					{
						method: 'DELETE',
						path: '/comments/3',
						headers: RAVI,
						label: 'Ravi deletes his own comment'
					},
					{ method: 'DELETE', path: '/session', headers: RAVI, label: 'Ravi logs out' },
					{
						method: 'GET',
						path: '/me',
						headers: RAVI,
						label: 'Ravi’s old token tries to open his profile'
					},
					{ method: 'DELETE', path: '/session', label: 'a phone with no token logs out' }
				],
				{ schema: TWO_SESSIONS, serverCode: ME_ROUTE }
			),
			starterCode: `${CURRENT_USER}
app.delete('/comments/:id', (req, res) => {
  // 401 no user, 404 no comment, 403 not the author, otherwise delete and 204
});

app.delete('/session', (req, res) => {
  // 401 no user, otherwise delete this token from sessions and 204
});
`,
			solution: `${CURRENT_USER}
app.delete('/comments/:id', (req, res) => {
  const user = currentUser(req);
  const comment = db.get('SELECT * FROM comments WHERE id = ?', [req.params.id]);
  if (!user) {
    res.status(401).json({ error: 'Who are you? Please log in.' });
  } else if (!comment) {
    res.status(404).json({ error: 'No such comment' });
  } else if (comment.author !== user.name) {
    res.status(403).json({ error: 'Only the author can delete this' });
  } else {
    db.run('DELETE FROM comments WHERE id = ?', [req.params.id]);
    res.status(204).end();
  }
});

app.delete('/session', (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Who are you? Please log in.' });
  } else {
    db.run('DELETE FROM sessions WHERE token = ?', [req.headers.token]);
    res.status(204).end();
  }
});
`,
			checks: [
				{
					type: 'response-status',
					request: 0,
					status: 401,
					message: 'No token, no idea who this is: 401.'
				},
				{
					type: 'response-status',
					request: 1,
					status: 403,
					message: 'Mina is logged in, but comment 3 is Ravi’s: 403.'
				},
				{
					type: 'response-status',
					request: 2,
					status: 404,
					message: 'There is no comment 99. When `db.get` finds nothing, answer 404.'
				},
				{
					type: 'response-status',
					request: 3,
					status: 204,
					message: 'Ravi deleting his own comment should work: delete it and answer 204.'
				},
				{
					type: 'response-status',
					request: 4,
					status: 204,
					message: 'Ravi logging out should answer 204 after deleting his row from `sessions`.'
				},
				{
					type: 'response-status',
					request: 5,
					status: 401,
					message:
						'After logging out, Ravi’s old token shouldn’t work any more. Delete it from `sessions` in `DELETE /session`.'
				},
				{
					type: 'response-status',
					request: 6,
					status: 401,
					message: 'Logging out with no token at all: 401.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT id FROM comments ORDER BY id',
					expected: [{ id: 1 }, { id: 2 }, { id: 4 }, { id: 5 }],
					message: 'Only comment 3 should be gone. Every other comment should still be there.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT token FROM sessions',
					expected: [{ token: 'tok_mina_123' }],
					message: 'After Ravi logs out, only Mina’s session should be left.'
				}
			]
		}
	]
};
