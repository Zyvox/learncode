<!--
  The play page body for one lesson. Mounted inside {#key lessonId} so every lesson starts fresh.
  Code lessons: story/task/concept/hints/cheat sheet · world · editor + Run/Reset/Hint · result.
  Predict lessons: read-only code + choices → explanation (and the world replays the code).
  Web lessons ("Behind the app"): the WebWorld picture, webtoon concept panels, and SQL mode
  (`lesson.language === 'sql'`) for the editor, the run button and the cheat sheet.
  Net lessons draw NetWorld (network or cloud), git lessons GitWorld with the shell editor
  (`lesson.language === 'shell'`). A lesson's `outro` shows in the pass banner.
-->
<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { getAllLessons, getModule, renderText } from '#lib/curriculum/index.ts';
	import type { Lesson, Module, Theme, ThemedText, WorldSpec } from '#lib/curriculum/types.ts';
	import type {
		GitResult,
		NetResult,
		RunResult,
		SqlResultSet,
		TraceEvent,
		WebResult
	} from '#lib/engine/types.ts';
	import { evaluate, verifySqlFor } from '#lib/engine/evaluate.ts';
	import { COMMANDS, SQL_COMMANDS, SYNTAX, type CommandDoc } from '#lib/engine/commands.ts';
	import { completionXp, levelForXp } from '#lib/game/xp.ts';
	import type { Badge } from '#lib/game/badges.ts';
	import { guest } from '#lib/stores/guest.svelte.ts';
	import { commandsUnlockedThrough, syntaxUnlockedThrough } from '#lib/stores/map.ts';
	import { lessonsOfTrack, trackOf } from '#lib/stores/tracks.ts';
	import type { SessionUser } from '#lib/stores/viewer.svelte.ts';
	import Editor from './Editor.svelte';
	import GridWorld from './GridWorld.svelte';
	import ConsoleWorld from './ConsoleWorld.svelte';
	import CanvasWorld from './CanvasWorld.svelte';
	import WebWorld from './WebWorld.svelte';
	import NetWorld from './NetWorld.svelte';
	import GitWorld from './GitWorld.svelte';
	import ComicStrip from './ComicStrip.svelte';
	import RichText from './RichText.svelte';
	import HintPanel from './HintPanel.svelte';
	import CheatSheet, { type CheatItem } from './CheatSheet.svelte';
	import Celebration from './Celebration.svelte';
	import ResultBanner, { type Completion, type Outcome } from './ResultBanner.svelte';

	interface ServerProgress {
		status: 'done' | 'started';
		lastCode: string | null;
	}

	let {
		lesson,
		module,
		index,
		next,
		theme,
		user,
		progress,
		doneIds
	}: {
		lesson: Lesson;
		module: Module;
		index: number;
		next: Lesson | null | undefined;
		theme: Theme;
		user: SessionUser | null;
		progress: ServerProgress | null;
		doneIds: string[];
	} = $props();

	type WorldExtra = WebResult | NetResult | GitResult;
	type WorldHandle = {
		play(trace: TraceEvent[], extra?: WorldExtra): Promise<void>;
		reset(): void;
	};
	/** What the world component needs besides the trace: the web, net or git part of the result. */
	const extraOf = (result: RunResult): WorldExtra | undefined =>
		result.web ?? result.net ?? result.git;

	// ---------- static-ish derived bits ----------
	const r = (t: ThemedText) => renderText(t, theme);
	const isPredict = $derived(lesson.kind === 'predict');
	const starter = $derived(lesson.kind === 'predict' ? lesson.code : lesson.starterCode);
	const world: WorldSpec | undefined = $derived(lesson.world);
	const isSql = $derived(lesson.language === 'sql');
	const isShell = $derived(lesson.language === 'shell' || world?.kind === 'git');
	/** Worlds that need the wide layout (the picture over the editor) */
	const isWide = $derived(
		world?.kind === 'web' || world?.kind === 'net' || world?.kind === 'git'
	);
	const editorLanguage = $derived<'js' | 'sql' | 'shell'>(
		isSql ? 'sql' : isShell ? 'shell' : 'js'
	);
	const trackId = $derived(trackOf(module));
	/** Lessons of this lesson's track, in order: what the learner has met so far. */
	const trackLessons = $derived(lessonsOfTrack(trackId));
	const storyEmoji = $derived(trackId === 'web' ? module.emoji : theme.hero.emoji);
	const worldTitle = $derived(
		world?.kind === 'grid'
			? 'The world'
			: world?.kind === 'console'
				? 'Output'
				: world?.kind === 'canvas'
					? 'Canvas'
					: world?.kind === 'net'
						? world.flavour === 'cloud'
							? 'The cloud'
							: 'The network'
						: world?.kind === 'git'
							? 'Your project'
							: world?.kind === 'web' && world.role === 'sql'
								? 'The database'
								: 'Behind the app'
	);
	const roleChip = $derived.by(() => {
		const w = world;
		if (w?.kind === 'web') {
			return w.role === 'client'
				? { icon: '📱', text: 'You are: the phone' }
				: w.role === 'server'
					? { icon: '🖥️', text: 'You are: the server' }
					: { icon: '🗄️', text: 'You are: talking to the database' };
		}
		if (w?.kind === 'net') {
			if (w.flavour === 'cloud') return { icon: '🧑‍💻', text: 'You are: the operator' };
			const at = w.nodes.find((n) => n.id === w.at);
			return at?.kind === 'phone'
				? { icon: '📱', text: 'You are: on the phone' }
				: { icon: '💻', text: 'You are: on the laptop' };
		}
		if (w?.kind === 'git') return { icon: '⌨️', text: 'You are: at the terminal' };
		return null;
	});

	const title = $derived(r(lesson.title));
	const hints = $derived(lesson.hints.map(r));
	const alreadyDone = $derived(
		progress?.status === 'done' || doneIds.includes(lesson.id) || (!user && guest.isDone(lesson.id))
	);

	const nextPlayable = $derived.by(() => {
		if (!next) return null;
		const nextModuleId = next.id.split('/')[0];
		const m = getModule(nextModuleId);
		// Never hop into the other track: the end of a track goes back to the map.
		return m && !m.comingSoon && trackOf(m) === trackId ? next : null;
	});
	const nextHref = $derived(nextPlayable ? `/learn/${nextPlayable.id}` : '/learn');
	const nextLabel = $derived(
		nextPlayable
			? nextPlayable.id.split('/')[0] === module.id
				? 'Next level'
				: 'On to the next part'
			: 'Back to the map'
	);

	/** Cheat sheet keys: `move()` → 'move'; shell lines → `git commit`, `echo`. */
	const cheatKey = (s: string) => {
		const t = s.trim().toLowerCase();
		if (/^git\s/.test(t)) return t.split(/\s+/).slice(0, 2).join(' ');
		if (isShell) return t.split(/\s+/)[0];
		return t.replace(/\(.*$/, '').trim();
	};

	/** Which section of the cheat sheet a command goes in (long lists are grouped). */
	function groupOf(c: CommandDoc): string | undefined {
		const w = world;
		const own = (c as CommandDoc & { group?: string }).group;
		if (own) return own;
		if (w?.kind === 'web') {
			if (SQL_COMMANDS.includes(c)) return 'SQL';
			if (c.name.startsWith('db.')) return 'Database';
			return w.role === 'client' ? 'Phone' : 'Server';
		}
		if (w?.kind === 'git') return c.name.trim().startsWith('git') ? 'Git' : 'Files';
		return undefined;
	}

	/** Net commands exist in one flavour (network or cloud) or both. */
	const inFlavour = (c: CommandDoc, flavour: 'network' | 'cloud') =>
		!c.flavours || c.flavours.includes(flavour);

	const cheatItems = $derived.by((): CheatItem[] => {
		const w = world;
		const kind = w?.kind ?? 'grid';
		const pool = trackLessons.some((l) => l.id === lesson.id) ? trackLessons : getAllLessons();
		const unlocked = commandsUnlockedThrough(pool, lesson.id);
		const unlockedSet = new Set(unlocked.map(cheatKey));
		const fresh = new Set((lesson.newCommands ?? []).map(cheatKey));
		// Web world: only what exists in this lesson's role (the phone has no `app.get`).
		const docs: CommandDoc[] = isSql
			? SQL_COMMANDS
			: w?.kind === 'web'
				? COMMANDS.web.filter((c) => !c.roles || c.roles.includes(w.role))
				: w?.kind === 'net'
					? (COMMANDS.net ?? []).filter((c) => inFlavour(c, w.flavour ?? 'network'))
					: (COMMANDS[kind] ?? []);
		return docs
			.filter((c) => unlockedSet.has(cheatKey(c.name)))
			.filter((c, i, all) => all.findIndex((d) => d.name === c.name) === i)
			.map((c) => ({
				name: c.name,
				summary: r(c.summary),
				example: c.example,
				isNew: fresh.has(cheatKey(c.name)),
				group: groupOf(c)
			}));
	});

	const syntaxItems = $derived.by((): CheatItem[] => {
		if (isSql || isShell) return [];
		const all = trackLessons.some((l) => l.id === lesson.id) ? trackLessons : getAllLessons();
		const here = syntaxUnlockedThrough(all, lesson.id);
		// Never flagged as "new": starters are full of comments and loops long before a lesson
		// is about them. Only commands (from `newCommands`) get the "new" chip.
		return SYNTAX.filter((s) => here.has(s.id)).map((s) => ({
			name: s.name,
			summary: r(s.summary),
			example: s.example,
			isNew: false
		}));
	});

	// ---------- play state ----------
	const initialCode = untrack(() => progress?.lastCode ?? starter);
	let code = $state(initialCode);
	let lastSaved = initialCode;
	let hintsUsed = $state(0);
	let attempts = $state(0);
	let outcome = $state<Outcome | null>(null);
	let busy = $state(false);
	let errorLine = $state<number | null>(null);
	let fast = $state(false);
	let confirmReset = $state(false);
	let conceptOpen = $state(true);
	let showNudge = $state(false);
	let chosen = $state<number | null>(null);
	let lastPassCode = '';
	/** The database before any learner code ran, for the web world's database panel */
	let baseTables = $state<Record<string, SqlResultSet> | undefined>();
	/** git world: the folder and history after the lesson's setup, before the learner's commands */
	let gitBase = $state<GitResult | undefined>();

	let worldRef: WorldHandle | undefined = $state();
	let hintPanel: ReturnType<typeof HintPanel> | undefined = $state();
	let celebration: ReturnType<typeof Celebration> | undefined = $state();
	let bannerEl: HTMLElement | undefined = $state();
	let hintsEl: HTMLElement | undefined = $state();

	const stepMs = $derived(fast ? 90 : 220);
	const edited = $derived(code !== starter);

	onMount(() => {
		peekDatabase();
		peekGit();
		if (!user && !isPredict) {
			guest.load();
			const saved = guest.entries[lesson.id]?.code;
			if (saved && !progress) {
				code = saved;
				lastSaved = saved;
			}
		}
	});

	// ---------- drafts (debounced 1.5s) ----------
	$effect(() => {
		if (isPredict) return;
		const current = code;
		if (current === lastSaved) return;
		const t = setTimeout(() => saveDraft(current), 1500);
		return () => clearTimeout(t);
	});

	async function saveDraft(value: string) {
		lastSaved = value;
		if (!user) {
			guest.saveDraft(lesson.id, value);
			return;
		}
		try {
			await fetch('/api/progress/draft', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonId: lesson.id, code: value })
			});
		} catch {
			// Drafts are best-effort; the next edit will try again.
			lastSaved = '';
		}
	}

	// ---------- running ----------
	let runId = 0;

	async function execute(source: string): Promise<RunResult | null> {
		if (!world) return null;
		const { runInWorker } = await import('#lib/engine/worker.ts');
		// db-rows checks need their SQL run after the learner's code, inside the worker.
		const verifySql = lesson.kind === 'predict' ? [] : verifySqlFor(lesson.checks);
		return runInWorker(source, world, { timeoutMs: 3000, verifySql });
	}

	/**
	 * Web world: run nothing (no learner code, no requests) once, just to show what the database
	 * holds before the first Run. Best effort; the panel falls back to the schema's table names.
	 */
	async function peekDatabase() {
		const spec = world;
		if (spec?.kind !== 'web' || !spec.schema) return;
		if (spec.show && !spec.show.includes('database')) return;
		try {
			const { runInWorker } = await import('#lib/engine/worker.ts');
			const result = await runInWorker('', { ...spec, requests: [] }, { timeoutMs: 3000 });
			const tables = result.web?.tables;
			if (tables && Object.keys(tables).length) baseTables = tables;
		} catch {
			// Not important enough to bother the learner with.
		}
	}

	/** git world: run the setup alone once so the folder and history show before the first Run. */
	async function peekGit() {
		const spec = world;
		if (spec?.kind !== 'git' || !spec.setup?.trim()) return;
		try {
			const { runInWorker } = await import('#lib/engine/worker.ts');
			const result = await runInWorker('', spec, { timeoutMs: 3000 });
			if (result.git) gitBase = result.git;
		} catch {
			// The picture falls back to the spec's files.
		}
	}

	function stop() {
		runId++;
		busy = false;
		worldRef?.reset();
		outcome = null;
	}

	async function run() {
		const l = lesson;
		if (l.kind === 'predict') return;
		if (busy) return stop();
		const id = ++runId;
		busy = true;
		attempts++;
		errorLine = null;
		confirmReset = false;
		outcome = { kind: 'running' };
		worldRef?.reset();
		const source = code;
		let result: RunResult | null;
		try {
			result = await execute(source);
		} catch (e) {
			result = null;
			outcome = {
				kind: 'error',
				message: 'Something went wrong while starting your code. Try pressing Run again.',
				raw: e instanceof Error ? e.message : String(e)
			};
		}
		if (id !== runId) return;
		if (!result) {
			busy = false;
			return;
		}
		await worldRef?.play(result.trace, extraOf(result));
		if (id !== runId) return;
		busy = false;

		if (!result.ok) {
			const err = result.error;
			errorLine = err?.line ?? null;
			outcome = {
				kind: 'error',
				message: err
					? r(err.message)
					: result.timedOut
						? 'Your code took too long to finish. Is there a loop that never stops?'
						: 'Your code stopped before it finished.',
				line: err?.line,
				raw: err?.raw ?? ''
			};
		} else {
			const ev = evaluate(l, result, source);
			if (ev.passed) {
				await pass(source);
			} else {
				outcome = {
					kind: 'failed',
					failures: ev.failures.length
						? ev.failures.map(r)
						: [
								'It ran without errors, but it didn’t do quite what the task asks. Read the task once more?'
							]
				};
			}
		}
		await tick();
		bannerEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	// ---------- passing ----------
	function moduleCompletedBy(lessonId: string): boolean {
		return module.lessons.every((l) => l.id === lessonId || guest.isDone(l.id));
	}

	async function pass(source: string, explanation?: string) {
		lastPassCode = source;
		celebration?.fire(!!lesson.boss);
		if (!user) {
			const res = guest.complete(lesson.id, {
				code: source,
				hintsUsed,
				attempts,
				xp: completionXp(lesson.xp, { hintsUsed, completesModule: moduleCompletedBy(lesson.id) })
			});
			const before = levelForXp(res.totalXp - res.xpGained);
			const after = levelForXp(res.totalXp);
			outcome = {
				kind: 'passed',
				explanation,
				completion: {
					...res,
					levelUp: after.level > before.level ? { level: after.level, title: after.title } : null,
					newBadges: [],
					streak: null,
					saving: false,
					saveFailed: false
				}
			};
			lastSaved = source;
			if (!guest.nudgeDismissed) {
				showNudge = true;
				guest.dismissNudge(); // only ever offered once
			}
			return;
		}

		const completion: Completion = {
			firstTime: !alreadyDone,
			xpGained: 0,
			totalXp: user.xp,
			levelUp: null,
			newBadges: [],
			streak: null,
			saving: true,
			saveFailed: false
		};
		outcome = { kind: 'passed', explanation, completion };
		await saveCompletion(source, explanation);
	}

	async function saveCompletion(source: string, explanation?: string) {
		if (!user) return;
		const prevLevel = levelForXp(user.xp).level;
		try {
			const res = await fetch('/api/progress/complete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					lessonId: lesson.id,
					code: source,
					hintsUsed,
					attempts,
					localHour: new Date().getHours()
				})
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as {
				firstTime: boolean;
				xpGained: number;
				totalXp: number;
				level: { level: number; title: string };
				streak: number;
				newBadges: Badge[];
			};
			lastSaved = source;
			outcome = {
				kind: 'passed',
				explanation,
				completion: {
					firstTime: data.firstTime,
					xpGained: data.xpGained,
					totalXp: data.totalXp,
					levelUp:
						data.level.level > prevLevel
							? { level: data.level.level, title: data.level.title }
							: null,
					newBadges: data.newBadges ?? [],
					streak: data.streak,
					saving: false,
					saveFailed: false
				}
			};
			attempts = 0;
			// Refresh the header's XP / streak.
			invalidateAll();
		} catch {
			if (outcome?.kind === 'passed') {
				outcome = {
					...outcome,
					completion: { ...outcome.completion, saving: false, saveFailed: true }
				};
			}
		}
	}

	// ---------- predict ----------
	async function choose(i: number) {
		const l = lesson;
		if (l.kind !== 'predict' || busy) return;
		chosen = i;
		attempts++;
		const correct = i === l.answer;
		const explanation = r(l.explanation);
		if (correct) await pass(l.code, explanation);
		else outcome = { kind: 'wrong', explanation };
		await tick();
		bannerEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		// Show what the code really does.
		if (world) {
			busy = true;
			const id = ++runId;
			const result = await execute(l.code).catch(() => null);
			if (result && id === runId) await worldRef?.play(result.trace, extraOf(result));
			if (id === runId) busy = false;
		}
	}

	function pickAgain() {
		chosen = null;
		outcome = null;
		worldRef?.reset();
	}

	// ---------- toolbar ----------
	let resetTimer: ReturnType<typeof setTimeout> | undefined;
	function reset() {
		if (edited && !confirmReset) {
			confirmReset = true;
			clearTimeout(resetTimer);
			resetTimer = setTimeout(() => (confirmReset = false), 4000);
			return;
		}
		clearTimeout(resetTimer);
		confirmReset = false;
		runId++;
		busy = false;
		code = starter;
		errorLine = null;
		outcome = null;
		worldRef?.reset();
	}

	async function hint() {
		hintPanel?.revealNext();
		await tick();
		hintsEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	function onWindowKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.defaultPrevented) {
			e.preventDefault();
			run();
		}
	}

	const runLabel = $derived(isSql ? 'Run query' : isShell ? 'Run commands' : 'Run');
	const editorLabel = $derived(isSql ? 'Your SQL' : isShell ? 'Your commands' : 'Your code');
	const outro = $derived(lesson.outro);

	const kindChip = $derived(
		lesson.kind === 'fix'
			? { icon: '🐞', text: 'Something’s broken here' }
			: lesson.kind === 'predict'
				? { icon: '🔮', text: 'What will happen?' }
				: null
	);
</script>

<svelte:window onkeydown={onWindowKey} />

{#snippet outroBlock()}
	{#if outro}
		<div class="space-y-3" data-testid="outro">
			<p class="eyebrow">What just happened</p>
			{#if outro.panels?.length}
				<ComicStrip panels={outro.panels} {theme} />
			{/if}
			{#if outro.text}
				<RichText text={r(outro.text)} class="text-ink-soft" />
			{/if}
		</div>
	{/if}
{/snippet}

<Celebration bind:this={celebration} />

<div class="mx-auto max-w-[96rem] px-4 pt-5 pb-32 sm:px-6 lg:pb-16">
	<!-- Title row -->
	<div class="mb-5 flex flex-col gap-2">
		<nav aria-label="Breadcrumb" class="text-muted flex flex-wrap items-center gap-1.5 text-sm">
			<a href="/learn" class="text-ink-soft hover:text-ink font-bold">← Map</a>
			<span aria-hidden="true">·</span>
			<span>{module.emoji} {r(module.title)}</span>
			<span aria-hidden="true">·</span>
			<span>Level {index + 1} of {module.lessons.length}</span>
		</nav>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
			<h1 class="text-2xl font-black tracking-tight sm:text-3xl" data-testid="lesson-title">
				{title}
			</h1>
			{#if lesson.boss}<span class="chip bg-[#fff0c2] text-[#7a5400]">👑 Boss level</span>{/if}
			{#if kindChip}
				<span class="chip bg-accent-soft text-accent-ink"
					><span aria-hidden="true">{kindChip.icon}</span>{kindChip.text}</span
				>
			{/if}
			{#if alreadyDone}<span class="chip bg-good-soft text-good">✓ done before</span>{/if}
		</div>
	</div>

	<div class="play-grid" class:no-world={!world} class:wide-world={isWide}>
		<!-- TEXT -->
		<div class="area-text space-y-5">
			<section class="card p-5" aria-label="Story and task">
				<div class="flex gap-3">
					<span class="text-3xl leading-none" aria-hidden="true">{storyEmoji}</span>
					<RichText text={r(lesson.story)} class="text-ink-soft" />
				</div>
				<div class="bg-accent-soft mt-4 rounded-2xl px-4 py-3">
					<p class="eyebrow !text-accent-ink mb-1">Your task</p>
					<RichText text={r(lesson.task)} class="font-semibold" />
				</div>
			</section>

			{#if outro && alreadyDone && outcome?.kind !== 'passed'}
				<details class="card group overflow-hidden" data-testid="outro-replay">
					<summary
						class="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden"
					>
						<span>
							<span class="eyebrow block">You cleared this one</span>
							<span class="text-lg font-extrabold">What happened next</span>
						</span>
						<svg
							class="text-muted h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
							viewBox="0 0 20 20"
							fill="none"
							aria-hidden="true"
							><path
								d="M5 8l5 5 5-5"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/></svg
						>
					</summary>
					<div class="px-5 pb-5">{@render outroBlock()}</div>
				</details>
			{/if}

			{#if lesson.concept}
				<details class="card group overflow-hidden" bind:open={conceptOpen}>
					<summary
						class="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden"
					>
						<span>
							<span class="eyebrow block">New idea</span>
							<span class="text-lg font-extrabold">{r(lesson.concept.title)}</span>
						</span>
						<svg
							class="text-muted h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
							viewBox="0 0 20 20"
							fill="none"
							aria-hidden="true"
							><path
								d="M5 8l5 5 5-5"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/></svg
						>
					</summary>
					<div class="space-y-4 px-5 pb-5">
						{#if lesson.concept.panels?.length}
							<ComicStrip panels={lesson.concept.panels} {theme} />
						{/if}
						{#if lesson.concept.body}
							<RichText text={r(lesson.concept.body)} class="text-ink-soft" />
						{/if}
					</div>
				</details>
			{/if}

			{#if hints.length}
				<div class="card p-5" bind:this={hintsEl}>
					<HintPanel {hints} bind:used={hintsUsed} bind:this={hintPanel} />
				</div>
			{/if}

			{#if cheatItems.length}
				<CheatSheet
					items={cheatItems}
					id="cheat-commands"
					title={isSql ? 'SQL so far' : isShell ? 'Commands so far' : 'Your commands'}
				/>
			{/if}
			{#if syntaxItems.length}
				<CheatSheet items={syntaxItems} title="JavaScript so far" id="cheat-syntax" />
			{/if}
		</div>

		<!-- WORLD -->
		{#if world}
			<section class="area-world card p-4 sm:p-5" aria-label="The world">
				<div class="mb-3 flex items-center justify-between gap-2">
					<div class="flex min-w-0 flex-col gap-1">
						<h2 class="eyebrow">{worldTitle}</h2>
						{#if roleChip}
							<span class="chip bg-sand text-ink-soft self-start" data-testid="role-chip"
								><span aria-hidden="true">{roleChip.icon}</span>{roleChip.text}</span
							>
						{/if}
					</div>
					<button
						type="button"
						class="btn btn-ghost min-h-0 px-2.5 py-1 text-xs"
						aria-pressed={fast}
						onclick={() => (fast = !fast)}
						title="Animation speed"
					>
						<span aria-hidden="true">{fast ? '🐇' : '🐢'}</span>
						{fast ? 'Fast' : 'Normal speed'}
					</button>
				</div>
				{#if world.kind === 'grid'}
					<GridWorld spec={world} {theme} {stepMs} bind:this={worldRef} />
				{:else if world.kind === 'console'}
					<ConsoleWorld spec={world} {stepMs} bind:this={worldRef} />
				{:else if world.kind === 'canvas'}
					<CanvasWorld spec={world} {stepMs} bind:this={worldRef} />
				{:else if world.kind === 'web'}
					<WebWorld spec={world} {stepMs} {baseTables} bind:this={worldRef} />
				{:else if world.kind === 'net'}
					<NetWorld spec={world} {stepMs} bind:this={worldRef} />
				{:else if world.kind === 'git'}
					<GitWorld spec={world} {stepMs} base={gitBase} bind:this={worldRef} />
				{/if}
			</section>
		{/if}

		<!-- EDITOR / PREDICT -->
		<section
			class="area-editor space-y-4"
			aria-label={lesson.kind === 'predict' ? 'The code and your answer' : 'Your code'}
		>
			{#if lesson.kind === 'predict'}
				<div class="card space-y-4 p-4 sm:p-5">
					<h2 class="eyebrow">Read this code</h2>
					<Editor
						value={lesson.code}
						readonly
						label="Code to read"
						minLines={3}
						language={editorLanguage}
					/>
					<p class="text-lg font-extrabold"><RichText text={r(lesson.question)} inline /></p>
					<div class="grid gap-2" role="group" aria-label="Choices">
						{#each lesson.choices as choice, i (i)}
							{@const isAnswer = i === lesson.answer}
							{@const picked = chosen === i}
							<button
								type="button"
								class="choice flex items-start gap-3 rounded-2xl border-2 bg-white px-4 py-3 text-left transition-all"
								class:picked
								class:right={chosen !== null && picked && isAnswer}
								class:wrong={chosen !== null && picked && !isAnswer}
								disabled={chosen !== null}
								aria-pressed={picked}
								onclick={() => choose(i)}
								data-testid="choice"
							>
								<span
									class="bg-sand grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black"
									aria-hidden="true">{String.fromCharCode(65 + i)}</span
								>
								<RichText text={r(choice)} class="min-w-0 flex-1 pt-0.5" />
								{#if chosen !== null && picked}
									<span aria-hidden="true">{isAnswer ? '✅' : '❌'}</span>
									<span class="sr-only">{isAnswer ? 'Correct' : 'Not correct'}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{:else}
				<div class="card p-3 sm:p-4">
					<div class="mb-2 flex items-center justify-between px-1">
						<h2 class="eyebrow">{editorLabel}</h2>
						<span class="text-muted hidden text-xs sm:inline">Ctrl/⌘ + Enter runs it</span>
					</div>
					<Editor
						bind:value={code}
						{run}
						{errorLine}
						label={editorLabel}
						minLines={7}
						language={editorLanguage}
					/>
					<div class="mt-3 hidden flex-wrap items-center gap-2 lg:flex">
						<button
							type="button"
							class="btn btn-primary px-6"
							onclick={run}
							data-testid="run-button"
						>
							{#if busy}<span aria-hidden="true">■</span> Stop{:else}<span aria-hidden="true"
									>▶</span
								>
								{runLabel}{/if}
						</button>
						<button type="button" class="btn btn-quiet" onclick={reset} aria-live="polite">
							{confirmReset ? 'Sure? Click again to reset' : 'Reset'}
						</button>
						{#if hints.length && hintsUsed < hints.length}
							<button type="button" class="btn btn-ghost" onclick={hint}>
								<span aria-hidden="true">💡</span> Hint
							</button>
						{/if}
					</div>
				</div>
			{/if}

			<div bind:this={bannerEl} class="scroll-mb-28">
				{#if outcome}
					<ResultBanner
						{outcome}
						boss={lesson.boss}
						{nextHref}
						{nextLabel}
						heroEmoji={trackId === 'web' ? '📦' : theme.hero.emoji}
						outro={outro ? outroBlock : undefined}
						onretry={pickAgain}
						onretrysave={() =>
							saveCompletion(
								lastPassCode,
								outcome?.kind === 'passed' ? outcome.explanation : undefined
							)}
					/>
				{/if}
			</div>

			{#if showNudge}
				<div
					class="card animate-fade-up flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
					role="complementary"
					aria-label="Save your progress"
				>
					<span class="text-2xl" aria-hidden="true">💾</span>
					<p class="flex-1 text-sm">
						<strong>Want to keep this progress?</strong> Create a free account and everything you've done
						so far comes with you.
					</p>
					<div class="flex gap-2">
						<a href="/signup" class="btn btn-primary min-h-0 py-2 text-sm">Create account</a>
						<button
							type="button"
							class="btn btn-ghost min-h-0 py-2 text-sm"
							onclick={() => (showNudge = false)}>Not now</button
						>
					</div>
				</div>
			{/if}
		</section>
	</div>
</div>

<!-- Mobile: sticky action bar -->
{#if lesson.kind !== 'predict'}
	<div
		class="border-line bg-paper/95 fixed inset-x-0 bottom-0 z-20 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
	>
		<div class="mx-auto flex max-w-xl items-center gap-2">
			<button
				type="button"
				class="btn btn-quiet px-3"
				onclick={reset}
				aria-label={confirmReset ? 'Confirm reset' : 'Reset code'}
			>
				{confirmReset ? 'Sure?' : '↺'}
			</button>
			{#if hints.length && hintsUsed < hints.length}
				<button type="button" class="btn btn-quiet px-3" onclick={hint} aria-label="Show a hint"
					>💡</button
				>
			{/if}
			<button
				type="button"
				class="btn btn-primary flex-1 text-lg"
				onclick={run}
				data-testid="run-button-mobile"
			>
				{#if busy}<span aria-hidden="true">■</span> Stop{:else}<span aria-hidden="true">▶</span>
					{runLabel}{/if}
			</button>
		</div>
	</div>
{/if}

<style>
	.play-grid {
		display: grid;
		gap: 1.25rem;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas:
			'world'
			'editor'
			'text';
	}
	.play-grid.no-world {
		grid-template-areas:
			'editor'
			'text';
	}
	.area-text {
		grid-area: text;
	}
	.area-world {
		grid-area: world;
		align-self: start;
	}
	.area-editor {
		grid-area: editor;
		min-width: 0;
	}
	@media (min-width: 1024px) {
		.play-grid {
			grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
			grid-template-areas:
				'text world'
				'text editor';
			grid-template-rows: auto 1fr;
			align-items: start;
		}
		.play-grid.no-world {
			grid-template-areas: 'text editor';
			grid-template-rows: auto;
		}
	}
	@media (min-width: 1360px) {
		.play-grid {
			grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr) minmax(0, 1fr);
			grid-template-areas: 'text world editor';
			grid-template-rows: auto;
		}
		.area-world {
			position: sticky;
			top: 5rem;
		}
		/* The web picture is wide: give it two columns and put the editor under it. */
		.play-grid.wide-world {
			grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
			grid-template-areas:
				'text world'
				'text editor';
			grid-template-rows: auto 1fr;
		}
		.play-grid.wide-world .area-world {
			position: static;
		}
	}
	.choice {
		border-color: var(--color-line);
	}
	.choice:hover:not(:disabled) {
		border-color: var(--accent);
		transform: translateY(-1px);
	}
	.choice:disabled {
		cursor: default;
	}
	.choice.right {
		border-color: var(--color-good);
		background: var(--color-good-soft);
	}
	.choice.wrong {
		border-color: var(--color-oops);
		background: var(--color-oops-soft);
	}
	.choice:disabled:not(.picked) {
		opacity: 0.6;
	}
</style>
