import { describe, expect, it } from 'vitest';
import { SpecError, WorldHalt, formatValue } from '../core.ts';
import { createConsoleWorld } from './console.ts';

describe('console world', () => {
	it('print joins values with spaces and records events', () => {
		const w = createConsoleWorld({ kind: 'console' });
		w.api.print('Score:', 7, true);
		w.api.print();
		expect(w.output).toEqual(['Score: 7 true', '']);
		expect(w.trace).toEqual([
			{ t: 'print', text: 'Score: 7 true' },
			{ t: 'print', text: '' }
		]);
		expect(w.steps).toBe(2);
	});

	it('formats values simply', () => {
		expect(formatValue('hi')).toBe('hi');
		expect(formatValue(3.5)).toBe('3.5');
		expect(formatValue(-0)).toBe('0');
		expect(formatValue(undefined)).toBe('undefined');
		expect(formatValue(null)).toBe('null');
		expect(formatValue(NaN)).toBe('NaN');
		expect(formatValue([1, 'a', [true]])).toBe('[1, "a", [true]]');
		expect(formatValue({ name: 'Ada', age: 36 })).toBe('{ name: "Ada", age: 36 }');
		expect(formatValue({})).toBe('{}');
		const loop: Record<string, unknown> = { a: 1 };
		loop.self = loop;
		expect(formatValue(loop)).toBe('{ a: 1, self: [circular] }');
		expect(formatValue(function move() {})).toBe('[function move]');
	});

	it('exposes the lesson variables', () => {
		const w = createConsoleWorld({ kind: 'console', variables: { score: 7, name: 'Ada' } });
		expect(w.variables).toEqual({ score: 7, name: 'Ada' });
	});

	it('rejects variable names that would break the program', () => {
		expect(() => createConsoleWorld({ kind: 'console', variables: { print: 1 } })).toThrow(
			SpecError
		);
		expect(() => createConsoleWorld({ kind: 'console', variables: { 'my score': 1 } })).toThrow(
			SpecError
		);
		expect(() => createConsoleWorld({ kind: 'console', variables: { let: 1 } })).toThrow(SpecError);
	});

	it('stops after 1000 lines', () => {
		const w = createConsoleWorld({ kind: 'console' });
		for (let i = 0; i < 1000; i++) w.api.print(i);
		expect(() => w.api.print('one more')).toThrow(WorldHalt);
		expect(w.output).toHaveLength(1000);
		expect((w.halted as WorldHalt).friendly).toBe(
			'Your program printed more than 1000 lines. That usually means a loop that never ends.'
		);
		expect(w.trace.at(-1)).toEqual({ t: 'stopped', reason: 'max-steps' });
	});
});
