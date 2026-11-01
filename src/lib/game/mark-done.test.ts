import { describe, expect, it } from 'vitest';
import type { ProgressEntry } from './backup.ts';
import { markLessonsDone } from './mark-done.ts';
import { MODULE_BONUS_XP } from './xp.ts';

const now = new Date('2026-11-01T09:00:00Z');
const lessons = [
	{ id: 'm/01', xp: 10 },
	{ id: 'm/02', xp: 10 },
	{ id: 'm/03', xp: 20 }
];

describe('markLessonsDone', () => {
	it('finishes every level with the no-hint XP and the module bonus once', () => {
		const res = markLessonsDone({}, lessons, now);
		expect(res.marked).toEqual(['m/01', 'm/02', 'm/03']);
		expect(res.xpGained).toBe(15 + 15 + 30 + MODULE_BONUS_XP);
		expect(res.entries['m/03']).toEqual({
			code: '',
			hintsUsed: 0,
			attempts: 0,
			completedAt: now.toISOString()
		});
	});

	it('never awards a level twice and keeps finished levels as they were', () => {
		const done: ProgressEntry = {
			code: 'move();',
			hintsUsed: 2,
			attempts: 4,
			completedAt: '2026-10-01T10:00:00.000Z'
		};
		const draft: ProgressEntry = { code: 'tur', hintsUsed: 1, attempts: 1, completedAt: null };
		const res = markLessonsDone({ 'm/01': done, 'm/02': draft, 'other/01': done }, lessons, now);
		expect(res.marked).toEqual(['m/02', 'm/03']);
		expect(res.xpGained).toBe(15 + 30 + MODULE_BONUS_XP);
		expect(res.entries['m/01']).toEqual(done);
		expect(res.entries['other/01']).toEqual(done);
		expect(res.entries['m/02']).toEqual({
			code: 'tur',
			hintsUsed: 0,
			attempts: 1,
			completedAt: now.toISOString()
		});

		const again = markLessonsDone(res.entries, lessons, now);
		expect(again.marked).toEqual([]);
		expect(again.xpGained).toBe(0);
	});
});
