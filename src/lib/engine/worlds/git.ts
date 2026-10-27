/**
 * The git world: a working folder, a staging area (the index) and a history of commits, driven
 * by a tiny shell. Like the web world's sql role, it runs the learner's source itself
 * (`executeSource`): one command per line, top to bottom. A command that fails prints a message
 * and the run carries on, the way a terminal does; the checks judge the end state.
 * Pure TS — runs in the worker, in Node tests and on the main thread.
 */
import type { Check, GitWorldSpec, ThemedText } from '#lib/curriculum/types.ts';
import { CommandError, SpecError, createBase, type World } from '../core.ts';
import { closestName } from '../errors.ts';
import { splitLines, tokenize } from '../shell.ts';
import type { GitCommit, GitResult } from '../types.ts';

export const GIT_MAX_STEPS = 300;
/** Where the learner "is". `pwd` prints it. */
export const FOLDER = '/inkwell';
export const DEFAULT_BRANCH = 'main';
export const DEFAULT_AUTHOR = 'you';

export const GIT_TOO_MANY_STEPS: ThemedText = `That's more than ${GIT_MAX_STEPS} commands in one go, so the shell stopped here. A level never needs that many.`;
export const NO_COMMANDS: ThemedText =
	'There are no commands to run yet. Type one per line, like `git status`.';
export const NOT_A_REPO = 'fatal: not a git repository (did you run `git init`?)';
export const CONFLICT_MARKER = '<<<<<<<';

/** Shell commands this little shell knows (besides git's own subcommands). */
export const SHELL_COMMANDS = ['git', 'echo', 'cat', 'ls', 'touch', 'rm', 'pwd'];
/** git subcommands that work here. */
export const GIT_SUBCOMMANDS = [
	'init',
	'status',
	'add',
	'commit',
	'log',
	'branch',
	'switch',
	'checkout',
	'merge',
	'diff',
	'restore',
	'rm'
];

const tick = (s: string) => '`' + s + '`';
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

type Files = Record<string, string>;

/**
 * A path -> content map without a prototype, so a file or branch called `constructor` or
 * `__proto__` is just a name.
 */
function dict(from?: Files): Files {
	return Object.assign(Object.create(null) as Files, from);
}

const MISSING_MESSAGE = 'please give the commit a message: git commit -m "what changed"';

const EDITORS = ['nano', 'vim', 'vi', 'emacs', 'code', 'notepad', 'edit'];

/** Real git commands this shell doesn't have (they get "real, but not here", not "did you mean"). */
const KNOWN_ELSEWHERE = [
	'stash',
	'rebase',
	'reset',
	'revert',
	'show',
	'tag',
	'cherry-pick',
	'mv',
	'blame',
	'config',
	'clean',
	'reflog',
	'bisect',
	'grep',
	'worktree',
	'submodule'
];

export interface MergeState {
	/** What the learner typed after `git merge` */
	branch: string;
	/** The commit being merged in: the merge commit's second parent */
	commit: string;
	/** Files that still have conflict markers waiting for `git add` */
	conflicts: string[];
}

export interface GitState {
	/** The working folder: path -> content */
	files: Files;
	/** The staging area: the full snapshot the next commit will save (a missing path = staged deletion) */
	index: Files;
	commits: GitCommit[];
	/** branch name -> commit id (an unborn branch is not listed) */
	branches: Record<string, string>;
	head: { branch: string | null; commit: string | null };
	initialized: boolean;
	terminal: { cmd: string; output: string; ok: boolean }[];
	/** Set while a merge with conflicts waits to be finished */
	merging: MergeState | null;
	/** The branch before the last switch (`git switch -`) */
	previous: string | null;
}

export type GitWorld = Omit<World, 'finish' | 'executeSource'> & {
	kind: 'git';
	state: GitState;
	/** Runs the learner's script: one command per line. */
	executeSource(code: string): void;
	/** Runs one line without counting a step or tracing it (setup, tests). */
	run(line: string): { output: string; ok: boolean };
	finish(): { git: GitResult };
};

/** What a command produced: `out` is what it printed (stdout, may be redirected) or the error. */
interface Out {
	out: string;
	ok: boolean;
}

const done = (text = ''): Out => ({
	out: text === '' || text.endsWith('\n') ? text : text + '\n',
	ok: true
});
const fail = (text: string): Out => ({ out: text, ok: false });

// ---------------------------------------------------------------------------------------------
// Small helpers (exported for the checks and the tests)
// ---------------------------------------------------------------------------------------------

/** FNV-1a, 32 bits, as 8 hex digits. Deterministic, not cryptographic. */
function fnv(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

function stableFiles(files: Files): string {
	return JSON.stringify(
		Object.keys(files)
			.sort()
			.map((k) => [k, files[k]])
	);
}

/** Short commit id: 7 hex digits from the parents, message, snapshot and position in history. */
export function commitId(parents: string[], message: string, files: Files, seq: number): string {
	return fnv(`${parents.join(',')}\n${message}\n${stableFiles(files)}\n${seq}`).slice(0, 7);
}

/** Every commit reachable from `start` (itself included). */
export function ancestors(commits: GitCommit[], start: string | null | undefined): Set<string> {
	const byId = new Map(commits.map((c) => [c.id, c]));
	const seen = new Set<string>();
	const todo = start ? [start] : [];
	while (todo.length) {
		const id = todo.pop()!;
		if (seen.has(id)) continue;
		const c = byId.get(id);
		if (!c) continue;
		seen.add(id);
		todo.push(...c.parents);
	}
	return seen;
}

/** True when `ancestor` is `of` or is somewhere in its history. */
export function isAncestor(commits: GitCommit[], ancestor: string, of: string): boolean {
	return ancestors(commits, of).has(ancestor);
}

/** The snapshot HEAD points at (empty before the first commit). */
export function headFiles(git: GitResult): Files {
	const id = git.head.commit;
	return (id && git.commits.find((c) => c.id === id)?.files) || {};
}

/** Lines of a file for diffs and conflict markers (a final newline doesn't make an extra line). */
function linesOf(s: string | undefined): string[] {
	if (s === undefined || s === '') return [];
	return s.replace(/\n$/, '').split('\n');
}

function commonEnds(a: string[], b: string[]): [number, number] {
	let pre = 0;
	while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
	let suf = 0;
	while (
		suf < a.length - pre &&
		suf < b.length - pre &&
		a[a.length - 1 - suf] === b[b.length - 1 - suf]
	)
		suf++;
	return [pre, suf];
}

/**
 * The file as git leaves it after a conflict: the lines both sides agree on stay as they are,
 * the part where they differ is shown twice between markers.
 */
export function conflictText(ours: string, theirs: string, branch: string): string {
	const a = linesOf(ours);
	const b = linesOf(theirs);
	const [pre, suf] = commonEnds(a, b);
	const lines = [
		...a.slice(0, pre),
		'<<<<<<< HEAD',
		...a.slice(pre, a.length - suf),
		'=======',
		...b.slice(pre, b.length - suf),
		`>>>>>>> ${branch}`,
		...a.slice(a.length - suf)
	];
	return lines.join('\n') + '\n';
}

const DIFF_CONTEXT = 2;
const DIFF_MAX_LINES = 20;

/** A short, line-based diff of one file: context around the one changed stretch. */
export function diffText(
	path: string,
	before: string | undefined,
	after: string | undefined
): string {
	const a = linesOf(before);
	const b = linesOf(after);
	const [pre, suf] = commonEnds(a, b);
	const body = [
		...a.slice(Math.max(0, pre - DIFF_CONTEXT), pre).map((l) => ' ' + l),
		...a.slice(pre, a.length - suf).map((l) => '-' + l),
		...b.slice(pre, b.length - suf).map((l) => '+' + l),
		...a.slice(a.length - suf, a.length - suf + DIFF_CONTEXT).map((l) => ' ' + l)
	];
	const shown = body.slice(0, DIFF_MAX_LINES);
	if (body.length > DIFF_MAX_LINES) shown.push(`… ${body.length - DIFF_MAX_LINES} more lines`);
	return [
		before === undefined ? '--- /dev/null' : `--- a/${path}`,
		after === undefined ? '+++ /dev/null' : `+++ b/${path}`,
		...shown
	].join('\n');
}

function sorted(xs: Iterable<string>): string[] {
	return [...new Set(xs)].sort();
}

/** Cleans a path the learner typed: `./a.txt` and `/inkwell/a.txt` are `a.txt`. null = outside. */
function cleanPath(p: string): string | null {
	let s = p.trim();
	if (s === FOLDER) return '.';
	if (s.startsWith(FOLDER + '/')) s = s.slice(FOLDER.length + 1);
	while (s.startsWith('./')) s = s.slice(2);
	s = s.replace(/\/+$/, '');
	if (s === '' || s === '.') return '.';
	const parts = s.split('/');
	if (s.startsWith('/') || s.startsWith('~') || parts.includes('..')) return null;
	return s;
}

function validBranchName(name: string): boolean {
	return (
		/^[A-Za-z0-9._/-]+$/.test(name) &&
		!name.startsWith('-') &&
		!name.startsWith('/') &&
		!name.endsWith('/') &&
		!name.endsWith('.') &&
		!name.endsWith('.lock') &&
		!name.includes('..') &&
		!name.includes('//') &&
		name !== 'HEAD'
	);
}

function globRegExp(glob: string): RegExp {
	const src = glob
		.split('*')
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('[^/]*');
	return new RegExp(`^${src}$`);
}

const OUTSIDE = `This little shell only works inside ${FOLDER}, so paths outside it (or with ${tick('..')}) can't be used.`;

/** Real git commands that aren't part of this practice shell, with a word about why. */
const ELSEWHERE = ['push', 'pull', 'fetch', 'clone', 'remote'];

// ---------------------------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------------------------

export function validateGitSpec(spec: GitWorldSpec): void {
	if (!spec || spec.kind !== 'git') throw new SpecError('git world spec expected');
	if (spec.files !== undefined) {
		if (typeof spec.files !== 'object' || spec.files === null || Array.isArray(spec.files)) {
			throw new SpecError('files must be an object of path -> text');
		}
		for (const [path, text] of Object.entries(spec.files)) {
			if (typeof text !== 'string') throw new SpecError(`file ${path} must be text`);
			const clean = cleanPath(path);
			if (clean === null || clean === '.' || clean !== path) {
				throw new SpecError(`bad file path ${JSON.stringify(path)}`);
			}
		}
	}
	if (spec.setup !== undefined && typeof spec.setup !== 'string') {
		throw new SpecError('setup must be text (shell lines)');
	}
	if (spec.user !== undefined && typeof spec.user !== 'string') {
		throw new SpecError('user must be text');
	}
}

export function createGitWorld(spec: GitWorldSpec): GitWorld {
	validateGitSpec(spec);
	const base = createBase(GIT_MAX_STEPS, GIT_TOO_MANY_STEPS);
	const author = spec.user || DEFAULT_AUTHOR;
	const state: GitState = {
		files: dict(spec.files),
		index: dict(),
		commits: [],
		branches: dict(),
		head: { branch: null, commit: null },
		initialized: false,
		terminal: [],
		merging: null,
		previous: null
	};
	const byId = new Map<string, GitCommit>();
	const seqOf = new Map<string, number>();

	// ---- views --------------------------------------------------------------------------------

	const EMPTY = dict();
	const treeOf = (id: string | null | undefined): Files => (id && byId.get(id)?.files) || EMPTY;
	const headTree = () => treeOf(state.head.commit);
	const branchName = () => state.head.branch ?? DEFAULT_BRANCH;

	function stagedPaths(): string[] {
		const h = headTree();
		return sorted([...Object.keys(state.index), ...Object.keys(h)]).filter(
			(p) => state.index[p] !== h[p]
		);
	}
	function modifiedPaths(): string[] {
		return sorted(Object.keys(state.index)).filter((p) => state.files[p] !== state.index[p]);
	}
	function untrackedPaths(): string[] {
		return sorted(Object.keys(state.files)).filter((p) => !(p in state.index));
	}

	/** A branch name, `HEAD`, or the start of a commit id → commit id. */
	function resolve(ref: string): string | null {
		if (ref in state.branches) return state.branches[ref];
		if (ref === 'HEAD') return state.head.commit;
		if (/^[0-9a-f]{4,}$/.test(ref)) {
			const hits = state.commits.filter((c) => c.id.startsWith(ref));
			if (hits.length === 1) return hits[0].id;
		}
		return null;
	}

	function mergeBase(a: string, b: string): string | null {
		const left = ancestors(state.commits, a);
		let best: string | null = null;
		for (const id of ancestors(state.commits, b)) {
			if (left.has(id) && (best === null || seqOf.get(id)! > seqOf.get(best)!)) best = id;
		}
		return best;
	}

	function changedPaths(before: Files, after: Files): string[] {
		return sorted([...Object.keys(before), ...Object.keys(after)]).filter(
			(p) => before[p] !== after[p]
		);
	}

	const filesChanged = (n: number) => ` ${n} ${plural(n, 'file', 'files')} changed`;

	/** Paths in the folder or the index that a pathspec names (`.`, a file, a folder, `*.txt`). */
	function matchPaths(spec: string, pool: Iterable<string>): string[] | null {
		const clean = cleanPath(spec);
		if (clean === null) return null;
		const all = sorted(pool);
		if (clean === '.') return all;
		if (clean.includes('*')) {
			const re = globRegExp(clean);
			return all.filter((p) => re.test(p) || re.test(p.split('/').pop()!));
		}
		return all.filter((p) => p === clean || p.startsWith(clean + '/'));
	}

	// ---- moving HEAD ------------------------------------------------------------------------

	/**
	 * Makes the folder and the index match commit `target`, keeping local changes to files the
	 * move doesn't touch. Returns the files that block it (local changes would be lost).
	 */
	function moveTo(target: string | null | undefined): string[] {
		const h = headTree();
		const t = treeOf(target);
		const changed = changedPaths(h, t);
		const blocked = changed.filter((p) => state.index[p] !== h[p] || state.files[p] !== h[p]);
		if (blocked.length) return blocked;
		for (const p of changed) {
			if (t[p] === undefined) {
				delete state.files[p];
				delete state.index[p];
			} else {
				state.files[p] = t[p];
				state.index[p] = t[p];
			}
		}
		return [];
	}

	function blockedMessage(paths: string[], doing: string): string {
		return [
			`error: Your changes to these files would be lost by ${doing}:`,
			...paths.map((p) => `  ${p}`),
			`Save them first (${tick('git add')}, then ${tick('git commit')}), or throw them away (${tick(`git restore ${paths[0]}`)}). Then try again.`
		].join('\n');
	}

	const MID_MERGE = `error: You're in the middle of a merge. Fix the conflicts, then ${tick('git add')} and ${tick('git commit')} to finish it (or ${tick('git merge --abort')} to undo it).`;

	function switchTo(name: string): Out {
		if (state.merging) return fail(MID_MERGE);
		if (name === state.head.branch) return done(`Already on '${name}'`);
		if (!(name in state.branches)) return noSuchBranch(name, 'switch');
		const target = state.branches[name];
		const blocked = moveTo(target);
		if (blocked.length) return fail(blockedMessage(blocked, 'switching branches'));
		state.previous = state.head.branch;
		state.head = { branch: name, commit: target };
		return done(`Switched to branch '${name}'`);
	}

	function createAndSwitch(
		name: string | undefined,
		start: string | undefined,
		flag: string,
		cmd: string
	): Out {
		if (!name)
			return fail(
				`${tick(`git ${cmd} ${flag}`)} needs a name for the new branch: ${tick(`git ${cmd} ${flag} comments`)}`
			);
		const bad = newBranchProblem(name);
		if (bad) return bad;
		if (state.merging) return fail(MID_MERGE);
		if (start === undefined) {
			if (!state.head.commit) {
				// Nothing committed yet: the unborn branch just gets a new name.
				state.previous = state.head.branch;
				state.head.branch = name;
				return done(`Switched to a new branch '${name}'`);
			}
			state.branches[name] = state.head.commit;
			state.previous = state.head.branch;
			state.head = { branch: name, commit: state.head.commit };
			return done(`Switched to a new branch '${name}'`);
		}
		const id = resolve(start);
		if (!id) return fail(`fatal: '${start}' isn't a branch or a commit here.`);
		const blocked = moveTo(id);
		if (blocked.length) return fail(blockedMessage(blocked, 'switching branches'));
		state.branches[name] = id;
		state.previous = state.head.branch;
		state.head = { branch: name, commit: id };
		return done(`Switched to a new branch '${name}'`);
	}

	function newBranchProblem(name: string): Out | null {
		if (!validBranchName(name)) {
			return fail(
				`fatal: '${name}' is not a valid branch name. Use letters, numbers and dashes, like ${tick('new-comments')}.`
			);
		}
		if (name in state.branches) return fail(`fatal: a branch named '${name}' already exists`);
		return null;
	}

	function noSuchBranch(name: string, cmd: string): Out {
		const near = closestName(name, Object.keys(state.branches));
		const hint = near
			? ` Did you mean ${tick(near)}?`
			: ` To make it, use ${tick(cmd === 'checkout' ? `git checkout -b ${name}` : `git switch -c ${name}`)}.`;
		return fail(`fatal: there's no branch called '${name}'.${hint}`);
	}

	// ---- git subcommands --------------------------------------------------------------------

	function gitInit(args: string[]): Out {
		if (args.length)
			return fail(`${tick('git init')} works on its own, without anything after it.`);
		if (state.initialized) return done(`Reinitialized existing Git repository in ${FOLDER}/.git/`);
		state.initialized = true;
		state.head = { branch: DEFAULT_BRANCH, commit: null };
		return done(`Initialized empty Git repository in ${FOLDER}/.git/`);
	}

	function gitStatus(): Out {
		const lines = [`On branch ${branchName()}`];
		const m = state.merging;
		if (!state.head.commit) lines.push('', 'No commits yet');
		if (m) {
			lines.push(
				m.conflicts.length
					? `You have unmerged paths.\n  (fix the files, then ${tick('git add')} them and ${tick('git commit')})`
					: `All conflicts fixed but you are still merging.\n  (use ${tick('git commit')} to finish the merge)`
			);
		}
		const conflicts = m?.conflicts ?? [];
		const h = headTree();
		const staged = stagedPaths().filter((p) => !conflicts.includes(p));
		const modified = modifiedPaths().filter((p) => !conflicts.includes(p));
		const untracked = untrackedPaths().filter((p) => !conflicts.includes(p));
		const label = (l: string) => `  ${(l + ':').padEnd(12)}`;
		if (staged.length) {
			lines.push('', 'Changes to be committed:');
			for (const p of staged) {
				const what = !(p in h) ? 'new file' : !(p in state.index) ? 'deleted' : 'modified';
				lines.push(label(what) + p);
			}
		}
		if (conflicts.length) {
			lines.push('', 'Unmerged paths:');
			for (const p of conflicts) lines.push(`  both modified:   ${p}`);
		}
		if (modified.length) {
			lines.push('', 'Changes not staged for commit:');
			for (const p of modified) lines.push(label(p in state.files ? 'modified' : 'deleted') + p);
		}
		if (untracked.length) {
			lines.push('', 'Untracked files:');
			for (const p of untracked) lines.push(`  ${p}`);
		}
		if (!staged.length && !conflicts.length) {
			lines.push('');
			if (modified.length) lines.push(`no changes added to commit (use ${tick('git add')})`);
			else if (untracked.length)
				lines.push(
					`nothing added to commit but untracked files present (use ${tick('git add')} to track)`
				);
			else if (!m) lines.push('nothing to commit, working tree clean');
			else lines.pop();
		}
		return done(lines.join('\n'));
	}

	function stage(p: string): void {
		if (p in state.files) state.index[p] = state.files[p];
		else delete state.index[p];
	}

	function gitAdd(args: string[]): Out {
		if (args.length === 0) {
			return fail(
				`Nothing specified, nothing added.\nMaybe you wanted to say ${tick('git add .')}?`
			);
		}
		const pool = [...Object.keys(state.files), ...Object.keys(state.index)];
		const paths = new Set<string>();
		for (const a of args) {
			if (a === '-A' || a === '--all') {
				pool.forEach((p) => paths.add(p));
				continue;
			}
			if (a === '-u' || a === '--update') {
				Object.keys(state.index).forEach((p) => paths.add(p));
				continue;
			}
			if (a === '--') continue;
			if (a.startsWith('-')) {
				return fail(
					`${tick(`git add ${a}`)} isn't part of this little shell. Use ${tick('git add <file>')} or ${tick('git add .')}`
				);
			}
			const hit = matchPaths(a, pool);
			if (hit === null) return fail(OUTSIDE);
			if (hit.length === 0) return fail(`fatal: pathspec '${a}' did not match any files`);
			hit.forEach((p) => paths.add(p));
		}
		const notes: string[] = [];
		for (const p of sorted(paths)) {
			stage(p);
			if (state.merging?.conflicts.includes(p)) {
				state.merging.conflicts = state.merging.conflicts.filter((c) => c !== p);
				if (state.files[p]?.includes(CONFLICT_MARKER)) {
					notes.push(
						`heads up: ${p} still has conflict markers (${CONFLICT_MARKER}) in it. Edit them out before you commit.`
					);
				}
			}
		}
		return done(notes.join('\n'));
	}

	function gitCommit(args: string[]): Out {
		const messages: string[] = [];
		let all = false;
		const extra: string[] = [];
		for (let i = 0; i < args.length; i++) {
			const a = args[i];
			if (a === '-m' || a === '--message') {
				if (i + 1 >= args.length) return fail(MISSING_MESSAGE);
				messages.push(args[++i]);
			} else if (a.startsWith('--message=')) {
				messages.push(a.slice('--message='.length));
			} else if (a === '-a' || a === '--all') {
				all = true;
			} else if (/^-a*m/.test(a)) {
				// -am "msg", or the message glued on: -m"msg", -am"msg"
				const at = a.indexOf('m');
				if (at > 1) all = true;
				const rest = a.slice(at + 1);
				if (rest) messages.push(rest);
				else if (i + 1 >= args.length) return fail(MISSING_MESSAGE);
				else messages.push(args[++i]);
			} else if (a.startsWith('-')) {
				return fail(
					`${tick(`git commit ${a}`)} isn't part of this little shell. Use ${tick('git commit -m "what changed"')}`
				);
			} else {
				extra.push(a);
			}
		}
		if (extra.length && messages.length) {
			const words = [messages[messages.length - 1], ...extra].join(' ');
			return fail(
				`error: pathspec '${extra[0]}' did not match any file(s) known to git\nA message with spaces needs quotes around it: ${tick(`git commit -m "${words}"`)}`
			);
		}
		if (extra.length) return fail(MISSING_MESSAGE);

		if (all) for (const p of Object.keys(state.index)) stage(p);
		const m = state.merging;
		if (m?.conflicts.length) {
			return fail(
				`error: Committing is not possible because you have unmerged files:\n${m.conflicts.map((p) => `  ${p}`).join('\n')}\nFix each file, then ${tick(`git add ${m.conflicts[0]}`)} and commit.`
			);
		}
		if (messages.length === 0) {
			if (!m) return fail(MISSING_MESSAGE);
			messages.push(`Merge branch '${m.branch}'`);
		}
		const message = messages.join('\n\n');
		if (message.trim() === '') return fail('Aborting commit due to empty commit message.');
		if (!m && stagedPaths().length === 0) {
			if (modifiedPaths().length || untrackedPaths().length) {
				return fail(`nothing to commit (use ${tick('git add')} first)`);
			}
			return fail('nothing to commit, working tree clean');
		}
		const parents = state.head.commit ? [state.head.commit] : [];
		if (m) parents.push(m.commit);
		const before = headTree();
		const id = addCommit(parents, message, dict(state.index));
		const root = parents.length === 0 ? ' (root-commit)' : '';
		state.branches[branchName()] = id;
		state.head = { branch: branchName(), commit: id };
		state.merging = null;
		const n = changedPaths(before, state.index).length;
		const first = message.split('\n')[0];
		return done(`[${branchName()}${root} ${id}] ${first}` + (n ? '\n' + filesChanged(n) : ''));
	}

	function addCommit(parents: string[], message: string, files: Files): string {
		let seq = state.commits.length;
		let id = commitId(parents, message, files, seq);
		while (byId.has(id)) id = commitId(parents, message, files, ++seq + 1000);
		const c: GitCommit = { id, message, parents, author, files };
		state.commits.push(c);
		byId.set(id, c);
		seqOf.set(id, state.commits.length - 1);
		return id;
	}

	const MAX_LOG = 30;

	function gitLog(args: string[]): Out {
		let all = false;
		let limit = Infinity;
		const starts: string[] = [];
		for (let i = 0; i < args.length; i++) {
			const a = args[i];
			if (a === '--oneline' || a === '--graph' || a === '--decorate') continue;
			if (a === '--all') all = true;
			else if (a === '-n' && /^\d+$/.test(args[i + 1] ?? '')) limit = Number(args[++i]);
			else if (/^-\d+$/.test(a)) limit = Number(a.slice(1));
			else if (a.startsWith('-')) {
				return fail(
					`${tick(`git log ${a}`)} isn't part of this little shell. Try ${tick('git log')} or ${tick('git log --all')}.`
				);
			} else {
				const id = resolve(a);
				if (!id) return fail(`fatal: there's no branch or commit called '${a}'.`);
				starts.push(id);
			}
		}
		if (!state.head.commit && !all && !starts.length) {
			return fail(`fatal: your current branch '${branchName()}' does not have any commits yet`);
		}
		const from = all
			? [...Object.values(state.branches), state.head.commit]
			: starts.length
				? starts
				: [state.head.commit];
		const reach = new Set<string>();
		for (const id of from) for (const x of ancestors(state.commits, id)) reach.add(x);
		const list = state.commits.filter((c) => reach.has(c.id)).reverse();
		const shown = list.slice(0, Math.min(limit, MAX_LOG));
		const lines = shown.map((c) => {
			const names = Object.keys(state.branches)
				.filter((b) => state.branches[b] === c.id && b !== state.head.branch)
				.sort();
			if (c.id === state.head.commit) names.unshift(`HEAD -> ${branchName()}`);
			const deco = names.length ? ` (${names.join(', ')})` : '';
			return `${c.id}${deco} ${c.message.split('\n')[0]}`;
		});
		if (list.length > shown.length && limit === Infinity) {
			lines.push(`… and ${list.length - shown.length} older commits`);
		}
		return done(lines.join('\n'));
	}

	function gitBranch(args: string[]): Out {
		if (args[0] === '--show-current') return done(state.head.branch ?? '');
		if (args.length === 0 || args[0] === '--list' || args[0] === '-a' || args[0] === '-l') {
			const names = sorted(Object.keys(state.branches));
			return done(names.map((b) => (b === state.head.branch ? `* ${b}` : `  ${b}`)).join('\n'));
		}
		if (args[0] === '-d' || args[0] === '-D' || args[0] === '--delete') {
			const name = args[1];
			if (!name) return fail(`Which branch? ${tick('git branch -d comments')}`);
			if (!(name in state.branches)) return noSuchBranch(name, 'branch');
			if (name === state.head.branch) {
				return fail(
					`error: Cannot delete branch '${name}': you're on it. Switch to another branch first.`
				);
			}
			const tip = state.branches[name];
			if (
				args[0] !== '-D' &&
				!(state.head.commit && isAncestor(state.commits, tip, state.head.commit))
			) {
				return fail(
					`error: the branch '${name}' is not fully merged.\nIts commits would be lost. Merge it first, or use ${tick(`git branch -D ${name}`)} to delete it anyway.`
				);
			}
			delete state.branches[name];
			return done(`Deleted branch ${name} (was ${tip}).`);
		}
		if (args[0].startsWith('-')) {
			return fail(
				`${tick(`git branch ${args[0]}`)} isn't part of this little shell. Try ${tick('git branch')} or ${tick('git branch <name>')}.`
			);
		}
		if (args.length > 2)
			return fail(`A branch name can't have spaces. Try ${tick(`git branch ${args.join('-')}`)}.`);
		const [name, start] = args;
		const bad = newBranchProblem(name);
		if (bad) return bad;
		const id = start === undefined ? state.head.commit : resolve(start);
		if (!id) {
			if (start !== undefined) return fail(`fatal: '${start}' isn't a branch or a commit here.`);
			return fail(
				`fatal: not a valid object name: '${branchName()}'\nThere are no commits yet, so there's nothing for a branch to point at. Make a first commit, then branch.`
			);
		}
		state.branches[name] = id;
		return done();
	}

	function gitSwitch(args: string[]): Out {
		const a = args[0];
		if (a === undefined)
			return fail(
				`Which branch? ${tick('git switch main')}, or ${tick('git switch -c new-branch')} to make one.`
			);
		if (a === '-c' || a === '-C' || a === '--create')
			return createAndSwitch(args[1], args[2], a, 'switch');
		if (a === '-b') {
			return fail(
				`${tick('git switch')} uses ${tick('-c')} to make a new branch: ${tick(`git switch -c ${args[1] ?? 'comments'}`)}`
			);
		}
		if (a === '-') {
			if (!state.previous) return fail('fatal: there is no previous branch to go back to yet.');
			return switchTo(state.previous);
		}
		if (a.startsWith('-'))
			return fail(`${tick(`git switch ${a}`)} isn't part of this little shell.`);
		if (args.length > 1)
			return fail(`${tick('git switch')} takes one branch name. A branch name can't have spaces.`);
		if (!(a in state.branches)) {
			if (resolve(a)) return detachedNotHere(a);
			return noSuchBranch(a, 'switch');
		}
		return switchTo(a);
	}

	function detachedNotHere(ref: string): Out {
		return fail(
			`Visiting an old commit on its own isn't part of this little shell. Make a branch that starts there instead: ${tick(`git switch -c old-version ${ref}`)}`
		);
	}

	function gitCheckout(args: string[]): Out {
		const a = args[0];
		if (a === undefined) return fail(`Which branch? ${tick('git checkout main')}`);
		if (a === '-b' || a === '-B') return createAndSwitch(args[1], args[2], a, 'checkout');
		if (a === '-c')
			return fail(
				`${tick('git checkout')} uses ${tick('-b')} to make a new branch: ${tick(`git checkout -b ${args[1] ?? 'comments'}`)}`
			);
		if (a === '-') {
			if (!state.previous) return fail('fatal: there is no previous branch to go back to yet.');
			return switchTo(state.previous);
		}
		if (a === '--') return restoreWorking(args.slice(1));
		if (a.startsWith('-'))
			return fail(`${tick(`git checkout ${a}`)} isn't part of this little shell.`);
		if (a in state.branches && args.length === 1) return switchTo(a);
		// `git checkout notes.txt`: the old way to throw away changes to a file
		const tracked = matchPaths(a, Object.keys(state.index));
		if (tracked && tracked.length) return restoreWorking(args);
		if (resolve(a)) return detachedNotHere(a);
		return noSuchBranch(a, 'checkout');
	}

	function gitMerge(args: string[]): Out {
		let ff = true;
		let message: string | undefined;
		const names: string[] = [];
		for (let i = 0; i < args.length; i++) {
			const a = args[i];
			if (a === '--abort') return mergeAbort();
			if (a === '--continue') return gitCommit([]);
			if (a === '--no-ff') ff = false;
			else if (a === '--ff') ff = true;
			else if (a === '-m') {
				if (i + 1 >= args.length) return fail(MISSING_MESSAGE);
				message = args[++i];
			} else if (a.startsWith('-')) {
				return fail(
					`${tick(`git merge ${a}`)} isn't part of this little shell. Use ${tick('git merge <branch>')}.`
				);
			} else names.push(a);
		}
		if (state.merging) return fail(MID_MERGE);
		if (names.length !== 1) {
			return fail(
				names.length === 0
					? `Which branch should come in? ${tick('git merge comments')} brings ${tick('comments')} into the branch you're on.`
					: `${tick('git merge')} takes one branch at a time here.`
			);
		}
		const name = names[0];
		const theirs = resolve(name);
		if (!theirs) {
			const near = closestName(name, Object.keys(state.branches));
			return fail(
				`merge: ${name} - not something we can merge` +
					(near ? `\nDid you mean ${tick(near)}?` : '')
			);
		}
		const ours = state.head.commit;
		if (!ours) {
			return fail(
				`There are no commits on '${branchName()}' yet, so there's nothing to merge into. Make a first commit first.`
			);
		}
		if (isAncestor(state.commits, theirs, ours)) return done('Already up to date.');

		if (stagedPaths().length || modifiedPaths().length) {
			return fail(blockedMessage(sorted([...stagedPaths(), ...modifiedPaths()]), 'merging'));
		}

		if (ff && isAncestor(state.commits, ours, theirs)) {
			const changed = changedPaths(headTree(), treeOf(theirs));
			const blocked = moveTo(theirs);
			if (blocked.length) return fail(blockedMessage(blocked, 'merging'));
			state.branches[branchName()] = theirs;
			state.head = { branch: branchName(), commit: theirs };
			return done(
				[
					`Updating ${ours}..${theirs}`,
					'Fast-forward',
					...changed.slice(0, 10).map((p) => ` ${p}`),
					filesChanged(changed.length)
				].join('\n')
			);
		}

		const b = treeOf(mergeBase(ours, theirs));
		const o = headTree();
		const t = treeOf(theirs);
		const result = dict();
		const conflicts: { path: string; kind: string }[] = [];
		const autoMerged: string[] = [];
		for (const p of sorted([...Object.keys(b), ...Object.keys(o), ...Object.keys(t)])) {
			if (o[p] === t[p] || t[p] === b[p]) {
				if (o[p] !== undefined) result[p] = o[p];
			} else if (o[p] === b[p]) {
				if (t[p] !== undefined) result[p] = t[p];
			} else {
				// Both sides changed it differently: the index keeps HEAD's version until `git add`.
				if (o[p] !== undefined) result[p] = o[p];
				if (o[p] !== undefined && t[p] !== undefined) {
					conflicts.push({ path: p, kind: b[p] === undefined ? 'add/add' : 'content' });
					autoMerged.push(p);
				} else {
					conflicts.push({ path: p, kind: 'modify/delete' });
				}
			}
		}
		// Untracked files that the merge would overwrite
		const clobbered = untrackedPaths().filter((p) => p in result && result[p] !== state.files[p]);
		if (clobbered.length) return fail(blockedMessage(clobbered, 'merging'));

		for (const p of changedPaths(o, result)) {
			if (result[p] === undefined) {
				delete state.files[p];
				delete state.index[p];
			} else {
				state.files[p] = result[p];
				state.index[p] = result[p];
			}
		}
		if (conflicts.length) {
			const lines = autoMerged.map((p) => `Auto-merging ${p}`);
			for (const { path: p, kind } of conflicts) {
				if (kind === 'modify/delete') {
					// keep whichever side still has the file; the learner decides
					const kept = o[p] ?? t[p]!;
					state.files[p] = kept;
					lines.push(
						`CONFLICT (modify/delete): ${p} was deleted on one branch and changed on the other.`
					);
				} else {
					state.files[p] = conflictText(o[p]!, t[p]!, name);
					lines.push(`CONFLICT (${kind}): Merge conflict in ${p}`);
				}
			}
			const first = conflicts[0].path;
			lines.push(
				`Automatic merge failed: fix the ${plural(conflicts.length, 'file', 'files')}, then ${tick(`git add ${first}`)} and ${tick('git commit -m "…"')}`
			);
			state.merging = { branch: name, commit: theirs, conflicts: conflicts.map((c) => c.path) };
			return fail(lines.join('\n'));
		}

		const before = o;
		const id = addCommit([ours, theirs], message ?? `Merge branch '${name}'`, dict(state.index));
		state.branches[branchName()] = id;
		state.head = { branch: branchName(), commit: id };
		const n = changedPaths(before, state.index).length;
		return done(
			[
				...autoMerged.map((p) => `Auto-merging ${p}`),
				`Merge made: [${branchName()} ${id}] ${message ?? `Merge branch '${name}'`}`,
				...(n ? [filesChanged(n)] : [])
			].join('\n')
		);
	}

	function mergeAbort(): Out {
		if (!state.merging) return fail('fatal: There is no merge to abort.');
		const h = headTree();
		for (const p of sorted([...Object.keys(state.index), ...Object.keys(h)])) {
			if (h[p] === undefined) {
				delete state.index[p];
				delete state.files[p];
			} else {
				state.index[p] = h[p];
				state.files[p] = h[p];
			}
		}
		state.merging = null;
		return done();
	}

	function gitDiff(args: string[]): Out {
		let staged = false;
		const specs: string[] = [];
		for (const a of args) {
			if (a === '--staged' || a === '--cached') staged = true;
			else if (a === '--') continue;
			else if (a.startsWith('-'))
				return fail(
					`${tick(`git diff ${a}`)} isn't part of this little shell. Try ${tick('git diff')} or ${tick('git diff --staged')}.`
				);
			else specs.push(a);
		}
		const h = headTree();
		const [from, to] = staged ? [h, state.index] : [state.index, state.files];
		let paths = staged ? stagedPaths() : modifiedPaths();
		if (specs.length) {
			const wanted = new Set<string>();
			for (const s of specs) {
				const hit = matchPaths(s, [
					...Object.keys(state.files),
					...Object.keys(state.index),
					...Object.keys(h)
				]);
				if (hit === null) return fail(OUTSIDE);
				if (hit.length === 0) {
					if (s in state.branches) {
						return fail(
							`Comparing with a branch isn't part of this little shell. ${tick('git diff')} shows what changed since your last ${tick('git add')}.`
						);
					}
					return fail(`fatal: there's no file called '${s}' here.`);
				}
				hit.forEach((p) => wanted.add(p));
			}
			paths = paths.filter((p) => wanted.has(p));
		}
		return done(paths.map((p) => diffText(p, from[p], to[p])).join('\n'));
	}

	function restoreWorking(specs: string[]): Out {
		if (specs.length === 0) return fail(`Which file? ${tick('git restore notes.txt')}`);
		const paths = new Set<string>();
		for (const s of specs) {
			const hit = matchPaths(s, Object.keys(state.index));
			if (hit === null) return fail(OUTSIDE);
			if (hit.length === 0) {
				return fail(
					s in state.files
						? `error: '${s}' isn't tracked by git yet, so there's no saved version to go back to.`
						: `error: pathspec '${s}' did not match any file(s) known to git`
				);
			}
			hit.forEach((p) => paths.add(p));
		}
		for (const p of paths) state.files[p] = state.index[p];
		return done();
	}

	function gitRestore(args: string[]): Out {
		let staged = false;
		let worktree = false;
		const specs: string[] = [];
		for (const a of args) {
			if (a === '--staged' || a === '-S') staged = true;
			else if (a === '--worktree' || a === '-W') worktree = true;
			else if (a === '--') continue;
			else if (a.startsWith('-'))
				return fail(`${tick(`git restore ${a}`)} isn't part of this little shell.`);
			else specs.push(a);
		}
		if (!staged) return restoreWorking(specs);
		if (specs.length === 0) return fail(`Which file? ${tick('git restore --staged notes.txt')}`);
		const h = headTree();
		const paths = new Set<string>();
		for (const s of specs) {
			const hit = matchPaths(s, [...Object.keys(state.index), ...Object.keys(h)]);
			if (hit === null) return fail(OUTSIDE);
			if (hit.length === 0)
				return fail(`error: pathspec '${s}' did not match any file(s) known to git`);
			hit.forEach((p) => paths.add(p));
		}
		for (const p of paths) {
			if (h[p] === undefined) delete state.index[p];
			else state.index[p] = h[p];
			if (worktree) {
				if (h[p] === undefined) delete state.files[p];
				else state.files[p] = h[p];
			}
		}
		return done();
	}

	function gitRm(args: string[]): Out {
		let cached = false;
		const specs: string[] = [];
		for (const a of args) {
			if (a === '--cached') cached = true;
			else if (a === '-r' || a === '-f' || a === '-rf' || a === '-fr' || a === '--') continue;
			else if (a.startsWith('-'))
				return fail(`${tick(`git rm ${a}`)} isn't part of this little shell.`);
			else specs.push(a);
		}
		if (specs.length === 0) return fail(`Which file? ${tick('git rm notes.txt')}`);
		const paths = new Set<string>();
		for (const s of specs) {
			const hit = matchPaths(s, Object.keys(state.index));
			if (hit === null) return fail(OUTSIDE);
			if (hit.length === 0) return fail(`fatal: pathspec '${s}' did not match any files`);
			hit.forEach((p) => paths.add(p));
		}
		const lines: string[] = [];
		for (const p of sorted(paths)) {
			delete state.index[p];
			if (!cached) delete state.files[p];
			if (state.merging) state.merging.conflicts = state.merging.conflicts.filter((c) => c !== p);
			lines.push(`rm '${p}'`);
		}
		return done(lines.join('\n'));
	}

	const GIT: Record<string, (args: string[]) => Out> = {
		init: gitInit,
		status: () => gitStatus(),
		add: gitAdd,
		commit: gitCommit,
		log: gitLog,
		branch: gitBranch,
		switch: gitSwitch,
		checkout: gitCheckout,
		merge: gitMerge,
		diff: gitDiff,
		restore: gitRestore,
		rm: gitRm
	};

	function git(args: string[]): Out {
		const sub = args[0];
		if (sub === undefined || sub === 'help' || sub === '--help') {
			return done(`usage: git <command>\nThis little shell knows: ${GIT_SUBCOMMANDS.join(', ')}`);
		}
		if (sub === '--version' || sub === 'version') return done('git version 2 (practice edition)');
		const handler = GIT[sub];
		if (!handler) {
			if (ELSEWHERE.includes(sub)) {
				return fail(
					`${tick(`git ${sub}`)} talks to another copy of the repository, like one on GitHub. This practice folder has no other copy, so there's nowhere to ${sub === 'push' ? 'send' : 'get'} commits.`
				);
			}
			if (KNOWN_ELSEWHERE.includes(sub)) {
				return fail(
					`${tick(`git ${sub}`)} is a real git command, but this little shell doesn't have it. It knows: ${GIT_SUBCOMMANDS.join(', ')}.`
				);
			}
			const near = closestName(sub, GIT_SUBCOMMANDS);
			return fail(
				`git: '${sub}' is not a git command.` +
					(near
						? ` Did you mean ${tick(`git ${near}`)}?`
						: ` This little shell knows: ${GIT_SUBCOMMANDS.join(', ')}.`)
			);
		}
		if (!state.initialized && sub !== 'init') return fail(NOT_A_REPO);
		return handler(args.slice(1));
	}

	// ---- shell commands ---------------------------------------------------------------------

	function echo(args: string[]): Out {
		let newline = true;
		let escapes = false;
		while (args.length && /^-[neE]+$/.test(args[0])) {
			const flags = args.shift()!;
			if (flags.includes('n')) newline = false;
			if (flags.includes('e')) escapes = true;
		}
		let text = args.join(' ');
		if (escapes) text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
		return { out: newline ? text + '\n' : text, ok: true };
	}

	function cat(args: string[]): Out {
		if (args.length === 0)
			return fail(`${tick('cat')} needs a file name: ${tick('cat notes.txt')}`);
		let out = '';
		const errors: string[] = [];
		for (const a of args) {
			const p = cleanPath(a);
			if (p === null) errors.push(OUTSIDE);
			else if (p in state.files) out += state.files[p];
			else if (Object.keys(state.files).some((f) => f.startsWith(p + '/')) || p === '.')
				errors.push(`cat: ${a}: Is a folder (try ${tick(`ls ${a}`)})`);
			else errors.push(`cat: ${a}: No such file or directory`);
		}
		if (errors.length) return fail([out.replace(/\n$/, ''), ...errors].filter(Boolean).join('\n'));
		return { out, ok: true };
	}

	function ls(args: string[]): Out {
		let all = false;
		const targets: string[] = [];
		for (const a of args) {
			if (/^-[alhA1]+$/.test(a)) {
				if (/[aA]/.test(a)) all = true;
			} else if (a.startsWith('-'))
				return fail(
					`${tick(`ls ${a}`)} isn't part of this little shell. Plain ${tick('ls')} lists the files.`
				);
			else targets.push(a);
		}
		if (targets.length === 0) targets.push('.');
		const blocks: string[] = [];
		for (const a of targets) {
			const p = cleanPath(a);
			if (p === null) return fail(OUTSIDE);
			if (p !== '.' && p in state.files) {
				blocks.push(p);
				continue;
			}
			const prefix = p === '.' ? '' : p + '/';
			const entries = new Set<string>();
			for (const f of Object.keys(state.files)) {
				if (!f.startsWith(prefix)) continue;
				const rest = f.slice(prefix.length);
				const slash = rest.indexOf('/');
				entries.add(slash < 0 ? rest : rest.slice(0, slash + 1));
			}
			if (p !== '.' && entries.size === 0)
				return fail(`ls: cannot access '${a}': No such file or directory`);
			const names = sorted(entries);
			if (all && p === '.' && state.initialized) names.unshift('.git/');
			blocks.push(names.join('  '));
		}
		return done(blocks.filter(Boolean).join('\n'));
	}

	function touch(args: string[]): Out {
		if (args.length === 0)
			return fail(`${tick('touch')} needs a file name: ${tick('touch notes.txt')}`);
		for (const a of args) {
			const p = cleanPath(a);
			if (p === null || p === '.') return fail(OUTSIDE);
			if (!(p in state.files)) state.files[p] = '';
		}
		return done();
	}

	function rm(args: string[]): Out {
		let force = false;
		let recursive = false;
		const targets: string[] = [];
		for (const a of args) {
			if (/^-[rRf]+$/.test(a)) {
				if (a.includes('f')) force = true;
				if (/[rR]/.test(a)) recursive = true;
			} else targets.push(a);
		}
		if (targets.length === 0)
			return fail(`${tick('rm')} needs a file name: ${tick('rm notes.txt')}`);
		const errors: string[] = [];
		for (const a of targets) {
			if (a.replace(/\/+$/, '') === '.git' || a.startsWith('.git/')) {
				errors.push(`This little shell won't delete .git: that's where the whole history lives.`);
				continue;
			}
			const p = cleanPath(a);
			if (p === null || p === '.') {
				errors.push(OUTSIDE);
				continue;
			}
			if (p in state.files) {
				delete state.files[p];
				continue;
			}
			const inside = Object.keys(state.files).filter((f) => f.startsWith(p + '/'));
			if (inside.length && recursive) inside.forEach((f) => delete state.files[f]);
			else if (inside.length)
				errors.push(`rm: cannot remove '${a}': Is a folder (use ${tick(`rm -r ${a}`)})`);
			else if (!force) errors.push(`rm: cannot remove '${a}': No such file or directory`);
		}
		return errors.length ? fail(errors.join('\n')) : done();
	}

	const SHELL: Record<string, (args: string[]) => Out> = {
		git,
		echo,
		cat,
		ls,
		touch,
		rm,
		pwd: () => done(FOLDER),
		cd: (args) =>
			args.length === 0 || ['.', FOLDER, '~'].includes(args[0])
				? done()
				: fail(
						`There's only one folder here (${FOLDER}), so there's nowhere else to ${tick('cd')} to.`
					)
	};

	function unknownCommand(cmd: string): Out {
		if (GIT_SUBCOMMANDS.includes(cmd)) {
			return fail(
				`This little shell doesn't know ${tick(cmd)} on its own. Git commands start with ${tick('git')}: ${tick(`git ${cmd}`)}`
			);
		}
		if (EDITORS.includes(cmd)) {
			return fail(
				`There's no text editor in this little shell. Write a file with ${tick('echo "text" > notes.txt')}.`
			);
		}
		const near = closestName(cmd, SHELL_COMMANDS);
		return fail(
			`This little shell doesn't know ${tick(cmd)}.` +
				(near ? ` Did you mean ${tick(near)}?` : ` It knows: ${SHELL_COMMANDS.join(', ')}.`)
		);
	}

	/** Writes a command's output into a file (`>` replaces, `>>` adds to the end). */
	function redirectTo(op: '>' | '>>', target: string, text: string): Out | null {
		const p = cleanPath(target);
		if (p === null || p === '.') return fail(OUTSIDE);
		if (target.replace(/\/+$/, '') === '.git' || target.startsWith('.git/')) {
			return fail(`This little shell keeps .git for git itself. Write to a file of your own.`);
		}
		if (Object.keys(state.files).some((f) => f.startsWith(p + '/'))) {
			return fail(`'${target}' is a folder, so words can't go into it. Name a file inside it.`);
		}
		state.files[p] = op === '>>' ? (state.files[p] ?? '') + text : text;
		return null;
	}

	/** Runs one line. Never throws for learner mistakes. */
	function run(line: string): { output: string; ok: boolean } {
		const tokens = tokenize(line);
		if (tokens.error) return { output: tokens.error, ok: false };
		const [cmd, ...args] = tokens.args;
		if (cmd === undefined) {
			if (tokens.redirect)
				return {
					output: `${tick(tokens.redirect.op)} needs a command before it, like ${tick(`echo "hello" ${tokens.redirect.op} notes.txt`)}.`,
					ok: false
				};
			return { output: '', ok: true };
		}
		const handler = Object.prototype.hasOwnProperty.call(SHELL, cmd) ? SHELL[cmd] : undefined;
		const r = handler ? handler(args) : unknownCommand(cmd);
		if (r.ok && tokens.redirect) {
			const err = redirectTo(tokens.redirect.op, tokens.redirect.target, r.out);
			if (err) return { output: err.out, ok: false };
			return { output: '', ok: true };
		}
		return { output: r.out.replace(/\n$/, ''), ok: r.ok };
	}

	// ---- setup, learner source, result --------------------------------------------------------

	for (const l of splitLines(spec.setup ?? '')) {
		const r = run(l.text);
		if (!r.ok) throw new SpecError(`setup line ${l.line} (${l.text}) failed: ${r.output}`);
	}

	function executeSource(code: string): void {
		const lines = splitLines(code);
		// An empty script is a normal, successful run: the UI uses it to show the setup state.
		if (lines.length === 0) return;
		for (const l of lines) {
			base.step();
			const r = run(l.text);
			const entry = { cmd: l.text, output: r.output, ok: r.ok };
			state.terminal.push(entry);
			base.trace.push({ t: 'shell', ...entry });
		}
	}

	let finished: { git: GitResult } | undefined;
	function finish(): { git: GitResult } {
		if (finished) return finished;
		const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
		finished = {
			git: {
				files: copy(state.files),
				staged: stagedPaths(),
				modified: modifiedPaths(),
				untracked: untrackedPaths(),
				commits: copy(state.commits),
				branches: copy(state.branches),
				head: { ...state.head },
				terminal: copy(state.terminal),
				initialized: state.initialized
			}
		};
		return finished;
	}

	return {
		kind: 'git',
		api: {},
		variables: {},
		log: () => {},
		state,
		trace: base.trace,
		output: base.output,
		get steps() {
			return base.steps;
		},
		get halted() {
			return base.halted;
		},
		aliases: {},
		executeSource,
		run,
		finish
	};
}

// ---------------------------------------------------------------------------------------------
// Checks (evaluate.ts hands the git-* and shell-* checks to gitCheckFails)
// ---------------------------------------------------------------------------------------------

export type GitCheck = Extract<
	Check,
	{
		type:
			| 'git-commits'
			| 'git-branch'
			| 'git-head'
			| 'git-file'
			| 'git-clean'
			| 'git-merged'
			| 'git-message-includes'
			| 'shell-output-includes';
	}
>;

export function emptyGitResult(): GitResult {
	return {
		files: {},
		staged: [],
		modified: [],
		untracked: [],
		commits: [],
		branches: {},
		head: { branch: null, commit: null },
		terminal: [],
		initialized: false
	};
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** True when a file still has git's conflict markers in it. */
export function hasConflictMarkers(text: string): boolean {
	return /^(<<<<<<<|=======|>>>>>>>)/m.test(text);
}

/** `a`, or `a` (and 2 more) */
const firstOf = (paths: string[]) =>
	tick(paths[0]) + (paths.length > 1 ? ` (and ${paths.length - 1} more)` : '');

const clip = (s: string, max = 60) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
const trimEnd = (s: string) => s.replace(/\s+$/, '');

/** A failure message for a git-world check, or null when it passes. */
export function gitCheckFails(
	check: GitCheck,
	git: GitResult | undefined,
	msg: (fallback: ThemedText) => ThemedText
): ThemedText | null {
	const g = git ?? emptyGitResult();
	const noRepo = () => msg(`There's no repository here yet. Start with ${tick('git init')}.`);
	const conflictMsg = (p: string) =>
		msg(
			`${tick(p)} still has conflict markers in it (${tick('<<<<<<<')}, ${tick('=======')}, ${tick('>>>>>>>')}). Edit the file so it only has the lines you want to keep, then ${tick(`git add ${p}`)} and ${tick('git commit')}.`
		);

	switch (check.type) {
		case 'git-commits': {
			if (!g.initialized) return noRepo();
			const n = g.commits.length;
			if (check.min !== undefined && n < check.min) {
				return msg(
					n === 0
						? `There are no commits yet, but this level needs ${check.min}. ${tick('git add')} a file, then ${tick('git commit -m "…"')} makes one.`
						: `There ${n === 1 ? 'is 1 commit' : `are ${n} commits`}, but this level needs ${check.min}. Each ${tick('git commit')} adds one.`
				);
			}
			if (check.max !== undefined && n > check.max) {
				return msg(
					`There are ${n} commits, but this level needs at most ${check.max}. Fewer, bigger snapshots are fine here.`
				);
			}
			return null;
		}
		case 'git-branch': {
			const name = check.name;
			const there = own(g.branches, name);
			if (check.exists === false) {
				if (!there) return null;
				return msg(
					`The branch ${tick(name)} should be gone, but it's still there. ${tick(`git branch -d ${name}`)} deletes it.`
				);
			}
			if (there) return null;
			if (!g.initialized) return noRepo();
			if (g.head.branch === name && !g.head.commit) {
				return msg(
					`You're on ${tick(name)}, but a branch only really exists once it has a commit. Make one with ${tick('git commit -m "…"')}.`
				);
			}
			return msg(
				`There's no branch called ${tick(name)} yet. ${tick(`git switch -c ${name}`)} makes one and moves you onto it.`
			);
		}
		case 'git-head': {
			const want = check.branch;
			if (g.head.branch === want) return null;
			if (!g.initialized) return noRepo();
			if (!own(g.branches, want)) {
				return msg(
					`This level should end on the branch ${tick(want)}, but there's no such branch yet. ${tick(`git switch -c ${want}`)} makes it and moves you there.`
				);
			}
			return msg(
				`You're on ${tick(g.head.branch ?? '?')}, but this level should end on ${tick(want)}. ${tick(`git switch ${want}`)} moves you there.`
			);
		}
		case 'git-file': {
			const path = check.path;
			const p = tick(path);
			const head = headFiles(g);
			const where = check.committed ? head : g.files;
			const content = own(where, path) ? where[path] : undefined;
			if (check.exists === false) {
				if (content === undefined) return null;
				return msg(
					check.committed
						? `${p} is still in the last commit. ${tick(`git rm ${path}`)}, then ${tick('git commit')}, takes it out of the history from here on.`
						: `${p} should be gone from the folder, but it's still there. ${tick(`rm ${path}`)} deletes it.`
				);
			}
			if (content === undefined) {
				if (!check.committed) {
					return msg(`There's no ${p} in the folder yet. ${tick(`echo "…" > ${path}`)} makes one.`);
				}
				if (!g.initialized) return noRepo();
				if (own(g.files, path)) {
					return msg(
						`${p} is still only in your working folder: ${tick('git add')} then ${tick('git commit')} put it in the history.`
					);
				}
				return msg(
					g.head.commit
						? `There's no ${p} in the last commit.`
						: `There are no commits yet, so ${p} isn't in the history.`
				);
			}
			const wantsMarkers = [check.includes, check.equals].some(
				(t) => t !== undefined && hasConflictMarkers(t)
			);
			const checksText = check.includes !== undefined || check.equals !== undefined;
			const fits = (text: string) =>
				(check.includes === undefined || text.includes(check.includes)) &&
				(check.equals === undefined || trimEnd(text) === trimEnd(check.equals));
			if (checksText && !wantsMarkers && hasConflictMarkers(content)) return conflictMsg(path);
			if (fits(content)) return null;
			if (check.committed && own(g.files, path) && fits(g.files[path])) {
				return msg(
					`The ${p} in your folder is right, but the last commit has an older version. ${tick(`git add ${path}`)} then ${tick('git commit')} saves it.`
				);
			}
			if (check.includes !== undefined && !content.includes(check.includes)) {
				return msg(`${p} should include ${tick(check.includes)}, but it doesn't yet.`);
			}
			return msg(
				`${p} doesn't have the right text yet. It should be ${tick(clip(trimEnd(check.equals ?? '')))}.`
			);
		}
		case 'git-clean': {
			if (!g.initialized) return noRepo();
			const conflicted = g.modified.find((f) => hasConflictMarkers(g.files[f] ?? ''));
			if (conflicted) return conflictMsg(conflicted);
			if (g.untracked.length) {
				return msg(
					`${firstOf(g.untracked)} ${g.untracked.length > 1 ? "aren't" : "isn't"} in the history yet: ${tick('git add')} then ${tick('git commit')} put it there.`
				);
			}
			if (g.modified.length) {
				const f = g.modified[0];
				return msg(
					`${firstOf(g.modified)} ${g.modified.length > 1 ? 'have' : 'has'} changes that aren't committed. ${tick(`git add ${f}`)} then ${tick('git commit')} saves them (or ${tick(`git restore ${f}`)} throws them away).`
				);
			}
			if (g.staged.length) {
				return msg(
					`${firstOf(g.staged)} ${g.staged.length > 1 ? 'are' : 'is'} on the stage but not committed yet. Finish with ${tick('git commit -m "…"')}.`
				);
			}
			return null;
		}
		case 'git-merged': {
			const { branch, into } = check;
			if (!g.initialized) return noRepo();
			if (!own(g.branches, branch)) {
				return msg(`There's no branch called ${tick(branch)}, so there's nothing to merge yet.`);
			}
			if (!own(g.branches, into)) {
				return msg(`There's no branch called ${tick(into)} to merge ${tick(branch)} into.`);
			}
			if (isAncestor(g.commits, g.branches[branch], g.branches[into])) return null;
			const conflicted = Object.keys(g.files).find((f) => hasConflictMarkers(g.files[f]));
			if (conflicted && g.head.branch === into) {
				return msg(
					`The merge isn't finished yet: ${tick(conflicted)} still has conflict markers. Fix the file, then ${tick(`git add ${conflicted}`)} and ${tick('git commit')}.`
				);
			}
			return msg(
				g.head.branch === into
					? `${tick(branch)} hasn't been merged into ${tick(into)} yet. You're on ${tick(into)}, so ${tick(`git merge ${branch}`)} brings it in.`
					: `${tick(branch)} hasn't been merged into ${tick(into)} yet. Switch to ${tick(into)} first (${tick(`git switch ${into}`)}), then ${tick(`git merge ${branch}`)}.`
			);
		}
		case 'git-message-includes': {
			if (!g.initialized) return noRepo();
			const want = check.text.toLowerCase();
			if (g.commits.some((c) => c.message.toLowerCase().includes(want))) return null;
			if (g.commits.length === 0) {
				return msg(
					`There are no commits yet. Make one whose message mentions ${tick(check.text)}: ${tick(`git commit -m "${check.text}"`)}.`
				);
			}
			return msg(
				`None of the commit messages mention ${tick(check.text)} yet. The message is the part in quotes after ${tick('git commit -m')}.`
			);
		}
		case 'shell-output-includes': {
			if (g.terminal.some((t) => t.output.includes(check.text))) return null;
			if (g.terminal.length === 0) return msg('No commands ran yet. Type one per line.');
			return msg(`None of your commands printed ${tick(check.text)} yet.`);
		}
	}
	return null;
}
