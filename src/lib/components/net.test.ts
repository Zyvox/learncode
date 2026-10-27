import { describe, expect, it } from 'vitest';
import type { NetLink, NetNode } from '#lib/curriculum/types.ts';
import { callTone, dropReason, layoutNet, parseConfigCall } from './net.ts';

const nodes: NetNode[] = [
	{ id: 'laptop', kind: 'laptop', ip: '192.168.1.20' },
	{ id: 'home-router', kind: 'router' },
	{ id: 'isp', kind: 'router' },
	{ id: 'dns', kind: 'dns', ip: '9.9.9.9' },
	{ id: 'inkwell-fw', kind: 'firewall', allow: [443] },
	{ id: 'inkwell-web', kind: 'server', ip: '203.0.113.10', listens: { 443: 'reader' } }
];
const links: NetLink[] = [
	{ from: 'laptop', to: 'home-router' },
	{ from: 'home-router', to: 'isp' },
	{ from: 'isp', to: 'dns' },
	{ from: 'isp', to: 'inkwell-fw' },
	{ from: 'inkwell-fw', to: 'inkwell-web' }
];

describe('layoutNet', () => {
	it('puts clients left, the middle by hop count, servers right', () => {
		const l = layoutNet(nodes, links, { at: 'laptop' });
		const x = (id: string) => l.pos[id].x;
		expect(x('laptop')).toBeLessThan(x('home-router'));
		expect(x('home-router')).toBeLessThan(x('isp'));
		expect(x('isp')).toBeLessThan(x('inkwell-fw'));
		expect(x('inkwell-fw')).toBeLessThan(x('inkwell-web'));
		expect(x('dns')).toBe(x('inkwell-web'));
		expect(l.width).toBeGreaterThan(x('inkwell-web'));
	});

	it('places containers inside their cloud region', () => {
		const cloudNodes: NetNode[] = [
			{ id: 'client', kind: 'laptop' },
			{ id: 'lb', kind: 'lb' },
			{ id: 'region', kind: 'cloud', label: 'eu-west' },
			{ id: 'reader-1', kind: 'container', service: 'reader' },
			{ id: 'reader-2', kind: 'container', service: 'reader' },
			{ id: 'reader-3', kind: 'container', service: 'reader' }
		];
		const l = layoutNet(
			cloudNodes,
			[
				{ from: 'client', to: 'lb' },
				{ from: 'lb', to: 'region' },
				{ from: 'region', to: 'reader-1' }
			],
			{ compact: true }
		);
		expect(l.clouds).toHaveLength(1);
		const box = l.clouds[0];
		for (const id of ['reader-1', 'reader-2', 'reader-3']) {
			const p = l.pos[id];
			expect(p.x).toBeGreaterThan(box.x);
			expect(p.x).toBeLessThan(box.x + box.w);
			expect(p.y).toBeGreaterThan(box.y);
			expect(p.y).toBeLessThan(box.y + box.h);
		}
		expect(l.pos.lb.x).toBeLessThan(box.x);
	});

	it('copes with an empty picture', () => {
		const l = layoutNet([], []);
		expect(l.width).toBeGreaterThan(0);
		expect(l.height).toBeGreaterThan(0);
	});
});

describe('call helpers', () => {
	it('colours answers', () => {
		expect(callTone('open')).toBe('good');
		expect(callTone('203.0.113.10')).toBe('good');
		expect(callTone('24')).toBe('good');
		expect(callTone('filtered')).toBe('bad');
		expect(callTone('no route')).toBe('bad');
		expect(callTone('null')).toBe('bad');
	});

	it('explains a dropped packet in plain words', () => {
		expect(dropReason('filtered', 'inkwell-fw', false)).toMatch(/inkwell-fw dropped it/);
		expect(dropReason('no route', 'isp', true)).toMatch(/switched off/);
		expect(dropReason(undefined, 'isp', false)).toMatch(/Stopped at isp/);
	});

	it('reads the calls that change the picture', () => {
		expect(parseConfigCall("allow('inkwell-fw', 443)")).toEqual({
			fn: 'allow',
			node: 'inkwell-fw',
			port: 443
		});
		expect(parseConfigCall("listen('web', 8080, 'reader')")).toEqual({
			fn: 'listen',
			node: 'web',
			port: 8080,
			name: 'reader'
		});
		expect(parseConfigCall("addRecord('inkwell.app', '203.0.113.10')")).toEqual({
			fn: 'addRecord',
			name: 'inkwell.app',
			ip: '203.0.113.10'
		});
		expect(parseConfigCall("route('/', 'reader')")).toEqual({
			fn: 'route',
			path: '/',
			service: 'reader'
		});
		expect(parseConfigCall("connect('inkwell.app', 443)")).toBeNull();
	});
});
