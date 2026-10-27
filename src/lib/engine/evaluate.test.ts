import { describe, expect, it } from 'vitest';
import type { Check, CodeLesson, WorldSpec } from '#lib/curriculum/types.ts';
import { runInNode } from './node.ts';
import { bareCommands, countCalls, countCodeLines, evaluate, stripComments } from './evaluate.ts';

const grid: WorldSpec = {
	kind: 'grid',
	width: 5,
	height: 3,
	hero: { x: 0, y: 1, dir: 'E' },
	items: [
		[1, 1],
		[2, 1]
	],
	goal: [3, 1]
};

function lesson(world: WorldSpec, checks: Check[]): CodeLesson {
	return {
		id: 'm/l',
		slug: 'l',
		title: 'T',
		kind: 'code',
		xp: 10,
		story: '',
		task: '',
		hints: [],
		world,
		starterCode: '',
		solution: '',
		checks
	};
}

async function check(code: string, world: WorldSpec, checks: Check[]) {
	const r = await runInNode(code, world);
	return evaluate(lesson(world, checks), r, code);
}

describe('evaluate', () => {
	it('a failed run fails with the error as the only failure', async () => {
		const res = await check('mvoe()', grid, [{ type: 'reach-goal' }]);
		expect(res).toEqual({
			passed: false,
			failures: ["I don't know anything called `mvoe`. Did you mean `move()`?"]
		});
	});

	it('reach-goal', async () => {
		expect((await check('move()\nmove()\nmove()', grid, [{ type: 'reach-goal' }])).passed).toBe(
			true
		);
		expect(await check('move()', grid, [{ type: 'reach-goal' }])).toEqual({
			passed: false,
			failures: ["{Hero} didn't reach the {goal}."]
		});
		expect(
			(await check('move()', grid, [{ type: 'reach-goal', message: 'Keep going!' }])).failures
		).toEqual(['Keep going!']);
	});

	it('collect-all', async () => {
		const all = 'move()\npickUp()\nmove()\npickUp()';
		expect((await check(all, grid, [{ type: 'collect-all' }])).passed).toBe(true);
		expect((await check('', grid, [{ type: 'collect-all' }])).failures).toEqual([
			'There are still 2 {itemEmoji} {items} left to pick up.'
		]);
		expect((await check('move()\npickUp()', grid, [{ type: 'collect-all' }])).failures).toEqual([
			"There's still 1 {itemEmoji} {item} left to pick up."
		]);
	});

	it('hero-at', async () => {
		expect((await check('move()', grid, [{ type: 'hero-at', x: 1, y: 1 }])).passed).toBe(true);
		expect((await check('', grid, [{ type: 'hero-at', x: 1, y: 1 }])).failures[0]).toMatch(
			/should finish on the marked square/
		);
	});

	const con: WorldSpec = { kind: 'console' };

	it('output-equals', async () => {
		const c: Check = { type: 'output-equals', lines: ['Hello, Ada', 'Bye'] };
		expect((await check('print("Hello, Ada")\nprint("Bye")', con, [c])).passed).toBe(true);
		expect((await check('', con, [c])).failures).toEqual([
			'Nothing was printed. Use `print(...)` to show something in the output.'
		]);
		expect((await check('print("hello, Ada")\nprint("Bye")', con, [c])).failures).toEqual([
			'Line 1 should be `Hello, Ada`, but it was `hello, Ada`. Check the capital letters.'
		]);
		expect((await check('print("Hello,Ada")\nprint("Bye")', con, [c])).failures).toEqual([
			'Line 1 should be `Hello, Ada`, but it was `Hello,Ada`. Check the spaces.'
		]);
		expect((await check('print("Hello, Ada")', con, [c])).failures).toEqual([
			'Your program printed 1 line, but 2 are expected. The next one should be `Bye`.'
		]);
		expect((await check('print("Hello, Ada")\nprint("Bye")\nprint(1)', con, [c])).failures).toEqual(
			['Your program printed 3 lines, but only 2 are expected. The extra one is `1`.']
		);
	});

	it('output-includes, output-line-count, output-matches', async () => {
		expect(
			(await check('print("I am 7")', con, [{ type: 'output-includes', text: '7' }])).passed
		).toBe(true);
		expect(
			(await check('print("x")', con, [{ type: 'output-includes', text: '7' }])).failures
		).toEqual(["Your output should include `7`, but it doesn't yet."]);
		const lc: Check = { type: 'output-line-count', min: 2, max: 3 };
		expect((await check('print(1)\nprint(2)', con, [lc])).passed).toBe(true);
		expect((await check('print(1)', con, [lc])).failures).toEqual([
			'Your program should print at least 2 lines. It printed 1.'
		]);
		expect((await check('for (let i = 0; i < 4; i++) print(i)', con, [lc])).failures).toEqual([
			'Your program should print at most 3 lines. It printed 4.'
		]);
		const m: Check = { type: 'output-matches', pattern: '^hi$', flags: 'im' };
		expect((await check('print("x")\nprint("HI")', con, [m])).passed).toBe(true);
		expect((await check('print("x")', con, [m])).passed).toBe(false);
	});

	it('said', async () => {
		const c: Check = { type: 'said', text: 'Hello' };
		expect((await check('say("Hello")', grid, [c])).passed).toBe(true);
		expect((await check('say("Hi")', grid, [c])).failures).toEqual([
			'{Hero} should say `Hello`, but said `Hi`.'
		]);
		expect((await check('', grid, [c])).failures).toEqual([
			'{Hero} should say `Hello`. Use `say("Hello")`.'
		]);
	});

	it('code-includes and code-excludes ignore comments', async () => {
		const inc: Check = {
			type: 'code-includes',
			pattern: '\\bwhile\\b',
			message: 'Use a while loop.'
		};
		const exc: Check = {
			type: 'code-excludes',
			pattern: 'move\\(\\)\\s*move',
			message: 'No copy-paste.'
		};
		expect((await check('while (!atGoal()) { move() }', grid, [inc, exc])).passed).toBe(true);
		expect((await check('// while\nmove()\nmove()\nmove()', grid, [inc])).failures).toEqual([
			'Use a while loop.'
		]);
		expect((await check('move() move()', grid, [exc])).passed).toBe(false);
	});

	it('max-lines and max-calls', async () => {
		const code = '// walk\nmove()\n\nmove() // again\n/* block\n comment */\nmove()';
		expect(countCodeLines(code)).toBe(3);
		expect(countCalls(code, 'move')).toBe(3);
		expect(countCalls(code, 'move()')).toBe(3);
		expect(countCalls('say("move()")\nfunction move() {}\nremove()\nx.move()', 'move')).toBe(0);
		const ml: Check = { type: 'max-lines', count: 2, message: 'Shorter!' };
		const mc: Check = { type: 'max-calls', command: 'move', count: 1, message: 'Use a loop.' };
		expect((await check(code, grid, [ml, mc])).failures).toEqual(['Shorter!', 'Use a loop.']);
		expect((await check('while (!atGoal()) {\n  move()\n}', grid, [ml, mc])).passed).toBe(false); // 3 lines
		expect((await check('while (!atGoal()) { move() }', grid, [ml, mc])).passed).toBe(true);
	});

	const canvas: WorldSpec = { kind: 'canvas' };

	it('draw-count, draw-colors, draw-background', async () => {
		const code =
			'background("navy")\ncolor("red")\ncircle(1, 1, 1)\ncolor("gold")\ncircle(2, 2, 2)\nrect(0, 0, 5, 5)';
		const checks: Check[] = [
			{ type: 'draw-count', shape: 'circle', min: 2, max: 2 },
			{ type: 'draw-count', shape: 'any', min: 3 },
			{ type: 'draw-colors', min: 2 },
			{ type: 'draw-background' }
		];
		expect((await check(code, canvas, checks)).passed).toBe(true);
		expect((await check('circle(1, 1, 1)', canvas, checks)).failures).toEqual([
			'Draw at least 2 circles. So far there is 1.',
			'Draw at least 3 shapes. So far there is 1.',
			'Use at least 2 different colours for your shapes. So far there is 1. Put `color("…")` before a shape to change its colour.',
			'Give the canvas a background colour with `background("…")`.'
		]);
		expect(
			(
				await check('rect(0,0,1,1)\nrect(0,0,1,1)', canvas, [
					{ type: 'draw-count', shape: 'rect', max: 1 }
				])
			).failures
		).toEqual(['Draw at most 1 rectangle. Your drawing has 2.']);
	});

	it('points out commands written without brackets', async () => {
		expect(bareCommands('move\nif (pathAhead) {}\nturnLeft()', 'grid')).toEqual([
			'move',
			'pathAhead'
		]);
		expect(bareCommands('let text = "hi"\ntext = 3\nprint(text)', 'canvas')).toEqual([]);
		const res = await check('move\nmove()', grid, [{ type: 'reach-goal' }]);
		expect(res.failures).toEqual([
			"`move` needs round brackets to work: `move()`. Without them JavaScript only looks at the name and doesn't run it.",
			"{Hero} didn't reach the {goal}."
		]);
	});

	it('stripComments keeps strings and line structure', () => {
		expect(stripComments('a // b\n"// not" /* c\nd */ e')).toBe('a     \n"// not"     \n     e');
	});
});
