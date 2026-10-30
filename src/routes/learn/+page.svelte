<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import { APP_NAME, STATIC } from '#lib/config.ts';
	import { lessonLink } from '#lib/links.ts';
	import { getModules, getTheme, renderText } from '#lib/curriculum/index.ts';
	import type { TrackId } from '#lib/curriculum/types.ts';
	import ModuleCard from '#lib/components/ModuleCard.svelte';
	import XpBar from '#lib/components/XpBar.svelte';
	import { guest } from '#lib/stores/guest.svelte.ts';
	import { buildTrackMap, type StatusMap } from '#lib/stores/map.ts';
	import { allTracks, isTrackId, loadTrackChoice, saveTrackChoice } from '#lib/stores/tracks.ts';
	import { currentThemeId } from '#lib/stores/viewer.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const modules = getModules();
	const tracks = allTracks(modules);
	const theme = $derived(getTheme(currentThemeId()));
	const user = $derived(data.user);

	// Which track tab is open: ?track=… wins, then the remembered choice, then the first track.
	// The static build prerenders one copy of this page (prerendering can't read the query
	// string), so there ?track=… is only picked up in the browser, by the effect below.
	const known = (v: string | null): v is TrackId => isTrackId(v) && tracks.some((t) => t.id === v);
	const readTrack = () => (STATIC && !browser ? null : page.url.searchParams.get('track'));
	const fromUrl = STATIC ? null : readTrack();
	let trackId = $state<TrackId>(known(fromUrl) ? fromUrl : tracks[0].id);
	onMount(() => {
		if (isTrackId(fromUrl)) return;
		const saved = loadTrackChoice();
		if (saved && tracks.some((t) => t.id === saved)) trackId = saved;
	});

	// Follow the URL while staying on this page, e.g. a link to /learn?track=web from the header.
	const urlTrack = $derived(readTrack());
	$effect(() => {
		const t = urlTrack;
		if (!known(t)) return;
		untrack(() => {
			if (trackId !== t) {
				trackId = t;
				saveTrackChoice(t);
			}
		});
	});

	function pickTrack(id: TrackId) {
		trackId = id;
		saveTrackChoice(id);
		const url = new URL(page.url.href);
		url.searchParams.set('track', id);
		replaceState(url, page.state);
	}

	function onTabKey(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		const i = tracks.findIndex((t) => t.id === trackId);
		const next = tracks[(i + (e.key === 'ArrowRight' ? 1 : tracks.length - 1)) % tracks.length];
		pickTrack(next.id);
		document.getElementById(`track-tab-${next.id}`)?.focus();
		e.preventDefault();
	}

	const status = $derived.by((): StatusMap => {
		if (user) return data.status;
		const s: StatusMap = {};
		for (const [id, e] of Object.entries(guest.entries)) s[id] = e.completedAt ? 'done' : 'started';
		return s;
	});

	const maps = $derived(
		Object.fromEntries(tracks.map((t) => [t.id, buildTrackMap(modules, status, t.id)]))
	);
	const map = $derived(maps[trackId] ?? maps[tracks[0].id]);
	const track = $derived(tracks.find((t) => t.id === trackId) ?? tracks[0]);
	const doneTotal = $derived(map.done);
	const total = $derived(map.total);
	const firstVisit = $derived(doneTotal === 0);
	const anyDone = $derived(Object.values(status).some((s) => s === 'done'));
	const isWeb = $derived(trackId === 'web');
	const currentModule = $derived(
		map.current
			? map.modules.find((m) => m.lessons.some((l) => l.lesson.id === map.current?.id))
			: undefined
	);
</script>

<svelte:head>
	<title>Your map · {APP_NAME}</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
	{#if tracks.length > 1}
		<div class="tabs mb-6" role="tablist" aria-label="Tracks">
			{#each tracks as t (t.id)}
				{@const m = maps[t.id]}
				<button
					type="button"
					role="tab"
					id="track-tab-{t.id}"
					class="tab"
					class:selected={t.id === trackId}
					aria-selected={t.id === trackId}
					aria-controls="track-panel"
					tabindex={t.id === trackId ? 0 : -1}
					onclick={() => pickTrack(t.id)}
					onkeydown={onTabKey}
					data-testid="track-tab-{t.id}"
				>
					<span class="text-2xl leading-none" aria-hidden="true">{t.emoji}</span>
					<span class="flex min-w-0 flex-col items-start text-left">
						<span class="leading-tight font-extrabold">{renderText(t.title, theme)}</span>
						<span class="text-muted text-xs font-bold">{m.done} of {m.total}</span>
					</span>
				</button>
			{/each}
		</div>
	{/if}
	<div class="mb-8 grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
		<div>
			<p class="eyebrow mb-1">
				{#if isWeb}✒️ The Inkwell story{:else}{theme.emoji} {theme.name} vibe{/if}
			</p>
			<h1 class="text-3xl font-black tracking-tight sm:text-4xl">
				{#if user}
					{anyDone ? `Welcome back, ${user.displayName}.` : `Welcome, ${user.displayName}.`}
				{:else}
					{anyDone ? 'Nice, you’re on your way.' : 'Your map'}
				{/if}
			</h1>
			<p class="text-ink-soft mt-2">
				{#if firstVisit && isWeb}
					{renderText(track.blurb, theme)} Start at the first dot; the next opens when you finish it.
				{:else if firstVisit}
					Each dot is a tiny level. Start at the first one; the next opens when you finish it.
				{:else}
					{doneTotal} of {total} levels done. Pick up where you left off.
				{/if}
			</p>
		</div>
		{#if map.current && currentModule}
			<a
				href={lessonLink(map.current.id)}
				class="btn btn-primary self-start px-5 py-3 md:self-end"
				data-testid="continue-button"
			>
				{firstVisit ? 'Start level 1' : 'Continue'}: {renderText(map.current.title, theme)}
				<span aria-hidden="true">→</span>
			</a>
		{/if}
	</div>

	{#if user}
		<div class="card mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-8">
			<div class="flex-1"><XpBar xp={user.xp} /></div>
			<div class="sm:border-line flex items-center gap-3 sm:border-l sm:pl-8">
				<span class="text-3xl" aria-hidden="true">🔥</span>
				<div>
					<div class="text-xl leading-none font-black">
						{user.streak} day{user.streak === 1 ? '' : 's'}
					</div>
					<div class="text-muted text-sm">
						{user.streak === 0
							? 'Finish a level today to start a streak'
							: 'in a row. Keep it going.'}
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div
			class="border-accent/50 bg-accent-soft/60 mb-8 flex flex-col gap-3 rounded-2xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between"
		>
			{#if STATIC}
				<p class="text-sm" data-testid="device-banner">
					<span class="chip text-accent-ink mr-2 bg-white">saved on this device</span>
					Your progress stays in this browser on this device. Once you've opened a level, it works offline
					too.
				</p>
				<a href={resolve('/profile')} class="btn btn-quiet min-h-0 shrink-0 py-2 text-sm"
					>Your progress</a
				>
			{:else}
				<p class="text-sm">
					<span class="chip text-accent-ink mr-2 bg-white">playing as guest</span>
					Your progress is saved in this browser only. Sign up to keep it everywhere.
				</p>
				<a href={resolve('/signup')} class="btn btn-quiet min-h-0 shrink-0 py-2 text-sm"
					>Create a free account</a
				>
			{/if}
		</div>
	{/if}

	<div
		id="track-panel"
		class="space-y-5"
		role={tracks.length > 1 ? 'tabpanel' : undefined}
		aria-labelledby={tracks.length > 1 ? `track-tab-${trackId}` : undefined}
		data-track={trackId}
	>
		{#each map.modules as entry, i (entry.module.id)}
			<ModuleCard {entry} {theme} index={i} ink={isWeb} />
		{/each}
	</div>
</div>

<style>
	.tabs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem;
		padding: 0.35rem;
		border-radius: 1.1rem;
		background: var(--color-sand);
		border: 1px solid var(--color-line);
	}
	.tab {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-height: 3.4rem;
		padding: 0.5rem 0.85rem;
		border-radius: 0.85rem;
		color: var(--color-ink-soft);
		transition:
			background-color 120ms ease,
			box-shadow 120ms ease;
	}
	.tab:hover:not(.selected) {
		background: color-mix(in oklab, white 60%, transparent);
	}
	.tab.selected {
		background: white;
		color: var(--color-ink);
		box-shadow: var(--shadow-soft);
	}
	@media (max-width: 420px) {
		.tab {
			padding: 0.45rem 0.55rem;
			gap: 0.45rem;
		}
	}
</style>
