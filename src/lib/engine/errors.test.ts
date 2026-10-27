import { describe, expect, it } from 'vitest';
import type { WorldSpec } from '#lib/curriculum/types.ts';
import { runInNode } from './node.ts';
import { closestName, editDistance, lineFromStack, toFriendlyError } from './errors.ts';
import { RunTimeout } from './core.ts';

const grid: WorldSpec = {
	kind: 'grid',
	width: 6,
	height: 3,
	hero: { x: 0, y: 1, dir: 'E' },
	goal: [5, 1]
};
const consoleWorld: WorldSpec = { kind: 'console' };

async function err(code: string, spec: WorldSpec = grid) {
	const r = await runInNode(code, spec);
	expect(r.ok).toBe(false);
	return r.error!;
}

describe('friendly errors', () => {
	it('unknown names suggest the closest command', async () => {
		const e = await err('move()\nmvoe()');
		expect(e.message).toBe("I don't know anything called `mvoe`. Did you mean `move()`?");
		expect(e.line).toBe(2);
		expect(e.raw).toBe('ReferenceError: mvoe is not defined');
	});

	it('mentions capital letters for case-only mistakes', async () => {
		const e = await err('turnleft()');
		expect(e.message).toBe(
			"I don't know anything called `turnleft`. Did you mean `turnLeft()`? Capital letters matter in JavaScript."
		);
	});

	it('suggests the learner’s own variables and world aliases', async () => {
		expect((await err('let count = 1\nprint(cuont)', consoleWorld)).message).toBe(
			"I don't know anything called `cuont`. Did you mean `count`?"
		);
		expect((await err('forward()')).message).toMatch(/Did you mean `move\(\)`\?/);
		expect((await err('say("hi")', consoleWorld)).message).toMatch(/Did you mean `print\(\)`\?/);
		expect((await err('print(True)', consoleWorld)).message).toMatch(/Did you mean `true`\?/);
	});

	it('unknown words without a match get the quotes / let advice', async () => {
		expect((await err('print(Hello)', consoleWorld)).message).toBe(
			"I don't know anything called `Hello`. If it's text, put it in quotes: `\"Hello\"`. If it's a variable, create it first with `let`."
		);
		expect((await err('total = 5', consoleWorld)).message).toBe(
			"I don't know anything called `total`. To make a new variable, start with `let`: `let total = …`."
		);
	});

	it('X is not a function for a known command', async () => {
		const e = toFriendlyError(new TypeError('move is not a function'), 'move()', ['move'], 3);
		expect(e.message).toBe('`move` is a command — it needs round brackets: `move()`.');
		const reused = await err('let move = 3\nmove()');
		expect(reused.message).toMatch(/also uses that name for something else/);
		expect(reused.line).toBe(2);
	});

	it('X is not a function for other values and methods', async () => {
		expect((await err('let n = 3\nn()', consoleWorld)).message).toBe(
			"`n` isn't a command, so it can't be run with round brackets `()`."
		);
		expect((await err('let s = "hi"\nprint(s.toUppercase())', consoleWorld)).message).toBe(
			"`.toUppercase()` isn't something this value can do. Did you mean `.toUpperCase()`?"
		);
	});

	it('missing brackets and braces', async () => {
		const e1 = await err('move(\nmove()');
		expect(e1.message).toBe(
			'It looks like a bracket or brace is missing. Every `(` needs a `)` and every `{` needs a `}`.'
		);
		expect(e1.line).toBe(2);
		const e2 = await err('while (true) {\n  move()\n');
		expect(e2.message).toMatch(/bracket or brace is missing/);
		expect(e2.line).toBeUndefined();
		const e3 = await err('move()\n}\nmove()');
		expect(e3.message).toBe(
			"There's a `}` here without a matching `{` before it. Every `{` needs one `}` — check for an extra `}`."
		);
		expect(e3.line).toBe(2);
		const e4 = await err('if (pathAhead()) {\n  move()\n}\nwhile (true {\n}');
		expect(e4.message).toMatch(/bracket or brace is missing/);
		expect(e4.line).toBe(4);
	});

	it('unexpected identifier', async () => {
		const e = await err('move()\nmove() move()');
		expect(e.message).toMatch(/^JavaScript found `move` somewhere it didn't expect a name/);
		expect(e.line).toBe(2);
		const cond = await err('let x = 1\nif x > 3 {\n}', consoleWorld);
		expect(cond.message).toMatch(/Conditions after `if` and `while` go inside round brackets/);
	});

	it('misspelt keywords', async () => {
		const e = await err('whlie (pathAhead()) {\n  move()\n}');
		expect(e.message).toBe("`whlie` isn't a word JavaScript knows. Did you mean `while`?");
		expect(e.line).toBe(1);
	});

	it('curly quotes', async () => {
		const e = await err('move()\nsay(“hi”)');
		expect(e.message).toBe(
			'There\'s a character JavaScript doesn\'t understand — often curly quotes “ ” pasted from somewhere. Use straight quotes " ".'
		);
		expect(e.line).toBe(2);
	});

	it('a missing closing quote', async () => {
		const e = await err('print("hi)', consoleWorld);
		expect(e.message).toMatch(/missing its closing quote/);
		expect(e.line).toBe(1);
	});

	it('reading a property of undefined', async () => {
		const e = await err('let pet\nprint(pet.name)', consoleWorld);
		expect(e.message).toBe(
			'Something was `undefined` (it had no value) when your code tried to use `.name` on it. Check that the variable got a value before this line.'
		);
		expect(e.line).toBe(2);
	});

	it('declared twice, const, TDZ, recursion', async () => {
		expect((await err('let a = 1\nlet a = 2', consoleWorld)).message).toBe(
			'You created `a` twice. Use `let a` only the first time; after that, just write `a = …`.'
		);
		expect((await err('const a = 1\na = 2', consoleWorld)).message).toMatch(/Use `let` instead/);
		expect((await err('print(a)\nlet a = 1', consoleWorld)).message).toMatch(
			/You used `a` before the line that creates it/
		);
		expect((await err('function f() { f() }\nf()', consoleWorld)).message).toMatch(
			/kept calling itself/
		);
	});

	it('thrown values and plain errors', async () => {
		expect((await err('throw "oops"', consoleWorld)).message).toBe(
			'Your code stopped with this message: oops'
		);
		const e = await err('\nthrow new Error("custom")', consoleWorld);
		expect(e.message).toBe('Your code stopped with this message: custom');
		expect(e.line).toBe(2);
	});

	it('maps stack lines back to learner lines and clamps them', () => {
		expect(
			lineFromStack('Error\n    at eval (eval at x (a.js:1:1), <anonymous>:5:3)', 3, 10)
		).toEqual({ line: 2, column: 3 });
		expect(lineFromStack('at evalmachine.<anonymous>:40:1', 3, 4)?.line).toBe(4);
		expect(lineFromStack('@http://x/w.js line 3 > Function:6:2', 3, 9)?.line).toBe(3);
		expect(lineFromStack('no frames here', 3, 9)).toBeUndefined();
	});

	it('timeouts', () => {
		expect(toFriendlyError(new RunTimeout(3000), '', [], 3).message).toMatch(/ran for too long/);
	});

	it('edit distance helpers', () => {
		expect(editDistance('mvoe', 'move')).toBe(1);
		expect(editDistance('trunLeft', 'turnLeft')).toBe(1);
		expect(closestName('pathahead', ['pathAhead', 'move'])).toBe('pathAhead');
		expect(closestName('xyz', ['move'])).toBeUndefined();
		expect(closestName('x', ['y'])).toBeUndefined();
	});
});

describe('more friendly errors', () => {
	it('text and a variable side by side', async () => {
		const e = await err('print("Hi" name)', { kind: 'console', variables: { name: 'Ada' } });
		expect(e.message).toMatch(/^Two things sit side by side/);
	});

	it('long dashes, even when V8 reports something else', async () => {
		const e = await err('let a = 1\nprint(10 − 3)', consoleWorld);
		expect(e.message).toMatch(/long dash/);
		expect(e.line).toBe(2);
	});

	it('smart quotes inside a normal string are fine', async () => {
		const r = await runInNode('print("she said “hi”")', consoleWorld);
		expect(r.output).toEqual(['she said “hi”']);
	});

	it('a real method on the wrong kind of value', async () => {
		expect((await err('let s = "a"\ns.push(1)', consoleWorld)).message).toMatch(
			/works on some kinds of values/
		);
	});

	it('Python-style and / or', async () => {
		expect((await err('let x = 5\nif (x > 1 and x < 9) {\n}', consoleWorld)).message).toMatch(
			/\*\*and\*\* is written `&&`/
		);
	});
});
