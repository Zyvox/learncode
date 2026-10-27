<!-- Level, title and progress toward the next level. -->
<script lang="ts">
	import { levelForXp } from '#lib/game/xp.ts';

	let { xp, compact = false }: { xp: number; compact?: boolean } = $props();

	const info = $derived(levelForXp(xp));
	const pct = $derived(Math.round(Math.max(0, Math.min(1, info.progress)) * 100));
</script>

{#if compact}
	<div
		class="flex min-w-0 items-center gap-2"
		title="{xp} XP · {info.xpIntoLevel}/{info.xpForNext} to next level"
	>
		<span
			class="bg-accent text-on-accent grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold"
			aria-hidden="true">{info.level}</span
		>
		<div class="hidden min-w-0 sm:block">
			<div class="truncate text-xs leading-tight font-bold">{info.title}</div>
			<div
				class="bg-sand mt-0.5 h-1.5 w-24 overflow-hidden rounded-full"
				role="progressbar"
				aria-label="Progress to level {info.level + 1}"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={pct}
			>
				<div
					class="bg-accent h-full rounded-full transition-[width] duration-700"
					style:width="{pct}%"
				></div>
			</div>
		</div>
		<span class="sr-only">Level {info.level}, {info.title}, {xp} XP</span>
	</div>
{:else}
	<div class="w-full">
		<div class="mb-1.5 flex items-baseline justify-between gap-2">
			<div class="font-extrabold">
				Level {info.level} <span class="text-ink-soft font-semibold">· {info.title}</span>
			</div>
			<div class="text-muted text-sm">{info.xpIntoLevel} / {info.xpForNext} XP</div>
		</div>
		<div
			class="bg-sand h-3 overflow-hidden rounded-full"
			role="progressbar"
			aria-label="Progress to level {info.level + 1}"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={pct}
		>
			<div
				class="bg-accent h-full rounded-full transition-[width] duration-700 ease-out"
				style:width="{pct}%"
			></div>
		</div>
		<div class="text-muted mt-1.5 text-xs">{xp} XP in total</div>
	</div>
{/if}
