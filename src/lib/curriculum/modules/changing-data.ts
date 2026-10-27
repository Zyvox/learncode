import type { Module } from '#lib/curriculum/types.ts';
import { sqlWorld } from '#lib/curriculum/inkwell.ts';

const M = 'changing-data';

/** Every episode's id and likes as seeded, for "nothing else changed" checks. */
const LIKES = [
	{ id: 1, likes: 120 },
	{ id: 2, likes: 98 },
	{ id: 3, likes: 143 },
	{ id: 4, likes: 0 },
	{ id: 5, likes: 61 },
	{ id: 6, likes: 77 },
	{ id: 7, likes: 210 },
	{ id: 8, likes: 188 }
];

export const changingData: Module = {
	id: M,
	track: 'web',
	order: 7,
	emoji: '✏️',
	title: 'Changing data',
	blurb: 'Add rows, change them and delete them, and learn why one missing WHERE can ruin a day.',
	prereq: 'No JavaScript needed here: it’s all SQL, and you’ll pick it up as you go.',
	lessons: [
		{
			id: `${M}/01-insert`,
			slug: '01-insert',
			kind: 'code',
			title: 'A new row',
			xp: 15,
			language: 'sql',
			story:
				'Mina spent a week on the gate scene in episode 3 and wants to leave a note for readers under it. The comments section is just the `comments` table, so a new comment is a new row.',
			task: 'Add a comment to episode 3 from the author `mina`, with any text you like. Use `INSERT INTO comments (episode_id, author, text) VALUES (…);`',
			concept: {
				title: 'INSERT adds a row',
				panels: [
					{
						who: 'mina',
						text: 'Asking questions is nice. Can I put something in there, too?'
					},
					{
						who: 'you',
						text: '`INSERT INTO` adds a row. First you name the columns you’re filling in, then the values, in the same order.',
						code: "INSERT INTO comments (episode_id, author, text)\nVALUES (3, 'mina', 'This scene took me a week');"
					},
					{
						who: 'mina',
						text: 'What about `id` and `created_at`? I didn’t give those.'
					},
					{
						who: 'you',
						text: 'The database fills them in for you: the next free id, and the default date. That’s one less thing to get wrong.'
					},
					{
						who: 'narrator',
						scene: 'database',
						text: 'The `SELECT` underneath runs after your `INSERT`, so your new row shows up in its result.'
					}
				]
			},
			newCommands: ['INSERT INTO'],
			hints: [
				'Columns first, in brackets: `(episode_id, author, text)`. Then `VALUES` and three values in the same order.',
				"Numbers go as they are, text goes in single quotes: `(3, 'mina', 'your text')`.",
				"`INSERT INTO comments (episode_id, author, text) VALUES (3, 'mina', 'This scene took me a week');`"
			],
			world: sqlWorld(),
			starterCode: `-- Add Mina's comment to episode 3 on the empty line below.

-- This shows the comments on episode 3, so you can see yours appear.
SELECT * FROM comments WHERE episode_id = 3;
`,
			solution: `INSERT INTO comments (episode_id, author, text) VALUES (3, 'mina', 'This scene took me a week');
SELECT * FROM comments;
`,
			checks: [
				{
					type: 'db-rows',
					sql: 'SELECT COUNT(*) AS n FROM comments',
					expected: [{ n: 6 }],
					message:
						'The `comments` table should have exactly one new row: 6 comments in all. Use one `INSERT INTO`.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT episode_id, author FROM comments WHERE id = 6',
					expected: [{ episode_id: 3, author: 'mina' }],
					message:
						"The new comment should be on episode 3 (`episode_id` 3) from `'mina'`, in lower case."
				}
			]
		},
		{
			id: `${M}/02-update`,
			slug: '02-update',
			kind: 'code',
			title: 'One more like',
			xp: 20,
			language: 'sql',
			story:
				'Last night’s outage swallowed a like on The locked gate (episode 3). The reader emailed to say so, very politely. Give it back.',
			task: 'Above the `SELECT`, add one like to episode 3, and only episode 3: `likes = likes + 1` for the row with `id = 3`. The `SELECT` then shows the new number.',
			concept: {
				title: 'UPDATE changes rows',
				panels: [
					{
						who: 'you',
						text: '`UPDATE` changes rows that already exist: `SET` says what to change, and `WHERE` says which rows.',
						code: 'UPDATE episodes SET likes = likes + 1 WHERE id = 3;'
					},
					{
						who: 'mina',
						text: 'Why not just write `likes = 144`?'
					},
					{
						who: 'you',
						text: 'Because by the time it runs, someone else may have liked it too. `likes + 1` means “whatever it is right now, plus one”.'
					}
				]
			},
			newCommands: ['UPDATE'],
			hints: [
				'The shape is `UPDATE table SET column = new value WHERE which rows;`',
				'The new value is `likes + 1`, and the row is `id = 3`.',
				'`UPDATE episodes SET likes = likes + 1 WHERE id = 3;`'
			],
			world: sqlWorld(),
			starterCode: `-- Here is episode 3 as it is now. Give it one more like.
SELECT id, title, likes FROM episodes WHERE id = 3;
`,
			solution: `UPDATE episodes SET likes = likes + 1 WHERE id = 3;
SELECT id, title, likes FROM episodes;
`,
			checks: [
				{
					type: 'db-rows',
					sql: 'SELECT id, likes FROM episodes ORDER BY id',
					expected: LIKES.map((e) => (e.id === 3 ? { id: 3, likes: 144 } : e)),
					message:
						'Episode 3 should have 144 likes, and every other episode should be exactly as it was. Check the `WHERE id = 3`.'
				},
				{
					type: 'code-includes',
					pattern: 'likes\\s*\\+\\s*1',
					message:
						'Let the database do the adding with `likes = likes + 1`, so it’s right even if the number changed in the meantime.'
				}
			]
		},
		{
			id: `${M}/03-predict-no-where`,
			slug: '03-predict-no-where',
			kind: 'predict',
			title: 'The missing WHERE',
			xp: 15,
			language: 'sql',
			story:
				'Theo has been watching you and wants a go. He’d like the likes on Sketches (episode 4) set to zero, just to be sure. He types this and reaches for **Run**.',
			task: 'Read Theo’s SQL and decide what happens.',
			code: `UPDATE episodes SET likes = 0;
SELECT title, likes FROM episodes;
`,
			world: sqlWorld(),
			question: 'What does the `SELECT` show after Theo’s `UPDATE`?',
			choices: [
				'Only Sketches changes, and it was 0 anyway, so everything looks the same',
				'Nothing changes: SQLite refuses an `UPDATE` without a `WHERE` and shows an error',
				'Every episode in the table now has 0 likes',
				'Only the first row, The first parcel, drops to 0'
			],
			answer: 2,
			hints: [
				'Which part of an `UPDATE` says which rows to change? Is it there?',
				'With no `WHERE`, there is no filter. Which rows does that leave?'
			],
			explanation:
				'Every episode now has 0 likes. All eight of them. Without a `WHERE`, `UPDATE` means “every row in the table”, and SQLite does it without a word of warning. Theo has gone very quiet. Here the database resets each time you press **Run**; a real one doesn’t. That’s why careful people write the `WHERE` first, run it as a `SELECT` to see which rows it hits, and only then turn it into an `UPDATE`. And why backups exist.'
		},
		{
			id: `${M}/04-fix-delete`,
			slug: '04-fix-delete',
			kind: 'fix',
			title: 'Remove the spoiler',
			xp: 20,
			language: 'sql',
			story:
				'Comment 3, under The locked gate, gives away the twist of the whole episode. Theo has written the SQL to remove it, and learned nothing from last time. Press **Run** and look at the comments table.',
			task: 'Fix the `DELETE` so it removes comment 3, and only comment 3.',
			concept: {
				title: 'DELETE removes rows',
				panels: [
					{
						who: 'you',
						text: '`DELETE FROM` removes rows from a table. Like `UPDATE`, the `WHERE` decides which ones.',
						code: 'DELETE FROM comments WHERE id = 3;'
					},
					{
						who: 'theo',
						text: 'And if I leave out the WHERE?'
					},
					{
						who: 'you',
						text: 'Same as last time: every row. The table stays, empty.'
					},
					{
						who: 'narrator',
						scene: 'database',
						text: 'Use the id to point at one row. Ids are unique, so `WHERE id = 3` can only ever hit one.'
					}
				]
			},
			newCommands: ['DELETE FROM'],
			hints: [
				'After running it, the `comments` table is empty. What is missing from the `DELETE`?',
				'Add a `WHERE` that picks the row whose `id` is 3.',
				'`DELETE FROM comments WHERE id = 3;`'
			],
			world: sqlWorld(),
			starterCode: `-- Remove ravi's spoiler (comment 3). Only that one.
DELETE FROM comments;
SELECT * FROM comments;
`,
			solution: `-- Remove ravi's spoiler (comment 3). Only that one.
DELETE FROM comments WHERE id = 3;
SELECT * FROM comments;
`,
			checks: [
				{
					type: 'db-rows',
					sql: 'SELECT id FROM comments ORDER BY id',
					expected: [{ id: 1 }, { id: 2 }, { id: 4 }, { id: 5 }],
					message:
						'Comments 1, 2, 4 and 5 should still be there, and comment 3 gone. Add `WHERE id = 3` to the `DELETE`.'
				}
			]
		},
		{
			id: `${M}/05-predict-ids`,
			slug: '05-predict-ids',
			kind: 'predict',
			title: 'Whose id is it?',
			xp: 20,
			language: 'sql',
			story:
				'Two readers comment on Extra spicy (episode 8). In between, a moderator deletes comment 5. Then you look at the comments on episode 8.',
			task: 'Read the SQL and work out what id the second new comment gets.',
			concept: {
				title: 'The primary key',
				panels: [
					{
						who: 'mina',
						text: 'When I added my comment, it got an id all by itself. Who decides?'
					},
					{
						who: 'you',
						text: 'The `id` column is the table’s **primary key**: every row has one, and no two rows ever share it. You don’t pick it; the database does.'
					},
					{
						who: 'narrator',
						scene: 'database',
						text: 'That’s what lets `WHERE id = 3` point at exactly one row, and what an endpoint like `/comments/3` relies on.'
					},
					{
						who: 'you',
						text: 'Remember `comments.length + 1` in your server’s list? Delete one comment and it hands out an id that’s already taken, but the database keeps better track.'
					}
				]
			},
			code: `INSERT INTO comments (episode_id, author, text) VALUES (8, 'ravi', 'Too spicy for me');
DELETE FROM comments WHERE id = 5;
INSERT INTO comments (episode_id, author, text) VALUES (8, 'june_b', 'Not spicy enough');
SELECT id, author, text FROM comments WHERE episode_id = 8;
`,
			world: sqlWorld(),
			question: 'The table starts with comments 1 to 5. What `id` does june_b’s comment get?',
			choices: [
				'5, because that number just became free',
				'6, because the table has 5 rows again after the delete',
				'7, one more than the biggest id in the table',
				'A random number, so ids can’t be guessed'
			],
			answer: 2,
			hints: [
				'Ravi’s comment comes first. Which id does it get, with comments 1 to 5 already there?',
				'After the delete, what is the biggest id left in the table?'
			],
			explanation:
				'7. Ravi’s comment gets 6. Deleting comment 5 leaves a gap, but SQLite doesn’t go back to fill it: it takes one more than the biggest id in the table, and that’s still 6. So june_b gets 7. Counting rows, like `comments.length + 1` did, would have said 6, and two comments would have shared an id. Links to “comment 6” would then point at the wrong one.'
		},
		{
			id: `${M}/06-boss`,
			slug: '06-boss',
			kind: 'code',
			title: 'Publish day',
			xp: 45,
			boss: true,
			language: 'sql',
			story:
				'It’s 8 October, and episode 4 of Moonlit Deliveries is finished. The database still calls it “Sketches” and keeps it hidden. Mina has the real title, and a note she wants waiting under it for the first readers. She pulls up a chair: “Go on. You press **Run**.”',
			task: "Publish episode 4, for real:\n1. Give it the title `The night market`.\n2. Publish it: `published = 1`.\n3. Add Mina’s comment on episode 4: author `mina`, text `Finally out. Thank you for waiting.`, and `created_at` set to today, `'2026-10-08'`.\nTip: one `UPDATE` can change two columns: `SET title = '…', published = 1`.",
			outro: {
				panels: [
					{
						who: 'narrator',
						scene: 'database',
						text: 'Row 4 changes. “Sketches” becomes The night market, and `published` flips to 1.'
					},
					{
						who: 'mina',
						scene: 'phone',
						text: 'Mina refreshes the app. Her episode is there, and her note is the first thing under it. She refreshes again, just to see it twice.'
					},
					{
						who: 'theo',
						text: 'Three lines of SQL and the episode is out? I’ve sat through launch meetings longer than that.'
					},
					{
						who: 'bit',
						scene: 'wire',
						text: 'Episode 4, finally on the menu. Readers, I’m on my way.'
					}
				]
			},
			hints: [
				'Start with the `UPDATE`, for the row with `id = 4`. Don’t forget the `WHERE`: you know what happens without it.',
				"`UPDATE episodes SET title = 'The night market', published = 1 WHERE id = 4;` Then an `INSERT INTO comments` like in level 1, with `episode_id` 4 and one more column: `created_at`.",
				"Both lines:\n```sql\nUPDATE episodes SET title = 'The night market', published = 1 WHERE id = 4;\nINSERT INTO comments (episode_id, author, text, created_at)\nVALUES (4, 'mina', 'Finally out. Thank you for waiting.', '2026-10-08');\n```"
			],
			world: sqlWorld(),
			starterCode: `-- 1. Rename episode 4 to 'The night market'
-- 2. Publish it
-- 3. Add Mina's comment on it, dated today: '2026-10-08'

-- Episode 4 as it is now:
SELECT * FROM episodes WHERE id = 4;
`,
			solution: `UPDATE episodes SET title = 'The night market', published = 1 WHERE id = 4;
INSERT INTO comments (episode_id, author, text, created_at)
VALUES (4, 'mina', 'Finally out. Thank you for waiting.', '2026-10-08');
SELECT * FROM episodes WHERE id = 4;
`,
			checks: [
				{
					type: 'db-rows',
					sql: 'SELECT id, title, published FROM episodes ORDER BY id',
					expected: [
						{ id: 1, title: 'The first parcel', published: 1 },
						{ id: 2, title: 'Rain on Pine Street', published: 1 },
						{ id: 3, title: 'The locked gate', published: 1 },
						{ id: 4, title: 'The night market', published: 1 },
						{ id: 5, title: 'A seed in the gears', published: 1 },
						{ id: 6, title: 'The clockwork fox', published: 1 },
						{ id: 7, title: 'Opening night', published: 1 },
						{ id: 8, title: 'Extra spicy', published: 1 }
					],
					message:
						'Episode 4 should be called `The night market` and have `published` 1, and every other episode should keep its own title. Check the `WHERE id = 4`.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT COUNT(*) AS n FROM comments',
					expected: [{ n: 6 }],
					message: 'There should be exactly one new comment: 6 in all.'
				},
				{
					type: 'db-rows',
					sql: 'SELECT episode_id, author FROM comments WHERE id = 6',
					expected: [{ episode_id: 4, author: 'mina' }],
					message: "The new comment should be on episode 4, from `'mina'`."
				},
				{
					type: 'db-rows',
					sql: 'SELECT text, created_at FROM comments WHERE id = 6',
					expected: [{ text: 'Finally out. Thank you for waiting.', created_at: '2026-10-08' }],
					message:
						"Mina wrote her note already: `'Finally out. Thank you for waiting.'`, word for word, with `created_at` `'2026-10-08'`. Readers will see exactly what you type."
				}
			]
		}
	]
};
