import type { Module } from '#lib/curriculum/types.ts';
import { clientWorld } from '#lib/curriculum/inkwell.ts';

const M = 'the-reader-app';

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
			world: clientWorld(),
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
			id: `${M}/02-not-found`,
			slug: '02-not-found',
			kind: 'fix',
			title: 'The word “undefined”',
			xp: 20,
			story:
				'Mina tapped an early link to episode 4, the one she’s still drawing, and the phone proudly shows the word **undefined**. You fixed this once on the Coming soon level, and here it is again on the real screen. “That’s not a word I want readers to see,” says Mina, fairly.',
			task: "Run it and look at the phone. Then make the second episode check `b.ok` first: if it isn’t OK, `show('Episode not found')`, otherwise show the title as before.",
			hints: [
				'Episode 4 isn’t published, so the server answers 404 with `{ error: … }`. That body has no `title`, so `b.body.title` is `undefined`.',
				'`b.ok` is `true` for answers in the 200s. Wrap the last `show` in `if (!b.ok) { … } else { … }`.',
				"The end of your code:\n```js\nconst b = get('/episodes/4');\nif (!b.ok) {\n  show('Episode not found');\n} else {\n  show(b.body.title);\n}\n```"
			],
			world: clientWorld(),
			starterCode: `const a = get('/episodes/3');
show(a.body.title);

const b = get('/episodes/4');
show(b.body.title);
`,
			solution: `const a = get('/episodes/3');
show(a.body.title);

const b = get('/episodes/4');
if (!b.ok) {
  show('Episode not found');
} else {
  show(b.body.title);
}
`,
			checks: [
				{
					type: 'screen-includes',
					text: 'The locked gate',
					message: 'Episode 3 should still show its title, The locked gate.'
				},
				{
					type: 'screen-includes',
					text: 'Episode not found',
					message:
						'When the answer for episode 4 isn’t OK, show `Episode not found` instead of the title.'
				},
				{
					type: 'code-includes',
					pattern: '\\.ok\\b',
					message:
						'Decide using the answer itself: check `b.ok` before reading `b.body.title`. Then any missing episode gets the friendly message, not just this one.'
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
			world: clientWorld(),
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
			world: clientWorld(),
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
			world: clientWorld(),
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
				'Mina is testing the episode screen on episodes 3 (one comment), 4 (unpublished, so a 404) and 8 (no comments yet). Right now it shows **undefined**, asks for comments on an episode that doesn’t exist, and shows an empty pair of brackets where a friendly line should be. Fix it and the reader app has a screen that copes with real life.',
			task: 'Fix `openEpisode(id)`:\n\n1. If the episode answer isn’t OK, show `Episode not found` and don’t fetch its comments.\n2. Otherwise show the title, fetch the comments, and show `No comments yet` when the list is empty (`length === 0`), or the list when it isn’t.',
			hints: [
				'Put an `if (!res.ok) { … } else { … }` around everything after the first `get`. The comments trip goes inside the `else` part, so it only happens for real episodes.',
				"Inside the else: after fetching the comments, `if (comments.body.length === 0) { show('No comments yet'); } else { show(comments.body); }`.",
				"The whole function:\n```js\nfunction openEpisode(id) {\n  const res = get('/episodes/' + id);\n  if (!res.ok) {\n    show('Episode not found');\n  } else {\n    show(res.body.title);\n    const comments = get('/episodes/' + id + '/comments');\n    if (comments.body.length === 0) {\n      show('No comments yet');\n    } else {\n      show(comments.body);\n    }\n  }\n}\n```"
			],
			world: clientWorld(),
			starterCode: `function openEpisode(id) {
  const res = get('/episodes/' + id);
  show(res.body.title);
  const comments = get('/episodes/' + id + '/comments');
  show(comments.body);
}

openEpisode(3);
openEpisode(4);
openEpisode(8);
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

openEpisode(3);
openEpisode(4);
openEpisode(8);
`,
			checks: [
				{
					type: 'screen-includes',
					text: 'The locked gate',
					message: 'Episode 3 should show its title, The locked gate.'
				},
				{
					type: 'screen-includes',
					text: 'Called it.',
					message: 'Episode 3 has a comment from ravi. It should be on the screen.'
				},
				{
					type: 'screen-includes',
					text: 'Episode not found',
					message: 'Episode 4 answers 404. Show `Episode not found` when `res.ok` is false.'
				},
				{
					type: 'screen-includes',
					text: 'Extra spicy',
					message: 'Episode 8 should show its title, Extra spicy.'
				},
				{
					type: 'screen-includes',
					text: 'No comments yet',
					message:
						'Episode 8 has no comments. Show `No comments yet` when the list’s `length` is 0.'
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
