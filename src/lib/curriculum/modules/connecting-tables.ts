import type { Module } from '#lib/curriculum/types.ts';
import { sqlWorld } from '#lib/curriculum/inkwell.ts';

const M = 'connecting-tables';

export const connectingTables: Module = {
	id: M,
	track: 'web',
	order: 8,
	emoji: '🔗',
	title: 'Connecting tables',
	blurb:
		'See how one table points at another, and put them side by side to answer bigger questions.',
	prereq: 'No JavaScript needed here: it’s all SQL, and you’ll pick it up as you go.',
	lessons: [
		{
			id: `${M}/01-join`,
			slug: '01-join',
			kind: 'code',
			title: 'Which series is this?',
			xp: 20,
			language: 'sql',
			story:
				'The “Latest episodes” screen shows episode titles, but readers want to know which series each one belongs to. The `episodes` table only has a `series_id`. The series titles are in another table.',
			task: 'List every episode’s title next to its series title. Name the columns `title` and `series`: `SELECT episodes.title, series.title AS series …`',
			concept: {
				title: 'A pointer, not a copy',
				panels: [
					{
						who: 'mina',
						scene: 'database',
						text: 'Episode 7 says `series_id` 3. Why not just write “Night Shift Noodles” there?'
					},
					{
						who: 'you',
						text: 'Then the title would live in every episode row. Rename the series and you’d have to fix them all, and you’d miss one.'
					},
					{
						who: 'narrator',
						text: '`series_id` points at the row in `series` with that `id`: a pointer, not a copy. A column like that is called a **foreign key**.'
					},
					{
						who: 'theo',
						text: 'Fine, but the app needs the title next to each episode.'
					},
					{
						who: 'you',
						text: '`JOIN` lines the tables up: each episode next to the series row its `series_id` points at. `ON` gives the rule for matching.',
						code: 'FROM episodes\nJOIN series ON series.id = episodes.series_id'
					},
					{
						who: 'bit',
						text: 'Both tables have a `title`, so say whose you mean: `episodes.title`, `series.title`. And give one a new name with `AS`, or they’ll clash.'
					}
				]
			},
			newCommands: ['JOIN'],
			hints: [
				'Start with `SELECT episodes.title, series.title AS series FROM episodes`.',
				'Then add `JOIN series ON series.id = episodes.series_id` before the `;`.',
				'```sql\nSELECT episodes.title, series.title AS series\nFROM episodes\nJOIN series ON series.id = episodes.series_id;\n```'
			],
			world: sqlWorld(),
			starterCode: `SELECT title, series_id FROM episodes;
`,
			solution: `SELECT episodes.title, series.title AS series
FROM episodes
JOIN series ON series.id = episodes.series_id;
`,
			checks: [
				{
					type: 'sql-columns',
					columns: ['title', 'series'],
					message:
						'The result should have two columns: `title` (the episode’s) and `series` (from `series.title AS series`).'
				},
				{
					type: 'sql-result',
					anyOrder: true,
					expected: [
						{ title: 'The first parcel', series: 'Moonlit Deliveries' },
						{ title: 'Rain on Pine Street', series: 'Moonlit Deliveries' },
						{ title: 'The locked gate', series: 'Moonlit Deliveries' },
						{ title: 'Sketches', series: 'Moonlit Deliveries' },
						{ title: 'A seed in the gears', series: 'Grove & Gear' },
						{ title: 'The clockwork fox', series: 'Grove & Gear' },
						{ title: 'Opening night', series: 'Night Shift Noodles' },
						{ title: 'Extra spicy', series: 'Night Shift Noodles' }
					],
					message:
						'Every one of the eight episodes should appear once, next to the title of its own series. Match them with `ON series.id = episodes.series_id`.'
				}
			]
		},
		{
			id: `${M}/02-join-where`,
			slug: '02-join-where',
			kind: 'code',
			title: 'Everything Mina made',
			xp: 20,
			language: 'sql',
			story:
				'Mina is putting together a portfolio and wants every episode she has made. Episodes don’t know who made them. Series do: it’s the `author` column.',
			task: 'List the `title` and `likes` of every episode from a series whose `author` is `Mina`.',
			concept: {
				title: 'Filter on the other table',
				panels: [
					{
						who: 'mina',
						text: 'My name isn’t anywhere in the episodes table.'
					},
					{
						who: 'you',
						text: 'Once the tables are joined, every row has the series’ columns too. So `WHERE` can look at them.',
						code: "WHERE series.author = 'Mina'"
					},
					{
						who: 'narrator',
						text: 'The `JOIN` happens first, then `WHERE` filters the joined rows.'
					}
				]
			},
			hints: [
				'Join `episodes` to `series` like last time, but select `episodes.title, episodes.likes`.',
				"Add `WHERE series.author = 'Mina'` at the end. Text goes in single quotes, with a capital M.",
				"```sql\nSELECT episodes.title, episodes.likes\nFROM episodes\nJOIN series ON series.id = episodes.series_id\nWHERE series.author = 'Mina';\n```"
			],
			world: sqlWorld(),
			starterCode: `SELECT episodes.title, episodes.likes
FROM episodes
JOIN series ON series.id = episodes.series_id;
`,
			solution: `SELECT episodes.title, episodes.likes
FROM episodes
JOIN series ON series.id = episodes.series_id
WHERE series.author = 'Mina';
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
						{ title: 'Rain on Pine Street', likes: 98 },
						{ title: 'The locked gate', likes: 143 },
						{ title: 'Sketches', likes: 0 },
						{ title: 'Opening night', likes: 210 },
						{ title: 'Extra spicy', likes: 188 }
					],
					message:
						"Mina writes Moonlit Deliveries and Night Shift Noodles, so there should be six episodes, none from Grove & Gear. Filter with `WHERE series.author = 'Mina'`."
				}
			]
		},
		{
			id: `${M}/03-predict-join-rows`,
			slug: '03-predict-join-rows',
			kind: 'predict',
			title: 'How many rows?',
			xp: 15,
			language: 'sql',
			story:
				'The moderators want a page with every comment and the episode it’s on. There are 5 comments and 8 episodes in the database.',
			task: 'Read the query and decide how many rows it gives back.',
			code: `SELECT comments.author, comments.text, episodes.title
FROM comments
JOIN episodes ON episodes.id = comments.episode_id;
`,
			world: sqlWorld(),
			question: 'How many rows come back?',
			choices: [
				'5: one for each comment',
				'8: one for each episode',
				'13: all the comments plus all the episodes',
				'40: every comment paired with every episode'
			],
			answer: 0,
			hints: [
				'Each comment has one `episode_id`. How many episodes can it match?',
				'What happens to an episode nobody has commented on? Is there a comment to put next to it?'
			],
			explanation:
				'5. Each comment points at exactly one episode, so each comment becomes one row with its episode’s title next to it. Episode 1 shows up twice, because it has two comments. Episodes with no comments, like The clockwork fox, don’t show up at all: there’s nothing to pair them with. A `JOIN` only keeps rows that found a partner.'
		},
		{
			id: `${M}/04-group-by`,
			slug: '04-group-by',
			kind: 'code',
			title: 'Episodes per series',
			xp: 20,
			language: 'sql',
			story:
				'Theo is planning next season and wants to know how many episodes each series has so far. One number per series.',
			task: 'For each `series_id`, count its episodes. Name the count column `episode_count`.',
			concept: {
				title: 'Piles, then counts',
				panels: [
					{
						who: 'theo',
						text: 'How many episodes does each series have? Not the total, one number per series.'
					},
					{
						who: 'you',
						text: '`COUNT(*)` on its own counts the whole table. `GROUP BY` first sorts the rows into piles, one pile per `series_id`, and then counts each pile.',
						code: 'SELECT series_id, COUNT(*) AS episode_count\nFROM episodes\nGROUP BY series_id;'
					},
					{
						who: 'mina',
						text: 'So eight rows go in and three come out?'
					},
					{
						who: 'you',
						text: 'One per pile. That’s the whole trick.'
					}
				]
			},
			newCommands: ['GROUP BY'],
			hints: [
				'Start with `SELECT series_id, COUNT(*) AS episode_count FROM episodes`.',
				'Add `GROUP BY series_id` at the end, before the `;`.',
				'`SELECT series_id, COUNT(*) AS episode_count FROM episodes GROUP BY series_id;`'
			],
			world: sqlWorld(),
			starterCode: `SELECT COUNT(*) AS episode_count FROM episodes;
`,
			solution: `SELECT series_id, COUNT(*) AS episode_count
FROM episodes
GROUP BY series_id;
`,
			checks: [
				{
					type: 'sql-columns',
					columns: ['series_id', 'episode_count'],
					message: 'The result should have two columns: `series_id` and `episode_count`.'
				},
				{
					type: 'sql-result',
					anyOrder: true,
					expected: [
						{ series_id: 1, episode_count: 4 },
						{ series_id: 2, episode_count: 2 },
						{ series_id: 3, episode_count: 2 }
					],
					message:
						'There should be one row per series: series 1 has 4 episodes, series 2 and 3 have 2 each. Use `GROUP BY series_id`.'
				}
			]
		},
		{
			id: `${M}/05-fix-join`,
			slug: '05-fix-join',
			kind: 'fix',
			title: 'Comments in the wrong place',
			xp: 20,
			language: 'sql',
			story:
				'The new “Most discussed” list says Sketches has a comment, and Sketches isn’t even published. Somebody’s `JOIN` is matching the wrong things. Press **Run** and compare with the `comments` table.',
			task: 'Fix the query so it counts each episode’s real comments. The first parcel should have 2, The locked gate 1 and Opening night 2.',
			hints: [
				'Look at the `ON` part. Which column in `comments` says which episode a comment belongs to?',
				'`comments.id` is the comment’s own number. The pointer to the episode is `comments.episode_id`.',
				'Change the `ON` line to `JOIN episodes ON episodes.id = comments.episode_id`.'
			],
			world: sqlWorld(),
			starterCode: `SELECT episodes.title, COUNT(*) AS comment_count
FROM comments
JOIN episodes ON episodes.id = comments.id
GROUP BY episodes.id;
`,
			solution: `SELECT episodes.title, COUNT(*) AS comment_count
FROM comments
JOIN episodes ON episodes.id = comments.episode_id
GROUP BY episodes.id;
`,
			checks: [
				{
					type: 'sql-result',
					anyOrder: true,
					expected: [
						{ title: 'The first parcel', comment_count: 2 },
						{ title: 'The locked gate', comment_count: 1 },
						{ title: 'Opening night', comment_count: 2 }
					],
					message:
						'Only three episodes have comments: The first parcel (2), The locked gate (1) and Opening night (2). Match each comment to its episode with `comments.episode_id`.'
				}
			]
		},
		{
			id: `${M}/06-boss`,
			slug: '06-boss',
			kind: 'code',
			title: 'The season report',
			xp: 50,
			boss: true,
			language: 'sql',
			story:
				'End of season. Theo needs one small table for the investors: each series by name, how many episodes it has published, and how many likes they got in total, most liked series first. He’d like it before his coffee gets cold. This is the kind of report that usually means waiting on someone else, and this time the someone is you.',
			task: 'One row per series with three columns: `series` (the series title), `published_episodes` (how many published episodes) and `total_likes` (their likes added up), sorted by `total_likes`, biggest first.\nNew helper: `SUM(column)` adds up a column the way `COUNT(*)` counts rows.',
			hints: [
				'Build it in steps and press **Run** after each: first the `JOIN` from level 1, then `WHERE episodes.published = 1`, then `GROUP BY series.id`, then the sort.',
				'The columns are `series.title AS series, COUNT(*) AS published_episodes, SUM(episodes.likes) AS total_likes`. The order of the parts is `SELECT … FROM … JOIN … WHERE … GROUP BY … ORDER BY …`.',
				'```sql\nSELECT series.title AS series, COUNT(*) AS published_episodes, SUM(episodes.likes) AS total_likes\nFROM episodes\nJOIN series ON series.id = episodes.series_id\nWHERE episodes.published = 1\nGROUP BY series.id\nORDER BY total_likes DESC;\n```'
			],
			world: sqlWorld(),
			starterCode: `-- Season report: series, published_episodes, total_likes
-- One row per series, most liked first.
`,
			solution: `SELECT series.title AS series, COUNT(*) AS published_episodes, SUM(episodes.likes) AS total_likes
FROM episodes
JOIN series ON series.id = episodes.series_id
WHERE episodes.published = 1
GROUP BY series.id
ORDER BY total_likes DESC;
`,
			checks: [
				{
					type: 'sql-columns',
					columns: ['series', 'published_episodes', 'total_likes'],
					message:
						'The result should have three columns: `series`, `published_episodes` and `total_likes`. Name them with `AS`.'
				},
				{
					type: 'sql-row-count',
					min: 3,
					max: 3,
					message:
						'There should be one row per series, three in all. Group with `GROUP BY series.id`.'
				},
				{
					type: 'sql-result',
					expected: [
						{ series: 'Night Shift Noodles', published_episodes: 2, total_likes: 398 },
						{ series: 'Moonlit Deliveries', published_episodes: 3, total_likes: 361 },
						{ series: 'Grove & Gear', published_episodes: 2, total_likes: 138 }
					],
					message:
						'Close. Check two things: Moonlit Deliveries has 3 published episodes (Sketches isn’t one, so use `WHERE episodes.published = 1`), and the most liked series comes first (`ORDER BY total_likes DESC`).'
				}
			]
		}
	]
};
