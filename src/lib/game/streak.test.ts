import { describe, expect, it } from 'vitest';
import { advanceStreak, currentStreak, previousDay, utcDay } from './streak.ts';

describe('streak', () => {
	it('formats UTC days', () => {
		expect(utcDay(new Date('2026-03-01T23:59:59Z'))).toBe('2026-03-01');
		expect(previousDay('2026-03-01')).toBe('2026-02-28');
		expect(previousDay('2024-03-01')).toBe('2024-02-29');
		expect(previousDay('2026-01-01')).toBe('2025-12-31');
	});

	it('starts at 1', () => {
		expect(advanceStreak({ streak: 0, lastActiveDay: null }, '2026-05-02')).toEqual({
			streak: 1,
			lastActiveDay: '2026-05-02'
		});
	});

	it('is unchanged on the same day', () => {
		expect(advanceStreak({ streak: 4, lastActiveDay: '2026-05-02' }, '2026-05-02').streak).toBe(4);
	});

	it('grows on consecutive days', () => {
		expect(advanceStreak({ streak: 4, lastActiveDay: '2026-05-01' }, '2026-05-02').streak).toBe(5);
	});

	it('resets after a gap', () => {
		expect(advanceStreak({ streak: 9, lastActiveDay: '2026-04-29' }, '2026-05-02').streak).toBe(1);
	});

	it('shows 0 once a streak has lapsed', () => {
		expect(currentStreak({ streak: 3, lastActiveDay: '2026-05-02' }, '2026-05-02')).toBe(3);
		expect(currentStreak({ streak: 3, lastActiveDay: '2026-05-01' }, '2026-05-02')).toBe(3);
		expect(currentStreak({ streak: 3, lastActiveDay: '2026-04-30' }, '2026-05-02')).toBe(0);
		expect(currentStreak({ streak: 0, lastActiveDay: null }, '2026-05-02')).toBe(0);
	});
});
