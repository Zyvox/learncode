import type { Module } from '#lib/curriculum/types.ts';
import { clientWorld } from '#lib/curriculum/inkwell.ts';

const M = 'what-happens-when-you-tap';

export const whatHappensWhenYouTap: Module = {
	id: M,
	track: 'web',
	order: 1,
	emoji: '📱',
	title: 'What happens when you tap',
	blurb: 'A phone asks, a server answers, and the answer comes back with a status and a body.',
	lessons: [
		{
			id: `${M}/01-first-trip`,
			slug: '01-first-trip',
			kind: 'code',
			title: 'Where does it come from?',
			xp: 10,
			story:
				'Your first morning at Inkwell. Mina, the lead artist, scrolls the Inkwell Reader app on her phone and frowns: "The comics aren’t stored on my phone. So where do they come from when I tap?" Time to follow one tap all the way.',
			task: 'Press **Run** and watch Bit carry the question to the server and back. Nothing shows on the phone yet. Add `show(res.body)` on the empty line so the list of series appears on the screen.',
			concept: {
				title: 'A phone asks, a server answers',
				panels: [
					{
						who: 'mina',
						scene: 'phone',
						text: 'When I tap a series, it just appears. But it isn’t on my phone, is it?'
					},
					{
						who: 'you',
						text: 'Not until the phone asks for it. It sends a question to another computer that has all the comics: the **server**.'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'That’s me. I’m the question, called a **request**. I run down the wire to the server: "the list of series, please".',
						code: "const res = get('/series')"
					},
					{
						who: 'bit',
						scene: 'server',
						text: 'The server looks it up and sends me back with the answer, called the **response**. `res` is where the phone keeps it.'
					},
					{
						who: 'narrator',
						scene: 'phone',
						text: 'Having the answer isn’t the same as showing it. The app puts it on the screen only when it’s told to.',
						code: 'show(res.body)'
					}
				]
			},
			newCommands: ['get(path)', 'show(value)', 'res.body'],
			hints: [
				'The first line already asks the server. You only need one more line, below it.',
				'`show(...)` puts whatever is in the brackets on the phone screen. What you want to see is the body of the answer: `res.body`.',
				'Add this line at the end: `show(res.body)`'
			],
			world: clientWorld(),
			starterCode: `// The phone asks the server for the list of series:
const res = get('/series')

// Put the answer on the phone screen here:

`,
			solution: `// The phone asks the server for the list of series:
const res = get('/series')

// Put the answer on the phone screen here:
show(res.body)
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: [
						{ title: 'Moonlit Deliveries' },
						{ title: 'Grove & Gear' },
						{ title: 'Night Shift Noodles' }
					],
					message: "Keep the first line as it is: `get('/series')` asks for the list of series."
				},
				{
					type: 'screen-includes',
					text: 'Night Shift Noodles',
					message:
						'The answer arrived, but the phone screen doesn’t show the series yet. Add `show(res.body)`.'
				}
			]
		},
		{
			id: `${M}/02-status-and-body`,
			slug: '02-status-and-body',
			kind: 'code',
			title: 'Two parts to every answer',
			xp: 15,
			story:
				'Mina is impressed, then suspicious: "How does the phone know it worked? What if the server sent back nonsense?" Every answer comes with a little number on the outside that says how it went.',
			task: 'Keep showing the body, and add a second line that shows the status of the answer with `show(res.status)`. The phone should show `200`.',
			concept: {
				title: 'Status + body',
				panels: [
					{
						who: 'bit',
						scene: 'wire',
						text: 'Every answer I bring back has two parts. On the outside there’s a number, the **status**. It says how things went.'
					},
					{
						who: 'bit',
						text: '`200` means "here you go, it worked". There are others, and you’ll meet the important ones soon.'
					},
					{
						who: 'bit',
						scene: 'phone',
						text: 'Inside is the **body**: the thing you actually asked for. Here, the list of series.'
					},
					{
						who: 'you',
						text: 'So the status is the note on the envelope, and the body is what’s in it.',
						code: 'show(res.status)   // 200\nshow(res.body)     // the series'
					}
				]
			},
			newCommands: ['res.status'],
			hints: [
				'You already have `show(res.body)`. The new line looks almost the same.',
				'Swap `body` for `status`: the status lives in `res.status`.',
				'Add this line at the end: `show(res.status)`'
			],
			world: clientWorld(),
			starterCode: `const res = get('/series')
show(res.body)

// Show the status here:

`,
			solution: `const res = get('/series')
show(res.body)

// Show the status here:
show(res.status)
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'screen-includes',
					text: 'Grove & Gear',
					message: 'Keep `show(res.body)` so the series stay on the screen.'
				},
				{
					type: 'screen-includes',
					text: '200',
					message: 'The phone doesn’t show the status yet. Add `show(res.status)`.'
				},
				{
					type: 'code-includes',
					pattern: 'res\\.status',
					message:
						'Show the status the server really sent, with `res.status`, rather than typing 200 yourself.'
				}
			]
		},
		{
			id: `${M}/03-nobody-home`,
			slug: '03-nobody-home',
			kind: 'predict',
			title: 'Nobody home',
			xp: 15,
			story:
				'It’s 3 a.m. and the Inkwell server is switched off while someone moves it to a new machine. A reader in another time zone opens the app anyway. The phone runs exactly the same code as before.',
			task: 'Read the code, then pick what ends up on the phone screen.',
			concept: {
				title: 'When nobody answers',
				panels: [
					{
						who: 'narrator',
						scene: 'server',
						text: '3 a.m. The server is off. Its lights are dark.'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'I run down the wire as usual, knock on the server’s door, and wait. And wait.'
					},
					{
						who: 'bit',
						text: 'Nobody opens. Eventually the phone gives up and calls me back. I come home with nothing in my hands.'
					},
					{
						who: 'theo',
						text: 'Readers keep saying the app is "broken". I need to know which kind of broken.'
					}
				]
			},
			code: `const res = get('/series')
show(res.status)
`,
			world: clientWorld({ serverDown: true }),
			question: 'With the server switched off, what does the phone screen show?',
			choices: [
				'`200` and the list of series, a bit later than usual',
				'`404`, because the server couldn’t find the series',
				'"Could not reach the server" and the status `0`',
				'`500`, because the server is broken'
			],
			answer: 2,
			explanation:
				'Nobody answered, so there is no real status at all. The simulation writes that as `0`, and the phone shows "Could not reach the server". Real apps say "No connection" or "Something went wrong". Every other status, `404` and `500` included, means the server **did** answer. So "the app is down" (nobody answered) and "the app says not found" (somebody answered, with bad news) are different problems with different fixes.',
			hints: [
				'Every status number is written by the server. Could the server write anything tonight?',
				'`404` and `500` are both answers from a server that is switched on. Bit came back empty-handed.'
			]
		},
		{
			id: `${M}/04-fix-typo`,
			slug: '04-fix-typo',
			kind: 'fix',
			title: 'One letter short',
			xp: 15,
			story:
				'Theo, who runs the studio, typed this line himself to "help". The phone shows an error card instead of the series. The server is definitely switched on, so something answered.',
			task: 'Press **Run** and read what the server sent back. Then fix the code so the phone shows the list of series again.',
			hints: [
				'The answer has the status `404`, which means "nothing here". Its body even tells you which path it couldn’t find.',
				'Compare the path in the code, letter by letter, with the one from the first level: `/series`.',
				"Change `'/seris'` to `'/series'`."
			],
			world: clientWorld(),
			starterCode: `const res = get('/seris')
show(res.body)
`,
			solution: `const res = get('/series')
show(res.body)
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'screen-includes',
					text: 'Moonlit Deliveries',
					message: 'The phone should show the list of series, starting with Moonlit Deliveries.'
				}
			]
		},
		{
			id: `${M}/05-pick-one-thing`,
			slug: '05-pick-one-thing',
			kind: 'code',
			title: 'Just the title, please',
			xp: 20,
			story:
				'Mina looks at the screen: "It works, but it’s all brackets and quotes. For the banner at the top I only want the name of the first series." The body isn’t a blob of text. It has a shape, and you can reach into it.',
			task: 'Change the `show` line so the phone shows only the title of the first series: **Moonlit Deliveries**. Use `res.body[0].title`.',
			concept: {
				title: 'The body is data, and data has shape',
				panels: [
					{
						who: 'mina',
						scene: 'phone',
						text: 'All those `[` and `{` and quotes. Is that just how computers like it?'
					},
					{
						who: 'you',
						text: 'It’s how the data is shaped. The square brackets mean a **list**: here, a list of three series.'
					},
					{
						who: 'you',
						text: 'Square brackets with a number pick one item from a list. Counting starts at 0, so `[0]` is the first one.',
						code: 'res.body[0]'
					},
					{
						who: 'bit',
						text: 'Each item is an **object**: labelled values, like `title`, `genre` and `author`. A dot and a label picks one value.',
						code: 'res.body[0].title   // Moonlit Deliveries'
					},
					{
						who: 'narrator',
						text: 'List, then item, then label. Reading the shape of an answer is half the job.'
					}
				]
			},
			hints: [
				'Right now the whole list goes to `show()`. You want one item of the list, then one label of that item.',
				'`res.body[0]` is the first series. Add `.title` after it to get just its title.',
				'Change the last line to: `show(res.body[0].title)`'
			],
			world: clientWorld(),
			starterCode: `const res = get('/series')
show(res.body)
`,
			solution: `const res = get('/series')
show(res.body[0].title)
`,
			checks: [
				{ type: 'response-status', request: 0, status: 200 },
				{
					type: 'screen-includes',
					text: 'Moonlit Deliveries',
					message: 'The phone should show Moonlit Deliveries, the title of the first series.'
				},
				{
					type: 'code-includes',
					pattern: '\\.title\\b',
					message:
						'Pick out just the title with `.title`, like `res.body[0].title`, instead of showing the whole list.'
				}
			]
		},
		{
			id: `${M}/06-boss-tiny-screen`,
			slug: '06-boss-tiny-screen',
			kind: 'code',
			title: 'Your first screen',
			xp: 45,
			boss: true,
			story:
				'Theo wants a demo for the artists’ meeting in ten minutes: "Show me all the series, and under them, the first episode of Moonlit Deliveries. Just the title. Can it do that?" It can. It takes two questions to the server.',
			task: 'Ask for `/series` and show the whole list. Then ask for the episodes of series 1, at the path `/series/1/episodes`, and show only the title of the first episode.',
			hints: [
				'Two requests, two answers. Give each answer its own name: the starter already calls the first one `series`. Call the second one `episodes`.',
				"For the second part: `const episodes = get('/series/1/episodes')`, then show one title from it, the same way you picked the first series in the last level.",
				"The whole thing:\n```js\nconst series = get('/series')\nshow(series.body)\n\nconst episodes = get('/series/1/episodes')\nshow(episodes.body[0].title)\n```"
			],
			world: clientWorld(),
			starterCode: `// 1. Ask for the list of series and show it.
const series = get('/series')


// 2. Ask for the episodes of series 1 (the path is /series/1/episodes)
//    and show only the title of the first episode.

`,
			solution: `// 1. Ask for the list of series and show it.
const series = get('/series')
show(series.body)

// 2. Ask for the episodes of series 1 (the path is /series/1/episodes)
//    and show only the title of the first episode.
const episodes = get('/series/1/episodes')
show(episodes.body[0].title)
`,
			checks: [
				{
					type: 'response-json',
					request: 0,
					mode: 'subset',
					expected: [
						{ title: 'Moonlit Deliveries' },
						{ title: 'Grove & Gear' },
						{ title: 'Night Shift Noodles' }
					],
					message: "The first request should be `get('/series')`, the list of series."
				},
				{
					type: 'response-json',
					request: 1,
					mode: 'subset',
					expected: [
						{ title: 'The first parcel' },
						{ title: 'Rain on Pine Street' },
						{ title: 'The locked gate' }
					],
					message:
						"The second request should ask for the episodes of series 1: `get('/series/1/episodes')`."
				},
				{
					type: 'screen-includes',
					text: 'Grove & Gear',
					message: 'Show the whole list of series on the phone, with `show(series.body)`.'
				},
				{
					type: 'screen-includes',
					text: 'The first parcel',
					message: 'Show the title of the first episode: The first parcel.'
				},
				{
					type: 'code-includes',
					pattern: '\\.title\\b',
					message: 'Show only the title of the first episode, with `.title`, not the whole list.'
				}
			]
		}
	]
};
