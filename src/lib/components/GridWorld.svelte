<!--
  The grid world. Draws a GridWorldSpec with the vibe's emoji and replays a trace step by step:
  move slides the hero, turn swings the "facing" arrow, pickup pops the item, bump shakes,
  say shows a speech bubble. Call `play(trace)` (resolves when the animation finishes) and `reset()`.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import type { Direction, GridWorldSpec, Theme } from '#lib/curriculum/types.ts';
	import type { TraceEvent } from '#lib/engine/types.ts';

	let {
		spec,
		theme,
		stepMs = 220
	}: { spec: GridWorldSpec; theme: Theme; stepMs?: number } = $props();

	const DIR_DEG: Record<Direction, number> = { N: 0, E: 90, S: 180, W: 270 };
	const DIR_WORD: Record<Direction, string> = { N: 'up', E: 'right', S: 'down', W: 'left' };

	const key = (x: number, y: number) => `${x},${y}`;

	let hero = $state(untrack(() => ({ ...spec.hero })));
	let rotation = $state(untrack(() => DIR_DEG[spec.hero.dir]));
	let items = $state<string[]>(untrack(() => (spec.items ?? []).map(([x, y]) => key(x, y))));
	let popping = $state<string[]>([]);
	let collected = $state(0);
	let bubble = $state<string | null>(null);
	let bumping = $state(false);
	let turning = $state<'left' | 'right' | null>(null);
	let bumpDir = $state<Direction | null>(null);
	let playing = $state(false);
	let runToken = 0;

	const walls = $derived(new Set((spec.walls ?? []).map(([x, y]) => key(x, y))));
	const goalKey = $derived(spec.goal ? key(spec.goal[0], spec.goal[1]) : null);
	const totalItems = $derived(spec.items?.length ?? 0);
	const itemSet = $derived(new Set(items));
	const atGoal = $derived(goalKey !== null && key(hero.x, hero.y) === goalKey);

	const cells = $derived(
		Array.from({ length: spec.width * spec.height }, (_, i) => {
			const x = i % spec.width;
			const y = Math.floor(i / spec.width);
			return { x, y, k: key(x, y) };
		})
	);

	function resetState() {
		hero = { ...spec.hero };
		rotation = DIR_DEG[spec.hero.dir];
		items = (spec.items ?? []).map(([x, y]) => key(x, y));
		popping = [];
		collected = 0;
		bubble = null;
		bumping = false;
		bumpDir = null;
		turning = null;
	}

	// Re-draw whenever the spec changes (new lesson).
	$effect(() => {
		void spec;
		runToken++;
		playing = false;
		resetState();
	});

	export function reset() {
		runToken++;
		playing = false;
		resetState();
	}

	const reduced = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function wait(ms: number, token: number) {
		return new Promise<boolean>((resolve) =>
			setTimeout(() => resolve(token === runToken), reduced() ? Math.min(ms, 60) : ms)
		);
	}

	export async function play(trace: TraceEvent[]): Promise<void> {
		const token = ++runToken;
		resetState();
		playing = true;
		if (!(await wait(120, token))) return;
		let bubbleTimer = 0;
		for (const ev of trace) {
			if (token !== runToken) return;
			switch (ev.t) {
				case 'move':
					hero = { x: ev.to[0], y: ev.to[1], dir: ev.dir };
					break;
				case 'turn': {
					rotation += ev.dir === 'left' ? -90 : 90;
					hero = { ...hero, dir: ev.facing };
					turning = ev.dir;
					break;
				}
				case 'pickup': {
					if (ev.ok) {
						const k = key(ev.at[0], ev.at[1]);
						items = items.filter((i) => i !== k);
						popping = [...popping, k];
						collected++;
						setTimeout(() => (popping = popping.filter((p) => p !== k)), 450);
					} else {
						bubble = '🤷';
						bubbleTimer = 3;
					}
					break;
				}
				case 'say':
					bubble = ev.text;
					bubbleTimer = 6;
					break;
				case 'bump':
					bumpDir = ev.dir;
					bumping = true;
					break;
				default:
					continue; // print/draw/stopped don't animate here
			}
			if (!(await wait(stepMs, token))) return;
			turning = null;
			if (bubbleTimer > 0 && --bubbleTimer === 0) bubble = null;
		}
		if (!(await wait(Math.max(stepMs, 260), token))) return;
		playing = false;
		// Leave a final speech bubble up a little longer, then tidy.
		setTimeout(() => {
			if (token === runToken) bubble = null;
		}, 1800);
	}

	const describe = $derived(
		`A ${spec.width} by ${spec.height} grid. ${theme.hero.name} starts at column ${spec.hero.x + 1}, row ${
			spec.hero.y + 1
		}, facing ${DIR_WORD[spec.hero.dir]}.` +
			(totalItems
				? ` There ${totalItems === 1 ? 'is 1 ' + theme.item.singular : `are ${totalItems} ${theme.item.plural}`} to collect.`
				: '') +
			(spec.goal
				? ` ${theme.goal.name} is at column ${spec.goal[0] + 1}, row ${spec.goal[1] + 1}.`
				: '') +
			(spec.walls?.length ? ` ${spec.walls.length} ${theme.wall.name} block the way.` : '')
	);
</script>

<div class="world" data-testid="grid-world">
	<div
		class="board"
		style:--w={spec.width}
		style:--h={spec.height}
		role="img"
		aria-label={describe}
	>
		<div class="tiles">
			{#each cells as c (c.k)}
				<div
					class="tile"
					class:alt={(c.x + c.y) % 2 === 1}
					class:wall={walls.has(c.k)}
					class:goal={c.k === goalKey}
					class:reached={c.k === goalKey && atGoal && !playing}
				>
					{#if walls.has(c.k)}
						<span class="emoji">{theme.wall.emoji}</span>
					{:else if c.k === goalKey}
						<span class="emoji goal-emoji">{theme.goal.emoji}</span>
					{/if}
					{#if itemSet.has(c.k)}
						<span class="emoji item">{theme.item.emoji}</span>
					{:else if popping.includes(c.k)}
						<span class="emoji item popping">{theme.item.emoji}</span>
					{/if}
				</div>
			{/each}
		</div>

		<div
			class="hero"
			class:bumping
			style:left="calc({hero.x} * 100% / var(--w))"
			style:top="calc({hero.y} * 100% / var(--h))"
			style:--bump-x={bumpDir === 'E' ? '1' : bumpDir === 'W' ? '-1' : '0'}
			style:--bump-y={bumpDir === 'S' ? '1' : bumpDir === 'N' ? '-1' : '0'}
		>
			<span class="facing" style:transform="rotate({rotation}deg)" aria-hidden="true">
				<svg viewBox="0 0 100 100" width="100%" height="100%"
					><path d="M50 4 L62 20 L38 20 Z" fill="var(--accent)" /></svg
				>
			</span>
			<span
				class="emoji hero-emoji"
				class:tilt-left={turning === 'left'}
				class:tilt-right={turning === 'right'}>{theme.hero.emoji}</span
			>
			{#if bumping}<span class="bonk" aria-hidden="true">💥</span>{/if}
			{#if bubble}
				<span class="bubble" class:flip={hero.y === 0} role="status">{bubble}</span>
			{/if}
		</div>
	</div>

	<div class="legend">
		<span title={theme.hero.name}>{theme.hero.emoji} {theme.hero.name}</span>
		{#if totalItems}
			<span class="count" aria-live="polite"
				>{theme.item.emoji}
				{collected} / {totalItems}
				<span class="sr-only">{theme.item.plural} collected</span></span
			>
		{/if}
		{#if spec.goal}<span>{theme.goal.emoji} {theme.goal.name}</span>{/if}
	</div>
</div>

<style>
	.world {
		width: 100%;
	}
	.board {
		position: relative;
		aspect-ratio: var(--w) / var(--h);
		width: min(100%, calc(var(--w) * 76px), calc(60vh * var(--w) / var(--h)));
		margin: 0 auto;
		border-radius: 1.1rem;
		box-shadow:
			inset 0 0 0 2px #e6d9c6,
			0 10px 30px -14px rgb(60 40 20 / 0.35);
		container-type: inline-size;
		--cell: calc(100cqw / var(--w));
	}
	.tiles {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: repeat(var(--w), 1fr);
		grid-template-rows: repeat(var(--h), 1fr);
		border-radius: 1.1rem;
		overflow: hidden;
		background: #f1e8da;
	}
	.tile {
		position: relative;
		display: grid;
		place-items: center;
		background: #fbf5ec;
		box-shadow: inset 0 0 0 1px #efe4d4;
	}
	.tile.alt {
		background: #f7efe3;
	}
	.tile.wall {
		background: #e3d6c3;
		box-shadow: inset 0 -3px 0 rgb(0 0 0 / 0.06);
	}
	.tile.goal {
		background: color-mix(in oklab, var(--accent) 16%, #fbf5ec);
		box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--accent) 45%, transparent);
	}
	.tile.reached {
		animation: glow 900ms ease-out 2;
	}
	.emoji {
		font-size: calc(var(--cell) * 0.56);
		line-height: 1;
		user-select: none;
	}
	.goal-emoji {
		opacity: 0.9;
	}
	.item {
		position: absolute;
		font-size: calc(var(--cell) * 0.46);
		filter: drop-shadow(0 2px 1px rgb(0 0 0 / 0.12));
	}
	.item.popping {
		animation: pop 420ms ease-out forwards;
	}
	.hero {
		position: absolute;
		width: calc(100% / var(--w));
		height: calc(100% / var(--h));
		display: grid;
		place-items: center;
		transition:
			left 200ms cubic-bezier(0.3, 0.7, 0.4, 1),
			top 200ms cubic-bezier(0.3, 0.7, 0.4, 1);
		z-index: 2;
		pointer-events: none;
	}
	.hero-emoji {
		position: relative;
		font-size: calc(var(--cell) * 0.62);
		filter: drop-shadow(0 3px 2px rgb(0 0 0 / 0.18));
		transition: transform 180ms ease;
	}
	.hero-emoji.tilt-left {
		transform: rotate(-14deg) scale(1.05);
	}
	.hero-emoji.tilt-right {
		transform: rotate(14deg) scale(1.05);
	}
	.facing {
		position: absolute;
		inset: 0;
		transition: transform 200ms ease;
	}
	.hero.bumping .hero-emoji {
		animation: bump 360ms ease-out;
	}
	.bonk {
		position: absolute;
		font-size: calc(var(--cell) * 0.34);
		transform: translate(
			calc(var(--bump-x) * var(--cell) * 0.42),
			calc(var(--bump-y) * var(--cell) * 0.42)
		);
		animation: pop-in-out 600ms ease-out both;
	}
	.bubble {
		position: absolute;
		bottom: 88%;
		left: 50%;
		transform: translateX(-50%);
		max-width: min(14rem, 60cqw);
		width: max-content;
		padding: 0.35rem 0.7rem;
		border-radius: 0.9rem;
		background: white;
		color: var(--color-ink);
		font-size: clamp(0.8rem, calc(var(--cell) * 0.22), 1rem);
		font-weight: 700;
		line-height: 1.3;
		box-shadow: 0 6px 16px -6px rgb(60 40 20 / 0.35);
		border: 1.5px solid var(--color-line);
		animation: bubble-in 200ms ease-out both;
		text-align: center;
		overflow-wrap: anywhere;
	}
	.bubble.flip {
		bottom: auto;
		top: 88%;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem 1rem;
		margin-top: 0.75rem;
		font-size: 0.85rem;
		color: var(--color-ink-soft);
		font-weight: 600;
	}
	.count {
		color: var(--color-ink);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@keyframes pop {
		0% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.5) translateY(-20%);
			opacity: 1;
		}
		100% {
			transform: scale(0.2) translateY(-60%);
			opacity: 0;
		}
	}
	@keyframes bump {
		0%,
		100% {
			transform: translate(0, 0);
		}
		20% {
			transform: translate(
				calc(var(--bump-x) * var(--cell) * 0.18),
				calc(var(--bump-y) * var(--cell) * 0.18)
			);
		}
		40% {
			transform: translate(-5%, 0) rotate(-6deg);
		}
		60% {
			transform: translate(5%, 0) rotate(6deg);
		}
		80% {
			transform: translate(-3%, 0);
		}
	}
	@keyframes pop-in-out {
		0% {
			opacity: 0;
			scale: 0.4;
		}
		30% {
			opacity: 1;
			scale: 1.15;
		}
		100% {
			opacity: 0;
			scale: 1;
		}
	}
	@keyframes bubble-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(4px) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0) scale(1);
		}
	}
	@keyframes glow {
		0% {
			box-shadow:
				inset 0 0 0 2px var(--accent),
				0 0 0 0 color-mix(in oklab, var(--accent) 60%, transparent);
		}
		100% {
			box-shadow:
				inset 0 0 0 2px var(--accent),
				0 0 0 14px transparent;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hero,
		.facing {
			transition: none;
		}
	}
</style>
