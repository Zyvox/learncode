import { describe, expect, it } from 'vitest';
import type { Check, CodeLesson, GitWorldSpec } from '#lib/curriculum/types.ts';
import { COMMANDS, gitCommandNames } from '../commands.ts';
import { evaluate } from '../evaluate.ts';
import { runInNode } from '../node.ts';
import { SPEC_ERROR_MESSAGE } from '../run.ts';
import { isBlankLine, splitLines, tokenize } from '../shell.ts';
import {
	GIT_MAX_STEPS,
	NOT_A_REPO,
	conflictText,
	createGitWorld,
	diffText,
	headFiles,
	isAncestor
} from './git.ts';

const spec = (extra: Partial<GitWorldSpec> = {}): GitWorldSpec => ({ kind: 'git', ...extra });

/** A world with notes.txt committed on main. */
const committed = (extra: Partial<GitWorldSpec> = {}) =>
	spec({
		files: { 'notes.txt': 'hello\n' },
		setup: 'git init\ngit add .\ngit commit -m "start"',
		...extra
	});

/** Runs a script and returns the world (state and terminal). */
function sh(code: string, s: GitWorldSpec = spec()) {
	const w = createGitWorld(s);
	w.executeSource(code);
	return w;
}

/** The terminal entry for the last line of the script. */
function last(code: string, s?: GitWorldSpec) {
	const w = sh(code, s);
	return w.state.terminal[w.state.terminal.length - 1];
}

describe('shell tokenizer', () => {
	it('splits words and removes quotes', () => {
		expect(tokenize('git commit -m "first notes"')).toEqual({
			args: ['git', 'commit', '-m', 'first notes'],
			redirect: null
		});
		expect(tokenize("echo 'it''s'").args).toEqual(['echo', 'its']);
		expect(tokenize(`echo 'say "hi"'`).args).toEqual(['echo', 'say "hi"']);
		expect(tokenize('echo "say \\"hi\\""').args).toEqual(['echo', 'say "hi"']);
		expect(tokenize("echo don\\'t").args).toEqual(['echo', "don't"]);
		expect(tokenize('echo a"b c"d   e').args).toEqual(['echo', 'ab cd', 'e']);
		expect(tokenize('echo ""').args).toEqual(['echo', '']);
		expect(tokenize('  \tls  ').args).toEqual(['ls']);
	});

	it('finds > and >> redirection, with or without spaces', () => {
		expect(tokenize('echo "hi" > notes.txt')).toEqual({
			args: ['echo', 'hi'],
			redirect: { op: '>', target: 'notes.txt' }
		});
		expect(tokenize('echo hi>>notes.txt').redirect).toEqual({ op: '>>', target: 'notes.txt' });
		expect(tokenize('echo "a > b"').args).toEqual(['echo', 'a > b']);
		expect(tokenize('echo hi > "my notes.txt"').redirect?.target).toBe('my notes.txt');
	});

	it('drops # comments but keeps # inside words and quotes', () => {
		expect(tokenize('git status # what is going on?').args).toEqual(['git', 'status']);
		expect(tokenize('echo a#b "#c"').args).toEqual(['echo', 'a#b', '#c']);
		expect(tokenize('# only a comment').args).toEqual([]);
	});

	it('ignores a copied $ prompt', () => {
		expect(tokenize('$ git init').args).toEqual(['git', 'init']);
		expect(tokenize('echo $').args).toEqual(['echo', '$']);
	});

	it('explains lines it cannot read', () => {
		expect(tokenize('echo "hello').error).toMatch(/never closed/);
		expect(tokenize("echo 'hello").error).toMatch(/never closed/);
		expect(tokenize('echo hi >').error).toMatch(/needs a file name/);
		expect(tokenize('echo hi > >> x').error).toMatch(/needs a file name/);
		expect(tokenize('echo a > x > y').error).toMatch(/One/);
		expect(tokenize('git add . && git commit -m "x"').error).toMatch(/one command per line/);
		expect(tokenize('ls | cat').error).toMatch(/one command per line/);
		expect(tokenize('ls; ls').error).toMatch(/one command per line/);
		expect(tokenize('ls &').error).toMatch(/background/);
		expect(tokenize('echo "a && b"').error).toBeUndefined();
	});

	it('splits a script into command lines, skipping blanks and comments', () => {
		expect(splitLines('git init\n\n# a comment\r\n  git status  \n')).toEqual([
			{ line: 1, text: 'git init' },
			{ line: 4, text: 'git status' }
		]);
		expect(isBlankLine('   ')).toBe(true);
		expect(isBlankLine(' # x')).toBe(true);
		expect(isBlankLine('ls')).toBe(false);
	});
});

describe('git world: shell commands', () => {
	it('echo, >, >>, cat', () => {
		const w = sh(
			'echo "first" > notes.txt\necho second >> notes.txt\ncat notes.txt\necho "hi there"'
		);
		expect(w.state.files['notes.txt']).toBe('first\nsecond\n');
		expect(w.state.terminal.map((t) => t.output)).toEqual(['', '', 'first\nsecond', 'hi there']);
		expect(w.state.terminal.every((t) => t.ok)).toBe(true);
	});

	it('echo -n and -e', () => {
		const w = sh('echo -n "a" > x.txt\necho -e "b\\nc" >> x.txt');
		expect(w.state.files['x.txt']).toBe('ab\nc\n');
	});

	it('ls, ls -a, touch, rm, pwd', () => {
		const w = sh('touch b.txt\nls\ngit init\nls -a\nrm b.txt\nls\npwd', {
			kind: 'git',
			files: { 'a.txt': 'A', 'src/app.js': 'x' }
		});
		expect(w.state.terminal.map((t) => t.output)).toEqual([
			'',
			'a.txt  b.txt  src/',
			'Initialized empty Git repository in /inkwell/.git/',
			'.git/  a.txt  b.txt  src/',
			'',
			'a.txt  src/',
			'/inkwell'
		]);
		expect(last('ls src', spec({ files: { 'src/app.js': '' } })).output).toBe('app.js');
	});

	it('friendly errors for missing files, outside paths and folders', () => {
		expect(last('cat nope.txt')).toEqual({
			cmd: 'cat nope.txt',
			output: 'cat: nope.txt: No such file or directory',
			ok: false
		});
		expect(last('rm nope.txt').output).toBe(
			"rm: cannot remove 'nope.txt': No such file or directory"
		);
		expect(last('rm -f nope.txt').ok).toBe(true);
		expect(last('echo hi > ../evil.txt').output).toMatch(/only works inside \/inkwell/);
		expect(last('cat /etc/passwd').ok).toBe(false);
		expect(last('rm -rf .git').output).toMatch(/whole history/);
		expect(last('cat src', spec({ files: { 'src/a.js': '' } })).output).toMatch(/folder/);
		expect(last('cat')).toMatchObject({ ok: false });
	});

	it('unknown commands get a friendly line and the run carries on', () => {
		const w = sh('gti status\nmkdir x\ncommit -m "x"\nnano notes.txt\necho still here');
		expect(w.state.terminal.map((t) => [t.output, t.ok])).toEqual([
			["This little shell doesn't know `gti`. Did you mean `git`?", false],
			[
				"This little shell doesn't know `mkdir`. It knows: git, echo, cat, ls, touch, rm, pwd.",
				false
			],
			[
				"This little shell doesn't know `commit` on its own. Git commands start with `git`: `git commit`",
				false
			],
			[
				'There\'s no text editor in this little shell. Write a file with `echo "text" > notes.txt`.',
				false
			],
			['still here', true]
		]);
	});

	it('names that live on Object.prototype are just names', () => {
		const w = sh('echo a > constructor\necho b > __proto__\ncat constructor\ncat toString');
		expect(w.state.files['constructor']).toBe('a\n');
		expect(Object.keys(w.state.files)).toContain('__proto__');
		expect(w.state.terminal[2].output).toBe('a');
		expect(w.state.terminal[3].ok).toBe(false);
	});
});

describe('git world: init, status, add, commit', () => {
	it('git commands before init say so', () => {
		for (const cmd of ['git status', 'git add .', 'git commit -m "x"', 'git log', 'git branch']) {
			expect(last(cmd)).toEqual({ cmd, output: NOT_A_REPO, ok: false });
		}
	});

	it('init once, then reinit', () => {
		const w = sh('git init\ngit init');
		expect(w.state.initialized).toBe(true);
		expect(w.state.head).toEqual({ branch: 'main', commit: null });
		expect(w.state.terminal[1].output).toBe(
			'Reinitialized existing Git repository in /inkwell/.git/'
		);
		expect(last('git init now').ok).toBe(false);
	});

	it('status: untracked, staged, modified, deleted, clean', () => {
		const files = { 'a.txt': 'A\n', 'b.txt': 'B\n' };
		expect(last('git init\ngit status', spec({ files })).output).toBe(
			[
				'On branch main',
				'',
				'No commits yet',
				'',
				'Untracked files:',
				'  a.txt',
				'  b.txt',
				'',
				'nothing added to commit but untracked files present (use `git add` to track)'
			].join('\n')
		);
		expect(last('git init\ngit add a.txt\ngit status', spec({ files })).output).toBe(
			[
				'On branch main',
				'',
				'No commits yet',
				'',
				'Changes to be committed:',
				'  new file:   a.txt',
				'',
				'Untracked files:',
				'  b.txt'
			].join('\n')
		);
		const s = committed({ files: { 'notes.txt': 'hello\n', 'old.txt': 'x' } });
		expect(last('echo more >> notes.txt\nrm old.txt\ngit status', s).output).toBe(
			[
				'On branch main',
				'',
				'Changes not staged for commit:',
				'  modified:   notes.txt',
				'  deleted:    old.txt',
				'',
				'no changes added to commit (use `git add`)'
			].join('\n')
		);
		expect(
			last('echo more >> notes.txt\ngit rm old.txt\ngit add notes.txt\ngit status', s).output
		).toBe(
			[
				'On branch main',
				'',
				'Changes to be committed:',
				'  modified:   notes.txt',
				'  deleted:    old.txt'
			].join('\n')
		);
		expect(last('git status', committed()).output).toBe(
			'On branch main\n\nnothing to commit, working tree clean'
		);
	});

	it('add: a file, everything, globs, deletions, and errors', () => {
		const files = { 'a.txt': 'A', 'b.md': 'B', 'src/c.js': 'C' };
		expect(Object.keys(sh('git init\ngit add a.txt', spec({ files })).state.index)).toEqual([
			'a.txt'
		]);
		expect(Object.keys(sh('git init\ngit add .', spec({ files })).state.index).sort()).toEqual([
			'a.txt',
			'b.md',
			'src/c.js'
		]);
		expect(Object.keys(sh('git init\ngit add -A', spec({ files })).state.index)).toHaveLength(3);
		expect(Object.keys(sh('git init\ngit add *.txt', spec({ files })).state.index)).toEqual([
			'a.txt'
		]);
		expect(Object.keys(sh('git init\ngit add src', spec({ files })).state.index)).toEqual([
			'src/c.js'
		]);
		expect(Object.keys(sh('git init\ngit add ./a.txt', spec({ files })).state.index)).toEqual([
			'a.txt'
		]);
		expect(last('git init\ngit add nope.txt', spec({ files }))).toMatchObject({
			output: "fatal: pathspec 'nope.txt' did not match any files",
			ok: false
		});
		expect(last('git init\ngit add', spec({ files })).output).toMatch(/Nothing specified/);
		// a deleted tracked file: `git add` stages the deletion
		const w = sh('rm notes.txt\ngit add notes.txt', committed());
		expect(w.state.index).toEqual({});
		expect(w.finish().git.staged).toEqual(['notes.txt']);
	});

	it('commit: output, ids, parents, author', () => {
		const w = sh(
			'git init\ngit add .\ngit commit -m "first notes"\necho more >> notes.txt\necho x > b.txt\ngit add .\ngit commit -m "more"',
			spec({ files: { 'notes.txt': 'hello\n' }, user: 'Mina' })
		);
		const [c1, c2] = w.state.commits;
		expect(c1.id).toMatch(/^[0-9a-f]{7}$/);
		expect(w.state.terminal[2].output).toBe(
			`[main (root-commit) ${c1.id}] first notes\n 1 file changed`
		);
		expect(w.state.terminal[6].output).toBe(`[main ${c2.id}] more\n 2 files changed`);
		expect(c1.parents).toEqual([]);
		expect(c2.parents).toEqual([c1.id]);
		expect(c2.author).toBe('Mina');
		expect(c2.files).toEqual({ 'notes.txt': 'hello\nmore\n', 'b.txt': 'x\n' });
		expect(w.state.branches).toEqual({ main: c2.id });
		expect(w.state.head).toEqual({ branch: 'main', commit: c2.id });
	});

	it('commit ids are deterministic', () => {
		const code =
			'git init\ngit add .\ngit commit -m "a"\necho b > b.txt\ngit add .\ngit commit -m "b"';
		const a = sh(code, spec({ files: { 'a.txt': 'a' } })).state.commits.map((c) => c.id);
		const b = sh(code, spec({ files: { 'a.txt': 'a' } })).state.commits.map((c) => c.id);
		expect(a).toEqual(b);
		expect(new Set(a).size).toBe(2);
	});

	it('commit errors: nothing staged, clean, no message, unquoted message, empty message', () => {
		expect(last('echo x >> notes.txt\ngit commit -m "x"', committed())).toMatchObject({
			output: 'nothing to commit (use `git add` first)',
			ok: false
		});
		expect(last('git commit -m "x"', committed()).output).toBe(
			'nothing to commit, working tree clean'
		);
		const missing = 'please give the commit a message: git commit -m "what changed"';
		expect(last('echo x >> notes.txt\ngit add .\ngit commit', committed()).output).toBe(missing);
		expect(last('echo x >> notes.txt\ngit add .\ngit commit -m', committed()).output).toBe(missing);
		expect(
			last('echo x >> notes.txt\ngit add .\ngit commit -m first notes', committed()).output
		).toBe(
			'error: pathspec \'notes\' did not match any file(s) known to git\nA message with spaces needs quotes around it: `git commit -m "first notes"`'
		);
		expect(last('echo x >> notes.txt\ngit add .\ngit commit -m ""', committed()).output).toBe(
			'Aborting commit due to empty commit message.'
		);
		expect(last('git commit --amend', committed()).ok).toBe(false);
	});

	it('commit -am stages tracked changes (not new files)', () => {
		const w = sh('echo x >> notes.txt\necho y > new.txt\ngit commit -am "both?"', committed());
		expect(w.state.terminal[2].ok).toBe(true);
		expect(headFiles(w.finish().git)).toEqual({ 'notes.txt': 'hello\nx\n' });
		expect(w.finish().git.untracked).toEqual(['new.txt']);
		const glued = sh('echo x >> notes.txt\ngit commit -m"glued"', committed());
		expect(glued.state.terminal[1].output).toBe('nothing to commit (use `git add` first)');
		expect(
			sh('echo x >> notes.txt\ngit add .\ngit commit -m"glued"', committed()).state.commits[1]
				.message
		).toBe('glued');
	});
});

describe('git world: log, branch, switch, checkout', () => {
	it('log: newest first, with branch markers', () => {
		const w = sh(
			'git branch ideas\necho 2 >> notes.txt\ngit commit -am "second"\ngit log\ngit log --oneline',
			committed()
		);
		const [c1, c2] = w.state.commits;
		const expected = `${c2.id} (HEAD -> main) second\n${c1.id} (ideas) start`;
		expect(w.state.terminal[3].output).toBe(expected);
		expect(w.state.terminal[4].output).toBe(expected);
		expect(last('git init\ngit log').output).toBe(
			"fatal: your current branch 'main' does not have any commits yet"
		);
	});

	it('log --all shows commits on other branches too', () => {
		const w = sh(
			'git switch -c ideas\necho 2 >> notes.txt\ngit commit -am "idea"\ngit switch main\ngit log\ngit log --all',
			committed()
		);
		const [c1, c2] = w.state.commits;
		expect(w.state.terminal[4].output).toBe(`${c1.id} (HEAD -> main) start`);
		expect(w.state.terminal[5].output).toBe(`${c2.id} (ideas) idea\n${c1.id} (HEAD -> main) start`);
	});

	it('branch: create, list, errors', () => {
		const w = sh('git branch comments\ngit branch', committed());
		expect(w.state.branches.comments).toBe(w.state.commits[0].id);
		expect(w.state.terminal[1].output).toBe('  comments\n* main');
		expect(last('git branch main', committed()).output).toBe(
			"fatal: a branch named 'main' already exists"
		);
		expect(last('git branch -oops', committed()).ok).toBe(false);
		expect(last('git branch "new ideas"', committed()).output).toMatch(/not a valid branch name/);
		expect(last('git init\ngit branch x').output).toMatch(/no commits yet/);
		expect(last('git branch --show-current', committed()).output).toBe('main');
	});

	it('branch -d deletes merged branches only', () => {
		expect(last('git branch x\ngit branch -d x', committed()).output).toMatch(
			/^Deleted branch x \(was [0-9a-f]{7}\)\.$/
		);
		const unmerged =
			'git switch -c x\necho 2 >> notes.txt\ngit commit -am "2"\ngit switch main\ngit branch -d x';
		expect(last(unmerged, committed()).output).toMatch(/not fully merged/);
		expect(last(unmerged.replace('-d', '-D'), committed()).ok).toBe(true);
		expect(last('git branch -d main', committed()).output).toMatch(/you're on it/);
	});

	it('switch and checkout move between branches and update the folder', () => {
		const w = sh(
			[
				'git switch -c comments',
				'echo "comments on" > comments.txt',
				'git add .',
				'git commit -m "comments"',
				'git switch main',
				'ls',
				'git checkout comments',
				'ls',
				'git checkout -b other',
				'git switch -',
				'git switch comments'
			].join('\n'),
			committed()
		);
		expect(w.state.terminal.map((t) => t.output)).toEqual([
			"Switched to a new branch 'comments'",
			'',
			'',
			expect.stringMatching(/^\[comments [0-9a-f]{7}\] comments/),
			"Switched to branch 'main'",
			'notes.txt',
			"Switched to branch 'comments'",
			'comments.txt  notes.txt',
			"Switched to a new branch 'other'",
			"Switched to branch 'comments'",
			"Already on 'comments'"
		]);
	});

	it('switch errors are friendly', () => {
		expect(last('git switch nope', committed()).output).toBe(
			"fatal: there's no branch called 'nope'. To make it, use `git switch -c nope`."
		);
		expect(last('git branch comments\ngit switch coments', committed()).output).toMatch(
			/Did you mean `comments`\?/
		);
		expect(last('git checkout nope', committed()).output).toMatch(/git checkout -b nope/);
		expect(last('git switch -b x', committed()).output).toMatch(/uses `-c`/);
		expect(last('git switch', committed()).ok).toBe(false);
		const w = sh('git switch HEAD', committed());
		expect(w.state.terminal[0].output).toMatch(/old commit/);
	});

	it('switch -c before the first commit renames the unborn branch', () => {
		const w = sh('git init\ngit switch -c trunk\necho a > a.txt\ngit add .\ngit commit -m "a"');
		expect(Object.keys(w.state.branches)).toEqual(['trunk']);
		expect(w.state.head.branch).toBe('trunk');
	});

	it("refuses to switch when local changes would be lost, keeps changes it doesn't touch", () => {
		const base =
			'git switch -c comments\necho "comment" >> notes.txt\ngit commit -am "c"\ngit switch main\n';
		const refused = sh(base + 'echo "unsaved" >> notes.txt\ngit switch comments', committed());
		const out = refused.state.terminal[5];
		expect(out.ok).toBe(false);
		expect(out.output).toBe(
			[
				'error: Your changes to these files would be lost by switching branches:',
				'  notes.txt',
				'Save them first (`git add`, then `git commit`), or throw them away (`git restore notes.txt`). Then try again.'
			].join('\n')
		);
		expect(refused.state.head.branch).toBe('main');
		expect(refused.state.files['notes.txt']).toBe('hello\nunsaved\n');

		// an untracked file the other branch has would be overwritten
		const untracked = sh(
			'git switch -c c\necho a > a.txt\ngit add .\ngit commit -m "a"\ngit switch main\necho b > a.txt\ngit switch c',
			committed()
		);
		expect(untracked.state.terminal[6].ok).toBe(false);

		// a change to a file both branches agree on travels along
		const carried = sh(
			'git switch -c c\necho a > a.txt\ngit add .\ngit commit -m "a"\ngit switch main\necho x >> notes.txt\ngit switch c',
			committed()
		);
		expect(carried.state.terminal[6].ok).toBe(true);
		expect(carried.state.files).toEqual({ 'notes.txt': 'hello\nx\n', 'a.txt': 'a\n' });
	});

	it('checkout <file> restores it like git restore', () => {
		const w = sh('echo oops > notes.txt\ngit checkout notes.txt', committed());
		expect(w.state.files['notes.txt']).toBe('hello\n');
	});
});

describe('git world: merge', () => {
	const branchWork = [
		'git switch -c comments',
		'echo "comments" > comments.txt',
		'git add comments.txt',
		'git commit -m "Add comments"',
		'git switch main'
	].join('\n');

	it('fast-forwards when main has not moved', () => {
		const w = sh(branchWork + '\ngit merge comments', committed());
		const [c1, c2] = w.state.commits;
		expect(w.state.terminal[5]).toEqual({
			cmd: 'git merge comments',
			output: `Updating ${c1.id}..${c2.id}\nFast-forward\n comments.txt\n 1 file changed`,
			ok: true
		});
		expect(w.state.branches.main).toBe(c2.id);
		expect(w.state.commits).toHaveLength(2);
		expect(w.state.files['comments.txt']).toBe('comments\n');
		expect(last(branchWork + '\ngit merge comments\ngit merge comments', committed()).output).toBe(
			'Already up to date.'
		);
	});

	it('--no-ff makes a merge commit anyway', () => {
		const w = sh(branchWork + '\ngit merge --no-ff comments', committed());
		expect(w.state.commits).toHaveLength(3);
		expect(w.state.commits[2].parents).toHaveLength(2);
	});

	it('makes a merge commit when both branches moved on different files', () => {
		const w = sh(
			branchWork +
				'\necho "about" > about.txt\ngit add .\ngit commit -m "About page"\ngit merge comments\ngit log',
			committed()
		);
		const [, onBranch, onMain, merge] = w.state.commits;
		expect(merge.parents).toEqual([onMain.id, onBranch.id]);
		expect(merge.message).toBe("Merge branch 'comments'");
		expect(merge.files).toEqual({
			'notes.txt': 'hello\n',
			'comments.txt': 'comments\n',
			'about.txt': 'about\n'
		});
		expect(w.state.terminal[8].output).toBe(
			`Merge made: [main ${merge.id}] Merge branch 'comments'\n 1 file changed`
		);
		expect(w.state.terminal[9].output.split('\n')[0]).toBe(
			`${merge.id} (HEAD -> main) Merge branch 'comments'`
		);
		expect(isAncestor(w.state.commits, onBranch.id, merge.id)).toBe(true);
		expect(w.finish().git.staged).toEqual([]);
	});

	it('a conflict writes markers, waits for the learner, then commits with two parents', () => {
		const code = [
			'git switch -c comments',
			'echo "Title" > notes.txt',
			'echo "from comments" >> notes.txt',
			'git commit -am "comments edit"',
			'git switch main',
			'echo "Title" > notes.txt',
			'echo "from main" >> notes.txt',
			'git commit -am "main edit"',
			'git merge comments',
			'git status',
			'git commit -m "too soon"',
			'git switch comments',
			'echo "Title" > notes.txt',
			'echo "from both" >> notes.txt',
			'git add notes.txt',
			'git status',
			'git commit -m "Merge comments"'
		].join('\n');
		const w = sh(code, committed());
		const t = w.state.terminal;
		expect(t[8]).toEqual({
			cmd: 'git merge comments',
			output: [
				'Auto-merging notes.txt',
				'CONFLICT (content): Merge conflict in notes.txt',
				'Automatic merge failed: fix the file, then `git add notes.txt` and `git commit -m "…"`'
			].join('\n'),
			ok: false
		});
		expect(t[9].output).toBe(
			[
				'On branch main',
				'You have unmerged paths.',
				'  (fix the files, then `git add` them and `git commit`)',
				'',
				'Unmerged paths:',
				'  both modified:   notes.txt'
			].join('\n')
		);
		expect(t[10].output).toMatch(
			/^error: Committing is not possible because you have unmerged files/
		);
		expect(t[11].output).toMatch(/middle of a merge/);
		expect(t[15].output).toMatch(/All conflicts fixed but you are still merging/);
		expect(t[16].ok).toBe(true);
		const merge = w.state.commits[w.state.commits.length - 1];
		expect(merge.parents).toEqual([w.state.commits[2].id, w.state.commits[1].id]);
		expect(merge.files['notes.txt']).toBe('Title\nfrom both\n');
		expect(w.state.merging).toBeNull();
		const git = w.finish().git;
		expect(git.modified).toEqual([]);
		expect(git.staged).toEqual([]);
	});

	it('the conflict file keeps the shared lines outside the markers', () => {
		const w = sh(
			'git switch -c c\necho "c line" >> notes.txt\ngit commit -am "c"\ngit switch main\necho "main line" >> notes.txt\ngit commit -am "m"\ngit merge c\ncat notes.txt',
			committed()
		);
		expect(w.state.terminal[7].output).toBe(
			'hello\n<<<<<<< HEAD\nmain line\n=======\nc line\n>>>>>>> c'
		);
		expect(conflictText('a\nb\nz\n', 'a\nc\nz\n', 'x')).toBe(
			'a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> x\nz\n'
		);
	});

	it('git commit with no -m during a merge uses the default message; add warns about markers', () => {
		const w = sh(
			'git switch -c c\necho c > notes.txt\ngit commit -am "c"\ngit switch main\necho m > notes.txt\ngit commit -am "m"\ngit merge c\ngit add notes.txt\ngit commit',
			committed()
		);
		expect(w.state.terminal[7].output).toMatch(/still has conflict markers/);
		expect(w.state.commits[w.state.commits.length - 1].message).toBe("Merge branch 'c'");
	});

	it('merge --abort goes back to how things were', () => {
		const w = sh(
			'git switch -c c\necho c > notes.txt\ngit commit -am "c"\ngit switch main\necho m > notes.txt\ngit commit -am "m"\ngit merge c\ngit merge --abort\ngit status',
			committed()
		);
		expect(w.state.files['notes.txt']).toBe('m\n');
		expect(w.state.merging).toBeNull();
		expect(w.state.terminal[8].output).toMatch(/working tree clean/);
	});

	it('modify/delete conflicts keep the changed file for the learner to decide', () => {
		const w = sh(
			'git switch -c c\ngit rm notes.txt\ngit commit -m "drop"\ngit switch main\necho m >> notes.txt\ngit commit -am "m"\ngit merge c',
			committed()
		);
		expect(w.state.terminal[6].output).toMatch(/CONFLICT \(modify\/delete\)/);
		expect(w.state.files['notes.txt']).toBe('hello\nm\n');
	});

	it('refuses with uncommitted changes, unknown branches, and nothing to merge', () => {
		expect(
			last(
				'git switch -c c\necho c > c.txt\ngit add .\ngit commit -m "c"\ngit switch main\necho x >> notes.txt\ngit merge c',
				committed()
			).output
		).toMatch(/would be lost by merging/);
		expect(last('git merge nope', committed()).output).toBe(
			'merge: nope - not something we can merge'
		);
		expect(last('git branch comments\ngit merge coments', committed()).output).toMatch(
			/Did you mean/
		);
		expect(last('git merge', committed()).ok).toBe(false);
	});
});

describe('git world: diff, restore, rm', () => {
	it('diff shows working changes; --staged shows what will be committed', () => {
		const w = sh(
			'echo "more" >> notes.txt\ngit diff\ngit add .\ngit diff\ngit diff --staged\necho new > new.txt\ngit add new.txt\ngit diff --cached new.txt',
			committed()
		);
		const t = w.state.terminal;
		expect(t[1].output).toBe('--- a/notes.txt\n+++ b/notes.txt\n hello\n+more');
		expect(t[3].output).toBe('');
		expect(t[4].output).toBe(t[1].output);
		expect(t[7].output).toBe('--- /dev/null\n+++ b/new.txt\n+new');
	});

	it('diffText keeps it short', () => {
		expect(diffText('a', 'x\ny\nz\n', 'x\nY\nz\n')).toBe('--- a/a\n+++ b/a\n x\n-y\n+Y\n z');
		expect(diffText('a', 'gone\n', undefined)).toBe('--- a/a\n+++ /dev/null\n-gone');
		const long = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
		expect(diffText('a', undefined, long).split('\n')).toHaveLength(2 + 20 + 1);
	});

	it('restore throws away working changes; --staged unstages', () => {
		expect(
			sh('echo oops > notes.txt\ngit restore notes.txt', committed()).state.files['notes.txt']
		).toBe('hello\n');
		const w = sh('echo more >> notes.txt\ngit add .\ngit restore --staged notes.txt', committed());
		expect(w.finish().git.staged).toEqual([]);
		expect(w.finish().git.modified).toEqual(['notes.txt']);
		expect(last('echo x > new.txt\ngit restore new.txt', committed()).output).toMatch(
			/isn't tracked by git yet/
		);
		expect(last('git restore nope.txt', committed()).output).toBe(
			"error: pathspec 'nope.txt' did not match any file(s) known to git"
		);
	});

	it('git rm deletes the file and stages the deletion', () => {
		const w = sh('git rm notes.txt\ngit commit -m "remove notes"', committed());
		expect(w.state.terminal[0].output).toBe("rm 'notes.txt'");
		expect(w.state.files).toEqual({});
		expect(w.state.commits[1].files).toEqual({});
		expect(last('git rm nope.txt', committed()).output).toBe(
			"fatal: pathspec 'nope.txt' did not match any files"
		);
		expect(sh('git rm --cached notes.txt', committed()).finish().git.untracked).toEqual([
			'notes.txt'
		]);
	});

	it('other git commands are explained, not crashed on', () => {
		expect(last('git push', committed()).output).toMatch(/nowhere to send commits/);
		expect(last('git stash', committed()).output).toMatch(/real git command/);
		expect(last('git comit -m "x"', committed()).output).toBe(
			"git: 'comit' is not a git command. Did you mean `git commit`?"
		);
		expect(last('git').output).toMatch(/This little shell knows: init, status/);
	});
});

describe('git world: the run', () => {
	it('setup lines are not traced, not counted, and not in the terminal', async () => {
		const r = await runInNode('git status', committed());
		expect(r.ok).toBe(true);
		expect(r.steps).toBe(1);
		expect(r.trace).toEqual([
			{
				t: 'shell',
				cmd: 'git status',
				output: 'On branch main\n\nnothing to commit, working tree clean',
				ok: true
			}
		]);
		expect(r.git?.terminal).toHaveLength(1);
		expect(r.git?.commits).toHaveLength(1);
	});

	it('a failing setup line is a level problem, not the learner', async () => {
		const r = await runInNode('git status', spec({ setup: 'git commit -m "nothing"' }));
		expect(r.ok).toBe(false);
		expect(r.error?.message).toBe(SPEC_ERROR_MESSAGE);
		expect(r.error?.raw).toMatch(/setup line 1/);
		const bad = await runInNode('ls', spec({ files: { '../x': 'y' } }));
		expect(bad.error?.message).toBe(SPEC_ERROR_MESSAGE);
	});

	it('failed lines do not stop the run', async () => {
		const r = await runInNode('git status\ngit init\nnope\ngit status', spec());
		expect(r.ok).toBe(true);
		expect(r.trace.map((e) => (e.t === 'shell' ? e.ok : null))).toEqual([false, true, false, true]);
		expect(r.steps).toBe(4);
	});

	it('an empty script is a quiet, successful run showing the setup state', async () => {
		const r = await runInNode('# nothing here\n\n', spec());
		expect(r.ok).toBe(true);
		expect(r.trace).toEqual([]);
		expect(r.git?.initialized).toBeDefined();
	});

	it(`stops after ${GIT_MAX_STEPS} commands`, async () => {
		const r = await runInNode(
			Array(GIT_MAX_STEPS + 1)
				.fill('pwd')
				.join('\n'),
			spec()
		);
		expect(r.ok).toBe(false);
		expect(r.steps).toBe(GIT_MAX_STEPS);
		expect(r.trace[r.trace.length - 1]).toEqual({ t: 'stopped', reason: 'max-steps' });
	});

	it('finish() reports the folder, the stage, the history and the terminal', async () => {
		const r = await runInNode(
			'echo more >> notes.txt\necho new > new.txt\ngit branch ideas\ngit rm --cached notes.txt\necho x > notes.txt',
			committed({ files: { 'notes.txt': 'hello\n', 'b.txt': 'b' } })
		);
		const git = r.git!;
		expect(git.initialized).toBe(true);
		expect(git.files).toEqual({ 'notes.txt': 'x\n', 'b.txt': 'b', 'new.txt': 'new\n' });
		expect(git.staged).toEqual(['notes.txt']);
		expect(git.modified).toEqual([]);
		expect(git.untracked).toEqual(['new.txt', 'notes.txt']);
		expect(Object.keys(git.branches).sort()).toEqual(['ideas', 'main']);
		expect(git.head).toEqual({ branch: 'main', commit: git.commits[0].id });
		expect(git.terminal.map((t) => t.cmd)).toEqual([
			'echo more >> notes.txt',
			'echo new > new.txt',
			'git branch ideas',
			'git rm --cached notes.txt',
			'echo x > notes.txt'
		]);
		expect(JSON.parse(JSON.stringify(git))).toEqual(git);
	});

	it('modified covers tracked files that differ from the stage', async () => {
		const r = await runInNode('echo more >> notes.txt', committed());
		expect(r.git).toMatchObject({ modified: ['notes.txt'], staged: [], untracked: [] });
	});
});

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

function lesson(world: GitWorldSpec, checks: Check[]): CodeLesson {
	return {
		id: 'm/l',
		slug: 'l',
		title: 'T',
		kind: 'code',
		xp: 10,
		story: '',
		task: '',
		hints: [],
		world,
		language: 'shell',
		starterCode: '',
		solution: '',
		checks
	};
}

async function check(code: string, world: GitWorldSpec, ...checks: Check[]) {
	const r = await runInNode(code, world);
	return evaluate(lesson(world, checks), r, code).failures;
}

describe('git checks', () => {
	it('git-commits', async () => {
		const c: Check = { type: 'git-commits', min: 3 };
		expect(await check('git status', committed(), c)).toEqual([
			'There is 1 commit, but this level needs 3. Each `git commit` adds one.'
		]);
		expect(await check('echo a >> notes.txt\ngit commit -am "a"', committed(), c)).toEqual([
			'There are 2 commits, but this level needs 3. Each `git commit` adds one.'
		]);
		expect(
			await check(
				'echo a >> notes.txt\ngit commit -am "a"\necho b >> notes.txt\ngit commit -am "b"',
				committed(),
				c
			)
		).toEqual([]);
		expect(await check('git init', spec(), c)).toEqual([
			'There are no commits yet, but this level needs 3. `git add` a file, then `git commit -m "…"` makes one.'
		]);
		expect(await check('ls', spec(), c)).toEqual([
			"There's no repository here yet. Start with `git init`."
		]);
		expect(await check('ls', committed(), { type: 'git-commits', max: 0 })).toHaveLength(1);
		expect(
			await check('ls', committed(), { type: 'git-commits', min: 1, message: 'Mine.' })
		).toEqual([]);
		expect(await check('ls', spec(), { type: 'git-commits', min: 1, message: 'Mine.' })).toEqual([
			'Mine.'
		]);
	});

	it('git-branch', async () => {
		const c: Check = { type: 'git-branch', name: 'comments' };
		expect(await check('git status', committed(), c)).toEqual([
			"There's no branch called `comments` yet. `git switch -c comments` makes one and moves you onto it."
		]);
		expect(await check('git switch -c comments', committed(), c)).toEqual([]);
		expect(await check('git init\ngit switch -c comments', spec(), c)).toEqual([
			'You\'re on `comments`, but a branch only really exists once it has a commit. Make one with `git commit -m "…"`.'
		]);
		const gone: Check = { type: 'git-branch', name: 'old', exists: false };
		expect(await check('git branch old', committed(), gone)).toEqual([
			"The branch `old` should be gone, but it's still there. `git branch -d old` deletes it."
		]);
		expect(await check('git branch old\ngit branch -d old', committed(), gone)).toEqual([]);
	});

	it('git-head', async () => {
		const c: Check = { type: 'git-head', branch: 'comments' };
		expect(await check('git branch comments', committed(), c)).toEqual([
			"You're on `main`, but this level should end on `comments`. `git switch comments` moves you there."
		]);
		expect(await check('git status', committed(), c)).toEqual([
			"This level should end on the branch `comments`, but there's no such branch yet. `git switch -c comments` makes it and moves you there."
		]);
		expect(await check('git switch -c comments', committed(), c)).toEqual([]);
	});

	it('git-file in the working folder and in the history', async () => {
		const inFolder: Check = { type: 'git-file', path: 'todo.txt', includes: 'milk' };
		const inHistory: Check = { ...inFolder, committed: true };
		expect(await check('git status', committed(), inFolder)).toEqual([
			'There\'s no `todo.txt` in the folder yet. `echo "…" > todo.txt` makes one.'
		]);
		expect(await check('echo "eggs" > todo.txt', committed(), inFolder)).toEqual([
			"`todo.txt` should include `milk`, but it doesn't yet."
		]);
		expect(await check('echo "milk" > todo.txt', committed(), inFolder)).toEqual([]);
		expect(await check('echo "milk" > todo.txt', committed(), inHistory)).toEqual([
			'`todo.txt` is still only in your working folder: `git add` then `git commit` put it in the history.'
		]);
		expect(
			await check(
				'echo "eggs" > todo.txt\ngit add .\ngit commit -m "t"\necho milk >> todo.txt',
				committed(),
				inHistory
			)
		).toEqual([
			'The `todo.txt` in your folder is right, but the last commit has an older version. `git add todo.txt` then `git commit` saves it.'
		]);
		expect(
			await check('echo "milk" > todo.txt\ngit add .\ngit commit -m "t"', committed(), inHistory)
		).toEqual([]);
		const exact: Check = { type: 'git-file', path: 'notes.txt', equals: 'hello' };
		expect(await check('ls', committed(), exact)).toEqual([]);
		expect(await check('echo bye > notes.txt', committed(), exact)).toEqual([
			"`notes.txt` doesn't have the right text yet. It should be `hello`."
		]);
		const gone: Check = { type: 'git-file', path: 'notes.txt', exists: false, committed: true };
		expect(await check('rm notes.txt', committed(), gone)).toEqual([
			'`notes.txt` is still in the last commit. `git rm notes.txt`, then `git commit`, takes it out of the history from here on.'
		]);
		expect(await check('git rm notes.txt\ngit commit -m "rm"', committed(), gone)).toEqual([]);
	});

	it('git-file fails while conflict markers are still in the file', async () => {
		const conflict =
			'git switch -c c\necho "from c" >> notes.txt\ngit commit -am "c"\ngit switch main\necho "from main" >> notes.txt\ngit commit -am "m"\ngit merge c';
		const c: Check = { type: 'git-file', path: 'notes.txt', includes: 'from c' };
		expect(await check(conflict, committed(), c)).toEqual([
			'`notes.txt` still has conflict markers in it (`<<<<<<<`, `=======`, `>>>>>>>`). Edit the file so it only has the lines you want to keep, then `git add notes.txt` and `git commit`.'
		]);
		expect(
			await check(
				conflict + '\necho "from c" > notes.txt\ngit add .\ngit commit -m "merged"',
				committed(),
				{
					...c,
					committed: true
				}
			)
		).toEqual([]);
	});

	it('git-clean', async () => {
		const c: Check = { type: 'git-clean' };
		expect(await check('ls', committed(), c)).toEqual([]);
		expect(await check('echo x > a.txt\necho y > b.txt', committed(), c)).toEqual([
			"`a.txt` (and 1 more) aren't in the history yet: `git add` then `git commit` put them there."
		]);
		expect(await check('echo x >> notes.txt', committed(), c)).toEqual([
			"`notes.txt` has changes that aren't committed. `git add notes.txt` then `git commit` saves them (or `git restore notes.txt` throws them away)."
		]);
		expect(await check('echo x >> notes.txt\ngit add .', committed(), c)).toEqual([
			'`notes.txt` is on the stage but not committed yet. Finish with `git commit -m "…"`.'
		]);
		expect(await check('ls', spec(), c)).toEqual([
			"There's no repository here yet. Start with `git init`."
		]);
	});

	it('git-merged', async () => {
		const c: Check = { type: 'git-merged', branch: 'comments', into: 'main' };
		const work = 'git switch -c comments\necho c > c.txt\ngit add .\ngit commit -m "c"';
		expect(await check(work, committed(), c)).toEqual([
			"`comments` hasn't been merged into `main` yet. Switch to `main` first (`git switch main`), then `git merge comments`."
		]);
		expect(await check(work + '\ngit switch main', committed(), c)).toEqual([
			"`comments` hasn't been merged into `main` yet. You're on `main`, so `git merge comments` brings it in."
		]);
		expect(await check(work + '\ngit switch main\ngit merge comments', committed(), c)).toEqual([]);
		expect(await check('git branch comments', committed(), c)).toEqual([]);
		expect(await check('ls', committed(), c)).toEqual([
			"There's no branch called `comments`, so there's nothing to merge yet."
		]);
		const conflict =
			'git switch -c comments\necho "from c" >> notes.txt\ngit commit -am "c"\ngit switch main\necho "from main" >> notes.txt\ngit commit -am "m"\ngit merge comments';
		expect(await check(conflict, committed(), c)).toEqual([
			"The merge isn't finished yet: `notes.txt` still has conflict markers. Fix the file, then `git add notes.txt` and `git commit`."
		]);
	});

	it('git-message-includes (any commit, any case)', async () => {
		const c: Check = { type: 'git-message-includes', text: 'comments' };
		expect(
			await check('echo x >> notes.txt\ngit commit -am "Add Comments"', committed(), c)
		).toEqual([]);
		expect(await check('ls', committed(), c)).toEqual([
			'None of the commit messages mention `comments` yet. The message is the part in quotes after `git commit -m`.'
		]);
		expect(await check('git init', spec(), c)).toEqual([
			'There are no commits yet. Make one whose message mentions `comments`: `git commit -m "comments"`.'
		]);
	});

	it('shell-output-includes', async () => {
		const c: Check = { type: 'shell-output-includes', text: 'nothing to commit' };
		expect(await check('git status', committed(), c)).toEqual([]);
		expect(await check('ls', committed(), c)).toEqual([
			'None of your commands printed `nothing to commit` yet.'
		]);
	});

	it('a git lesson never gets the JavaScript "missing brackets" hint', async () => {
		expect(await check('git status', committed(), { type: 'git-commits', min: 5 })).toHaveLength(1);
	});
});

describe('git cheat sheet', () => {
	it('has exactly the names lessons use in newCommands', () => {
		expect(gitCommandNames()).toEqual([
			'git init',
			'git status',
			'git add <file>',
			'git commit -m "message"',
			'git log',
			'git branch <name>',
			'git switch <branch>',
			'git switch -c <name>',
			'git merge <branch>',
			'git diff',
			'git restore <file>',
			'echo "text" > file',
			'echo "text" >> file',
			'cat file',
			'ls'
		]);
		expect(COMMANDS.git.every((c) => c.summary && c.example)).toBe(true);
	});

	it('every example runs cleanly in a set-up repository', () => {
		// what a learner would have done just before trying the example
		const before: Record<string, string> = {
			'git commit -m "Add notes"': 'git add .',
			'git switch main': 'git switch -c side',
			'git switch -c comments': 'git branch -D comments'
		};
		for (const c of COMMANDS.git) {
			const example = c.example!;
			const w =
				example === 'git init'
					? createGitWorld(spec())
					: createGitWorld(
							committed({
								setup:
									'git init\ngit add .\ngit commit -m "start"\ngit branch comments\necho "draft" >> notes.txt'
							})
						);
			if (before[example]) expect(w.run(before[example]).ok).toBe(true);
			expect(w.run(example), c.name).toMatchObject({ ok: true });
		}
	});
});
