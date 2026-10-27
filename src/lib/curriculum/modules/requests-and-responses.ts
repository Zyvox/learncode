import type { Module } from '#lib/curriculum/types.ts';
import { INKWELL_SERVER, clientWorld } from '#lib/curriculum/inkwell.ts';

const M = 'requests-and-responses';

/**
 * Last night's update broke one endpoint: the episodes of series 3 are read from a table
 * called `episode` (no s). Registered first, so it wins over the working route.
 */
const BROKEN_NOODLES = `
app.get('/series/3/episodes', (req, res) => {
  res.json(db.all('SELECT id, number, title, likes FROM episode WHERE series_id = 3 ORDER BY number'));
});
`;

export const requestsAndResponses: Module = {
	id: M,
	track: 'web',
	order: 2,
	emoji: '✉️',
	title: 'Requests and responses',
	blurb:
		'What a request really says, what the status numbers mean, and how to ask for exactly the thing you want.',
	lessons: [
		{
			id: `${M}/01-the-question`,
			slug: '01-the-question',
			kind: 'code',
			title: 'What Bit actually carries',
			xp: 15,
			story:
				'Mina has started reading the picture above the editor: “Bit’s label says `GET /episodes`. What’s the GET for? And what does the answer look like on the way back, before the phone tidies it up?”',
			task: 'Ask for `/episodes` and show the body on the phone. Then write the raw text Bit carried back into the log with `log(res.text())`.',
			concept: {
				title: 'Method + path = the question',
				panels: [
					{
						who: 'bit',
						scene: 'wire',
						text: 'Every request I carry starts with two words: a **method** and a **path**.',
						code: 'GET /episodes'
					},
					{
						who: 'bit',
						text: 'The method is the kind of question: **GET** means “give me”, and **POST** means “here’s something new, please keep it”.'
					},
					{
						who: 'bit',
						scene: 'server',
						text: 'The path is what it’s about, like an address inside the server: `/series`, `/episodes`.'
					},
					{
						who: 'you',
						text: "So `get('/episodes')` sends GET /episodes. The command’s name is the method, the text in quotes is the path."
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'On the way back, the body travels as plain text in a format called **JSON**. `res.text()` gives you that raw text, and `res.body` is the same thing, unpacked for you.',
						code: 'log(res.text())'
					}
				]
			},
			newCommands: ['log(value)', 'res.text()'],
			hints: [
				"Three lines: ask, show, log. The first one is `const res = get('/episodes')`.",
				'`show(res.body)` puts the episodes on the phone. `log(...)` writes a line into the log, which is for you, not for readers.',
				"The whole thing:\n```js\nconst res = get('/episodes')\nshow(res.body)\nlog(res.text())\n```"
			],
			world: clientWorld(),
			starterCode: `// Ask for /episodes, show the body, and log the raw text.

`,
			solution: `// Ask for /episodes, show the body, and log the raw text.
const res = get('/episodes')
show(res.body)
log(res.text())
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: [
						{ title: 'The first parcel' },
						{ title: 'Rain on Pine Street' },
						{ title: 'The locked gate' },
						{ title: 'A seed in the gears' },
						{ title: 'The clockwork fox' }
					],
					message: "Ask for the episodes with `get('/episodes')`."
				},
				{
					type: 'screen-includes',
					text: 'The clockwork fox',
					message: 'Show the episodes on the phone with `show(res.body)`.'
				},
				{
					type: 'log-includes',
					text: '"title":"The clockwork fox"',
					message: 'Write the raw text of the answer into the log with `log(res.text())`.'
				}
			]
		},
		{
			id: `${M}/02-status-families`,
			slug: '02-status-families',
			kind: 'predict',
			title: 'Whose problem is it?',
			xp: 15,
			story:
				'A message from support: since last night’s update, readers of Night Shift Noodles can’t open the episode list, though Moonlit Deliveries works fine. Theo wants to know who to call.',
			task: 'Read the code, then pick the status the Night Shift Noodles request gets.',
			concept: {
				title: 'Status codes come in families',
				panels: [
					{
						who: 'bit',
						text: 'You don’t need to learn every status number. Look at the first digit: it tells you the family.'
					},
					{
						who: 'bit',
						scene: 'phone',
						text: '**2xx** (200, 201…): it worked. Here you go.',
						code: '200'
					},
					{
						who: 'bit',
						scene: 'phone',
						text: '**4xx** (400, 404…): you asked wrong, with a path that doesn’t exist or something missing from the request. The phone’s side of the fence.',
						code: '404'
					},
					{
						who: 'bit',
						scene: 'server',
						text: '**5xx** (500…): the server broke while working on a perfectly good request. The server’s side of the fence.',
						code: '500'
					},
					{
						who: 'theo',
						text: 'So the first digit tells me who to call. I like that.'
					}
				]
			},
			code: `const moonlit = get('/series/1/episodes')
const noodles = get('/series/3/episodes')
show(moonlit.status)
show(noodles.status)
`,
			world: clientWorld({ serverCode: BROKEN_NOODLES + INKWELL_SERVER }),
			question: 'The first request gets `200`. What status does `noodles` get?',
			choices: [
				'`200`, with an empty list',
				'`404`, because the path is wrong',
				'`500`, because the server broke while answering',
				'`0`, because the server is down'
			],
			answer: 2,
			explanation:
				'`500`. The server is on (Moonlit got a `200`) and the path is fine (it’s the same shape as the one that worked), so it isn’t `0` or `404`. The request was good; the code behind it broke. Look at the server log under the picture: last night’s update asks the database for a table called `episode` instead of `episodes`. A 5xx is the server team’s problem, and the log is where they start.',
			hints: [
				'The same request for series 1 works. So is the server on? Is the path a real one?',
				'If the question was fine and the server is on, the problem is on the server’s side of the fence. Which family is that?'
			]
		},
		{
			id: `${M}/03-path-parameters`,
			slug: '03-path-parameters',
			kind: 'code',
			title: 'Episode number three',
			xp: 20,
			story:
				'Mina wants a link straight to one episode, for a post about her favourite: episode 3, The locked gate. Asking for the whole list and picking one out works, but the server can hand over just one.',
			task: 'Change the path so the phone shows the title of episode 3. Then add a request for episode `99`, which doesn’t exist, and log its status.',
			concept: {
				title: 'A path can name one thing',
				panels: [
					{
						who: 'you',
						text: '`/episodes` is all of them. Add an id to the end of the path and you’re asking for exactly one.',
						code: "get('/episodes/3')"
					},
					{
						who: 'bit',
						scene: 'server',
						text: 'The server reads that last part as a value, called a **path parameter**. Same address, different door number.'
					},
					{
						who: 'bit',
						text: 'If there’s no episode behind that door, the server answers `404`: not found, you asked for something that isn’t there.',
						code: "get('/episodes/99')   // 404"
					}
				]
			},
			hints: [
				'The id goes at the end of the path. Change the `1` in `/episodes/1` to `3`.',
				"For episode 99, make a second request with its own name: `const missing = get('/episodes/99')`, then `log(missing.status)`.",
				"The whole thing:\n```js\nconst ep = get('/episodes/3')\nshow(ep.body.title)\n\nconst missing = get('/episodes/99')\nlog(missing.status)\n```"
			],
			world: clientWorld(),
			starterCode: `const ep = get('/episodes/1')
show(ep.body.title)
`,
			solution: `const ep = get('/episodes/3')
show(ep.body.title)

const missing = get('/episodes/99')
log(missing.status)
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: { id: 3, title: 'The locked gate' },
					message: "The first request should ask for episode 3: `get('/episodes/3')`."
				},
				{
					type: 'screen-includes',
					text: 'The locked gate',
					message: 'The phone should show the title of episode 3, The locked gate.'
				},
				{
					type: 'response-json',
					request: 1,
					expected: { error: 'No episode with id 99' },
					message: "The second request should ask for episode 99: `get('/episodes/99')`."
				},
				{
					type: 'log-includes',
					text: '404',
					message: 'Log the status of the request for episode 99, with `log(...)`.'
				}
			]
		},
		{
			id: `${M}/04-fix-query-string`,
			slug: '04-fix-query-string',
			kind: 'fix',
			title: 'Page two',
			xp: 20,
			story:
				'The episode list only ever has five episodes in it. That’s on purpose: the server hands them out a page at a time, so the phone doesn’t download everything at once. Theo tried to ask for page 2 and got a 404 that says something very odd.',
			task: 'Run it and read the error. Then fix the path so the phone shows page 2 of the episodes.',
			concept: {
				title: 'Asking more precisely: ?page=2',
				panels: [
					{
						who: 'theo',
						text: 'I want the same list, just the next five. Do I need a different path?'
					},
					{
						who: 'you',
						text: 'Same path, plus a question mark and some extra details after it. That part is called the **query string**.',
						code: "get('/episodes?page=2')"
					},
					{
						who: 'bit',
						scene: 'server',
						text: 'Everything after `?` is a note for the server: “same list, page 2, please”. A slash would mean a different place entirely.'
					}
				]
			},
			hints: [
				'The error says there’s no episode with the id `page=2`. The server read `page=2` as a path parameter, like the `3` in `/episodes/3`.',
				'Extra details like the page number go after a `?`, not after a `/`.',
				"Change the path to `'/episodes?page=2'`."
			],
			world: clientWorld(),
			starterCode: `const res = get('/episodes/page=2')
show(res.body)
`,
			solution: `const res = get('/episodes?page=2')
show(res.body)
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: [{ title: 'Opening night' }, { title: 'Extra spicy' }],
					message: 'Ask for page 2 of `/episodes`, using `?page=2`.'
				},
				{
					type: 'screen-includes',
					text: 'Extra spicy',
					message: 'Show page 2 on the phone with `show(res.body)`.'
				}
			]
		},
		{
			id: `${M}/05-res-ok`,
			slug: '05-res-ok',
			kind: 'code',
			title: 'Coming soon',
			xp: 20,
			story:
				'Episode 4 of Moonlit Deliveries is still a sketch, so the server doesn’t hand it out yet. But a reader followed an early link to it, and the phone shows the word `undefined`. Not a great look.',
			task: 'Use `res.ok`: when it worked, show the title; otherwise show **Coming soon**.',
			concept: {
				title: 'res.ok: did it work?',
				panels: [
					{
						who: 'mina',
						scene: 'phone',
						text: 'Why does it say “undefined”?'
					},
					{
						who: 'you',
						text: 'The answer was a `404`, and its body is an error message with no title in it. The phone tried to show a title that isn’t there.'
					},
					{
						who: 'bit',
						text: '`res.ok` is a shortcut: `true` for any status in the 200s, `false` for anything else. No need to remember the numbers.'
					},
					{
						who: 'you',
						text: 'So the app can choose what to show. `if` and `else` read the way they sound:',
						code: "if (res.ok) {\n  show(res.body.title)\n} else {\n  show('Coming soon')\n}"
					}
				]
			},
			newCommands: ['res.ok'],
			hints: [
				'Run it first and look at the status Bit brings back for episode 4.',
				"Wrap the `show` line in `if (res.ok) { … }`, and add an `else { … }` that shows `'Coming soon'`.",
				"The whole thing:\n```js\nconst res = get('/episodes/4')\nif (res.ok) {\n  show(res.body.title)\n} else {\n  show('Coming soon')\n}\n```"
			],
			world: clientWorld(),
			starterCode: `const res = get('/episodes/4')
show(res.body.title)
`,
			solution: `const res = get('/episodes/4')
if (res.ok) {
  show(res.body.title)
} else {
  show('Coming soon')
}
`,
			checks: [
				{
					type: 'response-status',
					request: 0,
					status: 404,
					message: "Keep asking for episode 4: `get('/episodes/4')`."
				},
				{
					type: 'screen-includes',
					text: 'Coming soon',
					message: 'When the answer isn’t OK, the phone should show Coming soon.'
				},
				{
					type: 'code-includes',
					pattern: 'res\\.ok',
					message:
						'Let `res.ok` decide what to show, so the title still appears once episode 4 is published.'
				}
			]
		},
		{
			id: `${M}/06-fix-wrong-method`,
			slug: '06-fix-wrong-method',
			kind: 'fix',
			title: 'Wrong kind of question',
			xp: 20,
			story:
				'Theo copied this line from a tutorial for a different app, and the phone says `Not found: POST /series`. “But `/series` exists. I’ve seen it.” He has. Something else about the question is wrong.',
			task: 'Fix the request so the phone shows the list of series.',
			hints: [
				'Read the error: it names the method as well as the path. Which kind of question is it asking?',
				'POST means “here’s something new to keep”. You want “give me”, which is GET.',
				"Change `post('/series')` to `get('/series')`."
			],
			world: clientWorld(),
			starterCode: `const res = post('/series')
show(res.body)
`,
			solution: `const res = get('/series')
show(res.body)
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'screen-includes',
					text: 'Grove & Gear',
					message: 'The phone should show the list of series.'
				}
			]
		},
		{
			id: `${M}/07-boss-load-more`,
			slug: '07-boss-load-more',
			kind: 'code',
			title: 'The Load more button',
			xp: 45,
			boss: true,
			story:
				'Theo’s idea of the week: a **Load more** button at the bottom of the episode list. The phone fetches the next page, says how many new episodes arrived, and if anything goes wrong, says so politely. It’s your first real feature, start to finish.',
			task: 'Fetch page 2 of `/episodes`. If it worked, show how many episodes came back (`res.body.length`), then show the list. Otherwise show **Could not load more episodes**.',
			hints: [
				"Start with the request: `const res = get('/episodes?page=2')`. Then an `if (res.ok) { … } else { … }`, like in Coming soon.",
				'A list knows how long it is: `res.body.length` is the number of items in it. Show that first, then `res.body`.',
				"The whole thing:\n```js\nconst res = get('/episodes?page=2')\nif (res.ok) {\n  show(res.body.length)\n  show(res.body)\n} else {\n  show('Could not load more episodes')\n}\n```"
			],
			world: clientWorld(),
			starterCode: `// The reader tapped "Load more". Fetch page 2 of the episodes.

`,
			solution: `// The reader tapped "Load more". Fetch page 2 of the episodes.
const res = get('/episodes?page=2')
if (res.ok) {
  show(res.body.length)
  show(res.body)
} else {
  show('Could not load more episodes')
}
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: [{ title: 'Opening night' }, { title: 'Extra spicy' }],
					message: "Ask for page 2: `get('/episodes?page=2')`."
				},
				{
					type: 'screen-includes',
					text: 'Extra spicy',
					message: 'Show the new episodes on the phone too, with `show(res.body)`.'
				},
				{
					type: 'code-includes',
					pattern: '\\.length\\b',
					message: 'Show how many episodes came back with `res.body.length`.'
				},
				{
					type: 'code-includes',
					pattern: 'res\\.ok',
					message:
						'Check `res.ok` first, so a failed request shows Could not load more episodes instead of nonsense.'
				}
			]
		}
	]
};
