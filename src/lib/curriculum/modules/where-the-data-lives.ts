import type { Module } from '#lib/curriculum/types.ts';
import { sqlWorld } from '#lib/curriculum/inkwell.ts';

const M = 'where-the-data-lives';

export const whereTheDataLives: Module = {
	id: M,
	track: 'web',
	order: 6,
	emoji: '🗄️',
	title: 'Where the data lives',
	blurb: 'Meet the database: tables, rows and columns, and how to ask it questions in SQL.',
	prereq: 'Easier if you’ve done Learn to code, parts 1–5 (variables, if, loops, functions).',
	lessons: [
		{
			id: `${M}/01-select`,
			slug: '01-select',
			kind: 'code',
			title: 'Open the drawer',
			xp: 15,
			language: 'sql',
			story:
				'The lists in your server’s code vanish every time it restarts, and Theo has noticed. Inkwell has a real database now. Before the server talks to it, you’re going to talk to it yourself.',
			task: 'Ask the database for every row and every column of the `series` table: `SELECT * FROM series;`',
			concept: {
				title: 'Tables, rows, columns',
				panels: [
					{
						who: 'narrator',
						scene: 'database',
						text: 'Behind the server sits the database. This is where Inkwell actually keeps things.'
					},
					{
						who: 'you',
						text: 'It holds tables. A table is a set of rows that all have the same columns. Every row in `series` has an `id`, a `title`, a `genre` and an `author`.'
					},
					{
						who: 'mina',
						text: 'So it’s a spreadsheet that answers back.'
					},
					{
						who: 'you',
						text: 'Pretty much. You ask in a language called SQL, and it answers with rows.',
						code: 'SELECT * FROM series;'
					},
					{
						who: 'bit',
						text: '`SELECT` means “give me”, `*` means “every column”, `FROM series` says which table. The `;` ends the question.'
					},
					{
						who: 'theo',
						text: 'And the server? You told me the server answers the phone.'
					}
				],
				body: 'It does. When the phone asks the server for something, the server asks the database a question just like this one, then sends the answer on. You’ll wire those two together in a later module.'
			},
			newCommands: ['SELECT'],
			hints: [
				'Three parts: `SELECT`, then `*` for every column, then `FROM` and the table name.',
				'Type exactly `SELECT * FROM series;` and press **Run**.'
			],
			world: sqlWorld(),
			starterCode: `-- Ask for every row of the series table below.
`,
			solution: `SELECT * FROM series;
`,
			checks: [
				{
					type: 'sql-result',
					anyOrder: true,
					expected: [
						{ id: 1, title: 'Moonlit Deliveries', genre: 'slice of life', author: 'Mina' },
						{ id: 2, title: 'Grove & Gear', genre: 'fantasy', author: 'Jun' },
						{ id: 3, title: 'Night Shift Noodles', genre: 'comedy', author: 'Mina' }
					],
					message:
						'The result should be all three series with all four columns. Use `*` for every column, and `FROM series`.'
				}
			]
		},
		{
			id: `${M}/02-fix-columns`,
			slug: '02-fix-columns',
			kind: 'fix',
			title: 'Who drew what',
			xp: 15,
			language: 'sql',
			story:
				'Theo wants a short list for the website footer: each series and who makes it. Instead of `*`, you can name just the columns you want, with commas between them. Theo tried. Press **Run**.',
			task: 'Read the error, then fix the query so it gives back two columns: `title` and the column that holds who makes each series.',
			hints: [
				'The database tells you which columns `series` really has. Is `artist` one of them?',
				'The person who makes a series is in the `author` column.',
				'`SELECT title, author FROM series;`'
			],
			world: sqlWorld(),
			starterCode: `SELECT title, artist FROM series;
`,
			solution: `SELECT title, author FROM series;
`,
			checks: [
				{
					type: 'sql-columns',
					columns: ['title', 'author'],
					message: 'The result should have exactly two columns: `title` and `author`.'
				},
				{
					type: 'sql-result',
					anyOrder: true,
					expected: [
						{ title: 'Moonlit Deliveries', author: 'Mina' },
						{ title: 'Grove & Gear', author: 'Jun' },
						{ title: 'Night Shift Noodles', author: 'Mina' }
					]
				}
			]
		},
		{
			id: `${M}/03-where`,
			slug: '03-where',
			kind: 'code',
			title: 'The popular ones',
			xp: 20,
			language: 'sql',
			story:
				'Theo wants to put a “Reader favourite” badge on every episode with more than 100 likes. Look at the `episodes` table in the database panel: eight rows, and you only want some of them.',
			task: 'Get the `title` and `likes` of every episode with more than 100 likes.',
			concept: {
				title: 'WHERE keeps some rows',
				panels: [
					{
						who: 'theo',
						text: 'I don’t want all of them. Just the ones people love.'
					},
					{
						who: 'you',
						text: '`WHERE` goes after the table name. The database checks every row, and only keeps the ones where the test is true.',
						code: 'SELECT title, likes FROM episodes WHERE likes > 100;'
					},
					{
						who: 'narrator',
						text: 'Tests work like in JavaScript: `>`, `<`, `>=`. One difference: “equals” is a single `=` in SQL. Text goes in single quotes: `WHERE genre = \'comedy\'`.'
					}
				]
			},
			newCommands: ['WHERE'],
			hints: [
				'Start with `SELECT title, likes FROM episodes`, then add the `WHERE` part before the `;`.',
				'“More than 100” is `likes > 100`.',
				'`SELECT title, likes FROM episodes WHERE likes > 100;`'
			],
			world: sqlWorld(),
			starterCode: `SELECT title, likes FROM episodes;
`,
			solution: `SELECT title, likes FROM episodes WHERE likes > 100;
`,
			checks: [
				{
					type: 'sql-columns',
					columns: ['title', 'likes'],
					message: 'The result should have two columns: `title` and `likes`.'
				},
				{
					type: 'sql-result',
					anyOrder: true,
					expected: [
						{ title: 'The first parcel', likes: 120 },
						{ title: 'The locked gate', likes: 143 },
						{ title: 'Opening night', likes: 210 },
						{ title: 'Extra spicy', likes: 188 }
					],
					message:
						'There are four episodes with more than 100 likes. Keep only those with `WHERE likes > 100`.'
				}
			]
		},
		{
			id: `${M}/04-predict-where`,
			slug: '04-predict-where',
			kind: 'predict',
			title: 'Which rows come back?',
			xp: 15,
			language: 'sql',
			story:
				'Theo’s next idea: a “Needs some love” shelf for episodes under 100 likes. Before you run it, picture the `episodes` table in the database panel.',
			task: 'Read the query and decide how many rows it gives back.',
			code: `SELECT title, likes FROM episodes WHERE likes < 100;
`,
			world: sqlWorld(),
			question: 'How many rows come back?',
			choices: ['2', '3', '4', '8'],
			answer: 2,
			hints: [
				'Go down the `likes` column in the `episodes` table and count every number under 100.',
				'Don’t skip the episode that nobody has seen yet. 0 is under 100 too.'
			],
			explanation:
				'Four: Rain on Pine Street (98), A seed in the gears (61), The clockwork fox (77) and Sketches (0). Sketches is the sneaky one. It isn’t even published yet, but the database doesn’t know what you *meant*, only what you asked: every row with `likes` under 100. Theo’s shelf would show readers an episode that doesn’t exist for them. Keep that in mind for the boss level.'
		},
		{
			id: `${M}/05-top-three`,
			slug: '05-top-three',
			kind: 'code',
			title: 'Top three',
			xp: 20,
			language: 'sql',
			story:
				'The app’s home screen gets a “Most liked” strip with room for exactly three episodes, most liked first.',
			task: 'Get the `title` and `likes` of the three episodes with the most likes, biggest first.',
			concept: {
				title: 'Sort, then cut',
				panels: [
					{
						who: 'you',
						text: '`ORDER BY` sorts the rows by a column. Smallest first, unless you add `DESC` (descending) for biggest first.',
						code: 'ORDER BY likes DESC'
					},
					{
						who: 'you',
						text: '`LIMIT` keeps only the first few rows of whatever came out.',
						code: 'LIMIT 3'
					},
					{
						who: 'mina',
						text: 'Does the order of the words matter?'
					},
					{
						who: 'you',
						text: 'Yes. SQL is fussy about it: `SELECT`, `FROM`, `WHERE`, `ORDER BY`, `LIMIT`. Sort first, then cut, otherwise you’d keep three random rows.'
					}
				]
			},
			newCommands: ['ORDER BY', 'LIMIT'],
			hints: [
				'Start from `SELECT title, likes FROM episodes`, then sort with `ORDER BY likes DESC`.',
				'Add `LIMIT 3` at the very end, before the `;`.',
				'`SELECT title, likes FROM episodes ORDER BY likes DESC LIMIT 3;`'
			],
			world: sqlWorld(),
			starterCode: `SELECT title, likes FROM episodes;
`,
			solution: `SELECT title, likes FROM episodes ORDER BY likes DESC LIMIT 3;
`,
			checks: [
				{
					type: 'sql-columns',
					columns: ['title', 'likes'],
					message: 'The result should have two columns: `title` and `likes`.'
				},
				{
					type: 'sql-result',
					expected: [
						{ title: 'Opening night', likes: 210 },
						{ title: 'Extra spicy', likes: 188 },
						{ title: 'The locked gate', likes: 143 }
					],
					message:
						'The result should be the three most liked episodes, biggest first: sort with `ORDER BY likes DESC`, then keep three with `LIMIT 3`.'
				}
			]
		},
		{
			id: `${M}/06-count`,
			slug: '06-count',
			kind: 'code',
			title: 'Just the number',
			xp: 20,
			language: 'sql',
			story:
				'Theo is writing the studio’s monthly update and needs one number: how many episodes Inkwell has published. Not a list. A number.',
			task: 'Count the episodes where `published = 1`. Name the result column `total` with `AS total`.',
			concept: {
				title: 'Counting rows',
				panels: [
					{
						who: 'theo',
						text: 'Don’t give me a table. I just want to know how many.'
					},
					{
						who: 'you',
						text: '`COUNT(*)` counts the rows instead of listing them. You get one row back, with one number in it.',
						code: 'SELECT COUNT(*) FROM episodes;'
					},
					{
						who: 'bit',
						text: '`WHERE` still works: it picks the rows first, then `COUNT(*)` counts what’s left.'
					},
					{
						who: 'narrator',
						text: '`AS total` gives the column a proper name, so the result doesn’t say `COUNT(*)` at the top.'
					}
				]
			},
			newCommands: ['COUNT(*)'],
			hints: [
				'Start with `SELECT COUNT(*) AS total FROM episodes`.',
				'Published episodes have `published = 1`. Add that as a `WHERE`.',
				'`SELECT COUNT(*) AS total FROM episodes WHERE published = 1;`'
			],
			world: sqlWorld(),
			starterCode: `-- How many published episodes are there?
SELECT * FROM episodes;
`,
			solution: `SELECT COUNT(*) AS total FROM episodes WHERE published = 1;
`,
			checks: [
				{
					type: 'sql-columns',
					columns: ['total'],
					message:
						'The result should have one column called `total`. Write `COUNT(*) AS total` after `SELECT`.'
				},
				{
					type: 'sql-result',
					expected: [{ total: 7 }],
					message:
						'Inkwell has 7 published episodes. Count only the rows `WHERE published = 1`.'
				},
				{
					type: 'code-includes',
					pattern: '[Cc][Oo][Uu][Nn][Tt]\\s*\\(',
					message: 'Let the database do the counting with `COUNT(*)`.'
				}
			]
		},
		{
			id: `${M}/07-boss`,
			slug: '07-boss',
			kind: 'code',
			title: 'Needs some love',
			xp: 45,
			boss: true,
			language: 'sql',
			story:
				'Theo is back with the “Needs some love” shelf, and this time he means it: the three published episodes with the fewest likes, so the studio can share them on social media this week. Unpublished episodes are not invited.',
			task: 'Get the `title` and `likes` of the three **published** episodes with the fewest likes, fewest first.',
			hints: [
				'You need every piece from this module: pick the columns, keep only `published = 1`, sort by `likes`, keep three.',
				'Fewest first is the normal order, so no `DESC` this time. The order of the parts is `SELECT … FROM … WHERE … ORDER BY … LIMIT …`.',
				'`SELECT title, likes FROM episodes WHERE published = 1 ORDER BY likes LIMIT 3;`'
			],
			world: sqlWorld(),
			starterCode: `-- The three published episodes with the fewest likes, fewest first.
`,
			solution: `SELECT title, likes FROM episodes WHERE published = 1 ORDER BY likes LIMIT 3;
`,
			checks: [
				{
					type: 'sql-columns',
					columns: ['title', 'likes'],
					message: 'Only two columns: `title` and `likes`.'
				},
				{
					type: 'sql-row-count',
					min: 3,
					max: 3,
					message: 'The shelf has room for exactly three episodes. Use `LIMIT 3`.'
				},
				{
					type: 'sql-result',
					expected: [
						{ title: 'A seed in the gears', likes: 61 },
						{ title: 'The clockwork fox', likes: 77 },
						{ title: 'Rain on Pine Street', likes: 98 }
					],
					message:
						'Not quite. Is Sketches in your result? It isn’t published, so filter with `WHERE published = 1`. Then sort fewest first with `ORDER BY likes`.'
				}
			]
		}
	]
};
