/**
 * Pure helpers for the net world picture (NetWorld.svelte): a fixed, readable layout computed
 * from the spec (no physics), icons per node kind and plain-language glosses for call results.
 *
 * Layout: clients (laptop, phone) on the left; routers, firewalls and load balancers in the
 * middle, one column per hop distance from the clients; servers, dns and databases on the right;
 * a `cloud` node is a big rounded region on the far right holding its containers in a grid.
 */
import type { NetLink, NetNode, NetNodeKind } from '#lib/curriculum/types.ts';

export const NODE_ICON: Record<NetNodeKind, string> = {
	laptop: '💻',
	phone: '📱',
	router: '🔀',
	dns: '📖',
	server: '🖥️',
	firewall: '🧱',
	lb: '⚖️',
	db: '🗄️',
	cloud: '☁️',
	// Containers get an inline SVG box in the component (📦 is Bit, the packet).
	container: ''
};

export const KIND_NAME: Record<NetNodeKind, string> = {
	laptop: 'laptop',
	phone: 'phone',
	router: 'router',
	dns: 'name server',
	server: 'server',
	firewall: 'firewall',
	lb: 'load balancer',
	db: 'database',
	cloud: 'cloud region',
	container: 'container'
};

const CLIENT: ReadonlySet<string> = new Set(['laptop', 'phone']);
const MIDDLE: ReadonlySet<string> = new Set(['router', 'firewall', 'lb']);

export interface Point {
	x: number;
	y: number;
}

export interface CloudBox {
	id: string;
	/** Top-left corner and size, in px */
	x: number;
	y: number;
	w: number;
	h: number;
	/** Grid columns used for the containers inside */
	cols: number;
}

export interface NetLayout {
	width: number;
	height: number;
	/** Centre of every node (containers included; clouds: the centre of their region) */
	pos: Record<string, Point>;
	clouds: CloudBox[];
	/** Card sizes used, so the component and the layout agree */
	nodeW: number;
	cellW: number;
	cellH: number;
	compact: boolean;
}

export interface LayoutOptions {
	compact?: boolean;
	/** The node the learner's code runs on; used as the start of the hop count when there is no laptop/phone */
	at?: string;
}

/** Hop distance from `starts` over the links (undirected), skipping containers. */
function hopDistances(nodes: NetNode[], links: NetLink[], starts: string[]): Map<string, number> {
	const ids = new Set(nodes.filter((n) => n.kind !== 'container').map((n) => n.id));
	const adj = new Map<string, string[]>();
	for (const l of links) {
		if (!ids.has(l.from) || !ids.has(l.to)) continue;
		(adj.get(l.from) ?? adj.set(l.from, []).get(l.from)!).push(l.to);
		(adj.get(l.to) ?? adj.set(l.to, []).get(l.to)!).push(l.from);
	}
	const dist = new Map<string, number>();
	const queue: string[] = [];
	for (const s of starts) {
		if (ids.has(s) && !dist.has(s)) {
			dist.set(s, 0);
			queue.push(s);
		}
	}
	while (queue.length) {
		const cur = queue.shift()!;
		for (const next of adj.get(cur) ?? []) {
			if (dist.has(next)) continue;
			dist.set(next, dist.get(cur)! + 1);
			queue.push(next);
		}
	}
	return dist;
}

export function layoutNet(
	nodes: readonly NetNode[],
	links: readonly NetLink[],
	opts: LayoutOptions = {}
): NetLayout {
	const compact = !!opts.compact;
	const pad = compact ? 10 : 16;
	const colW = compact ? 118 : 156;
	const rowH = compact ? 132 : 138;
	const nodeW = compact ? 104 : 136;
	const cellW = compact ? 100 : 118;
	const cellH = compact ? 96 : 100;
	const cloudPad = compact ? 8 : 12;
	const cloudHead = 30;

	const list = [...nodes];
	const clouds = list.filter((n) => n.kind === 'cloud');
	const containers = list.filter((n) => n.kind === 'container');
	// Containers without a cloud to live in are drawn like servers.
	const plain = list.filter(
		(n) => n.kind !== 'cloud' && (n.kind !== 'container' || !clouds.length)
	);

	const clientIds = plain.filter((n) => CLIENT.has(n.kind)).map((n) => n.id);
	const starts = clientIds.length ? clientIds : opts.at ? [opts.at] : plain[0] ? [plain[0].id] : [];
	const dist = hopDistances(list, [...links], starts);

	// Middle columns: one per distinct hop distance, gaps squeezed out.
	const middle = plain.filter((n) => MIDDLE.has(n.kind) && !starts.includes(n.id));
	const middleDists = [...new Set(middle.map((n) => dist.get(n.id) ?? 1))].sort((a, b) => a - b);
	const hasClients = plain.some((n) => CLIENT.has(n.kind) || starts.includes(n.id));
	const firstMiddle = hasClients ? 1 : 0;

	const columns: NetNode[][] = [];
	const put = (col: number, n: NetNode) => {
		while (columns.length <= col) columns.push([]);
		columns[col].push(n);
	};
	const rightCol = firstMiddle + middleDists.length;
	for (const n of plain) {
		if (CLIENT.has(n.kind) || starts.includes(n.id)) put(0, n);
		else if (MIDDLE.has(n.kind)) put(firstMiddle + middleDists.indexOf(dist.get(n.id) ?? 1), n);
		else put(rightCol, n);
	}
	// Drop empty columns (e.g. nothing on the right) so the picture stays tight.
	const used = columns.filter((c) => c && c.length);

	// Cloud regions: containers in a grid, two or three across.
	const cloudBoxes: CloudBox[] = [];
	const inCloud = new Map<string, NetNode[]>();
	for (const c of clouds) inCloud.set(c.id, []);
	if (clouds.length) {
		for (const k of containers) {
			// A container linked to a cloud lives there; otherwise in the first cloud.
			const link = links.find(
				(l) => (l.from === k.id && inCloud.has(l.to)) || (l.to === k.id && inCloud.has(l.from))
			);
			const home = link ? (inCloud.has(link.to) ? link.to : link.from) : clouds[0].id;
			inCloud.get(home)!.push(k);
		}
	}
	const cloudSizes = clouds.map((c) => {
		const n = inCloud.get(c.id)!.length;
		const cols = compact ? 2 : n > 4 ? 3 : 2;
		const rows = Math.max(1, Math.ceil(n / cols));
		return {
			id: c.id,
			cols,
			w: cols * cellW + cloudPad * 2,
			h: cloudHead + rows * cellH + cloudPad
		};
	});

	const colHeights = used.map((c) => c.length * rowH);
	const cloudStack = cloudSizes.reduce((s, c, i) => s + c.h + (i ? pad : 0), 0);
	const height = Math.max(rowH, ...colHeights, cloudStack) + pad * 2;

	const pos: Record<string, Point> = {};
	let x = pad;
	for (let ci = 0; ci < used.length; ci++) {
		const col = used[ci];
		const top = pad + (height - pad * 2 - col.length * rowH) / 2;
		col.forEach((n, ri) => {
			pos[n.id] = { x: x + colW / 2, y: top + ri * rowH + rowH / 2 };
		});
		x += colW;
	}
	if (cloudSizes.length) {
		x += compact ? 8 : 14;
		let y = pad + (height - pad * 2 - cloudStack) / 2;
		for (const c of cloudSizes) {
			cloudBoxes.push({ id: c.id, x, y, w: c.w, h: c.h, cols: c.cols });
			pos[c.id] = { x: x + c.w / 2, y: y + c.h / 2 };
			inCloud.get(c.id)!.forEach((k, i) => {
				const r = Math.floor(i / c.cols);
				const cc = i % c.cols;
				pos[k.id] = {
					x: x + cloudPad + cc * cellW + cellW / 2,
					y: y + cloudHead + r * cellH + cellH / 2
				};
			});
			y += c.h + pad;
		}
		x += Math.max(...cloudSizes.map((c) => c.w));
	}
	const width = Math.max(x + pad, compact ? 200 : 260);
	return { width, height, pos, clouds: cloudBoxes, nodeW, cellW, cellH, compact };
}

/** Finds a node by id, label or ip (calls may name any of them). */
export function findNode<T extends NetNode>(nodes: readonly T[], ref: string): T | undefined {
	return (
		nodes.find((n) => n.id === ref) ??
		nodes.find((n) => n.ip === ref) ??
		nodes.find((n) => n.label === ref)
	);
}

export type CallTone = 'good' | 'bad' | 'plain';

/** How a call's result should be coloured in the calls list. */
export function callTone(result: string): CallTone {
	const r = String(result).trim().toLowerCase();
	if (
		['closed', 'filtered', 'no route', 'unreachable', 'unknown host', 'null', 'error'].includes(r)
	)
		return 'bad';
	if (
		r === 'open' ||
		r === 'ok' ||
		r === 'true' ||
		/^\d+(\.\d+)?\s*(ms)?$/.test(r) ||
		/^\d{1,3}(\.\d{1,3}){3}$/.test(r)
	)
		return 'good';
	if (r.startsWith('[') || r.startsWith("'") || r.startsWith('"')) return 'good';
	return 'plain';
}

/** A short, human gloss for a failed trip, shown in the bubble where the packet stopped. */
export function dropReason(result: string | undefined, atLabel: string, atDown: boolean): string {
	const r = String(result ?? '')
		.trim()
		.toLowerCase();
	if (atDown) return `${atLabel} is switched off`;
	switch (r) {
		case 'filtered':
			return `${atLabel} dropped it (filtered)`;
		case 'closed':
			return `Nobody is listening on that port (closed)`;
		case 'no route':
			return `No way through from here (no route)`;
		case 'unreachable':
			return `Couldn’t get through (unreachable)`;
		case 'unknown host':
			return `Nobody knows that name (unknown host)`;
		case '':
			return `Stopped at ${atLabel}`;
		default:
			return `Stopped at ${atLabel}: ${result}`;
	}
}

export type StatusTone = 'ok' | 'client' | 'server' | 'none';

export function statusTone(status: number | undefined): StatusTone {
	if (!status) return 'none';
	if (status < 400) return 'ok';
	if (status < 500) return 'client';
	return 'server';
}

/**
 * Reads the learner-facing calls that change the picture, e.g. `allow('inkwell-fw', 443)`.
 * Returns null for calls that only ask something (lookup, ping, connect, trace…).
 */
export type ConfigCall =
	| { fn: 'allow' | 'block'; node: string; port: number }
	| { fn: 'listen'; node: string; port: number; name: string }
	| { fn: 'addRecord'; name: string; ip: string }
	| { fn: 'route'; path: string; service: string }
	| { fn: 'health'; service: string; path: string };

export function parseConfigCall(call: string): ConfigCall | null {
	const m = /^\s*(\w+)\s*\((.*)\)\s*$/s.exec(String(call ?? ''));
	if (!m) return null;
	const fn = m[1];
	const args = [...m[2].matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`|(-?\d+(?:\.\d+)?)/g)].map(
		(a) => a[1] ?? a[2] ?? a[3] ?? a[4]
	);
	const num = (s: string | undefined) => (s !== undefined && /^-?\d+/.test(s) ? Number(s) : NaN);
	switch (fn) {
		case 'allow':
		case 'block': {
			const port = num(args[1]);
			return args[0] !== undefined && Number.isFinite(port) ? { fn, node: args[0], port } : null;
		}
		case 'listen': {
			const port = num(args[1]);
			return args[0] !== undefined && Number.isFinite(port)
				? { fn, node: args[0], port, name: args[2] ?? 'service' }
				: null;
		}
		case 'addRecord':
			return args.length >= 2 ? { fn, name: args[0], ip: args[1] } : null;
		case 'route':
			return args.length >= 2 ? { fn, path: args[0], service: args[1] } : null;
		case 'health':
			return args.length >= 2 ? { fn, service: args[0], path: args[1] } : null;
		default:
			return null;
	}
}
