import type { Module } from '#lib/curriculum/types.ts';

const M = 'remembering-things';

export const rememberingThings: Module = {
	id: M,
	order: 5,
	emoji: '🧠',
	title: 'Remembering things',
	blurb: 'Give a value a name, keep it, change it, and print it out.',
	lessons: [
		{
			id: `${M}/01-print`,
			slug: '01-print',
			kind: 'code',
			title: 'Hello, console',
			xp: 10,
			story: {
				default:
					"{Hero} is taking a break. This time there's no map, just a console: a place where your program can write text. Programmers have started this way for decades, so you're in good company.",
				games:
					'{Hero} is resting at the inn. No map this time, just a console: a place where your program writes text. Every programmer in history started here.',
				space:
					'{Hero} is recharging. Time to send a message back home instead. The console is where your program writes text, line by line.'
			},
			task: 'Use `print("Hello")` to write Hello in the console.',
			concept: {
				title: 'Print',
				body: '`print()` writes a line in the console. Text goes in quotes, just like with `say()`.\n\n```js\nprint("Hello");\nprint("How are you?");\n```\n\nEach `print` makes a new line.'
			},
			newCommands: ['print(value)'],
			hints: [
				'It looks just like `say("Hello");` but with `print` instead of `say`.',
				'Type this exactly: `print("Hello");`'
			],
			world: { kind: 'console' },
			starterCode: `// Write your line below this one.
`,
			solution: `print("Hello");
`,
			checks: [
				{
					type: 'output-includes',
					text: 'Hello',
					message: 'The console doesn\'t say "Hello" yet. Check the quotes and the capital H.'
				}
			]
		},
		{
			id: `${M}/02-fix-numbers`,
			slug: '02-fix-numbers',
			kind: 'fix',
			title: 'Do the maths',
			xp: 15,
			story: {
				default:
					'{Friend} asks: if you have 17 {items} and find 25 more, how many is that? This code tries to work it out, but it prints the question instead of the answer.',
				games:
					'{Friend} asks: 17 {items} plus 25 {items}, how many is that? This code tries to work it out, but it prints the sum instead of the answer. Press **Run**.',
				music:
					'{Friend} asks: a 17-note riff plus a 25-note riff, how many notes is that? This code prints the question instead of the answer. Press **Run**.'
			},
			task: 'Make the program print the answer, `42`, using `+`. Let the computer do the adding.',
			concept: {
				title: 'Numbers vs text',
				body: 'Anything in quotes is text, and the computer prints it exactly as written. Numbers without quotes are numbers, and the computer can do maths with them.\n\n```js\nprint("2 + 3");   // prints 2 + 3\nprint(2 + 3);     // prints 5\n```'
			},
			hints: [
				'Run it and look at the console: the computer printed your sum word for word. Why?',
				'The quotes turn the sum into text. Remove them.',
				'Write `print(17 + 25);`'
			],
			world: { kind: 'console' },
			starterCode: `print("17 + 25");
`,
			solution: `print(17 + 25);
`,
			checks: [
				{ type: 'output-equals', lines: ['42'] },
				{
					type: 'code-includes',
					pattern: '17\\s*\\+\\s*25',
					message:
						'Let the computer do the adding: keep `17 + 25` in your code, just without the quotes.'
				}
			]
		},
		{
			id: `${M}/03-variables`,
			slug: '03-variables',
			kind: 'code',
			title: { default: 'A box with a name', games: 'Loot counter', food: 'Keeping count' },
			xp: 20,
			story: {
				default:
					"{Hero} picks up {items} one at a time. To keep count, the program needs to remember a number and change it. That's what a variable is for.",
				games:
					"Every time {hero} picks up a {item}, someone has to keep count. Let's teach the program to remember.",
				food: "Every time {hero} adds a {item} to the {goal}, someone has to keep count. Let's teach the program to remember."
			},
			task: 'The code makes a variable called `score` and prints it. Below that, add 1 to `score` three times, then print it again. The console should show 0, then 3.',
			concept: {
				title: 'Variables',
				body: 'A variable is a box with a name on it. `let` makes a new box and puts a value in.\n\n```js\nlet score = 0;\nscore = score + 1;\nprint(score);   // 1\n```\n\nThe middle line looks odd at first. Read it as "score becomes score plus one". The computer works out the right side first, then puts the result back in the box.'
			},
			hints: [
				'The line that adds one is `score = score + 1;`.',
				'Write that line three times, then `print(score);` again.',
				'Full code:\n```js\nlet score = 0;\nprint(score);\nscore = score + 1;\nscore = score + 1;\nscore = score + 1;\nprint(score);\n```'
			],
			world: { kind: 'console' },
			starterCode: `let score = 0;
print(score);
`,
			solution: `let score = 0;
print(score);
score = score + 1;
score = score + 1;
score = score + 1;
print(score);
`,
			checks: [
				{ type: 'output-equals', lines: ['0', '3'] },
				{
					type: 'code-includes',
					pattern: 'score\\s*=\\s*score\\s*\\+',
					message: 'Change the box with `score = score + 1;` rather than typing the 3 yourself.'
				}
			]
		},
		{
			id: `${M}/04-fix-spaces`,
			slug: '04-fix-spaces',
			kind: 'fix',
			title: 'Squashed together',
			xp: 20,
			story: {
				default:
					'Two variables already exist in this level: `player` is "Sam" and `score` is 12. The code glues them into a sentence, but it comes out all squashed. Press **Run** and look.',
				sports:
					'The scoreboard has two variables ready: `player` is "Sam" and `score` is 12. But the sentence comes out all squashed. Press **Run** and look.'
			},
			task: 'Fix the code so the console says exactly `Sam has 12 points`.',
			concept: {
				title: 'Gluing text',
				body: '`+` between pieces of text glues them together, exactly as they are. It never adds spaces for you.\n\n```js\nprint("ice" + "cream");    // icecream\nprint("ice " + "cream");   // ice cream\n```\n\nIt works with numbers in the mix too: `"Level " + 3` gives `Level 3`.'
			},
			hints: [
				'Look at the console: where are the missing spaces?',
				'The spaces have to be inside the quotes: `" has "` and `" points"`.',
				'Like this:\n```js\nprint(player + " has " + score + " points");\n```'
			],
			world: { kind: 'console', variables: { player: 'Sam', score: 12 } },
			starterCode: `print(player + "has" + score + "points");
`,
			solution: `print(player + " has " + score + " points");
`,
			checks: [
				{ type: 'output-equals', lines: ['Sam has 12 points'] },
				{
					type: 'code-excludes',
					pattern: 'Sam|12',
					message:
						'Use the variables `player` and `score` instead of typing Sam or 12. That way it still works when the score changes.'
				}
			]
		},
		{
			id: `${M}/05-counting`,
			slug: '05-counting',
			kind: 'code',
			title: { default: 'Hide and seek', games: 'Countdown to adventure', sports: 'Warm-up count' },
			xp: 20,
			story: {
				default:
					"{Friend} wants to play hide and seek. Someone has to count to 5. Remember the `for` loop counter `i`? It's a variable too, and you can print it.",
				sports:
					"{Friend} says: five jumping jacks, count them out loud. Remember the `for` loop counter `i`? It's a variable too, so you can print it."
			},
			task: 'Print the numbers 1 to 5, each on its own line, then `Ready or not`. Use a loop: at most 2 `print` calls in your code.',
			concept: {
				title: 'The counter is a variable',
				body: 'In a `for` loop, `i` is a variable that changes every time round. You can start it anywhere you like.\n\n```js\nfor (let i = 0; i < 3; i++) {\n  print(i);\n}\n// 0, 1, 2\n```\n\nIf you want it to start at 1, write `let i = 1`. The loop runs while `i < something` is true.'
			},
			hints: [
				'Run the starter first. It counts 0, 1, 2. You need 1 to 5.',
				'Start at 1 with `let i = 1`, and keep going while `i < 6`. Put `print("Ready or not");` after the loop.',
				'Like this:\n```js\nfor (let i = 1; i < 6; i++) {\n  print(i);\n}\nprint("Ready or not");\n```'
			],
			world: { kind: 'console' },
			starterCode: `for (let i = 0; i < 3; i++) {
  print(i);
}
`,
			solution: `for (let i = 1; i < 6; i++) {
  print(i);
}
print("Ready or not");
`,
			checks: [
				{
					type: 'output-equals',
					lines: ['1', '2', '3', '4', '5', 'Ready or not']
				},
				{
					type: 'max-calls',
					command: 'print',
					count: 2,
					message:
						'You can type five prints, but let the loop count for you. At most 2 `print` calls.'
				}
			]
		},
		{
			id: `${M}/06-if-variable`,
			slug: '06-if-variable',
			kind: 'code',
			title: {
				default: 'Can I afford it?',
				games: 'The shop',
				food: 'Market day',
				space: 'Fuel check'
			},
			xp: 25,
			story: {
				default:
					'{Friend} is selling {reward} for 5 points. The variable `points` holds what you have. The program should check before buying.',
				games:
					'{Friend} is selling {reward} for 5 points. The variable `points` holds what {hero} has. A good program checks before spending.',
				space:
					'A jump to the next planet costs 5 points of fuel. The variable `points` holds what {hero} has. Better check before launching.'
			},
			task: 'If `points` is 5 or more, print `Bought it` and take 5 away from `points`. Otherwise, print `Not enough`. At the end, print `points`.',
			concept: {
				title: 'Comparing variables',
				body: '`if` works with any question, including questions about variables.\n\n```js\nif (points >= 5) {\n  print("Yes");\n} else {\n  print("No");\n}\n```\n\n`>=` means "more than or equal to". There\'s also `<=`, "less than or equal to".'
			},
			hints: [
				'The question is `points >= 5`. Use `if … else` like you did with `pathAhead()`.',
				'Inside the `if`: `print("Bought it");` and `points = points - 5;`. Inside the `else`: `print("Not enough");`.',
				'Like this:\n```js\nif (points >= 5) {\n  print("Bought it");\n  points = points - 5;\n} else {\n  print("Not enough");\n}\nprint(points);\n```'
			],
			world: { kind: 'console', variables: { points: 8 } },
			starterCode: `// points is already 8.
print(points);
`,
			solution: `if (points >= 5) {
  print("Bought it");
  points = points - 5;
} else {
  print("Not enough");
}
print(points);
`,
			checks: [
				{ type: 'output-equals', lines: ['Bought it', '3'] },
				{
					type: 'code-includes',
					pattern: 'if\\s*\\(',
					message: 'Use an `if` to check the points first.'
				},
				{
					type: 'code-includes',
					pattern: 'else',
					message:
						'Add an `else` with `print("Not enough");`, for when there aren\'t enough points.'
				},
				{
					type: 'code-includes',
					pattern: 'points\\s*=\\s*points\\s*-',
					message: 'Take the 5 away from the box: `points = points - 5;`'
				}
			]
		},
		{
			id: `${M}/07-predict`,
			slug: '07-predict',
			kind: 'predict',
			title: 'Follow the box',
			xp: 15,
			story:
				'The value in a variable can change many times. Only the latest one counts. Keep track of the box line by line.',
			task: 'Read the code and pick what gets printed.',
			code: `let lives = 3;
lives = lives - 1;
lives = lives + 2;
print("Lives: " + lives);
`,
			world: { kind: 'console' },
			question: 'What does the console show?',
			choices: ['Lives: 3', 'Lives: lives', 'Lives: 4', 'Lives: 6'],
			answer: 2,
			explanation:
				'`lives` starts at 3. Minus 1 makes it 2. Plus 2 makes it 4. And `"Lives: " + lives` uses the value in the box (4), not the word "lives", because `lives` isn\'t in quotes.',
			hints: [
				'Write the number down after each line: 3, then…?',
				'Things in quotes are printed as-is. Things without quotes are looked up.'
			]
		},
		{
			id: `${M}/08-boss`,
			slug: '08-boss',
			kind: 'code',
			boss: true,
			title: {
				default: 'The scoreboard',
				games: 'High score table',
				sports: 'Match report',
				music: 'Charts night'
			},
			xp: 50,
			story: {
				default:
					'Time to build a real scoreboard. Two variables are ready: `player` is "Sam" and `hits` is 4. Every hit is worth 10 points.',
				games:
					'{Hero} wants a proper high-score screen. Two variables are ready: `player` is "Sam" and `hits` is 4. Every hit is worth 10 points.',
				sports:
					'{Friend} wants a match report. Two variables are ready: `player` is "Sam" and `hits` is 4. Every hit is worth 10 points.'
			},
			task: 'Follow the three steps in the code. The console should end up showing exactly the lines in the example below.\n\n```\nHit! Score: 10\nHit! Score: 20\nHit! Score: 30\nHit! Score: 40\nSam scored 40\nNew high score\n```',
			hints: [
				'Step 1 is a loop that runs `hits` times: `for (let i = 0; i < hits; i++) { … }`. Inside: add 10 to score, then print.',
				'Step 2: `print(player + " scored " + score);`. Step 3: `if (score > 30) { … } else { … }`.',
				'Here\'s one way:\n```js\nlet score = 0;\nfor (let i = 0; i < hits; i++) {\n  score = score + 10;\n  print("Hit! Score: " + score);\n}\nprint(player + " scored " + score);\nif (score > 30) {\n  print("New high score");\n} else {\n  print("Good try");\n}\n```'
			],
			world: { kind: 'console', variables: { player: 'Sam', hits: 4 } },
			starterCode: `let score = 0;

// 1. Repeat hits times: add 10 to score, then print "Hit! Score: " + score

// 2. Print who scored what, like "Sam scored 40" (use player and score)

// 3. If score is more than 30, print "New high score", otherwise "Good try"
`,
			solution: `let score = 0;
for (let i = 0; i < hits; i++) {
  score = score + 10;
  print("Hit! Score: " + score);
}
print(player + " scored " + score);
if (score > 30) {
  print("New high score");
} else {
  print("Good try");
}
`,
			checks: [
				{
					type: 'output-equals',
					lines: [
						'Hit! Score: 10',
						'Hit! Score: 20',
						'Hit! Score: 30',
						'Hit! Score: 40',
						'Sam scored 40',
						'New high score'
					]
				},
				{ type: 'code-includes', pattern: 'for\\s*\\(', message: 'Use a `for` loop for the hits.' },
				{ type: 'code-includes', pattern: 'if\\s*\\(', message: 'Use an `if` for the last line.' },
				{
					type: 'code-excludes',
					pattern: 'Sam',
					message: 'Use the `player` variable instead of typing Sam.'
				},
				{
					type: 'max-calls',
					command: 'print',
					count: 4,
					message: 'Let the loop print the hits. You need at most 4 `print` calls in your code.'
				}
			]
		}
	]
};
