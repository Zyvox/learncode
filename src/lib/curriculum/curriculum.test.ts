import { describe, expect, it } from 'vitest';
import {
	DEFAULT_THEME_ID,
	MODULES,
	THEMES,
	THEME_IDS,
	getAllLessons,
	getLesson,
	getLessonContext,
	getModule,
	getModules,
	getNextLessonAfter,
	getTheme,
	pickThemed,
	renderText,
	totalLessonCount,
	getModulesForTrack,
	getLessonsForTrack,
	TRACKS,
	trackOf
} from '#lib/curriculum/index.ts';
import type { PredictFacts } from './facts/types.ts';
import type {
	Check,
	CodeLesson,
	GridWorldSpec,
	Lesson,
	Module,
	ThemedText,
	WebWorldSpec,
	WorldSpec
} from '#lib/curriculum/types.ts';

const SKIP_ENGINE = process.env.SKIP_ENGINE === '1';

/** Every command the engine exposes to learners, per world (bare names). */
const ENGINE_API: Record<WorldSpec['kind'], string[]> = {
	grid: [
		'move',
		'turnLeft',
		'turnRight',
		'pickUp',
		'say',
		'pathAhead',
		'pathLeft',
		'pathRight',
		'onItem',
		'atGoal',
		'itemsLeft'
	],
	console: ['print'],
	canvas: ['background', 'color', 'circle', 'rect', 'line', 'text'],
	// web world: bare names of COMMANDS.web and SQL_COMMANDS (see engine/commands.ts)
	web: [
		'get',
		'post',
		'put',
		'del',
		'show',
		'log',
		'res.status',
		'res.ok',
		'res.body',
		'res.json',
		'res.text',
		'app.get',
		'app.post',
		'app.put',
		'app.delete',
		'req.params',
		'req.query',
		'req.body',
		'req.headers',
		'res.send',
		'res.end',
		'db.all',
		'db.get',
		'db.run',
		'hash',
		'hashMatches',
		'escape',
		'env',
		'SELECT',
		'WHERE',
		'ORDER BY',
		'LIMIT',
		'COUNT(*)',
		'INSERT INTO',
		'UPDATE',
		'DELETE FROM',
		'JOIN',
		'GROUP BY'
	],
	// net world (networks and cloud), see engine/worlds/net.ts
	net: [
		'lookup',
		'ping',
		'connect',
		'trace',
		'allow',
		'block',
		'listen',
		'addRecord',
		'deploy',
		'scale',
		'route',
		'release',
		'health',
		'env',
		'log'
	],
	// git world: shell lines, see engine/worlds/git.ts
	git: [
		'git init',
		'git status',
		'git add',
		'git commit',
		'git log',
		'git branch',
		'git switch',
		'git merge',
		'git diff',
		'git restore',
		'echo',
		'cat',
		'ls'
	]
};
const ALL_API = new Set(Object.values(ENGINE_API).flat());
/** Only these are checked by "used before introduced" (SQL keywords and properties aren't calls). */
const CALLABLE_API = new Set(
	[...ENGINE_API.grid, ...ENGINE_API.console, ...ENGINE_API.canvas].filter((n) => !n.includes('.'))
);

/**
 * Target lesson counts per track. Content authors: when you add or remove a level, update your
 * module's row here (and only yours).
 */
const EXPECTED_MODULES: Record<string, [id: string, lessons: number][]> = {
	code: [
		['first-steps', 8],
		['doing-it-again', 8],
		['making-choices', 8],
		['your-own-commands', 6],
		['remembering-things', 8],
		['drawing-with-code', 7],
		['tiny-game', 5],
		['python-basics', 0],
		['web-pages', 0]
	],
	web: [
		['what-happens-when-you-tap', 6],
		['requests-and-responses', 7],
		['endpoints', 6],
		['your-first-server', 8],
		['sending-data-in', 6],
		['where-the-data-lives', 7],
		['changing-data', 6],
		['connecting-tables', 6],
		['server-meets-database', 8],
		['the-reader-app', 6],
		['who-are-you', 6],
		['shipping-it', 7],
		['launch-inkwell', 6],
		['networks-for-it', 0],
		['command-line', 0],
		['git-and-versions', 0],
		['security-basics', 0],
		['reading-logs', 0],
		['cloud-and-containers', 0],
		['apis-in-the-wild', 0],
		['automation-scripts', 0]
	]
};

/** Predict-lesson facts from every facts/*.ts file. */
const factFiles = import.meta.glob<{ FACTS: PredictFacts }>('./facts/*.ts', { eager: true });
const PREDICT_FACTS: PredictFacts = Object.assign(
	{},
	...Object.values(factFiles).map((f) => f.FACTS ?? {})
);

const LEFTOVER = /\{[A-Za-z][A-Za-z0-9]*\}/;

const playable = MODULES.filter((m) => !m.comingSoon);
const allLessons: { module: Module; lesson: Lesson }[] = playable.flatMap((module) =>
	module.lessons.map((lesson) => ({ module, lesson }))
);
const codeLessons = allLessons.filter(
	(e): e is { module: Module; lesson: CodeLesson } => e.lesson.kind !== 'predict'
);

function checkMessages(checks: Check[]): ThemedText[] {
	return checks.flatMap((c) => (c.message === undefined ? [] : [c.message]));
}

/** Every piece of themed text a lesson shows, labelled for error messages. */
function lessonTexts(lesson: Lesson): [string, ThemedText][] {
	const out: [string, ThemedText][] = [
		['title', lesson.title],
		['story', lesson.story],
		['task', lesson.task],
		...lesson.hints.map((h, i): [string, ThemedText] => [`hint ${i + 1}`, h])
	];
	if (lesson.concept) {
		out.push(['concept.title', lesson.concept.title]);
		if (lesson.concept.body !== undefined) out.push(['concept.body', lesson.concept.body]);
		lesson.concept.panels?.forEach((p, i) => out.push([`panel ${i + 1}`, p.text]));
	}
	if (lesson.kind === 'predict') {
		out.push(['question', lesson.question], ['explanation', lesson.explanation]);
		lesson.choices.forEach((c, i) => out.push([`choice ${i + 1}`, c]));
	} else {
		checkMessages(lesson.checks).forEach((m, i) => out.push([`check message ${i + 1}`, m]));
	}
	return out;
}

function bareName(command: string): string {
	// 'COUNT(*)' is a name in its own right; 'move()' and 'get(path)' are not
	if (command.endsWith('(*)')) return command;
	return command.replace(/\(.*$/, '').trim();
}

describe('themes', () => {
	it('has one theme per ThemeId, in order', () => {
		expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS]);
	});

	it('every theme defines the same vocab keys', () => {
		const keys = Object.keys(THEMES[0].vocab).sort();
		expect(keys).toEqual(['friend', 'greeting', 'place', 'reward', 'villain']);
		for (const t of THEMES) expect(Object.keys(t.vocab).sort()).toEqual(keys);
	});

	it('has the visual bits filled in and distinct accents', () => {
		for (const t of THEMES) {
			for (const s of [t.name, t.tagline, t.emoji, t.hero.name, t.hero.emoji, t.item.singular]) {
				expect(s.length).toBeGreaterThan(0);
			}
			expect(t.item.plural.length).toBeGreaterThan(0);
			expect(t.goal.name.length).toBeGreaterThan(0);
			expect(t.wall.name.length).toBeGreaterThan(0);
			expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i);
		}
		expect(new Set(THEMES.map((t) => t.accent)).size).toBe(THEMES.length);
	});

	it('getTheme falls back to the default', () => {
		expect(DEFAULT_THEME_ID).toBe('games');
		expect(getTheme('space').id).toBe('space');
		expect(getTheme('nope').id).toBe('games');
		expect(getTheme(undefined).id).toBe('games');
	});
});

describe('renderText', () => {
	const games = getTheme('games');
	const space = getTheme('space');

	it('fills theme placeholders, with capitalised variants', () => {
		expect(renderText('{Hero} grabs a {item} near the {goal}.', games)).toBe(
			'Pix grabs a coin near the treasure chest.'
		);
		expect(renderText('{Items} {items} {walls} {Place} {place}', games)).toBe(
			'Coins coins crates The dungeon the dungeon'
		);
		expect(renderText('{heroEmoji}{itemEmoji}{goalEmoji}', space)).toBe('🤖💎🛸');
		expect(renderText('{Villain} meets {friend}', space)).toBe(
			'The dust storm meets mission control'
		);
	});

	it('leaves unknown placeholders and code braces alone', () => {
		expect(renderText('{nope} and {Nope}', games)).toBe('{nope} and {Nope}');
		expect(renderText('while (x) { move(); }', games)).toBe('while (x) { move(); }');
	});

	it('picks per-theme text with a default fallback', () => {
		const t: ThemedText = { default: 'plain {hero}', space: 'orbit {hero}' };
		expect(renderText(t, space)).toBe('orbit Rova');
		expect(renderText(t, games)).toBe('plain Pix');
		expect(pickThemed(t, 'space')).toBe('orbit {hero}');
		expect(pickThemed(t, 'food')).toBe('plain {hero}');
		expect(pickThemed('same', 'food')).toBe('same');
	});
});

describe('module registry', () => {
	it('has the expected modules per track, in order, with the target lesson counts', () => {
		expect(getModules()).toBe(MODULES);
		expect(TRACKS.map((t) => t.id)).toEqual(['code', 'web']);
		for (const track of TRACKS) {
			const mods = getModulesForTrack(track.id);
			const expected = EXPECTED_MODULES[track.id];
			// Modules may exist before every planned one is written; compare what's there, in order.
			const present = expected.filter(([id]) => mods.some((m) => m.id === id));
			expect(
				mods.map((m) => [m.id, m.lessons.length]),
				track.id
			).toEqual(present);
			expect(
				mods.map((m) => m.order),
				`${track.id} order`
			).toEqual(
				mods
					.map((m) => m.order)
					.slice()
					.sort((a, b) => a - b)
			);
			expect(new Set(mods.map((m) => m.order)).size, `${track.id} duplicate order`).toBe(
				mods.length
			);
		}
		// map order: all code modules first, then web
		const tracks = MODULES.map((m) => trackOf(m));
		expect(tracks.lastIndexOf('code')).toBeLessThan(
			tracks.indexOf('web') === -1 ? Infinity : tracks.indexOf('web')
		);
	});

	it('coming-soon modules have no lessons; playable ones do', () => {
		for (const m of MODULES) {
			if (m.comingSoon) expect(m.lessons).toHaveLength(0);
			else expect(m.lessons.length).toBeGreaterThan(0);
		}
	});

	it('looks things up and walks the course in order', () => {
		const lessons = getAllLessons();
		expect(lessons.length).toBe(totalLessonCount());
		expect(getLessonsForTrack('code')).toHaveLength(50);
		expect(getModule('first-steps')?.order).toBe(1);
		expect(getModule('missing')).toBeUndefined();
		expect(getLesson(lessons[3].id)).toBe(lessons[3]);
		expect(getLesson('nope/nope')).toBeUndefined();

		const first = getLessonContext(lessons[0].id)!;
		expect(first.prev).toBeUndefined();
		expect(first.next).toBe(lessons[1]);
		expect(first.index).toBe(0);
		expect(first.module.id).toBe('first-steps');

		// crossing a module boundary
		const lastOfFirst = getModule('first-steps')!.lessons.at(-1)!;
		const ctx = getLessonContext(lastOfFirst.id)!;
		expect(ctx.index).toBe(7);
		expect(ctx.next?.id).toBe('doing-it-again/01-keep-going');
		expect(getNextLessonAfter(lastOfFirst.id)?.id).toBe('doing-it-again/01-keep-going');
		expect(getLessonContext('nope')).toBeUndefined();

		// next/prev never cross tracks
		const lastCode = getLessonsForTrack('code').at(-1)!;
		expect(getNextLessonAfter(lastCode.id)).toBeUndefined();
		const firstWeb = getLessonsForTrack('web')[0];
		if (firstWeb) expect(getLessonContext(firstWeb.id)!.prev).toBeUndefined();
	});
});

describe('lessons: structure', () => {
	it('module ids are unique kebab-case and have text', () => {
		const ids = MODULES.map((m) => m.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const m of MODULES) {
			expect(m.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
			for (const theme of THEMES) {
				expect(renderText(m.title, theme)).not.toMatch(LEFTOVER);
				expect(renderText(m.blurb, theme)).not.toMatch(LEFTOVER);
			}
		}
	});

	it('lesson ids are unique and equal `${module.id}/${slug}`', () => {
		const ids = allLessons.map((e) => e.lesson.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const { module, lesson } of allLessons) {
			expect(lesson.slug).toMatch(/^\d\d-[a-z0-9]+(-[a-z0-9]+)*$/);
			expect(lesson.id).toBe(`${module.id}/${lesson.slug}`);
		}
		for (const m of playable) {
			const slugs = m.lessons.map((l) => l.slug);
			expect(new Set(slugs).size).toBe(slugs.length);
			// slugs are numbered 01, 02, … in order
			slugs.forEach((s, i) => expect(s.slice(0, 2)).toBe(String(i + 1).padStart(2, '0')));
		}
	});

	it('xp, boss flags and hints follow the rules', () => {
		for (const m of playable) {
			m.lessons.forEach((l, i) => {
				const last = i === m.lessons.length - 1;
				expect(l.boss === true, `${l.id} boss`).toBe(last);
				if (last) {
					expect(l.xp, l.id).toBeGreaterThanOrEqual(40);
					expect(l.xp, l.id).toBeLessThanOrEqual(50);
				} else {
					expect(l.xp, l.id).toBeGreaterThanOrEqual(10);
					expect(l.xp, l.id).toBeLessThanOrEqual(25);
				}
				expect(l.hints.length, `${l.id} hints`).toBeGreaterThanOrEqual(2);
				expect(l.hints.length, `${l.id} hints`).toBeLessThanOrEqual(3);
			});
		}
	});

	it('has a healthy mix of lesson kinds', () => {
		const n = allLessons.length;
		const fix = allLessons.filter((e) => e.lesson.kind === 'fix').length;
		const predict = allLessons.filter((e) => e.lesson.kind === 'predict').length;
		expect(fix / n).toBeGreaterThanOrEqual(0.15);
		expect(predict / n).toBeGreaterThanOrEqual(0.1);
	});

	it('predict lessons have a valid answer', () => {
		for (const { lesson } of allLessons) {
			if (lesson.kind !== 'predict') continue;
			expect(lesson.choices.length, lesson.id).toBeGreaterThanOrEqual(2);
			expect(Number.isInteger(lesson.answer), lesson.id).toBe(true);
			expect(lesson.answer, lesson.id).toBeGreaterThanOrEqual(0);
			expect(lesson.answer, lesson.id).toBeLessThan(lesson.choices.length);
			expect(lesson.code.trim().length, lesson.id).toBeGreaterThan(0);
		}
	});

	it('code lessons have checks, a solution and a different starter', () => {
		for (const { lesson } of codeLessons) {
			expect(lesson.checks.length, lesson.id).toBeGreaterThan(0);
			expect(lesson.solution.trim(), lesson.id).not.toBe(lesson.starterCode.trim());
			for (const c of lesson.checks) {
				if ('pattern' in c) expect(() => new RegExp(c.pattern), lesson.id).not.toThrow();
			}
		}
	});

	it('grid worlds are in bounds and consistent', () => {
		const grids: [string, GridWorldSpec][] = [];
		for (const { lesson } of allLessons) {
			const w = lesson.kind === 'predict' ? lesson.world : lesson.world;
			if (w?.kind === 'grid') grids.push([lesson.id, w]);
		}
		expect(grids.length).toBeGreaterThan(20);
		for (const [id, g] of grids) {
			expect(g.width, id).toBeGreaterThanOrEqual(3);
			expect(g.width, id).toBeLessThanOrEqual(10);
			expect(g.height, id).toBeGreaterThanOrEqual(3);
			expect(g.height, id).toBeLessThanOrEqual(8);
			const inside = ([x, y]: [number, number]) =>
				Number.isInteger(x) &&
				Number.isInteger(y) &&
				x >= 0 &&
				y >= 0 &&
				x < g.width &&
				y < g.height;
			const k = ([x, y]: [number, number]) => `${x},${y}`;
			const walls = new Set((g.walls ?? []).map(k));
			expect(walls.size, `${id} duplicate walls`).toBe((g.walls ?? []).length);
			for (const w of g.walls ?? []) expect(inside(w), `${id} wall ${w}`).toBe(true);
			const hero: [number, number] = [g.hero.x, g.hero.y];
			expect(inside(hero), `${id} hero`).toBe(true);
			expect(walls.has(k(hero)), `${id} hero on a wall`).toBe(false);
			expect(['N', 'E', 'S', 'W']).toContain(g.hero.dir);
			if (g.goal) {
				expect(inside(g.goal), `${id} goal`).toBe(true);
				expect(walls.has(k(g.goal)), `${id} goal on a wall`).toBe(false);
			}
			const items = (g.items ?? []).map(k);
			expect(new Set(items).size, `${id} duplicate items`).toBe(items.length);
			for (const it of g.items ?? []) {
				expect(inside(it), `${id} item ${it}`).toBe(true);
				expect(walls.has(k(it)), `${id} item on a wall`).toBe(false);
				expect(k(it) === k(hero), `${id} item under the hero`).toBe(false);
			}
		}
	});

	it('every ThemedText renders for every theme with no leftover placeholder', () => {
		for (const { lesson } of allLessons) {
			for (const [label, text] of lessonTexts(lesson)) {
				if (typeof text !== 'string') {
					for (const key of Object.keys(text)) {
						expect(['default', ...THEME_IDS], `${lesson.id} ${label} key ${key}`).toContain(key);
					}
				}
				for (const theme of THEMES) {
					const out = renderText(text, theme);
					expect(out.trim().length, `${lesson.id} ${label} (${theme.id})`).toBeGreaterThan(0);
					expect(out, `${lesson.id} ${label} (${theme.id})`).not.toMatch(LEFTOVER);
				}
			}
		}
	});

	it('fenced code blocks are closed', () => {
		for (const { lesson } of allLessons) {
			for (const [label, text] of lessonTexts(lesson)) {
				for (const theme of THEME_IDS) {
					const fences = pickThemed(text, theme).match(/```/g)?.length ?? 0;
					expect(fences % 2, `${lesson.id} ${label}`).toBe(0);
				}
			}
		}
	});

	it('newCommands only name real engine commands, introduced once per track', () => {
		for (const track of TRACKS) {
			const seen = new Set<string>();
			for (const lesson of getLessonsForTrack(track.id)) {
				for (const cmd of lesson.newCommands ?? []) {
					expect(ALL_API.has(bareName(cmd)), `${lesson.id}: ${cmd}`).toBe(true);
					// web: `res.status` (client property) and `res.status(code)` (server method) differ
					const key = track.id === 'web' ? cmd : bareName(cmd);
					expect(seen.has(key), `${lesson.id}: ${cmd} introduced twice`).toBe(false);
					seen.add(key);
				}
			}
		}
	});

	it('solutions only use commands that have been introduced (within a track)', () => {
		for (const track of TRACKS) {
			const known = new Set<string>();
			for (const lesson of getLessonsForTrack(track.id)) {
				for (const cmd of lesson.newCommands ?? []) known.add(bareName(cmd));
				const code = lesson.kind === 'predict' ? lesson.code : lesson.solution;
				const api =
					track.id === 'web'
						? new Set(ENGINE_API.web.filter((n) => !n.includes('.') && /^[a-z]/.test(n)))
						: CALLABLE_API;
				for (const name of api) {
					if (new RegExp(`(^|[^.\\w])${name}\\s*\\(`).test(code)) {
						expect(known.has(name), `${lesson.id} uses ${name}() before it is introduced`).toBe(
							true
						);
					}
				}
			}
		}
	});

	it('web lessons are internally consistent', () => {
		for (const { module, lesson } of allLessons) {
			if (trackOf(module) !== 'web') continue;
			const world = lesson.kind === 'predict' ? lesson.world : lesson.world;
			expect(world?.kind, `${lesson.id} must use the web world`).toBe('web');
			const w = world as WebWorldSpec;
			if (w.role === 'sql')
				expect(lesson.language, `${lesson.id}: sql role needs language 'sql'`).toBe('sql');
			else
				expect(lesson.language ?? 'js', `${lesson.id}: only sql role uses language 'sql'`).toBe(
					'js'
				);
			if (w.role === 'server' && lesson.kind !== 'predict')
				expect(
					(w.requests ?? []).length,
					`${lesson.id}: server lessons need requests`
				).toBeGreaterThan(0);
			if (w.role === 'client' && !w.serverDown)
				expect(w.serverCode, `${lesson.id}: client lessons need serverCode`).toBeTruthy();
			if (lesson.concept?.panels) {
				expect(lesson.concept.panels.length, `${lesson.id} panels`).toBeGreaterThanOrEqual(2);
				expect(lesson.concept.panels.length, `${lesson.id} too many panels`).toBeLessThanOrEqual(8);
			}
		}
	});
});

describe('lessons: run against the real engine', async () => {
	if (SKIP_ENGINE) {
		// Lets the structural tests run before the engine exists: SKIP_ENGINE=1 npx vitest run …
		it.skip('engine checks skipped because SKIP_ENGINE=1', () => {});
		return;
	}
	const { runInNode } = await import('#lib/engine/node.ts');
	const { evaluate, verifySqlFor } = await import('#lib/engine/evaluate.ts');
	const { COMMANDS, SQL_COMMANDS } = await import('#lib/engine/commands.ts');

	it('newCommands match the engine cheat-sheet names exactly', () => {
		const names = new Set([
			...Object.values(COMMANDS).flatMap((list) => list.map((c) => c.name)),
			...SQL_COMMANDS.map((c) => c.name)
		]);
		for (const { lesson } of allLessons) {
			for (const cmd of lesson.newCommands ?? [])
				expect(names.has(cmd), `${lesson.id}: ${cmd}`).toBe(true);
		}
	});

	for (const { lesson } of codeLessons) {
		it(`${lesson.id}: the solution passes`, async () => {
			const result = await runInNode(lesson.solution, lesson.world, {
				verifySql: verifySqlFor(lesson.checks)
			});
			const verdict = evaluate(lesson, result, lesson.solution);
			const failures = verdict.failures.map((f) => renderText(f, getTheme(DEFAULT_THEME_ID)));
			expect(result.error?.raw, `${lesson.id} solution error`).toBeUndefined();
			expect(failures, `${lesson.id} solution`).toEqual([]);
			expect(verdict.passed).toBe(true);
		});

		it(`${lesson.id}: the starter code does not already pass`, async () => {
			const result = await runInNode(lesson.starterCode, lesson.world, {
				verifySql: verifySqlFor(lesson.checks)
			});
			const verdict = evaluate(lesson, result, lesson.starterCode);
			expect(verdict.passed, `${lesson.id} starter passes already`).toBe(false);
			expect(result.timedOut, `${lesson.id} starter hangs`).toBe(false);
		});
	}

	for (const { lesson } of allLessons) {
		if (lesson.kind !== 'predict') continue;
		it(`${lesson.id}: the predict code runs and the answer is true`, async () => {
			expect(lesson.world, `${lesson.id} needs a world to show`).toBeDefined();
			const result = await runInNode(lesson.code, lesson.world!);
			expect(result.ok, `${lesson.id}: ${result.error?.raw}`).toBe(true);
			const fact = PREDICT_FACTS[lesson.id];
			expect(fact, `${lesson.id} has no entry in curriculum/facts/*.ts`).toBeDefined();
			expect(fact.pick(result)).toEqual(fact.equals);
		});
	}
});
