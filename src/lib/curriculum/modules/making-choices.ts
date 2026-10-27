import type { Module } from '#lib/curriculum/types.ts';

const M = 'making-choices';

/** A 1-tall corridor in row 1 of a 3-row grid: walls above and below. */
function corridorWalls(width: number): [number, number][] {
	const walls: [number, number][] = [];
	for (let x = 0; x < width; x++) {
		walls.push([x, 0], [x, 2]);
	}
	return walls;
}

/** Every square that is not on `path` becomes a wall. */
function wallsExcept(width: number, height: number, path: [number, number][]): [number, number][] {
	const open = new Set(path.map(([x, y]) => `${x},${y}`));
	const walls: [number, number][] = [];
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (!open.has(`${x},${y}`)) walls.push([x, y]);
		}
	}
	return walls;
}

export const makingChoices: Module = {
	id: M,
	order: 3,
	emoji: '🔀',
	title: 'Making choices',
	blurb: 'Programs can look around and decide what to do: if this, do that.',
	lessons: [
		{
			id: `${M}/01-if-item`,
			slug: '01-if-item',
			kind: 'code',
			title: { default: 'Only if', games: 'Loot check', nature: 'Sniff test' },
			xp: 15,
			story: {
				default:
					"A few {items} {itemEmoji} are scattered down the corridor, with gaps in between. {Hero} should only grab when there's actually something there.",
				games:
					"{Villain} dropped some {items} {itemEmoji} here and there. {Hero} could grab at every square, but that just looks silly. Only grab when there's a {item}.",
				nature:
					"Some squares have a {item} {itemEmoji}, some have nothing. {Hero} sniffs each square and only digs when there's something to find."
			},
			task: 'Walk to the {goal} and pick up every {item}. Inside the loop, use `if (onItem())` so {hero} only picks up when standing on one.',
			concept: {
				title: 'If',
				body: '`onItem()` is a question: "am I standing on a {item}?" An `if` runs its lines only when the answer is yes.\n\n```js\nif (onItem()) {\n  pickUp();\n}\n```\n\nIf the answer is no, the computer skips the curly brackets and carries on.'
			},
			newCommands: ['onItem()'],
			hints: [
				'Keep the loop. After each `move();`, {hero} should ask "am I on a {item}?" before grabbing.',
				'Inside the loop, under `move();`, add `if (onItem()) {`, then `pickUp();`, then `}`.',
				'Like this:\n```js\nwhile (pathAhead()) {\n  move();\n  if (onItem()) {\n    pickUp();\n  }\n}\n```'
			],
			world: {
				kind: 'grid',
				width: 8,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				walls: corridorWalls(8),
				items: [
					[2, 1],
					[3, 1],
					[5, 1]
				],
				goal: [7, 1]
			},
			starterCode: `while (pathAhead()) {
  move();
}
`,
			solution: `while (pathAhead()) {
  move();
  if (onItem()) {
    pickUp();
  }
}
`,
			checks: [
				{ type: 'collect-all', message: 'Some {items} are still on the floor.' },
				{ type: 'reach-goal', message: "{Hero} didn't reach the {goal}." },
				{
					type: 'code-includes',
					pattern: 'if\\s*\\(\\s*onItem\\(\\)\\s*\\)',
					message:
						'Grabbing at every square works, but this level is about looking first: `if (onItem()) { pickUp(); }`.'
				},
				{
					type: 'max-calls',
					command: 'pickUp',
					count: 1,
					message: 'One `pickUp();` inside the `if` is enough. The loop repeats it.'
				}
			]
		},
		{
			id: `${M}/02-until-goal`,
			slug: '02-until-goal',
			kind: 'code',
			title: 'Not there yet',
			xp: 20,
			story: {
				default:
					'The {goal} {goalEmoji} is somewhere in the middle again. Last time you counted the steps. But what if you could just ask "am I there yet?"',
				space:
					'The {goal} {goalEmoji} is parked halfway down the valley. {Friend} says counting squares is so last century. Just ask "am I there yet?"',
				food: 'The {goal} {goalEmoji} is halfway along the counter. Counting squares is fine, but chefs taste as they go: "is it ready yet?"'
			},
			task: 'Use `while (!atGoal())` to walk until {hero} is on the {goal}. Pick up the {items} on the way.',
			concept: {
				title: 'Not',
				body: '`atGoal()` asks "am I on the {goal}?" The `!` in front flips the answer: `!atGoal()` means "I am **not** on the {goal}".\n\n```js\nwhile (!atGoal()) {\n  move();\n}\n```\n\nRead it as "while not at the {goal}, move". It stops exactly when {hero} arrives, wherever that is.'
			},
			newCommands: ['atGoal()'],
			hints: [
				'Change the loop question from `pathAhead()` to `!atGoal()`.',
				'Keep the `if (onItem())` part inside the loop. Only the first line changes.',
				'All together:\n```js\nwhile (!atGoal()) {\n  move();\n  if (onItem()) {\n    pickUp();\n  }\n}\n```'
			],
			world: {
				kind: 'grid',
				width: 8,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				walls: corridorWalls(8),
				items: [
					[1, 1],
					[3, 1]
				],
				goal: [5, 1]
			},
			starterCode: `while (pathAhead()) {
  move();
  if (onItem()) {
    pickUp();
  }
}
`,
			solution: `while (!atGoal()) {
  move();
  if (onItem()) {
    pickUp();
  }
}
`,
			checks: [
				{ type: 'collect-all', message: 'There are {items} left behind.' },
				{ type: 'reach-goal', message: '{Hero} has to stop right on the {goal}.' },
				{
					type: 'code-includes',
					pattern: '!\\s*atGoal\\(\\)',
					message:
						'You could count steps again, but try `while (!atGoal())`. Then you never need to count.'
				}
			]
		},
		{
			id: `${M}/03-if-else`,
			slug: '03-if-else',
			kind: 'code',
			title: { default: 'Spiral', games: 'The snail dungeon', music: 'Vinyl groove' },
			xp: 20,
			story: {
				default:
					"The path curls inwards like a snail shell. The code walks the first stretch. You could copy it four times, but there's a smarter way: one loop that decides, every step, what to do.",
				music:
					'The path curls round like the groove on a record. You could copy the code four times, or write one loop that decides, every step, what to do.'
			},
			task: "Write one `while (!atGoal())` loop. Inside: if there's a path ahead, move. Otherwise, turn right.",
			concept: {
				title: 'If… else',
				body: 'An `if` can have a plan B. The `else` part runs when the answer is no.\n\n```js\nif (pathAhead()) {\n  move();\n} else {\n  turnRight();\n}\n```\n\nExactly one of the two happens, never both.'
			},
			hints: [
				'Start with `while (!atGoal()) {` and a closing `}`. Everything else goes inside.',
				'Inside the loop, use the `if (pathAhead()) { … } else { … }` from the box above.',
				'Here it is:\n```js\nwhile (!atGoal()) {\n  if (pathAhead()) {\n    move();\n  } else {\n    turnRight();\n  }\n}\n```'
			],
			world: {
				kind: 'grid',
				width: 5,
				height: 5,
				hero: { x: 0, y: 0, dir: 'E' },
				walls: [
					[0, 1],
					[1, 1],
					[2, 1],
					[3, 1],
					[3, 2],
					[1, 3],
					[2, 3],
					[3, 3]
				],
				goal: [2, 2]
			},
			starterCode: `// This only does the first stretch:
while (pathAhead()) {
  move();
}
turnRight();
`,
			solution: `while (!atGoal()) {
  if (pathAhead()) {
    move();
  } else {
    turnRight();
  }
}
`,
			checks: [
				{ type: 'reach-goal', message: "{Hero} hasn't reached the middle yet." },
				{
					type: 'code-includes',
					pattern: 'else',
					message:
						"Try it with `if … else`: move if you can, otherwise turn right. That's the new trick."
				},
				{
					type: 'max-calls',
					command: 'move',
					count: 1,
					message: 'Use just one `move();`, inside the `if`.'
				},
				{
					type: 'max-calls',
					command: 'turnRight',
					count: 1,
					message: 'Use just one `turnRight();`, inside the `else`.'
				}
			]
		},
		{
			id: `${M}/04-left-or-right`,
			slug: '04-left-or-right',
			kind: 'code',
			title: { default: 'Zigzag', sports: 'Dribbling drill', nature: 'Winding trail' },
			xp: 25,
			story: {
				default:
					'This path turns left and right. Press **Run** to see what your spiral code does here. Spoiler: {hero} gets a bit lost, and needs to look both ways.',
				sports:
					'{Friend} set up a zigzag drill: left, right, left, right. Your spiral code only turns right. Press **Run** and watch {hero} get dizzy.',
				nature:
					'The trail winds left and right through the trees. Your old code only turns right. Press **Run** and watch {hero} go round in circles.'
			},
			task: "If the path ahead is clear, move. Else if there's a path on the left, turn left. Otherwise, turn right.",
			concept: {
				title: 'Else if',
				body: '`pathLeft()` and `pathRight()` ask "is the square on my left (or right) free?" You can chain questions with `else if`. The computer asks them in order and goes with the first yes.\n\n```js\nif (pathAhead()) {\n  move();\n} else if (pathLeft()) {\n  turnLeft();\n} else {\n  turnRight();\n}\n```'
			},
			newCommands: ['pathLeft()', 'pathRight()'],
			hints: [
				'Keep the `while (!atGoal())` loop and the `if (pathAhead())` part. You only need to add a middle option.',
				'Between the `move();` part and the `else`, add `} else if (pathLeft()) {` and `turnLeft();`.',
				'The full loop:\n```js\nwhile (!atGoal()) {\n  if (pathAhead()) {\n    move();\n  } else if (pathLeft()) {\n    turnLeft();\n  } else {\n    turnRight();\n  }\n}\n```'
			],
			world: {
				kind: 'grid',
				width: 6,
				height: 5,
				hero: { x: 0, y: 4, dir: 'E' },
				walls: wallsExcept(6, 5, [
					[0, 4],
					[1, 4],
					[2, 4],
					[2, 3],
					[2, 2],
					[3, 2],
					[4, 2],
					[4, 1],
					[4, 0],
					[5, 0]
				]),
				goal: [5, 0],
				maxSteps: 200
			},
			starterCode: `while (!atGoal()) {
  if (pathAhead()) {
    move();
  } else {
    turnRight();
  }
}
`,
			solution: `while (!atGoal()) {
  if (pathAhead()) {
    move();
  } else if (pathLeft()) {
    turnLeft();
  } else {
    turnRight();
  }
}
`,
			checks: [
				{ type: 'reach-goal', message: "{Hero} didn't find the {goal}." },
				{
					type: 'code-includes',
					pattern: 'pathLeft\\(\\)',
					message: 'Ask `pathLeft()` so {hero} knows when to turn left.'
				}
			]
		},
		{
			id: `${M}/05-items-left`,
			slug: '05-items-left',
			kind: 'code',
			title: { default: 'Know when to stop', games: 'Quiet feet', space: 'Save the battery' },
			xp: 20,
			story: {
				default:
					'Three {items} {itemEmoji} to collect, and no {goal} this time. {Hero} should stop as soon as the last one is picked up. No wandering.',
				games:
					"{Villain} is asleep at the far end of the corridor. Grab the three {items} {itemEmoji} and stop as soon as you have the last one. Don't wake the goblin.",
				space:
					'{Hero} is low on battery. Collect the three {items} {itemEmoji} and stop the moment the last one is in. Every extra square costs power.'
			},
			task: 'Keep going while there are {items} left. `itemsLeft()` tells you how many are still on the floor.',
			concept: {
				title: 'Numbers and comparing',
				body: '`itemsLeft()` doesn\'t answer yes or no. It answers with a number, like 3. You can compare numbers with `>` (more than) and `<` (less than).\n\n```js\nwhile (itemsLeft() > 0) {\n  move();\n}\n```\n\n"While the number of {items} left is more than zero, move."'
			},
			newCommands: ['itemsLeft()'],
			hints: [
				'Right now the loop asks `pathAhead()`, so {hero} walks to the very end. What could it ask instead, so it stops once nothing is left?',
				'Swap `pathAhead()` for `itemsLeft() > 0`. Everything inside the loop stays the same.',
				'Like this:\n```js\nwhile (itemsLeft() > 0) {\n  move();\n  if (onItem()) {\n    pickUp();\n  }\n}\n```'
			],
			world: {
				kind: 'grid',
				width: 8,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				walls: corridorWalls(8),
				items: [
					[2, 1],
					[4, 1],
					[5, 1]
				]
			},
			starterCode: `while (pathAhead()) {
  move();
  if (onItem()) {
    pickUp();
  }
}
`,
			solution: `while (itemsLeft() > 0) {
  move();
  if (onItem()) {
    pickUp();
  }
}
`,
			checks: [
				{ type: 'collect-all', message: 'There are still {items} on the floor.' },
				{
					type: 'hero-at',
					x: 5,
					y: 1,
					message:
						'{Hero} should stop right where the last {item} was. Ask `itemsLeft()` in the loop.'
				},
				{
					type: 'code-includes',
					pattern: 'itemsLeft\\(\\)',
					message: 'Use `itemsLeft()` to know when to stop.'
				}
			]
		},
		{
			id: `${M}/06-predict`,
			slug: '06-predict',
			kind: 'predict',
			title: 'Yes or nope',
			xp: 15,
			story:
				'Every time round the loop, the `if` asks its question again. The answer can be different each time.',
			task: 'Read the code, look at the map, and answer.',
			code: `for (let i = 0; i < 3; i++) {
  move();
  if (onItem()) {
    pickUp();
  } else {
    say("Nope");
  }
}
`,
			world: {
				kind: 'grid',
				width: 5,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				items: [
					[1, 1],
					[3, 1]
				]
			},
			question: 'How many times does {hero} say "Nope"?',
			choices: ['Never', 'Once', 'Twice', 'Three times'],
			answer: 1,
			explanation:
				'Step 1 lands on a {item}: pick it up. Step 2 lands on an empty square: "Nope". Step 3 lands on a {item} again: pick it up. So, one "Nope".',
			hints: [
				'Go step by step: where is {hero} after each `move()`? Is there a {item} there?',
				"There's a {item} one step from the start, and another three steps from the start. The loop runs 3 times."
			]
		},
		{
			id: `${M}/07-fix-not`,
			slug: '07-fix-not',
			kind: 'fix',
			title: 'Nothing happens',
			xp: 20,
			story: {
				default:
					'{Friend} wrote this. Press **Run**. {Hero} just stands there. No error, no movement, nothing. One tiny character is missing.',
				stories:
					'{Friend} wrote this scene, but when you press **Run**, {hero} just stands there. No error, nothing. One tiny character is missing.'
			},
			task: 'Find out why the loop never runs, and fix it.',
			hints: [
				'Read the loop question out loud: "while at the {goal}…". Is {hero} at the {goal} at the start?',
				'No, so the loop is skipped completely. You want "while **not** at the {goal}".',
				'Add a `!` so the first line reads `while (!atGoal()) {`.'
			],
			world: {
				kind: 'grid',
				width: 7,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				walls: corridorWalls(7),
				items: [
					[2, 1],
					[5, 1]
				],
				goal: [6, 1]
			},
			starterCode: `while (atGoal()) {
  move();
  if (onItem()) {
    pickUp();
  }
}
`,
			solution: `while (!atGoal()) {
  move();
  if (onItem()) {
    pickUp();
  }
}
`,
			checks: [
				{ type: 'collect-all', message: 'The {items} are still there.' },
				{ type: 'reach-goal', message: "{Hero} hasn't moved to the {goal}." }
			]
		},
		{
			id: `${M}/08-boss`,
			slug: '08-boss',
			kind: 'code',
			boss: true,
			title: {
				default: 'The maze',
				games: 'The labyrinth',
				nature: 'The hedge maze',
				space: 'Crater canyon'
			},
			xp: 50,
			story: {
				default:
					"A real maze, with dead ends and everything. There's an old trick for mazes: keep your right hand on the wall and never let go. It sounds too simple to work. It works.",
				games:
					'{Villain} built a maze and hid three {items} {itemEmoji} in it. {Friend} whispers an old trick: keep your right hand on the wall and never let go.',
				nature:
					'The forest has turned into a maze of {walls}. {Friend} knows the trick: keep your right paw on the wall and never let go.'
			},
			task: 'Get to the {goal} and pick up all three {items} on the way. Use the right-hand rule in a loop.',
			outro: {
				text: '{Hero} walks out of the maze with all three {items}, and {friend} hands over {reward}. Your code never knew the map. It looked, decided, and kept going, so it would find its way through a maze nobody has drawn yet.'
			},
			hints: [
				'The comments in the editor are your plan. Each numbered line becomes one part of an `if` / `else if` / `else`, and all of it goes inside `while (!atGoal())`.',
				'Start the loop with `if (onItem()) { pickUp(); }` so {hero} grabs {items} on the way. Rule 1 needs two lines inside its `{ }`: `turnRight();` and then `move();`.',
				"Here's one way:\n```js\nwhile (!atGoal()) {\n  if (onItem()) {\n    pickUp();\n  }\n  if (pathRight()) {\n    turnRight();\n    move();\n  } else if (pathAhead()) {\n    move();\n  } else {\n    turnLeft();\n  }\n}\n```"
			],
			world: {
				kind: 'grid',
				width: 7,
				height: 5,
				hero: { x: 0, y: 0, dir: 'E' },
				walls: [
					[3, 0],
					[0, 1],
					[1, 1],
					[3, 1],
					[5, 1],
					[5, 2],
					[1, 3],
					[2, 3],
					[3, 3],
					[5, 3],
					[3, 4],
					[5, 4]
				],
				items: [
					[2, 4],
					[4, 4],
					[6, 2]
				],
				goal: [6, 4]
			},
			starterCode: `// The right-hand rule, every step:
// 1. Path on the right? Turn right and step.
// 2. Otherwise, path ahead? Step.
// 3. Otherwise, turn left.
`,
			solution: `while (!atGoal()) {
  if (onItem()) {
    pickUp();
  }
  if (pathRight()) {
    turnRight();
    move();
  } else if (pathAhead()) {
    move();
  } else {
    turnLeft();
  }
}
`,
			checks: [
				{
					type: 'collect-all',
					message:
						'Some {items} are still hidden in the maze. The right-hand rule visits every dead end.'
				},
				{ type: 'reach-goal', message: "{Hero} didn't find the {goal}." },
				{
					type: 'max-calls',
					command: 'move',
					count: 2,
					message:
						'Writing out the whole route works, but the rule is the clever part. Put it in a loop: you only get to write `move()` twice.'
				}
			]
		}
	]
};
