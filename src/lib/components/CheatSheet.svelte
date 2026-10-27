<!--
  Commands the learner has unlocked so far, as an accordion. Items arrive already rendered.
-->
<script lang="ts" module>
	export interface CheatItem {
		name: string;
		summary: string;
		example?: string;
		isNew?: boolean;
	}
</script>

<script lang="ts">
	import RichText from './RichText.svelte';

	let {
		items,
		title = 'Your commands',
		id = 'cheat'
	}: { items: CheatItem[]; title?: string; id?: string } = $props();
</script>

{#if items.length}
	<section aria-labelledby="{id}-heading">
		<h3 id="{id}-heading" class="eyebrow mb-2">{title}</h3>
		<div class="divide-line border-line divide-y overflow-hidden rounded-2xl border bg-white">
			{#each items as item (item.name)}
				<details class="group">
					<summary
						class="hover:bg-sand flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden"
					>
						<span class="flex items-center gap-2">
							<code class="text-accent-ink font-mono text-[0.95rem] font-semibold">{item.name}</code
							>
							{#if item.isNew}<span class="chip bg-accent-soft text-accent-ink">new</span>{/if}
						</span>
						<svg
							class="text-muted h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
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
					<div class="text-ink-soft space-y-2 px-4 pb-3 text-sm">
						<RichText text={item.summary} />
						{#if item.example}
							<pre
								class="overflow-x-auto rounded-xl bg-[#2a2420] px-3 py-2 font-mono text-[0.85rem] text-[#f6efe6]"><code
									>{item.example}</code
								></pre>
						{/if}
					</div>
				</details>
			{/each}
		</div>
	</section>
{/if}
