import type { Module, SimRequest, WebWorldSpec } from '#lib/curriculum/types.ts';
import { INKWELL_AT } from '#lib/curriculum/inkwell.ts';

const M = 'security-basics';

/** Inkwell after launch: live data, Mina's and Ravi's accounts and sessions. */
const LIVE = INKWELL_AT('live', true);

/**
 * Real scrambles for the two first accounts (the shared seed has argon2-looking placeholders).
 * In this simulation everyone's password is still 'inkwell-' + their name.
 */
const SEED_HASHES = `db.run('UPDATE users SET password_hash = ? WHERE name = ?', [hash('inkwell-mina'), 'mina']);
db.run('UPDATE users SET password_hash = ? WHERE name = ?', [hash('inkwell-ravi'), 'ravi']);`;

/** The FREE COINS comment under Opening night (episode 7): a tag in the name, a script in the text. */
const SPAM = `
INSERT INTO comments (id, episode_id, author, text, created_at) VALUES
  (9, 7, '<b>FREE COINS</b>', 'Free coins for every reader! <script>sendTokensTo("free-coins.example")</script>', '2026-10-14');
`;

function server(requests: SimRequest[], extra: Partial<WebWorldSpec> = {}): WebWorldSpec {
	return { kind: 'web', role: 'server', schema: LIVE, requests, ...extra };
}

/** The signup route as it should be (level 2 onwards). */
const SIGNUP = `app.post('/signup', (req, res) => {
  const info = db.run(
    'INSERT INTO users (name, password_hash) VALUES (?, ?)',
    [req.body.name, hash(req.body.password)]
  );
  res.status(201).json({ id: info.lastId });
});
`;

/** The login route as it should be. */
const LOGIN = `app.post('/login', (req, res) => {
  const user = db.get('SELECT * FROM users WHERE name = ?', [req.body.name]);
  if (!user || !hashMatches(req.body.password, user.password_hash)) {
    res.status(401).json({ error: 'Wrong name or password' });
  } else {
    res.json({ welcome: user.name });
  }
});
`;

/** The comments route that sends every comment exactly as it was typed. */
const RAW_COMMENTS = `app.get('/episodes/:id/comments', (req, res) => {
  const rows = db.all('SELECT author, text FROM comments WHERE episode_id = ? ORDER BY id', [req.params.id]);
  // one card per comment: who wrote it, and what they wrote
  res.json(rows.map((c) => ({ author: c.author, text: c.text })));
});
`;

const SAFE_COMMENTS = `app.get('/episodes/:id/comments', (req, res) => {
  const rows = db.all('SELECT author, text FROM comments WHERE episode_id = ? ORDER BY id', [req.params.id]);
  // one card per comment: who wrote it, and what they wrote
  res.json(rows.map((c) => ({ author: escape(c.author), text: escape(c.text) })));
});
`;

const GLUED_SEARCH = `app.get('/search', (req, res) => {
  const q = req.query.q || '';
  const sql = "SELECT id, title FROM episodes WHERE published = 1 AND title LIKE '%" + q + "%' ORDER BY id";
  res.json(db.all(sql));
});
`;

const SAFE_SEARCH = `app.get('/search', (req, res) => {
  const q = req.query.q || '';
  res.json(db.all(
    'SELECT id, title FROM episodes WHERE published = 1 AND title LIKE ? ORDER BY id',
    ['%' + q + '%']
  ));
});
`;

const PUBLIC_HEADER = `// Inkwell's public API: anyone can call it, no login needed.
// Since this week its database connection can only read.
`;

const PUBLIC_COMMENTS = `app.get('/episodes/:id/comments', (req, res) => {
  res.json(db.all('SELECT author, text FROM comments WHERE episode_id = ? ORDER BY id', [req.params.id]));
});
`;

/** The reader server as it still runs in production: launch week's code. */
const AUDIT_STARTER = `// The Inkwell reader server, exactly as it runs today (launch week's code).
// The audit found five problems in here.

app.post('/signup', (req, res) => {
  const info = db.run(
    'INSERT INTO users (name, password_hash) VALUES (?, ?)',
    [req.body.name, req.body.password]
  );
  res.status(201).json({ id: info.lastId });
});

app.post('/login', (req, res) => {
  log('Login attempt:', req.body);
  const user = db.get('SELECT * FROM users WHERE name = ?', [req.body.name]);
  if (!user || user.password_hash !== req.body.password) {
    res.status(401).json({ error: 'Wrong name or password' });
  } else {
    res.json({ welcome: user.name });
  }
});

${RAW_COMMENTS}
${GLUED_SEARCH}`;

const AUDIT_SOLUTION = `// The Inkwell reader server, after the audit.

${SIGNUP}
app.post('/login', (req, res) => {
  log('Login attempt:', req.body.name);
  const user = db.get('SELECT * FROM users WHERE name = ?', [req.body.name]);
  if (!user || !hashMatches(req.body.password, user.password_hash)) {
    res.status(401).json({ error: 'Wrong name or password' });
  } else {
    res.json({ welcome: user.name });
  }
});

${SAFE_COMMENTS}
${SAFE_SEARCH}`;

const JUNE_SIGNS_UP: SimRequest = {
	method: 'POST',
	path: '/signup',
	body: { name: 'june_b', password: 'hunter22' },
	label: 'june_b signs up'
};

const LOGINS: SimRequest[] = [
	{
		method: 'POST',
		path: '/login',
		body: { name: 'june_b', password: 'hunter22' },
		label: 'june_b logs in'
	},
	{
		method: 'POST',
		path: '/login',
		body: { name: 'june_b', password: 'hunter2' },
		label: 'someone guesses june_b’s password'
	},
	{
		method: 'POST',
		path: '/login',
		body: { name: 'mina', password: 'inkwell-mina' },
		label: 'Mina logs in'
	}
];

export const securityBasics: Module = {
	id: M,
	track: 'web',
	order: 16,
	emoji: '🛡️',
	title: 'Security basics',
	blurb:
		'Inkwell’s first scare, and the four habits that stop most attacks: hash passwords, parameterise queries, escape what you show, and give every part only the access it needs.',
	prereq: 'Easier if you’ve done Learn to code, parts 1–5 (variables, if, loops, functions).',
	lessons: [
		{
			id: `${M}/01-predict-the-leak`,
			slug: '01-predict-the-leak',
			kind: 'predict',
			title: 'The file on the forum',
			xp: 15,
			story:
				'Launch went well. Then, a week later, Theo forwards a link with no message, just 😬. Someone has posted `inkwell-friday.db` on a forum: the backup he made the Friday before launch and shared with a “temporary” link that never stopped working. Before anyone panics, you open the file the way a stranger would.',
			task: 'Read the query a stranger would run on the file, and decide what they got.',
			language: 'sql',
			code: `-- Friday's backup, as anyone who downloaded it can see it
SELECT name, password_hash FROM users;
`,
			world: { kind: 'web', role: 'sql', schema: LIVE, serverCode: SEED_HASHES },
			question:
				'Mina’s first question: “Do they have my password?” What did the people who downloaded the file get from the `users` table?',
			choices: [
				'Mina’s and Ravi’s passwords, ready to type into the login screen',
				'Their names and, for each, a 64-character scramble of the password, but not the password itself',
				'Nothing readable: a database file is encrypted on its own',
				'Only the names: passwords are kept in a separate system'
			],
			answer: 1,
			explanation:
				'What leaked is a **hash** of each password: the password run through a one-way scramble. One-way means there is no way to run it backwards. The same input always gives the same output, though, and that’s how logging in still works: the server scrambles what you type and compares the two scrambles. So the strangers got names and scrambles, not passwords. They can still guess: scramble `password123`, look for a match, try the next one. That’s why weak passwords are in danger even now. Two jobs for today anyway: turn off that share link, and empty the `sessions` table, because the login tickets were in the file too, and they work like keys.',
			hints: [
				'Look at the column the query asks for. Its name is a clue: `password_hash`.',
				'In Who are you? the server never kept the password itself. What did it keep instead?'
			]
		},
		{
			id: `${M}/02-hash-on-signup`,
			slug: '02-hash-on-signup',
			kind: 'code',
			title: 'Scramble it before you store it',
			xp: 25,
			story:
				'Phew: that backup is from before launch, so only Mina and Ravi are in it. Then you read the signup route Theo added on launch night “because people kept asking”. It saves the password exactly as typed, into a column called `password_hash`. The login route he meant to write next is still empty. And june_b, who has been commenting since the very first episode, is about to sign up with the password hunter22.',
			task: "1. Fix `POST /signup` so it stores `hash(req.body.password)` instead of the password.\n2. Write `POST /login`. Find the user by name. If there’s no user, or `hashMatches(req.body.password, user.password_hash)` is false, answer `401` with `{ error: 'Wrong name or password' }`. Otherwise answer `{ welcome: user.name }`.",
			concept: {
				title: 'A hash is a one-way scramble',
				panels: [
					{
						who: 'you',
						text: 'A **hash** is a one-way scramble: text goes in, a jumble of a fixed length comes out. Here it’s always 64 characters.',
						scene: 'database',
						code: "hash('inkwell-mina')   // '32607f8e339dfdde…'"
					},
					{ who: 'mina', text: 'And how do you get my password back out of that?', scene: 'lock' },
					{
						who: 'you',
						text: 'You don’t. Nobody does. There’s no reverse gear, and that’s the whole point.',
						scene: 'lock'
					},
					{
						who: 'bit',
						text: 'Same text in, same jumble out, every time. So at login the server scrambles what I carry and compares the two jumbles.',
						scene: 'wire',
						code: 'hashMatches(req.body.password, user.password_hash)'
					},
					{
						who: 'narrator',
						text: 'Real servers use a password library for this, like the argon2 one from Who are you?. Here, `hash()` and `hashMatches()` play that part.',
						scene: 'server'
					}
				]
			},
			newCommands: ['hash(text)', 'hashMatches(text, hash)'],
			hints: [
				'Signup is a small change: wrap the password, `hash(req.body.password)`. The rest of the route stays as it is.',
				"For login: `const user = db.get('SELECT * FROM users WHERE name = ?', [req.body.name]);`, then `if (!user || !hashMatches(req.body.password, user.password_hash)) { …401… } else { …welcome… }`. Check `!user` first: a name that doesn’t exist has no hash to compare.",
				`Both routes:\n\`\`\`js\n${SIGNUP}\n${LOGIN}\`\`\``
			],
			world: server(
				[
					JUNE_SIGNS_UP,
					...LOGINS,
					{
						method: 'POST',
						path: '/login',
						body: { name: 'nobody', password: 'letmein' },
						label: 'someone tries an account that doesn’t exist'
					}
				],
				{ serverCode: SEED_HASHES }
			),
			starterCode: `// Added on launch night, in a hurry. It works, but look at what it stores.
app.post('/signup', (req, res) => {
  const info = db.run(
    'INSERT INTO users (name, password_hash) VALUES (?, ?)',
    [req.body.name, req.body.password]
  );
  res.status(201).json({ id: info.lastId });
});

app.post('/login', (req, res) => {
  // 1. Find the user by name (use ?)
  // 2. No user, or hashMatches(...) is false? 401 { error: 'Wrong name or password' }
  // 3. Otherwise answer { welcome: user.name }
});
`,
			solution: `${SIGNUP}
${LOGIN}`,
			checks: [
				{ type: 'response-status', request: 0, status: 201 },
				{
					type: 'db-rows',
					sql: "SELECT COUNT(*) AS n FROM users WHERE password_hash = 'hunter22'",
					expected: [{ n: 0 }],
					message:
						'june_b’s password is sitting in the `users` table exactly as typed. Store `hash(req.body.password)` instead.'
				},
				{
					type: 'db-rows',
					sql: "SELECT COUNT(*) AS n FROM users WHERE name = 'june_b' AND length(password_hash) = 64",
					expected: [{ n: 1 }],
					message:
						'june_b should be in `users` with a 64-character scramble as the `password_hash`: that’s what `hash()` gives back.'
				},
				{
					type: 'response-status',
					request: 1,
					status: 200,
					message:
						'june_b should be able to log in with the password from a moment ago. `hashMatches()` scrambles what was typed and compares the two scrambles.'
				},
				{
					type: 'response-status',
					request: 2,
					status: 401,
					message: 'A wrong password gets 401.'
				},
				{
					type: 'response-status',
					request: 3,
					status: 200,
					message:
						'Mina’s stored password is a scramble, so comparing it with what she typed using `===` never matches. Use `hashMatches(req.body.password, user.password_hash)`.'
				},
				{
					type: 'response-status',
					request: 4,
					status: 401,
					message:
						'A name that doesn’t exist gets 401 too, with the same message. Check `!user` before comparing: there’s no hash to compare against.'
				},
				{
					type: 'code-includes',
					pattern: 'hashMatches\\s*\\(',
					message:
						'Check the password with `hashMatches(req.body.password, user.password_hash)`. Real password libraries need their own compare step, so it’s a good habit.'
				},
				{
					type: 'queries-parameterized',
					message: 'Use `?` for the name in the login query, and pass `[req.body.name]`.'
				}
			]
		},
		{
			id: `${M}/03-predict-twins`,
			slug: '03-predict-twins',
			kind: 'predict',
			title: 'Same password, same scramble',
			xp: 15,
			story:
				'Signups are hashed now, and Theo emails everyone who joined in launch week to pick a new password. june_b and noodlefan sign up again straight away. They share a flat, a sofa and, it turns out, a password: noodles4ever.',
			task: 'Read the signup route and the two requests. Then think like the stranger who gets the next leak.',
			code: SIGNUP,
			world: server(
				[
					{
						method: 'POST',
						path: '/signup',
						body: { name: 'june_b', password: 'noodles4ever' },
						label: 'june_b signs up'
					},
					{
						method: 'POST',
						path: '/signup',
						body: { name: 'noodlefan', password: 'noodles4ever' },
						label: 'noodlefan signs up'
					}
				],
				{ serverCode: SEED_HASHES }
			),
			question:
				'Someone gets hold of the `users` table after these two signups. Without cracking anything, what can they tell about june_b and noodlefan?',
			choices: [
				'Nothing: every hash looks like random noise',
				'That the two have the same password, because their hashes are identical',
				'Both passwords, because two matching hashes cancel each other out',
				'That they share a flat'
			],
			answer: 1,
			explanation:
				'Same input, same output: `noodles4ever` scrambles to the same 64 characters both times, so the two rows match and anyone can see it. Guess one password and you have both. Worse, an attacker can scramble a list of a million common passwords once, then look up every row in the table in one go. Real systems add a **salt**: a random pinch of extra text for each user, mixed in before scrambling and stored next to the hash. With a salt, twins don’t match, and the ready-made list is useless. Remember the `$Zm9vYmFy$` in the middle of Mina’s argon2 hash in Who are you? That part was her salt. Our little `hash()` has no salt, which is why the twins show up here.',
			hints: [
				'Both requests send the same password. What did the last level say about the same text going in?',
				"Nothing secret gets mixed in here: `hash('noodles4ever')` gives the same 64 characters every time it runs."
			]
		},
		{
			id: `${M}/04-predict-script-comment`,
			slug: '04-predict-script-comment',
			kind: 'predict',
			title: 'A comment that runs',
			xp: 15,
			story:
				'Monday morning, an account called FREE COINS comments under Opening night, episode 7. Ravi messages: “Is the app being weird for you?” To show bold and italics, the reader app displays comments as HTML, the language web pages are written in. And the comments route sends every comment out exactly as it was typed.',
			task: 'Read the route and the new comment in the `comments` table. Ravi, then june_b, open episode 7.',
			concept: {
				title: 'When text turns into code, again',
				panels: [
					{
						who: 'bit',
						text: 'Comment delivery for episode 7! This one has a tag in it: `<script>`.',
						scene: 'wire'
					},
					{
						who: 'mina',
						text: 'Phones show text. What harm can a bit of text do?',
						scene: 'phone'
					},
					{
						who: 'you',
						text: 'To HTML, `<b>` means “make this bold”, and `<script>` means “run the code in here”.',
						scene: 'phone',
						code: '<script>sendTokensTo("free-coins.example")</script>'
					},
					{
						who: 'narrator',
						text: 'Remember the comment that deleted the comments? Text from outside, read as instructions. That time it was the database doing the reading.',
						scene: 'database'
					}
				]
			},
			code: RAW_COMMENTS,
			world: server(
				[
					{ method: 'GET', path: '/episodes/7/comments', label: 'Ravi opens episode 7' },
					{ method: 'GET', path: '/episodes/7/comments', label: 'june_b opens episode 7' }
				],
				{ schema: LIVE + SPAM, renderHtml: true }
			),
			question: 'What happens when Ravi and june_b open the comments?',
			choices: [
				'They see the comment with the `<script>` part as odd-looking text',
				'The script runs on Ravi’s phone and on june_b’s, and on every phone that opens episode 7 after them',
				'Only FREE COINS’s own phone runs it, since they wrote it',
				'The server refuses to send it and answers 500'
			],
			answer: 1,
			explanation:
				'The route sends the comment as typed, and the phone treats it as part of the page. To the page, `<script>` is an instruction, so the phone carries it out: on every reader’s phone, as that reader, logged in. A script like that could read their login ticket, post comments in their name, or draw a fake login screen. This is **cross-site scripting**, XSS for short, and it’s injection’s cousin: text from outside, read as instructions. The server can’t know which comment will be tomorrow’s trick, so the fix isn’t to hunt for scripts. It’s to send every text as plain text, and that’s the next level.',
			hints: [
				'Look at what the route does to `c.text` on the way out. Anything at all?',
				'The phone shows comments as HTML, and to HTML, `<script>` isn’t text.'
			]
		},
		{
			id: `${M}/05-fix-escape`,
			slug: '05-fix-escape',
			kind: 'fix',
			title: 'Show it, don’t run it',
			xp: 20,
			story:
				'You deleted the FREE COINS comment by hand, but the next one will look different. Time to fix the route itself, so whatever readers type reaches other phones as plain text. This copy of the database still has the comment, so you can watch the fix work.',
			task: 'In the comments route, run every text through `escape()` before it goes out: `author: escape(c.author)` and `text: escape(c.text)`. The FREE COINS comment should still arrive, just harmless.',
			newCommands: ['escape(text)'],
			hints: [
				'Run it first: the log shows 💥 for each phone that ran the script. Look at the author name too: `<b>FREE COINS</b>` is a tag as well. Both fields come from readers, so both get escaped.',
				'`escape()` turns `<` into `&lt;` (and `>`, `&`, quotes into their own codes), which a phone shows as a plain `<` instead of reading a tag. It takes one piece of text, so wrap each field on its own: `escape(c.author)`, `escape(c.text)`.',
				`The fixed route:\n\`\`\`js\n${SAFE_COMMENTS}\`\`\``
			],
			world: server(
				[
					{ method: 'GET', path: '/episodes/7/comments', label: 'Ravi opens episode 7' },
					{ method: 'GET', path: '/episodes/1/comments', label: 'june_b opens episode 1' }
				],
				{ schema: LIVE + SPAM, renderHtml: true }
			),
			starterCode: RAW_COMMENTS,
			solution: SAFE_COMMENTS,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{ type: 'screen-no-script' },
				{ type: 'response-no-script', request: 0 },
				{
					type: 'screen-includes',
					text: '&lt;script&gt;',
					message:
						'The FREE COINS comment should still be in the list, shown as harmless text (`&lt;script&gt;…`). Escape it rather than leaving it out: tomorrow’s trick won’t look like today’s.'
				},
				{
					type: 'screen-includes',
					text: '&lt;b&gt;FREE COINS',
					message:
						'The author name has a tag in it too (`<b>FREE COINS</b>`). Escape `c.author` as well as `c.text`.'
				},
				{
					type: 'response-json',
					request: 1,
					expected: [
						{ author: 'ravi', text: 'That last panel. Wow.' },
						{ author: 'june_b', text: 'The cat is the real main character' }
					],
					message:
						'Ordinary comments should come through unchanged, as a list of `{ author, text }`. `escape()` leaves normal text alone; escape each field, not the whole list.'
				}
			]
		},
		{
			id: `${M}/06-fix-least-access`,
			slug: '06-fix-least-access',
			kind: 'fix',
			title: 'The public API only reads',
			xp: 25,
			story:
				'After the leak, Theo agreed to one more rule: every part of Inkwell gets only the access it needs. The public API (the one Panelhub, a webtoon directory, calls to list Inkwell’s episodes, no login needed) now talks to the database through a connection that can only read. You switch it over and run the usual requests, including a sneaky search somebody tried last night. Two things break.',
			task: "1. The search glues `q` into the SQL. Use `LIKE ?` and pass `['%' + q + '%']`.\n2. `POST /reset-comments` tries to delete through the read-only connection and crashes with a 500. A public API has no business deleting anything: make it answer `403` with `{ error: 'The public API can only read' }`, without touching the database.",
			concept: {
				title: 'The four habits',
				panels: [
					{
						who: 'theo',
						text: 'After this week I want the rules on the wall. Short ones.',
						scene: 'none'
					},
					{
						who: 'you',
						text: '**Hash** passwords, so a leak only gives away scrambles. **Parameterise** queries with `?`, so text stays text in SQL.',
						scene: 'lock'
					},
					{
						who: 'you',
						text: '**Escape** what you show, so text stays text on the page. And **least access**: every part gets only the rights it needs.',
						scene: 'phone'
					},
					{
						who: 'bit',
						text: 'Like my badge. It opens the post room. Not the vault, and not Theo’s office.',
						scene: 'wire'
					},
					{
						who: 'mina',
						text: 'So if someone tricks the public API, the worst they can do is read what’s public anyway?',
						scene: 'server'
					},
					{
						who: 'you',
						text: 'Exactly. A connection that can only read can’t delete, however clever the trick.',
						scene: 'database',
						code: 'This database connection may only read.'
					}
				]
			},
			hints: [
				'Run it and read the log. The sneaky search smuggled a `DELETE` into the SQL, and the read-only connection refused it. Good for the data, but a 500 is still our bug, and the hole is still there.',
				"Search: `db.all('SELECT id, title FROM episodes WHERE published = 1 AND title LIKE ? ORDER BY id', ['%' + q + '%'])`. Reset: replace the whole inside of the handler with `res.status(403).json({ error: 'The public API can only read' });`.",
				`The fixed API:\n\`\`\`js\n${SAFE_SEARCH}\n${PUBLIC_COMMENTS}\napp.post('/reset-comments', (req, res) => {\n  res.status(403).json({ error: 'The public API can only read' });\n});\n\`\`\``
			],
			world: server(
				[
					{ method: 'GET', path: '/search?q=fox', label: 'Panelhub searches “fox”' },
					{
						method: 'GET',
						path: '/search?q=x%27%3B%20DELETE%20FROM%20comments%3B%20--',
						label: "someone searches for x'; DELETE FROM comments; --"
					},
					{
						method: 'POST',
						path: '/reset-comments',
						body: { episodeId: 7 },
						label: 'an old script calls reset-comments'
					},
					{
						method: 'GET',
						path: '/episodes/7/comments',
						label: 'Panelhub lists the comments on episode 7'
					}
				],
				{ dbReadOnly: true }
			),
			starterCode: `${PUBLIC_HEADER}
${GLUED_SEARCH}
${PUBLIC_COMMENTS}
// "Handy for clearing out test comments." Added during launch week.
app.post('/reset-comments', (req, res) => {
  db.run('DELETE FROM comments WHERE episode_id = ?', [req.body.episodeId]);
  res.json({ reset: true });
});
`,
			solution: `${PUBLIC_HEADER}
${SAFE_SEARCH}
${PUBLIC_COMMENTS}
// Deleting is a job for the admin tools, not for the public API.
app.post('/reset-comments', (req, res) => {
  res.status(403).json({ error: 'The public API can only read' });
});
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: [{ id: 6, title: 'The clockwork fox' }],
					message:
						"Searching “fox” should find exactly one episode: `{ id: 6, title: 'The clockwork fox' }`."
				},
				{
					type: 'response-status',
					request: 1,
					status: 200,
					message:
						'The sneaky search shouldn’t crash. While `q` is glued into the SQL, it smuggles in a `DELETE` (the read-only connection stops it, hence the 500). With `LIKE ?` it’s just a search for some odd text.'
				},
				{
					type: 'response-json',
					request: 1,
					expected: [],
					message: 'The sneaky search should simply find nothing: no title contains that text.'
				},
				{
					type: 'response-status',
					request: 2,
					status: 403,
					message:
						'`POST /reset-comments` should answer 403: the public API isn’t allowed to delete, so it says so instead of trying. (Leaving the route out gives a 404, which tells old callers they have the wrong address rather than “not allowed”.)'
				},
				{
					type: 'code-excludes',
					pattern: 'DELETE\\s+FROM',
					message:
						'Take the `DELETE` out of the public API. It can’t work through a read-only connection, and it shouldn’t be offered there at all: deleting is a job for the admin tools.'
				},
				{ type: 'response-status', request: 3, status: 200 },
				{
					type: 'db-rows',
					sql: 'SELECT COUNT(*) AS n FROM comments',
					expected: [{ n: 8 }],
					message: 'All 8 comments should still be there.'
				},
				{
					type: 'queries-parameterized',
					message:
						"The search text is still glued into the SQL. Write `LIKE ?` in the SQL and pass `['%' + q + '%']` in the list."
				}
			]
		},
		{
			id: `${M}/07-boss-the-audit`,
			slug: '07-boss-the-audit',
			kind: 'code',
			title: 'The audit',
			xp: 50,
			boss: true,
			story:
				'A journalist wants to write about Inkwell, so Theo books a proper security audit first. The auditor asks for the reader server exactly as it runs in production, and there’s a catch: this week’s fixes went into your practice copies, never into that file. It’s still launch week’s code. Her report lists five findings, and she’ll check your fixed version with real requests, a few unfriendly ones included.',
			task: "Fix the five findings:\n\n1. Signup stores the password as typed: store `hash(req.body.password)`.\n2. Login compares plain text: use `hashMatches(req.body.password, user.password_hash)`.\n3. Login writes the whole `req.body` to the log, password and all: log only the name, `log('Login attempt:', req.body.name)`.\n4. Comments go out as typed: `escape()` the author and the text.\n5. Search glues `q` into the SQL: use `LIKE ?` with `['%' + q + '%']`.",
			concept: {
				title: 'Secrets never go in logs',
				panels: [
					{
						who: 'mina',
						text: 'Why does it matter what’s in the log? Only we read it.',
						scene: 'server'
					},
					{
						who: 'you',
						text: 'Logs travel. They get copied to log services, pasted into support tickets and packed into backups. Backups like the one on that forum.',
						scene: 'cloud'
					},
					{
						who: 'bit',
						text: 'And `log(req.body)` writes down everything I carry: name, comment, password, the lot.',
						scene: 'wire'
					},
					{
						who: 'you',
						text: 'So log who and what happened, never the secret itself.',
						scene: 'server',
						code: "log('Login attempt:', req.body.name)"
					},
					{
						who: 'narrator',
						text: 'Same for login tickets, API keys and the database password in `env`. If it opens something, it stays out of the log.',
						scene: 'lock'
					}
				]
			},
			outro: {
				panels: [
					{
						who: 'narrator',
						scene: 'lock',
						text: 'The auditor’s second report is one line long: “No findings.” Theo prints it and pins it next to the launch-day log.'
					},
					{
						who: 'theo',
						scene: 'none',
						text: 'So we were never storing passwords, right?'
					},
					{
						who: 'mina',
						scene: 'none',
						text: 'We were. For a week. Your signup route, Theo.'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'Tonight’s backup run: one file, every password a 64-character jumble. I had a look. Can’t read a word of it, and neither can anyone else.'
					}
				]
			},
			hints: [
				'Go finding by finding and run after each one: the failing checks tell you which findings are still open. Findings 1 and 2 are the same as in Scramble it before you store it.',
				"Finding 3 is one line: `log('Login attempt:', req.body.name);`. Finding 4: `author: escape(c.author), text: escape(c.text)`. Finding 5: `'… AND title LIKE ? ORDER BY id', ['%' + q + '%']`.",
				`The whole server after the audit:\n\`\`\`js\n${AUDIT_SOLUTION}\`\`\``
			],
			world: server(
				[
					JUNE_SIGNS_UP,
					...LOGINS,
					{ method: 'GET', path: '/episodes/7/comments', label: 'Ravi opens episode 7' },
					{ method: 'GET', path: '/search?q=spicy', label: 'a reader searches “spicy”' },
					{
						method: 'GET',
						path: '/search?q=%27%20OR%201%3D1%20--',
						label: "the auditor searches for ' OR 1=1 --"
					}
				],
				{ schema: LIVE + SPAM, serverCode: SEED_HASHES, renderHtml: true }
			),
			starterCode: AUDIT_STARTER,
			solution: AUDIT_SOLUTION,
			checks: [
				{ type: 'response-status', request: 0, status: 201 },
				{
					type: 'db-rows',
					sql: "SELECT COUNT(*) AS n FROM users WHERE password_hash = 'hunter22'",
					expected: [{ n: 0 }],
					message:
						'Finding 1: june_b’s password is in the `users` table as typed. Store `hash(req.body.password)`.'
				},
				{
					type: 'response-status',
					request: 1,
					status: 200,
					message: 'june_b should be able to log in right after signing up.'
				},
				{
					type: 'response-status',
					request: 2,
					status: 401,
					message: 'A wrong password gets 401.'
				},
				{
					type: 'response-status',
					request: 3,
					status: 200,
					message:
						'Finding 2: Mina’s stored password is a scramble, so a plain `!==` comparison always says no. Use `hashMatches(req.body.password, user.password_hash)`.'
				},
				{
					type: 'log-excludes',
					text: 'hunter22',
					message:
						'Finding 3: the server log contains june_b’s password, `hunter22`. Log who tried (`req.body.name`), never what they typed.'
				},
				{
					type: 'log-includes',
					text: 'Login attempt',
					message:
						"Keep a log line for each login attempt (it helps when someone says they can’t log in), just without the password: `log('Login attempt:', req.body.name)`."
				},
				{
					type: 'screen-no-script',
					message:
						'Finding 4: the FREE COINS script still runs on Ravi’s phone. Escape both fields on the way out: `escape(c.author)` and `escape(c.text)`.'
				},
				{ type: 'response-no-script', request: 4 },
				{
					type: 'screen-includes',
					text: 'I can smell this episode',
					message: 'The comments on episode 7 should still arrive, as a list of `{ author, text }`.'
				},
				{
					type: 'response-json',
					request: 5,
					expected: [{ id: 8, title: 'Extra spicy' }],
					message:
						"Searching “spicy” should find exactly one episode: `{ id: 8, title: 'Extra spicy' }`."
				},
				{
					type: 'response-json',
					request: 6,
					expected: [],
					message:
						'Finding 5: the auditor’s sneaky search should find nothing. If it found every episode, `q` is still glued into the SQL.'
				},
				{
					type: 'queries-parameterized',
					message:
						"Finding 5: the search text is glued into the SQL. Write `LIKE ?` and pass `['%' + q + '%']`."
				}
			]
		}
	]
};
