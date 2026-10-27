import type { Module } from '#lib/curriculum/types.ts';
import { INKWELL_AT, INKWELL_SERVER, clientWorld } from '#lib/curriculum/inkwell.ts';

const M = 'the-reader-app';

/** From here on Inkwell is live: last week's comments and likes are in the database. */
const LIVE = INKWELL_AT('live');

/** Tonight's update: the comments endpoint reads a table that doesn't exist. Registered first, so it wins. */
const BROKEN_COMMENTS = `
app.get('/episodes/:id/comments', (req, res) => {
  res.json(db.all('SELECT id, author, text FROM comment WHERE episode_id = ? ORDER BY id', [req.params.id]));
});
`;

export const theReaderApp: Module = {
	id: M,
	track: 'web',
	order: 10,
	emoji: '📱',
	title: 'The reader app',
	blurb:
		'Switch sides and be the phone: call the API you just built and turn its answers into screens, even when things go wrong.',
	prereq: 'Easier if you’ve done Learn to code, parts 1–5 (variables, if, loops, functions).',
	lessons: [
		{
			id: `${M}/01-list-then-detail`,
			slug: '01-list-then-detail',
			kind: 'code',
			title: 'Two taps, two trips',
			xp: 15,
			story:
				'You’ve spent a while being the server, so swap seats: your code runs on the phone again, and an Inkwell server just like the one you built is on the other end of the wire. A reader opens Moonlit Deliveries, then taps the first episode.',
			task: 'The code already fetches and shows the episode list. Now open the first episode: `get` `/episodes/` plus the `id` of the first episode in that list (`episodes[0].id`), and `show` its body. Take the id from the list rather than typing it.',
			concept: {
				title: 'Every screen is a trip or two',
				panels: [
					{
						who: 'mina',
						text: 'You built the server side. What does the phone actually do with it?',
						scene: 'phone'
					},
					{
						who: 'you',
						text: 'Pretty much what you’d guess: ask, then show. The list screen asks for the list, and tapping an episode asks for that one.',
						scene: 'phone',
						code: "const res = get('/series/1/episodes');\nshow(res.body);"
					},
					{
						who: 'bit',
						text: 'One trip per question. The list I bring back has the ids in it, so the phone knows exactly what to ask for next.',
						scene: 'wire'
					},
					{
						who: 'narrator',
						text: 'The phone never touches the database. It only knows the endpoints, the API you wrote.',
						scene: 'server'
					}
				]
			},
			hints: [
				'`episodes[0]` is the first episode in the list, and `episodes[0].id` is its id.',
				"Build the path by joining text and the id: `get('/episodes/' + episodes[0].id)`. Keep what it gives back in a variable and show its `.body`.",
				"Add these two lines at the end:\n```js\nconst first = get('/episodes/' + episodes[0].id);\nshow(first.body);\n```"
			],
			world: clientWorld({ schema: LIVE }),
			starterCode: `// A reader opens Moonlit Deliveries
const res = get('/series/1/episodes');
const episodes = res.body;
show(episodes);

// Now open the first episode in that list
`,
			solution: `const res = get('/series/1/episodes');
const episodes = res.body;
show(episodes);

const first = get('/episodes/' + episodes[0].id);
show(first.body);
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: { id: 1, title: 'The first parcel' },
					message:
						'The second trip should ask for the first episode in the list: `/episodes/1`, built from `episodes[0].id`.'
				},
				{
					type: 'screen-includes',
					text: 'The first parcel',
					message: 'Show the episode on the phone with `show(…)` once it comes back.'
				},
				{
					type: 'code-includes',
					pattern: '\'/episodes/\'\\s*\\+|"/episodes/"\\s*\\+',
					message:
						"Build the path from the list, like `'/episodes/' + episodes[0].id`, instead of typing the number. Then it works for whichever episode comes first."
				}
			]
		},
		{
			id: `${M}/02-half-a-screen`,
			slug: '02-half-a-screen',
			kind: 'fix',
			title: 'Half a screen beats none',
			xp: 20,
			story:
				'Tonight’s server update broke the comments endpoint, and the server team is on it. Meanwhile, every episode page on the phone says **undefined comments** under a box of error text. Mina, reading Opening night on the bus: “The episode is fine. Why is the whole page panicking?”',
			task: 'Run it and look at the status of the comments trip. Then change the comments part: when the status is `500` or more, show `Comments are taking a break. Try again in a minute.` instead. The episode title stays on the screen.',
			concept: {
				title: 'Which failures are worth waiting out',
				panels: [
					{
						who: 'bit',
						scene: 'server',
						text: 'The episode trip came back fine. The comments trip came back with a `500`: I reached the server, and it tripped over its own feet.'
					},
					{
						who: 'mina',
						scene: 'phone',
						text: 'So the episode is there, and only the comments are broken. Show me the episode, then.'
					},
					{
						who: 'you',
						text: 'And tell readers something true. A `404` won’t change however long they wait. A `500` often goes away once the server team has had their coffee.',
						code: 'if (comments.status >= 500) {\n  // our side broke: try again later\n}'
					},
					{
						who: 'narrator',
						text: 'One broken endpoint shouldn’t take down the whole screen. Show what worked, and explain what didn’t.'
					}
				]
			},
			hints: [
				'The comments answer has the status `500`. The code only expects a `404`, so the `500` falls through to the `else` and the error body gets shown as if it were comments.',
				'Add a new first branch: `if (comments.status >= 500) { show(…) } else if (comments.status === 404) { … } else { … }`.',
				"The comments part:\n```js\nconst comments = get('/episodes/7/comments');\nif (comments.status >= 500) {\n  show('Comments are taking a break. Try again in a minute.');\n} else if (comments.status === 404) {\n  show('No comments here');\n} else {\n  show(comments.body.length + ' comments');\n  show(comments.body);\n}\n```"
			],
			world: clientWorld({ schema: LIVE, serverCode: BROKEN_COMMENTS + INKWELL_SERVER }),
			starterCode: `const ep = get('/episodes/7');
show(ep.body.title);

const comments = get('/episodes/7/comments');
if (comments.status === 404) {
  show('No comments here');
} else {
  show(comments.body.length + ' comments');
  show(comments.body);
}
`,
			solution: `const ep = get('/episodes/7');
show(ep.body.title);

const comments = get('/episodes/7/comments');
if (comments.status >= 500) {
  show('Comments are taking a break. Try again in a minute.');
} else if (comments.status === 404) {
  show('No comments here');
} else {
  show(comments.body.length + ' comments');
  show(comments.body);
}
`,
			checks: [
				{
					type: 'response-status',
					request: 1,
					status: 500,
					message: "Keep asking for the comments: `get('/episodes/7/comments')`."
				},
				{
					type: 'screen-includes',
					text: 'Opening night',
					message:
						'Keep the episode title on the screen. The episode trip worked, so the reader should still see it.'
				},
				{
					type: 'screen-includes',
					text: 'Comments are taking a break. Try again in a minute.',
					message:
						'When the comments answer is a `500` or more, show `Comments are taking a break. Try again in a minute.`'
				},
				{
					type: 'code-includes',
					pattern: 'status\\s*>=?\\s*(500|499)|\\.ok\\b',
					message:
						'Decide from the answer itself: check `comments.status >= 500` (or `comments.ok`) before showing the list.'
				}
			]
		},
		{
			id: `${M}/03-post-then-refresh`,
			slug: '03-post-then-refresh',
			kind: 'code',
			title: 'Say something, see it',
			xp: 20,
			story:
				'Mina wants to thank her readers under episode 3. After she taps Send, the comments under the episode should include hers, straight away, like any app would.',
			task: 'First `post` the `comment` to `/episodes/3/comments`. Then `get` `/episodes/3/comments` again and `show` the body, so the list on screen is fresh.',
			hints: [
				"Sending is `post(path, body)`: `post('/episodes/3/comments', comment)`.",
				'Order matters: send first, fetch the list afterwards. Otherwise the list you show was made before the comment existed.',
				"The whole thing:\n```js\nconst comment = { author: 'mina', text: 'Thank you for reading!' };\npost('/episodes/3/comments', comment);\nconst list = get('/episodes/3/comments');\nshow(list.body);\n```"
			],
			world: clientWorld({ schema: LIVE }),
			starterCode: `// Mina wants to leave a thank-you under episode 3
const comment = { author: 'mina', text: 'Thank you for reading!' };

// 1. post it to /episodes/3/comments
// 2. get the comments for episode 3 again and show them
`,
			solution: `const comment = { author: 'mina', text: 'Thank you for reading!' };
post('/episodes/3/comments', comment);
const list = get('/episodes/3/comments');
show(list.body);
`,
			checks: [
				{
					type: 'response-status',
					request: 0,
					status: 201,
					message:
						"The first trip should send the comment: `post('/episodes/3/comments', comment)`. The server answers 201 when it’s saved."
				},
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: [{ author: 'ravi' }, { author: 'mina', text: 'Thank you for reading!' }],
					message:
						'The second trip should fetch the comments for episode 3 after posting, so the list has two: ravi’s and Mina’s.'
				},
				{
					type: 'screen-includes',
					text: 'Thank you for reading!',
					message: 'Show the fresh list on the phone so Mina can see her comment.'
				}
			]
		},
		{
			id: `${M}/04-predict-order`,
			slug: '04-predict-order',
			kind: 'predict',
			title: 'A snapshot, not a live feed',
			xp: 15,
			story:
				'A slightly different version of the comments screen. It reads the comments first, then sends a new one, then shows how many comments there are.',
			task: 'Read the code and decide what number ends up on the phone.',
			code: `const before = get('/episodes/7/comments');
post('/episodes/7/comments', { author: 'ravi', text: 'Spicy indeed' });
show(before.body.length);
`,
			world: clientWorld({ schema: LIVE }),
			question: 'Episode 7 starts with 2 comments. What does the phone show?',
			choices: ['2', '3', '0', 'An error, because the list changed'],
			answer: 0,
			explanation:
				'`before` holds the answer from the moment it was asked, when there were 2 comments. Posting a third one changes the database, not the answer you already have in your hand. An answer is a snapshot, not a live feed. To show 3 you’d have to ask again after posting, which is why real apps re-fetch (or add the new comment to the list themselves).',
			hints: [
				'When was `before` filled in: before or after the post?',
				'Does an answer you already received change when the database changes later?'
			]
		},
		{
			id: `${M}/05-real-fetch`,
			slug: '05-real-fetch',
			kind: 'code',
			title: 'How it looks for real',
			xp: 20,
			story:
				'Theo forwarded a snippet from the freelancer who is building the actual phone app. “Is this the same thing you’ve been doing?” It is, almost, with a couple of extra words.',
			task: 'Rewrite the snippet from the comment for this simulation: `get` instead of `fetch`, no `await`, and keep `res.json()` to read the body. Show the title of episode 7, then fetch and show its comments the same way.',
			concept: {
				title: '`await`: wait for Bit to come back',
				panels: [
					{
						who: 'theo',
						text: 'The freelancer’s code says `await fetch`. Is that different from your `get`?',
						scene: 'phone',
						code: "const res = await fetch('/episodes/7');\nconst data = await res.json();"
					},
					{
						who: 'you',
						text: '`fetch` is what real apps use where you’ve been writing `get`. Same trip, same answer.',
						scene: 'phone'
					},
					{
						who: 'bit',
						text: 'And `await` just means: wait for me to come back before the next line. A real trip takes time, a few milliseconds or a few seconds on a train.',
						scene: 'wire'
					},
					{
						who: 'narrator',
						text: 'In the simulation Bit is instant, so there’s nothing to `await`. And `res.json()` you’ve met already: the same as `res.body`.',
						scene: 'none'
					},
					{
						who: 'mina',
						text: 'So when an app spins forever, it’s stuck on an `await`, waiting for a Bit that never comes back?',
						scene: 'phone'
					},
					{ who: 'you', text: 'Very often, yes.', scene: 'none' }
				]
			},
			hints: [
				"Line by line: `const res = get('/episodes/7');`, then `const episode = res.json();`, then `show(episode.title);`.",
				"For the comments do the same with `'/episodes/7/comments'` and `show` the whole list.",
				"The whole translation:\n```js\nconst res = get('/episodes/7');\nconst episode = res.json();\nshow(episode.title);\n\nconst res2 = get('/episodes/7/comments');\nconst comments = res2.json();\nshow(comments);\n```"
			],
			world: clientWorld({ schema: LIVE }),
			starterCode: `// From the real Inkwell phone app:
//
//   const res = await fetch('/episodes/7');
//   const episode = await res.json();
//   show(episode.title);
//
// Write the same thing below for the simulation (get, no await),
// then fetch and show the comments for episode 7 the same way.
`,
			solution: `const res = get('/episodes/7');
const episode = res.json();
show(episode.title);

const res2 = get('/episodes/7/comments');
const comments = res2.json();
show(comments);
`,
			checks: [
				{
					type: 'screen-includes',
					text: 'Opening night',
					message: 'Show the title of episode 7, Opening night.'
				},
				{
					type: 'screen-includes',
					text: 'I can smell this episode',
					message: 'Fetch `/episodes/7/comments` too and show what comes back.'
				},
				{
					type: 'code-includes',
					pattern: '\\.json\\(\\)',
					message:
						'Read the body with `res.json()`, like the real code does. It gives you the same thing as `res.body`.'
				},
				{
					type: 'code-excludes',
					pattern: '\\bawait\\b',
					message:
						'Leave out `await` here. In this simulation every trip is instant, so there is nothing to wait for.'
				}
			]
		},
		{
			id: `${M}/06-boss-episode-screen`,
			slug: '06-boss-episode-screen',
			kind: 'code',
			title: 'The whole episode screen',
			xp: 45,
			boss: true,
			story:
				'Mina is testing the episode screen on three cases: The night market (episode 4, where her note from publish day and Ravi’s comment are both still waiting), an old link to episode 99 that never existed, and The clockwork fox (episode 6, no comments yet). Right now it shows **undefined**, asks for comments on an episode that doesn’t exist, and shows an empty pair of brackets where a friendly line should be.',
			task: 'Fix `openEpisode(id)`:\n\n1. If the episode answer isn’t OK, show `Episode not found` and don’t fetch its comments.\n2. Otherwise show the title, fetch the comments, and show `No comments yet` when the list is empty (`length === 0`), or the list when it isn’t.',
			outro: {
				panels: [
					{
						who: 'mina',
						scene: 'phone',
						text: 'Night market: my note, then Ravi’s. Episode 99: a polite “not found”. The fox: “No comments yet”, which is honestly a challenge to readers.'
					},
					{
						who: 'theo',
						text: 'I tried to break it on purpose for ten minutes. It just kept saying sensible things. Is that normal?'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'Fewer pointless trips, too. I didn’t go looking for comments on an episode that doesn’t exist. My legs thank you.'
					}
				]
			},
			hints: [
				'Put an `if (!res.ok) { … } else { … }` around everything after the first `get`. The comments trip goes inside the `else` part, so it only happens for real episodes.',
				"Inside the else: after fetching the comments, `if (comments.body.length === 0) { show('No comments yet'); } else { show(comments.body); }`.",
				"The whole function:\n```js\nfunction openEpisode(id) {\n  const res = get('/episodes/' + id);\n  if (!res.ok) {\n    show('Episode not found');\n  } else {\n    show(res.body.title);\n    const comments = get('/episodes/' + id + '/comments');\n    if (comments.body.length === 0) {\n      show('No comments yet');\n    } else {\n      show(comments.body);\n    }\n  }\n}\n```"
			],
			world: clientWorld({ schema: LIVE }),
			starterCode: `function openEpisode(id) {
  const res = get('/episodes/' + id);
  show(res.body.title);
  const comments = get('/episodes/' + id + '/comments');
  show(comments.body);
}

openEpisode(4);
openEpisode(99);
openEpisode(6);
`,
			solution: `function openEpisode(id) {
  const res = get('/episodes/' + id);
  if (!res.ok) {
    show('Episode not found');
  } else {
    show(res.body.title);
    const comments = get('/episodes/' + id + '/comments');
    if (comments.body.length === 0) {
      show('No comments yet');
    } else {
      show(comments.body);
    }
  }
}

openEpisode(4);
openEpisode(99);
openEpisode(6);
`,
			checks: [
				{
					type: 'screen-includes',
					text: 'The night market',
					message: 'Episode 4 should show its title, The night market.'
				},
				{
					type: 'screen-includes',
					text: 'Worth the wait.',
					message: 'The night market has two comments, Mina’s and Ravi’s. Show them on the screen.'
				},
				{
					type: 'screen-includes',
					text: 'Episode not found',
					message: 'Episode 99 answers 404. Show `Episode not found` when `res.ok` is false.'
				},
				{
					type: 'screen-includes',
					text: 'The clockwork fox',
					message: 'Episode 6 should show its title, The clockwork fox.'
				},
				{
					type: 'screen-includes',
					text: 'No comments yet',
					message:
						'The clockwork fox has no comments. Show `No comments yet` when the list’s `length` is 0.'
				},
				{
					type: 'max-queries',
					count: 5,
					message:
						'Only fetch comments for episodes that exist. Move the comments trip inside the part that runs when `res.ok` is true.'
				}
			]
		}
	]
};
