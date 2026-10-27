import type { Module } from '#lib/curriculum/types.ts';

const M = 'your-own-commands';

/** A 1-tall corridor in row 1 of a 3-row grid: walls above and below. */
function corridorWalls(width: number): [number, number][] {
	const walls: [number, number][] = [];
	for (let x = 0; x < width; x++) {
		walls.push([x, 0], [x, 2]);
	}
	return walls;
}

export const yourOwnCommands: Module = {
	id: M,
	order: 4,
	emoji: '🧩',
	title: 'Your own commands',
	blurb: 'Give a bunch of steps a name, then use that name like a brand-new command.',
	lessons: [
		{
			id: `${M}/01-turn-around`,
			slug: '01-turn-around',
			kind: 'code',
			title: { default: 'About turn', games: 'Forgot something', food: 'Wait, the tomato' },
			xp: 20,
			story: {
				default:
					"{Hero} walked straight past a {item} {itemEmoji}. It's one square back. There's no `turnAround()` command, so we made one for you. Look at the top of the code.",
				games:
					"{Hero} walked straight past a {item} {itemEmoji}. It's one square back. There's no `turnAround()` command, so {friend} made one. Look at the top of the code.",
				food: "{Hero} walked straight past the {item} {itemEmoji}. Every chef has done it. There's no `turnAround()` command, so we made one. Look at the top of the code."
			},
			task: 'Use `turnAround()` to go back for the {item}, then turn around again and walk to the {goal}.',
			concept: {
				title: 'Making your own command',
				body: 'You can give a few lines a name with `function`. After that, the name works just like `move()`.\n\n```js\nfunction turnAround() {\n  turnLeft();\n  turnLeft();\n}\n\nturnAround();\n```\n\nThe top part only **teaches** the computer the new word. Nothing moves until you actually use it: `turnAround();`. A named block like this is called a **function**.'
			},
			hints: [
				'The {item} is one square behind {hero}. Fetch it before the `while` loop, then let the loop do the long walk.',
				'Above the loop: `turnAround();`, `move();`, `pickUp();`, then `turnAround();` again so {hero} faces the {goal}.',
				'After the function, write:\n```js\nturnAround();\nmove();\npickUp();\nturnAround();\nwhile (pathAhead()) {\n  move();\n}\n```'
			],
			world: {
				kind: 'grid',
				width: 7,
				height: 3,
				hero: { x: 1, y: 1, dir: 'E' },
				walls: corridorWalls(7),
				items: [[0, 1]],
				goal: [6, 1]
			},
			starterCode: `function turnAround() {
  turnLeft();
  turnLeft();
}

while (pathAhead()) {
  move();
}
`,
			solution: `function turnAround() {
  turnLeft();
  turnLeft();
}

turnAround();
move();
pickUp();
turnAround();
while (pathAhead()) {
  move();
}
`,
			checks: [
				{ type: 'collect-all', message: 'The {item} behind {hero} is still there.' },
				{ type: 'reach-goal', message: "{Hero} hasn't reached the {goal}." },
				{
					type: 'max-calls',
					command: 'turnLeft',
					count: 2,
					message:
						"You can spin with lots of `turnLeft();` lines, but you've got `turnAround();` now. Use that instead."
				}
			]
		},
		{
			id: `${M}/02-hop`,
			slug: '02-hop',
			kind: 'code',
			title: { default: 'Hop', sports: 'Hurdles', nature: 'Log jumping', music: 'Skip a beat' },
			xp: 20,
			story: {
				default:
					'Two {walls} {wallEmoji} block the path, each with a {item} {itemEmoji} on top. Getting over one takes a lot of steps. Getting over two takes the same steps again. Sounds like a job for a function.',
				sports:
					'Hurdles. Two {walls} {wallEmoji} on the track, a {item} {itemEmoji} above each. Every jump is exactly the same, so teach {hero} one jump and use it twice.',
				nature:
					'Two fallen {walls} {wallEmoji} across the trail, a {item} {itemEmoji} above each. Teach {hero} one hop, then hop twice.'
			},
			task: 'Finish the `hop()` function so {hero} goes up, over (grabbing the {item}), and back down. Then use it twice.',
			hints: [
				'From the start of the hop: up one, right two (grab the {item} after the first), down one, then face right again.',
				'Inside `hop()`: `turnLeft(); move(); turnRight(); move(); pickUp(); move(); turnRight(); move(); turnLeft();`',
				'The bottom part of the code should be:\n```js\nmove();\nhop();\nmove();\nhop();\nmove();\n```'
			],
			world: {
				kind: 'grid',
				width: 8,
				height: 3,
				hero: { x: 0, y: 2, dir: 'E' },
				walls: [
					[2, 2],
					[5, 2]
				],
				items: [
					[2, 1],
					[5, 1]
				],
				goal: [7, 2]
			},
			starterCode: `function hop() {
  turnLeft();
  move();
  // finish the jump: over the top and back down
}

move();
hop();
`,
			solution: `function hop() {
  turnLeft();
  move();
  turnRight();
  move();
  pickUp();
  move();
  turnRight();
  move();
  turnLeft();
}

move();
hop();
move();
hop();
move();
`,
			checks: [
				{ type: 'collect-all', message: "There's still a {item} up there." },
				{ type: 'reach-goal', message: "{Hero} hasn't reached the {goal}." },
				{
					type: 'max-calls',
					command: 'turnLeft',
					count: 2,
					message:
						'It looks like you wrote the jump out twice. Put it in `hop()` once, then write `hop();` twice.'
				}
			]
		},
		{
			id: `${M}/03-pockets`,
			slug: '03-pockets',
			kind: 'code',
			title: { default: 'Pockets', games: 'Three alcoves', food: 'The pantry' },
			xp: 25,
			story: {
				default:
					'Three little pockets, each with a {item} {itemEmoji} at the bottom. Visiting one is always the same dance: in, grab, turn around, out. Functions can use other functions, so `visitPocket()` can use `turnAround()`.',
				food: 'The pantry has three narrow pockets between the shelves, each with a {item} {itemEmoji} at the back. Fetching one is always the same: in, grab, turn around, out.',
				games:
					'Three little pockets in the dungeon wall, each with a {item} {itemEmoji} at the bottom. Visiting one is always the same dance: in, grab, turn around, out.'
			},
			task: 'Finish `visitPocket()` so {hero} comes back out facing right. Then visit all three pockets and finish on the {goal}.',
			hints: [
				'After `pickUp();`: `turnAround();`, walk back up with a `while (pathAhead())` loop, then `turnRight();` to face right again.',
				'The pockets are 2 squares apart. Between visits: `move(); move();`.',
				'Bottom part:\n```js\nmove();\nvisitPocket();\nmove();\nmove();\nvisitPocket();\nmove();\nmove();\nvisitPocket();\nmove();\n```'
			],
			world: {
				kind: 'grid',
				width: 7,
				height: 3,
				hero: { x: 0, y: 0, dir: 'E' },
				walls: [
					[0, 1],
					[2, 1],
					[4, 1],
					[6, 1],
					[0, 2],
					[2, 2],
					[4, 2],
					[6, 2]
				],
				items: [
					[1, 2],
					[3, 2],
					[5, 2]
				],
				goal: [6, 0]
			},
			starterCode: `function turnAround() {
  turnLeft();
  turnLeft();
}

function visitPocket() {
  turnRight();
  while (pathAhead()) {
    move();
  }
  pickUp();
  // come back out, using turnAround()
}

move();
visitPocket();
`,
			solution: `function turnAround() {
  turnLeft();
  turnLeft();
}

function visitPocket() {
  turnRight();
  while (pathAhead()) {
    move();
  }
  pickUp();
  turnAround();
  while (pathAhead()) {
    move();
  }
  turnRight();
}

move();
visitPocket();
move();
move();
visitPocket();
move();
move();
visitPocket();
move();
`,
			checks: [
				{ type: 'collect-all', message: 'Some pockets still have a {item} in them.' },
				{ type: 'reach-goal', message: "{Hero} hasn't reached the {goal}." },
				{
					type: 'max-calls',
					command: 'pickUp',
					count: 1,
					message:
						'Keep `pickUp();` in one place, inside `visitPocket()`, and use `visitPocket();` three times.'
				},
				{
					type: 'max-calls',
					command: 'turnLeft',
					count: 2,
					message: 'Use `turnAround();` instead of writing more turns.'
				}
			]
		},
		{
			id: `${M}/04-predict`,
			slug: '04-predict',
			kind: 'predict',
			title: 'When does it run?',
			xp: 15,
			story:
				"Here's a question that trips up a lot of people. A function sits at the top of the code. Does it run right away?",
			task: 'Read the code and answer.',
			code: `function wiggle() {
  turnLeft();
  turnRight();
}

move();
wiggle();
wiggle();
move();
`,
			world: {
				kind: 'grid',
				width: 4,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' }
			},
			question: 'When do the lines inside `wiggle()` run?',
			choices: [
				'Right away, because they are at the top',
				'Only once, the first time',
				'Each time `wiggle();` is used, so twice',
				'Never, functions are just notes'
			],
			answer: 2,
			explanation:
				'`function wiggle() { … }` only teaches the computer what "wiggle" means. The lines inside run each time you write `wiggle();`. Here that\'s twice, between the two moves.',
			hints: [
				'Think back to `turnAround()`. Did {hero} spin before you wrote `turnAround();` underneath?',
				'Count how many times `wiggle();` appears below the function.'
			]
		},
		{
			id: `${M}/05-fix-name`,
			slug: '05-fix-name',
			kind: 'fix',
			title: 'Name tag',
			xp: 20,
			story: {
				default:
					'{Friend} made a `climb()` command for the stairs, but the code crashes. Computers are picky about names: capital letters count.',
				music:
					'{Friend} wrote a `climb()` command for the stairs, but it crashes. Computers are picky about names, right down to capital letters.'
			},
			task: 'Press **Run**, read the error, and fix it.',
			hints: [
				"Look at how the function is named at the top, and how it's used in the loop. Spot the difference?",
				'`climb` and `Climb` are two different words to a computer.',
				'Change `Climb();` to `climb();`.'
			],
			world: {
				kind: 'grid',
				width: 5,
				height: 5,
				hero: { x: 0, y: 4, dir: 'E' },
				walls: [
					[0, 3],
					[1, 2],
					[2, 1],
					[3, 0]
				],
				items: [
					[1, 3],
					[2, 2],
					[3, 1]
				],
				goal: [4, 0]
			},
			starterCode: `function climb() {
  move();
  turnLeft();
  move();
  pickUp();
  turnRight();
}

for (let i = 0; i < 4; i++) {
  Climb();
}
`,
			solution: `function climb() {
  move();
  turnLeft();
  move();
  pickUp();
  turnRight();
}

for (let i = 0; i < 4; i++) {
  climb();
}
`,
			checks: [
				{ type: 'collect-all', message: 'There are still {items} on the stairs.' },
				{ type: 'reach-goal', message: "{Hero} hasn't reached the top." }
			]
		},
		{
			id: `${M}/06-boss`,
			slug: '06-boss',
			kind: 'code',
			boss: true,
			title: {
				default: 'Spring cleaning',
				games: 'Three floors',
				space: 'Survey sweep',
				food: 'Closing time'
			},
			xp: 50,
			story: {
				default:
					'Three long rows, {items} {itemEmoji} scattered along each, and a narrow passage on the left linking them. Sweep every row and finish on the {goal} {goalEmoji}.',
				games:
					'{Villain} hid {items} {itemEmoji} on three floors of {place}, linked by a narrow passage on the left. Sweep every floor and finish at the {goal}.',
				space:
					'{Friend} wants a full survey: three long rows of {items} {itemEmoji}, linked by a passage on the left. Sweep every row and park at the {goal}.',
				food: 'Closing time. Three long counters with {items} {itemEmoji} left on them, linked by a passage on the left. Clear them all and finish at the {goal}.'
			},
			task: 'Collect every {item} and finish on the {goal}. Make your own commands for the parts that repeat: you may only write `move()` four times in total.',
			outro: {
				text: 'Every row is swept and {hero} is on the {goal}. {Friend} wants to borrow `sweepRow()` for tomorrow, and hands over {reward} in exchange.'
			},
			hints: [
				'Write `sweepRow()`: walk to the end picking up as you go, turn around, walk back. Then `goDown()`: turn to face down, two steps, turn to face right.',
				'When {hero} gets back to the left end of a row, {hero} is facing left. One `turnLeft()` faces down. After two moves, another `turnLeft()` faces right again.',
				"Here's one way:\n```js\nfunction sweepRow() {\n  while (pathAhead()) {\n    move();\n    if (onItem()) {\n      pickUp();\n    }\n  }\n  turnAround();\n  while (pathAhead()) {\n    move();\n  }\n}\n\nfunction goDown() {\n  turnLeft();\n  move();\n  move();\n  turnLeft();\n}\n\nsweepRow();\ngoDown();\nsweepRow();\ngoDown();\nsweepRow();\n```"
			],
			world: {
				kind: 'grid',
				width: 7,
				height: 5,
				hero: { x: 0, y: 0, dir: 'E' },
				walls: [
					[1, 1],
					[2, 1],
					[3, 1],
					[4, 1],
					[5, 1],
					[6, 1],
					[1, 3],
					[2, 3],
					[3, 3],
					[4, 3],
					[5, 3],
					[6, 3]
				],
				items: [
					[3, 0],
					[6, 0],
					[2, 2],
					[5, 2],
					[4, 4],
					[6, 4]
				],
				goal: [0, 4]
			},
			starterCode: `function turnAround() {
  turnLeft();
  turnLeft();
}

// Tip: make one function for a row (there and back),
// and another for getting down to the next row.
`,
			solution: `function turnAround() {
  turnLeft();
  turnLeft();
}

function sweepRow() {
  while (pathAhead()) {
    move();
    if (onItem()) {
      pickUp();
    }
  }
  turnAround();
  while (pathAhead()) {
    move();
  }
}

function goDown() {
  turnLeft();
  move();
  move();
  turnLeft();
}

sweepRow();
goDown();
sweepRow();
goDown();
sweepRow();
`,
			checks: [
				{ type: 'collect-all', message: 'There are still {items} on one of the rows.' },
				{ type: 'reach-goal', message: '{Hero} should finish on the {goal}, bottom-left.' },
				{
					type: 'max-calls',
					command: 'move',
					count: 4,
					message:
						'Spelling out every row works, but it is a lot of typing. Put one row in a function and use it three times. You only get to write `move()` four times.'
				}
			]
		}
	]
};
