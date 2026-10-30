import { describe, expect, it } from 'vitest';
import {
	backupFileName,
	makeBackup,
	MAX_CODE_LENGTH,
	mergeProgress,
	parseBackup,
	type DeviceProgress
} from './backup.ts';

const known = (id: string) => id.startsWith('m/');
const now = new Date('2026-10-30T12:00:00Z');

const progress: DeviceProgress = {
	themeId: 'space',
	xp: 120,
	entries: {
		'm/one': {
			code: 'move();',
			hintsUsed: 1,
			attempts: 2,
			completedAt: '2026-10-01T10:00:00.000Z'
		},
		'm/two': { code: 'tur', hintsUsed: 0, attempts: 0, completedAt: null }
	}
};

describe('backup files', () => {
	it('round-trips the guest store shape', () => {
		const file = JSON.stringify(makeBackup(progress, 'Hatch', now));
		const parsed = parseBackup(file, known, now);
		expect(parsed).toEqual({ ok: true, progress, skipped: 0 });
	});

	it('names the file after the app and the local date', () => {
		expect(backupFileName('Hatch', new Date(2026, 0, 5))).toBe('hatch-progress-2026-01-05.json');
	});

	it('rejects files that are not backups', () => {
		expect(parseBackup('not json', known, now).ok).toBe(false);
		expect(parseBackup('[1,2]', known, now).ok).toBe(false);
		expect(parseBackup('{"hello":1}', known, now).ok).toBe(false);
		expect(parseBackup('{"entries":{}}', known, now).ok).toBe(false);
	});

	it('applies the server import rules entry by entry', () => {
		const file = JSON.stringify({
			xp: 50.7,
			themeId: 'not-a-vibe',
			entries: {
				'm/ok': { code: 'x', hintsUsed: 0, attempts: 1, completedAt: '2026-10-02T00:00:00Z' },
				'other/unknown': { code: 'x', completedAt: '2026-10-02T00:00:00Z' },
				'm/bad-hints': { hintsUsed: -1, completedAt: null },
				'm/bad-attempts': { attempts: 1.5, completedAt: null },
				'm/bad-date-type': { completedAt: 12 },
				'm/future': { completedAt: '2099-01-01T00:00:00Z' },
				'm/huge-code': { code: 'x'.repeat(MAX_CODE_LENGTH + 1), completedAt: null }
			}
		});
		const parsed = parseBackup(file, known, now);
		if (!parsed.ok) throw new Error(parsed.error);
		expect(Object.keys(parsed.progress.entries).sort()).toEqual([
			'm/future',
			'm/huge-code',
			'm/ok'
		]);
		expect(parsed.skipped).toBe(4);
		expect(parsed.progress.xp).toBe(50);
		expect(parsed.progress.themeId).toBeNull();
		expect(parsed.progress.entries['m/ok'].completedAt).toBe('2026-10-02T00:00:00.000Z');
		// Dates in the future become "now", like on the server
		expect(parsed.progress.entries['m/future'].completedAt).toBe(now.toISOString());
		expect(parsed.progress.entries['m/huge-code'].code).toBe('');
	});

	it('accepts the import endpoint body shape', () => {
		const file = JSON.stringify({
			entries: [{ lessonId: 'm/one', code: 'a', hintsUsed: 0, attempts: 1, completedAt: null }]
		});
		const parsed = parseBackup(file, known, now);
		expect(parsed.ok && Object.keys(parsed.progress.entries)).toEqual(['m/one']);
	});

	it('says so when nothing in the file belongs to this app', () => {
		const parsed = parseBackup(
			JSON.stringify({ entries: { 'x/y': { completedAt: null } } }),
			known,
			now
		);
		expect(parsed.ok).toBe(false);
	});
});

describe('mergeProgress', () => {
	it('never turns a finished level back into a draft and keeps the higher XP', () => {
		const incoming: DeviceProgress = {
			themeId: 'food',
			xp: 40,
			entries: {
				'm/one': { code: 'other', hintsUsed: 0, attempts: 5, completedAt: null },
				'm/two': { code: 'done!', hintsUsed: 0, attempts: 1, completedAt: '2026-10-03T00:00:00Z' },
				'm/three': { code: 'new', hintsUsed: 2, attempts: 3, completedAt: '2026-10-04T00:00:00Z' }
			}
		};
		const { progress: merged, newlyDone } = mergeProgress(progress, incoming);
		expect(newlyDone).toBe(2);
		expect(merged.xp).toBe(120);
		expect(merged.themeId).toBe('space');
		expect(merged.entries['m/one']).toEqual({
			...progress.entries['m/one'],
			attempts: 5
		});
		expect(merged.entries['m/two'].completedAt).toBe('2026-10-03T00:00:00Z');
		expect(merged.entries['m/three'].code).toBe('new');
	});

	it('keeps the earliest finish date when both sides finished a level', () => {
		const incoming: DeviceProgress = {
			themeId: null,
			xp: 500,
			entries: {
				'm/one': { code: 'x', hintsUsed: 0, attempts: 1, completedAt: '2026-09-01T00:00:00.000Z' }
			}
		};
		const { progress: merged, newlyDone } = mergeProgress(progress, incoming);
		expect(newlyDone).toBe(0);
		expect(merged.entries['m/one'].completedAt).toBe('2026-09-01T00:00:00.000Z');
		expect(merged.entries['m/one'].code).toBe('move();');
		expect(merged.xp).toBe(500);
	});
});
