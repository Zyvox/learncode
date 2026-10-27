/**
 * Net world ("Behind the app": networks and the cloud). One picture: nodes and wires.
 * See docs/INFRA.md for the learner-facing API.
 *
 * - network: the learner's code runs on `spec.at` (usually the laptop) and asks the network
 *   questions (`lookup`, `ping`, `connect`, `trace`) or changes it (`allow`, `block`, `listen`,
 *   `addRecord`). Every call is one step, one `call` trace event and a `packet` per trip.
 * - cloud: the code configures services (`deploy`, `scale`, `route`, `release`, `health`, `env`);
 *   after it returns, `spec.traffic` hits the load balancer (`afterProgram`).
 *
 * The routing rules live in pure functions (`canReach`, `findRoute`, `portAllowed`) so the
 * checks in evaluate.ts judge the final state with exactly the rules the run used.
 */
import type { Check, NetLink, NetNode, NetWorldSpec, ThemedText } from '#lib/curriculum/types.ts';
import type { NetResult, TraceEvent } from '../types.ts';
import { closestName } from '../errors.ts';
import { CommandError, SpecError, createBase, formatArgs, type World } from '../core.ts';

export const NET_MAX_STEPS = 200;
/** Copies of one service a learner may run */
export const MAX_REPLICAS = 20;
/** Requests in one traffic batch at most (content sanity) */
export const MAX_BATCH = 10000;
/** Batches bigger than this get one packet event per SAMPLE_EVERY requests */
export const PACKET_SAMPLE_OVER = 30;
export const SAMPLE_EVERY = 5;
export const DEFAULT_LATENCY_MS = 10;
export const DEFAULT_CAPACITY = 5;

export type NetFlavour = NetWorldSpec['flavour'];

export const NET_TOO_MANY_STEPS: ThemedText = `Your program made more than ${NET_MAX_STEPS} calls, so it was stopped. That usually means a loop that never ends.`;

/** Logged when a name needs DNS and no dns node can be reached */
export const NO_DNS_MESSAGE = 'No DNS server could be reached.';

const tick = (s: string) => '`' + s + '`';

export const NET_ALIASES: Record<NetFlavour, Record<string, string>> = {
	network: {
		nslookup: 'lookup',
		dig: 'lookup',
		host: 'lookup',
		resolve: 'lookup',
		dns: 'lookup',
		traceroute: 'trace',
		tracert: 'trace',
		tracepath: 'trace',
		open: 'allow',
		openPort: 'allow',
		deny: 'block',
		closePort: 'block',
		serve: 'listen',
		print: 'log'
	},
	cloud: {
		run: 'deploy',
		start: 'deploy',
		replicas: 'scale',
		rollout: 'release',
		update: 'release',
		upgrade: 'release',
		healthcheck: 'health',
		healthCheck: 'health',
		setEnv: 'env',
		config: 'env',
		print: 'log'
	}
};

/** A node during a run: the spec's shape plus ports explicitly blocked on an allow-everything node. */
export type NetNodeState = NetNode & { block?: number[] };

/** Enough of the network to route through: a NetResult or the live state both fit. */
export interface NetView {
	nodes: readonly NetNode[];
	links: readonly NetLink[];
	dns?: Record<string, string>;
}

export interface NetTraffic {
	total: number;
	ok: number;
	failed: number;
	byStatus: Record<number, number>;
}

export interface NetState {
	flavour: NetFlavour;
	at: string;
	nodes: NetNodeState[];
	links: NetLink[];
	dns: Record<string, string>;
	calls: { call: string; result: string }[];
	/** cloud: lb path prefix -> service */
	routes: Record<string, string>;
	/** cloud: service -> health check path */
	health: Record<string, string>;
	/** cloud: service -> settings */
	env: Record<string, Record<string, string>>;
	/** cloud: service -> the image new containers get */
	services: Record<string, { image: string }>;
	traffic: NetTraffic;
}

export type NetWorld = World & { kind: 'net'; state: NetState; finish(): { net: NetResult } };

/** Outcome of trying to reach `to` on a port (the four causes, plus success). */
export type Reach =
	| { result: 'open' | 'closed'; path: string[] }
	/** `by` is the firewall (or the target itself) that dropped it */
	| { result: 'filtered'; path: string[]; by: string }
	/**
	 * `path` is the way it would have gone (or just `[from]` when no wires lead there); `by` is
	 * the first down node on it. Neither: no wires at all, or nothing has that address.
	 */
	| { result: 'no route'; path: string[]; by?: string; address?: string }
	| { result: 'unknown host'; path: string[] };

// ---------------------------------------------------------------------------------------------
// Pure helpers (also used by evaluate.ts)
// ---------------------------------------------------------------------------------------------

export function isIp(s: string): boolean {
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every((p) => Number(p) <= 255);
}

/** Undirected adjacency, neighbours in link order (so routes are deterministic). */
export function adjacency(links: readonly NetLink[]): Map<string, string[]> {
	const adj = new Map<string, string[]>();
	const add = (a: string, b: string) => {
		const list = adj.get(a) ?? [];
		if (!list.includes(b)) list.push(b);
		adj.set(a, list);
	};
	for (const l of links) {
		add(l.from, l.to);
		add(l.to, l.from);
	}
	return adj;
}

function nodeMap(nodes: readonly NetNode[]): Map<string, NetNode> {
	return new Map(nodes.map((n) => [n.id, n]));
}

/** Shortest path by hops (BFS), optionally avoiding down nodes. Includes both ends. */
function bfs(
	view: NetView,
	from: string,
	to: string,
	avoidDown: boolean,
	byId = nodeMap(view.nodes)
): string[] | null {
	if (!byId.has(from) || !byId.has(to)) return null;
	const isDown = (id: string) => avoidDown && !!byId.get(id)?.down;
	if (isDown(from) || isDown(to)) return null;
	if (from === to) return [from];
	const adj = adjacency(view.links);
	const prev = new Map<string, string>([[from, '']]);
	const queue = [from];
	while (queue.length) {
		const cur = queue.shift()!;
		for (const next of adj.get(cur) ?? []) {
			if (prev.has(next) || isDown(next) || !byId.has(next)) continue;
			prev.set(next, cur);
			if (next === to) {
				const path = [to];
				for (let p = cur; p; p = prev.get(p)!) path.unshift(p);
				return path;
			}
			queue.push(next);
		}
	}
	return null;
}

/**
 * The way from `from` to `to`. Routes around down nodes when it can; when it can't, `path` is
 * the way it would have taken and `down` the first down node on it (`ok: false`).
 */
export function findRoute(
	view: NetView,
	from: string,
	to: string
): { ok: true; path: string[] } | { ok: false; path: string[]; down?: string } {
	const byId = nodeMap(view.nodes);
	const path = bfs(view, from, to, true, byId);
	if (path) return { ok: true, path };
	const planned = bfs(view, from, to, false, byId);
	if (planned) return { ok: false, path: planned, down: planned.find((id) => byId.get(id)?.down) };
	return { ok: false, path: byId.has(from) ? [from] : [] };
}

/** Does this node let `port` in? (its own `allow` list and any ports blocked on it) */
export function portAllowed(node: NetNode, port: number): boolean {
	const blocked = (node as NetNodeState).block;
	if (blocked?.includes(port)) return false;
	return node.allow === undefined || node.allow.includes(port);
}

/** Latency of a path: the sum of its links' `latencyMs` (default 10 each). */
export function pathLatency(view: NetView, path: string[]): number {
	let ms = 0;
	for (let i = 1; i < path.length; i++) {
		const a = path[i - 1];
		const b = path[i];
		const ls = view.links.filter(
			(l) => (l.from === a && l.to === b) || (l.from === b && l.to === a)
		);
		ms += Math.min(...ls.map((l) => l.latencyMs ?? DEFAULT_LATENCY_MS));
	}
	return ms;
}

/** Node for a host given as a node id, an address, or a DNS name (records looked up directly). */
export function nodeForHost(
	view: NetView,
	host: string
): { node: NetNode } | { address: string } | null {
	const byIp = (ip: string) => view.nodes.find((n) => n.ip === ip);
	if (isIp(host)) {
		const n = byIp(host);
		return n ? { node: n } : { address: host };
	}
	const ip = view.dns?.[host];
	if (ip !== undefined) {
		const n = byIp(ip);
		return n ? { node: n } : { address: ip };
	}
	const n = view.nodes.find((x) => x.id === host);
	return n ? { node: n } : null;
}

/**
 * Can `from` reach `to` on `port` with the network as it is? Same rules as `connect()`, except
 * names are looked up in `view.dns` directly (no DNS trip). `to` may be a node id, an address or
 * a DNS name.
 */
export function canReach(view: NetView, from: string, to: string, port: number): Reach {
	const target = nodeForHost(view, to);
	if (!target) return { result: 'unknown host', path: [] };
	if ('address' in target) {
		return {
			result: 'no route',
			path: view.nodes.some((n) => n.id === from) ? [from] : [],
			address: target.address
		};
	}
	return reachNode(view, from, target.node.id, port);
}

function reachNode(view: NetView, from: string, to: string, port: number): Reach {
	const route = findRoute(view, from, to);
	if (!route.ok) {
		const out: Reach = { result: 'no route', path: route.path };
		if (route.down) out.by = route.down;
		return out;
	}
	const byId = nodeMap(view.nodes);
	const path = route.path;
	for (let i = 1; i < path.length; i++) {
		const n = byId.get(path[i])!;
		const last = i === path.length - 1;
		if ((n.kind === 'firewall' || last) && !portAllowed(n, port)) {
			return { result: 'filtered', path, by: n.id };
		}
	}
	const target = byId.get(to)!;
	return { result: target.listens?.[port] !== undefined ? 'open' : 'closed', path };
}

/** Writes a value the way it would look in JavaScript source: strings single-quoted. */
export function sourceOf(v: unknown, depth = 0): string {
	if (typeof v === 'string') {
		return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
	}
	if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
	if (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'bigint') {
		return String(v);
	}
	if (typeof v === 'function') return 'function';
	if (typeof v === 'symbol') return v.toString();
	if (depth >= 3) return Array.isArray(v) ? '[…]' : '{…}';
	if (Array.isArray(v)) return `[${v.map((x) => sourceOf(x, depth + 1)).join(', ')}]`;
	const keys = Object.keys(v as object);
	if (keys.length === 0) return '{}';
	return `{ ${keys
		.map((k) => {
			const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : sourceOf(k);
			return `${key}: ${sourceOf((v as Record<string, unknown>)[k], depth + 1)}`;
		})
		.join(', ')} }`;
}

/** The call's answer as the trace and the checks see it. */
export function resultText(v: unknown): string {
	if (typeof v === 'string') return v;
	if (v === undefined) return 'ok';
	return sourceOf(v);
}

/** 'reader-10' sorts after 'reader-2' */
function containerOrder(a: NetNode, b: NetNode): number {
	const n = (x: NetNode) => Number(x.id.match(/-(\d+)$/)?.[1] ?? 0);
	return a.id === b.id ? 0 : n(a) - n(b) || (a.id < b.id ? -1 : 1);
}

export function isHealthy(n: NetNode): boolean {
	return !n.down && !n.unhealthy;
}

/** Containers of a service, in order (reader-1, reader-2, …). */
export function containersOf(nodes: readonly NetNode[], service: string): NetNode[] {
	return nodes.filter((n) => n.kind === 'container' && n.service === service).sort(containerOrder);
}

/** Segment-aware prefix match: '/api' matches '/api' and '/api/x', not '/apix'. */
export function matchingRoute(routes: Record<string, string>, path: string): string | null {
	const segs = (p: string) => p.split('?')[0].split('/').filter(Boolean);
	const want = segs(path);
	let best: string | null = null;
	let bestLen = -1;
	for (const prefix of Object.keys(routes)) {
		const s = segs(prefix);
		if (s.length > want.length || s.length <= bestLen) continue;
		if (s.every((x, i) => x === want[i])) {
			best = prefix;
			bestLen = s.length;
		}
	}
	return best;
}

// ---------------------------------------------------------------------------------------------
// Spec validation
// ---------------------------------------------------------------------------------------------

export function validateNetSpec(spec: NetWorldSpec): void {
	if (spec.flavour !== 'network' && spec.flavour !== 'cloud') {
		throw new SpecError(
			`net flavour must be network or cloud, got ${JSON.stringify(spec.flavour)}`
		);
	}
	if (!Array.isArray(spec.nodes) || !Array.isArray(spec.links)) {
		throw new SpecError('net world needs nodes and links arrays');
	}
	const ids = new Set<string>();
	for (const [i, n] of spec.nodes.entries()) {
		if (typeof n?.id !== 'string' || !n.id) throw new SpecError(`nodes[${i}] needs an id`);
		if (ids.has(n.id)) throw new SpecError(`duplicate node id "${n.id}"`);
		ids.add(n.id);
		if (n.ip !== undefined && !isIp(n.ip)) throw new SpecError(`node "${n.id}" has a bad ip`);
		if (n.kind === 'container' && !n.service) {
			throw new SpecError(`container "${n.id}" needs a service`);
		}
	}
	for (const [i, l] of spec.links.entries()) {
		if (!ids.has(l?.from) || !ids.has(l?.to)) {
			throw new SpecError(`links[${i}] connects a node that doesn't exist`);
		}
		if (l.from === l.to) throw new SpecError(`links[${i}] connects "${l.from}" to itself`);
		if (l.latencyMs !== undefined && !(l.latencyMs >= 0)) {
			throw new SpecError(`links[${i}].latencyMs must be a number ≥ 0`);
		}
	}
	if (!ids.has(spec.at)) throw new SpecError(`at "${spec.at}" is not a node`);
	for (const [k, v] of Object.entries(spec.dns ?? {})) {
		if (typeof v !== 'string' || !isIp(v)) throw new SpecError(`dns["${k}"] must be an ip`);
	}
	if (spec.flavour === 'cloud') {
		for (const kind of ['cloud', 'lb'] as const) {
			const count = spec.nodes.filter((n) => n.kind === kind).length;
			if (count !== 1) throw new SpecError(`a cloud world needs exactly one ${kind} node`);
		}
		for (const [name, img] of Object.entries(spec.images ?? {})) {
			if (img.capacity !== undefined && !(Number.isInteger(img.capacity) && img.capacity > 0)) {
				throw new SpecError(`images["${name}"].capacity must be a whole number > 0`);
			}
		}
		for (const [i, b] of (spec.traffic ?? []).entries()) {
			if (!Number.isInteger(b?.count) || b.count < 0 || b.count > MAX_BATCH) {
				throw new SpecError(`traffic[${i}].count must be a whole number 0..${MAX_BATCH}`);
			}
			if (typeof b.path !== 'string' || !b.path.startsWith('/')) {
				throw new SpecError(`traffic[${i}].path must start with "/"`);
			}
		}
	}
}

// ---------------------------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------------------------

function copyNode(n: NetNode): NetNodeState {
	const c: NetNodeState = { ...n };
	if (n.listens) c.listens = { ...n.listens };
	if (n.allow) c.allow = [...n.allow];
	return c;
}

export function createNetWorld(spec: NetWorldSpec): NetWorld {
	validateNetSpec(spec);
	const flavour = spec.flavour;
	const base = createBase(NET_MAX_STEPS, NET_TOO_MANY_STEPS);
	const images = spec.images ?? {};
	const state: NetState = {
		flavour,
		at: spec.at,
		nodes: spec.nodes.map(copyNode),
		links: spec.links.map((l) => ({ ...l })),
		dns: { ...(spec.dns ?? {}) },
		calls: [],
		routes: {},
		health: {},
		env: {},
		services: {},
		traffic: { total: 0, ok: 0, failed: 0, byStatus: {} }
	};
	for (const n of state.nodes) {
		if (n.kind !== 'container') continue;
		const img = n.image ? images[n.image] : undefined;
		n.capacity ??= img?.capacity ?? DEFAULT_CAPACITY;
		if (img?.unhealthy && n.unhealthy === undefined) n.unhealthy = true;
		state.services[n.service!] ??= { image: n.image ?? '' };
	}

	const push = (e: TraceEvent) => base.trace.push(e);
	const note = (text: string) => push({ t: 'log', where: 'server', text });
	const byId = (id: string) => state.nodes.find((n) => n.id === id);
	/** A configuration change on a node (allow/block/listen/addRecord/route/health), not a power switch. */
	const nodeEvent = (n: NetNode, label: string) =>
		push({ t: 'node', id: n.id, state: 'changed', label });

	/** Runs one learner command: counts the step, records the `call` event. */
	function command<A extends unknown[]>(name: string, fn: (...args: A) => unknown) {
		return (...args: A) => {
			base.step();
			const value = fn(...args);
			const call = `${name}(${args.map((a) => sourceOf(a)).join(', ')})`;
			const result = resultText(value);
			state.calls.push({ call, result });
			push({ t: 'call', call, result });
			return value;
		};
	}

	function log(...args: unknown[]) {
		base.step();
		push({ t: 'log', where: 'client', text: formatArgs(args) });
	}

	// ---- argument checks ------------------------------------------------------------------

	const fail = (friendly: string, raw: string): never => {
		throw new CommandError(friendly, raw);
	};

	function nodeArg(id: unknown, usage: string, cmd: string): NetNodeState {
		if (typeof id !== 'string' || !id) fail(usage, `${cmd}(): node id is not a string`);
		const n = byId(id as string);
		if (n) return n;
		const s = closestName(
			id as string,
			state.nodes.map((x) => x.id)
		);
		const names = state.nodes.map((x) => tick(x.id));
		return fail(
			`There's no node called ${tick(id as string)} here.` +
				(s
					? ` Did you mean ${tick(s)}?`
					: ` The nodes are ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`),
			`${cmd}(): unknown node ${id}`
		);
	}

	function portArg(port: unknown, usage: string, cmd: string): number {
		if (typeof port === 'string' && /^\d+$/.test(port.trim())) {
			fail(
				`A port is a number, so leave out the quotes: ${tick(port.trim())}, not ${tick(`'${port}'`)}.`,
				`${cmd}(): port given as text`
			);
		}
		if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
			fail(
				typeof port === 'number'
					? `Ports are whole numbers from 1 to 65535, like ${tick('443')}. ${tick(String(port))} isn't one.`
					: usage,
				`${cmd}(): bad port ${sourceOf(port)}`
			);
		}
		return port as number;
	}

	function hostArg(host: unknown, usage: string, cmd: string): string {
		if (typeof host !== 'string' || !host.trim()) fail(usage, `${cmd}(): host is not a string`);
		return (host as string).trim();
	}

	// ---- trips -------------------------------------------------------------------------------

	function packet(
		to: string,
		label: string,
		hops: string[],
		ok: boolean,
		at?: string,
		status?: number
	) {
		const e: Extract<TraceEvent, { t: 'packet' }> = {
			t: 'packet',
			from: hops[0] ?? state.at,
			to,
			label,
			ok,
			hops
		};
		if (!ok && at) e.at = at;
		if (status !== undefined) e.status = status;
		push(e);
	}

	/** The nearest dns node that can be reached right now, with the way there. */
	function nearestDns(): { id: string; path: string[] } | null {
		let best: { id: string; path: string[] } | null = null;
		for (const n of state.nodes) {
			if (n.kind !== 'dns') continue;
			const r = findRoute(state, state.at, n.id);
			if (r.ok && (!best || r.path.length < best.path.length)) best = { id: n.id, path: r.path };
		}
		return best;
	}

	/** Asks the DNS server for `name`. Logs and returns null when it can't. */
	function dnsTrip(name: string): string | null {
		const dns = nearestDns();
		if (!dns) {
			const any = state.nodes.find((n) => n.kind === 'dns');
			if (any) {
				const r = findRoute(state, state.at, any.id);
				const stop = r.ok ? undefined : (r.down ?? state.at);
				packet(any.id, `lookup ${name}`, r.path, false, stop);
			}
			note(NO_DNS_MESSAGE);
			return null;
		}
		const ip = state.dns[name];
		packet(dns.id, `lookup ${name}`, dns.path, true);
		if (ip === undefined) {
			note(`The DNS server doesn't know the name ${tick(name)}.`);
			return null;
		}
		return ip;
	}

	type Resolved =
		| { kind: 'node'; node: NetNodeState }
		| { kind: 'unknown' }
		| { kind: 'nowhere'; address: string };

	/** A host as the learner wrote it: an address, a DNS name (one trip), or a node id. */
	function resolve(host: string): Resolved {
		const byIp = (ip: string) => state.nodes.find((n) => n.ip === ip);
		const at = (ip: string): Resolved => {
			const n = byIp(ip);
			return n ? { kind: 'node', node: n } : { kind: 'nowhere', address: ip };
		};
		if (isIp(host)) return at(host);
		const direct = byId(host);
		if (direct && state.dns[host] === undefined) return { kind: 'node', node: direct };
		const ip = dnsTrip(host);
		return ip === null ? { kind: 'unknown' } : at(ip);
	}

	function noRouteNote(target: string, r: { path: string[]; down?: string }) {
		if (r.down) {
			note(
				r.down === target
					? `${tick(target)} is down, so nothing answered.`
					: `The way to ${tick(target)} stops at ${tick(r.down)}: it's down.`
			);
		} else note(`No wires lead from ${tick(state.at)} to ${tick(target)}.`);
	}

	// ---- network commands --------------------------------------------------------------------

	const networkApi = {
		lookup: command('lookup', (name?: unknown) => {
			const host = hostArg(
				name,
				`${tick('lookup()')} needs a name in quotes, like ${tick("lookup('inkwell.app')")}.`,
				'lookup'
			);
			if (isIp(host)) return host;
			return dnsTrip(host);
		}),
		ping: command('ping', (host?: unknown) => {
			const h = hostArg(
				host,
				`${tick('ping()')} needs an address or a name in quotes, like ${tick("ping('inkwell.app')")}.`,
				'ping'
			);
			const t = resolve(h);
			if (t.kind === 'unknown') return 'unknown host';
			if (t.kind === 'nowhere') {
				packet(t.address, 'ping', [state.at], false, state.at);
				note(`Nothing in this network has the address ${tick(t.address)}.`);
				return 'unreachable';
			}
			const r = findRoute(state, state.at, t.node.id);
			if (!r.ok) {
				packet(t.node.id, 'ping', r.path, false, r.down ?? state.at);
				noRouteNote(t.node.id, r);
				return 'unreachable';
			}
			const ms = pathLatency(state, r.path);
			packet(t.node.id, `ping ${ms} ms`, r.path, true);
			return ms;
		}),
		connect: command('connect', (host?: unknown, port?: unknown) => {
			const usage = `${tick('connect()')} needs an address and a port number, like ${tick("connect('inkwell.app', 443)")}.`;
			const h = hostArg(host, usage, 'connect');
			const p = portArg(port, usage, 'connect');
			const t = resolve(h);
			if (t.kind === 'unknown') return 'unknown host';
			const label = `port ${p}`;
			if (t.kind === 'nowhere') {
				packet(t.address, label, [state.at], false, state.at);
				note(`Nothing in this network has the address ${tick(t.address)}.`);
				return 'no route';
			}
			const reach = reachNode(state, state.at, t.node.id, p);
			const to = t.node.id;
			switch (reach.result) {
				case 'open':
					packet(to, label, reach.path, true);
					break;
				case 'closed':
					packet(to, label, reach.path, false, to);
					break;
				case 'filtered':
					packet(to, label, reach.path, false, reach.by);
					break;
				case 'no route':
					packet(to, label, reach.path, false, reach.by ?? state.at);
					noRouteNote(to, { path: reach.path, down: reach.by });
					break;
			}
			return reach.result;
		}),
		trace: command('trace', (host?: unknown) => {
			const h = hostArg(
				host,
				`${tick('trace()')} needs an address or a name in quotes, like ${tick("trace('inkwell.app')")}.`,
				'trace'
			);
			const t = resolve(h);
			if (t.kind === 'unknown') {
				note(`The trace couldn't start: nobody knows where ${tick(h)} is.`);
				return [];
			}
			if (t.kind === 'nowhere') {
				packet(t.address, 'trace', [state.at], false, state.at);
				note(`Nothing in this network has the address ${tick(t.address)}.`);
				return [];
			}
			const r = findRoute(state, state.at, t.node.id);
			if (!r.ok) {
				packet(t.node.id, 'trace', r.path, false, r.down ?? state.at);
				noRouteNote(t.node.id, r);
				return [];
			}
			packet(t.node.id, 'trace', r.path, true);
			return [...r.path];
		}),
		allow: command('allow', (id?: unknown, port?: unknown) => {
			const usage = `${tick('allow()')} needs a node id and a port number, like ${tick("allow('inkwell-fw', 443)")}.`;
			const n = nodeArg(id, usage, 'allow');
			const p = portArg(port, usage, 'allow');
			if (n.block) {
				n.block = n.block.filter((x) => x !== p);
				if (n.block.length === 0) delete n.block;
			}
			if (n.allow && !n.allow.includes(p)) n.allow.push(p);
			nodeEvent(n, `allows ${p}`);
		}),
		block: command('block', (id?: unknown, port?: unknown) => {
			const usage = `${tick('block()')} needs a node id and a port number, like ${tick("block('inkwell-fw', 22)")}.`;
			const n = nodeArg(id, usage, 'block');
			const p = portArg(port, usage, 'block');
			if (n.allow) n.allow = n.allow.filter((x) => x !== p);
			else if (!n.block?.includes(p)) (n.block ??= []).push(p);
			nodeEvent(n, `blocks ${p}`);
		}),
		listen: command('listen', (id?: unknown, port?: unknown, name?: unknown) => {
			const usage = `${tick('listen()')} needs a node id, a port number and a name for the service, like ${tick("listen('inkwell-web', 443, 'reader')")}.`;
			const n = nodeArg(id, usage, 'listen');
			const p = portArg(port, usage, 'listen');
			if (name !== undefined && typeof name !== 'string')
				fail(usage, 'listen(): name is not a string');
			const service = (name as string | undefined)?.trim() || `port ${p}`;
			(n.listens ??= {})[p] = service;
			nodeEvent(n, `${service} on ${p}`);
		}),
		addRecord: command('addRecord', (name?: unknown, ip?: unknown) => {
			const usage = `${tick('addRecord()')} needs a name and an address, both in quotes, like ${tick("addRecord('inkwell.app', '203.0.113.10')")}.`;
			const host = hostArg(name, usage, 'addRecord');
			if (typeof ip !== 'string') fail(usage, 'addRecord(): ip is not a string');
			const addr = (ip as string).trim();
			if (!isIp(addr)) {
				fail(
					`${tick(addr)} doesn't look like an address. An address is four numbers with dots between them, like ${tick('203.0.113.10')}.`,
					`addRecord(): bad ip ${addr}`
				);
			}
			const dns = state.nodes.find((n) => n.kind === 'dns');
			if (!dns) {
				fail(
					"There's no DNS server in this network to add a record to.",
					'addRecord(): no dns node'
				);
			}
			state.dns[host] = addr;
			nodeEvent(dns!, `${host} → ${addr}`);
		}),
		log
	};

	// ---- cloud commands ----------------------------------------------------------------------

	const cloudNode = state.nodes.find((n) => n.kind === 'cloud');
	const lbNode = state.nodes.find((n) => n.kind === 'lb');
	const imageNames = Object.keys(images);

	function nameArg(name: unknown, usage: string, cmd: string): string {
		if (typeof name !== 'string' || !name.trim()) fail(usage, `${cmd}(): name is not a string`);
		const n = (name as string).trim();
		if (!/^[A-Za-z][\w-]*$/.test(n)) {
			fail(
				`Service names are one word, like ${tick('reader')}: letters, numbers and ${tick('-')}, no spaces.`,
				`${cmd}(): bad service name ${n}`
			);
		}
		return n;
	}

	function serviceArg(name: unknown, usage: string, cmd: string): string {
		const n = nameArg(name, usage, cmd);
		if (state.services[n]) return n;
		const s = closestName(n, Object.keys(state.services));
		return fail(
			`There's no service called ${tick(n)} yet.` +
				(s
					? ` Did you mean ${tick(s)}?`
					: ` Deploy it first, like ${tick(`deploy('${n}', { image: '${imageNames[0] ?? `${n}:1.0`}' })`)}.`),
			`${cmd}(): unknown service ${n}`
		);
	}

	function imageArg(image: unknown, usage: string, cmd: string): string {
		if (typeof image !== 'string' || !image.trim()) fail(usage, `${cmd}(): image is not a string`);
		const img = (image as string).trim();
		if (images[img]) return img;
		const s = closestName(img, imageNames);
		const all = imageNames.map(tick);
		return fail(
			`There's no image called ${tick(img)}.` +
				(s
					? ` Did you mean ${tick(s)}?`
					: all.length === 0
						? ''
						: all.length === 1
							? ` The one you can use is ${all[0]}.`
							: ` The ones you can use are ${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}.`),
			`${cmd}(): unknown image ${img}`
		);
	}

	function countArg(n: unknown, min: number, usage: string, cmd: string): number {
		if (typeof n !== 'number' || !Number.isInteger(n))
			fail(usage, `${cmd}(): count ${sourceOf(n)}`);
		if ((n as number) < min || (n as number) > MAX_REPLICAS) {
			fail(
				`${tick(`${cmd}()`)} can run between ${min} and ${MAX_REPLICAS} copies of a service. ${tick(String(n))} is outside that.`,
				`${cmd}(): count ${n} out of range`
			);
		}
		return n as number;
	}

	function addContainer(service: string, image: string) {
		const existing = containersOf(state.nodes, service);
		const next = Math.max(0, ...existing.map((c) => Number(c.id.match(/-(\d+)$/)?.[1] ?? 0))) + 1;
		let id = `${service}-${next}`;
		for (let k = next + 1; byId(id); k++) id = `${service}-${k}`;
		const img = images[image];
		const c: NetNodeState = {
			id,
			kind: 'container',
			service,
			image,
			capacity: img?.capacity ?? DEFAULT_CAPACITY
		};
		if (img?.unhealthy) c.unhealthy = true;
		state.nodes.push(c);
		state.links.push({ from: cloudNode!.id, to: id });
		push({ t: 'node', id, state: 'added', kind: 'container', service, label: image });
	}

	function removeContainer(c: NetNode) {
		state.nodes = state.nodes.filter((n) => n !== c);
		state.links = state.links.filter((l) => l.from !== c.id && l.to !== c.id);
		push({
			t: 'node',
			id: c.id,
			state: 'removed',
			kind: 'container',
			service: c.service,
			label: c.image
		});
	}

	const cloudApi = {
		deploy: command('deploy', (name?: unknown, options?: unknown) => {
			const example = `deploy('reader', { image: '${imageNames[0] ?? 'reader:1.0'}', replicas: 2 })`;
			const usage = `${tick('deploy()')} needs a name and the image to run, like ${tick(example)}.`;
			const n = nameArg(name, usage, 'deploy');
			if (typeof options === 'string') {
				fail(
					`The image goes inside ${tick('{ }')}, like ${tick(`deploy('${n}', { image: '${options}' })`)}.`,
					'deploy(): options is a string'
				);
			}
			if (typeof options !== 'object' || options === null) fail(usage, 'deploy(): no options');
			const o = options as { image?: unknown; replicas?: unknown };
			const image = imageArg(o.image, usage, 'deploy');
			const replicas =
				o.replicas === undefined
					? 1
					: countArg(
							o.replicas,
							1,
							`${tick('replicas')} is how many copies to run, a whole number like ${tick('2')}.`,
							'deploy'
						);
			if (state.services[n]) {
				fail(
					`${tick(n)} is already running. Use ${tick(`scale('${n}', 3)`)} to change how many copies run, or ${tick('release()')} to switch it to a new version.`,
					`deploy(): ${n} already deployed`
				);
			}
			state.services[n] = { image };
			for (let i = 0; i < replicas; i++) addContainer(n, image);
		}),
		scale: command('scale', (name?: unknown, count?: unknown) => {
			const usage = `${tick('scale()')} needs a service name and how many copies to run, like ${tick("scale('reader', 3)")}.`;
			const n = serviceArg(name, usage, 'scale');
			const want = countArg(count, 0, usage, 'scale');
			let have = containersOf(state.nodes, n);
			while (have.length < want) {
				addContainer(n, state.services[n].image);
				have = containersOf(state.nodes, n);
			}
			while (have.length > want) {
				removeContainer(have[have.length - 1]);
				have = containersOf(state.nodes, n);
			}
		}),
		route: command('route', (path?: unknown, service?: unknown) => {
			const usage = `${tick('route()')} needs a path that starts with ${tick('/')} and a service name, like ${tick("route('/', 'reader')")}.`;
			if (typeof path !== 'string' || !path.startsWith('/')) {
				fail(usage, `route(): bad path ${sourceOf(path)}`);
			}
			const s = serviceArg(service, usage, 'route');
			state.routes[path as string] = s;
			if (lbNode) nodeEvent(lbNode, `${path} → ${s}`);
		}),
		release: command('release', (name?: unknown, image?: unknown) => {
			const usage = `${tick('release()')} needs a service name and the new image, like ${tick("release('reader', 'reader:1.1')")}.`;
			const n = serviceArg(name, usage, 'release');
			const img = imageArg(image, usage, 'release');
			const old = state.services[n].image;
			const fresh = images[img];
			for (const c of containersOf(state.nodes, n)) {
				if (state.health[n] && fresh.unhealthy) {
					push({
						t: 'node',
						id: c.id,
						state: 'unhealthy',
						kind: 'container',
						service: n,
						label: img
					});
					note(`${c.id}: new version failed its health check, keeping the old one`);
					push({
						t: 'node',
						id: c.id,
						state: c.down ? 'down' : 'up',
						kind: 'container',
						service: n,
						label: c.image
					});
					note(
						`The release of ${tick(img)} stopped there, so ${tick(n)} keeps running ${tick(old)}.`
					);
					return 'kept the old version';
				}
				push({
					t: 'node',
					id: c.id,
					state: 'removed',
					kind: 'container',
					service: n,
					label: c.image
				});
				c.image = img;
				c.capacity = fresh.capacity ?? DEFAULT_CAPACITY;
				if (fresh.unhealthy) c.unhealthy = true;
				else delete c.unhealthy;
				push({ t: 'node', id: c.id, state: 'added', kind: 'container', service: n, label: img });
			}
			state.services[n].image = img;
		}),
		health: command('health', (name?: unknown, path?: unknown) => {
			const usage = `${tick('health()')} needs a service name and the path the load balancer checks, like ${tick("health('reader', '/health')")}.`;
			const n = serviceArg(name, usage, 'health');
			if (typeof path !== 'string' || !path.startsWith('/')) {
				fail(usage, `health(): bad path ${sourceOf(path)}`);
			}
			state.health[n] = path as string;
			for (const c of containersOf(state.nodes, n)) {
				if (c.unhealthy && !c.down) {
					push({
						t: 'node',
						id: c.id,
						state: 'unhealthy',
						kind: 'container',
						service: n,
						label: c.image
					});
				}
			}
		}),
		env: command('env', (name?: unknown, key?: unknown, value?: unknown) => {
			const usage = `${tick('env()')} needs a service name, a setting name and its value, like ${tick("env('reader', 'DB_URL', 'postgres://db')")}.`;
			const n = serviceArg(name, usage, 'env');
			if (typeof key !== 'string' || !key.trim()) fail(usage, 'env(): key is not a string');
			if (!['string', 'number', 'boolean'].includes(typeof value)) {
				fail(usage, `env(): value ${sourceOf(value)}`);
			}
			(state.env[n] ??= {})[(key as string).trim()] = String(value);
		}),
		log
	};

	// ---- traffic (cloud, after the program) ---------------------------------------------------

	function runTraffic() {
		const t = state.traffic;
		const rr: Record<string, number> = {};
		(spec.traffic ?? []).forEach((batch, b) => {
			const served = new Map<string, number>();
			const busy = new Set<string>();
			const statuses: Record<number, number> = {};
			const sample = batch.count > PACKET_SAMPLE_OVER;
			const label = batch.label ?? batch.path;
			const toLb = lbNode ? findRoute(state, state.at, lbNode.id) : null;
			let lbNoted = false;
			for (let i = 0; i < batch.count; i++) {
				let status: number;
				let hops: string[];
				let to: string;
				let dropAt: string | undefined;
				if (!toLb?.ok) {
					status = 503;
					hops = toLb?.path ?? [state.at];
					to = lbNode?.id ?? state.at;
					dropAt = (toLb && !toLb.ok ? toLb.down : undefined) ?? state.at;
					if (!lbNoted) {
						note(`The load balancer couldn't be reached, so no request got through.`);
						lbNoted = true;
					}
				} else {
					const lbPath = toLb.path;
					const prefix = matchingRoute(state.routes, batch.path);
					const service = prefix === null ? null : state.routes[prefix];
					const pool =
						service === null
							? []
							: containersOf(state.nodes, service).filter(
									(c) => !c.down && !(state.health[service] && c.unhealthy)
								);
					if (service === null) {
						status = 404;
						hops = lbPath;
						to = lbNode!.id;
						dropAt = lbNode!.id;
					} else if (pool.length === 0) {
						status = 503;
						hops = lbPath;
						to = lbNode!.id;
						dropAt = lbNode!.id;
					} else {
						const k = rr[service] ?? 0;
						rr[service] = k + 1;
						const c = pool[k % pool.length];
						const used = served.get(c.id) ?? 0;
						hops = [...lbPath, c.id];
						to = c.id;
						if (used >= (c.capacity ?? DEFAULT_CAPACITY)) {
							status = 503;
							dropAt = c.id;
							if (!busy.has(c.id)) {
								busy.add(c.id);
								push({
									t: 'node',
									id: c.id,
									state: 'busy',
									kind: 'container',
									service,
									label: c.image
								});
							}
						} else if (c.unhealthy) {
							served.set(c.id, used + 1);
							status = 500;
							dropAt = c.id;
						} else {
							served.set(c.id, used + 1);
							status = 200;
						}
					}
				}
				statuses[status] = (statuses[status] ?? 0) + 1;
				if (!sample || i % SAMPLE_EVERY === 0) {
					packet(to, label, hops, status === 200, dropAt, status);
				}
			}
			const ok = statuses[200] ?? 0;
			const failed = batch.count - ok;
			t.total += batch.count;
			t.ok += ok;
			t.failed += failed;
			for (const [s, n] of Object.entries(statuses)) {
				t.byStatus[Number(s)] = (t.byStatus[Number(s)] ?? 0) + n;
			}
			note(batchSummary(b, batch.count, statuses, batch.label));
		});
	}

	// ---- finish ------------------------------------------------------------------------------

	let finished: { net: NetResult } | undefined;
	function finish(): { net: NetResult } {
		finished ??= {
			net: {
				nodes: state.nodes.map(copyNode),
				links: state.links.map((l) => ({ ...l })),
				dns: { ...state.dns },
				calls: state.calls.map((c) => ({ ...c })),
				routes: { ...state.routes },
				traffic: { ...state.traffic, byStatus: { ...state.traffic.byStatus } }
			}
		};
		return finished;
	}

	const api: Record<string, (...args: never[]) => unknown> =
		flavour === 'network' ? networkApi : cloudApi;
	const world: NetWorld = {
		kind: 'net',
		api: api as World['api'],
		variables: {},
		log,
		state,
		trace: base.trace,
		output: base.output,
		get steps() {
			return base.steps;
		},
		get halted() {
			return base.halted;
		},
		aliases: NET_ALIASES[flavour],
		finish
	};
	if (flavour === 'cloud') world.afterProgram = runTraffic;
	return world;
}

/** "Batch 1: 200 requests, 187 ok, 13 failed (503)" */
export function batchSummary(
	index: number,
	count: number,
	statuses: Record<number, number>,
	label?: string
): string {
	const ok = statuses[200] ?? 0;
	const head = `Batch ${index + 1}${label ? ` (${label})` : ''}: ${count} ${count === 1 ? 'request' : 'requests'}`;
	if (count === 0) return `${head}.`;
	if (ok === count) return `${head}, all ok.`;
	const bad = Object.entries(statuses)
		.filter(([s]) => s !== '200')
		.sort((a, b) => b[1] - a[1]);
	const why = bad.length === 1 ? bad[0][0] : bad.map(([s, n]) => `${n} × ${s}`).join(', ');
	return `${head}, ${ok} ok, ${count - ok} failed (${why})`;
}

// ---------------------------------------------------------------------------------------------
// Checks (called from evaluate.ts)
// ---------------------------------------------------------------------------------------------

type NetCheck = Extract<
	Check,
	{
		type:
			| 'net-reachable'
			| 'net-unreachable'
			| 'net-resolves'
			| 'net-node'
			| 'net-allows'
			| 'cloud-replicas'
			| 'cloud-route'
			| 'cloud-success-rate'
			| 'net-call-result';
	}
>;

export const NET_CHECK_TYPES: readonly NetCheck['type'][] = [
	'net-reachable',
	'net-unreachable',
	'net-resolves',
	'net-node',
	'net-allows',
	'cloud-replicas',
	'cloud-route',
	'cloud-success-rate',
	'net-call-result'
];

const STATUS_WHY: Record<number, string> = {
	404: 'no route on the load balancer matched the path',
	500: 'a container running a broken version answered',
	503: 'no healthy container had room for them'
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Why `from` can't reach `to` on `port`, in one sentence (or null when it can). */
export function reachProblem(view: NetView, from: string, to: string, port: number): string | null {
	const r = canReach(view, from, to, port);
	const lead = `${tick(from)} still can't reach ${tick(to)} on port ${port}`;
	switch (r.result) {
		case 'open':
			return null;
		case 'unknown host':
			return `${lead}: nothing knows the name ${tick(to)}. The DNS server needs a record for it.`;
		case 'no route':
			if (r.address) {
				return `${lead}: the name points to ${tick(r.address)}, and nothing in the network has that address.`;
			}
			if (r.by) {
				return r.by === to
					? `${lead}: ${tick(to)} itself is down.`
					: `${lead}: ${tick(r.by)} on the way is down.`;
			}
			return `${lead}: there are no wires between them.`;
		case 'filtered': {
			const node = view.nodes.find((n) => n.id === r.by);
			const who =
				r.by === to && node?.kind !== 'firewall'
					? `${tick(to)} itself doesn't let that port in`
					: `the firewall ${tick(r.by)} drops it`;
			return `${lead}: ${who}. Something needs to ${tick('allow()')} that port.`;
		}
		case 'closed':
			return `${lead}: the way there is fine, but nothing on ${tick(to)} listens on port ${port}. Something needs to ${tick('listen()')} there.`;
	}
}

/** Failure message for a net/cloud check, or null when it passes. */
export function netCheckFails(
	check: NetCheck,
	net: NetResult | undefined,
	msg: (fallback: ThemedText) => ThemedText
): ThemedText | null {
	const view: NetResult = net ?? {
		nodes: [],
		links: [],
		dns: {},
		calls: [],
		routes: {},
		traffic: { total: 0, ok: 0, failed: 0, byStatus: {} }
	};
	switch (check.type) {
		case 'net-reachable': {
			const why = reachProblem(view, check.from, check.to, check.port);
			return why === null ? null : msg(why);
		}
		case 'net-unreachable': {
			const r = canReach(view, check.from, check.to, check.port);
			if (r.result !== 'open') return null;
			const via = r.path.slice(1, -1);
			return msg(
				`${tick(check.from)} can still reach ${tick(check.to)} on port ${check.port}` +
					(via.length ? `, through ${via.map(tick).join(', ')}` : '') +
					`. That door should be shut: ${tick('block()')} the port.`
			);
		}
		case 'net-resolves': {
			const ip = view.dns[check.name];
			if (ip === check.ip) return null;
			const owner = view.nodes.find((n) => n.ip === check.ip);
			const right = owner ? `${tick(owner.id)}'s address` : 'the right address';
			if (ip === undefined) {
				return msg(
					`The DNS server has no record for ${tick(check.name)} yet. Add one with ${tick('addRecord()')} that points to ${right}.`
				);
			}
			const wrong = view.nodes.find((n) => n.ip === ip);
			return msg(
				`${tick(check.name)} points to ${tick(ip)}` +
					(wrong ? `, which is ${tick(wrong.id)}` : ', where nothing answers') +
					`. It should point to ${right}.`
			);
		}
		case 'net-node': {
			const n = view.nodes.find((x) => x.id === check.id);
			if (!n) return msg(`There's no ${tick(check.id)} in the picture.`);
			if (check.up === undefined || !n.down === check.up) return null;
			return msg(
				check.up ? `${tick(check.id)} is still down.` : `${tick(check.id)} is still running.`
			);
		}
		case 'net-allows': {
			const n = view.nodes.find((x) => x.id === check.id);
			if (!n) return msg(`There's no ${tick(check.id)} in the picture.`);
			if (portAllowed(n, check.port) === check.allowed) return null;
			return msg(
				check.allowed
					? `${tick(check.id)} still doesn't let port ${check.port} through. ${tick('allow()')} it there.`
					: `${tick(check.id)} still lets port ${check.port} through. ${tick('block()')} it there.`
			);
		}
		case 'cloud-replicas': {
			const all = containersOf(view.nodes, check.service);
			const healthy = all.filter(isHealthy).length;
			const sick = all.length - healthy;
			const extra = sick
				? ` (${sick} more ${plural(sick, 'is', 'are')} down or failing ${plural(sick, 'its', 'their')} health check)`
				: '';
			if (healthy < check.min) {
				return msg(
					all.length === 0
						? `${tick(check.service)} isn't running anywhere yet. ${tick('deploy()')} it first.`
						: `${tick(check.service)} has ${healthy} healthy ${plural(healthy, 'container', 'containers')}${extra}, but it needs at least ${check.min}. ${tick('scale()')} it up.`
				);
			}
			if (check.max !== undefined && healthy > check.max) {
				return msg(
					`${tick(check.service)} has ${healthy} healthy containers, but ${check.max} ${plural(check.max, 'is', 'are')} enough. Every extra one is a machine someone pays for.`
				);
			}
			return null;
		}
		case 'cloud-route': {
			const s = view.routes[check.path];
			if (s === check.service) return null;
			return msg(
				s === undefined
					? `The load balancer doesn't send ${tick(check.path)} anywhere yet. Use ${tick('route()')} to point it at ${tick(check.service)}.`
					: `The load balancer sends ${tick(check.path)} to ${tick(s)}, but it should go to ${tick(check.service)}.`
			);
		}
		case 'cloud-success-rate': {
			const t = view.traffic;
			if (t.total === 0) return msg('No traffic arrived, so there is nothing to measure yet.');
			const rate = t.ok / t.total;
			if (rate >= check.min) return null;
			const main = Object.entries(t.byStatus)
				.filter(([s]) => s !== '200')
				.sort((a, b) => b[1] - a[1])[0];
			const status = main ? Number(main[0]) : undefined;
			const pct = (x: number) => `${Math.floor(x * 1000) / 10}%`;
			return msg(
				`Only ${t.ok} of ${t.total} requests (${pct(rate)}) got an answer, and at least ${pct(check.min)} should.` +
					(status !== undefined
						? ` Most of the others got ${tick(String(status))}${STATUS_WHY[status] ? `: ${STATUS_WHY[status]}` : ''}.`
						: '')
			);
		}
		case 'net-call-result': {
			const calls = view.calls.filter((c) => c.call.startsWith(check.call));
			if (calls.some((c) => c.result === check.result)) return null;
			const shown = check.call.endsWith(')') ? check.call : `${check.call.replace(/\($/, '')}()`;
			if (calls.length === 0) return msg(`Your code doesn't call ${tick(shown)} yet.`);
			const last = calls[calls.length - 1];
			return msg(`${tick(last.call)} gave back ${tick(last.result)}, not ${tick(check.result)}.`);
		}
	}
}
