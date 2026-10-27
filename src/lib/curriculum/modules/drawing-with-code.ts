import type { Module } from '#lib/curriculum/types.ts';

const M = 'drawing-with-code';

export const drawingWithCode: Module = {
	id: M,
	order: 6,
	emoji: '🎨',
	title: 'Drawing with code',
	blurb: 'Shapes, colours and loops that paint patterns for you.',
	lessons: [
		{
			id: `${M}/01-circle`,
			slug: '01-circle',
			kind: 'code',
			title: { default: 'A blank canvas', space: 'A new planet', nature: 'Sunrise' },
			xp: 10,
			story: {
				default:
					'New world: a blank canvas, 300 dots wide and 300 tall. Same idea as the grid: x goes right, y goes down, and (0, 0) is the top-left corner.',
				space:
					"{Friend} needs a picture of the planet {hero} just found. Here's a blank canvas, 300 wide and 300 tall. x goes right, y goes down, (0, 0) is the top-left.",
				nature:
					"The sun is coming up over {place}. Here's a blank canvas, 300 wide and 300 tall. x goes right, y goes down, (0, 0) is the top-left."
			},
			task: 'Draw a circle in the middle of the canvas with `circle(150, 150, 60)`.',
			concept: {
				title: 'Drawing a circle',
				body: '`circle(x, y, size)` draws a circle. `x` and `y` say where the middle is, `size` says how big (the distance from the middle to the edge).\n\n```js\ncircle(150, 150, 60);\n```\n\nThe middle of a 300 by 300 canvas is at 150, 150.'
			},
			newCommands: ['circle(x, y, size)'],
			hints: [
				'Three numbers, separated by commas, inside the brackets.',
				'Type exactly: `circle(150, 150, 60);`'
			],
			world: { kind: 'canvas' },
			starterCode: `// Draw your circle below.
`,
			solution: `circle(150, 150, 60);
`,
			checks: [
				{ type: 'draw-count', shape: 'circle', min: 1, message: 'No circle on the canvas yet.' }
			]
		},
		{
			id: `${M}/02-fix-colour`,
			slug: '02-fix-colour',
			kind: 'fix',
			title: { default: 'Colour or color?', space: 'Night sky', games: 'Moonlit dungeon' },
			xp: 15,
			story: {
				default:
					'{Friend} painted a night sky with a moon and a little star, but the code crashes halfway. Press **Run** and read the error. (Hint: programmers spell it the American way.)',
				space:
					'{Friend} sent a picture of the sky over {place}, but the code crashes halfway. Press **Run** and read the error. (Programmers spell it the American way.)'
			},
			task: 'Fix the error so you get a dark background, a gold moon and a white star.',
			concept: {
				title: 'Colours',
				body: '`background()` paints the whole canvas. `color()` picks the paint for the shapes that come **after** it.\n\n```js\nbackground("midnightblue");\ncolor("gold");\ncircle(150, 150, 60);\n```\n\nYou can use colour names like "tomato", "skyblue", "gold", "seagreen", "hotpink", or codes like "#ff8800".'
			},
			newCommands: ['background(color)', 'color(name)'],
			hints: [
				'The error points at line 4. Compare it with line 2.',
				'`colour` is the British spelling. The command is `color`.',
				'Change line 4 to `color("white");`.'
			],
			world: { kind: 'canvas' },
			starterCode: `background("midnightblue");
color("gold");
circle(150, 150, 60);
colour("white");
circle(240, 70, 10);
`,
			solution: `background("midnightblue");
color("gold");
circle(150, 150, 60);
color("white");
circle(240, 70, 10);
`,
			checks: [
				{ type: 'draw-background', message: 'The background is missing.' },
				{
					type: 'draw-count',
					shape: 'circle',
					min: 2,
					message: 'There should be two circles: the moon and the star.'
				},
				{
					type: 'draw-colors',
					min: 2,
					message: 'The moon and the star should be different colours.'
				}
			]
		},
		{
			id: `${M}/03-house`,
			slug: '03-house',
			kind: 'code',
			title: {
				default: 'Home sweet home',
				games: "The wizard's cottage",
				food: 'The bakery',
				nature: 'Cabin in the woods'
			},
			xp: 20,
			story: {
				default:
					"Circles are nice, but you can't build a house out of them. Meet two more shapes: rectangles and lines.",
				games:
					'{Friend} wants a cottage. The walls are done. It still needs a roof and a door, or the rain gets in and the goblins walk in.',
				food: '{Friend} is opening a bakery. The walls are up. It needs a roof and a door before the first croissant.'
			},
			task: 'The walls are there. Add a roof with two `line()`s and a door with another `rect()`.',
			concept: {
				title: 'Rectangles and lines',
				body: '`rect(x, y, width, height)` draws a rectangle. `x, y` is its **top-left** corner.\n\n`line(x1, y1, x2, y2)` draws a straight line from one point to another.\n\n```js\nrect(80, 150, 140, 110);\nline(80, 150, 150, 80);\n```\n\nThat second line goes from the top-left of the walls up to a point in the middle. Like a roof, if you add the other side.'
			},
			newCommands: ['rect(x, y, width, height)', 'line(x1, y1, x2, y2)'],
			hints: [
				'The walls start at (80, 150) and are 140 wide, so the top-right corner is at (220, 150). The roof peak could be at (150, 80).',
				'Roof: `line(80, 150, 150, 80);` and `line(150, 80, 220, 150);`. Door: a small `rect` near the bottom middle, after a new `color`.',
				'Add:\n```js\nline(80, 150, 150, 80);\nline(150, 80, 220, 150);\ncolor("saddlebrown");\nrect(135, 210, 30, 50);\n```'
			],
			world: { kind: 'canvas' },
			starterCode: `background("lightblue");
color("tomato");
rect(80, 150, 140, 110);
// add a roof and a door
`,
			solution: `background("lightblue");
color("tomato");
rect(80, 150, 140, 110);
line(80, 150, 150, 80);
line(150, 80, 220, 150);
color("saddlebrown");
rect(135, 210, 30, 50);
`,
			checks: [
				{ type: 'draw-count', shape: 'line', min: 2, message: 'The roof needs two lines.' },
				{ type: 'draw-count', shape: 'rect', min: 2, message: 'Add a door: one more `rect()`.' }
			]
		},
		{
			id: `${M}/04-row`,
			slug: '04-row',
			kind: 'code',
			title: { default: 'In a row', music: 'Five notes', sports: 'Line-up', food: 'Cookie tray' },
			xp: 20,
			story: {
				default:
					'Five circles in a row. You could type five `circle()` lines and work out every x by hand. Or you could let a loop do the boring part.',
				music:
					'Five dots in a row, like notes on a stave. You could type five `circle()` lines. Or let a loop do the boring part.',
				food: 'Five cookies on a tray. You could place every one by hand. Or let a loop do the boring part.'
			},
			task: 'Draw 5 circles in a row, using a loop and only one `circle()` call. Each one 60 to the right of the last.',
			concept: {
				title: 'A loop that draws',
				body: 'Keep the x position in a variable. Draw, then move x along, and repeat.\n\n```js\nlet x = 30;\nfor (let i = 0; i < 5; i++) {\n  circle(x, 150, 25);\n  x = x + 60;\n}\n```\n\nEach time round, x is 60 bigger, so each circle lands further right.'
			},
			hints: [
				'Make a variable `let x = 30;` before the loop.',
				'Inside the loop: `circle(x, 150, 25);` then `x = x + 60;`.',
				'Like this:\n```js\nlet x = 30;\nfor (let i = 0; i < 5; i++) {\n  circle(x, 150, 25);\n  x = x + 60;\n}\n```'
			],
			world: { kind: 'canvas' },
			starterCode: `circle(30, 150, 25);
circle(90, 150, 25);
// ...three more? Let a loop do it.
`,
			solution: `let x = 30;
for (let i = 0; i < 5; i++) {
  circle(x, 150, 25);
  x = x + 60;
}
`,
			checks: [
				{ type: 'draw-count', shape: 'circle', min: 5, message: 'There should be 5 circles.' },
				{
					type: 'max-calls',
					command: 'circle',
					count: 1,
					message:
						"You can type five circles, but try the loop with one `circle()` inside. That's the trick here."
				}
			]
		},
		{
			id: `${M}/05-predict`,
			slug: '05-predict',
			kind: 'predict',
			title: 'Where did they go?',
			xp: 15,
			story:
				'{Friend} wanted three circles in a row, but only one shows up. Can you see why, without running it?',
			task: 'Read the code and pick what really happens.',
			code: `let x = 50;
for (let i = 0; i < 3; i++) {
  circle(x, 150, 40);
}
x = x + 100;
`,
			world: { kind: 'canvas' },
			question: "What's on the canvas?",
			choices: [
				'Three circles in a row, left to right',
				'Three circles in exactly the same spot, so it looks like one',
				'Nothing at all',
				'One circle at x = 150'
			],
			answer: 1,
			explanation:
				'`x = x + 100;` is after the closing `}`, so it only runs once, when the loop is done. All three circles are drawn at x = 50, on top of each other. Move that line inside the loop and they spread out.',
			hints: [
				'Look at where `x = x + 100;` is: inside the curly brackets, or after them?',
				'While the loop runs, does x ever change?'
			]
		},
		{
			id: `${M}/06-flower-function`,
			slug: '06-flower-function',
			kind: 'code',
			title: {
				default: 'A function that draws',
				nature: 'Wildflowers',
				food: 'Doughnuts',
				space: 'Planet factory'
			},
			xp: 25,
			story: {
				default:
					'Functions can take extra information, like where to draw. Then one function can draw the same thing in lots of places.',
				nature:
					'{Friend} wants a meadow full of flowers. Teach the computer to draw one flower anywhere, and you can plant as many as you like.',
				food: 'A doughnut is a big circle with a small one in the middle. Teach the computer to draw one anywhere, and you have a whole box.'
			},
			task: 'The `flower(x, y)` function draws one flower. Use it to draw at least three flowers in different places.',
			concept: {
				title: 'Functions with inputs',
				body: 'Put names in the brackets of a function, and they become variables inside it. When you call it, you fill them in.\n\n```js\nfunction flower(x, y) {\n  color("hotpink");\n  circle(x, y, 20);\n  color("gold");\n  circle(x, y, 8);\n}\n\nflower(80, 100);\nflower(200, 160);\n```\n\nThe first call draws at 80, 100. The second at 200, 160. Same function, different place.'
			},
			hints: [
				'The function is done. You just need to call it, like `flower(150, 150);`.',
				'Call it three times with three different pairs of numbers.',
				'Add three lines at the bottom:\n```js\nflower(70, 100);\nflower(150, 200);\nflower(230, 100);\n```'
			],
			world: { kind: 'canvas', background: 'palegreen' },
			starterCode: `function flower(x, y) {
  color("hotpink");
  circle(x, y, 20);
  color("gold");
  circle(x, y, 8);
}

flower(70, 100);
`,
			solution: `function flower(x, y) {
  color("hotpink");
  circle(x, y, 20);
  color("gold");
  circle(x, y, 8);
}

flower(70, 100);
flower(150, 200);
flower(230, 100);
`,
			checks: [
				{
					type: 'draw-count',
					shape: 'circle',
					min: 6,
					message: 'Three flowers need six circles. Call `flower()` a few more times.'
				},
				{
					type: 'max-calls',
					command: 'circle',
					count: 2,
					message: 'Use the `flower()` function for every flower instead of new `circle()` lines.'
				}
			]
		},
		{
			id: `${M}/07-boss`,
			slug: '07-boss',
			kind: 'code',
			boss: true,
			title: {
				default: 'City at night',
				games: 'The goblin city',
				space: 'Moon base',
				food: 'Late-night diner'
			},
			xp: 50,
			story: {
				default:
					'Your masterpiece: a city at night. A dark sky, a moon, and a tall building with a grid of glowing windows. Windows in rows and columns sounds like a loop inside a loop.',
				games:
					'Far below {place} lies the goblin city. Draw it at night: a dark sky, a moon, and a tall tower with rows and rows of glowing windows.',
				space:
					'{Friend} wants a postcard from the moon base: a dark sky, a planet, and a tall base with rows of glowing windows.'
			},
			task: 'Make it your own, but include: a background, at least 3 colours, a circle, and at least 12 rectangles. Draw the windows with loops: no more than 3 `rect()` calls in your code.',
			hints: [
				'Start with the easy parts: `background()`, a moon `circle()`, and one big `rect()` for the building.',
				'For the windows, put a loop for the columns inside a loop for the rows. Keep `x` and `y` in variables, like the row of circles.',
				'Here\'s one way:\n```js\nbackground("midnightblue");\ncolor("lightyellow");\ncircle(240, 60, 30);\ncolor("dimgray");\nrect(60, 90, 140, 210);\ncolor("gold");\nlet y = 110;\nfor (let row = 0; row < 5; row++) {\n  let x = 75;\n  for (let col = 0; col < 3; col++) {\n    rect(x, y, 25, 25);\n    x = x + 40;\n  }\n  y = y + 40;\n}\n```'
			],
			world: { kind: 'canvas' },
			starterCode: `background("midnightblue");

// a moon, a building, and lots of windows
`,
			solution: `background("midnightblue");
color("lightyellow");
circle(240, 60, 30);
color("dimgray");
rect(60, 90, 140, 210);
color("gold");
let y = 110;
for (let row = 0; row < 5; row++) {
  let x = 75;
  for (let col = 0; col < 3; col++) {
    rect(x, y, 25, 25);
    x = x + 40;
  }
  y = y + 40;
}
`,
			checks: [
				{ type: 'draw-background', message: 'Start with a `background()` for the night sky.' },
				{
					type: 'draw-count',
					shape: 'circle',
					min: 1,
					message: 'The sky needs a moon: one `circle()`.'
				},
				{
					type: 'draw-count',
					shape: 'rect',
					min: 12,
					message: 'A city needs lots of windows: at least 12 rectangles in total.'
				},
				{ type: 'draw-colors', min: 3, message: 'Use at least 3 different colours.' },
				{
					type: 'max-calls',
					command: 'rect',
					count: 3,
					message:
						'Drawing every window by hand works, but let loops do it. No more than 3 `rect()` calls in your code.'
				}
			]
		}
	]
};
