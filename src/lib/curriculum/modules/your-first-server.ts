import type { Module, SimRequest, WebWorldSpec } from '#lib/curriculum/types.ts';

const M = 'your-first-server';

/** A server with no database yet: the data lives in a list inside the server's own code. */
function server(requests: SimRequest[]): WebWorldSpec {
	return { kind: 'web', role: 'server', requests, show: ['client', 'server'] };
}

const SERIES = `const series = [
  { id: 1, title: 'Moonlit Deliveries', genre: 'slice of life' },
  { id: 2, title: 'Grove & Gear', genre: 'fantasy' },
  { id: 3, title: 'Night Shift Noodles', genre: 'comedy' }
]
`;

const ALL_SERIES = [
	{ id: 1, title: 'Moonlit Deliveries', genre: 'slice of life' },
	{ id: 2, title: 'Grove & Gear', genre: 'fantasy' },
	{ id: 3, title: 'Night Shift Noodles', genre: 'comedy' }
];

const LIST_ROUTE = `app.get('/series', (req, res) => {
  res.json(series)
})
`;

const BY_ID_ROUTE = `app.get('/series/:id', (req, res) => {
  const found = series.find((s) => s.id === Number(req.params.id))
  res.json(found)
})
`;

const EPISODES = `const episodes = [
  { id: 1, series_id: 1, number: 1, title: 'The first parcel', likes: 120 },
  { id: 2, series_id: 1, number: 2, title: 'Rain on Pine Street', likes: 98 },
  { id: 3, series_id: 1, number: 3, title: 'The locked gate', likes: 143 },
  { id: 5, series_id: 2, number: 1, title: 'A seed in the gears', likes: 61 },
  { id: 6, series_id: 2, number: 2, title: 'The clockwork fox', likes: 77 },
  { id: 7, series_id: 3, number: 1, title: 'Opening night', likes: 210 },
  { id: 8, series_id: 3, number: 2, title: 'Extra spicy', likes: 188 }
]
`;

export const yourFirstServer: Module = {
	id: M,
	track: 'web',
	order: 4,
	emoji: '🛠️',
	title: 'Your first server',
	blurb: 'Swap sides: write the server that answers the phone, one endpoint at a time.',
	prereq: 'Easier if you’ve done Learn to code, parts 1–5 (variables, if, loops, functions).',
	lessons: [
		{
			id: `${M}/01-hello`,
			slug: '01-hello',
			kind: 'code',
			title: 'Hello from the other side',
			xp: 15,
			story:
				'Until now you were the phone, asking a server somebody else wrote. Today Theo hands you a server of your own, and it is completely empty: it knows no paths at all, so every request gets a 404.',
			task: "Add an endpoint for `/hello` that answers with the text `Hello, Inkwell`. Type the line from the strip: `app.get('/hello', (req, res) => { res.send('Hello, Inkwell') })`",
			concept: {
				title: 'A server is a list of answers',
				panels: [
					{
						who: 'narrator',
						scene: 'server',
						text: 'The other end of the wire. Quieter than you expected.'
					},
					{
						who: 'mina',
						text: 'So what is a server, actually? A big humming box in a cupboard?'
					},
					{
						who: 'you',
						text: 'The box is just where it runs. The server itself is a program, and it’s mostly a list: “if someone asks for X, do Y”.'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'I turn up saying GET /hello. The server runs down its list, finds /hello, and does whatever is written next to it.'
					},
					{
						who: 'you',
						text: 'From the phone’s side, each entry is an endpoint. In your code it’s a **route**: the path, then a function that gets the request and writes the answer, called the **handler**.',
						code: "app.get('/hello', (req, res) => {\n  res.send('Hello, Inkwell')\n})"
					},
					{
						who: 'narrator',
						text: '`req` is the request that came in and `res` is the reply you’re writing. `res.send()` sends it back down the wire.'
					}
				]
			},
			newCommands: ['app.get(path, handler)', 'res.send(value)'],
			hints: [
				'Copy the shape from the strip: `app.get(`, the path in quotes, a comma, then the function `(req, res) => { … }`.',
				'Inside the curly brackets, answer with `res.send(...)` and the text in quotes. Watch the comma after `Hello`.',
				"The whole thing:\n```js\napp.get('/hello', (req, res) => {\n  res.send('Hello, Inkwell')\n})\n```"
			],
			world: server([{ method: 'GET', path: '/hello', label: 'reader opens the welcome screen' }]),
			starterCode: `// The phone is going to ask for /hello.
// Add your first endpoint below, so the server knows how to answer.
`,
			solution: `app.get('/hello', (req, res) => {
  res.send('Hello, Inkwell')
})
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-includes',
					request: 0,
					text: 'Hello, Inkwell',
					message:
						'The phone should get the text `Hello, Inkwell`. Check the spelling, the capital letters and the comma.'
				}
			]
		},
		{
			id: `${M}/02-a-list`,
			slug: '02-a-list',
			kind: 'code',
			title: 'Send the whole list',
			xp: 15,
			story:
				'The reader app’s home screen shows every series as a card. There’s no database yet, so for now the series live in a list at the top of the server’s code.',
			task: 'Add an endpoint for `/series` that answers with the whole `series` list, using `res.json(series)`.',
			concept: {
				title: 'Text or data',
				panels: [
					{
						who: 'mina',
						text: 'Why not just `res.send` the titles as one long sentence?'
					},
					{
						who: 'you',
						text: 'Because the phone draws a card for each one, and it needs to pick out the title, the genre and the id. A sentence is no good for that.'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: '`res.json()` packs me with data, labels and all. The phone unpacks me and finds every field where it expects it.',
						code: 'res.json(series)'
					}
				]
			},
			newCommands: ['res.json(value)'],
			hints: [
				'It’s the same shape as `/hello`, with a different path and a different answer.',
				'Inside the function, use `res.json(series)` instead of `res.send(...)`.',
				"Like this:\n```js\napp.get('/series', (req, res) => {\n  res.json(series)\n})\n```"
			],
			world: server([{ method: 'GET', path: '/series', label: 'reader opens the series list' }]),
			starterCode: `${SERIES}
// Add GET /series below. Answer with the whole list.
`,
			solution: `${SERIES}
${LIST_ROUTE}`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-json',
					request: 0,
					expected: ALL_SERIES,
					message:
						'The phone should get the whole `series` list, all three of them, with `res.json(series)`.'
				}
			]
		},
		{
			id: `${M}/03-predict-404`,
			slug: '03-predict-404',
			kind: 'predict',
			title: 'A path nobody wrote',
			xp: 15,
			story:
				'Mina is testing a new button in the reader app called “Latest episodes”. She taps it. Here is the whole server.',
			task: 'Read the server code and the two requests, then pick what the second one gets back.',
			code: `${SERIES}
app.get('/hello', (req, res) => {
  res.send('Hello, Inkwell')
})

${LIST_ROUTE}
// The phone sends:
//   1. GET /series
//   2. GET /episodes
`,
			world: server([
				{ method: 'GET', path: '/series', label: 'reader opens the series list' },
				{ method: 'GET', path: '/episodes', label: 'Mina taps “Latest episodes”' }
			]),
			question: 'What does the second request, `GET /episodes`, get back?',
			choices: [
				'`200` with an empty list, because there are no episodes yet',
				'`404`: there’s no endpoint for `/episodes`, so the server says it doesn’t know that path',
				'`500`: the server crashes because it has never heard of episodes',
				'Nothing: the phone keeps waiting for an answer'
			],
			answer: 1,
			hints: [
				'Read down the list of `app.get(...)` lines. Which paths does this server know?',
				'The server only knows `/hello` and `/series`. What does a server say about a path it doesn’t know?'
			],
			explanation:
				'The server goes down its list looking for `GET /episodes`, finds nothing and answers **404 Not found** on its own, without crashing. You didn’t write that 404; the server does it for every path that isn’t on the list. So when someone says “the endpoint is 404ing”, the first question is: does that path exist on the server at all, spelled exactly like that?'
		},
		{
			id: `${M}/04-params`,
			slug: '04-params',
			kind: 'code',
			title: 'One series, please',
			xp: 20,
			story:
				'Tapping a card opens that series’ own page, so the phone asks for `/series/2` or `/series/3`. You can’t write a separate endpoint for every id. You need one endpoint with a blank in it.',
			task: 'Add `GET /series/:id`. Find the series whose `id` matches `req.params.id` and answer with it using `res.json(...)`. Remember the id arrives as text.',
			concept: {
				title: 'A path with a blank in it',
				panels: [
					{
						who: 'bit',
						scene: 'wire',
						text: 'This time I’m carrying GET /series/2.'
					},
					{
						who: 'you',
						text: 'The route `/series/:id` matches it. The `:id` is a path parameter, the blank you filled in from the phone side, and now you’re the one reading it.',
						code: "app.get('/series/:id', (req, res) => { … })"
					},
					{
						who: 'narrator',
						text: 'Whatever landed in the blank is waiting in `req.params.id`.'
					},
					{
						who: 'mina',
						text: 'And that’s the number 2?'
					},
					{
						who: 'you',
						text: "It’s the text `'2'`, because everything in a path is text. `Number(req.params.id)` turns it into the number 2, so it can match the ids in the list."
					},
					{
						who: 'you',
						text: '`list.find(...)` walks the list and hands back the first item where the test is true.',
						code: 'series.find((s) => s.id === Number(req.params.id))'
					}
				]
			},
			newCommands: ['req.params'],
			hints: [
				"Start with `app.get('/series/:id', (req, res) => { … })`. Inside, find the right series, then send it.",
				'Use `const found = series.find((s) => s.id === Number(req.params.id))`, then `res.json(found)`.',
				"Full endpoint:\n```js\napp.get('/series/:id', (req, res) => {\n  const found = series.find((s) => s.id === Number(req.params.id))\n  res.json(found)\n})\n```"
			],
			world: server([
				{ method: 'GET', path: '/series/2', label: 'reader taps Grove & Gear' },
				{ method: 'GET', path: '/series/3', label: 'reader taps Night Shift Noodles' }
			]),
			starterCode: `${SERIES}
${LIST_ROUTE}
// Add GET /series/:id below. Answer with the one series whose id matches.
`,
			solution: `${SERIES}
${LIST_ROUTE}
${BY_ID_ROUTE}`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-json',
					request: 0,
					expected: ALL_SERIES[1],
					message:
						"`GET /series/2` should get back Grove & Gear’s card. If the answer is empty (`null`), nothing matched: `req.params.id` is the text `'2'`, and the ids in the list are numbers. Compare with `Number(req.params.id)`."
				},
				{
					type: 'response-json',
					request: 1,
					expected: ALL_SERIES[2],
					message: '`GET /series/3` should get back Night Shift Noodles’ card.'
				}
			]
		},
		{
			id: `${M}/05-not-found`,
			slug: '05-not-found',
			kind: 'code',
			title: 'Say when it isn’t there',
			xp: 20,
			story:
				'A reader followed a link to `/series/9`, and there’s no series 9. Your endpoint answered `200 OK` with nothing in it, the app showed a blank page, and Theo got an email about it.',
			task: "When no series matches, answer with status `404` and `{ error: 'No series with id 9' }`, built from `req.params.id`. When one matches, keep answering with it as before.",
			concept: {
				title: 'Status first, then the body',
				panels: [
					{
						who: 'theo',
						text: 'Someone opened series 9 and got a blank screen. Is the server broken?'
					},
					{
						who: 'you',
						text: 'Worse: it said “200, here you go” and handed over nothing. The phone believed it.'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'The status rides on the outside of the box. Set it to 404 and the phone knows “that doesn’t exist” before it even opens me.',
						code: "res.status(404).json({ error: 'No series with id ' + req.params.id })"
					},
					{
						who: 'narrator',
						text: '`res.status()` sets the code, and `.json()` right after it sends the body. Without `res.status()`, the code is 200.'
					}
				]
			},
			newCommands: ['res.status(code)'],
			hints: [
				'After the `find`, check whether something was found: `if (found) { … } else { … }`.',
				"In the `else` part: `res.status(404).json({ error: 'No series with id ' + req.params.id })`.",
				"The whole endpoint:\n```js\napp.get('/series/:id', (req, res) => {\n  const found = series.find((s) => s.id === Number(req.params.id))\n  if (found) {\n    res.json(found)\n  } else {\n    res.status(404).json({ error: 'No series with id ' + req.params.id })\n  }\n})\n```"
			],
			world: server([
				{ method: 'GET', path: '/series/1', label: 'reader taps Moonlit Deliveries' },
				{ method: 'GET', path: '/series/9', label: 'reader follows an old link to series 9' }
			]),
			starterCode: `${SERIES}
${BY_ID_ROUTE}`,
			solution: `${SERIES}
app.get('/series/:id', (req, res) => {
  const found = series.find((s) => s.id === Number(req.params.id))
  if (found) {
    res.json(found)
  } else {
    res.status(404).json({ error: 'No series with id ' + req.params.id })
  }
})
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: ALL_SERIES[0],
					message: 'Series 1 still has to work: `GET /series/1` should get Moonlit Deliveries.'
				},
				{
					type: 'response-status',
					request: 1,
					status: 404,
					message:
						'`GET /series/9` should get the status `404`, because there is no series 9. Use `res.status(404)` before `.json(...)`.'
				},
				{
					type: 'response-json',
					request: 1,
					expected: { error: 'No series with id 9' },
					mode: 'subset',
					message:
						"The 404 answer should be `{ error: 'No series with id 9' }`. Build the text with `'No series with id ' + req.params.id`."
				}
			]
		},
		{
			id: `${M}/06-fix-no-answer`,
			slug: '06-fix-no-answer',
			kind: 'fix',
			title: 'The handler that never answered',
			xp: 20,
			story:
				'Jun has been learning to code on the side and wrote the “Latest episodes” endpoint. On the phone it says “Server error”. Press **Run** and read the server log.',
			task: 'Fix the handler so that `GET /episodes` answers `200` with the whole `episodes` list.',
			hints: [
				'The log says the handler finished without sending a response. Look for the line that is supposed to send the list.',
				'`return` hands the list back to… nobody. Only `res.something(...)` sends an answer down the wire.',
				'Replace `return episodes` with `res.json(episodes)`.'
			],
			world: server([{ method: 'GET', path: '/episodes', label: 'reader taps “Latest episodes”' }]),
			starterCode: `${EPISODES}
app.get('/episodes', (req, res) => {
  return episodes
})
`,
			solution: `${EPISODES}
app.get('/episodes', (req, res) => {
  res.json(episodes)
})
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-json',
					request: 0,
					expected: [
						{ id: 1, series_id: 1, number: 1, title: 'The first parcel', likes: 120 },
						{ id: 2, series_id: 1, number: 2, title: 'Rain on Pine Street', likes: 98 },
						{ id: 3, series_id: 1, number: 3, title: 'The locked gate', likes: 143 },
						{ id: 5, series_id: 2, number: 1, title: 'A seed in the gears', likes: 61 },
						{ id: 6, series_id: 2, number: 2, title: 'The clockwork fox', likes: 77 },
						{ id: 7, series_id: 3, number: 1, title: 'Opening night', likes: 210 },
						{ id: 8, series_id: 3, number: 2, title: 'Extra spicy', likes: 188 }
					],
					message: 'The phone should get the whole `episodes` list, sent with `res.json(episodes)`.'
				}
			]
		},
		{
			id: `${M}/07-query`,
			slug: '07-query',
			kind: 'code',
			title: 'Only the comedies',
			xp: 20,
			story:
				'The reader app is getting genre filters. Tapping “Comedy” asks for `/series?genre=comedy`. Same path as before, with a note on the end.',
			task: 'Change `GET /series`: when the request has a `genre`, answer with only the series of that genre. Without one, keep answering with all of them.',
			concept: {
				title: 'The part after the ?',
				panels: [
					{
						who: 'bit',
						scene: 'wire',
						text: 'I’m carrying GET /series?genre=comedy. The query string after the `?` is a note pinned to the request.'
					},
					{
						who: 'you',
						text: 'The route is still `/series`: the note doesn’t change which endpoint answers. It lands in `req.query`.',
						code: "req.query.genre   // 'comedy'"
					},
					{
						who: 'mina',
						text: 'Like the filters on a shop website?'
					},
					{
						who: 'you',
						text: 'Exactly that. `list.filter(...)` keeps every item where the test is true, and drops the rest.',
						code: 'series.filter((s) => s.genre === req.query.genre)'
					},
					{
						who: 'narrator',
						text: 'No `?genre=` on the request? Then `req.query.genre` is `undefined`, and an `if` can spot that.'
					}
				]
			},
			newCommands: ['req.query'],
			hints: [
				'Inside the handler, start with `if (req.query.genre) { … } else { … }`.',
				'In the `if` part, send `series.filter((s) => s.genre === req.query.genre)`. In the `else` part, send the whole list as before.',
				"The whole endpoint:\n```js\napp.get('/series', (req, res) => {\n  if (req.query.genre) {\n    res.json(series.filter((s) => s.genre === req.query.genre))\n  } else {\n    res.json(series)\n  }\n})\n```"
			],
			world: server([
				{ method: 'GET', path: '/series?genre=comedy', label: 'reader taps “Comedy”' },
				{ method: 'GET', path: '/series?genre=fantasy', label: 'reader taps “Fantasy”' },
				{ method: 'GET', path: '/series', label: 'reader clears the filter' }
			]),
			starterCode: `${SERIES}
${LIST_ROUTE}`,
			solution: `${SERIES}
app.get('/series', (req, res) => {
  if (req.query.genre) {
    res.json(series.filter((s) => s.genre === req.query.genre))
  } else {
    res.json(series)
  }
})
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: [ALL_SERIES[2]],
					message:
						'`GET /series?genre=comedy` should get a list with only Night Shift Noodles in it. Use `req.query.genre` with `series.filter(...)`.'
				},
				{
					type: 'response-json',
					request: 1,
					expected: [ALL_SERIES[1]],
					message: '`GET /series?genre=fantasy` should get a list with only Grove & Gear in it.'
				},
				{
					type: 'response-json',
					request: 2,
					expected: ALL_SERIES,
					message:
						'Plain `GET /series`, with no genre, should still get all three series. Check for `req.query.genre` with an `if` first.'
				}
			]
		},
		{
			id: `${M}/08-boss`,
			slug: '08-boss',
			kind: 'code',
			title: 'The series API',
			xp: 50,
			boss: true,
			story:
				'Theo wants browsing done by Friday: the series list with genre filters, a page per series, and the episodes of each series. The data is in place and the server is empty. Three endpoints from now, Inkwell has an API you wrote yourself.',
			task: 'Write three endpoints:\n1. `GET /series`: all series, or only one genre when there is `?genre=`.\n2. `GET /series/:id`: that series, or `404` with an `error` when there is none.\n3. `GET /series/:id/episodes`: the episodes whose `series_id` matches.',
			hints: [
				'Take them one at a time and press **Run** after each. The first two are the endpoints you wrote earlier in this module.',
				'For the third, filter `episodes` instead of `series`: `episodes.filter((e) => e.series_id === Number(req.params.id))`.',
				"The new one:\n```js\napp.get('/series/:id/episodes', (req, res) => {\n  res.json(episodes.filter((e) => e.series_id === Number(req.params.id)))\n})\n```\nThe other two are the endpoints from levels 5 and 7."
			],
			world: server([
				{ method: 'GET', path: '/series', label: 'reader opens the app' },
				{ method: 'GET', path: '/series?genre=comedy', label: 'reader taps “Comedy”' },
				{ method: 'GET', path: '/series/2', label: 'reader opens Grove & Gear' },
				{ method: 'GET', path: '/series/42', label: 'reader follows a broken link' },
				{ method: 'GET', path: '/series/3/episodes', label: 'reader scrolls Night Shift Noodles' }
			]),
			starterCode: `${SERIES}
${EPISODES}
// 1. GET /series            (with an optional ?genre=)
// 2. GET /series/:id        (404 when there is no such series)
// 3. GET /series/:id/episodes
`,
			solution: `${SERIES}
${EPISODES}
app.get('/series', (req, res) => {
  if (req.query.genre) {
    res.json(series.filter((s) => s.genre === req.query.genre))
  } else {
    res.json(series)
  }
})

app.get('/series/:id', (req, res) => {
  const found = series.find((s) => s.id === Number(req.params.id))
  if (found) {
    res.json(found)
  } else {
    res.status(404).json({ error: 'No series with id ' + req.params.id })
  }
})

app.get('/series/:id/episodes', (req, res) => {
  res.json(episodes.filter((e) => e.series_id === Number(req.params.id)))
})
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: ALL_SERIES,
					message: '`GET /series` should get all three series.'
				},
				{
					type: 'response-json',
					request: 1,
					expected: [ALL_SERIES[2]],
					message: '`GET /series?genre=comedy` should get a list with only Night Shift Noodles.'
				},
				{
					type: 'response-json',
					request: 2,
					expected: ALL_SERIES[1],
					message: '`GET /series/2` should get Grove & Gear.'
				},
				{
					type: 'response-status',
					request: 3,
					status: 404,
					message: '`GET /series/42` should get `404`: there is no series 42.'
				},
				{
					type: 'response-includes',
					request: 3,
					text: '"error"',
					message:
						"Give the 404 a short explanation the phone can show, like `{ error: 'No series with id 42' }`."
				},
				{
					type: 'response-json',
					request: 4,
					expected: [
						{ id: 7, series_id: 3, number: 1, title: 'Opening night', likes: 210 },
						{ id: 8, series_id: 3, number: 2, title: 'Extra spicy', likes: 188 }
					],
					message:
						'`GET /series/3/episodes` should get the two Night Shift Noodles episodes, the ones with `series_id` 3.'
				}
			]
		}
	]
};
