<!--
  The net world: a small network (flavour 'network') or a cloud region (flavour 'cloud') drawn as
  nodes and wires. Bit 📦 carries each packet hop by hop; a dropped packet stops with a ✕ and a
  little bubble saying why. Calls the learner made are listed under the picture ("what you
  asked / what came back"), with a log panel and, for cloud traffic, a running counter and a
  status histogram.

  `play(trace, net)` replays a run (always resolves), `reset()` goes back to the spec.
  Narrow screens get smaller cards; if it still doesn't fit, the picture scrolls sideways.
-->
<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { NetLink, NetNode, NetWorldSpec } from '#lib/curriculum/types.ts';
	import type { NetResult, TraceEvent } from '#lib/engine/types.ts';
	import {
		KIND_NAME,
		NODE_ICON,
		callTone,
		dropReason,
		findNode,
		layoutNet,
		parseConfigCall,
		statusTone,
		type CallTone,
		type Point
	} from './net.ts';

	let { spec, stepMs = 220 }: { spec: NetWorldSpec; stepMs?: number } = $props();

	type PacketEv = Extract<TraceEvent, { t: 'packet' }>;
	type NodeEv = Extract<TraceEvent, { t: 'node' }>;
	type NetEv = Extract<TraceEvent, { t: 'packet' | 'node' | 'call' | 'log' | 'stopped' }>;

	interface NodeView extends NetNode {
		/** Ports blocked on a node that otherwise lets everything in (engine state) */
		block?: number[];
		busy?: boolean;
		fresh?: boolean;
		leaving?: boolean;
		hit?: 'ok' | 'drop' | null;
	}
	interface Flight {
		key: number;
		points: Point[];
		dur: number;
		text: string;
		tone: 'plain' | 'ok' | 'client' | 'server';
		small?: boolean;
	}
	interface Drop {
		key: number;
		x: number;
		y: number;
		reason: string;
		small?: boolean;
	}
	interface CallRow {
		n: number;
		call: string;
		result: string;
		tone: CallTone;
	}

	// ---------- the picture ----------
	const flavour = $derived(spec.flavour ?? 'network');
	const cloud = $derived(flavour === 'cloud');

	const cloneNodes = (list: readonly NetNode[] | undefined): NodeView[] =>
		(list ?? []).map((n) => ({
			...n,
			listens: n.listens ? { ...n.listens } : undefined,
			allow: n.allow ? [...n.allow] : undefined
		}));

	let nodes = $state<NodeView[]>(untrack(() => cloneNodes(spec.nodes)));
	let links = $state<NetLink[]>(untrack(() => [...(spec.links ?? [])]));
	let dns = $state<Record<string, string>>(untrack(() => ({ ...(spec.dns ?? {}) })));
	let routes = $state<Record<string, string>>({});
	let checks = $state<Record<string, string>>({});
	let calls = $state<CallRow[]>([]);
	let logs = $state<string[]>([]);
	let flights = $state<Flight[]>([]);
	let drops = $state<Drop[]>([]);
	let counter = $state<{ ok: number; failed: number } | null>(null);
	let histogram = $state<{ status: number; count: number }[] | null>(null);
	let caption = $state('');
	let ran = $state(false);
	let playing = $state(false);
	let stoppedReason = $state<string | null>(null);
	let wrapW = $state(0);
	let runToken = 0;
	let key = 0;
	let logEl: HTMLDivElement | undefined = $state();
	let callsEl: HTMLOListElement | undefined = $state();

	const compact = $derived(wrapW > 0 && wrapW < 560);
	const layout = $derived(layoutNet(nodes, links, { compact, at: spec.at }));
	const cloudIds = $derived(new Set(layout.clouds.map((c) => c.id)));
	const drawnNodes = $derived(nodes.filter((n) => !cloudIds.has(n.id)));
	const lbNode = $derived(nodes.find((n) => n.kind === 'lb'));
	const dnsNode = $derived(nodes.find((n) => n.kind === 'dns'));
	const trafficPlan = $derived(spec.traffic ?? []);
	const showTraffic = $derived(cloud || trafficPlan.length > 0);

	const labelOf = (id: string | undefined) => {
		if (!id) return 'somewhere';
		const n = findNode(nodes, id);
		return n?.label ?? n?.id ?? id;
	};

	function resetState() {
		nodes = cloneNodes(spec.nodes);
		links = [...(spec.links ?? [])];
		dns = { ...(spec.dns ?? {}) };
		routes = {};
		checks = {};
		calls = [];
		logs = [];
		flights = [];
		drops = [];
		counter = null;
		histogram = null;
		weight = 1;
		batchIdx = 0;
		tally = { ok: 0, failed: 0 };
		caption = '';
		ran = false;
		stoppedReason = null;
	}

	// ---------- timing ----------
	const pending = new Set<() => void>();

	function cancel() {
		runToken++;
		for (const end of [...pending]) end();
	}

	$effect(() => {
		void spec;
		cancel();
		playing = false;
		untrack(resetState);
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

	/** Runs `fn` after `ms` unless the replay was cancelled (for little visual clean-ups). */
	function later(ms: number, token: number, fn: () => void) {
		setTimeout(() => {
			if (token === runToken) fn();
		}, ms);
	}

	function scrollDown() {
		queueMicrotask(() => {
			logEl?.scrollTo({ top: logEl.scrollHeight });
			callsEl?.scrollTo({ top: callsEl.scrollHeight });
		});
	}

	/** Moves a flight along its points with the Web Animations API. */
	function fly(el: HTMLElement, f: Flight) {
		if (typeof el.animate !== 'function' || f.points.length === 0) return {};
		const frames = (f.points.length === 1 ? [f.points[0], f.points[0]] : f.points).map((p) => ({
			transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`
		}));
		const anim = el.animate(frames, { duration: f.dur, easing: 'linear', fill: 'forwards' });
		return { destroy: () => anim.cancel() };
	}

	function pointsOf(ev: PacketEv): { points: Point[]; stopAt: string | undefined } {
		let hops = Array.isArray(ev.hops) && ev.hops.length ? [...ev.hops] : [ev.from, ev.to];
		let stopAt: string | undefined;
		if (!ev.ok) {
			stopAt = ev.at ?? hops[hops.length - 1];
			const i = hops.indexOf(stopAt);
			if (i >= 0) hops = hops.slice(0, i + 1);
			else hops.push(stopAt);
		}
		const points: Point[] = [];
		for (const h of hops) {
			const n = findNode(nodes, h);
			const p = n ? layout.pos[n.id] : undefined;
			if (p) points.push(p);
		}
		return { points, stopAt };
	}

	function launch(ev: PacketEv, dur: number, small = false): Flight {
		const { points } = pointsOf(ev);
		const tone: Flight['tone'] = ev.status
			? statusTone(ev.status) === 'none'
				? 'plain'
				: (statusTone(ev.status) as Flight['tone'])
			: ev.ok
				? 'plain'
				: 'server';
		const text = ev.status ? String(ev.status) : String(ev.label ?? '');
		const f: Flight = { key: ++key, points, dur, text, tone, small };
		flights.push(f);
		return f;
	}

	function land(f: Flight, token: number) {
		later(f.dur + 60, token, () => {
			flights = flights.filter((x) => x.key !== f.key);
		});
	}

	function flash(id: string | undefined, kind: 'ok' | 'drop', token: number) {
		const n = id ? findNode(nodes, id) : undefined;
		if (!n) return;
		n.hit = kind;
		later(450, token, () => {
			const m = nodes.find((x) => x.id === n.id);
			if (m && m.hit === kind) m.hit = null;
		});
	}

	// ---------- applying events ----------
	function applyCall(call: string, result: string) {
		calls.push({ n: calls.length + 1, call, result, tone: callTone(result) });
		const c = parseConfigCall(call);
		if (!c) return;
		switch (c.fn) {
			case 'allow':
			case 'block': {
				const n = findNode(nodes, c.node);
				if (!n) break;
				const sorted = (xs: Iterable<number>) => [...new Set(xs)].sort((a, b) => a - b);
				if (n.allow) {
					n.allow = sorted(
						c.fn === 'allow' ? [...n.allow, c.port] : n.allow.filter((p) => p !== c.port)
					);
				} else {
					const blocked = n.block ?? [];
					n.block = sorted(
						c.fn === 'block' ? [...blocked, c.port] : blocked.filter((p) => p !== c.port)
					);
				}
				break;
			}
			case 'listen': {
				const n = findNode(nodes, c.node);
				if (n) n.listens = { ...(n.listens ?? {}), [c.port]: c.name };
				break;
			}
			case 'addRecord':
				dns[c.name] = c.ip;
				break;
			case 'route':
				routes[c.path] = c.service;
				break;
			case 'health':
				checks[c.service] = c.path;
				break;
		}
	}

	function applyNode(ev: NodeEv, token: number, instant: boolean): string {
		const n = nodes.find((x) => x.id === ev.id);
		switch (ev.state) {
			case 'added':
				if (n) {
					n.down = false;
					n.leaving = false;
				} else {
					const kind = (ev.kind as NetNode['kind']) ?? 'container';
					nodes.push({
						id: ev.id,
						kind,
						// Containers carry their image in the event's label.
						...(kind === 'container' ? { image: ev.label } : { label: ev.label }),
						service: ev.service,
						fresh: !instant
					});
					// Drop the flag once the pop-in is done so later animations don't replay it.
					later(420, token, () => {
						const m = nodes.find((x) => x.id === ev.id);
						if (m) m.fresh = false;
					});
				}
				return ev.kind && ev.kind !== 'container'
					? `A new ${KIND_NAME[ev.kind as NetNode['kind']] ?? ev.kind}, ${ev.label ?? ev.id}, starts up.`
					: `A new container, ${ev.id}${ev.label ? ` (${ev.label})` : ''}, starts up${cloud ? ' in the cloud' : ''}.`;
			case 'removed':
				if (n) {
					if (instant) nodes = nodes.filter((x) => x.id !== ev.id);
					else {
						n.leaving = true;
						later(420, token, () => (nodes = nodes.filter((x) => x.id !== ev.id)));
					}
				}
				return `${n?.label ?? ev.id} is shut down.`;
			case 'down':
				if (n) n.down = true;
				return `${n?.label ?? ev.id} goes down.`;
			case 'up':
				if (n) {
					n.down = false;
					n.unhealthy = false;
				}
				return `${n?.label ?? ev.id} is up and running.`;
			case 'unhealthy':
				if (n) n.unhealthy = true;
				return `${n?.label ?? ev.id} is failing its health check.`;
			case 'busy':
				if (n) {
					n.busy = true;
					later(instant ? 0 : 700, token, () => {
						const m = nodes.find((x) => x.id === ev.id);
						if (m) m.busy = false;
					});
				}
				return `${n?.label ?? ev.id} is flat out: more requests than it can handle.`;
		}
		return '';
	}

	// ---------- replay ----------
	type Seg = { kind: 'one'; ev: NetEv; idx: number } | { kind: 'burst'; evs: NetEv[] };
	/** A run of at least this many packets plays as a brisk stream (cloud traffic batches). */
	const BURST = 6;

	function segment(events: NetEv[]): Seg[] {
		const out: Seg[] = [];
		let i = 0;
		while (i < events.length) {
			if (events[i].t === 'packet') {
				let j = i;
				let packets = 0;
				while (j < events.length && (events[j].t === 'packet' || events[j].t === 'node')) {
					if (events[j].t === 'packet') packets++;
					j++;
				}
				if (packets >= BURST) {
					out.push({ kind: 'burst', evs: events.slice(i, j) });
					i = j;
					continue;
				}
			}
			out.push({ kind: 'one', ev: events[i], idx: i });
			i++;
		}
		return out;
	}

	/** Replays a run. Always resolves (never rejects), also when cancelled or given odd data. */
	export async function play(trace: TraceEvent[], net?: NetResult): Promise<void> {
		cancel();
		const token = runToken;
		resetState();
		ran = true;
		playing = true;
		try {
			await animate(token, Array.isArray(trace) ? trace : [], net);
		} catch {
			if (token !== runToken) return;
			try {
				finishPicture(net);
			} catch {
				finishPicture();
			}
		}
	}

	async function animate(token: number, trace: TraceEvent[], net?: NetResult) {
		const instant = reduced();
		const events = trace.filter(
			(e): e is NetEv => !!e && ['packet', 'node', 'call', 'log', 'stopped'].includes(e.t)
		);
		// Which call explains a dropped packet: the engine sends the packets of a call either
		// just before or just after the call itself; find out which from the first of each.
		const firstPacket = events.findIndex((e) => e.t === 'packet');
		const firstCall = events.findIndex((e) => e.t === 'call');
		const packetsFirst = firstPacket !== -1 && (firstCall === -1 || firstPacket < firstCall);
		const resultFor = (idx: number): string | undefined => {
			if (packetsFirst) {
				for (let j = idx + 1; j < events.length; j++) {
					const e = events[j];
					if (e.t === 'call') return e.result;
				}
			} else {
				for (let j = idx - 1; j >= 0; j--) {
					const e = events[j];
					if (e.t === 'call') return e.result;
				}
			}
			return undefined;
		};

		const segs = segment(events);
		// Long runs speed up so nobody waits forever.
		const singles = segs.filter((s) => s.kind === 'one').length;
		const scale = singles > 30 ? Math.max(0.25, 30 / singles) : 1;
		const step = Math.max(stepMs, 60) * scale;
		const hopMs = Math.max(stepMs * 1.5, 90) * scale;

		for (const seg of segs) {
			if (token !== runToken) return;
			if (seg.kind === 'burst') {
				if (!(await playBurst(seg.evs, token, instant))) return;
				continue;
			}
			const ev = seg.ev;
			switch (ev.t) {
				case 'packet': {
					drops = [];
					const { points, stopAt } = pointsOf(ev);
					const to = labelOf(ev.to);
					caption = `📦 Bit sets off from ${labelOf(ev.from)} towards ${to}${ev.label ? ` (${ev.label})` : ''}.`;
					countPacket(ev);
					const dur = Math.max(hopMs * Math.max(points.length - 1, 1), 120);
					if (!instant && points.length) {
						const f = launch(ev, dur);
						land(f, token);
					}
					if (!(await wait(dur, token, instant))) return;
					if (!ev.ok) {
						const at = stopAt ? findNode(nodes, stopAt) : undefined;
						const p = at ? layout.pos[at.id] : points[points.length - 1];
						const reason = dropReason(resultFor(seg.idx), labelOf(stopAt), !!at?.down);
						if (p) drops.push({ key: ++key, x: p.x, y: p.y, reason });
						flash(stopAt, 'drop', token);
						caption = `✕ ${reason}.`;
					} else {
						flash(ev.to, 'ok', token);
						caption = ev.status
							? `${to} answers ${ev.status}.`
							: `📦 Bit made it to ${to}.`;
					}
					if (!(await wait(step * 0.5, token, instant))) return;
					break;
				}
				case 'call': {
					applyCall(String(ev.call), String(ev.result));
					caption = `You asked ${ev.call}. What came back: ${ev.result}.`;
					scrollDown();
					if (!(await wait(step * 0.8, token, instant))) return;
					break;
				}
				case 'node': {
					caption = applyNode(ev, token, instant) || caption;
					if (!(await wait(step * 0.7, token, instant))) return;
					break;
				}
				case 'log': {
					logs.push(String(ev.text));
					noteBatchEnd(String(ev.text));
					scrollDown();
					if (!(await wait(step * 0.3, token, instant))) return;
					break;
				}
				case 'stopped':
					stoppedReason =
						ev.reason === 'timeout'
							? 'Stopped: it took too long.'
							: 'Stopped: too many steps (is something going round in circles?).';
					break;
			}
		}
		if (token !== runToken) return;
		if (!(await wait(Math.max(step, 200), token, instant))) return;
		finishPicture(net);
	}

	/**
	 * Big traffic batches only carry a sample of their requests as packets (one in five), so each
	 * packet of a batch counts for `batch.count / packets` requests. The exact totals from the
	 * result replace the running guess at the end.
	 */
	let weight = 1;
	let batchIdx = 0;
	let tally = { ok: 0, failed: 0 };

	function countPacket(ev: PacketEv) {
		if (ev.status === undefined) return;
		if (ev.ok && statusTone(ev.status) === 'ok') tally.ok += weight;
		else tally.failed += weight;
		counter = { ok: Math.round(tally.ok), failed: Math.round(tally.failed) };
	}

	/** The engine closes each traffic batch with a "Batch 2: …" log line. */
	function noteBatchEnd(text: string) {
		const m = /^Batch (\d+)\b/.exec(text);
		if (m) batchIdx = Number(m[1]);
	}

	/** Many packets (cloud traffic): a brisk stream of sample packets and a running counter. */
	async function playBurst(evs: NetEv[], token: number, instant: boolean): Promise<boolean> {
		const packets = evs.filter((e): e is PacketEv => e.t === 'packet');
		const batch = cloud ? trafficPlan[batchIdx] : undefined;
		const total = batch && batch.count > packets.length ? batch.count : packets.length;
		weight = total / Math.max(1, packets.length);
		const speed = Math.min(1, Math.max(stepMs, 60) / 220);
		const budget = Math.min(4200, Math.max(1600, total * 22)) * speed;
		const chunks = Math.min(packets.length, 16);
		const chunkMs = budget / chunks;
		drops = [];
		caption = `${total} requests arrive${lbNode ? ` at the ${labelOf(lbNode.id)}` : ''}…`;
		let cursor = 0;
		for (let c = 0; c < chunks; c++) {
			if (token !== runToken) return false;
			const end = Math.round(((c + 1) / chunks) * evs.length);
			const slice = evs.slice(cursor, end);
			cursor = end;
			const sp = slice.filter((e): e is PacketEv => e.t === 'packet');
			for (const e of slice) {
				if (e.t === 'node') applyNode(e, token, instant);
				else if (e.t === 'packet') countPacket(e);
			}
			if (!instant && sp.length) {
				// Show one packet per chunk, a failing one every other time if there is one.
				const failing = sp.find((p) => !p.ok || statusTone(p.status) !== 'ok');
				const rep = c % 2 === 1 && failing ? failing : sp[0];
				const hops = Math.max(pointsOf(rep).points.length - 1, 1);
				const f = launch(rep, Math.min(chunkMs * 2.2, hops * 260 * speed + 120), true);
				land(f, token);
				for (const p of sp) {
					if (!p.ok || statusTone(p.status) !== 'ok') flash(p.at ?? p.to, 'drop', token);
					else flash(p.to, 'ok', token);
				}
			}
			const k = counter;
			caption = `Traffic: ${k ? k.ok + k.failed : 0} of ${total} requests answered…`;
			if (!(await wait(chunkMs, token, instant))) return false;
		}
		weight = 1;
		return true;
	}

	/** The final picture comes from the result itself. */
	function finishPicture(net?: NetResult) {
		if (net) {
			if (Array.isArray(net.nodes) && net.nodes.length) {
				nodes = cloneNodes(net.nodes);
			}
			if (Array.isArray(net.links)) links = [...net.links];
			if (net.dns) dns = { ...net.dns };
			if (net.routes) routes = { ...net.routes };
			if (Array.isArray(net.calls) && net.calls.length !== calls.length) {
				calls = net.calls.map((c, i) => ({
					n: i + 1,
					call: String(c.call),
					result: String(c.result),
					tone: callTone(String(c.result))
				}));
			}
			const t = net.traffic;
			if (t && t.total > 0) {
				counter = { ok: t.ok, failed: t.failed };
				histogram = Object.entries(t.byStatus ?? {})
					.map(([s, count]) => ({ status: Number(s), count: Number(count) }))
					.filter((h) => h.count > 0)
					.sort((a, b) => a.status - b.status);
			}
		}
		flights = [];
		for (const n of nodes) {
			n.busy = false;
			n.hit = null;
			n.leaving = false;
		}
		caption = endCaption();
		playing = false;
		scrollDown();
	}

	function endCaption(): string {
		if (counter && counter.ok + counter.failed > 0) {
			const all = counter.ok + counter.failed;
			if (counter.failed === 0) return `All ${all} requests got an answer. Nobody noticed a thing.`;
			if (counter.ok === 0) return `None of the ${all} requests got through.`;
			return `${all} requests: ${counter.ok} went well, ${counter.failed} didn’t.`;
		}
		if (drops.length) return caption;
		if (!calls.length) return 'Nothing was asked this time.';
		return calls.length === 1 ? 'Done.' : `Done. ${calls.length} calls, answers below.`;
	}

	const histMax = $derived(Math.max(1, ...(histogram ?? []).map((h) => h.count)));

	const portChips = (n: NetNode) =>
		Object.entries(n.listens ?? {}).map(([port, name]) => ({ port, name: String(name) }));

	const allowText = (n: NetNode & { block?: number[] }) =>
		n.allow === undefined
			? n.block?.length
				? `lets everything in but ${n.block.map((p) => `:${p}`).join(' ')}`
				: 'lets everything in'
			: n.allow.length === 0
				? 'lets nothing in'
				: `lets in ${n.allow.map((p) => `:${p}`).join(' ')}`;

	const routeEntries = $derived(Object.entries(routes));
	const dnsEntries = $derived(Object.entries(dns));
</script>

{#snippet containerIcon()}
	<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
		<rect x="2.5" y="6" width="19" height="12" rx="2" stroke="currentColor" stroke-width="1.8" />
		<path
			d="M7 9v6M10.5 9v6M14 9v6M17.5 9v6"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
		/>
	</svg>
{/snippet}

{#snippet nodeCard(n: NodeView, p: Point, inCloud: boolean)}
	{@const isYou = n.id === spec.at}
	<div
		class="node kind-{n.kind}"
		class:incloud={inCloud}
		class:down={n.down}
		class:busy={n.busy}
		class:fresh={n.fresh}
		class:leaving={n.leaving}
		class:hit-ok={n.hit === 'ok'}
		class:hit-drop={n.hit === 'drop'}
		class:you={isYou}
		style:left="{p.x}px"
		style:top="{p.y}px"
		style:width="{inCloud ? layout.cellW - 10 : layout.nodeW}px"
		data-testid="net-node-{n.id}"
		data-kind={n.kind}
		data-down={n.down ? 'true' : undefined}
		data-unhealthy={n.unhealthy ? 'true' : undefined}
		aria-label="{KIND_NAME[n.kind] ?? n.kind} {n.label ?? n.id}{n.down ? ', switched off' : ''}"
	>
		{#if isYou}
			<span class="you-tag">{cloud ? 'traffic from here' : 'your code runs here'}</span>
		{/if}
		<span class="icon" aria-hidden="true">
			{#if n.kind === 'container'}{@render containerIcon()}{:else}{NODE_ICON[n.kind] ?? '❔'}{/if}
			{#if n.kind === 'firewall'}<span class="lock">🔒</span>{/if}
		</span>
		<span class="nlabel">{n.label ?? n.id}</span>
		{#if n.ip}<span class="ip">{n.ip}</span>{/if}
		{#if n.kind === 'container' && n.image}<span class="ip">{n.image}</span>{/if}
		{#if n.down}
			<span class="state off"><span aria-hidden="true">⏻</span> off</span>
		{:else if n.kind === 'container'}
			<span class="state" class:sick={n.unhealthy}>
				<span aria-hidden="true">{n.unhealthy ? '❤️‍🩹' : '❤️'}</span>
				{n.unhealthy ? 'failing checks' : 'healthy'}
			</span>
		{/if}
		{#if n.kind === 'firewall' || (n.kind !== 'container' && (n.allow !== undefined || n.block?.length))}
			<span class="allow" data-testid="net-allow-{n.id}"
				><span aria-hidden="true">🛡️</span> {allowText(n)}</span
			>
		{/if}
		{#if portChips(n).length}
			<span class="ports">
				{#each portChips(n).slice(0, 3) as c (c.port)}
					<span class="port"><b>:{c.port}</b> {c.name}</span>
				{/each}
				{#if portChips(n).length > 3}<span class="port">+{portChips(n).length - 3}</span>{/if}
			</span>
		{/if}
		{#if n.kind === 'dns' && n.id === dnsNode?.id && dnsEntries.length}
			<span class="records">
				{#each dnsEntries.slice(0, 3) as [name, ip] (name)}
					<span class="rec">{name} → {ip}</span>
				{/each}
				{#if dnsEntries.length > 3}<span class="rec">+{dnsEntries.length - 3} more</span>{/if}
			</span>
		{/if}
		{#if n.kind === 'lb' && n.id === lbNode?.id && (routeEntries.length || Object.keys(checks).length)}
			<span class="records">
				{#each routeEntries.slice(0, 3) as [path, service] (path)}
					<span class="rec">{path} → {service}</span>
				{/each}
				{#each Object.entries(checks).slice(0, 2) as [service, path] (service)}
					<span class="rec">♥ checks {service} {path}</span>
				{/each}
			</span>
		{/if}
	</div>
{/snippet}

<div class="net" data-testid="net-world" data-flavour={flavour}>
	<div class="scroller" bind:clientWidth={wrapW}>
		<div
			class="stage"
			class:compact
			style:width="{layout.width}px"
			style:height="{layout.height}px"
		>
			{#each layout.clouds as c (c.id)}
				{@const cn = nodes.find((n) => n.id === c.id)}
				<div
					class="cloud"
					class:down={cn?.down}
					style:left="{c.x}px"
					style:top="{c.y}px"
					style:width="{c.w}px"
					style:height="{c.h}px"
					data-testid="net-node-{c.id}"
					data-kind="cloud"
				>
					<span class="cloud-head"
						><span aria-hidden="true">☁️</span> {cn?.label ?? c.id}{#if cn?.down}
							<span class="state off">⏻ off</span>{/if}</span
					>
					{#if !nodes.some((n) => n.kind === 'container')}
						<span class="cloud-empty">Nothing running here yet.</span>
					{/if}
				</div>
			{/each}

			<svg
				class="wires"
				width={layout.width}
				height={layout.height}
				viewBox="0 0 {layout.width} {layout.height}"
				aria-hidden="true"
			>
				{#each links as l, i (i)}
					{@const a = layout.pos[findNode(nodes, l.from)?.id ?? '']}
					{@const b = layout.pos[findNode(nodes, l.to)?.id ?? '']}
					{#if a && b && !cloudIds.has(l.from) && !cloudIds.has(l.to)}
						<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="wire" />
						{#if l.latencyMs !== undefined}
							<g transform="translate({(a.x + b.x) / 2}, {(a.y + b.y) / 2})">
								<rect x="-19" y="-9" width="38" height="18" rx="9" class="lat-bg" />
								<text class="lat" text-anchor="middle" dominant-baseline="central"
									>{l.latencyMs} ms</text
								>
							</g>
						{/if}
					{/if}
				{/each}
			</svg>

			{#each drawnNodes as n (n.id)}
				{@const p = layout.pos[n.id]}
				{#if p}
					{@render nodeCard(n, p, n.kind === 'container' && layout.clouds.length > 0)}
				{/if}
			{/each}

			{#each flights as f (f.key)}
				<span class="flight tone-{f.tone}" class:small={f.small} use:fly={f} aria-hidden="true">
					<span class="bit">📦</span>
					{#if f.text && !f.small}<span class="ftag">{f.text}</span>{/if}
				</span>
			{/each}

			{#each drops as d (d.key)}
				<div class="drop" style:left="{d.x}px" style:top="{d.y}px" data-testid="net-drop">
					<span class="x" aria-hidden="true">✕</span>
					<span class="bubble">{d.reason}</span>
				</div>
			{/each}
		</div>
	</div>

	{#if showTraffic}
		<section class="traffic" aria-label="Traffic" data-testid="net-traffic">
			<p class="eyebrow mini-head">Traffic</p>
			{#if counter}
				<p class="counter" aria-live="polite">
					<span class="ok">{counter.ok} ok</span>
					<span aria-hidden="true">·</span>
					<span class="bad" class:zero={counter.failed === 0}>{counter.failed} failed</span>
				</p>
			{:else if trafficPlan.length}
				<ul class="plan">
					{#each trafficPlan as t, i (i)}
						<li>
							<b>{t.count}</b> request{t.count === 1 ? '' : 's'} to <code>{t.path}</code>{#if t.label}
								<span class="muted">· {t.label}</span>{/if}
						</li>
					{/each}
				</ul>
				<p class="hint">They arrive after your code has set things up.</p>
			{:else}
				<p class="hint">No traffic this time.</p>
			{/if}
			{#if histogram && histogram.length}
				<ul class="hist" aria-label="Answers by status">
					{#each histogram as h (h.status)}
						<li>
							<span class="hs fam-{statusTone(h.status)}">{h.status}</span>
							<span class="bar"
								><span
									class="fill fam-{statusTone(h.status)}"
									style:width="{Math.max(3, (h.count / histMax) * 100)}%"
								></span></span
							>
							<span class="hc">{h.count}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<div class="below">
		<section class="calls" aria-label="What you asked and what came back">
			<p class="eyebrow mini-head">What you asked · what came back</p>
			<ol class="call-list" bind:this={callsEl} data-testid="net-calls">
				{#each calls as c (c.n)}
					<li class="call tone-{c.tone}" data-testid="net-call">
						<code class="asked">{c.call}</code>
						<span class="arrow" aria-hidden="true">→</span>
						<code class="answer">{c.result}</code>
					</li>
				{/each}
				{#if !calls.length}
					<li class="hint empty">
						{ran && !playing
							? 'No calls this time.'
							: cloud
								? 'Your setup commands and what they did show up here.'
								: 'Each thing you ask, and the answer, shows up here.'}
					</li>
				{/if}
			</ol>
		</section>
		<section class="log" aria-label="Log" data-testid="net-log">
			<p class="log-head">log</p>
			<div class="log-lines" bind:this={logEl} role="log">
				{#each logs as line, i (i)}
					<div class="log-line">{line}</div>
				{/each}
				{#if !logs.length}<div class="log-empty">Nothing logged yet.</div>{/if}
			</div>
		</section>
	</div>

	<p class="caption" aria-live="polite">
		{#if caption}{caption}{:else if !ran}{cloud
				? 'You’re the operator: your code sets up the cloud, then the traffic arrives.'
				: `Your code runs on ${labelOf(spec.at)}. Packets travel along the wires.`}{/if}
		{#if stoppedReason}<span class="stopped">{stoppedReason}</span>{/if}
	</p>
</div>

<style>
	.net {
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
		min-width: 0;
	}
	.scroller {
		width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		border-radius: 1rem;
		background:
			radial-gradient(circle at 1px 1px, rgb(43 37 33 / 0.07) 1px, transparent 1.5px) 0 0 / 14px
				14px,
			#fdfaf5;
		border: 1px solid var(--color-line);
		-webkit-overflow-scrolling: touch;
	}
	.stage {
		position: relative;
		margin: 0 auto;
	}
	.wires {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.wire {
		stroke: #d3c4ae;
		stroke-width: 2.5;
		stroke-dasharray: 5 5;
	}
	.lat-bg {
		fill: #fffdf9;
		stroke: #e6d9c6;
	}
	.lat {
		font-size: 10px;
		font-weight: 800;
		fill: var(--grey);
		font-family: var(--font-mono);
	}

	/* ---------- cloud region ---------- */
	.cloud {
		position: absolute;
		border-radius: 1.4rem;
		border: 2px dashed #9fbad6;
		background: color-mix(in oklab, #dceaf7 55%, transparent);
		transition:
			height 300ms ease,
			width 300ms ease;
	}
	.cloud.down {
		opacity: 0.5;
	}
	.cloud-head {
		position: absolute;
		top: 6px;
		left: 12px;
		font-size: 0.78rem;
		font-weight: 800;
		color: #2f5577;
		display: flex;
		gap: 0.3rem;
		align-items: center;
	}
	.cloud-empty {
		position: absolute;
		inset: 30px 10px 10px;
		display: grid;
		place-items: center;
		text-align: center;
		font-size: 0.75rem;
		color: #5f7891;
	}

	/* ---------- nodes ---------- */
	.node {
		position: absolute;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		padding: 0.45rem 0.35rem 0.4rem;
		background: white;
		border: 1.5px solid var(--color-line);
		border-radius: 0.9rem;
		box-shadow: var(--shadow-soft);
		text-align: center;
		z-index: 1;
		transition:
			opacity 300ms ease,
			filter 300ms ease,
			border-color 150ms ease,
			box-shadow 150ms ease;
	}
	.node.incloud {
		padding: 0.3rem 0.25rem;
		border-radius: 0.75rem;
	}
	.node.you {
		border-color: color-mix(in oklab, var(--accent) 55%, var(--color-line));
	}
	.you-tag {
		position: absolute;
		top: -0.65rem;
		left: 50%;
		transform: translateX(-50%);
		white-space: nowrap;
		font-size: 0.62rem;
		font-weight: 800;
		padding: 0 0.4rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--on-accent);
	}
	.icon {
		position: relative;
		font-size: 1.55rem;
		line-height: 1.1;
		color: var(--ink);
	}
	.incloud .icon {
		font-size: 1.2rem;
	}
	.lock {
		position: absolute;
		right: -0.75rem;
		bottom: -0.1rem;
		font-size: 0.8rem;
	}
	.nlabel {
		font-weight: 800;
		font-size: 0.8rem;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}
	.ip {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--grey);
		overflow-wrap: anywhere;
	}
	.state {
		font-size: 0.66rem;
		font-weight: 800;
		color: var(--ok);
	}
	.state.sick {
		color: var(--bad);
	}
	.state.off {
		color: var(--grey);
	}
	.allow {
		font-size: 0.64rem;
		font-weight: 700;
		color: var(--amber);
		line-height: 1.2;
	}
	.ports,
	.records {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.2rem;
		margin-top: 0.15rem;
	}
	.port,
	.rec {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		padding: 0.02rem 0.35rem;
		border-radius: 999px;
		background: var(--grey-soft);
		color: var(--ink);
		white-space: nowrap;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.port b {
		color: #2b5f8a;
	}
	.node.down {
		opacity: 0.45;
		filter: grayscale(1);
	}
	.node.busy {
		animation: busy 700ms ease-in-out infinite;
		border-color: #e0a63a;
	}
	.node.fresh {
		animation: pop 380ms cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
	}
	.node.leaving {
		opacity: 0;
		transform: translate(-50%, -50%) scale(0.7);
		transition:
			opacity 380ms ease,
			transform 380ms ease;
	}
	.node.hit-ok {
		border-color: var(--ok);
		box-shadow: 0 0 0 4px color-mix(in oklab, var(--ok) 22%, transparent);
	}
	.node.hit-drop {
		border-color: var(--bad);
		box-shadow: 0 0 0 4px color-mix(in oklab, var(--bad) 22%, transparent);
	}
	.compact .node {
		padding: 0.35rem 0.25rem 0.3rem;
	}
	.compact .icon {
		font-size: 1.3rem;
	}
	.compact .nlabel {
		font-size: 0.72rem;
	}
	@keyframes busy {
		50% {
			box-shadow: 0 0 0 6px color-mix(in oklab, #e0a63a 30%, transparent);
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.6);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}

	/* ---------- packets ---------- */
	.flight {
		position: absolute;
		left: 0;
		top: 0;
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 0.15rem;
		pointer-events: none;
		white-space: nowrap;
	}
	.bit {
		font-size: 1.35rem;
		line-height: 1;
		filter: drop-shadow(0 2px 1px rgb(0 0 0 / 0.18));
	}
	.flight.small .bit {
		font-size: 0.95rem;
	}
	.ftag {
		font-size: 0.64rem;
		font-weight: 800;
		padding: 0.02rem 0.38rem;
		border-radius: 999px;
		background: white;
		border: 1.5px solid var(--color-line);
		color: var(--ink);
	}
	.tone-ok .ftag {
		background: var(--ok-soft);
		border-color: var(--ok);
		color: var(--ok);
	}
	.tone-client .ftag {
		background: var(--amber-soft);
		border-color: #d7a536;
		color: var(--amber);
	}
	.tone-server .ftag {
		background: var(--bad-soft);
		border-color: var(--bad);
		color: var(--bad);
	}
	.drop {
		position: absolute;
		z-index: 4;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		pointer-events: none;
		animation: pop 260ms ease-out both;
	}
	.x {
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 999px;
		background: var(--bad);
		color: white;
		font-weight: 900;
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
	}
	.bubble {
		margin-top: 0.3rem;
		max-width: 11rem;
		padding: 0.25rem 0.55rem;
		border-radius: 0.7rem;
		background: var(--bad-soft);
		border: 1.5px solid var(--bad);
		color: #7a2c1c;
		font-size: 0.7rem;
		font-weight: 700;
		line-height: 1.25;
		text-align: center;
	}

	/* ---------- traffic ---------- */
	.mini-head {
		margin-bottom: 0.3rem;
	}
	.traffic {
		margin-top: 0.75rem;
		padding: 0.7rem 0.9rem;
		border-radius: 1rem;
		background: white;
		border: 1px solid var(--color-line);
	}
	.counter {
		font-size: 1.15rem;
		font-weight: 900;
		display: flex;
		gap: 0.45rem;
		align-items: baseline;
		font-variant-numeric: tabular-nums;
	}
	.counter .ok {
		color: var(--ok);
	}
	.counter .bad {
		color: var(--bad);
	}
	.counter .bad.zero {
		color: var(--grey);
	}
	.plan {
		font-size: 0.85rem;
		display: grid;
		gap: 0.15rem;
	}
	.plan code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
	.muted {
		color: var(--grey);
	}
	.hist {
		margin-top: 0.5rem;
		display: grid;
		gap: 0.3rem;
	}
	.hist li {
		display: grid;
		grid-template-columns: 2.6rem 1fr 3rem;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
	}
	.hs {
		font-family: var(--font-mono);
		font-weight: 800;
	}
	.hs.fam-ok {
		color: var(--ok);
	}
	.hs.fam-client {
		color: var(--amber);
	}
	.hs.fam-server {
		color: var(--bad);
	}
	.bar {
		height: 0.7rem;
		border-radius: 999px;
		background: var(--grey-soft);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--grey);
		transition: width 400ms ease;
	}
	.fill.fam-ok {
		background: var(--ok);
	}
	.fill.fam-client {
		background: #d7a536;
	}
	.fill.fam-server {
		background: var(--bad);
	}
	.hc {
		text-align: right;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	/* ---------- calls + log ---------- */
	.below {
		margin-top: 0.75rem;
		display: grid;
		gap: 0.75rem;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 900px) {
		.below {
			grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		}
	}
	.calls {
		min-width: 0;
	}
	.call-list {
		max-height: 12rem;
		overflow-y: auto;
		display: grid;
		gap: 0.25rem;
	}
	.call {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem;
		padding: 0.3rem 0.6rem;
		border-radius: 0.7rem;
		background: white;
		border: 1px solid var(--color-line);
		font-size: 0.82rem;
		animation: fade 220ms ease-out both;
	}
	.asked {
		font-family: var(--font-mono);
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.arrow {
		color: var(--grey);
	}
	.answer {
		font-family: var(--font-mono);
		font-weight: 800;
		padding: 0 0.4rem;
		border-radius: 0.4rem;
		background: var(--grey-soft);
		overflow-wrap: anywhere;
	}
	.call.tone-good .answer {
		background: var(--ok-soft);
		color: var(--ok);
	}
	.call.tone-bad .answer {
		background: var(--bad-soft);
		color: var(--bad);
	}
	.hint {
		color: var(--color-muted);
		font-size: 0.82rem;
	}
	.empty {
		padding: 0.3rem 0.1rem;
	}
	.log {
		min-width: 0;
		border-radius: 0.9rem;
		background: #2a2420;
		color: #f6efe6;
		padding: 0.45rem 0.7rem 0.55rem;
	}
	.log-head {
		font-size: 0.68rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #b9ab9b;
	}
	.log-lines {
		max-height: 9rem;
		overflow-y: auto;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.log-line {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.log-empty {
		color: #9a8d80;
		font-style: italic;
	}
	.caption {
		margin-top: 0.7rem;
		min-height: 1.5em;
		font-size: 0.9rem;
		color: var(--color-ink-soft);
	}
	.stopped {
		display: block;
		color: var(--bad);
		font-weight: 700;
	}
	@keyframes fade {
		from {
			opacity: 0;
			transform: translateY(3px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.node,
		.node.busy,
		.node.fresh,
		.drop,
		.call,
		.cloud,
		.fill {
			animation: none;
			transition: none;
		}
	}
</style>
