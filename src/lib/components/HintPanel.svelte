<!--
  Progressive hints: a nudge, a bigger clue, then the answer. Revealed one at a time.
  `used` (bindable) is how many hints are showing, which the page reports on completion.
-->
<script lang="ts">
	import RichText from './RichText.svelte';

	let { hints, used = $bindable(0) }: { hints: string[]; used?: number } = $props();

	const left = $derived(hints.length - used);
	const nextLabel = $derived(
		used === 0
			? 'Give me a nudge'
			: left === 1 && hints.length > 1
				? 'Show me how'
				: 'One more clue, please'
	);

	export function revealNext() {
		if (used < hints.length) used++;
	}
</script>

{#if hints.length}
	<section class="space-y-3" aria-labelledby="hints-heading">
		<div class="flex items-center justify-between gap-2">
			<h3 id="hints-heading" class="eyebrow">Hints</h3>
			{#if used > 0}<span class="text-muted text-xs">{used} of {hints.length}</span>{/if}
		</div>
		{#if used === 0}
			<p class="text-ink-soft text-sm">
				Stuck? That's normal. Hints start small, so you still get to figure it out.
			</p>
		{/if}
		<ol class="space-y-2" aria-live="polite">
			{#each hints.slice(0, used) as hint, i (i)}
				<li
					class="animate-fade-up border-line bg-warn-soft/70 flex gap-2.5 rounded-2xl border px-4 py-3 text-[0.95rem]"
				>
					<span aria-hidden="true">{i === hints.length - 1 && hints.length > 1 ? '🗝️' : '💡'}</span>
					<RichText text={hint} class="min-w-0 flex-1" />
				</li>
			{/each}
		</ol>
		{#if used === hints.length && hints.length > 1}
			<p class="text-ink-soft text-sm">
				That's every hint. Next level, try one fewer — you'll get there.
			</p>
		{/if}
		{#if left > 0}
			<button type="button" class="btn btn-quiet w-full text-sm" onclick={revealNext}>
				<span aria-hidden="true">💡</span>
				{nextLabel}
			</button>
		{/if}
	</section>
{/if}
