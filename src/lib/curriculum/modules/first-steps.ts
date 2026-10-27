import type { Module } from '#lib/curriculum/types.ts';

const M = 'first-steps';

export const firstSteps: Module = {
	id: M,
	order: 1,
	emoji: '👣',
	title: 'First steps',
	blurb: 'A program is a list of steps, done one after another, top to bottom.',
	lessons: [
		{
			id: `${M}/01-first-step`,
			slug: '01-first-step',
			kind: 'code',
			title: 'One small step',
			xp: 10,
			story: {
				default:
					'Meet {hero} {heroEmoji}. {Hero} does exactly what you write. Nothing more, nothing less. The {goal} {goalEmoji} is just two squares away.',
				games:
					'Meet {hero} {heroEmoji}, a very small adventurer in a very big dungeon. {Hero} does exactly what you write, nothing more. The {goal} is two squares away.',
				space:
					"Meet {hero} {heroEmoji}, a rover who just landed. {Hero} only moves when you send a command. The {goal} {goalEmoji} is two squares away, and it's leaving soon.",
				food: 'Meet {hero} {heroEmoji}. Dinner service starts in a minute and the {goal} {goalEmoji} is two squares away. {Hero} needs you to say when to walk.'
			},
			task: "There's already one `move()` in the editor. Add a second one on the next line, then press **Run**.",
			concept: {
				title: 'Your first command',
				body: 'A command is a word with brackets after it. `move()` means "take one step forward". The semicolon at the end is like a full stop.\n\n```js\nmove();\nmove();\n```\n\nTwo lines, two steps. The computer reads them top to bottom.'
			},
			newCommands: ['move()'],
			hints: [
				'Press **Run** first and watch: {hero} takes one step and stops. One more to go.',
				'Click at the end of the `move();` line, press Enter, and type `move();` again.',
				'Your code should be exactly two lines:\n```js\nmove();\nmove();\n```'
			],
			world: {
				kind: 'grid',
				width: 5,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				goal: [2, 1]
			},
			starterCode: `move();
`,
			solution: `move();
move();
`,
			checks: [{ type: 'reach-goal', message: "{Hero} isn't on the {goal} yet. One more step?" }]
		},
		{
			id: `${M}/02-turning`,
			slug: '02-turning',
			kind: 'code',
			title: 'Which way is up?',
			xp: 10,
			story: {
				default:
					"The {goal} {goalEmoji} isn't straight ahead this time. {Hero} can only walk forward, but turning is allowed.",
				music:
					'The {goal} {goalEmoji} is round the corner. {Hero} can only walk forward, but {hero} can spin like a pro.',
				nature:
					'The {goal} {goalEmoji} is up the hill. {Hero} can only trot forward, but foxes are great at turning.'
			},
			task: 'Walk two squares right, turn left, then walk two squares up to the {goal}.',
			concept: {
				title: 'Turning',
				body: "`turnLeft()` and `turnRight()` spin {hero} on the spot, a quarter turn. {Hero} doesn't move, just faces a new way. Then `move()` goes forward in the new direction.\n\n```js\nmove();\nturnLeft();\nmove();\n```\n\nTip: imagine you are {hero}. If you face right and turn left, you now face up."
			},
			newCommands: ['turnLeft()', 'turnRight()'],
			hints: [
				'Look at which way {hero} is facing (the little arrow). Left of "facing right" is "up".',
				'After the two `move();` lines, add `turnLeft();`, then two more `move();` lines.',
				'All of it:\n```js\nmove();\nmove();\nturnLeft();\nmove();\nmove();\n```'
			],
			world: {
				kind: 'grid',
				width: 5,
				height: 4,
				hero: { x: 0, y: 3, dir: 'E' },
				goal: [2, 1]
			},
			starterCode: `move();
move();
`,
			solution: `move();
move();
turnLeft();
move();
move();
`,
			checks: [
				{
					type: 'reach-goal',
					message: '{Hero} ended up somewhere else. Did the turn happen at the right moment?'
				}
			]
		},
		{
			id: `${M}/03-around-the-wall`,
			slug: '03-around-the-wall',
			kind: 'code',
			title: {
				default: 'Something in the way',
				games: 'Crate expectations',
				space: 'Rocky road'
			},
			xp: 15,
			story: {
				default:
					"Bad news: there's a {wall} {wallEmoji} right in front of {hero}. Walking into a {wall} ends the run, so {hero} has to go around.",
				games:
					'Somebody left a {wall} {wallEmoji} in the corridor. Probably {villain}. Walking into it ends the run, so {hero} has to go around.',
				sports:
					'{Villain} put a {wall} {wallEmoji} right in front of {hero}. Run into it and the drill is over, so {hero} has to go around.'
			},
			task: 'Press **Run** to see what happens now. Then change the code so {hero} goes down, along, and back up to the {goal}.',
			hints: [
				'Trace a route with your finger on the screen before you type anything. Which squares are free?',
				'The route is down one, right two, up one. Start with `turnRight();` so {hero} faces down.',
				'One route that works:\n```js\nturnRight();\nmove();\nturnLeft();\nmove();\nmove();\nturnLeft();\nmove();\n```'
			],
			world: {
				kind: 'grid',
				width: 4,
				height: 3,
				hero: { x: 0, y: 0, dir: 'E' },
				walls: [
					[1, 0],
					[1, 2]
				],
				goal: [2, 0]
			},
			starterCode: `move();
`,
			solution: `turnRight();
move();
turnLeft();
move();
move();
turnLeft();
move();
`,
			checks: [{ type: 'reach-goal', message: "{Hero} hasn't reached the {goal} yet." }]
		},
		{
			id: `${M}/04-pick-up`,
			slug: '04-pick-up',
			kind: 'code',
			title: { default: 'Grab it', games: 'Shiny', food: 'Mise en place' },
			xp: 15,
			story: {
				default:
					"There's a {item} {itemEmoji} on the way to the {goal}. Right now {hero} walks straight past it. Standing on a {item} isn't the same as picking it up.",
				games:
					'A {item} {itemEmoji}. On the floor. Just lying there. Right now {hero} walks straight past it, which feels like a waste.',
				food: "The recipe needs one {item} {itemEmoji}, and it's right on the way to the {goal}. Right now {hero} walks straight past it."
			},
			task: 'Add `pickUp();` at the moment {hero} is standing on the {item}.',
			concept: {
				title: 'Picking things up',
				body: '`pickUp()` grabs whatever {hero} is standing on. It only works when {hero} is on top of a {item}, so the timing matters.\n\n```js\nmove();\npickUp();\n```'
			},
			newCommands: ['pickUp()'],
			hints: [
				'Count the steps: after how many `move();` lines is {hero} standing on the {item}?',
				'The {item} is two steps away. Put `pickUp();` right after the second `move();`.',
				'Like this:\n```js\nmove();\nmove();\npickUp();\nmove();\nmove();\n```'
			],
			world: {
				kind: 'grid',
				width: 5,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				items: [[2, 1]],
				goal: [4, 1]
			},
			starterCode: `move();
move();
move();
move();
`,
			solution: `move();
move();
pickUp();
move();
move();
`,
			checks: [
				{
					type: 'collect-all',
					message: 'The {item} is still on the floor. When is {hero} standing on it?'
				},
				{ type: 'reach-goal', message: "{Hero} hasn't reached the {goal} yet." }
			]
		},
		{
			id: `${M}/05-fix-typo`,
			slug: '05-fix-typo',
			kind: 'fix',
			title: 'Oops, a typo',
			xp: 15,
			story: {
				default:
					'{Friend} wrote this route for {hero}, but it stops with an error. Computers are fussy: one letter in the wrong place and they have no idea what you mean.',
				games:
					'{Friend} wrote this route for {hero}. Wizards are great at spells, terrible at spelling. It stops with an error.',
				stories:
					'{Friend} scribbled this route in a hurry, and now it stops with an error. One letter is in the wrong place.'
			},
			task: 'Press **Run**, read the error, and fix the line it points to.',
			hints: [
				'The error message tells you which line is the problem. Look at that line very closely, letter by letter.',
				'Line 2 says `mvoe();`. The computer only knows `move();`.'
			],
			world: {
				kind: 'grid',
				width: 5,
				height: 3,
				hero: { x: 0, y: 0, dir: 'E' },
				items: [[2, 0]],
				goal: [2, 2]
			},
			starterCode: `move();
mvoe();
pickUp();
turnRight();
move();
move();
`,
			solution: `move();
move();
pickUp();
turnRight();
move();
move();
`,
			checks: [
				{
					type: 'collect-all',
					message: 'The {item} is still there. Is every command spelled right?'
				},
				{ type: 'reach-goal', message: "{Hero} didn't make it to the {goal}." }
			]
		},
		{
			id: `${M}/06-predict`,
			slug: '06-predict',
			kind: 'predict',
			title: 'Be the computer',
			xp: 15,
			story:
				"Swap seats: this time you're the computer. Read the code and play it out in your head, one line at a time.",
			task: 'Read the code. Where will {hero} end up?',
			code: `move();
turnRight();
move();
move();
`,
			world: {
				kind: 'grid',
				width: 4,
				height: 4,
				hero: { x: 0, y: 0, dir: 'E' }
			},
			question: '{Hero} starts in the top-left corner, facing right. Where does {hero} end up?',
			choices: [
				'Two squares right, one square down',
				'One square right, two squares down',
				'One square right, two squares up',
				'Three squares right'
			],
			answer: 1,
			explanation:
				'First `move()` goes one square right. Then `turnRight()`: if you face right and turn right, you face down. So the last two moves go down. One right, two down.',
			hints: [
				'Go line by line. Use your finger on the grid if it helps.',
				'Facing right, a right turn makes you face down.'
			]
		},
		{
			id: `${M}/07-say`,
			slug: '07-say',
			kind: 'code',
			title: 'Say something',
			xp: 15,
			story: {
				default:
					'{Friend} is waiting at the {goal} {goalEmoji}. It would be rude to walk up and say nothing.',
				games: '{Friend} is waiting by the {goal} {goalEmoji}. Wizards appreciate good manners.',
				space:
					'{Friend} is listening on the radio at the {goal} {goalEmoji}. Time for {hero} to check in.',
				nature: '{Friend} is perched by the {goal} {goalEmoji}. Owls like to be greeted properly.'
			},
			task: 'Walk to the {goal}, then add `say("Hello");` as the last line.',
			concept: {
				title: 'Words in quotes',
				body: '`say()` makes {hero} talk. The words go inside quotes, so the computer knows "this is just text, not a command".\n\n```js\nsay("Hello");\n```\n\nWithout quotes, the computer would go looking for a command called Hello and get confused.'
			},
			newCommands: ['say(text)'],
			hints: [
				'The walking part is already done. You only need to add one line at the end.',
				'Type it with the quotes and the brackets: `say("Hello");`',
				'Full code:\n```js\nmove();\nmove();\nmove();\nsay("Hello");\n```'
			],
			world: {
				kind: 'grid',
				width: 5,
				height: 3,
				hero: { x: 0, y: 1, dir: 'E' },
				goal: [3, 1]
			},
			starterCode: `move();
move();
move();
`,
			solution: `move();
move();
move();
say("Hello");
`,
			checks: [
				{ type: 'reach-goal', message: "{Hero} isn't at the {goal} yet." },
				{
					type: 'said',
					text: 'Hello',
					message: '{Hero} hasn\'t said "Hello" yet. Add `say("Hello");` at the end.'
				}
			]
		},
		{
			id: `${M}/08-boss`,
			slug: '08-boss',
			kind: 'code',
			boss: true,
			title: {
				default: 'The long way round',
				games: "The goblin's hallway",
				sports: 'The obstacle course'
			},
			xp: 40,
			story: {
				default:
					'{Villain} has scattered three {items} {itemEmoji} along a twisty path. Get them all and reach the {goal} {goalEmoji}. You know every command you need.',
				games:
					'{Villain} dropped three {items} {itemEmoji} while running through this twisty hallway. Finders keepers. Grab them all and reach the {goal}.',
				sports:
					'{Friend} set up an obstacle course. Collect the three {items} {itemEmoji} on the way and finish at the {goal}.',
				space:
					'Three {items} {itemEmoji} are hidden along a twisty canyon. {Friend} wants all of them back at the {goal}.'
			},
			task: 'Collect all three {items} and finish on the {goal}.',
			hints: [
				'Do it in small pieces. Write a few lines, press Run, see where {hero} ends up, then add more.',
				'Route: right two (grab), down two, right two (grab), right one, down one (grab), down one.',
				"Here's one way:\n```js\nmove();\nmove();\npickUp();\nturnRight();\nmove();\nmove();\nturnLeft();\nmove();\nmove();\npickUp();\nmove();\nturnRight();\nmove();\npickUp();\nmove();\n```"
			],
			world: {
				kind: 'grid',
				width: 6,
				height: 5,
				hero: { x: 0, y: 0, dir: 'E' },
				walls: [
					[3, 0],
					[0, 1],
					[1, 1],
					[3, 1],
					[5, 1],
					[1, 3],
					[2, 3],
					[3, 3],
					[4, 3]
				],
				items: [
					[2, 0],
					[4, 2],
					[5, 3]
				],
				goal: [5, 4]
			},
			starterCode: `// Take it one step at a time.
move();
`,
			solution: `move();
move();
pickUp();
turnRight();
move();
move();
turnLeft();
move();
move();
pickUp();
move();
turnRight();
move();
pickUp();
move();
`,
			checks: [
				{
					type: 'collect-all',
					message:
						'There are still {items} on the path. Look at the map: which one did {hero} miss?'
				},
				{ type: 'reach-goal', message: "{Hero} hasn't reached the {goal} yet." }
			]
		}
	]
};
