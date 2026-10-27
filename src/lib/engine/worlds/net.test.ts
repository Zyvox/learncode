import { describe, expect, it } from 'vitest';
import type { Check, CodeLesson, NetWorldSpec } from '#lib/curriculum/types.ts';
import { netCommandNames, COMMANDS } from '../commands.ts';
import { evaluate } from '../evaluate.ts';
import { runInNode, runProgramInNode } from '../node.ts';
import { SPEC_ERROR_MESSAGE } from '../run.ts';
import type { RunResult, TraceEvent } from '../types.ts';
import {
	NET_MAX_STEPS,
	NO_DNS_MESSAGE,
	batchSummary,
	canReach,
	createNetWorld,
	matchingRoute,
	sourceOf
} from './net.ts';

/** laptop - home-router - isp - inkwell-fw - inkwell-web, with the dns server off the isp */
const network = (patch: (s: NetWorldSpec) => void = () => {}): NetWorldSpec => {
	const spec: NetWorldSpec = {
		kind: 'net',
		flavour: 'network',
		at: 'laptop',
		nodes: [
			{ id: 'laptop', kind: 'laptop', ip: '192.168.1.20' },
			{ id: 'home-router', kind: 'router', ip: '192.168.1.1' },
			{ id: 'isp', kind: 'router', ip: '198.51.100.1' },
			{ id: 'dns', kind: 'dns', ip: '198.51.100.53' },
			{ id: 'inkwell-fw', kind: 'firewall', ip: '203.0.113.1', allow: [443, 8080] },
			{
				id: 'inkwell-web',
				kind: 'server',
				ip: '203.0.113.10',
				listens: { 443: 'reader', 22: 'ssh' }
			}
		],
		links: [
			{ from: 'laptop', to: 'home-router', latencyMs: 5 },
			{ from: 'home-router', to: 'isp', latencyMs: 20 },
			{ from: 'isp', to: 'dns' },
			{ from: 'isp', to: 'inkwell-fw', latencyMs: 15 },
			{ from: 'inkwell-fw', to: 'inkwell-web', latencyMs: 2 }
		],
		dns: { 'inkwell.app': '203.0.113.10' }
	};
	patch(spec);
	return spec;
};

const node = (s: NetWorldSpec, id: string) => s.nodes.find((n) => n.id === id)!;

/** phone -> lb -> region (cloud) with containers inside */
const cloud = (extra: Partial<NetWorldSpec> = {}): NetWorldSpec => ({
	kind: 'net',
	flavour: 'cloud',
	at: 'readers',
	nodes: [
		{ id: 'readers', kind: 'phone' },
		{ id: 'lb', kind: 'lb' },
		{ id: 'region', kind: 'cloud' }
	],
	links: [
		{ from: 'readers', to: 'lb' },
		{ from: 'lb', to: 'region' }
	],
	images: {
		'reader:1.0': { port: 80, capacity: 5 },
		'reader:1.1': { port: 80, capacity: 5, unhealthy: true },
		'reader:1.2': { port: 80, capacity: 10 },
		'api:1.0': { port: 80, capacity: 5 }
	},
	traffic: [{ count: 10, path: '/' }],
	...extra
});

const run = (code: string, spec: NetWorldSpec) => runProgramInNode(code, spec);
const of = <T extends TraceEvent['t']>(r: RunResult, t: T) =>
	r.trace.filter((e): e is Extract<TraceEvent, { t: T }> => e.t === t);
const logs = (r: RunResult) => of(r, 'log').map((e) => e.text);
const calls = (r: RunResult) => r.net!.calls.map((c) => `${c.call} -> ${c.result}`);
const message = (r: RunResult) => {
	const m = r.error?.message;
	return typeof m === 'string' ? m : m?.default;
};

describe('net world: network flavour', () => {
	it('connects through dns, routers and the firewall: open', () => {
		const r = run("log(connect('inkwell.app', 443))", network());
		expect(r.ok).toBe(true);
		expect(calls(r)).toEqual(["connect('inkwell.app', 443) -> open"]);
		// dns trip, the trip itself, the call, then the learner's log line
		expect(r.trace).toEqual([
			{
				t: 'packet',
				from: 'laptop',
				to: 'dns',
				label: 'lookup inkwell.app',
				ok: true,
				hops: ['laptop', 'home-router', 'isp', 'dns']
			},
			{
				t: 'packet',
				from: 'laptop',
				to: 'inkwell-web',
				label: 'port 443',
				ok: true,
				hops: ['laptop', 'home-router', 'isp', 'inkwell-fw', 'inkwell-web']
			},
			{ t: 'call', call: "connect('inkwell.app', 443)", result: 'open' },
			{ t: 'log', where: 'client', text: 'open' }
		]);
		expect(r.steps).toBe(2);
	});

	it('closed: the way is fine but nothing listens', () => {
		const r = run("connect('203.0.113.10', 8080)", network());
		expect(calls(r)).toEqual(["connect('203.0.113.10', 8080) -> closed"]);
		const [p] = of(r, 'packet');
		expect(p).toMatchObject({ ok: false, at: 'inkwell-web', to: 'inkwell-web' });
		// an address needs no dns trip
		expect(of(r, 'packet')).toHaveLength(1);
	});

	it('filtered: the firewall drops ports it does not allow, and so does the target itself', () => {
		const r = run("connect('inkwell.app', 22)", network());
		expect(calls(r)).toEqual(["connect('inkwell.app', 22) -> filtered"]);
		expect(of(r, 'packet')[1]).toMatchObject({ ok: false, at: 'inkwell-fw' });

		const own = network((s) => {
			delete node(s, 'inkwell-fw').allow;
			node(s, 'inkwell-web').allow = [443];
		});
		const r2 = run("connect('inkwell.app', 22)\nconnect('inkwell.app', 443)", own);
		expect(calls(r2)).toEqual([
			"connect('inkwell.app', 22) -> filtered",
			"connect('inkwell.app', 443) -> open"
		]);
		expect(of(r2, 'packet')[1]).toMatchObject({ ok: false, at: 'inkwell-web' });
	});

	it('no route: a down node on the way, a missing wire, an address nobody has', () => {
		const down = network((s) => (node(s, 'isp').down = true));
		const r = run("log(connect('203.0.113.10', 443))", down);
		expect(calls(r)).toEqual(["connect('203.0.113.10', 443) -> no route"]);
		expect(of(r, 'packet')[0]).toMatchObject({
			ok: false,
			at: 'isp',
			hops: ['laptop', 'home-router', 'isp', 'inkwell-fw', 'inkwell-web']
		});
		expect(logs(r)).toContain("The way to `inkwell-web` stops at `isp`: it's down.");

		const cut = network((s) => (s.links = s.links.filter((l) => l.to !== 'inkwell-fw')));
		const r2 = run("connect('203.0.113.10', 443)", cut);
		expect(calls(r2)).toEqual(["connect('203.0.113.10', 443) -> no route"]);
		expect(of(r2, 'packet')[0]).toMatchObject({ hops: ['laptop'], at: 'laptop' });

		const r3 = run("connect('10.9.9.9', 443)", network());
		expect(calls(r3)).toEqual(["connect('10.9.9.9', 443) -> no route"]);
		expect(logs(r3)).toContain('Nothing in this network has the address `10.9.9.9`.');
	});

	it('routes around a down node when another way exists', () => {
		const spec = network((s) => {
			s.nodes.push({ id: 'backup', kind: 'router' });
			s.links.push({ from: 'laptop', to: 'backup', latencyMs: 50 }, { from: 'backup', to: 'isp' });
			node(s, 'home-router').down = true;
		});
		const r = run("log(trace('inkwell.app'))\nlog(ping('inkwell.app'))", spec);
		expect(logs(r)).toEqual(['["laptop", "backup", "isp", "inkwell-fw", "inkwell-web"]', '77']);
	});

	it('unknown host: the dns server has no record', () => {
		const r = run("log(connect('nope.app', 443))\nlog(lookup('nope.app'))", network());
		expect(calls(r)).toEqual([
			"connect('nope.app', 443) -> unknown host",
			"lookup('nope.app') -> null"
		]);
		expect(logs(r)).toContain("The DNS server doesn't know the name `nope.app`.");
	});

	it('lookup needs a reachable dns node', () => {
		const r = run("log(lookup('inkwell.app'))", network());
		expect(calls(r)).toEqual(["lookup('inkwell.app') -> 203.0.113.10"]);

		const r2 = run(
			"log(lookup('inkwell.app'))",
			network((s) => (node(s, 'dns').down = true))
		);
		expect(calls(r2)).toEqual(["lookup('inkwell.app') -> null"]);
		expect(logs(r2)).toEqual([NO_DNS_MESSAGE, 'null']);
		expect(of(r2, 'packet')[0]).toMatchObject({ ok: false, at: 'dns', to: 'dns' });

		// no dns trip for an address, and node ids work as names without dns
		const r3 = run(
			"lookup('1.2.3.4')\nping('inkwell-web')",
			network((s) => (node(s, 'dns').down = true))
		);
		expect(calls(r3)).toEqual(["lookup('1.2.3.4') -> 1.2.3.4", "ping('inkwell-web') -> 42"]);
		expect(logs(r3)).toEqual([]);
	});

	it('ping sums link latency (default 10) or says unreachable', () => {
		const r = run("log(ping('inkwell.app'))\nlog(ping('dns'))", network());
		expect(logs(r)).toEqual(['42', '35']);
		expect(of(r, 'packet').at(-1)).toMatchObject({ label: 'ping 35 ms', ok: true });

		const r2 = run(
			"log(ping('inkwell.app'))",
			network((s) => (node(s, 'inkwell-web').down = true))
		);
		expect(logs(r2)).toEqual(['`inkwell-web` is down, so nothing answered.', 'unreachable']);
		// firewalls don't stop a ping
		expect(
			run(
				"ping('203.0.113.10')",
				network((s) => (node(s, 'inkwell-fw').allow = []))
			).net!.calls[0].result
		).toBe('42');
	});

	it('trace lists the hops, or [] and where it stopped', () => {
		const r = run("const hops = trace('inkwell.app')\nlog(hops.length)", network());
		expect(calls(r)[0]).toBe(
			"trace('inkwell.app') -> ['laptop', 'home-router', 'isp', 'inkwell-fw', 'inkwell-web']"
		);
		expect(logs(r)).toEqual(['5']);

		const r2 = run(
			"log(trace('203.0.113.10'))",
			network((s) => (node(s, 'home-router').down = true))
		);
		expect(logs(r2)).toEqual(["The way to `inkwell-web` stops at `home-router`: it's down.", '[]']);
		expect(calls(r2)).toEqual(["trace('203.0.113.10') -> []"]);
	});

	it('allow, block, listen and addRecord change the network', () => {
		const code = [
			"allow('inkwell-fw', 22)",
			"log(connect('inkwell.app', 22))",
			"block('inkwell-fw', 443)",
			"log(connect('inkwell.app', 443))",
			"listen('inkwell-web', 8080, 'preview')",
			"log(connect('inkwell.app', 8080))",
			"addRecord('preview.inkwell.app', '203.0.113.10')",
			"log(lookup('preview.inkwell.app'))",
			"block('home-router', 8080)",
			"log(connect('inkwell.app', 8080))"
		].join('\n');
		const r = run(code, network());
		expect(r.ok).toBe(true);
		expect(
			of(r, 'log')
				.filter((e) => e.where === 'client')
				.map((e) => e.text)
		).toEqual([
			'open',
			'filtered',
			'open',
			'203.0.113.10',
			'open' // routers don't filter, only firewalls and the target
		]);
		const fw = r.net!.nodes.find((n) => n.id === 'inkwell-fw')!;
		expect(fw.allow).toEqual([8080, 22]);
		expect(r.net!.nodes.find((n) => n.id === 'inkwell-web')!.listens).toEqual({
			22: 'ssh',
			443: 'reader',
			8080: 'preview'
		});
		expect(r.net!.dns['preview.inkwell.app']).toBe('203.0.113.10');
		expect(of(r, 'node')).toEqual([
			{ t: 'node', id: 'inkwell-fw', state: 'changed', label: 'allows 22' },
			{ t: 'node', id: 'inkwell-fw', state: 'changed', label: 'blocks 443' },
			{ t: 'node', id: 'inkwell-web', state: 'changed', label: 'preview on 8080' },
			{ t: 'node', id: 'dns', state: 'changed', label: 'preview.inkwell.app → 203.0.113.10' },
			{ t: 'node', id: 'home-router', state: 'changed', label: 'blocks 8080' }
		]);
		expect(calls(r)[0]).toBe("allow('inkwell-fw', 22) -> ok");
		// the spec itself is never changed
		expect(node(network(), 'inkwell-fw').allow).toEqual([443, 8080]);
	});

	it('block on an allow-everything node shuts just that port; allow opens it again', () => {
		const spec = network((s) => delete node(s, 'inkwell-fw').allow);
		const r = run(
			[
				"block('inkwell-fw', 22)",
				"log(connect('inkwell.app', 22))",
				"log(connect('inkwell.app', 443))",
				"allow('inkwell-fw', 22)",
				"log(connect('inkwell.app', 22))"
			].join('\n'),
			spec
		);
		expect(logs(r)).toEqual(['filtered', 'open', 'open']);
	});

	it('stops runaway loops at the call cap', () => {
		const r = run("while (true) { ping('inkwell.app') }", network());
		expect(r.ok).toBe(false);
		expect(r.steps).toBe(NET_MAX_STEPS);
		expect(message(r)).toMatch(/more than 200 calls/);
		expect(r.trace.at(-1)).toEqual({ t: 'stopped', reason: 'max-steps' });
	});

	it('explains wrong arguments in plain words', () => {
		const err = (code: string) => message(run(code, network()));
		expect(err("allow('inkwell-fw')")).toBe(
			"`allow()` needs a node id and a port number, like `allow('inkwell-fw', 443)`."
		);
		expect(err("connect('inkwell.app')")).toBe(
			"`connect()` needs an address and a port number, like `connect('inkwell.app', 443)`."
		);
		expect(err("connect('inkwell.app', '443')")).toBe(
			"A port is a number, so leave out the quotes: `443`, not `'443'`."
		);
		expect(err("connect('inkwell.app', 70000)")).toMatch(/whole numbers from 1 to 65535/);
		expect(err('lookup()')).toMatch(/^`lookup\(\)` needs a name in quotes/);
		expect(err("allow('inkwell-fv', 443)")).toBe(
			"There's no node called `inkwell-fv` here. Did you mean `inkwell-fw`?"
		);
		expect(err("block('mainframe', 22)")).toMatch(/The nodes are `laptop`, .* and `inkwell-web`\./);
		expect(err("addRecord('inkwell.app', 'over there')")).toMatch(/doesn't look like an address/);
		expect(err("listen('inkwell-web', 443, 7)")).toMatch(/^`listen\(\)` needs a node id/);
		const r = run("conect('inkwell.app', 443)", network());
		expect(message(r)).toMatch(/Did you mean `connect\(\)`\?/);
		expect(r.error?.line).toBe(1);
	});

	it('only offers the commands of its flavour', () => {
		const w = createNetWorld(network());
		expect(Object.keys(w.api).sort()).toEqual([...netCommandNames('network')].sort());
		expect(message(run("deploy('reader', { image: 'x' })", network()))).toMatch(
			/I don't know anything called `deploy`/
		);
		expect(message(run("traceroute('inkwell.app')", network()))).toMatch(
			/Did you mean `trace\(\)`\?/
		);
	});

	it('rejects broken specs as a content problem', () => {
		const bad = [
			network((s) => (s.at = 'nobody')),
			network((s) => s.links.push({ from: 'laptop', to: 'ghost' })),
			network((s) => s.nodes.push({ id: 'laptop', kind: 'phone' })),
			network((s) => (s.dns = { x: 'not-an-ip' })),
			cloud({ nodes: [{ id: 'readers', kind: 'phone' }], links: [] })
		];
		for (const spec of bad) {
			const r = run('log(1)', spec);
			expect(r.ok).toBe(false);
			expect(r.error?.message).toBe(SPEC_ERROR_MESSAGE);
		}
	});
});

describe('net world: helpers', () => {
	it('canReach judges any state with the same rules', () => {
		const s = network();
		expect(canReach(s, 'laptop', 'inkwell-web', 443).result).toBe('open');
		expect(canReach(s, 'laptop', 'inkwell.app', 443).result).toBe('open');
		expect(canReach(s, 'laptop', '203.0.113.10', 8080).result).toBe('closed');
		expect(canReach(s, 'laptop', 'inkwell-web', 22)).toMatchObject({
			result: 'filtered',
			by: 'inkwell-fw'
		});
		expect(canReach(s, 'laptop', 'nope.app', 443).result).toBe('unknown host');
		expect(
			canReach(
				network((x) => (node(x, 'isp').down = true)),
				'laptop',
				'inkwell-web',
				443
			)
		).toMatchObject({ result: 'no route', by: 'isp' });
	});

	it('writes calls like source code', () => {
		expect(sourceOf("it's")).toBe("'it\\'s'");
		expect(sourceOf({ image: 'reader:1.0', replicas: 2 })).toBe(
			"{ image: 'reader:1.0', replicas: 2 }"
		);
		expect(sourceOf([1, 'a', null, undefined])).toBe("[1, 'a', null, undefined]");
		expect(sourceOf({})).toBe('{}');
	});

	it('matches lb routes by the longest path prefix, segment by segment', () => {
		const routes = { '/': 'reader', '/api': 'api', '/api/admin': 'admin' };
		expect(matchingRoute(routes, '/episodes/1')).toBe('/');
		expect(matchingRoute(routes, '/api/episodes')).toBe('/api');
		expect(matchingRoute(routes, '/apix')).toBe('/');
		expect(matchingRoute(routes, '/api/admin/x?y=1')).toBe('/api/admin');
		expect(matchingRoute({ '/api': 'api' }, '/')).toBeNull();
	});

	it('summarises batches', () => {
		expect(batchSummary(0, 200, { 200: 187, 503: 13 })).toBe(
			'Batch 1: 200 requests, 187 ok, 13 failed (503)'
		);
		expect(batchSummary(1, 10, { 200: 10 }, 'morning')).toBe(
			'Batch 2 (morning): 10 requests, all ok.'
		);
		expect(batchSummary(0, 5, { 404: 3, 503: 2 })).toBe(
			'Batch 1: 5 requests, 0 ok, 5 failed (3 × 404, 2 × 503)'
		);
	});

	it('documents every command with its flavour', () => {
		expect(netCommandNames('network')).toEqual([
			'lookup',
			'ping',
			'connect',
			'trace',
			'allow',
			'block',
			'listen',
			'addRecord',
			'log'
		]);
		expect(netCommandNames('cloud')).toEqual([
			'deploy',
			'scale',
			'route',
			'release',
			'health',
			'env',
			'log'
		]);
		expect(COMMANDS.net.every((c) => c.flavours?.length && c.example)).toBe(true);
		expect(Object.keys(createNetWorld(cloud()).api).sort()).toEqual(
			[...netCommandNames('cloud')].sort()
		);
	});
});

describe('net world: cloud flavour', () => {
	it('deploys containers into the cloud node and serves traffic', () => {
		const r = run(
			"deploy('reader', { image: 'reader:1.0', replicas: 2 })\nroute('/', 'reader')",
			cloud()
		);
		expect(r.ok).toBe(true);
		const containers = r.net!.nodes.filter((n) => n.kind === 'container');
		expect(containers.map((c) => [c.id, c.service, c.image, c.capacity])).toEqual([
			['reader-1', 'reader', 'reader:1.0', 5],
			['reader-2', 'reader', 'reader:1.0', 5]
		]);
		expect(r.net!.links).toContainEqual({ from: 'region', to: 'reader-1' });
		expect(of(r, 'node').slice(0, 2)).toEqual([
			{
				t: 'node',
				id: 'reader-1',
				state: 'added',
				kind: 'container',
				service: 'reader',
				label: 'reader:1.0'
			},
			{
				t: 'node',
				id: 'reader-2',
				state: 'added',
				kind: 'container',
				service: 'reader',
				label: 'reader:1.0'
			}
		]);
		expect(r.net!.routes).toEqual({ '/': 'reader' });
		expect(r.net!.traffic).toEqual({ total: 10, ok: 10, failed: 0, byStatus: { 200: 10 } });
		const packets = of(r, 'packet');
		expect(packets).toHaveLength(10);
		expect(packets[0]).toEqual({
			t: 'packet',
			from: 'readers',
			to: 'reader-1',
			label: '/',
			ok: true,
			hops: ['readers', 'lb', 'reader-1'],
			status: 200
		});
		// round robin
		expect(packets.map((p) => p.to)).toEqual(
			Array.from({ length: 10 }, (_, i) => `reader-${(i % 2) + 1}`)
		);
		expect(logs(r).at(-1)).toBe('Batch 1: 10 requests, all ok.');
		expect(calls(r)[0]).toBe("deploy('reader', { image: 'reader:1.0', replicas: 2 }) -> ok");
	});

	it('a container over capacity answers 503 and gets busy; scale fixes it', () => {
		const spec = cloud({ traffic: [{ count: 12, path: '/' }] });
		const r = run("deploy('reader', { image: 'reader:1.0' })\nroute('/', 'reader')", spec);
		expect(r.net!.traffic).toEqual({ total: 12, ok: 5, failed: 7, byStatus: { 200: 5, 503: 7 } });
		expect(of(r, 'node').filter((e) => e.state === 'busy')).toEqual([
			{
				t: 'node',
				id: 'reader-1',
				state: 'busy',
				kind: 'container',
				service: 'reader',
				label: 'reader:1.0'
			}
		]);
		expect(of(r, 'packet')[5]).toMatchObject({ ok: false, at: 'reader-1', status: 503 });

		const r2 = run(
			"deploy('reader', { image: 'reader:1.0' })\nscale('reader', 3)\nroute('/', 'reader')",
			spec
		);
		expect(r2.net!.traffic.ok).toBe(12);
		const served = of(r2, 'packet').map((p) => p.to);
		for (const id of ['reader-1', 'reader-2', 'reader-3']) {
			expect(served.filter((x) => x === id)).toHaveLength(4);
		}
	});

	it('scale removes the newest containers first and can go to zero', () => {
		const r = run(
			"deploy('reader', { image: 'reader:1.0', replicas: 3 })\nscale('reader', 1)\nroute('/', 'reader')",
			cloud()
		);
		expect(r.net!.nodes.filter((n) => n.kind === 'container').map((n) => n.id)).toEqual([
			'reader-1'
		]);
		expect(
			of(r, 'node')
				.filter((e) => e.state === 'removed')
				.map((e) => e.id)
		).toEqual(['reader-3', 'reader-2']);
		expect(r.net!.links.some((l) => l.to === 'reader-3')).toBe(false);

		const r2 = run(
			"deploy('reader', { image: 'reader:1.0' })\nscale('reader', 0)\nroute('/', 'reader')",
			cloud()
		);
		expect(r2.net!.traffic.byStatus).toEqual({ 503: 10 });
		expect(of(r2, 'packet')[0]).toMatchObject({ hops: ['readers', 'lb'], at: 'lb', status: 503 });
	});

	it('no route is a 404; the longest prefix picks the service', () => {
		const spec = cloud({
			traffic: [
				{ count: 2, path: '/episodes/1' },
				{ count: 2, path: '/api/comments' }
			]
		});
		const r = run(
			[
				"deploy('reader', { image: 'reader:1.0' })",
				"deploy('api', { image: 'api:1.0' })",
				"route('/api', 'api')"
			].join('\n'),
			spec
		);
		expect(r.net!.traffic.byStatus).toEqual({ 404: 2, 200: 2 });
		expect(of(r, 'packet').map((p) => [p.to, p.status])).toEqual([
			['lb', 404],
			['lb', 404],
			['api-1', 200],
			['api-1', 200]
		]);
	});

	it('samples packets for big batches and always summarises', () => {
		const spec = cloud({ traffic: [{ count: 200, path: '/', label: 'launch' }] });
		const r = run(
			"deploy('reader', { image: 'reader:1.2', replicas: 19 })\nroute('/', 'reader')",
			spec
		);
		expect(of(r, 'packet')).toHaveLength(40);
		expect(r.net!.traffic).toEqual({
			total: 200,
			ok: 190,
			failed: 10,
			byStatus: { 200: 190, 503: 10 }
		});
		expect(logs(r).at(-1)).toBe('Batch 1 (launch): 200 requests, 190 ok, 10 failed (503)');
	});

	it('down containers get no traffic; a dead load balancer means nothing gets through', () => {
		const spec = cloud({
			nodes: [
				{ id: 'readers', kind: 'phone' },
				{ id: 'lb', kind: 'lb' },
				{ id: 'region', kind: 'cloud' },
				{ id: 'reader-1', kind: 'container', service: 'reader', image: 'reader:1.0', down: true },
				{ id: 'reader-2', kind: 'container', service: 'reader', image: 'reader:1.0' },
				{ id: 'reader-3', kind: 'container', service: 'reader', image: 'reader:1.0' }
			]
		});
		const r = run("route('/', 'reader')", spec);
		expect(r.net!.traffic.ok).toBe(10);
		expect(new Set(of(r, 'packet').map((p) => p.to))).toEqual(new Set(['reader-2', 'reader-3']));

		const dead = cloud();
		dead.nodes[1].down = true;
		const r2 = run("deploy('reader', { image: 'reader:1.0' })\nroute('/', 'reader')", dead);
		expect(r2.net!.traffic.byStatus).toEqual({ 503: 10 });
		expect(logs(r2)).toContain("The load balancer couldn't be reached, so no request got through.");
	});

	it('release without a health check rolls a broken version out everywhere', () => {
		const r = run(
			[
				"deploy('reader', { image: 'reader:1.0', replicas: 2 })",
				"route('/', 'reader')",
				"release('reader', 'reader:1.1')"
			].join('\n'),
			cloud()
		);
		expect(r.net!.nodes.filter((n) => n.kind === 'container').map((n) => n.image)).toEqual([
			'reader:1.1',
			'reader:1.1'
		]);
		expect(r.net!.traffic.byStatus).toEqual({ 500: 10 });
		expect(
			of(r, 'node')
				.slice(3)
				.map((e) => `${e.id} ${e.state} ${e.label}`)
		).toEqual([
			'reader-1 removed reader:1.0',
			'reader-1 added reader:1.1',
			'reader-2 removed reader:1.0',
			'reader-2 added reader:1.1'
		]);
	});

	it('release with a health check keeps the old version when the new one fails', () => {
		const r = run(
			[
				"deploy('reader', { image: 'reader:1.0', replicas: 2 })",
				"route('/', 'reader')",
				"health('reader', '/health')",
				"release('reader', 'reader:1.1')",
				"scale('reader', 3)"
			].join('\n'),
			cloud()
		);
		expect(r.ok).toBe(true);
		expect(r.net!.nodes.filter((n) => n.kind === 'container').map((n) => n.image)).toEqual([
			'reader:1.0',
			'reader:1.0',
			'reader:1.0'
		]);
		expect(r.net!.traffic.ok).toBe(10);
		expect(logs(r)).toContain('reader-1: new version failed its health check, keeping the old one');
		expect(calls(r)[3]).toBe("release('reader', 'reader:1.1') -> kept the old version");
		expect(of(r, 'node').filter((e) => e.state === 'unhealthy')).toEqual([
			{
				t: 'node',
				id: 'reader-1',
				state: 'unhealthy',
				kind: 'container',
				service: 'reader',
				label: 'reader:1.1'
			}
		]);

		// a good release goes through with the health check on
		const r2 = run(
			"deploy('reader', { image: 'reader:1.0' })\nhealth('reader', '/health')\nrelease('reader', 'reader:1.2')\nroute('/', 'reader')",
			cloud()
		);
		expect(r2.net!.nodes.find((n) => n.id === 'reader-1')!.image).toBe('reader:1.2');
		expect(r2.net!.traffic.ok).toBe(10);
	});

	it('the health check keeps traffic away from unhealthy containers', () => {
		const spec = cloud({
			nodes: [
				{ id: 'readers', kind: 'phone' },
				{ id: 'lb', kind: 'lb' },
				{ id: 'region', kind: 'cloud' },
				{ id: 'reader-1', kind: 'container', service: 'reader', image: 'reader:1.1' },
				{ id: 'reader-2', kind: 'container', service: 'reader', image: 'reader:1.2' }
			]
		});
		const without = run("route('/', 'reader')", spec);
		expect(without.net!.traffic.byStatus).toEqual({ 500: 5, 200: 5 });
		const withCheck = run("route('/', 'reader')\nhealth('reader', '/health')", spec);
		expect(withCheck.net!.traffic.byStatus).toEqual({ 200: 10 });
		expect(of(withCheck, 'node')).toContainEqual({
			t: 'node',
			id: 'reader-1',
			state: 'unhealthy',
			kind: 'container',
			service: 'reader',
			label: 'reader:1.1'
		});
	});

	it('env keeps settings per service', () => {
		const w = createNetWorld(cloud());
		w.api.deploy('reader', { image: 'reader:1.0' });
		w.api.env('reader', 'DB_URL', 'postgres://db');
		w.api.env('reader', 'WORKERS', 4);
		expect(w.state.env).toEqual({ reader: { DB_URL: 'postgres://db', WORKERS: '4' } });
	});

	it('explains wrong cloud arguments', () => {
		const err = (code: string) => message(run(code, cloud()));
		expect(err("deploy('reader', 'reader:1.0')")).toBe(
			"The image goes inside `{ }`, like `deploy('reader', { image: 'reader:1.0' })`."
		);
		expect(err("deploy('reader', { image: 'reader:1.O' })")).toBe(
			"There's no image called `reader:1.O`. Did you mean `reader:1.0`?"
		);
		expect(err("deploy('reader', { image: 'web:9' })")).toMatch(
			/The ones you can use are `reader:1.0`, `reader:1.1`, `reader:1.2` and `api:1.0`\./
		);
		expect(err("deploy('reader', { image: 'reader:1.0', replicas: 50 })")).toMatch(
			/between 1 and 20/
		);
		expect(
			err("deploy('reader', { image: 'reader:1.0' })\ndeploy('reader', { image: 'reader:1.0' })")
		).toMatch(/is already running/);
		expect(err("scale('reader', 2)")).toBe(
			"There's no service called `reader` yet. Deploy it first, like `deploy('reader', { image: 'reader:1.0' })`."
		);
		expect(err("deploy('reader', { image: 'reader:1.0' })\nscale('raeder', 2)")).toMatch(
			/Did you mean `reader`\?/
		);
		expect(err("deploy('reader', { image: 'reader:1.0' })\nroute('reader', 'reader')")).toMatch(
			/^`route\(\)` needs a path that starts with `\/`/
		);
		expect(err("deploy('my reader', { image: 'reader:1.0' })")).toMatch(
			/Service names are one word/
		);
		expect(message(run("scael('reader', 2)", cloud()))).toMatch(/Did you mean `scale\(\)`\?/);
	});
});

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

function lesson(world: NetWorldSpec, checks: Check[]): CodeLesson {
	return {
		id: 'm/l',
		slug: 'l',
		title: 'T',
		kind: 'code',
		xp: 10,
		story: '',
		task: '',
		hints: [],
		world,
		starterCode: '',
		solution: '',
		checks
	};
}

async function failures(code: string, world: NetWorldSpec, check: Check) {
	const r = await runInNode(code, world);
	expect(r.ok, String(message(r))).toBe(true);
	return evaluate(lesson(world, [check]), r, code).failures;
}

describe('net checks', () => {
	it('net-reachable names the actual cause', async () => {
		const check: Check = { type: 'net-reachable', from: 'laptop', to: 'inkwell-web', port: 22 };
		expect(await failures("allow('inkwell-fw', 22)", network(), check)).toEqual([]);
		expect(await failures('', network(), check)).toEqual([
			"`laptop` still can't reach `inkwell-web` on port 22: the firewall `inkwell-fw` drops it. Something needs to `allow()` that port."
		]);
		const closed = { ...check, port: 8080 };
		expect(await failures('', network(), closed)).toEqual([
			"`laptop` still can't reach `inkwell-web` on port 8080: the way there is fine, but nothing on `inkwell-web` listens on port 8080. Something needs to `listen()` there."
		]);
		expect(
			await failures(
				'',
				network((s) => (node(s, 'isp').down = true)),
				{ ...check, port: 443 }
			)
		).toEqual(["`laptop` still can't reach `inkwell-web` on port 443: `isp` on the way is down."]);
		const own = network((s) => (node(s, 'inkwell-web').allow = [443]));
		expect(await failures("allow('inkwell-fw', 22)", own, check)).toEqual([
			"`laptop` still can't reach `inkwell-web` on port 22: `inkwell-web` itself doesn't let that port in. Something needs to `allow()` that port."
		]);
		expect(await failures('', network(), { ...check, to: 'nope.app' })).toEqual([
			"`laptop` still can't reach `nope.app` on port 22: nothing knows the name `nope.app`. The DNS server needs a record for it."
		]);
		expect(await failures('', network(), { ...check, message: 'Open the door.' })).toEqual([
			'Open the door.'
		]);
	});

	it('net-unreachable', async () => {
		const check: Check = { type: 'net-unreachable', from: 'laptop', to: 'inkwell-web', port: 8080 };
		expect(await failures('', network(), check)).toEqual([]);
		expect(await failures("listen('inkwell-web', 8080, 'debug')", network(), check)).toEqual([
			'`laptop` can still reach `inkwell-web` on port 8080, through `home-router`, `isp`, `inkwell-fw`. That door should be shut: `block()` the port.'
		]);
		expect(
			await failures(
				"listen('inkwell-web', 8080, 'debug')\nblock('inkwell-fw', 8080)",
				network(),
				check
			)
		).toEqual([]);
	});

	it('net-resolves', async () => {
		const check: Check = { type: 'net-resolves', name: 'shop.inkwell.app', ip: '203.0.113.10' };
		expect(
			await failures("addRecord('shop.inkwell.app', '203.0.113.10')", network(), check)
		).toEqual([]);
		expect(await failures('', network(), check)).toEqual([
			"The DNS server has no record for `shop.inkwell.app` yet. Add one with `addRecord()` that points to `inkwell-web`'s address."
		]);
		expect(
			await failures("addRecord('shop.inkwell.app', '198.51.100.53')", network(), check)
		).toEqual([
			"`shop.inkwell.app` points to `198.51.100.53`, which is `dns`. It should point to `inkwell-web`'s address."
		]);
	});

	it('net-node', async () => {
		const spec = network((s) => (node(s, 'isp').down = true));
		expect(await failures('', spec, { type: 'net-node', id: 'isp', up: false })).toEqual([]);
		expect(await failures('', spec, { type: 'net-node', id: 'isp', up: true })).toEqual([
			'`isp` is still down.'
		]);
		expect(await failures('', spec, { type: 'net-node', id: 'laptop', up: false })).toEqual([
			'`laptop` is still running.'
		]);
		expect(await failures('', spec, { type: 'net-node', id: 'ghost' })).toEqual([
			"There's no `ghost` in the picture."
		]);
	});

	it('net-allows', async () => {
		const check: Check = { type: 'net-allows', id: 'inkwell-fw', port: 22, allowed: true };
		expect(await failures("allow('inkwell-fw', 22)", network(), check)).toEqual([]);
		expect(await failures('', network(), check)).toEqual([
			"`inkwell-fw` still doesn't let port 22 through. `allow()` it there."
		]);
		const shut: Check = { type: 'net-allows', id: 'inkwell-fw', port: 443, allowed: false };
		expect(await failures("block('inkwell-fw', 443)", network(), shut)).toEqual([]);
		expect(await failures('', network(), shut)).toEqual([
			'`inkwell-fw` still lets port 443 through. `block()` it there.'
		]);
	});

	it('net-call-result', async () => {
		const check: Check = { type: 'net-call-result', call: 'lookup(', result: '203.0.113.10' };
		expect(await failures("lookup('inkwell.app')", network(), check)).toEqual([]);
		expect(await failures('', network(), check)).toEqual([
			"Your code doesn't call `lookup()` yet."
		]);
		expect(await failures("lookup('nope.app')", network(), check)).toEqual([
			"`lookup('nope.app')` gave back `null`, not `203.0.113.10`."
		]);
		const exact: Check = {
			type: 'net-call-result',
			call: "connect('inkwell.app', 443)",
			result: 'open'
		};
		expect(await failures("connect('inkwell.app', 443)", network(), exact)).toEqual([]);
		expect(await failures('', network(), exact)).toEqual([
			"Your code doesn't call `connect('inkwell.app', 443)` yet."
		]);
	});

	it('cloud-replicas counts healthy containers', async () => {
		const check: Check = { type: 'cloud-replicas', service: 'reader', min: 3, max: 4 };
		const deploy = (n: number) =>
			`deploy('reader', { image: 'reader:1.0', replicas: ${n} })\nroute('/', 'reader')`;
		expect(await failures(deploy(3), cloud(), check)).toEqual([]);
		expect(await failures(deploy(2), cloud(), check)).toEqual([
			'`reader` has 2 healthy containers, but it needs at least 3. `scale()` it up.'
		]);
		expect(await failures(deploy(6), cloud(), check)).toEqual([
			'`reader` has 6 healthy containers, but 4 are enough. Every extra one is a machine someone pays for.'
		]);
		expect(await failures('', cloud(), check)).toEqual([
			"`reader` isn't running anywhere yet. `deploy()` it first."
		]);
		expect(await failures(`${deploy(3)}\nrelease('reader', 'reader:1.1')`, cloud(), check)).toEqual(
			[
				'`reader` has 0 healthy containers (3 more are down or failing their health check), but it needs at least 3. `scale()` it up.'
			]
		);
	});

	it('cloud-route', async () => {
		const check: Check = { type: 'cloud-route', path: '/api', service: 'api' };
		const both = "deploy('reader', { image: 'reader:1.0' })\ndeploy('api', { image: 'api:1.0' })\n";
		expect(await failures(`${both}route('/api', 'api')`, cloud(), check)).toEqual([]);
		expect(await failures(both, cloud(), check)).toEqual([
			"The load balancer doesn't send `/api` anywhere yet. Use `route()` to point it at `api`."
		]);
		expect(await failures(`${both}route('/api', 'reader')`, cloud(), check)).toEqual([
			'The load balancer sends `/api` to `reader`, but it should go to `api`.'
		]);
	});

	it('cloud-success-rate shows the numbers and the main failure', async () => {
		const check: Check = { type: 'cloud-success-rate', min: 0.95 };
		const spec = cloud({ traffic: [{ count: 20, path: '/' }] });
		expect(
			await failures(
				"deploy('reader', { image: 'reader:1.0', replicas: 4 })\nroute('/', 'reader')",
				spec,
				check
			)
		).toEqual([]);
		expect(
			await failures(
				"deploy('reader', { image: 'reader:1.0', replicas: 3 })\nroute('/', 'reader')",
				spec,
				check
			)
		).toEqual([
			'Only 15 of 20 requests (75%) got an answer, and at least 95% should. Most of the others got `503`: no healthy container had room for them.'
		]);
		expect(await failures("deploy('reader', { image: 'reader:1.0' })", spec, check)).toEqual([
			'Only 0 of 20 requests (0%) got an answer, and at least 95% should. Most of the others got `404`: no route on the load balancer matched the path.'
		]);
		expect(await failures('', cloud({ traffic: [] }), check)).toEqual([
			'No traffic arrived, so there is nothing to measure yet.'
		]);
	});
});

describe('net world: end to end', () => {
	it('runs a network lesson in node', async () => {
		const code = [
			"const ip = lookup('inkwell.app')",
			'log(ip)',
			"log(ping(ip) + ' ms')",
			'log(connect(ip, 22))',
			"allow('inkwell-fw', 22)",
			'log(connect(ip, 22))'
		].join('\n');
		const r = await runInNode(code, network());
		expect(r.ok).toBe(true);
		expect(logs(r)).toEqual(['203.0.113.10', '42 ms', 'filtered', 'open']);
		const res = evaluate(
			lesson(network(), [
				{ type: 'net-reachable', from: 'laptop', to: 'inkwell.app', port: 22 },
				{ type: 'net-call-result', call: 'lookup(', result: '203.0.113.10' }
			]),
			r,
			code
		);
		expect(res).toEqual({ passed: true, failures: [] });
	});

	it('runs a cloud lesson in node, traffic included', async () => {
		const code = "deploy('reader', { image: 'reader:1.0', replicas: 2 })\nroute('/', 'reader')";
		const r = await runInNode(code, cloud());
		expect(r.ok).toBe(true);
		expect(r.net!.traffic.ok).toBe(10);
		expect(
			evaluate(lesson(cloud(), [{ type: 'cloud-success-rate', min: 1 }]), r, code).passed
		).toBe(true);
	});

	it('reports a typo with a suggestion and keeps the trace so far', async () => {
		const code = "lookup('inkwell.app')\nconect('inkwell.app', 443)";
		const r = await runInNode(code, network());
		expect(r.ok).toBe(false);
		expect(r.error?.message).toBe(
			"I don't know anything called `conect`. Did you mean `connect()`?"
		);
		expect(r.error?.line).toBe(2);
		expect(r.net!.calls).toEqual([{ call: "lookup('inkwell.app')", result: '203.0.113.10' }]);
		const res = evaluate(lesson(network(), []), r, code);
		expect(res.passed).toBe(false);
	});
});
