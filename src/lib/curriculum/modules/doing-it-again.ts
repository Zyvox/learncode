import type { Module } from '#lib/curriculum/types.ts';

const M = 'doing-it-again';

/** A 1-tall corridor in row 1 of a 3-row grid: walls above and below. */
function corridorWalls(width: number): [number, number][] {
	const walls: [number, number][] = [];
	for (let x = 0; x < width; x++) {
		walls.push([x, 0], [x, 2]);
	}
	return walls;
}

export const doingItAgain: Module = {
	id: M,
	order: 2,
	emoji: '🔁',
	title: 'Doing it again',
	blurb: 'Instead of writing the same line ten times, tell the computer to repeat it.',
	lessons: [
		{
			id: `${M}/01-keep-going`,
			slug: '01-keep-going',
			kind: 'code',
			title: { default: 'Are we there yet?', games: 'The long corridor', sports: 'Sprint' },
			xp: 15,
			story: {
				default:
					'A long, straight corridor. You could type `move();` seven times. Or you could tell {hero}: "keep walking while the way ahead is clear."',
				games:
					'{Villain} built the longest corridor in {place}, just to be annoying. You could type `move();` seven times. Or you could be clever about it.',
				sports:
					'Seven squares of straight running to the {goal}. You could type `move();` seven times. Or you could tell {hero} to just keep running.'
			},
			task: 'Get {hero} to the {goal} using `move()` only once. Use a `while (pathAhead())` loop.',
			concept: {
				title: 'Repeat while something is true',
				body: '`pathAhead()` is a question: "is the square in front of me free?" It answers yes or no.\n\n```js\nwhile (pathAhead()) {\n  move();\n}\n```\n\nRead it out loud: "while there\'s a path ahead, move." The lines inside the curly brackets `{ }` repeat until the answer becomes no. That repeat-until trick has a name: a **loop**.'
			},
			newCommands: ['pathAhead()'],
			hints: [
				'Delete the `move();` lines and type the loop from the box above.',
				'The loop needs three parts: `while (pathAhead()) {`, then `move();`, then a closing `}`.',
				'Here it is:\n```js\nwhile (pathAhead()) {\n  move();\n}\n```'
			],
			world: {
				kind: 'grid',
				width: 8,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				walls: corridorWalls(8),
				goal: [7, 1]
			},
			starterCode: `move();
move();
move();
// ...four more? There has to be a better way.
`,
			solution: `while (pathAhead()) {
  move();
}
`,
			checks: [
				{ type: 'reach-goal', message: '{Hero} stopped before the {goal}.' },
				{
					type: 'max-calls',
					command: 'move',
					count: 1,
					message:
						"You can get there by typing `move();` lots of times, but try the loop: one `move();` inside `while (pathAhead()) { }`. That's the whole point here."
				}
			]
		},
		{
			id: `${M}/02-fix-double-step`,
			slug: '02-fix-double-step',
			kind: 'fix',
			title: 'Two steps too many',
			xp: 15,
			story: {
				default:
					'{Hero} tried to go faster by taking two steps each time round the loop. It went badly. Press **Run** and watch the end.',
				games:
					'{Hero} got greedy and tried to take two steps each time round the loop. Press **Run** and watch the end. Ouch.',
				music:
					'{Hero} tried double-time: two steps per loop. Press **Run** and listen to the crash at the end.'
			},
			task: 'Fix the loop so {hero} reaches the {goal} without bumping into anything.',
			hints: [
				'The loop only asks `pathAhead()` at the top. Between the two moves, nobody checks.',
				"When there's exactly one free square left, the first `move()` is fine and the second one hits the edge.",
				'Remove one of the two `move();` lines inside the loop.'
			],
			world: {
				kind: 'grid',
				width: 6,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				walls: corridorWalls(6),
				goal: [5, 1]
			},
			starterCode: `while (pathAhead()) {
  move();
  move();
}
`,
			solution: `while (pathAhead()) {
  move();
}
`,
			checks: [{ type: 'reach-goal', message: "{Hero} didn't make it to the {goal}." }]
		},
		{
			id: `${M}/03-repeat-n`,
			slug: '03-repeat-n',
			kind: 'code',
			title: 'Exactly four',
			xp: 20,
			story: {
				default:
					'This time the {goal} {goalEmoji} is in the middle of the room, not at the end. A `while (pathAhead())` loop would walk right past it. Press **Run** and see.',
				nature:
					'The {goal} {goalEmoji} is in the middle of the clearing. A `while (pathAhead())` loop would trot right past it. Press **Run** and see.'
			},
			task: 'Make {hero} take exactly 4 steps, using a `for` loop with only one `move()`.',
			concept: {
				title: 'Repeat a number of times',
				body: 'When you know how many times, use this pattern:\n\n```js\nfor (let i = 0; i < 4; i++) {\n  move();\n}\n```\n\nRead it as "repeat 4 times". The `i` is a counter: it starts at 0 and goes up by one each time, and the loop stops when it reaches 4. So it runs for 0, 1, 2 and 3. That\'s four times. To repeat 7 times, change the 4 to a 7.'
			},
			hints: [
				'Replace the `while` loop with the `for` loop from the box above.',
				'The number after `i <` is how many times it repeats. You need 4.',
				'Like this:\n```js\nfor (let i = 0; i < 4; i++) {\n  move();\n}\n```'
			],
			world: {
				kind: 'grid',
				width: 8,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				walls: corridorWalls(8),
				goal: [4, 1]
			},
			starterCode: `while (pathAhead()) {
  move();
}
`,
			solution: `for (let i = 0; i < 4; i++) {
  move();
}
`,
			checks: [
				{
					type: 'reach-goal',
					message: '{Hero} needs to stop right on the {goal}. Count the steps.'
				},
				{
					type: 'code-includes',
					pattern: 'for\\s*\\(',
					message: "Use a `for` loop here. That's the new thing to try."
				},
				{
					type: 'max-calls',
					command: 'move',
					count: 1,
					message: 'Only one `move();` please, inside the `for` loop. Let the loop do the counting.'
				}
			]
		},
		{
			id: `${M}/04-predict-inside`,
			slug: '04-predict-inside',
			kind: 'predict',
			title: 'Inside or outside?',
			xp: 15,
			story:
				'The curly brackets `{ }` decide what repeats. Everything inside repeats. Everything after the closing bracket happens once, when the loop is done.',
			task: 'Read the code and answer the question.',
			code: `for (let i = 0; i < 3; i++) {
  move();
}
turnLeft();
`,
			world: {
				kind: 'grid',
				width: 5,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' }
			},
			question: 'How many times does `turnLeft()` happen?',
			choices: [
				'3 times, once after each move',
				'Once, after all three moves',
				"Never, it's outside the loop",
				'4 times'
			],
			answer: 1,
			explanation:
				"`turnLeft();` is after the closing `}`, so it's not part of the loop. The loop does its three moves, finishes, and then the computer carries on to the next line: one turn.",
			hints: [
				'Find the closing curly bracket `}`. Is `turnLeft();` before it or after it?',
				'Code after the loop runs once, when the loop has finished.'
			]
		},
		{
			id: `${M}/05-loop-pickup`,
			slug: '05-loop-pickup',
			kind: 'code',
			title: {
				default: 'Hoover it up',
				games: 'Coin trail',
				food: 'Shopping run',
				nature: 'Chestnut season'
			},
			xp: 20,
			story: {
				default:
					"There's a {item} {itemEmoji} on every single square. A loop can do more than one thing each time round.",
				games:
					'Someone left a trail of {items} {itemEmoji} all the way down the corridor. Maybe a trap. Maybe just a very messy goblin.',
				food: 'The shelf has one {item} {itemEmoji} on every square. {Friend} wants all of them, now please.',
				nature:
					'A chestnut tree dropped a {item} {itemEmoji} on every square. Winter is coming. {Hero} wants every one.'
			},
			task: 'Collect every {item} and reach the {goal}. Use one loop, with one `move()` and one `pickUp()` inside it.',
			hints: [
				'Start from the loop you know: `while (pathAhead()) { move(); }`.',
				'After each step, {hero} is standing on a {item}. Add `pickUp();` inside the loop, right after `move();`.',
				'Like this:\n```js\nwhile (pathAhead()) {\n  move();\n  pickUp();\n}\n```'
			],
			world: {
				kind: 'grid',
				width: 7,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				walls: corridorWalls(7),
				items: [
					[1, 1],
					[2, 1],
					[3, 1],
					[4, 1],
					[5, 1],
					[6, 1]
				],
				goal: [6, 1]
			},
			starterCode: `while (pathAhead()) {
  move();
}
`,
			solution: `while (pathAhead()) {
  move();
  pickUp();
}
`,
			checks: [
				{
					type: 'collect-all',
					message: 'Some {items} are still on the floor. Is `pickUp();` inside the loop?'
				},
				{ type: 'reach-goal', message: "{Hero} hasn't reached the {goal}." },
				{
					type: 'max-calls',
					command: 'pickUp',
					count: 1,
					message: 'Write `pickUp();` just once, inside the loop. The loop repeats it for you.'
				},
				{
					type: 'max-calls',
					command: 'move',
					count: 1,
					message: 'Write `move();` just once, inside the loop.'
				}
			]
		},
		{
			id: `${M}/06-square`,
			slug: '06-square',
			kind: 'code',
			title: { default: 'Round the block', sports: 'Laps', space: 'Orbit' },
			xp: 25,
			story: {
				default:
					"A big stack of {walls} {wallEmoji} sits in the middle. There's a {item} {itemEmoji} in three of the corners. {Hero} needs to walk all the way round and end up back at the start.",
				sports:
					'{Friend} wants four laps of the cones. Well, one lap, four sides. Grab the {items} in the corners and finish where you started.',
				space:
					'{Hero} has to circle a giant {wall} {wallEmoji} and grab the {items} {itemEmoji} in the corners, then park back at the start.'
			},
			task: 'The code walks one side. Make it do all four sides and pick up the {items} in the corners. Put the whole thing inside another loop.',
			concept: {
				title: 'A loop inside a loop',
				body: "Anything can go inside a loop, including another loop. The inner loop walks one side. The outer loop does that four times.\n\n```js\nfor (let side = 0; side < 4; side++) {\n  for (let step = 0; step < 3; step++) {\n    move();\n  }\n  turnRight();\n}\n```\n\nThe counters have different names (`side` and `step`) so they don't get mixed up."
			},
			hints: [
				'One side is: walk to the corner, pick up, turn right. Get that working first.',
				'Wrap it: put `for (let side = 0; side < 4; side++) {` on top and a `}` at the bottom.',
				"Here's one way:\n```js\nfor (let side = 0; side < 4; side++) {\n  for (let step = 0; step < 4; step++) {\n    move();\n  }\n  pickUp();\n  turnRight();\n}\n```"
			],
			world: {
				kind: 'grid',
				width: 5,
				height: 5,
				hero: { x: 0, y: 0, dir: 'E' },
				walls: [
					[1, 1],
					[2, 1],
					[3, 1],
					[1, 2],
					[2, 2],
					[3, 2],
					[1, 3],
					[2, 3],
					[3, 3]
				],
				items: [
					[4, 0],
					[4, 4],
					[0, 4]
				]
			},
			starterCode: `for (let step = 0; step < 4; step++) {
  move();
}
turnRight();
`,
			solution: `for (let side = 0; side < 4; side++) {
  for (let step = 0; step < 4; step++) {
    move();
  }
  pickUp();
  turnRight();
}
`,
			checks: [
				{ type: 'collect-all', message: 'There are still {items} in the corners.' },
				{
					type: 'hero-at',
					x: 0,
					y: 0,
					message: '{Hero} should finish back at the start, top-left.'
				},
				{
					type: 'max-calls',
					command: 'move',
					count: 1,
					message: 'Keep it to one `move();`. Let the loops do the walking.'
				},
				{
					type: 'max-calls',
					command: 'turnRight',
					count: 1,
					message: "One `turnRight();` is enough if it's inside the outer loop."
				}
			]
		},
		{
			id: `${M}/07-fix-off-by-one`,
			slug: '07-fix-off-by-one',
			kind: 'fix',
			title: 'One short',
			xp: 20,
			story: {
				default:
					'This loop is supposed to collect five {items} {itemEmoji}. It collects four and stops one square early. This bug is so common it has a name: an off-by-one error.',
				games:
					'This loop should grab five {items} {itemEmoji}. It grabs four and stops one square early. Even {friend} makes this one. It has a name, too: an off-by-one error.'
			},
			task: 'Fix the loop so it repeats 5 times.',
			hints: [
				'Count it out: the counter `i` starts at 1, then 2, 3, 4… and stops when `i < 5` is no longer true.',
				'1, 2, 3, 4 is four numbers. Either start at 0, or change the 5 to a 6.',
				'Change `let i = 1` to `let i = 0`.'
			],
			world: {
				kind: 'grid',
				width: 8,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				items: [
					[1, 1],
					[2, 1],
					[3, 1],
					[4, 1],
					[5, 1]
				],
				goal: [5, 1]
			},
			starterCode: `for (let i = 1; i < 5; i++) {
  move();
  pickUp();
}
`,
			solution: `for (let i = 0; i < 5; i++) {
  move();
  pickUp();
}
`,
			checks: [
				{
					type: 'collect-all',
					message: 'One {item} is left behind. How many times does the loop really run?'
				},
				{ type: 'reach-goal', message: "{Hero} isn't on the {goal}." }
			]
		},
		{
			id: `${M}/08-boss`,
			slug: '08-boss',
			kind: 'code',
			boss: true,
			title: {
				default: 'The staircase',
				games: 'Up the tower',
				music: 'Climbing the charts',
				nature: 'Up the hill'
			},
			xp: 45,
			story: {
				default:
					'The {goal} {goalEmoji} is at the top of a staircase, with a {item} {itemEmoji} on four of the steps. Look at the shape for a moment. Something repeats.',
				games:
					'The {goal} {goalEmoji} is at the top of the tower. {Villain} left {items} {itemEmoji} on the stairs, which is careless of them.',
				music:
					"The {goal} {goalEmoji} is at the top of a big staircase, and there's a {item} {itemEmoji} on four of the steps. Every step sounds the same. Hmm."
			},
			task: 'Climb to the {goal} and grab every {item}. Use a loop: no more than 2 `move()` calls in your code.',
			hints: [
				'One step of the stairs is: right one, up one. Then face right again.',
				'One step: `move(); turnLeft(); move(); pickUp(); turnRight();` There are 5 steps.',
				"Here's one way:\n```js\nfor (let i = 0; i < 5; i++) {\n  move();\n  turnLeft();\n  move();\n  pickUp();\n  turnRight();\n}\n```"
			],
			world: {
				kind: 'grid',
				width: 6,
				height: 6,
				hero: { x: 0, y: 5, dir: 'E' },
				walls: [
					[0, 4],
					[1, 3],
					[2, 2],
					[3, 1],
					[4, 0]
				],
				items: [
					[1, 4],
					[2, 3],
					[3, 2],
					[4, 1]
				],
				goal: [5, 0]
			},
			starterCode: `// Look at the shape. What repeats?
`,
			solution: `for (let i = 0; i < 5; i++) {
  move();
  turnLeft();
  move();
  pickUp();
  turnRight();
}
`,
			checks: [
				{ type: 'collect-all', message: 'Some {items} are still on the stairs.' },
				{ type: 'reach-goal', message: "{Hero} hasn't reached the {goal} at the top." },
				{
					type: 'max-calls',
					command: 'move',
					count: 2,
					message:
						'You could write out every step, but a loop is the trick here. Use no more than 2 `move();` lines.'
				}
			]
		}
	]
};
