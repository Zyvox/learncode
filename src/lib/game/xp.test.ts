import { describe, expect, it } from 'vitest';
import { completionXp, LEVEL_TITLES, levelForXp, xpForLevel } from './xp.ts';

describe('levelForXp', () => {
	it('starts at level 1 with 0 xp', () => {
		expect(levelForXp(0)).toMatchObject({
			level: 1,
			title: 'Curious',
			xpIntoLevel: 0,
			xpForNext: 50,
			progress: 0
		});
	});

	it('follows the curve', () => {
		expect(levelForXp(49).level).toBe(1);
		expect(levelForXp(50).level).toBe(2);
		expect(levelForXp(119).level).toBe(2);
		expect(levelForXp(120).level).toBe(3);
		expect(levelForXp(2050).level).toBe(11);
	});

	it('reports progress within the level', () => {
		const info = levelForXp(85);
		expect(info).toMatchObject({ level: 2, title: 'Tinkerer', xpIntoLevel: 35, xpForNext: 70 });
		expect(info.progress).toBeCloseTo(0.5);
		expect(info.levelStartXp).toBe(50);
		expect(info.nextLevelXp).toBe(120);
	});

	it('keeps going past the table and the titles', () => {
		const thresholds = Array.from({ length: 20 }, (_, i) => xpForLevel(i + 1));
		for (let i = 1; i < thresholds.length; i++) {
			expect(thresholds[i]).toBeGreaterThan(thresholds[i - 1]);
		}
		const high = levelForXp(1_000_000);
		expect(high.level).toBeGreaterThan(LEVEL_TITLES.length);
		expect(high.title).toBe(LEVEL_TITLES[LEVEL_TITLES.length - 1]);
		expect(high.progress).toBeGreaterThanOrEqual(0);
		expect(high.progress).toBeLessThan(1);
	});

	it('treats junk input as 0', () => {
		expect(levelForXp(-5).level).toBe(1);
		expect(levelForXp(Number.NaN).level).toBe(1);
	});
});

describe('completionXp', () => {
	it('gives the lesson xp with hints', () => {
		expect(completionXp(20, { hintsUsed: 2, completesModule: false })).toBe(20);
	});
	it('gives x1.5 rounded without hints', () => {
		expect(completionXp(15, { hintsUsed: 0, completesModule: false })).toBe(23);
	});
	it('adds the module bonus', () => {
		expect(completionXp(20, { hintsUsed: 1, completesModule: true })).toBe(30);
		expect(completionXp(20, { hintsUsed: 0, completesModule: true })).toBe(40);
	});
});
