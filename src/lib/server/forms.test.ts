import { describe, expect, it } from 'vitest';
import { parseGuestProgress, safeRedirect } from './forms.ts';

describe('safeRedirect', () => {
	it('allows local paths only', () => {
		expect(safeRedirect('/learn/first-steps/a')).toBe('/learn/first-steps/a');
		expect(safeRedirect('/profile?tab=badges')).toBe('/profile?tab=badges');
		expect(safeRedirect('https://evil.example')).toBe('/learn');
		expect(safeRedirect('//evil.example')).toBe('/learn');
		expect(safeRedirect('/\\evil.example')).toBe('/learn');
		expect(safeRedirect('/x\ny')).toBe('/learn');
		expect(safeRedirect('')).toBe('/learn');
		expect(safeRedirect(null, '/')).toBe('/');
	});

	it('only passes what a Location header can carry as-is', () => {
		expect(safeRedirect('/x\ry')).toBe('/learn');
		expect(safeRedirect('/\tevil.example')).toBe('/learn');
		expect(safeRedirect('/caf\u00e9')).toBe('/learn');
		expect(safeRedirect('/\u2028x')).toBe('/learn');
		expect(safeRedirect('/a b')).toBe('/learn');
		expect(safeRedirect('/' + 'a'.repeat(5000))).toBe('/learn');
		expect(safeRedirect('/caf%C3%A9')).toBe('/caf%C3%A9');
	});
});

describe('parseGuestProgress', () => {
	const entry = {
		lessonId: 'first-steps/a',
		code: 'move()',
		hintsUsed: 1,
		attempts: 2,
		completedAt: '2026-05-01T10:00:00Z'
	};

	it('accepts an array or an import body', () => {
		expect(parseGuestProgress(JSON.stringify([entry]))).toEqual([entry]);
		expect(parseGuestProgress(JSON.stringify({ entries: [entry] }))).toEqual([entry]);
	});

	it('accepts a localStorage-style map and skips unfinished lessons', () => {
		const map = {
			'first-steps/a': { status: 'done', lastCode: 'move()', hintsUsed: 0, attempts: 1 },
			'first-steps/b': { status: 'started', lastCode: 'mo' }
		};
		expect(parseGuestProgress(JSON.stringify(map))).toEqual([
			{ lessonId: 'first-steps/a', code: 'move()', hintsUsed: 0, attempts: 1, completedAt: null }
		]);
	});

	it('fills defaults and drops junk', () => {
		expect(parseGuestProgress(JSON.stringify([{ lessonId: 'x' }, { nope: 1 }, 5]))).toEqual([
			{ lessonId: 'x', code: null, hintsUsed: 0, attempts: 1, completedAt: null }
		]);
		expect(parseGuestProgress('not json')).toEqual([]);
		expect(parseGuestProgress('')).toEqual([]);
		expect(parseGuestProgress('null')).toEqual([]);
	});
});
