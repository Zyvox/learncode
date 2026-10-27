import { describe, expect, it } from 'vitest';
import { CommandError, WorldHalt } from '../core.ts';
import { createCanvasWorld, normalizeColor } from './canvas.ts';

function friendlyOf(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(CommandError);
		return String((e as CommandError).friendly);
	}
	throw new Error('expected a CommandError');
}

describe('canvas world', () => {
	it('records draw ops with the current colour', () => {
		const w = createCanvasWorld({ kind: 'canvas' });
		w.api.background('SkyBlue');
		w.api.circle(10, 20, 5);
		w.api.color('red');
		w.api.rect(1, 2, 3, 4);
		w.api.line(0, 0, 10, 10);
		w.api.text(5, 6, 'Hi', 2);
		expect(w.draws).toEqual([
			{ op: 'background', color: 'skyblue' },
			{ op: 'circle', x: 10, y: 20, r: 5, color: 'black' },
			{ op: 'color', color: 'red' },
			{ op: 'rect', x: 1, y: 2, w: 3, h: 4, color: 'red' },
			{ op: 'line', x1: 0, y1: 0, x2: 10, y2: 10, color: 'red' },
			{ op: 'text', x: 5, y: 6, text: 'Hi 2', color: 'red' }
		]);
		expect(w.trace.map((e) => e.t)).toEqual(Array(6).fill('draw'));
		expect(w.finish().draws).toHaveLength(6);
	});

	it('maps friendly colour names and leaves CSS colours alone', () => {
		expect(normalizeColor('grass')).toBe('#4caf50');
		expect(normalizeColor(' #FF8800 ')).toBe('#ff8800');
		expect(normalizeColor('rgb(0, 1, 2)')).toBe('rgb(0, 1, 2)');
	});

	it('validates numbers with a friendly message', () => {
		const w = createCanvasWorld({ kind: 'canvas' });
		expect(() => w.api.circle('10', 20, 5)).toThrow(CommandError);
		try {
			w.api.circle(1, 2);
		} catch (e) {
			expect((e as CommandError).friendly).toMatch(
				/^`circle\(\)` needs three numbers: x, y and size/
			);
		}
		expect(friendlyOf(() => w.api.rect(1, 2, 3))).toMatch(/four numbers/);
		expect(() => w.api.circle(1, 2, NaN)).toThrow(CommandError);
		expect(friendlyOf(() => w.api.circle(1, 2, -3))).toMatch(/negative/);
		expect(friendlyOf(() => w.api.text(1, 2))).toMatch(/words to write/);
		expect(friendlyOf(() => w.api.color(5))).toMatch(/colour name in quotes/);
		expect(w.draws).toHaveLength(0);
	});

	it('console.log goes to output', () => {
		const w = createCanvasWorld({ kind: 'canvas' });
		w.log('x is', 4);
		expect(w.output).toEqual(['x is 4']);
		expect(w.trace).toEqual([{ t: 'print', text: 'x is 4' }]);
		expect(w.steps).toBe(0);
	});

	it('exposes width and height', () => {
		expect(createCanvasWorld({ kind: 'canvas' }).variables).toEqual({ width: 300, height: 300 });
		expect(createCanvasWorld({ kind: 'canvas', width: 400, height: 200 }).variables).toEqual({
			width: 400,
			height: 200
		});
	});

	it('stops after 2000 ops', () => {
		const w = createCanvasWorld({ kind: 'canvas' });
		for (let i = 0; i < 2000; i++) w.api.circle(i, i, 1);
		expect(() => w.api.circle(1, 1, 1)).toThrow(WorldHalt);
		expect(w.draws).toHaveLength(2000);
		expect(w.trace.at(-1)).toEqual({ t: 'stopped', reason: 'max-steps' });
	});
});
