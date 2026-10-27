<!--
  The console world: a friendly terminal that types out print() lines one by one.
  Shows any variables the lesson already set up. `play(trace)` resolves when typing is done.
-->
<script lang="ts">
	import type { ConsoleWorldSpec } from '#lib/curriculum/types.ts';
	import type { TraceEvent } from '#lib/engine/types.ts';

	let { spec, stepMs = 220 }: { spec: ConsoleWorldSpec; stepMs?: number } = $props();

	let lines = $state<string[]>([]);
	let typing = $state('');
	let active = $state(false);
	let ran = $state(false);
	let runToken = 0;
	let screen: HTMLDivElement;

	const vars = $derived(Object.entries(spec.variables ?? {}));

	function fmt(v: string | number | boolean) {
		return typeof v === 'string' ? JSON.stringify(v) : String(v);
	}

	export function reset() {
		runToken++;
		lines = [];
		typing = '';
		active = false;
		ran = false;
	}

	const reduced = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	const wait = (ms: number, token: number) =>
		new Promise<boolean>((r) => setTimeout(() => r(token === runToken), ms));

	function scrollDown() {
		queueMicrotask(() => screen?.scrollTo({ top: screen.scrollHeight }));
	}

	export async function play(trace: TraceEvent[]): Promise<void> {
		const token = ++runToken;
		lines = [];
		typing = '';
		active = true;
		ran = true;
		const prints = trace.filter((e): e is Extract<TraceEvent, { t: 'print' }> => e.t === 'print');
		// Long outputs speed up so nobody waits forever.
		const perLine = prints.length > 12 ? Math.max(30, 1800 / prints.length) : stepMs;
		for (const ev of prints) {
			if (token !== runToken) return;
			if (reduced() || ev.text.length > 80 || prints.length > 12) {
				lines = [...lines, ev.text];
			} else {
				const perChar = Math.min(18, perLine / Math.max(1, ev.text.length));
				for (let i = 1; i <= ev.text.length; i++) {
					typing = ev.text.slice(0, i);
					if (!(await wait(perChar, token))) return;
				}
				typing = '';
				lines = [...lines, ev.text];
			}
			scrollDown();
			if (!(await wait(perLine * 0.5, token))) return;
		}
		active = false;
	}
</script>

<div class="console" data-testid="console-world">
	<div class="bar" aria-hidden="true">
		<span class="dot" style:background="#f08a6c"></span>
		<span class="dot" style:background="#f4c25b"></span>
		<span class="dot" style:background="#7ccf8a"></span>
		<span class="title">output</span>
	</div>
	{#if vars.length}
		<div class="vars">
			<span class="vars-label">Already set up:</span>
			{#each vars as [name, v] (name)}
				<code>{name} = {fmt(v)}</code>
			{/each}
		</div>
	{/if}
	<div class="screen" bind:this={screen} role="log" aria-live="polite" aria-label="Program output">
		{#each lines as line, i (i)}
			<div class="line">
				<span class="prompt" aria-hidden="true">›</span>{line === '' ? ' ' : line}
			</div>
		{/each}
		{#if typing}
			<div class="line">
				<span class="prompt" aria-hidden="true">›</span>{typing}<span class="caret"></span>
			</div>
		{:else if active}
			<div class="line">
				<span class="prompt" aria-hidden="true">›</span><span class="caret"></span>
			</div>
		{:else if !ran}
			<div class="empty">Your <code>print()</code> lines will show up here.</div>
		{:else if lines.length === 0}
			<div class="empty">Nothing was printed this time.</div>
		{/if}
	</div>
</div>

<style>
	.console {
		width: 100%;
		border-radius: 1.1rem;
		background: #2a2420;
		color: #f6efe6;
		overflow: hidden;
		box-shadow: 0 10px 30px -14px rgb(60 40 20 / 0.45);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.6rem 0.9rem;
		background: #342d28;
	}
	.dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 999px;
	}
	.title {
		margin-left: 0.5rem;
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		color: #b9ab9c;
		font-weight: 700;
	}
	.vars {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		padding: 0.6rem 0.9rem 0;
		font-size: 0.8rem;
		color: #b9ab9c;
	}
	.vars code {
		font-family: var(--font-mono);
		background: #3d3530;
		color: #ffd9a8;
		padding: 0.1rem 0.45rem;
		border-radius: 0.4rem;
	}
	.screen {
		min-height: 12rem;
		max-height: 22rem;
		overflow-y: auto;
		padding: 0.8rem 0.9rem 1rem;
		font-family: var(--font-mono);
		font-size: 1rem;
		line-height: 1.6;
	}
	.line {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		animation: line-in 160ms ease-out;
	}
	.prompt {
		color: var(--accent);
		margin-right: 0.6rem;
		font-weight: 700;
	}
	.caret {
		display: inline-block;
		width: 0.55em;
		height: 1.1em;
		vertical-align: text-bottom;
		background: #f6efe6;
		margin-left: 1px;
		animation: blink 1s steps(1) infinite;
	}
	.empty {
		color: #9d8f81;
		font-family: var(--font-sans);
		font-size: 0.95rem;
	}
	.empty code {
		font-family: var(--font-mono);
		color: #ffd9a8;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
	@keyframes line-in {
		from {
			opacity: 0.4;
		}
	}
</style>
