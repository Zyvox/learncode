<!--
  The canvas world: replays DrawOp[] onto a <canvas> one op at a time so the drawing "forms".
  `play(trace)` resolves when finished; `reset()` clears to the starting background.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { CanvasWorldSpec } from '#lib/curriculum/types.ts';
	import type { DrawOp, TraceEvent } from '#lib/engine/types.ts';

	let { spec, stepMs = 220 }: { spec: CanvasWorldSpec; stepMs?: number } = $props();

	const width = $derived(spec.width ?? 300);
	const height = $derived(spec.height ?? 300);

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let runToken = 0;
	let drawn = $state(0);
	let total = $state(0);

	function setup() {
		if (!canvas) return;
		const dpr = Math.min(3, window.devicePixelRatio || 1);
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx = canvas.getContext('2d');
		ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
		clear();
	}

	function clear() {
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = spec.background ?? 'white';
		ctx.fillRect(0, 0, width, height);
	}

	function apply(op: DrawOp) {
		if (!ctx) return;
		const c = ctx;
		switch (op.op) {
			case 'background':
				c.fillStyle = op.color;
				c.fillRect(0, 0, width, height);
				break;
			case 'color':
				break; // colour is carried on each shape
			case 'circle':
				c.beginPath();
				c.fillStyle = op.color;
				c.arc(op.x, op.y, Math.max(0, op.r), 0, Math.PI * 2);
				c.fill();
				break;
			case 'rect':
				c.fillStyle = op.color;
				c.fillRect(op.x, op.y, op.w, op.h);
				break;
			case 'line':
				c.beginPath();
				c.strokeStyle = op.color;
				c.lineWidth = 3;
				c.lineCap = 'round';
				c.moveTo(op.x1, op.y1);
				c.lineTo(op.x2, op.y2);
				c.stroke();
				break;
			case 'text':
				c.fillStyle = op.color;
				c.font = '600 18px ui-rounded, system-ui, sans-serif';
				c.textBaseline = 'middle';
				c.fillText(op.text, op.x, op.y);
				break;
		}
	}

	onMount(setup);

	$effect(() => {
		void width;
		void height;
		void spec.background;
		runToken++;
		drawn = 0;
		total = 0;
		setup();
	});

	export function reset() {
		runToken++;
		drawn = 0;
		total = 0;
		clear();
	}

	const reduced = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	export async function play(trace: TraceEvent[]): Promise<void> {
		const token = ++runToken;
		clear();
		const ops = trace.flatMap((e) => (e.t === 'draw' ? [e.op] : []));
		total = ops.filter((o) => o.op !== 'color').length;
		drawn = 0;
		const delay = reduced()
			? 0
			: Math.max(12, Math.min(stepMs * 0.6, 2400 / Math.max(1, ops.length)));
		for (const op of ops) {
			if (token !== runToken) return;
			apply(op);
			if (op.op === 'color') continue;
			drawn++;
			if (delay) {
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}
</script>

<div class="wrap" data-testid="canvas-world">
	<div
		role="img"
		aria-label="Your drawing ({width} by {height}). {total
			? `${drawn} of ${total} shapes drawn.`
			: 'Nothing drawn yet.'}"
	>
		<canvas
			bind:this={canvas}
			style:aspect-ratio="{width} / {height}"
			style:max-width="{Math.max(width, 300) * 1.4}px"
			aria-hidden="true"
		></canvas>
	</div>
	<p class="hint">0,0 is the top-left corner · {width} wide, {height} tall</p>
</div>

<style>
	.wrap {
		width: 100%;
		text-align: center;
	}
	canvas {
		display: block;
		width: 100%;
		margin: 0 auto;
		border-radius: 1.1rem;
		background: white;
		box-shadow:
			inset 0 0 0 1px #e6d9c6,
			0 10px 30px -14px rgb(60 40 20 / 0.35);
		border: 2px solid #ece3d6;
	}
	.hint {
		margin-top: 0.6rem;
		font-size: 0.8rem;
		color: var(--color-muted);
	}
</style>
