import type { GitWorldSpec, Module } from '#lib/curriculum/types.ts';

const M = 'git-and-versions';

/* ---- The studio folder: the same few files all module long ---------------------------------- */

const NOTES = `Inkwell studio notes
- Episode 9 (Moonlit Deliveries #5, working title Sketches): script due Friday
- The USB stick copy is from Tuesday. Or Wednesday.
`;

const SERVER = `app.get('/series', (req, res) => {
  res.json(db.all('SELECT * FROM series'));
});
`;

/** The API menu from module 3, as the studio keeps it. */
const MENU = `# Inkwell API
GET  /series
GET  /episodes/:id
GET  /episodes/:id/comments
`;

const COMMENTS_LINE = 'POST /episodes/:id/comments';

const TITLE = 'Moonlit Deliveries, episode 5: Sketches';

const SCRIPT = `${TITLE}
Scene 1: Hana gets a parcel with no address.
Scene 2: The parcel hums whenever she walks north.
Scene 3: It leads her to the locked gate on Pine Street.
`;

const SCENE_4 = 'Scene 4: The gate opens by itself.';

/** The two-line script the endings levels fight over. */
const SHORT_SCRIPT = `${TITLE}
Ending: Hana keeps the parcel.
`;
const MINA_ENDING = 'Ending: Hana opens the parcel and finds a key.';
const THEO_ENDING = 'Ending: Hana delivers the parcel to herself, ten years ago.';

const FIRST_SAVE = `git init
git add .
git commit -m "First save of the studio folder"`;

const world = (files: Record<string, string>, setup?: string): GitWorldSpec => ({
	kind: 'git',
	files,
	user: 'you',
	...(setup ? { setup } : {})
});

/** Levels 6 and 7: Theo's ending on a branch, Mina's on main, same line. */
const ENDINGS_WORLD = world(
	{ 'notes.txt': NOTES, 'episode-9.txt': SHORT_SCRIPT },
	`${FIRST_SAVE}
git switch -c theo-ending
echo "${TITLE}" > episode-9.txt
echo "${THEO_ENDING}" >> episode-9.txt
echo "- Theo: the ending needs a twist" >> notes.txt
git add .
git commit -m "Theo's ending, with a twist"
git switch main
echo "${TITLE}" > episode-9.txt
echo "${MINA_ENDING}" >> episode-9.txt
git add episode-9.txt
git commit -m "Mina's new ending"`
);

export const gitAndVersions: Module = {
	id: M,
	track: 'web',
	order: 15,
	emoji: '🌿',
	title: 'Git and versions',
	blurb:
		'A history you can trust: save snapshots of your work, try ideas on branches, bring them back together, and settle it calmly when two people changed the same line.',
	lessons: [
		{
			id: `${M}/01-a-folder-with-a-memory`,
			slug: '01-a-folder-with-a-memory',
			kind: 'code',
			language: 'shell',
			title: 'A folder with a memory',
			xp: 15,
			story:
				'Inkwell’s server code and Mina’s episode scripts live in one folder on the studio laptop, plus a copy on a USB stick “just in case”. Last week Mina copied an old script from the stick over a newer one, and a whole scene vanished. Theo has one question: “Which version is the real one?” Right now, nobody can say.',
			task: 'Look around with `ls`, turn the folder into a repository with `git init`, and ask `git status` what it sees. Then save all three files in a first commit, and finish with one more `git status`.',
			concept: {
				title: 'Repositories and commits',
				panels: [
					{
						who: 'theo',
						text: 'There’s the laptop folder, the USB stick, and a file called `episode-9-FINAL-v2.txt`. Which one is real?',
						scene: 'none'
					},
					{
						who: 'you',
						text: 'Let’s give the folder a memory. `git init` turns it into a **repository**: the same folder, plus a hidden history that git keeps for it.',
						code: 'git init'
					},
					{
						who: 'narrator',
						text: 'Nothing is remembered until you save a **commit**: a snapshot of the files, with a short note about what changed.'
					},
					{ who: 'mina', text: 'Why two steps, add and then commit?' },
					{
						who: 'you',
						text: '`git add` picks what goes in the snapshot, like putting things on the table before the photo. `git commit -m "…"` takes the photo and writes the note on the back.',
						code: 'git add notes.txt\ngit commit -m "First save"'
					},
					{
						who: 'bit',
						text: '`git status` is the question you’ll ask most: what’s new, what’s changed, and what’s ready to be saved.'
					}
				]
			},
			world: world({ 'notes.txt': NOTES, 'server.js': SERVER, 'episode-9.txt': SCRIPT }),
			starterCode: `# One command per line, run top to bottom.
ls
git init
`,
			solution: `ls
git init
git status
git add notes.txt
git add server.js
git add episode-9.txt
git commit -m "First save of the studio folder"
git status
`,
			newCommands: ['ls', 'git init', 'git status', 'git add <file>', 'git commit -m "message"'],
			checks: [
				{
					type: 'shell-output-includes',
					text: 'Initialized empty Git repository',
					message: 'Start with `git init`: it turns this folder into a repository.'
				},
				{
					type: 'shell-output-includes',
					text: 'Untracked files',
					message:
						'Run `git status` before you add anything. It lists the files git doesn’t know about yet as “untracked”.'
				},
				{
					type: 'git-commits',
					min: 1,
					message:
						'There’s no commit yet. `git add` each file, then `git commit -m "First save"` takes the snapshot.'
				},
				{ type: 'git-clean' },
				{
					type: 'shell-output-includes',
					text: 'nothing to commit, working tree clean',
					message:
						'Finish with one more `git status`. Once everything is saved, it says the folder is clean.'
				}
			],
			hints: [
				'After `git init`, add a line with `git status`. It lists `notes.txt`, `server.js` and `episode-9.txt` under “Untracked files”: git can see them but isn’t keeping them yet.',
				'`git add notes.txt` puts one file on the stage. Do the same for the other two (or `git add .` for everything), then `git commit -m "First save"`, then `git status` again.',
				'Here’s one way:\n```\nls\ngit init\ngit status\ngit add notes.txt\ngit add server.js\ngit add episode-9.txt\ngit commit -m "First save of the studio folder"\ngit status\n```'
			]
		},
		{
			id: `${M}/02-the-real-version`,
			slug: '02-the-real-version',
			kind: 'fix',
			language: 'shell',
			title: 'Which version is real?',
			xp: 20,
			story:
				'It happens again. Mina added scene 4 to `episode-9.txt` with one `>` instead of two, and a single `>` replaces the whole file. Scenes 1 to 3 are gone from the folder, and her next commands would save the damage. This time, though, the real script is safe in the last commit.',
			task: 'Run Mina’s commands and read what `git diff` shows. Then fix them: before anything is added, bring the file back with `git restore episode-9.txt`, add scene 4 the right way with `>>`, and commit.',
			concept: {
				title: 'The last commit is the real one',
				body: 'The folder is a scratchpad; the commits are the record. `git diff` shows what changed since the last save: lines starting with `-` went away, lines starting with `+` are new. `git restore <file>` throws those changes away and puts back the version from the last commit.\n\nAnd mind the arrows: `echo "text" > file` **replaces** the whole file, `echo "text" >> file` **adds** a line to the end of it.'
			},
			world: world(
				{ 'notes.txt': NOTES, 'server.js': SERVER, 'episode-9.txt': SCRIPT },
				`${FIRST_SAVE}
echo "${SCENE_4}" > episode-9.txt`
			),
			starterCode: `# Mina's commands. Run them and read what git diff says.
cat episode-9.txt
git status
git diff
git add episode-9.txt
git commit -m "Add scene 4"
`,
			solution: `cat episode-9.txt
git diff
git restore episode-9.txt
echo "${SCENE_4}" >> episode-9.txt
git diff
git add episode-9.txt
git commit -m "Add scene 4"
`,
			newCommands: ['cat file', 'git diff', 'git restore <file>', 'echo "text" >> file'],
			checks: [
				{
					type: 'git-file',
					path: 'episode-9.txt',
					committed: true,
					includes: 'Scene 1: Hana gets a parcel',
					message:
						'The last commit has lost scenes 1 to 3. Put `git restore episode-9.txt` before `git add`, so the real script comes back first.'
				},
				{
					type: 'git-file',
					path: 'episode-9.txt',
					committed: true,
					includes: SCENE_4,
					message: `Scene 4 should still go in, at the end of the script: \`echo "${SCENE_4}" >> episode-9.txt\` (two arrows), then add and commit.`
				},
				{ type: 'git-clean' }
			],
			hints: [
				'Look at the `git diff` output: every line starting with `-` is a line the commit would throw away. That’s three scenes.',
				'`git restore episode-9.txt` brings back the version from the last commit. Do it before `git add`, then add scene 4 with `>>`, which adds to the end instead of replacing.',
				`Here’s one way:\n\`\`\`\ncat episode-9.txt\ngit diff\ngit restore episode-9.txt\necho "${SCENE_4}" >> episode-9.txt\ngit diff\ngit add episode-9.txt\ngit commit -m "Add scene 4"\n\`\`\``
			]
		},
		{
			id: `${M}/03-reading-the-history`,
			slug: '03-reading-the-history',
			kind: 'predict',
			language: 'shell',
			title: 'Reading the history',
			xp: 15,
			story:
				'A few days in, the folder already has three commits: the first save, scene 4, and a note Mina left about comments. Now she adds scene 5 and wants to see it in the history.',
			task: 'Read the commands and pick what `git log` shows at the top.',
			concept: {
				title: 'What a commit is',
				panels: [
					{ who: 'mina', text: 'So what is a commit, really?' },
					{
						who: 'you',
						text: 'A snapshot of every file, a note saying what changed, and an **id**: a short code like `3fa94c1` that names that snapshot for good.'
					},
					{
						who: 'narrator',
						text: 'Each commit also remembers the one before it, its **parent**. Follow the parents back and you have the whole history.'
					},
					{
						who: 'bit',
						text: '`git log` walks that chain backwards: newest first, one commit per line, with any branch labels in brackets.',
						code: 'git log'
					},
					{ who: 'theo', text: 'So the real version is…' },
					{
						who: 'you',
						text: '…whatever the newest commit says. Everything in the folder that isn’t committed yet is a draft.'
					}
				]
			},
			world: world(
				{ 'notes.txt': NOTES, 'server.js': SERVER, 'episode-9.txt': SCRIPT },
				`${FIRST_SAVE}
echo "${SCENE_4}" >> episode-9.txt
git add episode-9.txt
git commit -m "Add scene 4"
echo "- Ask Theo about the comments feature" >> notes.txt
git add notes.txt
git commit -m "Note about comments"`
			),
			code: `echo "Scene 5: The parcel is addressed to Hana." >> episode-9.txt
git log
`,
			newCommands: ['git log'],
			question: 'Mina adds scene 5 and runs `git log` straight away. What’s at the top of the list?',
			choices: [
				'A new commit for scene 5, because git noticed the file change',
				'“Note about comments”, marked `(HEAD -> main)`: the newest commit. Scene 5 isn’t in the history yet',
				'“First save of the studio folder”, because the log starts at the beginning',
				'An error, because there are changes that haven’t been committed'
			],
			answer: 1,
			explanation:
				'`git log` only lists commits, newest first, so the top line is the last thing that was saved: “Note about comments”. `HEAD -> main` means “you are here, on the branch called main”. Scene 5 is only in the folder; until Mina runs `git add` and `git commit`, the history doesn’t know it exists. Three commits, three lines.',
			hints: [
				'`git log` lists commits. Has anyone committed scene 5?',
				'Newest first: which of the three commits was made last?'
			]
		},
		{
			id: `${M}/04-a-branch-for-comments`,
			slug: '04-a-branch-for-comments',
			kind: 'code',
			language: 'shell',
			title: 'A branch for comments',
			xp: 20,
			story:
				'Theo wants readers to comment on episodes, and the comments endpoint will take a few tries to get right. Meanwhile Mina is working from `main`, the studio’s real version, and it needs to stay exactly as it is until comments are ready.',
			task: 'Make a branch called `comments` and move onto it with `git switch -c comments`. Add the line `POST /episodes/:id/comments` to the end of `menu.md` and commit it. Then `git switch main` and `cat menu.md`: on main, the new line shouldn’t be there.',
			concept: {
				title: 'Branches',
				panels: [
					{ who: 'mina', text: 'If you change the menu now, does my copy change too?' },
					{
						who: 'you',
						text: 'Not if I work on a **branch**. A branch is just a label pointing at a commit. The studio’s real one is called `main`.'
					},
					{
						who: 'narrator',
						text: '`git switch -c comments` sticks a new label, `comments`, on the commit you’re on, and moves you onto it.',
						code: 'git switch -c comments'
					},
					{
						who: 'bit',
						text: 'New commits only move the label you’re on. `main` stays where it was, so Mina’s version doesn’t change at all.'
					},
					{
						who: 'you',
						text: '`git switch main` jumps back, and the files in the folder change to match. `git branch` lists the labels, with a `*` next to the one you’re on.'
					}
				]
			},
			world: world(
				{ 'notes.txt': NOTES, 'server.js': SERVER, 'menu.md': MENU, 'episode-9.txt': SCRIPT },
				FIRST_SAVE
			),
			starterCode: `# Make the branch and move onto it:
git switch -c comments
`,
			solution: `git switch -c comments
echo "${COMMENTS_LINE}" >> menu.md
git add menu.md
git commit -m "Add comments to the menu"
git switch main
cat menu.md
git branch
`,
			newCommands: ['git switch -c <name>', 'git switch <branch>', 'git branch <name>'],
			checks: [
				{ type: 'git-branch', name: 'comments' },
				{
					type: 'git-commits',
					min: 2,
					message:
						'There’s no new commit yet. On `comments`, add the line to `menu.md` with `>>`, then `git add menu.md` and `git commit -m "Add comments to the menu"`.'
				},
				{
					type: 'git-head',
					branch: 'main',
					message: 'Finish back on `main` with `git switch main`, to see that it hasn’t changed.'
				},
				{
					type: 'git-file',
					path: 'menu.md',
					equals: MENU,
					message:
						'On `main`, `menu.md` should still be the old menu. Make the change after `git switch -c comments`, so it lands on the branch.'
				},
				{ type: 'git-clean' }
			],
			hints: [
				'After `git switch -c comments`, everything you commit goes on the `comments` branch. Add the line with `echo "POST /episodes/:id/comments" >> menu.md`.',
				'Then `git add menu.md`, `git commit -m "Add comments to the menu"`, `git switch main`, and `cat menu.md` to look.',
				`Here’s one way:\n\`\`\`\ngit switch -c comments\necho "${COMMENTS_LINE}" >> menu.md\ngit add menu.md\ngit commit -m "Add comments to the menu"\ngit switch main\ncat menu.md\ngit branch\n\`\`\``
			]
		},
		{
			id: `${M}/05-bring-it-home`,
			slug: '05-bring-it-home',
			kind: 'code',
			language: 'shell',
			title: 'Bring it home',
			xp: 15,
			story:
				'Two commits later, the `comments` branch has the new menu line and the endpoint in `server.js`. Theo has tried it on the test phones and loves it. Time to make comments part of the real version.',
			task: 'You’re on `comments`. Switch to `main`, bring the work in with `git merge comments`, then run `git log` to see where the labels are now.',
			concept: {
				title: 'Merging, the easy way',
				body: '`git merge comments` brings the work from `comments` into the branch you’re on. Here `main` hasn’t moved since the branch began, so there’s nothing to combine: git just slides the `main` label forward to the newest commit. Git calls that a **fast-forward**.'
			},
			world: world(
				{ 'notes.txt': NOTES, 'server.js': SERVER, 'menu.md': MENU },
				`${FIRST_SAVE}
git switch -c comments
echo "${COMMENTS_LINE}" >> menu.md
git add menu.md
git commit -m "Add comments to the menu"
echo "app.post('/episodes/:id/comments', addComment);" >> server.js
git add server.js
git commit -m "Comments endpoint"`
			),
			starterCode: `# You're on the comments branch right now.
git switch main
`,
			solution: `git switch main
git merge comments
git log
`,
			newCommands: ['git merge <branch>'],
			checks: [
				{ type: 'git-merged', branch: 'comments', into: 'main' },
				{ type: 'git-head', branch: 'main' },
				{ type: 'git-file', path: 'menu.md', committed: true, includes: COMMENTS_LINE },
				{
					type: 'shell-output-includes',
					text: 'HEAD -> main, comments',
					message:
						'Finish with `git log` on `main`. After the merge, the top line shows `main` and `comments` on the same commit.'
				}
			],
			hints: [
				'Merging brings another branch into the one you’re on, so be on `main` first.',
				'After `git switch main`, add `git merge comments`, then `git log`.',
				'Here’s the whole thing:\n```\ngit switch main\ngit merge comments\ngit log\n```'
			]
		},
		{
			id: `${M}/06-same-line-twice`,
			slug: '06-same-line-twice',
			kind: 'predict',
			language: 'shell',
			title: 'Same line, twice',
			xp: 15,
			story:
				'Theo had an idea for the ending of episode 9 and, being Theo, wrote it himself on a branch called `theo-ending` (with a note in `notes.txt` while he was at it). Meanwhile Mina rewrote the same ending line on `main`.',
			task: 'Read the command and pick what happens.',
			concept: {
				title: 'Merge conflicts',
				panels: [
					{
						who: 'mina',
						text: 'Theo and I both rewrote the ending, on different branches. Is that bad?'
					},
					{
						who: 'you',
						text: 'Only if it’s the same lines. When branches changed different files, or different parts of a file, git combines them by itself.'
					},
					{
						who: 'narrator',
						text: 'When both changed the same line, git won’t guess whose words win. It stops and calls it a **merge conflict**.'
					},
					{
						who: 'bit',
						text: 'It writes both versions into the file between markers, then waits for a human.',
						code: "<<<<<<< HEAD\nMina's ending\n=======\nTheo's ending\n>>>>>>> theo-ending"
					},
					{ who: 'theo', text: 'So a conflict means something broke?' },
					{
						who: 'you',
						text: 'It means two people disagreed, and git is asking you to decide. Nothing is lost: both versions are right there.'
					}
				]
			},
			world: ENDINGS_WORLD,
			code: `git merge theo-ending
`,
			question: 'You’re on `main` and run `git merge theo-ending`. What happens?',
			choices: [
				'A fast-forward: `main` slides along to Theo’s commit, and Mina’s ending is replaced',
				'Git keeps both endings, one after the other, and makes a merge commit',
				'A conflict in `episode-9.txt`: git stops and asks you to choose. Theo’s note in `notes.txt` comes in without any fuss',
				'Conflicts in both files, because both branches changed something'
			],
			answer: 2,
			explanation:
				'Both branches moved on from the first save, so this can’t be a fast-forward: git has to combine them. `notes.txt` was only changed on Theo’s branch, so his note comes in on its own. The ending line was changed on both, differently, so git prints `CONFLICT (content): Merge conflict in episode-9.txt`, writes both endings into the file between `<<<<<<<` and `>>>>>>>` markers, and leaves the merge unfinished until someone decides.',
			hints: [
				'Has `main` moved since `theo-ending` began? If it has, a fast-forward is off the table.',
				'Git combines changes on its own when they don’t overlap. Which file did both branches change?'
			]
		},
		{
			id: `${M}/07-pick-an-ending`,
			slug: '07-pick-an-ending',
			kind: 'fix',
			language: 'shell',
			title: 'Pick an ending',
			xp: 25,
			story:
				'Over coffee, Mina and Theo agree: Theo’s twist wins. Mina had a go at finishing the merge, but her commands save the file with git’s markers still in it, so the script would go to the letterer with `<<<<<<< HEAD` in the middle of the ending.',
			task: `Run it and read the \`cat\` output. Then fix it: after the merge, write the file again so it holds only the title and Theo’s ending (\`>\` for the first line, \`>>\` for the second), then add and commit.`,
			world: ENDINGS_WORLD,
			starterCode: `git merge theo-ending
cat episode-9.txt
git add episode-9.txt
git commit -m "Merge Theo's ending"
`,
			solution: `git merge theo-ending
cat episode-9.txt
echo "${TITLE}" > episode-9.txt
echo "${THEO_ENDING}" >> episode-9.txt
git add episode-9.txt
git commit -m "Merge Theo's ending"
`,
			newCommands: ['echo "text" > file'],
			checks: [
				{ type: 'git-file', path: 'episode-9.txt', committed: true, includes: THEO_ENDING },
				{ type: 'git-file', path: 'episode-9.txt', committed: true, includes: TITLE },
				{ type: 'git-merged', branch: 'theo-ending', into: 'main' },
				{ type: 'git-clean' }
			],
			hints: [
				'In the `cat` output, the lines between `<<<<<<< HEAD` and `=======` are Mina’s ending; the lines after `=======` are Theo’s. The finished file shouldn’t have any marker lines at all.',
				`Between the \`cat\` and the \`git add\`, write the file again: \`echo "${TITLE}" > episode-9.txt\` replaces everything, then \`>>\` adds Theo’s ending underneath.`,
				`Here’s one way:\n\`\`\`\ngit merge theo-ending\ncat episode-9.txt\necho "${TITLE}" > episode-9.txt\necho "${THEO_ENDING}" >> episode-9.txt\ngit add episode-9.txt\ngit commit -m "Merge Theo's ending"\n\`\`\``
			]
		},
		{
			id: `${M}/08-episode-nine`,
			slug: '08-episode-nine',
			kind: 'code',
			language: 'shell',
			boss: true,
			title: 'Episode 9, the git way',
			xp: 50,
			story:
				'Mina is ready to write episode 9 for real, scene by scene, and Theo has one rule: `main` only ever holds finished work. One last job before the USB stick is retired: do the whole thing the git way.',
			task: 'Make a branch called `episode-9`. On it, add two scenes to `episode-9.txt` with `>>`, committing after each one, with messages that mention “Scene 1” and “Scene 2”. Then go back to `main`, merge `episode-9`, and finish with `git log`.',
			world: world(
				{ 'notes.txt': NOTES, 'server.js': SERVER, 'menu.md': MENU, 'episode-9.txt': `${TITLE}\n` },
				FIRST_SAVE
			),
			starterCode: `# Branch, two scenes (one commit each), back to main, merge, log.
git status
`,
			solution: `git switch -c episode-9
echo "Scene 1: Hana gets a parcel with no address." >> episode-9.txt
git add episode-9.txt
git commit -m "Scene 1"
echo "Scene 2: The parcel hums whenever she walks north." >> episode-9.txt
git add episode-9.txt
git commit -m "Scene 2"
git switch main
git merge episode-9
git log
`,
			checks: [
				{ type: 'git-branch', name: 'episode-9' },
				{ type: 'git-message-includes', text: 'Scene 1' },
				{ type: 'git-message-includes', text: 'Scene 2' },
				{
					type: 'git-commits',
					min: 3,
					message:
						'One commit per scene: there should be two new commits on top of the first save.'
				},
				{ type: 'git-merged', branch: 'episode-9', into: 'main' },
				{ type: 'git-head', branch: 'main' },
				{
					type: 'git-file',
					path: 'episode-9.txt',
					committed: true,
					includes: 'Scene 2',
					message:
						'The script on `main` should have both scenes in it. Add them to `episode-9.txt` with `>>` on the branch, then merge.'
				},
				{ type: 'git-clean' },
				{
					type: 'shell-output-includes',
					text: 'HEAD -> main, episode-9',
					message:
						'Finish with `git log` on `main`. After the merge, the top line should show both `main` and `episode-9` on the newest commit.'
				}
			],
			hints: [
				'Start with `git switch -c episode-9`. Then, for each scene: `echo "Scene 1: …" >> episode-9.txt`, `git add episode-9.txt`, `git commit -m "Scene 1"`.',
				'After the second commit: `git switch main`, `git merge episode-9`, `git log`. Since `main` hasn’t moved, the merge is a fast-forward.',
				'Here’s one way (write your own scenes if you like):\n```\ngit switch -c episode-9\necho "Scene 1: Hana gets a parcel with no address." >> episode-9.txt\ngit add episode-9.txt\ngit commit -m "Scene 1"\necho "Scene 2: The parcel hums whenever she walks north." >> episode-9.txt\ngit add episode-9.txt\ngit commit -m "Scene 2"\ngit switch main\ngit merge episode-9\ngit log\n```'
			],
			outro: {
				panels: [
					{
						who: 'theo',
						text: 'So if someone asks which version of episode 9 is the real one…'
					},
					{
						who: 'you',
						text: '…it’s whatever `main` says. Every save has a note and an author, and scenes go in on a branch first, so nothing gets pasted over by accident.'
					},
					{ who: 'mina', text: 'And if I do paste over a scene again?' },
					{ who: 'you', text: '`git restore`, and it’s back. About ten seconds.' },
					{
						who: 'theo',
						text: 'Then the USB stick can go in a drawer. I’m keeping it, mind. Sentimental reasons.'
					}
				]
			}
		}
	]
};
