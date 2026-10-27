import type { ConsoleWorldSpec, Module } from '#lib/curriculum/types.ts';

const M = 'tiny-game';

/** The same game world for every checkpoint: 7 doors, treasure behind 5, a trap behind 3. */
const WORLD: ConsoleWorldSpec = { kind: 'console', variables: { doors: 7, treasure: 5, trap: 3 } };

const DOORS = ['Door 1', 'Door 2', 'Door 3', 'Door 4', 'Door 5', 'Door 6', 'Door 7'];
const BEHIND = [
	'Door 1: empty',
	'Door 2: empty',
	'Door 3: trap',
	'Door 4: empty',
	'Door 5: treasure',
	'Door 6: empty',
	'Door 7: empty'
];

const CP1 = `print("Treasure hunt");
for (let door = 1; door <= doors; door++) {
  print("Door " + door);
}
`;

const CP2 = `print("Treasure hunt");
for (let door = 1; door <= doors; door++) {
  if (door === treasure) {
    print("Door " + door + ": treasure");
  } else if (door === trap) {
    print("Door " + door + ": trap");
  } else {
    print("Door " + door + ": empty");
  }
}
`;

const CP3 = `let score = 0;
print("Treasure hunt");
for (let door = 1; door <= doors; door++) {
  if (door === treasure) {
    print("Door " + door + ": treasure");
    score = score + 10;
  } else if (door === trap) {
    print("Door " + door + ": trap");
    score = score - 5;
  } else {
    print("Door " + door + ": empty");
  }
}
print("Score: " + score);
`;

const CP4_BODY = `let score = 0;

function openDoor(door) {
  if (door === treasure) {
    print("Door " + door + ": treasure");
    score = score + 10;
  } else if (door === trap) {
    print("Door " + door + ": trap");
    score = score - 5;
  } else {
    print("Door " + door + ": empty");
  }
}

print("Treasure hunt");
for (let door = 1; door <= doors; door++) {
  openDoor(DOOR_ARG);
}
print("Score: " + score);
`;

const CP4_BROKEN = CP4_BODY.replace('DOOR_ARG', '');
const CP4 = CP4_BODY.replace('DOOR_ARG', 'door');

const CP5 = `let score = 0;
let empty = 0;

function openDoor(door) {
  if (door === treasure) {
    print("Door " + door + ": treasure");
    score = score + 10;
  } else if (door === trap) {
    print("Door " + door + ": trap");
    score = score - 5;
  } else {
    print("Door " + door + ": empty");
    empty = empty + 1;
  }
}

print("Treasure hunt");
for (let door = 1; door <= doors; door++) {
  openDoor(door);
}
print("Score: " + score);
print("Empty doors: " + empty);
if (score > 0) {
  print("You win");
} else {
  print("Game over");
}
`;

export const tinyGame: Module = {
	id: M,
	order: 7,
	emoji: '🏆',
	title: 'Build a tiny game',
	blurb: 'Put everything together and build a little treasure-hunt game, one checkpoint at a time.',
	lessons: [
		{
			id: `${M}/01-the-doors`,
			slug: '01-the-doors',
			kind: 'code',
			title: 'Seven doors',
			xp: 20,
			story: {
				default:
					"This is the big one. You're going to build a small game: a treasure hunt. Behind one of seven doors is a treasure, and behind another is a trap set by {villain}. Each level adds a piece, and your code carries over to the next one.",
				games:
					"This is the big one: you're making your own game. A treasure hunt with seven doors, a treasure behind one, and a trap behind another, set by {villain}. Each level adds a piece.",
				space:
					"This is the big one: you're making your own game. {Hero} finds seven hatches on an old space station. One hides treasure, one hides a trap set by {villain}. Each level adds a piece.",
				food: "This is the big one: you're making your own game. Seven cupboards in {place}: one hides a treasure, one hides a trap set by {villain}. Each level adds a piece."
			},
			task: 'Three variables already exist: `doors` (7), `treasure` (5) and `trap` (3). After the title, use a loop to print `Door 1` up to `Door 7`. Use `doors` in the loop, not the number 7.',
			concept: {
				title: 'Up to and including',
				body: '`<=` means "less than or equal to". It\'s handy when you want to count up to a number and include it.\n\n```js\nfor (let n = 1; n <= 3; n++) {\n  print("Room " + n);\n}\n// Room 1, Room 2, Room 3\n```'
			},
			hints: [
				'Your counter can have any name. `door` is a good one: `for (let door = 1; door <= doors; door++)`.',
				'Inside the loop: `print("Door " + door);`. Mind the space after Door.',
				'Like this:\n```js\nprint("Treasure hunt");\nfor (let door = 1; door <= doors; door++) {\n  print("Door " + door);\n}\n```'
			],
			world: WORLD,
			starterCode: `print("Treasure hunt");
`,
			solution: CP1,
			checks: [
				{
					type: 'output-equals',
					lines: ['Treasure hunt', ...DOORS]
				},
				{
					type: 'code-includes',
					pattern: '<=?\\s*doors',
					message:
						'Use the `doors` variable in your loop, so the game still works if someone adds more doors.'
				},
				{
					type: 'max-calls',
					command: 'print',
					count: 2,
					message: 'Let the loop print the doors. You can write `print` at most twice.'
				}
			]
		},
		{
			id: `${M}/02-whats-behind`,
			slug: '02-whats-behind',
			kind: 'code',
			title: "What's behind the door?",
			xp: 25,
			story: {
				default: 'A door is only exciting if something might be behind it. Time to open them.',
				games:
					'A door is only exciting if something might be behind it. {Hero} reaches for the first handle…'
			},
			task: "For each door, print `Door 5: treasure` if it's the treasure door, `Door 3: trap` if it's the trap door, and `Door 1: empty` (with the right number) otherwise. Compare with `treasure` and `trap`, not with numbers.",
			concept: {
				title: 'Is it equal?',
				body: 'To ask "are these the same?", use three equals signs: `===`.\n\n```js\nif (door === treasure) {\n  print("Found it");\n}\n```\n\nWhy three? One `=` is already taken: it means "put this in the box". `===` means "is this exactly the same as that?"'
			},
			hints: [
				'Inside the loop, replace the `print` with an `if … else if … else` chain.',
				'The first question is `door === treasure`, the second `door === trap`. Each branch prints `"Door " + door + ": something"`.',
				'The loop could look like this:\n```js\nfor (let door = 1; door <= doors; door++) {\n  if (door === treasure) {\n    print("Door " + door + ": treasure");\n  } else if (door === trap) {\n    print("Door " + door + ": trap");\n  } else {\n    print("Door " + door + ": empty");\n  }\n}\n```'
			],
			world: WORLD,
			starterCode: CP1,
			solution: CP2,
			checks: [
				{
					type: 'output-equals',
					lines: ['Treasure hunt', ...BEHIND]
				},
				{
					type: 'code-includes',
					pattern: '===?\\s*treasure|treasure\\s*===?',
					message: 'Compare the door with the `treasure` variable.'
				},
				{
					type: 'code-excludes',
					pattern: '===?\\s*\\d',
					message:
						'Compare with `treasure` and `trap` rather than numbers. Then the game still works if they move.'
				}
			]
		},
		{
			id: `${M}/03-keeping-score`,
			slug: '03-keeping-score',
			kind: 'code',
			title: 'Keeping score',
			xp: 25,
			story: {
				default: 'A game needs a score. The treasure is worth 10 points. The trap costs 5.',
				games:
					'A game needs a score. The treasure is worth 10 points. The trap costs 5, because {villain} is petty like that.'
			},
			task: 'Make a `score` variable that starts at 0. Add 10 when the treasure is found, take 5 away at the trap. After the loop, print `Score: 5`, built from the variable.',
			hints: [
				'`let score = 0;` goes at the very top, before the loop.',
				'In the treasure branch add `score = score + 10;`, in the trap branch `score = score - 5;`. After the loop: `print("Score: " + score);`.',
				'Full code:\n```js\nlet score = 0;\nprint("Treasure hunt");\nfor (let door = 1; door <= doors; door++) {\n  if (door === treasure) {\n    print("Door " + door + ": treasure");\n    score = score + 10;\n  } else if (door === trap) {\n    print("Door " + door + ": trap");\n    score = score - 5;\n  } else {\n    print("Door " + door + ": empty");\n  }\n}\nprint("Score: " + score);\n```'
			],
			world: WORLD,
			starterCode: CP2,
			solution: CP3,
			checks: [
				{
					type: 'output-equals',
					lines: ['Treasure hunt', ...BEHIND, 'Score: 5']
				},
				{
					type: 'code-includes',
					pattern: 'score\\s*=\\s*score\\s*\\+',
					message: 'Add the 10 to the box: `score = score + 10;`'
				},
				{
					type: 'code-includes',
					pattern: 'score\\s*=\\s*score\\s*-',
					message: 'Take the 5 away from the box: `score = score - 5;`'
				},
				{
					type: 'code-excludes',
					pattern: 'Score: 5',
					message: 'Build the last line from the variable: `"Score: " + score`.'
				}
			]
		},
		{
			id: `${M}/04-fix-open-door`,
			slug: '04-fix-open-door',
			kind: 'fix',
			title: 'Door undefined',
			xp: 25,
			story: {
				default:
					'{Friend} tidied up your game by moving the door-opening code into a function called `openDoor(door)`. Very neat. Except now every door says "undefined". Press **Run**.',
				games:
					'{Friend} tidied your game up with a function called `openDoor(door)`. Very wizardly. Except now every door says "undefined". Press **Run**.'
			},
			task: 'Fix the code so the game works again, still using `openDoor`.',
			hints: [
				'"undefined" is the computer saying "I have no value for this". Which variable has no value?',
				"`openDoor(door)` expects to be told which door. Look at how it's called inside the loop.",
				'Change `openDoor();` to `openDoor(door);`.'
			],
			world: WORLD,
			starterCode: CP4_BROKEN,
			solution: CP4,
			checks: [
				{
					type: 'output-equals',
					lines: ['Treasure hunt', ...BEHIND, 'Score: 5']
				},
				{
					type: 'code-includes',
					pattern: 'function\\s+openDoor',
					message: 'Keep the `openDoor` function. The fix is a small one.'
				}
			]
		},
		{
			id: `${M}/05-boss`,
			slug: '05-boss',
			kind: 'code',
			boss: true,
			title: { default: 'Game over?', games: 'Final level' },
			xp: 50,
			story: {
				default:
					'Last piece: a proper ending. Count the empty doors, and tell the player whether they won. Then you have built a whole game from scratch. Take a second to enjoy that.',
				games:
					'Final level. Count the empty doors, and tell the player if they beat {villain}. Then you have built a whole game from scratch. {Friend} is very proud.'
			},
			task: 'Count the empty doors in a new variable and print `Empty doors: 5` after the score. Then, if the score is more than 0, print `You win`, otherwise `Game over`. The whole console should look like the example.\n\n```\nTreasure hunt\nDoor 1: empty\n…\nDoor 7: empty\nScore: 5\nEmpty doors: 5\nYou win\n```',
			hints: [
				'Make `let empty = 0;` at the top, next to `score`. Add 1 to it in the empty branch of `openDoor`.',
				'At the end: `print("Empty doors: " + empty);` and then `if (score > 0) { … } else { … }`.',
				'The end of the code could be:\n```js\nprint("Score: " + score);\nprint("Empty doors: " + empty);\nif (score > 0) {\n  print("You win");\n} else {\n  print("Game over");\n}\n```\nAnd inside the `else` part of `openDoor`, add `empty = empty + 1;`.'
			],
			world: WORLD,
			starterCode: CP4,
			solution: CP5,
			checks: [
				{
					type: 'output-equals',
					lines: ['Treasure hunt', ...BEHIND, 'Score: 5', 'Empty doors: 5', 'You win']
				},
				{
					type: 'code-excludes',
					pattern: 'Empty doors: \\d',
					message: 'Count the empty doors with a variable instead of typing the number.'
				},
				{
					type: 'code-includes',
					pattern: 'if\\s*\\(\\s*score',
					message: 'Use an `if` on `score` to decide between You win and Game over.'
				},
				{
					type: 'code-includes',
					pattern: 'function\\s+openDoor',
					message: 'Keep using your `openDoor` function.'
				}
			]
		}
	]
};
