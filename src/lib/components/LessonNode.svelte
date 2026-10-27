<!-- One stop on a module's trail: done ✓, current (pulsing), available, or locked. -->
<script lang="ts">
	import type { NodeState } from '#lib/stores/map.ts';

	let {
		number,
		title,
		state,
		href,
		boss = false,
		kind = 'code'
	}: {
		number: number;
		title: string;
		state: NodeState;
		href: string;
		boss?: boolean;
		kind?: 'code' | 'fix' | 'predict';
	} = $props();

	const kindLabel = $derived(kind === 'fix' ? 'fix the bug' : kind === 'predict' ? 'predict' : '');
	const stateLabel = $derived(
		state === 'done'
			? 'done'
			: state === 'current'
				? 'up next'
				: state === 'locked'
					? 'locked'
					: 'open'
	);
	const label = $derived(
		`Level ${number}: ${title}${boss ? ' (boss level)' : ''}${kindLabel ? `, ${kindLabel}` : ''}, ${stateLabel}`
	);
</script>

{#snippet dot()}
	<span
		class="node relative grid shrink-0 place-items-center rounded-full font-extrabold transition-transform {boss
			? 'h-14 w-14 text-xl'
			: 'h-11 w-11 text-base'} {state}"
		aria-hidden="true"
	>
		{#if state === 'done'}
			<svg viewBox="0 0 20 20" class="h-5 w-5" fill="none"
				><path
					d="M4.5 10.5l3.5 3.5 7.5-8"
					stroke="currentColor"
					stroke-width="2.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
		{:else if state === 'locked'}
			<svg viewBox="0 0 20 20" class="h-4.5 w-4.5" fill="currentColor"
				><path
					d="M10 2a4 4 0 0 0-4 4v2H5.5A1.5 1.5 0 0 0 4 9.5v7A1.5 1.5 0 0 0 5.5 18h9a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14.5 8H14V6a4 4 0 0 0-4-4zm-2.5 6V6a2.5 2.5 0 0 1 5 0v2z"
				/></svg
			>
		{:else if boss}
			👑
		{:else}
			{number}
		{/if}
		{#if boss && state === 'done'}<span class="absolute -top-2 -right-1 text-base">👑</span>{/if}
	</span>
{/snippet}

{#if state === 'locked'}
	<span
		class="group flex flex-col items-center gap-1.5"
		role="img"
		aria-label={label}
		title="Finish the level before this one to open it"
	>
		{@render dot()}
		<span class="caption">{title}</span>
	</span>
{:else}
	<a
		{href}
		class="group flex flex-col items-center gap-1.5 rounded-2xl no-underline"
		aria-label={label}
		aria-current={state === 'current' ? 'step' : undefined}
		data-state={state}
	>
		{@render dot()}
		<span class="caption">{title}</span>
	</a>
{/if}

<style>
	.node.done {
		background: var(--accent);
		color: var(--on-accent);
		box-shadow: 0 3px 0 color-mix(in oklab, var(--accent) 60%, #1d1714);
	}
	.node.current {
		background: white;
		color: var(--color-accent-ink);
		border: 3px solid var(--accent);
		animation: var(--animate-pulse-ring);
	}
	.node.available {
		background: white;
		color: var(--color-ink-soft);
		border: 2px solid color-mix(in oklab, var(--accent) 40%, var(--color-line));
	}
	.node.locked {
		background: var(--color-sand);
		color: #b9ad9f;
		border: 2px dashed #ddd0bf;
	}
	a:hover .node {
		transform: translateY(-2px) scale(1.05);
	}
	.caption {
		max-width: 6.5rem;
		text-align: center;
		font-size: 0.75rem;
		line-height: 1.2;
		font-weight: 600;
		color: var(--color-ink-soft);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	span.group .caption {
		color: #b0a598;
	}
	a[data-state='current'] .caption {
		color: var(--color-ink);
		font-weight: 800;
	}
</style>
