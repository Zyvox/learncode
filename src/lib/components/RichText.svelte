<!--
  Renders curriculum text that has already gone through renderText(). Markdown-lite only:
  `code`, **bold**, line breaks, paragraphs and fenced ```js blocks. Input is escaped first.
-->
<script lang="ts">
	import { markdownLite } from './richtext.ts';

	let {
		text,
		inline = false,
		class: className = ''
	}: { text: string; inline?: boolean; class?: string } = $props();

	const html = $derived(markdownLite(text ?? '', { inline }));
</script>

{#if inline}
	<span class="rich {className}">{@html html}</span>
{:else}
	<div class="rich {className}">{@html html}</div>
{/if}

<style>
	.rich :global(p + p) {
		margin-top: 0.6em;
	}
	.rich :global(p + pre),
	.rich :global(pre + p) {
		margin-top: 0.6em;
	}
	.rich :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
		padding: 0.08em 0.38em;
		border-radius: 0.4em;
		background: color-mix(in oklab, var(--accent) 10%, #f4ede2);
		color: #3b2f27;
		white-space: pre-wrap;
	}
	.rich :global(pre) {
		margin: 0.6em 0;
		padding: 0.8em 1em;
		border-radius: 0.85rem;
		background: #2a2420;
		color: #f6efe6;
		overflow-x: auto;
		font-size: 0.92em;
		line-height: 1.5;
	}
	.rich :global(pre code) {
		background: none;
		padding: 0;
		color: inherit;
		white-space: pre;
	}
	.rich :global(strong) {
		font-weight: 800;
	}
</style>
