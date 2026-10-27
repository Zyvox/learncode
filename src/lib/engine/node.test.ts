import { describe, expect, it } from 'vitest';
import type { GridWorldSpec, WorldSpec } from '#lib/curriculum/types.ts';
import { runInNode } from './node.ts';
import { buildProgram, PREFIX_LINES, SHADOWED_GLOBALS } from './program.ts';
import { SPEC_ERROR_MESSAGE, functionExecutor, runProgram } from './run.ts';
import { createWorld } from './worlds/index.ts';

const grid: GridWorldSpec = {
	kind: 'grid',
	width: 5,
	height: 3,
	hero: { x: 0, y: 1, dir: 'E' },
	walls: [[3, 1]],
	items: [[1, 1]],
	goal: [2, 1]
};

describe('runInNode', () => {
	it('runs a correct program', async () => {
		const r = await runInNode('move()\npickUp()\nmove()', grid);
		expect(r.ok).toBe(true);
		expect(r.error).toBeUndefined();
		expect(r.timedOut).toBe(false);
		expect(r.steps).toBe(3);
		expect(r.grid?.hero).toEqual({ x: 2, y: 1, dir: 'E' });
		expect(r.grid?.collected).toBe(1);
		expect(r.trace.map((e) => e.t)).toEqual(['move', 'pickup', 'move']);
	});

	it('cuts off while(true){} with a timeout result', async () => {
		const r = await runInNode('move()\nwhile (true) {}', grid, { timeoutMs: 200 });
		expect(r).toEqual({
			ok: false,
			error: {
				message:
					'Your program ran for too long, so it was stopped. Usually that means a loop that never ends. Look at the question your loop asks: does the answer ever change?',
				raw: 'Stopped after 200 ms'
			},
			trace: [{ t: 'stopped', reason: 'timeout' }],
			output: [],
			grid: expect.objectContaining({ hero: { x: 0, y: 1, dir: 'E' } }),
			steps: 0,
			timedOut: true
		});
	});

	it('a bump ends the run with a friendly error and its line', async () => {
		const r = await runInNode('move()\nmove()\n\nmove()\nmove()', grid);
		expect(r.ok).toBe(false);
		expect(r.error?.message).toMatch(/^\{Hero\} bumped into the \{wall\} on move 3/);
		expect(r.error?.line).toBe(4);
		expect(r.trace.at(-1)).toEqual({ t: 'bump', at: [2, 1], dir: 'E' });
		expect(r.steps).toBe(3);
	});

	it('a swallowed bump still fails the run', async () => {
		const r = await runInNode('try { move(); move(); move() } catch (e) {}\nsay("hi")', grid);
		expect(r.ok).toBe(false);
		expect(r.error?.message).toMatch(/bumped/);
	});

	it('runaway loops of commands hit the step cap', async () => {
		const r = await runInNode('while (true) { turnLeft() }', grid);
		expect(r.ok).toBe(false);
		expect(r.timedOut).toBe(false);
		expect(r.steps).toBe(500);
		expect(r.trace.at(-1)).toEqual({ t: 'stopped', reason: 'max-steps' });
		expect(r.error?.message).toBe(
			'Your program ran for more than 500 steps. That usually means a loop that never ends.'
		);
	});

	it('injects lesson variables as real, changeable variables', async () => {
		const r = await runInNode('score = score + 1\nprint(name, score)\nconsole.log("done")', {
			kind: 'console',
			variables: { score: 7, name: 'Ada' }
		});
		expect(r.ok).toBe(true);
		expect(r.output).toEqual(['Ada 8', 'done']);
	});

	it('lets the learner re-declare a lesson variable or command name', async () => {
		const r = await runInNode('let score = 1\nlet self = 2\nprint(score + self)', {
			kind: 'console',
			variables: { score: 7 }
		});
		expect(r.ok).toBe(true);
		expect(r.output).toEqual(['3']);
	});

	it('hides dangerous globals and runs in strict mode', async () => {
		const names = SHADOWED_GLOBALS.map((n) => `typeof ${n}`).join(', ');
		const r = await runInNode(`print(${names})\nprint(typeof this)`, { kind: 'console' });
		expect(r.ok).toBe(true);
		expect(r.output[0]).toBe(SHADOWED_GLOBALS.map(() => 'undefined').join(' '));
		expect(r.output[1]).toBe('undefined');
		const strict = await runInNode('undeclared = 5', { kind: 'console' });
		expect(strict.ok).toBe(false);
		expect(strict.error?.message).toMatch(/start with `let`/);
	});

	it('console.log maps to say in the grid', async () => {
		const r = await runInNode('console.log("hello", 2)', grid);
		expect(r.trace).toEqual([{ t: 'say', text: 'hello 2' }]);
	});

	it('canvas results carry draws', async () => {
		const r = await runInNode('color("red")\ncircle(width / 2, height / 2, 10)', {
			kind: 'canvas'
		});
		expect(r.ok).toBe(true);
		expect(r.draws).toEqual([
			{ op: 'color', color: 'red' },
			{ op: 'circle', x: 150, y: 150, r: 10, color: 'red' }
		]);
	});

	it('command misuse becomes a friendly error with a line', async () => {
		const r = await runInNode('background("white")\ncircle("big")', { kind: 'canvas' });
		expect(r.ok).toBe(false);
		expect(r.error?.message).toMatch(/needs three numbers/);
		expect(r.error?.line).toBe(2);
		expect(r.draws).toHaveLength(1);
	});

	it('an invalid spec is reported as our mistake', async () => {
		const r = await runInNode('move()', { ...grid, hero: { x: 3, y: 1, dir: 'E' } });
		expect(r.ok).toBe(false);
		expect(r.error?.message).toBe(SPEC_ERROR_MESSAGE);
		expect(r.error?.raw).toMatch(/hero \(3, 1\) is on a wall/);
	});

	it('produces the same result as the new Function executor (worker parity)', async () => {
		const cases: [string, WorldSpec][] = [
			['move()\npickUp()\nmove()', grid],
			['move()\nmove()\nmove()', grid],
			['mvoe()', grid],
			['move(\nmove()', grid],
			['print("a", [1, 2], { x: 1 })\nprint(nope)', { kind: 'console' }],
			['circle(1, 2)', { kind: 'canvas' }],
			['let x = undefined\nprint(x.length)', { kind: 'console' }]
		];
		for (const [code, spec] of cases) {
			const viaVm = await runInNode(code, spec);
			const viaFunction = runProgram(code, spec, functionExecutor);
			expect(viaVm).toEqual(viaFunction);
		}
	});

	it('uses the documented prefix-line layout', () => {
		const p = buildProgram('move()', createWorld(grid));
		const src = new Function(...p.names, p.body).toString().split('\n');
		expect(src[PREFIX_LINES]).toBe('move()');
		expect(p.prefixLines).toBe(PREFIX_LINES);
	});
});
