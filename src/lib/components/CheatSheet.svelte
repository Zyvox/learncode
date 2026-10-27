<!--
  Commands the learner has unlocked so far, as an accordion. Items arrive already rendered.
  Long lists with `group`s (e.g. Phone / Server / Database / SQL) show one collapsed section per
  group; only the groups holding this lesson's new items start open, and new items start expanded.
-->
<script lang="ts" module>
	export interface CheatItem {
		name: string;
		summary: string;
		example?: string;
		isNew?: boolean;
		/** Section heading for long lists, e.g. 'Server' */
		group?: string;
	}

	/** Lists longer than this are split into their groups (when they have more than one). */
	export const GROUP_AFTER = 8;
</script>

<script lang="ts">
	import RichText from './RichText.svelte';

	let {
		items,
		title = 'Your commands',
		id = 'cheat'
	}: { items: CheatItem[]; title?: string; id?: string } = $props();

	const groups = $derived.by(() => {
		const order: string[] = [];
		const by = new Map<string, CheatItem[]>();
		for (const it of items) {
			const g = it.group ?? 'Other';
			if (!by.has(g)) {
				by.set(g, []);
				order.push(g);
			}
			by.get(g)!.push(it);
		}
		return order.map((name) => ({
			name,
			items: by.get(name)!,
			fresh: by.get(name)!.filter((i) => i.isNew).length
		}));
	});
	const grouped = $derived(items.length > GROUP_AFTER && groups.length > 1);
	/** Expand new items, unless a lesson brings so many that it would turn into a wall of text. */
	const openNew = $derived(items.filter((i) => i.isNew).length <= 3);
</script>

{#snippet itemList(list: CheatItem[])}
	<div class="divide-line border-line divide-y overflow-hidden rounded-2xl border bg-white">
		{#each list as item (item.name)}
			<details class="group" open={openNew && item.isNew}>
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
{/snippet}

{#if items.length}
	<section aria-labelledby="{id}-heading">
		<h3 id="{id}-heading" class="eyebrow mb-2">{title}</h3>
		{#if grouped}
			<div class="space-y-2">
				{#each groups as g (g.name)}
					<details class="group/sec" open={g.fresh > 0} data-testid="cheat-group">
						<summary
							class="hover:bg-sand flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 py-1.5 [&::-webkit-details-marker]:hidden"
						>
							<span class="text-ink text-sm font-extrabold"
								>{g.name} <span class="text-muted font-bold">· {g.items.length}</span></span
							>
							<span class="flex items-center gap-2">
								{#if g.fresh}<span class="chip bg-accent-soft text-accent-ink">{g.fresh} new</span
									>{/if}
								<svg
									class="text-muted h-4 w-4 shrink-0 transition-transform group-open/sec:rotate-180"
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
							</span>
						</summary>
						<div class="mt-1.5">{@render itemList(g.items)}</div>
					</details>
				{/each}
			</div>
		{:else}
			{@render itemList(items)}
		{/if}
	</section>
{/if}
