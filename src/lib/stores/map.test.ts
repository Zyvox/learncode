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
});
