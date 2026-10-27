import { describe, expect, it } from 'vitest';
import {
	allBadges,
	BADGES,
	describeBadge,
	evaluateBadges,
	type BadgeContext,
	type BadgeModule
} from './badges.ts';

const modules: BadgeModule[] = [
	{
		id: 'first-steps',
		title: 'First steps',
		emoji: '👣',
		lessons: [
			{ id: 'first-steps/a', kind: 'code' },
			{ id: 'first-steps/b', kind: 'fix' },
			{ id: 'first-steps/c', kind: 'predict' }
		]
	},
	{
		id: 'doing-it-again',
		title: { default: 'Doing it again' },
		emoji: '🔁',
		lessons: [
			{ id: 'doing-it-again/a', kind: 'fix' },
			{ id: 'doing-it-again/b', kind: 'fix' },
			{ id: 'doing-it-again/c', kind: 'code' }
		]
	},
	{
		id: 'making-choices',
		title: 'Making choices',
		emoji: '🔀',
		lessons: [{ id: 'making-choices/a', kind: 'code' }]
	},
	{ id: 'later', title: 'Later', emoji: '⏳', comingSoon: true, lessons: [] }
];

function ctx(over: Partial<BadgeContext> = {}): BadgeContext {
	return {
		progress: {},
		modules,
		streak: 1,
		lesson: null,
		hour: null,
		earned: [],
		...over
	};
}

const done = (hintsUsed = 1) => ({ status: 'done' as const, hintsUsed });

describe('BADGES', () => {
	it('has unique ids and about a dozen entries', () => {
		const ids = BADGES.map((b) => b.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(BADGES.length).toBeGreaterThanOrEqual(10);
	});

	it('describes module badges', () => {
		expect(describeBadge('module-doing-it-again', modules)).toMatchObject({
			name: 'Doing it again',
			emoji: '🔁'
		});
		expect(describeBadge('first-level', modules)?.name).toBe('First Steps');
		expect(describeBadge('nope', modules)).toBeUndefined();
		expect(allBadges(modules).map((b) => b.id)).not.toContain('module-later');
	});
});

describe('evaluateBadges', () => {
	it('awards nothing for nothing', () => {
		expect(evaluateBadges(ctx())).toEqual([]);
	});

	it('awards first-level for the first completion', () => {
		const result = evaluateBadges(
			ctx({
				progress: { 'first-steps/a': done() },
				lesson: { id: 'first-steps/a', kind: 'code', moduleId: 'first-steps' },
				hour: 12
			})
		);
		expect(result).toEqual(['first-level']);
	});

	it('ignores started lessons', () => {
		expect(
			evaluateBadges(ctx({ progress: { 'first-steps/a': { status: 'started', hintsUsed: 0 } } }))
		).toEqual([]);
	});

	it('awards first-loop and first-choice by module', () => {
		const result = evaluateBadges(
			ctx({ progress: { 'doing-it-again/c': done(), 'making-choices/a': done() } })
		);
		expect(result).toContain('first-loop');
		expect(result).toContain('first-choice');
		expect(result).toContain('module-making-choices');
		expect(result).not.toContain('first-function');
	});

	it('awards bug-squasher after three fixes', () => {
		const two = { 'first-steps/b': done(), 'doing-it-again/a': done() };
		expect(evaluateBadges(ctx({ progress: two }))).not.toContain('bug-squasher');
		expect(evaluateBadges(ctx({ progress: { ...two, 'doing-it-again/b': done() } }))).toContain(
			'bug-squasher'
		);
	});

	it('awards no-hints-5 after five hint-free levels', () => {
		const progress = {
			'first-steps/a': done(0),
			'first-steps/b': done(0),
			'first-steps/c': done(0),
			'doing-it-again/a': done(0),
			'doing-it-again/b': done(2)
		};
		expect(evaluateBadges(ctx({ progress }))).not.toContain('no-hints-5');
		expect(
			evaluateBadges(ctx({ progress: { ...progress, 'doing-it-again/c': done(0) } }))
		).toContain('no-hints-5');
	});

	it('awards streak badges', () => {
		expect(evaluateBadges(ctx({ streak: 3 }))).toEqual(['streak-3']);
		expect(evaluateBadges(ctx({ streak: 7 }))).toEqual(['streak-3', 'streak-7']);
	});

	it('awards time-of-day badges only for a live completion', () => {
		const lesson = { id: 'first-steps/a', kind: 'code' as const, moduleId: 'first-steps' };
		const progress = { 'first-steps/a': done() };
		expect(evaluateBadges(ctx({ progress, lesson, hour: 2 }))).toContain('night-owl');
		expect(evaluateBadges(ctx({ progress, lesson, hour: 4 }))).not.toContain('night-owl');
		expect(evaluateBadges(ctx({ progress, lesson, hour: 6 }))).toContain('early-bird');
		expect(evaluateBadges(ctx({ progress, lesson, hour: 7 }))).not.toContain('early-bird');
		expect(evaluateBadges(ctx({ progress, lesson: null, hour: 2 }))).not.toContain('night-owl');
	});

	it('awards halfway, module and all-done', () => {
		const all = Object.fromEntries(
			modules.flatMap((m) => m.lessons.map((l) => [l.id, done()] as const))
		);
		const half = Object.fromEntries(Object.entries(all).slice(0, 4));
		expect(evaluateBadges(ctx({ progress: half }))).toContain('halfway');
		expect(evaluateBadges(ctx({ progress: half }))).not.toContain('all-done');
		const result = evaluateBadges(ctx({ progress: all }));
		expect(result).toEqual(
			expect.arrayContaining([
				'halfway',
				'all-done',
				'module-first-steps',
				'module-doing-it-again',
				'module-making-choices'
			])
		);
		expect(result).not.toContain('module-later');
	});

	it('never returns badges already earned', () => {
		const result = evaluateBadges(
			ctx({ progress: { 'first-steps/a': done() }, streak: 3, earned: ['first-level'] })
		);
		expect(result).toEqual(['streak-3']);
	});
});
