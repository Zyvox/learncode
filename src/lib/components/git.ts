/**
 * Pure helpers for the git world picture (GitWorld.svelte): file statuses from a GitResult,
 * a small lane layout for the commit graph, and the light "what did that command just do"
 * guesses used while the terminal replays (the final picture always comes from the result).
 */
import type { GitCommit, GitResult } from '#lib/engine/types.ts';
import { tokenize } from '#lib/engine/shell.ts';

export type FileStatus = 'untracked' | 'modified' | 'staged' | 'committed' | 'conflict' | 'deleted';

export interface FileRow {
	path: string;
	status: FileStatus;
	content?: string;
}

export const STATUS_LABEL: Record<FileStatus, string> = {
	untracked: 'new, not tracked yet',
	modified: 'changed',
	staged: 'staged for the next commit',
	committed: 'saved in a commit',
	conflict: 'needs fixing',
	deleted: 'deleted'
};

const hasConflict = (text: string | undefined) => !!text && /^<{7}( |$)/m.test(text);

/** The file list as the final result sees it. */
export function filesOf(git: Pick<GitResult, 'files' | 'staged' | 'modified' | 'untracked'>): FileRow[] {
	const staged = new Set(git.staged ?? []);
	const modified = new Set(git.modified ?? []);
	const untracked = new Set(git.untracked ?? []);
	const rows: FileRow[] = [];
	for (const [path, content] of Object.entries(git.files ?? {})) {
		const status: FileStatus = hasConflict(content)
			? 'conflict'
			: modified.has(path)
				? 'modified'
				: staged.has(path)
					? 'staged'
					: untracked.has(path)
						? 'untracked'
						: 'committed';
		rows.push({ path, status, content });
	}
	// Staged deletions: in the staging list but gone from the folder.
	for (const path of staged) {
		if (!(path in (git.files ?? {}))) rows.push({ path, status: 'deleted' });
	}
	for (const path of modified) {
		if (!(path in (git.files ?? {})) && !staged.has(path)) rows.push({ path, status: 'deleted' });
	}
	return rows.sort((a, b) => a.path.localeCompare(b.path));
}

/* ------------------------------------------------------------------------------------------ */
/* Commit graph                                                                                */
/* ------------------------------------------------------------------------------------------ */

export interface GraphRow {
	commit: GitCommit;
	lane: number;
	row: number;
	merge: boolean;
}

export interface GraphEdge {
	from: { lane: number; row: number };
	to: { lane: number; row: number };
}

export interface Graph {
	rows: GraphRow[];
	edges: GraphEdge[];
	lanes: number;
	/** Older commits left out to keep it readable */
	hidden: number;
}

/**
 * Lays out commits newest first, one row each, in lanes (columns). `commits` is in creation
 * order (oldest first), as the engine keeps them. At most `max` rows are drawn.
 */
export function layoutGraph(commits: readonly GitCommit[], max = 15): Graph {
	const newestFirst = [...commits].reverse();
	const shown = newestFirst.slice(0, max);
	const hidden = newestFirst.length - shown.length;
	const rowOf = new Map(shown.map((c, i) => [c.id, i]));
	/** lanes[i] = the commit id this lane is waiting for (going down) */
	const lanes: (string | null)[] = [];
	const laneOf = new Map<string, number>();
	const rows: GraphRow[] = [];

	const claim = (id: string): number => {
		const free = lanes.indexOf(null);
		const i = free === -1 ? lanes.length : free;
		lanes[i] = id;
		return i;
	};

	shown.forEach((c, row) => {
		let lane = lanes.indexOf(c.id);
		if (lane === -1) lane = claim(c.id);
		// Other lanes that were also waiting for this commit end here.
		for (let i = 0; i < lanes.length; i++) if (i !== lane && lanes[i] === c.id) lanes[i] = null;
		laneOf.set(c.id, lane);
		const [first, ...others] = c.parents ?? [];
		lanes[lane] = first && rowOf.has(first) ? first : null;
		for (const p of others) {
			if (!rowOf.has(p) || lanes.includes(p)) continue;
			claim(p);
		}
		rows.push({ commit: c, lane, row, merge: (c.parents ?? []).length > 1 });
	});

	const edges: GraphEdge[] = [];
	for (const r of rows) {
		for (const p of r.commit.parents ?? []) {
			const prow = rowOf.get(p);
			if (prow === undefined) continue;
			edges.push({ from: { lane: r.lane, row: r.row }, to: { lane: laneOf.get(p)!, row: prow } });
		}
	}
	const laneCount = Math.max(1, ...rows.map((r) => r.lane + 1));
	return { rows, edges, lanes: laneCount, hidden };
}

/* ------------------------------------------------------------------------------------------ */
/* In-between guesses while the terminal replays                                               */
/* ------------------------------------------------------------------------------------------ */

export interface LiveState {
	initialized: boolean;
	files: Map<string, FileStatus>;
	branches: Record<string, string>;
	head: { branch: string | null; commit: string | null };
}

/** Does this (successful) command create a commit? */
export function makesCommit(cmd: string, output: string, ok: boolean): boolean {
	if (!ok) return false;
	const { args } = tokenize(cmd);
	if (args[0] !== 'git') return false;
	if (args[1] === 'commit') return !/nothing to commit|nothing added/i.test(output);
	if (args[1] === 'merge')
		return !/fast[- ]forward|already up[- ]to[- ]date|conflict/i.test(output) && !!output;
	return false;
}

/**
 * Applies one command to the live picture. Only file statuses, branches and HEAD; new commits
 * are revealed by the caller from the final result. Unknown commands do nothing, and failed
 * ones too, except a merge that stopped on a conflict (its files need fixing).
 */
export function applyCommand(
	state: LiveState,
	cmd: string,
	output: string,
	newCommit?: string,
	ok = true
) {
	const { args, redirect } = tokenize(cmd);
	if (!ok) {
		if (args[0] === 'git' && args[1] === 'merge') markConflicts(state, output);
		return;
	}
	const tracked = (s: FileStatus | undefined) => !!s && s !== 'untracked';
	const touch = (path: string) => {
		const cur = state.files.get(path);
		if (cur === undefined) state.files.set(path, 'untracked');
		else if (cur === 'committed' || cur === 'staged') state.files.set(path, 'modified');
	};
	if (redirect) {
		touch(redirect.target);
		return;
	}
	const [cmd0, sub, ...rest] = args;
	if (cmd0 === 'touch') {
		for (const p of [sub, ...rest]) if (p && !state.files.has(p)) state.files.set(p, 'untracked');
		return;
	}
	if (cmd0 === 'rm') {
		for (const p of [sub, ...rest]) if (p && !p.startsWith('-')) state.files.delete(p);
		return;
	}
	if (cmd0 !== 'git') return;
	const names = rest.filter((a) => !a.startsWith('-'));
	switch (sub) {
		case 'init':
			state.initialized = true;
			if (!state.head.branch) state.head = { branch: 'main', commit: null };
			break;
		case 'add': {
			const all = names.includes('.') || rest.includes('-A') || rest.includes('--all');
			for (const [path, s] of state.files) {
				if ((all || names.includes(path)) && s !== 'committed') state.files.set(path, 'staged');
			}
			break;
		}
		case 'rm':
			for (const p of names) state.files.delete(p);
			break;
		case 'restore':
			for (const p of names) {
				const s = state.files.get(p);
				if (s === 'modified' || (s === 'staged' && rest.includes('--staged')))
					state.files.set(p, rest.includes('--staged') ? 'modified' : 'committed');
			}
			break;
		case 'commit':
			if (newCommit) {
				for (const [path, s] of state.files) if (s === 'staged') state.files.set(path, 'committed');
				if (rest.includes('-a') || rest.includes('-am')) {
					for (const [path, s] of state.files) if (tracked(s)) state.files.set(path, 'committed');
				}
				moveHead(state, newCommit);
			}
			break;
		case 'branch':
			if (names[0] && state.head.commit) state.branches[names[0]] = state.head.commit;
			break;
		case 'switch':
		case 'checkout': {
			const create = rest.includes('-c') || rest.includes('-b');
			const name = names[0];
			if (!name) break;
			if (create) {
				if (state.head.commit) state.branches[name] = state.head.commit;
				state.head = { branch: name, commit: state.head.commit };
			} else if (name in state.branches) {
				state.head = { branch: name, commit: state.branches[name] };
			}
			break;
		}
		case 'merge': {
			const other = names[0];
			if (newCommit) moveHead(state, newCommit);
			else if (other && /fast[- ]forward/i.test(output) && state.branches[other]) {
				moveHead(state, state.branches[other]);
			}
			markConflicts(state, output);
			break;
		}
	}
}

/** "CONFLICT (content): Merge conflict in story.md" → story.md needs fixing. */
function markConflicts(state: LiveState, output: string) {
	for (const m of output.matchAll(/CONFLICT \([^)]*\): (?:Merge conflict in (\S+)|(\S+) was deleted)/g)) {
		const p = m[1] ?? m[2];
		if (p) state.files.set(p, 'conflict');
	}
}

function moveHead(state: LiveState, commit: string) {
	state.head = { branch: state.head.branch, commit };
	if (state.head.branch) state.branches[state.head.branch] = commit;
}

export function liveFromResult(git: GitResult | undefined, files?: Record<string, string>): LiveState {
	if (!git) {
		return {
			initialized: false,
			files: new Map(Object.keys(files ?? {}).map((p) => [p, 'untracked' as FileStatus])),
			branches: {},
			head: { branch: null, commit: null }
		};
	}
	return {
		initialized: !!git.initialized,
		files: new Map(filesOf(git).map((r) => [r.path, r.status])),
		branches: { ...(git.branches ?? {}) },
		head: { ...(git.head ?? { branch: null, commit: null }) }
	};
}
