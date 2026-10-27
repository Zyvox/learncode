import type { Module } from '#lib/curriculum/types.ts';
import { clientWorld } from '#lib/curriculum/inkwell.ts';

const M = 'endpoints';

/** The Inkwell server's endpoints, as a reader would see them in its docs. */
const MENU = `GET  /series
GET  /series/:id
GET  /series/:id/episodes
GET  /episodes
GET  /episodes/:id
GET  /episodes/:id/comments
POST /episodes/:id/comments
PUT  /episodes/:id/like`;

export const endpoints: Module = {
	id: M,
	track: 'web',
	order: 3,
	emoji: '📋',
	title: 'Endpoints: the server’s menu',
	blurb:
		'A server only answers the questions on its menu, and once you can read the menu you can build a whole screen from it.',
	lessons: [
		{
			id: `${M}/01-the-menu`,
			slug: '01-the-menu',
			kind: 'predict',
			title: 'Reading the menu',
			xp: 15,
			story:
				'Jun, who draws Grove & Gear, sends you a note: “Our backend person left a list of what the server can do. It looks like a menu written by a robot.” You pin it to the wall and start reading.',
			task: 'Read the menu and the code, then pick which line of the menu answers this request.',
			concept: {
				title: 'Endpoints: the server’s menu',
				panels: [
					{
						who: 'you',
						scene: 'server',
						text: 'A server can’t answer just anything, only a fixed list of questions. Each one is a method and a path, called an **endpoint**.'
					},
					{
						who: 'narrator',
						scene: 'server',
						text: 'Here is Inkwell’s whole menu:',
						code: MENU
					},
					{
						who: 'bit',
						text: 'A `:id` is a blank to fill in. `/episodes/:id` matches `/episodes/3` and `/episodes/7`, with any id.'
					},
					{
						who: 'bit',
						text: 'And a path has to match all the way to the end. `/episodes/7` and `/episodes/7/comments` are different lines on the menu.'
					},
					{
						who: 'you',
						text: 'The whole list has a name you’ve probably heard: it’s the server’s **API**. Reading API docs mostly means reading a menu like this.'
					}
				]
			},
			code: `const res = get('/episodes/7/comments')
show(res.body)
`,
			world: clientWorld(),
			question: 'Which line of the menu answers `GET /episodes/7/comments`?',
			choices: [
				'`GET /episodes/:id`, so the phone shows episode 7, Opening night',
				'`GET /episodes/:id/comments`, so the phone shows the comments on episode 7',
				'`POST /episodes/:id/comments`, because it ends in comments',
				'None of them, so the server answers `404`'
			],
			answer: 1,
			explanation:
				'`GET /episodes/:id/comments`, with `7` filling in the `:id` blank. The method has to match (GET, not POST) and the path has to match all the way to the end, so `GET /episodes/:id` is not enough. The phone shows the two comments under Opening night, from noodlefan and june_b. Watch the server box: it shows the endpoint that answered.',
			hints: [
				'Match the method first: this is a GET. Then match the path piece by piece, with `7` going into the `:id` blank.',
				'`/episodes/7` stops too early. Which line has one more piece after the id?'
			]
		},
		{
			id: `${M}/02-two-calls-one-screen`,
			slug: '02-two-calls-one-screen',
			kind: 'code',
			title: 'One screen, two questions',
			xp: 20,
			story:
				'Mina wants a proper page for Night Shift Noodles, series 3: its title at the top, its episodes below. No line on the menu gives you both at once, and that’s normal: most screens in most apps are built from several requests.',
			task: 'Ask for series 3 and show its title. Then ask for the episodes of series 3 and show them. Use the menu above to find both paths.',
			concept: {
				title: 'One screen, several requests',
				panels: [
					{
						who: 'mina',
						scene: 'phone',
						text: 'One page, two requests? Isn’t that slow?'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'I’m quick. Each request asks one clear question, and the app puts the answers together on the screen.'
					},
					{
						who: 'you',
						text: 'One more thing you’ll see in real code: `res.json()`, which gives you the same thing as `res.body`. Real apps make their trips with a command called `fetch`, where `.json()` is how you read the body, so it works here too.',
						code: "const series = get('/series/3').json()\nshow(series.title)"
					}
				]
			},
			newCommands: ['res.json()'],
			hints: [
				'Look at the menu: `GET /series/:id` gives one series, and `GET /series/:id/episodes` gives its episodes. Put `3` where `:id` is.',
				"First request: `const series = get('/series/3').json()`, then `show(series.title)`. The second one is the same idea with `/series/3/episodes`.",
				"The whole thing:\n```js\nconst series = get('/series/3').json()\nshow(series.title)\n\nconst episodes = get('/series/3/episodes').json()\nshow(episodes)\n```"
			],
			world: clientWorld(),
			starterCode: `// Night Shift Noodles is series 3.
// 1. Its title:

// 2. Its episodes:

`,
			solution: `// Night Shift Noodles is series 3.
// 1. Its title:
const series = get('/series/3').json()
show(series.title)

// 2. Its episodes:
const episodes = get('/series/3/episodes').json()
show(episodes)
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: { id: 3, title: 'Night Shift Noodles' },
					message: "The first request should ask for series 3: `get('/series/3')`."
				},
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: [{ title: 'Opening night' }, { title: 'Extra spicy' }],
					message:
						"The second request should ask for the episodes of series 3: `get('/series/3/episodes')`."
				},
				{
					type: 'screen-includes',
					text: 'Night Shift Noodles',
					message: 'Show the title of the series on the phone.'
				},
				{
					type: 'screen-includes',
					text: 'Extra spicy',
					message: 'Show the episodes of the series on the phone too.'
				}
			]
		},
		{
			id: `${M}/03-post-a-comment`,
			slug: '03-post-a-comment',
			kind: 'code',
			title: 'Say something nice',
			xp: 20,
			story:
				'Theo, for the third time today: “Can readers comment yet?” The menu says yes: `POST /episodes/:id/comments`. Mina wants to be the first, on episode 1 of her own series.',
			task: "Post a comment on episode 1 with the author `'mina'` and any text you like. Show the status and the id of the new comment.",
			concept: {
				title: 'POST: here’s something new',
				panels: [
					{
						who: 'bit',
						scene: 'wire',
						text: 'Until now I’ve travelled light: just a method and a path. A **POST** carries something with it, a body of my own, going the other way.',
						code: "post('/episodes/1/comments', { author: 'mina', text: 'Hello!' })"
					},
					{
						who: 'you',
						text: 'The body is an object, in curly brackets: labels and values, the same shape you’ve been reading out of answers.'
					},
					{
						who: 'bit',
						scene: 'server',
						text: 'The server keeps it in the database and answers `201`: “created”. The answer’s body has the new comment’s **id**, its number from now on.'
					},
					{
						who: 'bit',
						text: 'Leave out the author or the text and the server answers `400`. That’s a 4xx: you asked wrong.'
					}
				]
			},
			newCommands: ['post(path, body)'],
			hints: [
				"The path is `/episodes/1/comments`. The body is `{ author: 'mina', text: '…' }` with your own words in the second pair of quotes.",
				'Keep the answer in `res`, like before. Then `show(res.status)` and `show(res.body.id)`.',
				"The whole thing:\n```js\nconst res = post('/episodes/1/comments', { author: 'mina', text: 'Thanks for reading!' })\nshow(res.status)\nshow(res.body.id)\n```"
			],
			world: clientWorld(),
			starterCode: `// Post Mina's comment on episode 1, then show the status and the new id.

`,
			solution: `// Post Mina's comment on episode 1, then show the status and the new id.
const res = post('/episodes/1/comments', { author: 'mina', text: 'Thanks for reading!' })
show(res.status)
show(res.body.id)
`,
			checks: [
				{
					type: 'response-status',
					request: 0,
					status: 201,
					message:
						"Post the comment with `post('/episodes/1/comments', { author: 'mina', text: '…' })`. Both the author and the text are needed."
				},
				{
					type: 'db-rows',
					sql: 'SELECT episode_id, author FROM comments WHERE id = 6',
					expected: [{ episode_id: 1, author: 'mina' }],
					message: 'The new comment should be on episode 1, with the author `mina`.'
				},
				{
					type: 'screen-includes',
					text: '201',
					message: 'Show the status on the phone with `show(res.status)`.'
				},
				{
					type: 'screen-includes',
					text: '6',
					message: 'Show the id of the new comment with `show(res.body.id)`.'
				}
			]
		},
		{
			id: `${M}/04-like`,
			slug: '04-like',
			kind: 'code',
			title: 'The heart button',
			xp: 20,
			story:
				'Every episode has a little heart, and tapping it should add one like and show the new count. The menu has a line for that: `PUT /episodes/:id/like`. **PUT** means “change something that already exists”.',
			task: 'Like episode 3, The locked gate, with `put`, and show its new number of likes from the answer.',
			newCommands: ['put(path, body)'],
			hints: [
				"The path is `/episodes/3/like`. This endpoint doesn’t need a body, so `put('/episodes/3/like')` is the whole request.",
				'The answer’s body looks like `{ id: 3, likes: … }`. Pick out the likes with `.likes`.',
				"The whole thing:\n```js\nconst res = put('/episodes/3/like')\nshow(res.body.likes)\n```"
			],
			world: clientWorld(),
			starterCode: `// Tap the heart on episode 3, then show the new number of likes.

`,
			solution: `// Tap the heart on episode 3, then show the new number of likes.
const res = put('/episodes/3/like')
show(res.body.likes)
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: { id: 3, likes: 144 },
					message: "Like episode 3 with `put('/episodes/3/like')`."
				},
				{
					type: 'screen-includes',
					text: '144',
					message: 'Show the new number of likes, `res.body.likes`, on the phone.'
				}
			]
		},
		{
			id: `${M}/05-not-on-the-menu`,
			slug: '05-not-on-the-menu',
			kind: 'code',
			title: 'Not on the menu',
			xp: 20,
			story:
				'Someone posted spam under episode 1. Theo, sharp as ever: “Just delete comment 1 from your phone thing.” He even wrote the line for you. It doesn’t work, and the reason is worth a screenshot for Theo.',
			task: 'Keep the answer to Theo’s request in `res`. Show its status and the error message the server sent (`res.body.error`).',
			concept: {
				title: 'Not on the menu',
				panels: [
					{
						who: 'bit',
						scene: 'wire',
						text: '`del(path)` sends a **DELETE** request: “please remove this”. I’ll carry anything you like.'
					},
					{
						who: 'bit',
						scene: 'server',
						text: 'But the server reads its menu from the top, and there’s no DELETE line on it. Nobody wrote one.'
					},
					{
						who: 'you',
						text: 'So it answers `404`. Here that doesn’t mean “comment 1 is missing”, it means “I don’t answer that question at all”.'
					},
					{
						who: 'narrator',
						text: 'A phone can only ask. Adding a line to the menu happens on the server, and that’s where you’re going next.'
					}
				]
			},
			newCommands: ['del(path)'],
			hints: [
				"Put `const res = ` in front of Theo’s line, so it reads `const res = del('/comments/1')`.",
				'Then two `show` lines: one for `res.status`, one for `res.body.error`.',
				"The whole thing:\n```js\nconst res = del('/comments/1')\nshow(res.status)\nshow(res.body.error)\n```"
			],
			world: clientWorld(),
			starterCode: `// Theo's line:
del('/comments/1')
`,
			solution: `// Theo's line:
const res = del('/comments/1')
show(res.status)
show(res.body.error)
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: { error: 'Not found: DELETE /comments/1' },
					message: "Keep Theo’s request as it is: `del('/comments/1')`."
				},
				{
					type: 'screen-includes',
					text: '404',
					message: 'Show the status on the phone with `show(res.status)`.'
				},
				{
					type: 'screen-includes',
					text: 'Not found: DELETE /comments/1',
					message: 'Show what the server said with `show(res.body.error)`.'
				}
			]
		},
		{
			id: `${M}/06-boss-episode-page`,
			slug: '06-boss-episode-page',
			kind: 'code',
			title: 'The episode page',
			xp: 50,
			boss: true,
			story:
				'Theo is showing investors round this afternoon and wants Opening night (episode 7), the studio’s most-liked episode, as a full page: the title, the comments under it, and a live tap on the heart with the new count. Three questions from the menu, in that order. Pull it off and you’ve built a whole screen from nothing but the API docs.',
			task: 'For episode 7: show its title, then show its comments, then like it and show the new number of likes. Three requests, in that order.',
			hints: [
				'From the menu: `GET /episodes/:id` for the title, `GET /episodes/:id/comments` for the comments, `PUT /episodes/:id/like` for the heart. The id is 7 every time.',
				"Give each answer its own name: `episode`, `comments`, `like`. For example: `const episode = get('/episodes/7')` and then `show(episode.body.title)`.",
				"The whole thing:\n```js\nconst episode = get('/episodes/7')\nshow(episode.body.title)\n\nconst comments = get('/episodes/7/comments')\nshow(comments.body)\n\nconst like = put('/episodes/7/like')\nshow(like.body.likes)\n```"
			],
			world: clientWorld(),
			starterCode: `// The page for episode 7, top to bottom:
// 1. the title
// 2. the comments
// 3. tap the heart and show the new number of likes

`,
			solution: `// The page for episode 7, top to bottom:
// 1. the title
const episode = get('/episodes/7')
show(episode.body.title)

// 2. the comments
const comments = get('/episodes/7/comments')
show(comments.body)

// 3. tap the heart and show the new number of likes
const like = put('/episodes/7/like')
show(like.body.likes)
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: { id: 7, title: 'Opening night' },
					message: "The first request should be for episode 7 itself: `get('/episodes/7')`."
				},
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: [{ author: 'noodlefan' }, { author: 'june_b' }],
					message: "The second request should be for its comments: `get('/episodes/7/comments')`."
				},
				{
					type: 'response-json',
					request: 2,
					expected: { id: 7, likes: 211 },
					message: "The third request should tap the heart: `put('/episodes/7/like')`."
				},
				{
					type: 'screen-includes',
					text: 'Opening night',
					message: 'Show the episode’s title on the phone.'
				},
				{
					type: 'screen-includes',
					text: 'I can smell this episode',
					message: 'Show the comments on the phone.'
				},
				{
					type: 'screen-includes',
					text: '211',
					message: 'Show the new number of likes on the phone.'
				}
			]
		}
	]
};
