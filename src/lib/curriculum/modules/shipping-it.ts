import type { Module } from '#lib/curriculum/types.ts';
import { clientWorld, serverWorld } from '#lib/curriculum/inkwell.ts';

const M = 'shipping-it';

/** Stands in for the reverse proxy when the Inkwell app behind it isn't running. */
const PROXY_NOBODY_HOME = `
app.get('/series', (req, res) => {
  res.status(502).json({ error: 'Bad gateway' });
});
app.get('/episodes/:id', (req, res) => {
  res.status(502).json({ error: 'Bad gateway' });
});
`;

export const shippingIt: Module = {
	id: M,
	track: 'web',
	order: 12,
	emoji: '🚚',
	title: 'Shipping it',
	blurb:
		'Where a server actually lives, how a phone finds it, where its settings go, and how to tell what broke when “the app is down”.',
	prereq: 'Easier if you’ve done Learn to code, parts 1–5 (variables, if, loops, functions).',
	lessons: [
		{
			id: `${M}/01-predict-laptop-lid`,
			slug: '01-predict-laptop-lid',
			kind: 'predict',
			title: 'It works on my laptop',
			xp: 15,
			story:
				'Everything works. Theo is thrilled and tells a friend in another city to try the app. Meanwhile you close your laptop and go to lunch, because the Inkwell server is running on your laptop.',
			task: 'Decide what the friend’s phone gets.',
			concept: {
				title: 'Where a server lives',
				panels: [
					{ who: 'theo', text: 'It works. Ship it.', scene: 'none' },
					{
						who: 'you',
						text: 'It works on my laptop. If I close the lid, the server goes to sleep with it.',
						scene: 'server'
					},
					{
						who: 'narrator',
						text: 'A server is just a computer running your program and waiting for requests. Any computer can be one. The trick is one that never sleeps.',
						scene: 'server'
					},
					{ who: 'mina', text: 'So where do the real ones live?', scene: 'none' },
					{
						who: 'bit',
						text: 'In datacenters: huge, cold rooms full of computers with fast connections and backup power. “The cloud” means renting one of them. Someone else’s computer, basically.',
						scene: 'cloud'
					}
				]
			},
			code: `const res = get('/series');
show(res.status);
`,
			world: clientWorld({ serverDown: true }),
			question: 'What does the friend’s phone get when it asks for `/series`?',
			choices: [
				'200 and the series list, from the last time it worked',
				'404, because the server can’t find `/series`',
				'No answer at all: status 0, “Could not reach the server”',
				'500 Server error'
			],
			answer: 2,
			explanation:
				'Every status code, even 404 and 500, is an answer from a server that is up and running. With the laptop asleep there’s nobody to answer, so the phone gets nothing: no status (shown as 0 here) and, in a real app, a spinner and then “could not connect”. That difference is the first question to ask in any outage: did we get an error back, or nothing at all?',
			hints: [
				'404 and 500 are answers. Who would be sending an answer?',
				'If nobody is home, can anybody say “not found”?'
			]
		},
		{
			id: `${M}/02-predict-the-path`,
			slug: '02-predict-the-path',
			kind: 'predict',
			title: 'The trip before the trip',
			xp: 20,
			story:
				'Inkwell now runs on a rented machine in a datacenter, at `https://api.inkwell.studio`. A reader’s phone asks for `https://api.inkwell.studio/series/3?lang=en`. That’s a lot of address. Your handler logs what it actually receives.',
			task: 'Read the trip in the strip, then decide what the handler writes in the log.',
			concept: {
				title: 'Name, address, door, envelope, receptionist',
				panels: [
					{
						who: 'mina',
						text: 'When I type `inkwell.studio`, how does my phone find the right computer?',
						scene: 'phone'
					},
					{
						who: 'bit',
						text: 'First stop is **DNS**, the internet’s phone book. Name in, address out.',
						scene: 'cloud',
						code: 'api.inkwell.studio  →  203.0.113.7'
					},
					{
						who: 'bit',
						text: 'The address gets me to the building. The **port** picks the door: 443 for HTTPS. On your laptop the app used 3000, which is why you typed `:3000`.',
						scene: 'wire'
					},
					{
						who: 'narrator',
						text: '**HTTPS** seals Bit in an envelope that nobody along the way can open or change. That’s the padlock in the browser.',
						scene: 'lock'
					},
					{
						who: 'you',
						text: 'At door 443 sits a receptionist, the **reverse proxy**. It opens the envelope and walks the request to the Inkwell app on port 3000.',
						scene: 'server'
					},
					{
						who: 'bit',
						text: 'By the time I reach your handler, the name, the port and the envelope are gone. What’s left is the method, the path, the query and the body.',
						scene: 'server'
					}
				]
			},
			code: `app.get('/series/:id', (req, res) => {
  log('path: ' + req.path);
  res.json(db.get('SELECT title FROM series WHERE id = ?', [req.params.id]));
});
`,
			world: serverWorld([
				{
					method: 'GET',
					path: '/series/3?lang=en',
					label: 'a reader opens https://api.inkwell.studio/series/3?lang=en'
				}
			]),
			question: 'What does the log line say?',
			choices: [
				'`path: https://api.inkwell.studio/series/3?lang=en`',
				'`path: api.inkwell.studio/series/3`',
				'`path: /series/3`',
				'`path: 203.0.113.7:3000/series/3`'
			],
			answer: 2,
			explanation:
				'Your code only sees `/series/3`. DNS, the port and HTTPS were all dealt with before the request reached the app, and the `?lang=en` part was split off into `req.query`. That’s handy when something breaks: if the phone can’t even reach the building, the problem is in the name, the address or the door, and your handler code isn’t to blame.',
			hints: [
				'Who dealt with the name, the port and the envelope?',
				'Where did the `?lang=en` part go? You’ve read it before as `req.query`.'
			]
		},
		{
			id: `${M}/03-fix-settings`,
			slug: '03-fix-settings',
			kind: 'fix',
			title: 'Settings live outside the code',
			xp: 20,
			story:
				'The server on the rented machine starts and immediately looks for a database at `/Users/mina/Desktop/inkwell-test.db`. That’s a file on Mina’s laptop. The code was copied from there with her settings typed right into it.',
			task: "Use the environment instead of typed-in values: log `'Using database at ' + env.DB_PATH`, and make `/health` answer `{ status: 'ok', app: env.APP_NAME }`.",
			concept: {
				title: 'Environment variables',
				panels: [
					{
						who: 'theo',
						text: 'The test server and the real one need different settings. Do we keep two copies of the code?',
						scene: 'server'
					},
					{
						who: 'you',
						text: 'One copy. The settings live outside it, in **environment variables** that each machine sets for itself.',
						scene: 'server',
						code: "env.DB_PATH    // '/var/data/inkwell.db'\nenv.APP_NAME   // 'Inkwell'"
					},
					{
						who: 'mina',
						text: 'And passwords for other services? Like the email one?',
						scene: 'lock'
					},
					{
						who: 'bit',
						text: 'Same place, never in the code. Code gets copied, shared and pasted into chats. Secrets shouldn’t travel with it.',
						scene: 'lock'
					},
					{
						who: 'narrator',
						text: 'In real Node.js it’s written `process.env.DB_PATH`. Here it’s just `env.DB_PATH`.',
						scene: 'none'
					}
				]
			},
			newCommands: ['env'],
			hints: [
				'Run it and read the first log line. That path only exists on Mina’s laptop.',
				"Swap the typed-in text for the setting: `log('Using database at ' + env.DB_PATH);`. In `/health`, use `app: env.APP_NAME`.",
				"The fixed code:\n```js\nlog('Using database at ' + env.DB_PATH);\n\napp.get('/health', (req, res) => {\n  res.json({ status: 'ok', app: env.APP_NAME });\n});\n```"
			],
			world: serverWorld(
				[{ method: 'GET', path: '/health', label: 'the receptionist checks the app is alive' }],
				{
					env: { APP_NAME: 'Inkwell', DB_PATH: '/var/data/inkwell.db', PORT: '3000' }
				}
			),
			starterCode: `// Copied from Mina's laptop. Works there.
log('Using database at /Users/mina/Desktop/inkwell-test.db');

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'Inkwell (Mina laptop test)' });
});
`,
			solution: `log('Using database at ' + env.DB_PATH);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: env.APP_NAME });
});
`,
			checks: [
				{
					type: 'log-includes',
					text: 'Using database at /var/data/inkwell.db',
					message:
						"The log should name this machine’s database: `'Using database at ' + env.DB_PATH`."
				},
				{
					type: 'response-json',
					request: 0,
					expected: { status: 'ok', app: 'Inkwell' },
					message: "`/health` should answer `{ status: 'ok', app: env.APP_NAME }`."
				},
				{
					type: 'code-excludes',
					pattern: '[\'"]Inkwell[\'"]|/var/data',
					message:
						'That value is typed into the code. Read it from `env` instead, so every machine can bring its own.'
				}
			]
		},
		{
			id: `${M}/04-fix-read-the-log`,
			slug: '04-fix-read-the-log',
			kind: 'fix',
			title: 'The answer is in the log',
			xp: 20,
			story:
				'Theo, at 9:02: “The series pages are broken!” Readers see **Server error** and nothing more. That’s on purpose: the phone gets the short version, and the details go somewhere only you can read.',
			task: 'Run it, read the server log, and fix what it points at. Every reader should get their episode list.',
			concept: {
				title: 'The log is where the truth is',
				panels: [
					{
						who: 'mina',
						text: 'Readers just see “Server error”. That’s all we tell them?',
						scene: 'phone'
					},
					{
						who: 'you',
						text: 'On purpose. Details about our code are none of the internet’s business. They go in the server log, for us.',
						scene: 'server'
					},
					{
						who: 'bit',
						text: 'When a handler trips, the server writes down what, where and why. Then it sends me home with a 500.',
						scene: 'wire',
						code: 'Error in GET /series/1/episodes: There’s no column called …'
					},
					{
						who: 'narrator',
						text: 'Reading logs is most of what “debugging production” means. Start with the first error, not the last.',
						scene: 'none'
					}
				]
			},
			hints: [
				'The log says which request failed and which word the database didn’t know.',
				'Compare the column names in the SQL with the ones the log suggests. One letter is missing.',
				'`publised` should be `published`.'
			],
			world: serverWorld([
				{ method: 'GET', path: '/series/1/episodes', label: 'reader opens Moonlit Deliveries' },
				{ method: 'GET', path: '/series/3/episodes', label: 'reader opens Night Shift Noodles' }
			]),
			starterCode: `app.get('/series/:id/episodes', (req, res) => {
  const rows = db.all(
    'SELECT id, number, title FROM episodes WHERE series_id = ? AND publised = 1 ORDER BY number',
    [req.params.id]
  );
  res.json(rows);
});
`,
			solution: `app.get('/series/:id/episodes', (req, res) => {
  const rows = db.all(
    'SELECT id, number, title FROM episodes WHERE series_id = ? AND published = 1 ORDER BY number',
    [req.params.id]
  );
  res.json(rows);
});
`,
			checks: [
				{ type: 'all-responses-ok' },
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: [{ number: 1 }, { number: 2 }, { number: 3 }],
					message:
						'Moonlit Deliveries should list its three published episodes. The unpublished one (Sketches) stays hidden.'
				},
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: [{ title: 'Opening night' }, { title: 'Extra spicy' }]
				}
			]
		},
		{
			id: `${M}/05-predict-bad-gateway`,
			slug: '05-predict-bad-gateway',
			kind: 'predict',
			title: '“It’s down”',
			xp: 20,
			story:
				'Friday night, the app is “down”. The phone does get an answer, so something is up. The answer is `502 Bad gateway`.',
			task: 'Use what you know about the receptionist to decide where the problem is.',
			code: `const res = get('/series');
show(res.status + ' ' + res.body.error);
`,
			world: clientWorld({ serverCode: PROXY_NOBODY_HOME }),
			question: 'The phone shows `502 Bad gateway`. Where is the problem most likely?',
			choices: [
				'The reader’s phone has no internet',
				'DNS: the name `api.inkwell.studio` can’t be found',
				'The receptionist (proxy) is fine, but the Inkwell app behind it isn’t answering',
				'The database has no series in it'
			],
			answer: 2,
			explanation:
				'Somebody answered, so the phone, DNS and the machine are fine: the reverse proxy picked up. **502** is the proxy saying “I passed your request on, and the app behind me didn’t answer properly”. The app has crashed, hasn’t started, or is listening on a different port. A rough triage map: **nothing at all** (status 0, timeout) → network, DNS or the machine is off. **502/504** → the proxy is up, the app isn’t. **404** → a wrong path, or a route that doesn’t exist. **500** → the app crashed inside a handler: read its log. **401/403** → logins and permissions.',
			hints: [
				'If the phone had no internet, would it get any status at all?',
				'Who is the first thing on the server side to answer a request?'
			]
		},
		{
			id: `${M}/06-read-only-mode`,
			slug: '06-read-only-mode',
			kind: 'code',
			title: 'Read-only night',
			xp: 20,
			story:
				'Tonight the database moves to a bigger machine. For an hour, reading has to keep working, but new comments have to wait or they’ll be lost in the move. The ops plan says the server’s environment will have `READ_ONLY` set to `yes` during the move.',
			task: "In `POST /episodes/:id/comments`, check `env.READ_ONLY` first. When it’s `'yes'`, answer `503` with `{ error: 'Comments are paused for a few minutes. Try again soon.' }` and save nothing. Otherwise carry on as before.",
			hints: [
				"Wrap what’s already there: `if (env.READ_ONLY === 'yes') { … } else { …the existing two lines… }`.",
				'503 means “service unavailable, on purpose, for now”. It tells the phone to try again later, unlike a 500.',
				"The route:\n```js\napp.post('/episodes/:id/comments', (req, res) => {\n  if (env.READ_ONLY === 'yes') {\n    res.status(503).json({ error: 'Comments are paused for a few minutes. Try again soon.' });\n  } else {\n    const r = db.run('INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)', [req.params.id, req.body.author, req.body.text]);\n    res.status(201).json({ id: r.lastId });\n  }\n});\n```"
			],
			world: serverWorld(
				[
					{ method: 'GET', path: '/series', label: 'reader opens the series list' },
					{
						method: 'POST',
						path: '/episodes/7/comments',
						body: { author: 'noodlefan', text: 'Still here at midnight' },
						label: 'noodlefan comments during the move'
					}
				],
				{ env: { APP_NAME: 'Inkwell', READ_ONLY: 'yes' } }
			),
			starterCode: `app.get('/series', (req, res) => {
  res.json(db.all('SELECT id, title FROM series'));
});

app.post('/episodes/:id/comments', (req, res) => {
  const r = db.run(
    'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)',
    [req.params.id, req.body.author, req.body.text]
  );
  res.status(201).json({ id: r.lastId });
});
`,
			solution: `app.get('/series', (req, res) => {
  res.json(db.all('SELECT id, title FROM series'));
});

app.post('/episodes/:id/comments', (req, res) => {
  if (env.READ_ONLY === 'yes') {
    res.status(503).json({ error: 'Comments are paused for a few minutes. Try again soon.' });
  } else {
    const r = db.run(
      'INSERT INTO comments (episode_id, author, text) VALUES (?, ?, ?)',
      [req.params.id, req.body.author, req.body.text]
    );
    res.status(201).json({ id: r.lastId });
  }
});
`,
			checks: [
				{
					type: 'response-status',
					request: 0,
					status: 200,
					message: 'Reading the series list should keep working during the move.'
				},
				{
					type: 'response-status',
					request: 1,
					status: 503,
					message: "While `env.READ_ONLY` is `'yes'`, new comments should get 503."
				},
				{
					type: 'db-rows',
					sql: 'SELECT COUNT(*) AS n FROM comments',
					expected: [{ n: 5 }],
					message:
						'Nothing should be saved during the move: the comments table should still have 5 rows.'
				},
				{
					type: 'code-includes',
					pattern: 'env\\.READ_ONLY',
					message:
						'Decide using `env.READ_ONLY`, so that tomorrow, when it’s switched off, comments work again without anyone touching the code.'
				}
			]
		},
		{
			id: `${M}/07-boss-dress-rehearsal`,
			slug: '07-boss-dress-rehearsal',
			kind: 'code',
			title: 'Dress rehearsal',
			xp: 45,
			boss: true,
			story:
				'The night before launch, Theo runs a dress rehearsal on the real machine. The checklist from the ops person: the startup log must say which port the app listens on (they set `PORT` to `8080`), the receptionist needs a `/health` endpoint to check the app is alive, and every request must come back in the 200s. Something in there is already broken.',
			task: "1. Log `'Listening on port ' + env.PORT` instead of the typed-in port.\n2. Add `GET /health` answering `{ status: 'ok', app: env.APP_NAME }`.\n3. Run it, read the log, and fix the endpoint that answers 500.",
			hints: [
				'Run it first. The log tells you which port the code claims, and which request crashed and why.',
				"For `/health`, copy the shape from the settings level: `app.get('/health', (req, res) => { res.json({ status: 'ok', app: env.APP_NAME }); });`. In the episodes SQL, the log points at a misspelled column.",
				"The whole program:\n```js\nlog('Listening on port ' + env.PORT);\n\napp.get('/health', (req, res) => {\n  res.json({ status: 'ok', app: env.APP_NAME });\n});\n\napp.get('/series', (req, res) => {\n  res.json(db.all('SELECT id, title FROM series ORDER BY id'));\n});\n\napp.get('/series/:id/episodes', (req, res) => {\n  res.json(db.all('SELECT id, number, title FROM episodes WHERE series_id = ? AND published = 1 ORDER BY number', [req.params.id]));\n});\n```"
			],
			world: serverWorld(
				[
					{ method: 'GET', path: '/health', label: 'the receptionist checks the app is alive' },
					{ method: 'GET', path: '/series', label: 'Theo opens the series list' },
					{ method: 'GET', path: '/series/2/episodes', label: 'Theo opens Grove & Gear' }
				],
				{
					env: { APP_NAME: 'Inkwell', PORT: '8080', DB_PATH: '/var/data/inkwell.db' }
				}
			),
			starterCode: `log('Listening on port 3000');

app.get('/series', (req, res) => {
  res.json(db.all('SELECT id, title FROM series ORDER BY id'));
});

app.get('/series/:id/episodes', (req, res) => {
  res.json(db.all(
    'SELECT id, number, title FROM episodes WHERE series_id = ? AND published = 1 ORDER BY nubmer',
    [req.params.id]
  ));
});
`,
			solution: `log('Listening on port ' + env.PORT);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: env.APP_NAME });
});

app.get('/series', (req, res) => {
  res.json(db.all('SELECT id, title FROM series ORDER BY id'));
});

app.get('/series/:id/episodes', (req, res) => {
  res.json(db.all(
    'SELECT id, number, title FROM episodes WHERE series_id = ? AND published = 1 ORDER BY number',
    [req.params.id]
  ));
});
`,
			checks: [
				{
					type: 'log-includes',
					text: 'Listening on port 8080',
					message:
						"The startup log should say the port from the environment: `'Listening on port ' + env.PORT`."
				},
				{
					type: 'response-json',
					request: 0,
					expected: { status: 'ok', app: 'Inkwell' },
					message:
						"Add `GET /health` answering `{ status: 'ok', app: env.APP_NAME }`, so the receptionist can tell the app is alive."
				},
				{
					type: 'all-responses-ok',
					message:
						'Every request in the rehearsal should get an answer in the 200s. Read the server log for the one that didn’t.'
				},
				{
					type: 'response-json',
					request: 2,
					mode: 'subset',
					expected: [{ number: 1 }, { number: 2 }],
					message: 'Grove & Gear should list its two episodes, in order.'
				},
				{
					type: 'code-excludes',
					pattern: '3000|8080',
					message:
						'Don’t type the port into the code. Read it from `env.PORT`, so the ops person can change it without asking you.'
				}
			]
		}
	]
};
