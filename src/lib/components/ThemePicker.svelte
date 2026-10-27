<!--
  Pick a vibe. A radio group (works in forms without JS via `name`), styled as cards.
-->
<script lang="ts">
	import type { Theme, ThemeId } from '#lib/curriculum/types.ts';

	let {
		themes,
		value = $bindable(),
		name = 'themeId',
		legend = 'Pick a vibe',
		showLegend = false,
		compact = false,
		onpick
	}: {
		themes: Theme[];
		value?: ThemeId | null;
		name?: string;
		legend?: string;
		showLegend?: boolean;
		compact?: boolean;
		onpick?: (id: ThemeId) => void;
	} = $props();
</script>

<fieldset>
	<legend class={showLegend ? 'mb-3 font-bold' : 'sr-only'}>{legend}</legend>
	<div
		class="grid gap-2.5 {compact
			? 'grid-cols-2 sm:grid-cols-4'
			: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}"
	>
		{#each themes as theme (theme.id)}
			<label
				class="vibe group relative flex cursor-pointer flex-col rounded-2xl border-2 bg-white p-3 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] has-[:focus-visible]:ring-4 {compact
					? 'gap-0.5'
					: 'gap-1 sm:p-4'}"
				style:--vibe={theme.accent}
				class:checked={value === theme.id}
			>
				<input
					type="radio"
					{name}
					value={theme.id}
					class="sr-only"
					checked={value === theme.id}
					onchange={() => {
						value = theme.id;
						onpick?.(theme.id);
					}}
				/>
				<span class="flex items-center justify-between">
					<span class={compact ? 'text-2xl' : 'text-3xl'} aria-hidden="true">{theme.emoji}</span>
					<span
						class="tick grid h-6 w-6 place-items-center rounded-full text-xs font-black text-white"
						aria-hidden="true">✓</span
					>
				</span>
				<span class="font-extrabold">{theme.name}</span>
				{#if !compact}
					<span class="text-ink-soft text-sm leading-snug">{theme.tagline}</span>
					<span class="mt-1 text-lg tracking-wide" aria-hidden="true"
						>{theme.hero.emoji} {theme.item.emoji} {theme.goal.emoji}</span
					>
				{/if}
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.vibe {
		border-color: var(--color-line);
		--tw-ring-color: color-mix(in oklab, var(--vibe) 35%, transparent);
	}
	.vibe:hover {
		border-color: color-mix(in oklab, var(--vibe) 45%, var(--color-line));
	}
	.vibe.checked {
		border-color: var(--vibe);
		background: color-mix(in oklab, var(--vibe) 9%, white);
	}
	.tick {
		background: var(--vibe);
		opacity: 0;
		transform: scale(0.6);
		transition:
			opacity 150ms ease,
			transform 150ms ease;
	}
	.vibe.checked .tick {
		opacity: 1;
		transform: scale(1);
	}
</style>
