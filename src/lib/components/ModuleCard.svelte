<!-- A region on the map: one module with its trail of levels. -->
<script lang="ts">
	import type { Theme } from '#lib/curriculum/types.ts';
	import { renderText } from '#lib/curriculum/index.ts';
	import type { MapModule } from '#lib/stores/map.ts';
	import LessonNode from './LessonNode.svelte';

	let { entry, theme, index }: { entry: MapModule; theme: Theme; index: number } = $props();

	const title = $derived(renderText(entry.module.title, theme));
	const blurb = $derived(renderText(entry.module.blurb, theme));
	const complete = $derived(entry.total > 0 && entry.done === entry.total);
	const pct = $derived(entry.total ? Math.round((entry.done / entry.total) * 100) : 0);
</script>

<section
	class="card relative overflow-hidden p-5 sm:p-6 {entry.comingSoon || !entry.unlocked
		? 'opacity-70'
		: ''}"
	aria-labelledby="module-{entry.module.id}"
	data-testid="module-card"
>
	{#if complete}
		<div
			class="bg-accent pointer-events-none absolute inset-x-0 top-0 h-1.5"
			aria-hidden="true"
		></div>
	{/if}
	<header class="flex items-start gap-4">
		<div
			class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl {entry.unlocked
				? 'bg-accent-soft'
				: 'bg-sand grayscale'}"
			aria-hidden="true"
		>
			{entry.module.emoji}
		</div>
		<div class="min-w-0 flex-1">
			<p class="eyebrow">Part {index + 1}</p>
			<h2 id="module-{entry.module.id}" class="text-xl leading-tight font-extrabold">{title}</h2>
			<p class="text-ink-soft mt-1">{blurb}</p>
		</div>
		<div class="hidden shrink-0 text-right sm:block">
			{#if entry.comingSoon}
				<span class="chip bg-sand text-ink-soft">coming soon</span>
			{:else if complete}
				<span class="chip bg-good-soft text-good">all done ✓</span>
			{:else if !entry.unlocked}
				<span class="chip bg-sand text-muted">🔒 locked</span>
			{:else}
				<span class="text-ink-soft text-sm font-bold">{entry.done} of {entry.total}</span>
			{/if}
		</div>
	</header>

	{#if !entry.comingSoon}
		<div class="mt-2 flex items-center gap-3 sm:hidden">
			<div class="bg-sand h-1.5 flex-1 overflow-hidden rounded-full">
				<div class="bg-accent h-full rounded-full" style:width="{pct}%"></div>
			</div>
			<span class="text-ink-soft text-xs font-bold">{entry.done} of {entry.total}</span>
		</div>

		<ol
			class="trail mt-5 flex gap-x-2 gap-y-4 overflow-x-auto pt-2 pb-2"
			aria-label="Levels in {title}"
		>
			{#each entry.lessons as item, i (item.lesson.id)}
				<li class="relative flex shrink-0 items-start">
					{#if i > 0}
						<span
							class="connector mt-[1.35rem] mr-2 h-0.5 w-5 shrink-0 rounded {item.state ===
								'done' || entry.lessons[i - 1].state === 'done'
								? 'bg-accent/60'
								: 'bg-line'}"
							aria-hidden="true"
						></span>
					{/if}
					<LessonNode
						number={i + 1}
						title={renderText(item.lesson.title, theme)}
						state={item.state}
						href={item.href}
						boss={item.lesson.boss}
						kind={item.lesson.kind}
					/>
				</li>
			{/each}
		</ol>
		{#if !entry.unlocked}
			<p class="text-muted mt-2 text-sm">Opens when you beat the last level of the part before.</p>
		{/if}
	{:else}
		<p class="text-muted mt-4 text-sm">
			<span class="chip bg-sand text-ink-soft sm:hidden">coming soon</span>
			We're still building this part. It'll show up here when it's ready.
		</p>
	{/if}
</section>

<style>
	.trail {
		scrollbar-width: thin;
		mask-image: linear-gradient(to right, black calc(100% - 1.5rem), transparent);
	}
	@media (min-width: 768px) {
		.trail {
			flex-wrap: wrap;
			overflow: visible;
			mask-image: none;
		}
	}
</style>
