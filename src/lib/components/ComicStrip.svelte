<!--
  A webtoon-style explainer: `concept.panels` as a vertical strip of rounded panels.
  Each panel: the speaker's avatar (emoji in a coloured circle), a speech bubble, an optional
  little scene drawing and an optional line of code. Narrator panels are captions.
  Text arrives as ThemedText and is rendered here with the current theme.
-->
<script lang="ts">
	import { renderText } from '#lib/curriculum/index.ts';
	import type { Panel, Theme } from '#lib/curriculum/types.ts';
	import { castMember } from '#lib/stores/tracks.ts';
	import RichText from './RichText.svelte';

	let { panels, theme }: { panels: Panel[]; theme: Theme } = $props();

	const items = $derived(
		panels.map((p, i) => {
			const narrator = !p.who || p.who === 'narrator';
			return {
				i,
				narrator,
				who: castMember(p.who),
				text: renderText(p.text, theme),
				scene: p.scene && p.scene !== 'none' ? p.scene : null,
				code: p.code,
				// Alternate sides so the strip reads like a conversation.
				flip: !narrator && (p.who === 'you' || p.who === 'bit')
			};
		})
	);
</script>

<ol class="strip" aria-label="Comic strip" data-testid="comic-strip">
	{#each items as item (item.i)}
		<li class="panel" class:narrator={item.narrator} style:--who={item.who.color}>
			{#if item.scene}
				<div class="scene" aria-hidden="true">
					<svg
						viewBox="0 0 64 40"
						width="64"
						height="40"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						{#if item.scene === 'phone'}
							<rect
								x="23"
								y="3"
								width="18"
								height="34"
								rx="4"
								stroke="currentColor"
								stroke-width="2.4"
							/>
							<path d="M29 7h6" stroke="currentColor" stroke-width="2" />
							<rect
								x="26.5"
								y="11"
								width="11"
								height="4"
								rx="1.5"
								fill="var(--who)"
								opacity=".55"
							/>
							<rect
								x="26.5"
								y="18"
								width="11"
								height="4"
								rx="1.5"
								fill="var(--who)"
								opacity=".35"
							/>
							<rect x="26.5" y="25" width="11" height="4" rx="1.5" fill="var(--who)" opacity=".2" />
						{:else if item.scene === 'server'}
							<rect
								x="18"
								y="5"
								width="28"
								height="12"
								rx="3"
								stroke="currentColor"
								stroke-width="2.4"
							/>
							<rect
								x="18"
								y="22"
								width="28"
								height="12"
								rx="3"
								stroke="currentColor"
								stroke-width="2.4"
							/>
							<circle cx="24" cy="11" r="1.8" fill="var(--who)" />
							<circle cx="24" cy="28" r="1.8" fill="var(--who)" />
							<path d="M30 11h11M30 28h11" stroke="currentColor" stroke-width="2" />
						{:else if item.scene === 'database'}
							<ellipse cx="32" cy="9" rx="13" ry="5" stroke="currentColor" stroke-width="2.4" />
							<path
								d="M19 9v21c0 2.8 5.8 5 13 5s13-2.2 13-5V9"
								stroke="currentColor"
								stroke-width="2.4"
							/>
							<path
								d="M19 19.5c0 2.8 5.8 5 13 5s13-2.2 13-5"
								stroke="var(--who)"
								stroke-width="2"
							/>
						{:else if item.scene === 'wire'}
							<path d="M4 20h56" stroke="currentColor" stroke-width="2.4" stroke-dasharray="3 5" />
							<rect x="25" y="12" width="14" height="14" rx="3" fill="var(--who)" opacity=".85" />
							<path d="M25 17h14M32 12v14" stroke="white" stroke-width="1.6" />
							<path d="M50 14l6 6-6 6" stroke="currentColor" stroke-width="2.4" />
						{:else if item.scene === 'cloud'}
							<path
								d="M20 32h26a9 9 0 0 0 0-18 12 12 0 0 0-23-2A9 9 0 0 0 20 32z"
								stroke="currentColor"
								stroke-width="2.4"
							/>
							<path d="M27 25h12" stroke="var(--who)" stroke-width="2.4" />
						{:else if item.scene === 'lock'}
							<rect
								x="21"
								y="17"
								width="22"
								height="18"
								rx="4"
								stroke="currentColor"
								stroke-width="2.4"
							/>
							<path d="M26 17v-5a6 6 0 0 1 12 0v5" stroke="currentColor" stroke-width="2.4" />
							<circle cx="32" cy="26" r="2.4" fill="var(--who)" />
						{/if}
					</svg>
				</div>
			{/if}

			{#if item.narrator}
				<div class="caption">
					<RichText text={item.text} />
				</div>
			{:else}
				<div class="talk" class:flip={item.flip}>
					<div class="avatar" title={item.who.name}>
						<span class="face" aria-hidden="true">{item.who.emoji}</span>
						<span class="name">{item.who.name}</span>
					</div>
					<div class="bubble">
						<span class="sr-only">{item.who.name} says:</span>
						<RichText text={item.text} />
					</div>
				</div>
			{/if}

			{#if item.code}
				<code class="code">{item.code}</code>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.strip {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.panel {
		position: relative;
		padding: 0.9rem 0.9rem 0.95rem;
		border-radius: 1.1rem;
		border: 2px solid #2b2521;
		background:
			radial-gradient(circle at 1px 1px, rgb(43 37 33 / 0.07) 1px, transparent 1.4px) 0 0 / 7px 7px,
			#fffdf8;
		box-shadow: 3px 3px 0 #2b2521;
		animation: panel-in 380ms ease-out both;
		animation-timeline: view();
		animation-range: entry 0% entry 60%;
	}
	.panel.narrator {
		background: #2b2521;
		color: #f6efe6;
		border-color: #2b2521;
		box-shadow: 3px 3px 0 color-mix(in oklab, var(--accent) 60%, #2b2521);
	}
	.scene {
		display: flex;
		justify-content: center;
		color: #2b2521;
		margin-bottom: 0.4rem;
	}
	.narrator .scene {
		color: #f6efe6;
	}
	.caption {
		font-weight: 700;
		font-size: 0.95rem;
		letter-spacing: 0.01em;
	}
	.caption :global(code) {
		background: #3d3530;
		color: #ffd9a8;
	}
	.talk {
		display: flex;
		align-items: flex-start;
		gap: 0.7rem;
	}
	.talk.flip {
		flex-direction: row-reverse;
	}
	.avatar {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		flex-shrink: 0;
		width: 3.2rem;
	}
	.face {
		display: grid;
		place-items: center;
		width: 2.8rem;
		height: 2.8rem;
		border-radius: 999px;
		font-size: 1.5rem;
		background: color-mix(in oklab, var(--who) 22%, white);
		box-shadow: inset 0 0 0 2px var(--who);
	}
	.name {
		font-size: 0.7rem;
		font-weight: 800;
		color: color-mix(in oklab, var(--who) 70%, #1d1714);
	}
	.bubble {
		position: relative;
		flex: 1;
		min-width: 0;
		padding: 0.6rem 0.8rem;
		border-radius: 1rem;
		background: white;
		border: 1.5px solid #2b2521;
		font-size: 0.97rem;
	}
	.bubble::before {
		content: '';
		position: absolute;
		top: 0.95rem;
		left: -0.45rem;
		width: 0.8rem;
		height: 0.8rem;
		background: white;
		border-left: 1.5px solid #2b2521;
		border-bottom: 1.5px solid #2b2521;
		transform: rotate(45deg);
	}
	.flip .bubble::before {
		left: auto;
		right: -0.45rem;
		transform: rotate(225deg);
	}
	.code {
		display: block;
		margin-top: 0.6rem;
		padding: 0.45rem 0.7rem;
		border-radius: 0.7rem;
		background: #2a2420;
		color: #f6efe6;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@keyframes panel-in {
		from {
			opacity: 0.2;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@supports not (animation-timeline: view()) {
		.panel {
			animation: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.panel {
			animation: none;
		}
	}
</style>
