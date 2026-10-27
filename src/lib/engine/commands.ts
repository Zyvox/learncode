/**
 * Reference for the UI cheat sheet: every command per world, and the JavaScript basics.
 * Summaries are ThemedText (render with renderText()) and written for absolute beginners.
 */
import type { ThemedText, WorldKind } from '#lib/curriculum/types.ts';

export interface CommandDoc {
	/** As the learner writes it, e.g. 'move()', 'say(text)' */
	name: string;
	/** One line, plain language */
	summary: ThemedText;
	example?: string;
}

export interface SyntaxDoc {
	id: string;
	name: string;
	summary: ThemedText;
	example: string;
}

export const COMMANDS: Record<WorldKind, CommandDoc[]> = {
	grid: [
		{ name: 'move()', summary: 'Move {hero} one square forward.', example: 'move()' },
		{
			name: 'turnLeft()',
			summary: '{Hero} turns a quarter turn to the left, staying on the same square.',
			example: 'turnLeft()'
		},
		{
			name: 'turnRight()',
			summary: '{Hero} turns a quarter turn to the right, staying on the same square.',
			example: 'turnRight()'
		},
		{
			name: 'pickUp()',
			summary: 'Pick up the {item} {hero} is standing on.',
			example: 'pickUp()'
		},
		{
			name: 'say(text)',
			summary: '{Hero} says something out loud. Put words in quotes.',
			example: 'say("Hello!")'
		},
		{
			name: 'pathAhead()',
			summary:
				'`true` if the square in front of {hero} is free, `false` if a {wall} or the edge is there.',
			example: 'if (pathAhead()) {\n  move()\n}'
		},
		{
			name: 'pathLeft()',
			summary: '`true` if the square to the left of {hero} is free.',
			example: 'if (pathLeft()) {\n  turnLeft()\n}'
		},
		{
			name: 'pathRight()',
			summary: '`true` if the square to the right of {hero} is free.',
			example: 'if (pathRight()) {\n  turnRight()\n}'
		},
		{
			name: 'onItem()',
			summary: '`true` if {hero} is standing on a {item}.',
			example: 'if (onItem()) {\n  pickUp()\n}'
		},
		{
			name: 'atGoal()',
			summary: '`true` once {hero} is on the {goal}.',
			example: 'while (!atGoal()) {\n  move()\n}'
		},
		{
			name: 'itemsLeft()',
			summary: 'How many {items} are still waiting to be picked up.',
			example: 'say(itemsLeft())'
		}
	],
	console: [
		{
			name: 'print(value)',
			summary: 'Show a line in the output: text in quotes, a number, or a variable.',
			example: 'print("Hello")'
		},
		{
			name: 'print(a, b, …)',
			summary: 'Show several things on one line, with a space between each.',
			example: 'print("Score:", score)'
		}
	],
	canvas: [
		{
			name: 'background(color)',
			summary: 'Fill the whole canvas with one colour.',
			example: 'background("skyblue")'
		},
		{
			name: 'color(name)',
			summary:
				'Pick the colour for the shapes you draw next. Any colour name works, like `"red"`, `"gold"` or `"#ff8800"`.',
			example: 'color("tomato")'
		},
		{
			name: 'circle(x, y, size)',
			summary:
				'Draw a circle with its middle at x, y. Size is how far the edge is from the middle.',
			example: 'circle(150, 150, 40)'
		},
		{
			name: 'rect(x, y, width, height)',
			summary: 'Draw a rectangle. x, y is its top-left corner.',
			example: 'rect(50, 50, 100, 80)'
		},
		{
			name: 'line(x1, y1, x2, y2)',
			summary: 'Draw a straight line from x1, y1 to x2, y2.',
			example: 'line(0, 0, 300, 300)'
		},
		{
			name: 'text(x, y, words)',
			summary: 'Write words on the canvas, starting at x, y.',
			example: 'text(20, 40, "Hello")'
		},
		{
			name: 'width, height',
			summary:
				'The size of the canvas (300 by 300 unless the lesson says otherwise). x goes right from 0, y goes down from 0 at the top.',
			example: 'circle(width / 2, height / 2, 50)'
		}
	]
};

/** Bare command names per world (no brackets), e.g. ['move', 'turnLeft', …] */
export function commandNames(kind: WorldKind): string[] {
	return COMMANDS[kind]
		.map((c) => c.name.match(/^([A-Za-z_$][\w$]*)\(/)?.[1])
		.filter((n): n is string => !!n)
		.filter((n, i, all) => all.indexOf(n) === i);
}

export const SYNTAX: SyntaxDoc[] = [
	{
		id: 'comment',
		name: 'Comments',
		summary: 'Anything after `//` is a note for humans. JavaScript skips it.',
		example: '// go around the corner\nmove()'
	},
	{
		id: 'let-variable',
		name: 'Variables',
		summary:
			'`let` makes a box with a name that holds a value. Later you can put a new value in it with `=`.',
		example: 'let score = 0\nscore = score + 1\nprint(score)'
	},
	{
		id: 'text-join',
		name: 'Joining text',
		summary: 'Use `+` to stick pieces of text (and numbers) together.',
		example: 'let name = "Ada"\nprint("Hello, " + name)'
	},
	{
		id: 'compare',
		name: 'Comparing',
		summary:
			'`===` asks "are these the same?", `!==` asks "are they different?". `<`, `>`, `<=`, `>=` compare numbers. The answer is `true` or `false`.',
		example: 'score > 10\nname === "Ada"'
	},
	{
		id: 'and-or-not',
		name: 'And, or, not',
		summary: '`&&` means and, `||` means or, `!` means not.',
		example: 'if (pathAhead() && !onItem()) {\n  move()\n}'
	},
	{
		id: 'if',
		name: 'if',
		summary: 'Run the code inside `{ }` only when the condition in `( )` is true.',
		example: 'if (onItem()) {\n  pickUp()\n}'
	},
	{
		id: 'if-else',
		name: 'if … else',
		summary: "Do one thing when the condition is true, and something else when it isn't.",
		example: 'if (pathAhead()) {\n  move()\n} else {\n  turnLeft()\n}'
	},
	{
		id: 'while-loop',
		name: 'while loop',
		summary:
			'Repeat the code inside `{ }` again and again, as long as the condition is true. Make sure it can become false, or it never stops.',
		example: 'while (!atGoal()) {\n  move()\n}'
	},
	{
		id: 'for-loop',
		name: 'for loop',
		summary:
			'Repeat something a set number of times. `i` counts 0, 1, 2 … and the loop stops when `i < 3` is no longer true.',
		example: 'for (let i = 0; i < 3; i++) {\n  move()\n}'
	},
	{
		id: 'function',
		name: 'Functions',
		summary:
			'Give a few lines a name, then run them whenever you like by writing the name with `()`.',
		example: 'function turnAround() {\n  turnLeft()\n  turnLeft()\n}\n\nturnAround()'
	},
	{
		id: 'function-params',
		name: 'Function inputs',
		summary:
			'A function can take inputs in its `( )`, so it can do slightly different things each time.',
		example:
			'function walk(steps) {\n  for (let i = 0; i < steps; i++) {\n    move()\n  }\n}\n\nwalk(3)'
	},
	{
		id: 'return',
		name: 'return',
		summary: '`return` hands a value back from a function, and ends it right there.',
		example: 'function double(n) {\n  return n * 2\n}\n\nprint(double(4))'
	},
	{
		id: 'array',
		name: 'Lists (arrays)',
		summary:
			'A list of values in `[ ]`. Count from 0: the first item is `list[0]`. `.length` tells you how many.',
		example: 'let pets = ["cat", "dog"]\nprint(pets[0])\nprint(pets.length)'
	}
];
