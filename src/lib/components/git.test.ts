import { describe, expect, it } from 'vitest';
import type { GitCommit } from '#lib/engine/types.ts';
import { applyCommand, filesOf, layoutGraph, liveFromResult, makesCommit } from './git.ts';

const commit = (id: string, parents: string[], message = id): GitCommit => ({
	id,
	parents,
	message,
	author: 'you',
	files: {}
});

describe('filesOf', () => {
	it('gives each file one status', () => {
		const rows = filesOf({
			files: { 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c', 'd.txt': 'd', 'e.txt': '<<<<<<< HEAD\nx' },
			staged: ['b.txt', 'gone.txt'],
			modified: ['c.txt'],
			untracked: ['d.txt']
		});
		const by = Object.fromEntries(rows.map((r) => [r.path, r.status]));
		expect(by).toEqual({
			'a.txt': 'committed',
			'b.txt': 'staged',
			'c.txt': 'modified',
			'd.txt': 'untracked',
			'e.txt': 'conflict',
			'gone.txt': 'deleted'
		});
	});
});

describe('layoutGraph', () => {
	it('draws a straight line for a simple history, newest first', () => {
		const g = layoutGraph([commit('a', []), commit('b', ['a']), commit('c', ['b'])]);
		expect(g.rows.map((r) => r.commit.id)).toEqual(['c', 'b', 'a']);
		expect(g.rows.every((r) => r.lane === 0)).toBe(true);
		expect(g.edges).toHaveLength(2);
		expect(g.lanes).toBe(1);
	});

	it('gives a merged branch its own lane and the merge two parents', () => {
		const g = layoutGraph([
			commit('a', []),
			commit('b', ['a']),
			commit('f', ['a']),
			commit('m', ['b', 'f'])
		]);
		const lane = (id: string) => g.rows.find((r) => r.commit.id === id)!.lane;
		expect(g.rows[0].merge).toBe(true);
		expect(lane('m')).toBe(0);
		expect(lane('b')).toBe(0);
		expect(lane('f')).toBe(1);
		expect(lane('a')).toBe(0);
		expect(g.edges.filter((e) => e.from.row === 0)).toHaveLength(2);
	});

	it('keeps it readable: at most `max` rows', () => {
		const list: GitCommit[] = [];
		for (let i = 0; i < 20; i++) list.push(commit(`c${i}`, i ? [`c${i - 1}`] : []));
		const g = layoutGraph(list, 15);
		expect(g.rows).toHaveLength(15);
		expect(g.hidden).toBe(5);
	});
});

describe('live guesses', () => {
	it('follows a first commit', () => {
		const s = liveFromResult(undefined, { 'notes.txt': 'hi' });
		applyCommand(s, 'git init', 'Initialized empty Git repository');
		expect(s.initialized).toBe(true);
		applyCommand(s, 'echo "hello" > story.md', '');
		expect(s.files.get('story.md')).toBe('untracked');
		applyCommand(s, 'git add .', '');
		expect(s.files.get('story.md')).toBe('staged');
		expect(s.files.get('notes.txt')).toBe('staged');
		const out = '[main (root-commit) 1a2b3c4] first';
		expect(makesCommit('git commit -m "first"', out, true)).toBe(true);
		applyCommand(s, 'git commit -m "first"', out, '1a2b3c4');
		expect(s.files.get('story.md')).toBe('committed');
		expect(s.branches.main).toBe('1a2b3c4');
		applyCommand(s, 'echo "more" >> story.md', '');
		expect(s.files.get('story.md')).toBe('modified');
	});

	it('knows which merges make a commit and marks conflicts', () => {
		expect(makesCommit('git merge comments', 'Updating a..b\nFast-forward', true)).toBe(false);
		expect(makesCommit('git merge comments', "Merge made: [main abc] Merge branch 'x'", true)).toBe(
			true
		);
		expect(makesCommit('git commit -m "x"', 'nothing to commit', false)).toBe(false);
		const s = liveFromResult(undefined, { 'story.md': 'x' });
		applyCommand(
			s,
			'git merge ending',
			'CONFLICT (content): Merge conflict in story.md\nAutomatic merge failed',
			undefined,
			false
		);
		expect(s.files.get('story.md')).toBe('conflict');
	});

	it('tracks branches and HEAD', () => {
		const s = liveFromResult(undefined);
		applyCommand(s, 'git init', '');
		applyCommand(s, 'git commit -m "a"', '[main (root-commit) aaa] a', 'aaa');
		applyCommand(s, 'git switch -c comments', '');
		expect(s.head).toEqual({ branch: 'comments', commit: 'aaa' });
		applyCommand(s, 'git commit -m "b"', '[comments bbb] b', 'bbb');
		expect(s.branches).toEqual({ main: 'aaa', comments: 'bbb' });
		applyCommand(s, 'git switch main', '');
		applyCommand(s, 'git merge comments', 'Updating aaa..bbb\nFast-forward');
		expect(s.branches.main).toBe('bbb');
	});
});
