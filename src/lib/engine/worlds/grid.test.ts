import { describe, expect, it } from 'vitest';
import type { GridWorldSpec } from '#lib/curriculum/types.ts';
import { CommandError, SpecError, WorldHalt } from '../core.ts';
import { createGridWorld, gridStateFromSpec } from './grid.ts';

const spec = (over: Partial<GridWorldSpec> = {}): GridWorldSpec => ({
	kind: 'grid',
	width: 5,
	height: 4,
	hero: { x: 1, y: 1, dir: 'E' },
	walls: [[3, 1]],
	items: [
		[2, 1],
		[2, 1],
		[1, 2]
	],
	goal: [2, 2],
	...over
});

describe('grid world', () => {
	it('moves in the facing direction with y going down', () => {
		const w = createGridWorld(spec({ hero: { x: 1, y: 1, dir: 'S' } }));
		w.api.move();
		expect(w.state.hero).toEqual({ x: 1, y: 2, dir: 'S' });
		expect(w.trace).toEqual([{ t: 'move', from: [1, 1], to: [1, 2], dir: 'S' }]);
		const n = createGridWorld(spec({ hero: { x: 1, y: 1, dir: 'N' } }));
		n.api.move();
		expect(n.state.hero).toMatchObject({ x: 1, y: 0 });
		const wst = createGridWorld(spec({ hero: { x: 1, y: 1, dir: 'W' } }));
		wst.api.move();
		expect(wst.state.hero).toMatchObject({ x: 0, y: 1 });
	});

	it('turns left and right', () => {
		const w = createGridWorld(spec());
		w.api.turnLeft();
		expect(w.state.hero.dir).toBe('N');
		w.api.turnLeft();
		expect(w.state.hero.dir).toBe('W');
		w.api.turnRight();
		w.api.turnRight();
		w.api.turnRight();
		expect(w.state.hero.dir).toBe('S');
		expect(w.trace[0]).toEqual({ t: 'turn', dir: 'left', facing: 'N' });
		expect(w.trace.at(-1)).toEqual({ t: 'turn', dir: 'right', facing: 'S' });
	});

	it('bumping into a wall records a bump and halts', () => {
		const w = createGridWorld(spec());
		w.api.move();
		let err: unknown;
		try {
			w.api.move();
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(WorldHalt);
		expect((err as WorldHalt).friendly).toBe(
			'{Hero} bumped into the {wall} on move 2. Is a turn missing before that move?'
		);
		expect(w.trace.at(-1)).toEqual({ t: 'bump', at: [2, 1], dir: 'E' });
		expect(w.state.hero).toMatchObject({ x: 2, y: 1 });
		expect(w.halted).toBe(err);
		// any later command re-throws the same halt
		expect(() => w.api.turnLeft()).toThrow(err as Error);
	});

	it('walking off the edge halts with an edge message', () => {
		const w = createGridWorld(spec({ hero: { x: 0, y: 0, dir: 'N' } }));
		expect(() => w.api.move()).toThrow(WorldHalt);
		expect((w.halted as WorldHalt).friendly).toMatch(/edge of the map on move 1/);
		expect(w.trace).toEqual([{ t: 'bump', at: [0, 0], dir: 'N' }]);
	});

	it('picks up items one at a time, nothing-here is not fatal', () => {
		const w = createGridWorld(spec());
		expect(w.api.pickUp()).toBe(false);
		expect(w.trace[0]).toEqual({ t: 'pickup', at: [1, 1], ok: false });
		w.api.move();
		expect(w.api.onItem()).toBe(true);
		expect(w.api.itemsLeft()).toBe(3);
		w.api.pickUp();
		expect(w.api.onItem()).toBe(true); // two items stacked here
		w.api.pickUp();
		expect(w.api.onItem()).toBe(false);
		expect(w.state.collected).toBe(2);
		expect(w.api.itemsLeft()).toBe(1);
		expect(w.finish().grid?.items).toEqual([[1, 2]]);
	});

	it('sensors look at the cells around the hero', () => {
		const w = createGridWorld(spec());
		w.api.move(); // at (2,1) facing E, wall at (3,1)
		expect(w.api.pathAhead()).toBe(false);
		expect(w.api.pathLeft()).toBe(true); // north (2,0)
		expect(w.api.pathRight()).toBe(true); // south (2,2)
		expect(w.api.atGoal()).toBe(false);
		w.api.turnRight();
		w.api.move();
		expect(w.api.atGoal()).toBe(true);
		const corner = createGridWorld(spec({ hero: { x: 0, y: 0, dir: 'N' }, goal: undefined }));
		expect(corner.api.pathAhead()).toBe(false);
		expect(corner.api.pathLeft()).toBe(false);
		expect(corner.api.pathRight()).toBe(true);
		expect(corner.api.atGoal()).toBe(false);
	});

	it('say records text, coerced to a string', () => {
		const w = createGridWorld(spec());
		w.api.say('Hi');
		w.api.say(3, true);
		w.log('from console');
		expect(w.trace).toEqual([
			{ t: 'say', text: 'Hi' },
			{ t: 'say', text: '3 true' },
			{ t: 'say', text: 'from console' }
		]);
	});

	it('every command counts as a step and the cap halts the run', () => {
		const w = createGridWorld(spec({ maxSteps: 3 }));
		w.api.turnLeft();
		w.api.pathAhead();
		w.api.atGoal();
		expect(w.steps).toBe(3);
		expect(() => w.api.turnLeft()).toThrow(WorldHalt);
		expect(w.trace.at(-1)).toEqual({ t: 'stopped', reason: 'max-steps' });
		expect((w.halted as WorldHalt).friendly).toBe(
			'Your program ran for more than 3 steps. That usually means a loop that never ends.'
		);
		expect(w.steps).toBe(3);
	});

	it('default step cap is 500', () => {
		const w = createGridWorld(spec());
		for (let i = 0; i < 500; i++) w.api.turnLeft();
		expect(() => w.api.turnLeft()).toThrow(/500/);
	});

	it('move(3) explains that move takes no input', () => {
		const w = createGridWorld(spec());
		expect(() => w.api.move(3)).toThrow(CommandError);
		expect(w.state.hero).toMatchObject({ x: 1, y: 1 });
	});

	it('validates the spec', () => {
		expect(() => gridStateFromSpec(spec({ hero: { x: 3, y: 1, dir: 'E' } }))).toThrow(SpecError);
		expect(() => gridStateFromSpec(spec({ hero: { x: 9, y: 1, dir: 'E' } }))).toThrow(/outside/);
		expect(() => gridStateFromSpec(spec({ goal: [3, 1] }))).toThrow(/goal/);
		expect(() => gridStateFromSpec(spec({ walls: [[7, 7]] }))).toThrow(/walls\[0\]/);
		expect(() => gridStateFromSpec(spec({ hero: { x: 1, y: 1, dir: 'X' as 'N' } }))).toThrow(/dir/);
	});

	it('finish() returns a snapshot, not the live state', () => {
		const w = createGridWorld(spec());
		const snap = w.finish().grid!;
		w.api.move();
		expect(snap.hero.x).toBe(1);
	});
});
