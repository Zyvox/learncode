<!--
  The git world: a terminal (each command typed out, then what it printed), the working folder
  (files coloured by status: new grey, changed amber, staged green, saved plain) and the commit
  graph (newest at the top, branch labels, HEAD, merges with two parent lines).

  `play(trace, git)` replays a run (always resolves), `reset()` goes back to the start.
  `base` is the state after the lesson's setup (a run with no learner commands), when known.
  While the terminal replays, the folder and graph follow along with light guesses; the final
  picture always comes from the result itself.
-->
<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { GitWorldSpec } from '#lib/curriculum/types.ts';
	import type { GitCommit, GitResult, TraceEvent } from '#lib/engine/types.ts';
	import {
		STATUS_LABEL,
		applyCommand,
		layoutGraph,
		liveFromResult,
		makesCommit,
		type FileStatus,
		type LiveState
	} from './git.ts';

	let {
		spec,
		stepMs = 220,
		base
	}: { spec: GitWorldSpec; stepMs?: number; base?: GitResult } = $props();

	type ShellEv = Extract<TraceEvent, { t: 'shell' }>;

	interface TermLine {
		n: number;
		cmd: string;
		typed: string;
		output: string;
		ok: boolean;
		earlier?: boolean;
		done: boolean;
	}

	// ---------- state ----------
	let term = $state<TermLine[]>([]);
	let initialized = $state(false);
	let files = $state<{ path: string; status: FileStatus }[]>([]);
	let contents = $state<Record<string, string>>({});
	let commits = $state<GitCommit[]>([]);
	let branches = $state<Record<string, string>>({});
	let head = $state<{ branch: string | null; commit: string | null }>({
		branch: null,
		commit: null
	});
	let ran = $state(false);
	let playing = $state(false);
	let stoppedReason = $state<string | null>(null);
	let runToken = 0;
	let lineNo = 0;
	let termEl: HTMLDivElement | undefined = $state();

	let live: LiveState = liveFromResult(undefined);

	function show(state: LiveState) {
		live = state;
		initialized = state.initialized;
		files = [...state.files]
			.map(([path, status]) => ({ path, status }))
			.sort((a, b) => a.path.localeCompare(b.path));
		branches = { ...state.branches };
		head = { ...state.head };
	}

	function resetState() {
		const b = base;
		show(liveFromResult(b, spec.files));
		contents = { ...(b?.files ?? spec.files ?? {}) };
		commits = [...(b?.commits ?? [])];
		lineNo = 0;
		term = (b?.terminal ?? []).map((t) => ({
			n: ++lineNo,
			cmd: t.cmd,
			typed: t.cmd,
			output: t.output,
			ok: t.ok,
			earlier: true,
			done: true
		}));
		ran = false;
		stoppedReason = null;
	}

	const pending = new Set<() => void>();
	function cancel() {
		runToken++;
		for (const end of [...pending]) end();
	}

	// New lesson → fresh picture.
	$effect(() => {
		void spec;
		cancel();
		playing = false;
		untrack(resetState);
	});

	// The setup's state arrives a moment after mounting: show it unless a run is already on screen.
	$effect(() => {
		void base;
		untrack(() => {
			if (!ran && !playing) resetState();
		});
	});

	onDestroy(cancel);

	export function reset() {
		cancel();
		playing = false;
		resetState();
	}

	const reduced = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function wait(ms: number, token: number, instant: boolean) {
		if (instant || token !== runToken) return Promise.resolve(token === runToken);
		return new Promise<boolean>((resolve) => {
			const end = () => {
				clearTimeout(timer);
				pending.delete(end);
				resolve(token === runToken);
			};
			const timer = setTimeout(end, Math.max(0, ms));
			pending.add(end);
		});
	}

	function scrollDown() {
		queueMicrotask(() => termEl?.scrollTo({ top: termEl.scrollHeight }));
	}

	// ---------- replay ----------
	/** Replays a run. Always resolves (never rejects), also when cancelled or given odd data. */
	export async function play(trace: TraceEvent[], git?: GitResult): Promise<void> {
		cancel();
		const token = runToken;
		resetState();
		ran = true;
		playing = true;
		try {
			await animate(token, Array.isArray(trace) ? trace : [], git);
		} catch {
			if (token !== runToken) return;
			finishPicture(git);
		}
	}

	async function animate(token: number, trace: TraceEvent[], git?: GitResult) {
		const instant = reduced();
		let events = trace.filter((e): e is ShellEv => !!e && e.t === 'shell');
		for (const e of trace) {
			if (e?.t === 'stopped')
				stoppedReason =
					e.reason === 'timeout'
						? 'Stopped: it took too long.'
						: 'Stopped: too many commands in one go.';
		}
		// The setup's own commands are already on screen (dimmed) when we know them.
		const earlier = base?.terminal ?? [];
		if (
			earlier.length &&
			events.length >= earlier.length &&
			earlier.every((t, i) => t.cmd === events[i].cmd)
		) {
			events = events.slice(earlier.length);
		}

		const all = git?.commits ?? [];
		const making = events.filter((e) => makesCommit(e.cmd, e.output, e.ok)).length;
		let shown = Math.max(0, Math.min(all.length, all.length - making));
		if (git) commits = all.slice(0, shown);

		const scale = events.length > 20 ? Math.max(0.3, 20 / events.length) : 1;
		const step = Math.max(stepMs, 60) * scale;

		for (const ev of events) {
			if (token !== runToken) return;
			const cmd = String(ev.cmd ?? '');
			const line: TermLine = {
				n: ++lineNo,
				cmd,
				typed: instant ? cmd : '',
				output: '',
				ok: ev.ok !== false,
				done: false
			};
			term.push(line);
			const row = term[term.length - 1];
			scrollDown();
			if (!instant && cmd.length) {
				const steps = Math.min(cmd.length, 20);
				const total = Math.min(cmd.length * Math.max(stepMs / 9, 8), 900) * scale;
				for (let s = 1; s <= steps; s++) {
					row.typed = cmd.slice(0, Math.ceil((s / steps) * cmd.length));
					if (!(await wait(total / steps, token, instant))) return;
				}
			}
			row.typed = cmd;
			if (!(await wait(step * 0.5, token, instant))) return;
			row.output = String(ev.output ?? '');
			row.done = true;
			scrollDown();

			let fresh: string | undefined;
			if (makesCommit(cmd, row.output, row.ok) && shown < all.length) {
				fresh = all[shown].id;
				shown++;
				commits = all.slice(0, shown);
			}
			try {
				applyCommand(live, cmd, row.output, fresh, row.ok);
				show(live);
			} catch {
				// A guess went wrong; the final picture will put it right.
			}
			if (!(await wait(step * 1.4, token, instant))) return;
		}
		if (token !== runToken) return;
		if (!(await wait(Math.max(step, 150), token, instant))) return;
		finishPicture(git);
	}

	function finishPicture(git?: GitResult) {
		if (git) {
			show(liveFromResult(git));
			contents = { ...(git.files ?? {}) };
			commits = [...(git.commits ?? [])];
		}
		for (const l of term) {
			l.typed = l.cmd;
			l.done = true;
		}
		playing = false;
		scrollDown();
	}

	// ---------- graph ----------
	const ROW = 34;
	const LANE = 16;
	const LANE_COLORS = ['#e8743b', '#3f7cc0', '#2f9e6e', '#a43f7a', '#c99a2e', '#6b3fa0'];
	const graph = $derived(layoutGraph(commits, 15));
	const graphW = $derived(graph.lanes * LANE + 10);
	const laneX = (lane: number) => 10 + lane * LANE;
	const rowY = (row: number) => row * ROW + ROW / 2;
	const labelsAt = $derived.by(() => {
		const out = new Map<string, string[]>();
		for (const [name, id] of Object.entries(branches)) {
			if (!out.has(id)) out.set(id, []);
			out.get(id)!.push(name);
		}
		return out;
	});

	function edgePath(e: { from: { lane: number; row: number }; to: { lane: number; row: number } }) {
		const x1 = laneX(e.from.lane);
		const y1 = rowY(e.from.row);
		const x2 = laneX(e.to.lane);
		const y2 = rowY(e.to.row);
		if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
		if (e.from.lane < e.to.lane) {
			// Out to a side lane right away (a merge's second parent), then straight down.
			const yb = y1 + ROW * 0.75;
			return `M ${x1} ${y1} C ${x1} ${y1 + ROW * 0.45}, ${x2} ${y1 + ROW * 0.3}, ${x2} ${yb} L ${x2} ${y2}`;
		}
		// Straight down the side lane, then back into the parent's lane just above it.
		const ya = y2 - ROW * 0.75;
		return `M ${x1} ${y1} L ${x1} ${ya} C ${x1} ${y2 - ROW * 0.3}, ${x2} ${y2 - ROW * 0.45}, ${x2} ${y2}`;
	}

	const shortId = (id: string) => String(id).slice(0, 7);
	const isStaged = $derived(files.some((f) => f.status === 'staged'));
</script>

<div class="git-wrap">
<div class="git" data-testid="git-world">
	<section class="pane terminal" aria-label="Terminal" data-testid="git-terminal">
		<header class="term-head">
			<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
			<span>terminal</span>
		</header>
		<div class="term-body" bind:this={termEl} role="log" aria-live="polite">
			{#each term as l (l.n)}
				<div class="tline" class:earlier={l.earlier} class:bad={!l.ok && l.done}>
					<div class="cmd">
						<span class="prompt" aria-hidden="true">$</span>
						<span>{l.typed}</span>{#if !l.done && playing}<span class="caret" aria-hidden="true"
							></span>{/if}
					</div>
					{#if l.output}<pre class="out">{l.output}</pre>{/if}
				</div>
			{/each}
			{#if !term.length}
				<p class="term-empty">Your commands run here, one line at a time, top to bottom.</p>
			{:else if term.every((l) => l.earlier) && !ran}
				<p class="term-empty">Above: what was already done before you sat down.</p>
			{/if}
			{#if stoppedReason}<p class="stopped">{stoppedReason}</p>{/if}
		</div>
	</section>

	<section class="pane folder" aria-label="Working folder" data-testid="git-files">
		<header class="pane-head">
			<span aria-hidden="true">📁</span> Your folder
			{#if isStaged}<span class="note">green = in the next commit</span>{/if}
		</header>
		{#if files.length}
			<ul class="files">
				{#each files as f (f.path)}
					<li class="file st-{f.status}" data-testid="git-file" data-status={f.status}>
						{#if contents[f.path] !== undefined && f.status !== 'deleted'}
							<details>
								<summary>
									<span class="dot" aria-hidden="true"></span>
									<code class="fname">{f.path}</code>
									<span class="fstatus">{STATUS_LABEL[f.status]}</span>
								</summary>
								<pre class="fcontent">{contents[f.path] || '(empty)'}</pre>
							</details>
						{:else}
							<div class="frow">
								<span class="dot" aria-hidden="true"></span>
								<code class="fname">{f.path}</code>
								<span class="fstatus">{STATUS_LABEL[f.status]}</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="hint">The folder is empty.</p>
		{/if}
		<p class="legend" aria-hidden="true">
			<span class="st-untracked"><span class="dot"></span>new</span>
			<span class="st-modified"><span class="dot"></span>changed</span>
			<span class="st-staged"><span class="dot"></span>staged</span>
			<span class="st-committed"><span class="dot"></span>saved</span>
		</p>
	</section>

	<section class="pane history" aria-label="Commit history" data-testid="git-graph">
		<header class="pane-head">
			<span aria-hidden="true">🕰️</span> History
			{#if head.branch}<span class="note">you’re on <b>{head.branch}</b></span>{/if}
		</header>
		{#if !initialized && !commits.length}
			<p class="hint">No history here yet. <code>git init</code> starts one.</p>
		{:else if !commits.length}
			<p class="hint">No commits yet. The first one will show up here.</p>
		{:else}
			<div class="graph" style:--graph-w="{graphW}px">
				<svg
					class="lanes"
					width={graphW}
					height={graph.rows.length * ROW}
					viewBox="0 0 {graphW} {graph.rows.length * ROW}"
					aria-hidden="true"
				>
					{#each graph.edges as e, i (i)}
						<path
							d={edgePath(e)}
							fill="none"
							stroke={LANE_COLORS[Math.max(e.from.lane, e.to.lane) % LANE_COLORS.length]}
							stroke-width="2.5"
							stroke-linecap="round"
						/>
					{/each}
					{#each graph.rows as r (r.commit.id)}
						<circle
							cx={laneX(r.lane)}
							cy={rowY(r.row)}
							r={r.merge ? 6.5 : 5.5}
							fill={r.merge ? 'white' : LANE_COLORS[r.lane % LANE_COLORS.length]}
							stroke={LANE_COLORS[r.lane % LANE_COLORS.length]}
							stroke-width={r.merge ? 3 : 2}
						/>
					{/each}
				</svg>
				<ol class="commits">
					{#each graph.rows as r (r.commit.id)}
						{@const names = labelsAt.get(r.commit.id) ?? []}
						<li
							class="commit"
							class:is-head={head.commit === r.commit.id}
							style:height="{ROW}px"
							data-testid="git-commit"
							data-id={r.commit.id}
						>
							<code class="cid">{shortId(r.commit.id)}</code>
							{#each names as b (b)}
								<span class="branch" class:head={head.branch === b}
									>{#if head.branch === b}<span class="headmark">HEAD →</span>
									{/if}{b}</span
								>
							{/each}
							{#if head.branch === null && head.commit === r.commit.id}
								<span class="branch head"><span class="headmark">HEAD</span></span>
							{/if}
							<span class="msg">{r.commit.message}</span>
							{#if r.merge}<span class="merge-tag">merge</span>{/if}
						</li>
					{/each}
				</ol>
			</div>
			{#if graph.hidden}
				<p class="hint small">and {graph.hidden} older commit{graph.hidden === 1 ? '' : 's'}</p>
			{/if}
		{/if}
	</section>
</div>
</div>

<style>
	.git {
		--ok: #2f9e6e;
		--ok-soft: #e3f4ea;
		--amber: #b07a0c;
		--amber-soft: #fff1cf;
		--bad: #c8553d;
		--bad-soft: #fbe9e3;
		--grey: #8a8077;
		width: 100%;
		display: grid;
		gap: 0.75rem;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas:
			'terminal'
			'folder'
			'history';
	}
	.git-wrap {
		width: 100%;
		container-type: inline-size;
	}
	@container (min-width: 620px) {
		.git {
			grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
			grid-template-areas:
				'terminal folder'
				'terminal history';
			grid-template-rows: auto 1fr;
		}
	}
	.terminal {
		grid-area: terminal;
	}
	.folder {
		grid-area: folder;
	}
	.history {
		grid-area: history;
	}
	.pane {
		min-width: 0;
		border-radius: 1rem;
		border: 1px solid var(--color-line);
		background: white;
		padding: 0.6rem 0.75rem 0.75rem;
	}
	.pane-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem;
		font-weight: 800;
		font-size: 0.9rem;
		margin-bottom: 0.45rem;
	}
	.note {
		font-weight: 600;
		font-size: 0.75rem;
		color: var(--color-muted);
	}
	.hint {
		color: var(--color-muted);
		font-size: 0.85rem;
	}
	.hint code {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}
	.small {
		font-size: 0.75rem;
		margin-top: 0.25rem;
	}

	/* ---------- terminal ---------- */
	.terminal {
		background: #221d1a;
		border-color: #221d1a;
		color: #f3ece3;
		padding: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		min-height: 14rem;
	}
	.term-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.75rem;
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #a99a8a;
		background: #2c2622;
	}
	.dots {
		display: flex;
		gap: 0.3rem;
	}
	.dots i {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		background: #f08a6c;
	}
	.dots i:nth-child(2) {
		background: #f4c25b;
	}
	.dots i:nth-child(3) {
		background: #7ccf8a;
	}
	.term-body {
		flex: 1;
		max-height: 24rem;
		overflow-y: auto;
		padding: 0.6rem 0.8rem 0.8rem;
		font-family: var(--font-mono);
		font-size: 0.84rem;
		line-height: 1.5;
	}
	.tline + .tline {
		margin-top: 0.3rem;
	}
	.tline.earlier {
		opacity: 0.5;
	}
	.cmd {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.prompt {
		color: #7ccf8a;
		font-weight: 800;
		margin-right: 0.45rem;
	}
	.caret {
		display: inline-block;
		width: 0.55em;
		height: 1.05em;
		margin-left: 1px;
		vertical-align: text-bottom;
		background: #f3ece3;
		animation: blink 900ms steps(1) infinite;
	}
	.out {
		margin: 0.1rem 0 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: #cfc3b5;
		font-family: inherit;
		font-size: inherit;
	}
	.tline.bad .out {
		color: #ffb4a1;
	}
	.tline.bad .prompt {
		color: #ff9a80;
	}
	.term-empty {
		color: #9a8d80;
		font-style: italic;
		font-family: var(--font-sans);
		font-size: 0.85rem;
		margin-top: 0.4rem;
	}
	.stopped {
		color: #ffb4a1;
		font-weight: 700;
		margin-top: 0.4rem;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	/* ---------- folder ---------- */
	.files {
		display: grid;
		gap: 0.2rem;
	}
	.file summary,
	.frow {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.25rem 0.45rem;
		border-radius: 0.55rem;
		list-style: none;
		cursor: default;
		flex-wrap: wrap;
	}
	.file summary {
		cursor: pointer;
	}
	.file summary::-webkit-details-marker {
		display: none;
	}
	.file summary:hover {
		background: var(--color-sand);
	}
	.dot {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 999px;
		background: var(--c, var(--grey));
		flex: none;
		transition: background-color 250ms ease;
	}
	.fname {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--c-text, var(--color-ink));
		transition: color 250ms ease;
	}
	.fstatus {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--c-text, var(--color-muted));
	}
	.st-untracked {
		--c: #b9b0a6;
		--c-text: #8a8077;
	}
	.st-modified {
		--c: #e0a63a;
		--c-text: var(--amber);
	}
	.st-staged {
		--c: var(--ok);
		--c-text: var(--ok);
	}
	.st-committed {
		--c: #d9cfc2;
	}
	.st-committed .fstatus {
		color: var(--color-muted);
	}
	.st-conflict {
		--c: var(--bad);
		--c-text: var(--bad);
	}
	.st-deleted {
		--c: var(--bad);
		--c-text: var(--bad);
	}
	.st-deleted .fname {
		text-decoration: line-through;
	}
	.fcontent {
		margin: 0.2rem 0 0.35rem 1.5rem;
		padding: 0.4rem 0.6rem;
		border-radius: 0.55rem;
		background: #fbf8f3;
		border: 1px solid var(--color-line);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 10rem;
		overflow-y: auto;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		margin-top: 0.6rem;
		font-size: 0.7rem;
		color: var(--color-muted);
	}
	.legend > span {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	/* ---------- history ---------- */
	.graph {
		position: relative;
		display: grid;
		grid-template-columns: var(--graph-w) minmax(0, 1fr);
		overflow-x: auto;
	}
	.lanes {
		grid-column: 1;
		grid-row: 1;
	}
	.commits {
		grid-column: 2;
		grid-row: 1;
		min-width: 0;
	}
	.commit {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		white-space: nowrap;
		animation: fade 260ms ease-out both;
	}
	.cid {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: #b4590e;
		flex: none;
	}
	.msg {
		font-size: 0.82rem;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.is-head .msg {
		font-weight: 800;
	}
	.branch {
		flex: none;
		font-size: 0.68rem;
		font-weight: 800;
		padding: 0.02rem 0.45rem;
		border-radius: 999px;
		background: #e6eef8;
		color: #2b5f8a;
		border: 1.5px solid #bcd0e6;
	}
	.branch.head {
		background: var(--ok-soft);
		color: var(--ok);
		border-color: var(--ok);
	}
	.headmark {
		font-weight: 900;
	}
	.merge-tag {
		flex: none;
		font-size: 0.64rem;
		font-weight: 800;
		color: #6b3fa0;
	}
	@keyframes fade {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.commit,
		.caret {
			animation: none;
		}
		.dot,
		.fname {
			transition: none;
		}
	}
</style>
