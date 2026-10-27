<script lang="ts">
	import { APP_NAME } from '#lib/config.ts';
	import { getModules, getTheme, renderText, totalLessonCount } from '#lib/curriculum/index.ts';
	import ModuleCard from '#lib/components/ModuleCard.svelte';
	import XpBar from '#lib/components/XpBar.svelte';
	import { guest } from '#lib/stores/guest.svelte.ts';
	import { buildMap, type StatusMap } from '#lib/stores/map.ts';
	import { currentThemeId } from '#lib/stores/viewer.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const modules = getModules();
	const theme = $derived(getTheme(currentThemeId()));
	const user = $derived(data.user);

	const status = $derived.by((): StatusMap => {
		if (user) return data.status;
		const s: StatusMap = {};
		for (const [id, e] of Object.entries(guest.entries)) s[id] = e.completedAt ? 'done' : 'started';
		return s;
	});

	const map = $derived(buildMap(modules, status));
	const doneTotal = $derived(Object.values(status).filter((s) => s === 'done').length);
	const total = totalLessonCount();
	const firstVisit = $derived(doneTotal === 0);
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
	<div class="mb-8 grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
		<div>
			<p class="eyebrow mb-1">{theme.emoji} {theme.name} vibe</p>
			<h1 class="text-3xl font-black tracking-tight sm:text-4xl">
				{#if user}
					{firstVisit ? `Welcome, ${user.displayName}.` : `Welcome back, ${user.displayName}.`}
				{:else}
					{firstVisit ? 'Your map' : 'Nice, you’re on your way.'}
				{/if}
			</h1>
			<p class="text-ink-soft mt-2">
				{#if firstVisit}
					Each dot is a tiny level. Start at the first one; the next opens when you finish it.
				{:else}
					{doneTotal} of {total} levels done. Pick up where you left off.
				{/if}
			</p>
		</div>
		{#if map.current && currentModule}
			<a
				href="/learn/{map.current.id}"
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
							: 'streak — keep it going'}
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div
			class="border-accent/50 bg-accent-soft/60 mb-8 flex flex-col gap-3 rounded-2xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="text-sm">
				<span class="chip text-accent-ink mr-2 bg-white">playing as guest</span>
				Your progress is saved in this browser only. Sign up to keep it everywhere.
			</p>
			<a href="/signup" class="btn btn-quiet min-h-0 shrink-0 py-2 text-sm">Create a free account</a
			>
		</div>
	{/if}

	<div class="space-y-5">
		{#each map.modules as entry, i (entry.module.id)}
			<ModuleCard {entry} {theme} index={i} />
		{/each}
	</div>
</div>
