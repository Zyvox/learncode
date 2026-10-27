import type { Module, SimRequest, WebWorldSpec } from '#lib/curriculum/types.ts';

const M = 'sending-data-in';

/** Still no database: the server keeps its data in lists in its own code. */
function server(requests: SimRequest[]): WebWorldSpec {
	return { kind: 'web', role: 'server', requests, show: ['client', 'server'] };
}

const COMMENTS = `let comments = [
  { id: 1, author: 'ravi', text: 'That last panel. Wow.' },
  { id: 2, author: 'june_b', text: 'The cat is the real main character' }
]
`;

const LIST_COMMENTS = `app.get('/comments', (req, res) => {
  res.json(comments)
})
`;

const SEED_COMMENTS = [
	{ id: 1, author: 'ravi', text: 'That last panel. Wow.' },
	{ id: 2, author: 'june_b', text: 'The cat is the real main character' }
];

const EPISODES = `const episodes = [
  { id: 1, title: 'The first parcel', likes: 120 },
  { id: 2, title: 'Rain on Pine Street', likes: 98 },
  { id: 3, title: 'The locked gate', likes: 143 }
]

app.get('/episodes/:id', (req, res) => {
  res.json(episodes.find((e) => e.id === Number(req.params.id)))
})
`;

const BOSS_COMMENTS = `let comments = [
  { id: 1, episode_id: 1, author: 'ravi', text: 'That last panel. Wow.' },
  { id: 2, episode_id: 1, author: 'june_b', text: 'The cat is the real main character' },
  { id: 3, episode_id: 3, author: 'ravi', text: 'Called it. The gate was never locked.' },
  { id: 4, episode_id: 7, author: 'noodlefan', text: 'I can smell this episode' },
  { id: 5, episode_id: 7, author: 'june_b', text: 'Extra spicy next, please' }
]
`;

export const sendingDataIn: Module = {
	id: M,
	track: 'web',
	order: 5,
	emoji: '📮',
	title: 'Sending data in',
	blurb: 'Let readers post comments, like episodes and delete things, and check what they send.',
	prereq: 'Easier if you’ve done Learn to code, parts 1–5 (variables, if, loops, functions).',
	lessons: [
		{
			id: `${M}/01-post`,
			slug: '01-post',
			kind: 'code',
			title: 'Readers can talk back',
			xp: 15,
			story:
				'Readers could comment on the old server, and Theo has noticed that yours can only list comments. “So can readers comment yet?” Today your server learns to take new ones.',
			task: 'Add `POST /comments`. Make a new comment from `req.body.author` and `req.body.text`, with `id: comments.length + 1`, add it to the list with `comments.push(...)`, and answer with it using `res.json(...)`.',
			concept: {
				title: 'GET asks, POST brings something',
				panels: [
					{
						who: 'bit',
						scene: 'wire',
						text: 'You’ve seen this from the phone: on a POST I carry a parcel. This time you’re on the receiving end.'
					},
					{
						who: 'you',
						text: 'The parcel is the request’s **body**. On the server it’s waiting in `req.body`, already unpacked.',
						code: "req.body   // { author: 'noodlefan', text: 'Need episode 3 now' }"
					},
					{
						who: 'mina',
						text: 'And it’s a different endpoint from the GET one, even with the same path?'
					},
					{
						who: 'you',
						text: 'Yes: an endpoint is method plus path. `app.post` only answers POSTs, so `GET /comments` and `POST /comments` can live side by side.',
						code: "app.post('/comments', (req, res) => { … })"
					},
					{
						who: 'narrator',
						text: '`comments.push(x)` adds `x` to the end of the list. The list lives in the server’s memory, so the next GET sees it.'
					}
				]
			},
			newCommands: ['app.post(path, handler)', 'req.body'],
			hints: [
				"Start with `app.post('/comments', (req, res) => { … })`. Inside, build the new comment as an object.",
				'`const comment = { id: comments.length + 1, author: req.body.author, text: req.body.text }`, then `comments.push(comment)`, then `res.json(comment)`.',
				"The whole endpoint:\n```js\napp.post('/comments', (req, res) => {\n  const comment = { id: comments.length + 1, author: req.body.author, text: req.body.text }\n  comments.push(comment)\n  res.json(comment)\n})\n```"
			],
			world: server([
				{
					method: 'POST',
					path: '/comments',
					body: { author: 'noodlefan', text: 'Need episode 3 now' },
					label: 'noodlefan posts a comment'
				},
				{ method: 'GET', path: '/comments', label: 'reader reloads the comments' }
			]),
			starterCode: `${COMMENTS}
${LIST_COMMENTS}
// Add POST /comments below.
`,
			solution: `${COMMENTS}
${LIST_COMMENTS}
app.post('/comments', (req, res) => {
  const comment = { id: comments.length + 1, author: req.body.author, text: req.body.text }
  comments.push(comment)
  res.json(comment)
})
`,
			checks: [
				{
					type: 'response-status',
					request: 0,
					status: 200,
					message:
						'`POST /comments` should get an answer in the 200s. Is there an `app.post` for `/comments` that sends something back?'
				},
				{
					type: 'response-json',
					request: 0,
					expected: { id: 3, author: 'noodlefan', text: 'Need episode 3 now' },
					mode: 'subset',
					message:
						'The answer to the POST should be the new comment: `id` 3, and the `author` and `text` from `req.body`.'
				},
				{
					type: 'response-json',
					request: 1,
					expected: [...SEED_COMMENTS, { id: 3, author: 'noodlefan', text: 'Need episode 3 now' }],
					mode: 'subset',
					message:
						'After the POST, `GET /comments` should list three comments. Did you `comments.push(...)` the new one?'
				}
			]
		},
		{
			id: `${M}/02-fix-blank`,
			slug: '02-fix-blank',
			kind: 'fix',
			title: 'The blank comments',
			xp: 20,
			story:
				'While you were at lunch, someone “tidied up” your comment endpoint. It now answers `201`, the “created” status you saw when Mina posted her first comment, which is a nice touch. But every new comment comes out blank.',
			task: 'Press **Run** and look at what the POST answers. Fix the endpoint so new comments keep their author and text. Keep the `201`.',
			hints: [
				'The answer has an `id`, but no `author` and no `text`. Where does the endpoint look for them?',
				'`req.params` is for blanks in the path, like `:id`. This path has no blanks. What the phone sent is in `req.body`.',
				'Change `req.params.author` to `req.body.author`, and `req.params.text` to `req.body.text`.'
			],
			world: server([
				{
					method: 'POST',
					path: '/comments',
					body: { author: 'june_b', text: 'Saving this one for my commute' },
					label: 'june_b posts a comment'
				},
				{ method: 'GET', path: '/comments', label: 'reader reloads the comments' }
			]),
			starterCode: `${COMMENTS}
${LIST_COMMENTS}
app.post('/comments', (req, res) => {
  const comment = { id: comments.length + 1, author: req.params.author, text: req.params.text }
  comments.push(comment)
  res.status(201).json(comment)
})
`,
			solution: `${COMMENTS}
${LIST_COMMENTS}
app.post('/comments', (req, res) => {
  const comment = { id: comments.length + 1, author: req.body.author, text: req.body.text }
  comments.push(comment)
  res.status(201).json(comment)
})
`,
			checks: [
				{
					type: 'response-status',
					request: 0,
					status: 201,
					message: 'Keep the `res.status(201)`: a new comment was created.'
				},
				{
					type: 'response-json',
					request: 0,
					expected: { id: 3, author: 'june_b', text: 'Saving this one for my commute' },
					mode: 'subset',
					message:
						'The new comment should keep the `author` and `text` the phone sent. They are in `req.body`, not `req.params`.'
				},
				{
					type: 'code-excludes',
					pattern: 'req\\.params',
					message:
						'This endpoint has no `:blanks` in its path, so there is nothing useful in `req.params`. Use `req.body`.'
				}
			]
		},
		{
			id: `${M}/03-validate`,
			slug: '03-validate',
			kind: 'code',
			title: 'Not that one',
			xp: 20,
			story:
				'The app has a bug that sometimes posts empty comments, and an old version of it forgets the text altogether. Your server cheerfully saves them all. The comments section is filling up with nothing.',
			task: 'In `POST /comments`, if `author` or `text` is missing or empty, answer `400` with an `error` and save nothing. Otherwise save it and answer `201` as before.',
			concept: {
				title: 'Check what comes in',
				panels: [
					{
						who: 'mina',
						text: 'Can’t the app just not send empty comments?'
					},
					{
						who: 'you',
						text: 'It should, but anything can send requests to the server: old app versions, a script, someone being clever. The server is the last line of defence.'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'You’ve met **400** from the phone’s side: “your request is wrong, fix it and try again”. Not a 404, because the endpoint exists, and not a 500, because the server is fine.'
					},
					{
						who: 'you',
						text: '`!` means “not”. An empty text or a missing one both count as “not there”.',
						code: "if (!req.body.author || !req.body.text) {\n  res.status(400).json({ error: 'author and text are required' })\n}"
					},
					{
						who: 'narrator',
						text: '`||` means “or”. Then answer and stop: the bad comment must not reach `comments.push`.'
					}
				]
			},
			hints: [
				'Put the check at the top of the handler, and the saving part in an `else`, so a bad comment is never pushed.',
				"`if (!req.body.author || !req.body.text) { res.status(400).json({ error: 'author and text are required' }) } else { … }`",
				"The whole endpoint:\n```js\napp.post('/comments', (req, res) => {\n  if (!req.body.author || !req.body.text) {\n    res.status(400).json({ error: 'author and text are required' })\n  } else {\n    const comment = { id: comments.length + 1, author: req.body.author, text: req.body.text }\n    comments.push(comment)\n    res.status(201).json(comment)\n  }\n})\n```"
			],
			world: server([
				{
					method: 'POST',
					path: '/comments',
					body: { author: 'ravi', text: '' },
					label: 'the buggy app posts an empty comment'
				},
				{
					method: 'POST',
					path: '/comments',
					body: { author: 'ravi' },
					label: 'an old app version forgets the text'
				},
				{
					method: 'POST',
					path: '/comments',
					body: { author: 'june_b', text: 'Saving this one for my commute' },
					label: 'june_b posts a real comment'
				},
				{ method: 'GET', path: '/comments', label: 'reader reloads the comments' }
			]),
			starterCode: `${COMMENTS}
${LIST_COMMENTS}
app.post('/comments', (req, res) => {
  const comment = { id: comments.length + 1, author: req.body.author, text: req.body.text }
  comments.push(comment)
  res.status(201).json(comment)
})
`,
			solution: `${COMMENTS}
${LIST_COMMENTS}
app.post('/comments', (req, res) => {
  if (!req.body.author || !req.body.text) {
    res.status(400).json({ error: 'author and text are required' })
  } else {
    const comment = { id: comments.length + 1, author: req.body.author, text: req.body.text }
    comments.push(comment)
    res.status(201).json(comment)
  }
})
`,
			checks: [
				{
					type: 'response-status',
					request: 0,
					status: 400,
					message: 'The empty comment should get `400`, with `res.status(400)`.'
				},
				{
					type: 'response-includes',
					request: 0,
					text: '"error"',
					message:
						"Tell the phone what was wrong: answer with something like `{ error: 'author and text are required' }`."
				},
				{
					type: 'response-status',
					request: 1,
					status: 400,
					message:
						'The comment with no `text` at all should get `400` too. `!req.body.text` is true when it’s missing.'
				},
				{
					type: 'response-status',
					request: 2,
					status: 201,
					message: 'A proper comment should still be saved and get `201`.'
				},
				{
					type: 'response-json',
					request: 3,
					expected: [
						...SEED_COMMENTS,
						{ id: 3, author: 'june_b', text: 'Saving this one for my commute' }
					],
					mode: 'subset',
					message:
						'`GET /comments` should list exactly three comments at the end: the two old ones and june_b’s. The bad ones must not be saved.'
				}
			]
		},
		{
			id: `${M}/04-fix-like`,
			slug: '04-fix-like',
			kind: 'fix',
			title: 'The heart that does nothing',
			xp: 20,
			story:
				'Readers tap the ♥ under an episode, the app sends `PUT /episodes/3/like`, the server answers `200`… and the number never goes up. Readers are tapping it like woodpeckers.',
			task: 'Fix `PUT /episodes/:id/like` so each request really adds one like to the episode. Two likes on episode 3 should take it from 143 to 145.',
			concept: {
				title: 'PUT changes what’s already there',
				panels: [
					{
						who: 'bit',
						scene: 'wire',
						text: 'POST brings something new. PUT says: “this thing already exists, change it”.'
					},
					{
						who: 'you',
						text: 'Same shape as before, with `app.put`. The path says which episode; the handler changes it.',
						code: "app.put('/episodes/:id/like', (req, res) => { … })"
					},
					{
						who: 'theo',
						text: 'So why is my like counter frozen?'
					},
					{
						who: 'you',
						text: 'The server answered 200, so it isn’t crashing. Something inside is quietly wrong.'
					}
				]
			},
			newCommands: ['app.put(path, handler)'],
			hints: [
				'Look at the line with `+ 1`. It works out a new number. Where does that number go?',
				'`episode.likes + 1` calculates 144 and throws it away. To keep it, put it back: `episode.likes = episode.likes + 1`.',
				'Change the middle line to `episode.likes = episode.likes + 1`.'
			],
			world: server([
				{ method: 'PUT', path: '/episodes/3/like', label: 'reader taps ♥ on The locked gate' },
				{ method: 'PUT', path: '/episodes/3/like', label: 'another reader taps ♥' },
				{ method: 'GET', path: '/episodes/3', label: 'reader reopens the episode' }
			]),
			starterCode: `${EPISODES}
app.put('/episodes/:id/like', (req, res) => {
  const episode = episodes.find((e) => e.id === Number(req.params.id))
  episode.likes + 1
  res.json(episode)
})
`,
			solution: `${EPISODES}
app.put('/episodes/:id/like', (req, res) => {
  const episode = episodes.find((e) => e.id === Number(req.params.id))
  episode.likes = episode.likes + 1
  res.json(episode)
})
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: { id: 3, likes: 144 },
					mode: 'subset',
					message: 'After the first ♥, episode 3 should have 144 likes.'
				},
				{
					type: 'response-json',
					request: 1,
					expected: { id: 3, likes: 145 },
					mode: 'subset',
					message: 'After the second ♥, episode 3 should have 145 likes.'
				},
				{
					type: 'response-json',
					request: 2,
					expected: { id: 3, likes: 145 },
					mode: 'subset',
					message:
						'When the episode is opened again it should still say 145. The new number has to be stored in `episode.likes`.'
				}
			]
		},
		{
			id: `${M}/05-delete`,
			slug: '05-delete',
			kind: 'code',
			title: 'Take it down',
			xp: 20,
			story:
				'Comment 2 says the cat is the real main character. It’s right, and that’s the problem: episode 4 is the big reveal. Mina would like it gone, and the moderator button in the app sends `DELETE /comments/2`.',
			task: 'Add `DELETE /comments/:id`. Remove that comment from the list, then answer `204` with no body: `res.status(204).end()`.',
			concept: {
				title: 'Delete, and say nothing',
				panels: [
					{
						who: 'mina',
						text: 'A reader called june_b guessed the twist. Can we take that down, nicely?'
					},
					{
						who: 'you',
						text: '`app.delete` answers DELETE requests. The path says which comment.',
						code: "app.delete('/comments/:id', (req, res) => { … })"
					},
					{
						who: 'you',
						text: 'To remove it, keep every comment except that one, and store the result back in `comments`.',
						code: 'comments = comments.filter((c) => c.id !== Number(req.params.id))'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'Then I go home empty. 204 means “No Content”: done, nothing to show you.',
						code: 'res.status(204).end()'
					}
				]
			},
			newCommands: ['app.delete(path, handler)', 'res.end()'],
			hints: [
				"Start with `app.delete('/comments/:id', (req, res) => { … })`.",
				'Inside: `comments = comments.filter((c) => c.id !== Number(req.params.id))`, then `res.status(204).end()`. `!==` means “is not”.',
				"The whole endpoint:\n```js\napp.delete('/comments/:id', (req, res) => {\n  comments = comments.filter((c) => c.id !== Number(req.params.id))\n  res.status(204).end()\n})\n```"
			],
			world: server([
				{ method: 'DELETE', path: '/comments/2', label: 'Mina removes the spoiler' },
				{ method: 'GET', path: '/comments', label: 'reader reloads the comments' }
			]),
			starterCode: `${COMMENTS}
${LIST_COMMENTS}
// Add DELETE /comments/:id below.
`,
			solution: `${COMMENTS}
${LIST_COMMENTS}
app.delete('/comments/:id', (req, res) => {
  comments = comments.filter((c) => c.id !== Number(req.params.id))
  res.status(204).end()
})
`,
			checks: [
				{
					type: 'response-status',
					request: 0,
					status: 204,
					message: '`DELETE /comments/2` should get `204`. Use `res.status(204).end()`.'
				},
				{
					type: 'response-json',
					request: 0,
					expected: '',
					message: 'A 204 answer has no body. End it with `.end()` instead of `.json(...)`.'
				},
				{
					type: 'response-json',
					request: 1,
					expected: [SEED_COMMENTS[0]],
					mode: 'subset',
					message:
						'After the delete, `GET /comments` should only list comment 1. Store the filtered list back with `comments = …`.'
				}
			]
		},
		{
			id: `${M}/06-boss`,
			slug: '06-boss',
			kind: 'code',
			title: 'The comments API',
			xp: 50,
			boss: true,
			story:
				'Every episode gets its own comments section, where readers post and moderators clean up. The freelancer building the phone app has sent the list of requests it will make, and Theo has sent three coffee emojis. When this passes, Theo’s favourite question finally gets a yes.',
			task: 'Write three endpoints:\n1. `GET /episodes/:id/comments`: the comments whose `episode_id` matches.\n2. `POST /episodes/:id/comments`: `400` with an `error` if `author` or `text` is missing; otherwise save `{ id, episode_id, author, text }` and answer `201` with it. `episode_id` must be a number.\n3. `DELETE /comments/:id`: `204` when it was there, `404` with an `error` when it wasn’t.',
			hints: [
				'Do them in order and press **Run** after each. Every one of them is something you did earlier in this module, with an `episode_id` added.',
				'For the new comment, use `episode_id: Number(req.params.id)` and `id: comments.length + 1`. For the delete, first `find` the comment: if it isn’t there, answer 404.',
				"All three:\n```js\napp.get('/episodes/:id/comments', (req, res) => {\n  res.json(comments.filter((c) => c.episode_id === Number(req.params.id)))\n})\n\napp.post('/episodes/:id/comments', (req, res) => {\n  if (!req.body.author || !req.body.text) {\n    res.status(400).json({ error: 'author and text are required' })\n  } else {\n    const comment = { id: comments.length + 1, episode_id: Number(req.params.id), author: req.body.author, text: req.body.text }\n    comments.push(comment)\n    res.status(201).json(comment)\n  }\n})\n\napp.delete('/comments/:id', (req, res) => {\n  const id = Number(req.params.id)\n  if (!comments.find((c) => c.id === id)) {\n    res.status(404).json({ error: 'No comment with id ' + id })\n  } else {\n    comments = comments.filter((c) => c.id !== id)\n    res.status(204).end()\n  }\n})\n```"
			],
			world: server([
				{
					method: 'GET',
					path: '/episodes/1/comments',
					label: 'reader opens comments on episode 1'
				},
				{
					method: 'POST',
					path: '/episodes/1/comments',
					body: { author: 'mina', text: 'Thank you all for reading' },
					label: 'Mina replies'
				},
				{
					method: 'POST',
					path: '/episodes/1/comments',
					body: { author: 'ravi', text: '' },
					label: 'ravi’s app posts an empty comment'
				},
				{ method: 'GET', path: '/episodes/1/comments', label: 'reader reloads the comments' },
				{ method: 'DELETE', path: '/comments/2', label: 'moderator removes comment 2' },
				{ method: 'DELETE', path: '/comments/2', label: 'moderator double-taps the button' },
				{ method: 'GET', path: '/episodes/1/comments', label: 'reader reloads again' }
			]),
			starterCode: `${BOSS_COMMENTS}
// 1. GET    /episodes/:id/comments
// 2. POST   /episodes/:id/comments   (400 if author or text is missing, 201 when saved)
// 3. DELETE /comments/:id            (204 when deleted, 404 when it wasn't there)
`,
			solution: `${BOSS_COMMENTS}
app.get('/episodes/:id/comments', (req, res) => {
  res.json(comments.filter((c) => c.episode_id === Number(req.params.id)))
})

app.post('/episodes/:id/comments', (req, res) => {
  if (!req.body.author || !req.body.text) {
    res.status(400).json({ error: 'author and text are required' })
  } else {
    const comment = {
      id: comments.length + 1,
      episode_id: Number(req.params.id),
      author: req.body.author,
      text: req.body.text
    }
    comments.push(comment)
    res.status(201).json(comment)
  }
})

app.delete('/comments/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!comments.find((c) => c.id === id)) {
    res.status(404).json({ error: 'No comment with id ' + id })
  } else {
    comments = comments.filter((c) => c.id !== id)
    res.status(204).end()
  }
})
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					expected: [{ id: 1 }, { id: 2 }],
					mode: 'subset',
					message:
						'`GET /episodes/1/comments` should list the two comments on episode 1 (ids 1 and 2), and nothing from other episodes.'
				},
				{
					type: 'response-status',
					request: 1,
					status: 201,
					message: 'Mina’s comment should be saved and get `201`.'
				},
				{
					type: 'response-json',
					request: 1,
					expected: { id: 6, episode_id: 1, author: 'mina', text: 'Thank you all for reading' },
					mode: 'subset',
					message:
						'The answer to Mina’s POST should be her new comment with `id` 6 and `episode_id` 1 (a number, so use `Number(req.params.id)`).'
				},
				{
					type: 'response-status',
					request: 2,
					status: 400,
					message: 'The empty comment should get `400` and must not be saved.'
				},
				{
					type: 'response-json',
					request: 3,
					expected: [{ id: 1 }, { id: 2 }, { id: 6 }],
					mode: 'subset',
					message:
						'After the posts, episode 1 should have three comments: 1, 2 and Mina’s new 6. The empty one must not be there.'
				},
				{
					type: 'response-status',
					request: 4,
					status: 204,
					message: 'Deleting comment 2 should get `204`.'
				},
				{
					type: 'response-status',
					request: 5,
					status: 404,
					message:
						'Deleting comment 2 a second time should get `404`: it isn’t there any more. Check with `find` before deleting.'
				},
				{
					type: 'response-json',
					request: 6,
					expected: [{ id: 1 }, { id: 6 }],
					mode: 'subset',
					message: 'At the end, episode 1 should have comments 1 and 6 left.'
				}
			]
		}
	]
};
