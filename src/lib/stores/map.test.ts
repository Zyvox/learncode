import { describe, expect, it } from 'vitest';
import type { Lesson, Module } from '#lib/curriculum/types.ts';
import { buildTrackMap } from './map.ts';

function lesson(id: string, boss = false): Lesson {
	return {
		id,
		slug: id.split('/')[1],
		title: id,
		kind: 'code',
		xp: 10,
		story: '',
		task: '',
		hints: [],
		boss,
		world: { kind: 'console' },
		starterCode: '',
		solution: '',
		checks: []
	};
}

function mod(id: string, order: number, track?: 'code' | 'web', n = 2): Module {
	return {
		id,
		order,
		track,
		title: id,
		blurb: '',
		emoji: '•',
		lessons: Array.from({ length: n }, (_, i) => lesson(`${id}/0${i + 1}`, i === n - 1))
	};
}

const modules = [mod('a', 1), mod('b', 2), mod('web-a', 1, 'web'), mod('web-b', 2, 'web')];

describe('buildTrackMap', () => {
	it('opens the first module of each track', () => {
		const code = buildTrackMap(modules, {}, 'code');
		const web = buildTrackMap(modules, {}, 'web');
		expect(code.modules.map((m) => [m.module.id, m.unlocked])).toEqual([
			['a', true],
			['b', false]
		]);
		expect(web.modules.map((m) => [m.module.id, m.unlocked])).toEqual([
			['web-a', true],
			['web-b', false]
		]);
		expect(web.current?.id).toBe('web-a/01');
		expect(web.total).toBe(4);
	});

	it('counts and continues per track', () => {
		const status = { 'a/01': 'done', 'a/02': 'done', 'web-a/01': 'done' } as const;
		const code = buildTrackMap(modules, status, 'code');
		const web = buildTrackMap(modules, status, 'web');
		expect(code.done).toBe(2);
		expect(code.current?.id).toBe('b/01');
		expect(web.done).toBe(1);
		expect(web.current?.id).toBe('web-a/02');
		expect(web.modules[1].unlocked).toBe(false);
	});

	it('opens a module the learner jumped into, one lesson at a time', () => {
		const three = [...modules, mod('c', 3)];
		const code = buildTrackMap(three, {}, 'code', new Set(['c']));
		expect(code.modules.map((m) => [m.module.id, m.unlocked, m.jumped])).toEqual([
			['a', true, false],
			['b', false, false],
			['c', true, true]
		]);
		const c = code.modules[2];
		expect(c.lessons.map((l) => l.state)).toEqual(['available', 'locked']);
		// "Up next" stays the first open lesson in course order
		expect(code.current?.id).toBe('a/01');
	});

	it('keeps the usual rules after a jump: the next lesson opens when the one before is done', () => {
		const three = [...modules, mod('c', 3)];
		const status = { 'c/01': 'done' } as const;
		const code = buildTrackMap(three, status, 'code', ['c']);
		expect(code.modules[2].lessons.map((l) => l.state)).toEqual(['done', 'available']);
		// Started modules are open by the rules, so they no longer count as jumped
		expect(code.modules[2].jumped).toBe(false);
		// Jumping into c doesn't open b
		expect(code.modules[1].unlocked).toBe(false);
	});

	it('ignores jumps into modules the rules already open, coming-soon modules and other tracks', () => {
		const soon: Module = { ...mod('soon', 3), comingSoon: true };
		const code = buildTrackMap([...modules, soon], {}, 'code', ['a', 'soon', 'web-b']);
		expect(code.modules.map((m) => [m.module.id, m.unlocked, m.jumped])).toEqual([
			['a', true, false],
			['b', false, false],
			['soon', false, false]
		]);
	});

	it('a finished jumped-in module opens the next one as usual', () => {
		const three = [...modules, mod('c', 3), mod('d', 4)];
		const status = { 'c/01': 'done', 'c/02': 'done' } as const;
		const code = buildTrackMap(three, status, 'code', ['c']);
		expect(code.modules.map((m) => [m.module.id, m.unlocked])).toEqual([
			['a', true],
			['b', false],
			['c', true],
			['d', true]
		]);
	});
});
