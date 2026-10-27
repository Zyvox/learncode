<!--
  The "Behind the app" world: the phone → the server (endpoints + log) → the database.
  Bit 📦 carries each request along the wires; queries hop between server and database; the
  answer travels back with its status badge and the phone screen updates.

  `play(trace, web)` replays a run (resolves when done), `reset()` goes back to the start.
  In the sql role the database is the main stage: the result table and the query log.
  Narrow containers stack the boxes vertically and the wires turn vertical.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import type { WebWorldSpec } from '#lib/curriculum/types.ts';
	import type { ScreenItem, SqlResultSet, TraceEvent, WebResult } from '#lib/engine/types.ts';
	import {
		cellText,
		emptyTables,
		sqlVerb,
		statusFamily,
		statusLabel,
		tableOfQuery,
		viewOfJson,
		type StatusFamily
	} from './web.ts';

	let {
		spec,
		stepMs = 220,
		baseTables
	}: {
		spec: WebWorldSpec;
		stepMs?: number;
		/** The database before any learner code ran (optional; otherwise only the schema is known) */
		baseTables?: Record<string, SqlResultSet>;
	} = $props();

	type Box = 'client' | 'server' | 'database';
	type Seg = 'ps' | 'sd';

	interface RouteRow {
		key: string;
		method: string;
		pattern: string | null;
		path: string;
		hits: number;
	}
	interface Trip {
		id: number;
		method: string;
		path: string;
		label?: string;
		status?: number;
		state: 'waiting' | 'going' | 'done';
	}
	interface QueryRow {
		n: number;
		sql: string;
		params: unknown[];
		rows?: number;
		changes?: number;
		error?: string;
	}
	interface Packet {
		key: number;
		seg: Seg;
		back: boolean;
		text: string;
		tone: StatusFamily | 'plain';
		fizzle?: boolean;
		dur: number;
	}

	// ---------- what is drawn ----------
	const role = $derived(spec.role);
	const shown = $derived(
		new Set<Box>(
			spec.show ?? (spec.role === 'sql' ? ['database'] : ['client', 'server', 'database'])
		)
	);
	const showPhone = $derived(shown.has('client'));
	const showServer = $derived(shown.has('server'));
	const showDb = $derived(shown.has('database'));
	const dbStage = $derived(role === 'sql');
	const down = $derived(!!spec.serverDown);
	const schemaTables = $derived(emptyTables(spec.schema));

	const initialTrips = (): Trip[] =>
		(spec.requests ?? []).map((r, id) => ({
			id,
			method: r.method,
			path: r.path,
			label: r.label,
			state: 'waiting'
		}));

	// ---------- play state ----------
	let routes = $state<RouteRow[]>([]);
	let logs = $state<{ where: 'server' | 'client'; text: string }[]>([]);
	let screen = $state<ScreenItem[]>([]);
	let queries = $state<QueryRow[]>([]);
	let trips = $state<Trip[]>(untrack(initialTrips));
	let runTables = $state<Record<string, SqlResultSet> | null>(null);
	let sqlResult = $state<SqlResultSet | null>(null);
	let packet = $state<Packet | null>(null);
	let active = $state<Box | null>(null);
	let activeRoute = $state<string | null>(null);
	let activeTable = $state<string | null>(null);
	let lastStatus = $state<number | null>(null);
	let caption = $state('');
	let ran = $state(false);
	let playing = $state(false);
	let stoppedReason = $state<string | null>(null);
	let runToken = 0;
	let packetKey = 0;
	let logEl: HTMLDivElement | undefined = $state();
	let screenEl: HTMLDivElement | undefined = $state();

	const tables = $derived(runTables ?? baseTables ?? schemaTables);
	const tablesKnown = $derived(!!(runTables ?? baseTables));
	const tableNames = $derived(Object.keys(tables));

	function resetState() {
		routes = [];
		logs = [];
		screen = [];
		queries = [];
		trips = initialTrips();
		runTables = null;
		sqlResult = null;
		packet = null;
		active = null;
		activeRoute = null;
		activeTable = null;
		lastStatus = null;
		caption = '';
		ran = false;
		stoppedReason = null;
	}

	// New lesson → fresh picture.
	$effect(() => {
		void spec;
		runToken++;
		playing = false;
		untrack(resetState);
	});

	export function reset() {
		runToken++;
		playing = false;
		resetState();
	}

	const reduced = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function wait(ms: number, token: number, instant: boolean) {
		if (instant) return Promise.resolve(token === runToken);
		return new Promise<boolean>((resolve) => setTimeout(() => resolve(token === runToken), ms));
	}

	function scrollDown() {
		queueMicrotask(() => {
			logEl?.scrollTo({ top: logEl.scrollHeight });
			screenEl?.scrollTo({ top: screenEl.scrollHeight });
		});
	}

	function send(
		seg: Seg,
		back: boolean,
		text: string,
		tone: Packet['tone'],
		dur: number,
		fizzle = false
	) {
		packet = { key: ++packetKey, seg, back, text, tone, dur, fizzle };
	}

	const requestOf = (id: number | undefined) =>
		id === undefined ? undefined : trips.find((t) => t.id === id);

	function routeKey(method: string, pattern: string | null, path: string) {
		return pattern === null ? `miss ${method} ${path}` : `${method} ${pattern}`;
	}

	export async function play(trace: TraceEvent[], web?: WebResult): Promise<void> {
		const token = ++runToken;
		resetState();
		ran = true;
		playing = true;
		const instant = reduced();
		const events = trace.filter((e) =>
			['request', 'route', 'log', 'query', 'response', 'screen', 'stopped'].includes(e.t)
		);
		// Long runs speed up so nobody waits forever.
		const step = events.length > 40 ? Math.max(35, 7000 / events.length) : Math.max(stepMs, 60);
		const travel = Math.round(step * 0.9);
		const usesServer = showServer || role !== 'sql';

		for (const ev of events) {
			if (token !== runToken) return;
			switch (ev.t) {
				case 'request': {
					const existing = trips.find((t) => t.id === ev.id);
					if (existing) {
						existing.state = 'going';
						existing.method = ev.method;
						existing.path = ev.path;
					} else {
						trips.push({
							id: ev.id,
							method: ev.method,
							path: ev.path,
							label: ev.label,
							state: 'going'
						});
					}
					active = 'client';
					const what = `${ev.method} ${ev.path}`;
					caption = down
						? `📦 Bit sets off with ${what}… but nobody is answering at the server.`
						: `📦 Bit carries ${what} from the phone to the server${ev.label ? ` (${ev.label})` : ''}.`;
					if (showPhone && showServer) send('ps', false, ev.method, 'plain', travel, down);
					if (!(await wait(step, token, instant))) return;
					active = down ? null : 'server';
					break;
				}
				case 'route': {
					const req = requestOf(ev.id);
					const method = req?.method ?? 'GET';
					const path = req?.path.split('?')[0] ?? '';
					const key = routeKey(method, ev.pattern, path);
					const row = routes.find((r) => r.key === key);
					if (row) row.hits++;
					else routes.push({ key, method, pattern: ev.pattern, path, hits: 1 });
					activeRoute = key;
					active = 'server';
					caption =
						ev.pattern === null
							? `The server looks for an endpoint that matches ${method} ${path}, and finds none.`
							: `The server finds a match: ${method} ${ev.pattern}.`;
					if (!(await wait(step * 0.8, token, instant))) return;
					break;
				}
				case 'query': {
					const table = tableOfQuery(ev.sql);
					activeTable = table;
					queries.push({
						n: queries.length + 1,
						sql: ev.sql,
						params: ev.params ?? [],
						rows: ev.rows,
						changes: ev.changes,
						error: ev.error
					});
					const answer = ev.error
						? 'error'
						: ev.rows !== undefined
							? `${ev.rows} row${ev.rows === 1 ? '' : 's'}`
							: ev.changes !== undefined
								? `${ev.changes} changed`
								: 'done';
					if (usesServer && showServer && showDb) {
						active = 'server';
						caption = `The server asks the database: ${sqlVerb(ev.sql)}${table ? ` … ${table}` : ''}.`;
						send('sd', false, sqlVerb(ev.sql), 'plain', Math.round(travel * 0.7));
						if (!(await wait(step * 0.7, token, instant))) return;
						active = 'database';
						caption = ev.error
							? `The database says no: ${ev.error}`
							: `The database answers: ${answer}.`;
						send('sd', true, answer, ev.error ? 'server' : 'plain', Math.round(travel * 0.7));
						if (!(await wait(step * 0.7, token, instant))) return;
						active = 'server';
					} else {
						active = 'database';
						caption = ev.error
							? `The database says no: ${ev.error}`
							: `The database answers: ${answer}.`;
						if (!(await wait(step, token, instant))) return;
					}
					break;
				}
				case 'log': {
					logs.push({ where: ev.where, text: ev.text });
					scrollDown();
					if (!(await wait(step * 0.4, token, instant))) return;
					break;
				}
				case 'response': {
					const req = requestOf(ev.id);
					if (req) {
						req.status = ev.status;
						req.state = 'done';
					}
					lastStatus = ev.status;
					activeRoute = null;
					if (ev.status === 0) {
						caption = 'No connection: the phone gave up waiting for an answer.';
						active = 'client';
						if (!(await wait(step * 0.6, token, instant))) return;
						break;
					}
					caption = `📦 Bit brings the answer back to the phone: ${statusLabel(ev.status)}.`;
					if (showPhone && showServer) {
						send('ps', true, String(ev.status), statusFamily(ev.status), travel);
					}
					active = 'server';
					if (!(await wait(step, token, instant))) return;
					active = 'client';
					break;
				}
				case 'screen': {
					screen.push(ev.item);
					active = 'client';
					scrollDown();
					if (!(await wait(step * 0.6, token, instant))) return;
					break;
				}
				case 'stopped': {
					stoppedReason =
						ev.reason === 'timeout'
							? 'Stopped: it took too long.'
							: 'Stopped: too many steps (is something going round in circles?).';
					break;
				}
			}
		}
		if (token !== runToken) return;
		if (!(await wait(Math.max(step, 200), token, instant))) return;

		// The final picture comes from the result itself.
		if (web) {
			if (web.tables && Object.keys(web.tables).length) runTables = web.tables;
			sqlResult = web.sqlResult ?? null;
			if (!screen.length && web.screen?.length) screen = [...web.screen];
			for (const r of web.responses ?? []) {
				const t = trips.find((x) => x.id === r.id);
				if (t) {
					t.status = r.status;
					t.state = 'done';
				} else {
					trips.push({ id: r.id, method: r.method, path: r.path, status: r.status, state: 'done' });
				}
				if (lastStatus === null) lastStatus = r.status;
			}
		}
		packet = null;
		active = null;
		activeTable = null;
		caption = endCaption();
		playing = false;
		scrollDown();
	}

	function endCaption(): string {
		if (role === 'sql') {
			if (queries.some((q) => q.error))
				return 'The database couldn’t run part of that. See the note below.';
			if (sqlResult) {
				const n = sqlResult.rows.length;
				return `Done. The database sent back ${n} row${n === 1 ? '' : 's'}.`;
			}
			return queries.length
				? 'Done. Nothing to show as rows, but the tables below are up to date.'
				: '';
		}
		const done = trips.filter((t) => t.state === 'done');
		if (!done.length) return 'No requests were sent this time.';
		const ok = done.filter((t) => statusFamily(t.status ?? 0) === 'ok').length;
		if (ok === done.length)
			return done.length === 1
				? 'Round trip complete.'
				: `${done.length} round trips, all answered.`;
		return `${done.length} round trip${done.length === 1 ? '' : 's'}: ${ok} went well, ${done.length - ok} didn’t.`;
	}

	const emptyEndpoints = $derived(
		role === 'server'
			? 'No endpoints yet.'
			: down
				? 'The server is switched off.'
				: 'Endpoints light up here when a request reaches them.'
	);
</script>

{#snippet badge(status: number | undefined, testid?: string)}
	{#if status !== undefined}
		<span class="badge fam-{statusFamily(status)}" data-testid={testid}>{statusLabel(status)}</span>
	{/if}
{/snippet}

{#snippet miniTable(set: SqlResultSet, max: number)}
	<div class="tablewrap">
		<table>
			<thead>
				<tr>
					{#each set.columns as col (col)}<th scope="col">{col}</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each set.rows.slice(0, max) as row, i (i)}
					<tr>
						{#each set.columns as col (col)}
							<td class:null={row[col] === null || row[col] === undefined}>{cellText(row[col])}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

{#snippet screenItem(item: ScreenItem)}
	{#if item.kind === 'text'}
		<p class="s-text">{item.text}</p>
	{:else if item.kind === 'error'}
		<div class="s-error" role="alert">
			<span class="s-error-icon" aria-hidden="true">{item.status === 0 ? '📵' : '⚠️'}</span>
			<div>
				{@render badge(item.status)}
				<p>{item.text}</p>
			</div>
		</div>
	{:else}
		{@const view = viewOfJson(item.value)}
		{#if view.kind === 'text'}
			<p class="s-text">{view.text}</p>
		{:else if view.kind === 'list'}
			<ul class="s-list">
				{#each view.items as it, i (i)}<li>{it}</li>{/each}
				{#if view.more}<li class="more">and {view.more} more</li>{/if}
			</ul>
		{:else}
			{#each view.cards as card, i (i)}
				<div class="s-card">
					{#if card.heading}<p class="s-heading">{card.heading}</p>{/if}
					{#if card.rows.length}
						<dl>
							{#each card.rows as [k, v] (k)}
								<div class="kv">
									<dt>{k}</dt>
									<dd>{v}</dd>
								</div>
							{/each}
						</dl>
					{/if}
				</div>
			{/each}
			{#if view.more}<p class="more">and {view.more} more</p>{/if}
		{/if}
	{/if}
{/snippet}

{#snippet wire(seg: Seg)}
	<div class="wire" class:live={packet?.seg === seg} aria-hidden="true">
		<span class="line"></span>
		{#if packet && packet.seg === seg}
			{#key packet.key}
				<span
					class="packet tone-{packet.tone}"
					class:back={packet.back}
					class:fizzle={packet.fizzle}
					style:--dur="{packet.dur}ms"
				>
					<span class="bit">📦</span>
					<span class="tag">{packet.text}</span>
					{#if packet.fizzle}<span class="zap">⚡</span>{/if}
				</span>
			{/key}
		{/if}
	</div>
{/snippet}

{#snippet databaseBox(big: boolean)}
	<section
		class="box db"
		class:active={active === 'database'}
		class:big
		aria-label="The database"
		data-testid="web-db"
	>
		<header class="box-head">
			<svg class="cyl" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<ellipse cx="12" cy="5.5" rx="7.5" ry="3" stroke="currentColor" stroke-width="2" />
				<path
					d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13"
					stroke="currentColor"
					stroke-width="2"
				/>
				<path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" stroke="currentColor" stroke-width="2" />
			</svg>
			<span class="box-title">Database</span>
			<span class="box-sub">{tableNames.length} table{tableNames.length === 1 ? '' : 's'}</span>
		</header>

		{#if big}
			<div class="result" data-testid="sql-result">
				{#if sqlResult}
					<p class="result-cap">
						{sqlResult.rows.length === 0
							? 'No rows matched.'
							: `${sqlResult.rows.length} row${sqlResult.rows.length === 1 ? '' : 's'}`}
					</p>
					{#if sqlResult.columns.length}
						{@render miniTable(sqlResult, 200)}
					{/if}
				{:else if ran && !playing}
					<p class="hint">Nothing came back as rows this time.</p>
				{:else}
					<p class="hint">Run your SQL and the rows it sends back show up here.</p>
				{/if}
			</div>
			{#if queries.length}
				<ol class="qlog" aria-label="What ran">
					{#each queries as q (q.n)}
						<li class:err={!!q.error}>
							<code>{q.sql.trim()}</code>
							<span class="qres">
								{q.error
									? q.error
									: q.rows !== undefined
										? `${q.rows} row${q.rows === 1 ? '' : 's'}`
										: q.changes !== undefined
											? `${q.changes} row${q.changes === 1 ? '' : 's'} changed`
											: 'done'}
							</span>
						</li>
					{/each}
				</ol>
			{/if}
		{:else if queries.length}
			<p class="lastq">
				<span class="eyebrow">Last query</span>
				<code>{queries[queries.length - 1].sql.trim()}</code>
			</p>
		{/if}

		{#if tableNames.length}
			<div class="tables">
				{#if big}<p class="eyebrow tables-head">What’s in the database</p>{/if}
				{#each tableNames as name (name)}
					{@const set = tables[name]}
					<details class="tbl" class:hot={activeTable === name}>
						<summary>
							<span class="tname">{name}</span>
							<span class="tcount">
								{#if tablesKnown}
									{set.rows.length >= 25
										? '25+ rows'
										: `${set.rows.length} row${set.rows.length === 1 ? '' : 's'}`}
								{:else}
									{set.columns.length} columns
								{/if}
							</span>
						</summary>
						{#if set.columns.length}
							{@render miniTable(set, 25)}
						{/if}
						{#if !tablesKnown}
							<p class="hint small">The rows show up after you press Run.</p>
						{/if}
					</details>
				{/each}
			</div>
		{:else}
			<p class="hint">No tables yet.</p>
		{/if}
	</section>
{/snippet}

<div class="web" class:sql={dbStage} data-testid="web-world" data-role={role}>
	<div class="stage">
		<div class="row">
			{#if showPhone}
				<section class="phone-col" aria-label="The phone">
					<div class="phone" class:active={active === 'client'} data-testid="web-phone">
						<div class="notch" aria-hidden="true"></div>
						<div class="appbar">
							<span class="appname"><span aria-hidden="true">✒️</span> Inkwell</span>
							{#if lastStatus !== null}
								{@render badge(lastStatus, 'web-status')}
							{/if}
						</div>
						<div class="screen" bind:this={screenEl} aria-live="polite" data-testid="web-screen">
							{#each screen as item, i (i)}
								<div class="s-item" data-testid="web-screen-item">{@render screenItem(item)}</div>
							{/each}
							{#if !screen.length}
								<p class="hint s-empty">
									{ran && !playing ? 'Nothing was put on the screen.' : 'Nothing on screen yet.'}
								</p>
							{/if}
						</div>
						<div class="homebar" aria-hidden="true"></div>
					</div>
				</section>
			{/if}

			{#if showPhone && showServer}
				{@render wire('ps')}
			{/if}

			{#if showServer}
				<div class="server-col">
					<section
						class="box server"
						class:active={active === 'server'}
						class:down
						aria-label="The server"
						data-testid="web-server"
					>
						<header class="box-head">
							<svg class="cyl" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<rect
									x="3.5"
									y="3.5"
									width="17"
									height="7"
									rx="2"
									stroke="currentColor"
									stroke-width="2"
								/>
								<rect
									x="3.5"
									y="13.5"
									width="17"
									height="7"
									rx="2"
									stroke="currentColor"
									stroke-width="2"
								/>
								<circle cx="7.5" cy="7" r="1.2" fill="currentColor" />
								<circle cx="7.5" cy="17" r="1.2" fill="currentColor" />
							</svg>
							<span class="box-title">Server</span>
							<span class="power" class:off={down}>
								<span class="dot" aria-hidden="true"></span>{down ? 'off' : 'on'}
							</span>
						</header>
						<p class="eyebrow mini-head">Endpoints</p>
						{#if routes.length}
							<ul class="routes" data-testid="web-routes">
								{#each routes as r (r.key)}
									<li class:hot={activeRoute === r.key} class:miss={r.pattern === null}>
										<span class="method m-{r.method.toLowerCase()}">{r.method}</span>
										{#if r.pattern === null}
											<span class="pattern">{r.path}</span>
											<span class="nomatch">no match</span>
										{:else}
											<span class="pattern">{r.pattern}</span>
										{/if}
										{#if r.hits > 1}<span class="hits">×{r.hits}</span>{/if}
									</li>
								{/each}
							</ul>
						{:else}
							<p class="hint">{emptyEndpoints}</p>
						{/if}
					</section>
					<section class="log" aria-label="Server log" data-testid="web-log">
						<p class="log-head">log</p>
						<div class="log-lines" bind:this={logEl} role="log">
							{#each logs as line, i (i)}
								<div class="log-line">
									{#if line.where === 'client'}<span class="where">phone</span>{/if}{line.text}
								</div>
							{/each}
							{#if !logs.length}
								<div class="log-empty">Nothing logged yet.</div>
							{/if}
						</div>
					</section>
				</div>
			{/if}

			{#if showDb && !dbStage}
				{#if showServer}{@render wire('sd')}{/if}
				<div class="db-col">{@render databaseBox(false)}</div>
			{/if}
		</div>

		{#if showDb && dbStage}
			<div class="db-stage">{@render databaseBox(true)}</div>
		{/if}
	</div>

	{#if trips.length}
		<ol class="trips" aria-label="Requests" data-testid="web-trips">
			{#each trips as t (t.id)}
				<li class="trip state-{t.state}" data-testid="web-response">
					<span class="method m-{t.method.toLowerCase()}">{t.method}</span>
					<code class="tpath">{t.path}</code>
					{#if t.label}<span class="tlabel">{t.label}</span>{/if}
					<span class="tstatus">
						{#if t.status !== undefined}
							{@render badge(t.status)}
						{:else if t.state === 'going'}
							<span class="badge fam-none">on its way…</span>
						{:else}
							<span class="badge fam-wait">waiting</span>
						{/if}
					</span>
				</li>
			{/each}
		</ol>
	{/if}

	<p class="caption" aria-live="polite">
		{#if caption}{caption}{:else if !ran}{role === 'sql'
				? 'You’re talking straight to the database.'
				: role === 'server'
					? 'Requests from the phone will come to your server.'
					: 'Your code runs on the phone.'}{/if}
		{#if stoppedReason}<span class="stopped">{stoppedReason}</span>{/if}
	</p>
</div>

<style>
	.web {
		--ink: #2b2521;
		--ok: #2f9e6e;
		--ok-soft: #e3f4ea;
		--amber: #93650a;
		--amber-soft: #fff1cf;
		--bad: #c8553d;
		--bad-soft: #fbe9e3;
		--grey: #6f665d;
		--grey-soft: #efe9e0;
		width: 100%;
		container-type: inline-size;
	}

	/* ---------- layout: vertical by default, a row when there's room ---------- */
	.row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0;
	}
	.phone-col,
	.server-col,
	.db-col {
		min-width: 0;
	}
	.server-col {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	@container (min-width: 600px) {
		.row {
			flex-direction: row;
			align-items: flex-start;
		}
		.phone-col {
			flex: 0 0 10.5rem;
		}
		.server-col {
			flex: 1.15 1 0;
		}
		.db-col {
			flex: 1 1 0;
		}
	}

	/* ---------- wires + Bit ---------- */
	.wire {
		position: relative;
		flex: 0 0 3.4rem;
		height: 3.4rem;
		margin: 0 auto;
		width: 2.5rem;
	}
	.line {
		position: absolute;
		left: 50%;
		top: 0;
		bottom: 0;
		border-left: 2.5px dashed #d6c9b6;
		transform: translateX(-50%);
	}
	.wire.live .line {
		border-color: color-mix(in oklab, var(--accent) 60%, #d6c9b6);
	}
	.packet {
		position: absolute;
		left: 50%;
		top: 0;
		display: flex;
		align-items: center;
		gap: 0.2rem;
		transform: translate(-50%, 0);
		animation: travel-y var(--dur) ease-in-out forwards;
		z-index: 2;
		white-space: nowrap;
	}
	.packet.back {
		animation-direction: reverse;
	}
	.packet.fizzle {
		animation: fizzle-y var(--dur) ease-out forwards;
	}
	.bit {
		font-size: 1.35rem;
		line-height: 1;
		filter: drop-shadow(0 2px 1px rgb(0 0 0 / 0.18));
	}
	.tag {
		font-size: 0.68rem;
		font-weight: 800;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		background: white;
		border: 1.5px solid var(--color-line);
		color: var(--ink);
	}
	.tone-ok .tag {
		background: var(--ok-soft);
		border-color: var(--ok);
		color: var(--ok);
	}
	.tone-client .tag {
		background: var(--amber-soft);
		border-color: #d7a536;
		color: var(--amber);
	}
	.tone-server .tag {
		background: var(--bad-soft);
		border-color: var(--bad);
		color: var(--bad);
	}
	.zap {
		font-size: 1rem;
	}
	@keyframes travel-y {
		from {
			top: -0.3rem;
		}
		to {
			top: calc(100% - 1.2rem);
		}
	}
	@keyframes fizzle-y {
		0% {
			top: -0.3rem;
			opacity: 1;
		}
		60% {
			top: 35%;
			opacity: 1;
		}
		100% {
			top: 40%;
			opacity: 0.25;
		}
	}
	@container (min-width: 600px) {
		.wire {
			flex: 0 0 4.2rem;
			width: auto;
			height: 2.5rem;
			margin: 4.5rem 0 0;
		}
		.line {
			left: 0;
			right: 0;
			top: 50%;
			bottom: auto;
			border-left: none;
			border-top: 2.5px dashed #d6c9b6;
			transform: translateY(-50%);
		}
		.wire.live .line {
			border-color: color-mix(in oklab, var(--accent) 60%, #d6c9b6);
		}
		.packet {
			top: 50%;
			left: 0;
			flex-direction: column;
			gap: 0;
			transform: translate(-50%, -70%);
			animation-name: travel-x;
		}
		.packet.fizzle {
			animation-name: fizzle-x;
		}
		.tag {
			position: absolute;
			top: 100%;
			margin-top: 0.15rem;
		}
	}
	@keyframes travel-x {
		from {
			left: 0;
		}
		to {
			left: 100%;
		}
	}
	@keyframes fizzle-x {
		0% {
			left: 0;
			opacity: 1;
		}
		60% {
			left: 45%;
			opacity: 1;
		}
		100% {
			left: 50%;
			opacity: 0.25;
		}
	}

	/* ---------- phone ---------- */
	.phone {
		position: relative;
		width: min(15rem, 100%);
		margin: 0 auto;
		padding: 0.55rem 0.45rem 0.6rem;
		border-radius: 1.9rem;
		background: var(--ink);
		box-shadow:
			0 12px 28px -14px rgb(60 40 20 / 0.55),
			inset 0 0 0 2px #463d37;
		transition: box-shadow 160ms ease;
	}
	.phone.active {
		box-shadow:
			0 0 0 3px color-mix(in oklab, var(--accent) 55%, transparent),
			0 12px 28px -14px rgb(60 40 20 / 0.55);
	}
	.notch {
		width: 3.2rem;
		height: 0.4rem;
		margin: 0 auto 0.4rem;
		border-radius: 999px;
		background: #4a403a;
	}
	.appbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.3rem;
		padding: 0.45rem 0.6rem;
		border-radius: 1.2rem 1.2rem 0 0;
		background: #fffdf8;
		border-bottom: 1px solid var(--color-line);
		min-height: 2.3rem;
	}
	.appname {
		font-weight: 900;
		font-size: 0.85rem;
		letter-spacing: -0.01em;
	}
	.screen {
		height: 15rem;
		overflow-y: auto;
		padding: 0.5rem;
		background: #f7f2ea;
		border-radius: 0 0 1.2rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.8rem;
	}
	.homebar {
		width: 3.6rem;
		height: 0.25rem;
		margin: 0.45rem auto 0;
		border-radius: 999px;
		background: #6a5f57;
	}
	.s-item {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		animation: s-in 220ms ease-out both;
	}
	.s-text {
		padding: 0.4rem 0.55rem;
		border-radius: 0.7rem;
		background: white;
		box-shadow: 0 1px 0 var(--color-line);
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.s-card {
		padding: 0.45rem 0.55rem;
		border-radius: 0.75rem;
		background: white;
		box-shadow:
			0 1px 0 var(--color-line),
			inset 3px 0 0 color-mix(in oklab, var(--accent) 55%, white);
	}
	.s-heading {
		font-weight: 800;
		font-size: 0.86rem;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.s-card dl {
		margin: 0.15rem 0 0;
	}
	.kv {
		display: flex;
		gap: 0.4rem;
		line-height: 1.35;
	}
	.kv dt {
		color: var(--color-muted);
		font-weight: 700;
		flex-shrink: 0;
	}
	.kv dt::after {
		content: ':';
	}
	.kv dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.s-list {
		margin: 0;
		padding: 0.4rem 0.55rem 0.4rem 1.4rem;
		border-radius: 0.7rem;
		background: white;
		list-style: disc;
	}
	.s-error {
		display: flex;
		gap: 0.45rem;
		align-items: flex-start;
		padding: 0.5rem 0.55rem;
		border-radius: 0.75rem;
		background: var(--bad-soft);
		border: 1px solid color-mix(in oklab, var(--bad) 35%, white);
	}
	.s-error p {
		margin-top: 0.2rem;
		overflow-wrap: anywhere;
	}
	.s-error-icon {
		font-size: 1rem;
	}
	.s-empty {
		margin: auto;
		text-align: center;
	}
	.more {
		color: var(--color-muted);
		font-size: 0.75rem;
		text-align: center;
	}

	/* ---------- boxes ---------- */
	.box {
		border-radius: 1.1rem;
		border: 1.5px solid var(--color-line);
		background: white;
		padding: 0.75rem 0.85rem 0.85rem;
		transition:
			box-shadow 160ms ease,
			border-color 160ms ease,
			opacity 200ms ease;
		min-width: 0;
	}
	.box.active {
		border-color: color-mix(in oklab, var(--accent) 60%, var(--color-line));
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 18%, transparent);
	}
	.box-head {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.4rem;
	}
	.cyl {
		width: 1.35rem;
		height: 1.35rem;
		color: var(--ink);
		flex-shrink: 0;
	}
	.box-title {
		font-weight: 900;
	}
	.box-sub {
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--color-muted);
		font-weight: 700;
	}
	.server {
		background: linear-gradient(#fbf9ff, white 40%);
	}
	.server.down {
		opacity: 0.55;
		filter: grayscale(0.8);
		background: repeating-linear-gradient(-45deg, #f6f2ec 0 8px, #fbf8f3 8px 16px);
	}
	.power {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 800;
		color: var(--ok);
	}
	.power .dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: currentColor;
	}
	.power.off {
		color: var(--grey);
	}
	.mini-head {
		font-size: 0.65rem;
		margin-bottom: 0.25rem;
	}
	.routes {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.routes li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.4rem;
		border-radius: 0.55rem;
		background: var(--color-sand);
		font-size: 0.8rem;
		min-width: 0;
		transition: background-color 150ms ease;
	}
	.routes li.hot {
		background: color-mix(in oklab, var(--accent) 22%, white);
	}
	.routes li.miss {
		background: var(--amber-soft);
	}
	.pattern {
		font-family: var(--font-mono);
		font-weight: 600;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.nomatch {
		margin-left: auto;
		font-size: 0.68rem;
		font-weight: 800;
		color: var(--amber);
		white-space: nowrap;
	}
	.hits {
		margin-left: auto;
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--color-muted);
	}
	.method {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		font-weight: 800;
		padding: 0.05rem 0.35rem;
		border-radius: 0.35rem;
		background: #e6eef8;
		color: #2b5f8a;
	}
	.m-post {
		background: #e3f4ea;
		color: #23774f;
	}
	.m-put {
		background: #fff1cf;
		color: #8a5d00;
	}
	.m-delete {
		background: #fbe9e3;
		color: #a8432c;
	}
	.log {
		border-radius: 0.9rem;
		background: #2a2420;
		color: #f6efe6;
		overflow: hidden;
	}
	.log-head {
		padding: 0.3rem 0.7rem;
		background: #342d28;
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		font-weight: 800;
		color: #b9ab9c;
		text-transform: uppercase;
	}
	.log-lines {
		max-height: 7.5rem;
		min-height: 2.6rem;
		overflow-y: auto;
		padding: 0.4rem 0.7rem 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		line-height: 1.5;
	}
	.log-line {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		animation: s-in 160ms ease-out both;
	}
	.where {
		margin-right: 0.4rem;
		padding: 0 0.3rem;
		border-radius: 0.3rem;
		background: #4a403a;
		color: #ffd9a8;
		font-size: 0.68rem;
	}
	.log-empty {
		color: #9d8f81;
		font-family: var(--font-sans);
	}

	/* ---------- database ---------- */
	.db {
		background: radial-gradient(120% 60% at 50% 0%, #eef6f1 0 45%, transparent 46%), white;
	}
	.db.big {
		padding: 0.9rem 1rem 1rem;
	}
	.lastq {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-bottom: 0.4rem;
	}
	.lastq .eyebrow {
		font-size: 0.62rem;
	}
	.lastq code,
	.qlog code {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.tables {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.tables-head {
		margin-top: 0.6rem;
		font-size: 0.65rem;
	}
	.tbl {
		border-radius: 0.65rem;
		background: var(--color-sand);
		transition: box-shadow 150ms ease;
	}
	.tbl.hot {
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 55%, transparent);
	}
	.tbl summary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.6rem;
		cursor: pointer;
		list-style: none;
		font-size: 0.82rem;
	}
	.tbl summary::-webkit-details-marker {
		display: none;
	}
	.tbl summary::before {
		content: '▸';
		font-size: 0.7rem;
		color: var(--color-muted);
		transition: transform 120ms ease;
	}
	.tbl[open] summary::before {
		transform: rotate(90deg);
	}
	.tname {
		font-family: var(--font-mono);
		font-weight: 700;
	}
	.tcount {
		margin-left: auto;
		font-size: 0.72rem;
		color: var(--color-muted);
		font-weight: 700;
	}
	.tablewrap {
		max-width: 100%;
		overflow-x: auto;
		padding: 0 0.4rem 0.45rem;
	}
	.result .tablewrap {
		padding: 0;
		max-height: 22rem;
		overflow-y: auto;
		border-radius: 0.7rem;
		border: 1px solid var(--color-line);
	}
	table {
		border-collapse: collapse;
		font-size: 0.74rem;
		width: max-content;
		min-width: 100%;
		background: white;
	}
	.result table {
		font-size: 0.86rem;
	}
	th,
	td {
		padding: 0.22rem 0.5rem;
		text-align: left;
		border-bottom: 1px solid var(--color-line);
		white-space: nowrap;
		max-width: 16rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	th {
		position: sticky;
		top: 0;
		background: #f9f5ef;
		font-family: var(--font-mono);
		font-weight: 800;
		color: var(--color-ink-soft);
	}
	td.null {
		color: var(--color-muted);
	}
	.result {
		margin: 0.3rem 0 0.4rem;
	}
	.result-cap {
		font-weight: 900;
		font-size: 1rem;
		margin-bottom: 0.35rem;
	}
	.qlog {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}
	.qlog li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.6rem;
		padding: 0.3rem 0.55rem;
		border-radius: 0.55rem;
		background: #2a2420;
		color: #f6efe6;
	}
	.qlog li.err {
		background: var(--bad-soft);
		color: var(--ink);
		border: 1px solid color-mix(in oklab, var(--bad) 35%, white);
	}
	.qres {
		margin-left: auto;
		font-size: 0.72rem;
		font-weight: 800;
		color: #ffd9a8;
	}
	.qlog li.err .qres {
		color: var(--bad);
		margin-left: 0;
	}

	/* ---------- trips + caption ---------- */
	.trips {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin: 0.9rem 0 0;
		padding: 0;
		list-style: none;
	}
	.trip {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
		padding: 0.35rem 0.6rem;
		border-radius: 0.7rem;
		background: var(--color-sand);
		font-size: 0.82rem;
	}
	.trip.state-going {
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 45%, transparent);
	}
	.tpath {
		font-family: var(--font-mono);
		font-weight: 600;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.tlabel {
		color: var(--color-muted);
		font-size: 0.75rem;
	}
	.tstatus {
		margin-left: auto;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		padding: 0.08rem 0.5rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.fam-ok {
		background: var(--ok-soft);
		color: var(--ok);
	}
	.fam-redirect {
		background: #e6eef8;
		color: #2b5f8a;
	}
	.fam-client {
		background: var(--amber-soft);
		color: var(--amber);
	}
	.fam-server {
		background: var(--bad-soft);
		color: var(--bad);
	}
	.fam-none,
	.fam-wait {
		background: var(--grey-soft);
		color: var(--grey);
	}
	.caption {
		margin-top: 0.75rem;
		min-height: 1.4rem;
		font-size: 0.88rem;
		color: var(--color-ink-soft);
		text-align: center;
	}
	.stopped {
		display: block;
		color: var(--bad);
		font-weight: 700;
	}
	.hint {
		color: var(--color-muted);
		font-size: 0.82rem;
	}
	.hint.small {
		padding: 0 0.6rem 0.45rem;
		font-size: 0.72rem;
	}
	@keyframes s-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.packet {
			display: none;
		}
	}
</style>
