import { it } from 'vitest';
import { render } from 'svelte/server';
import NetWorld from './NetWorld.svelte';
import GitWorld from './GitWorld.svelte';
import { runInNode } from '#lib/engine/node.ts';
import type { NetWorldSpec, GitWorldSpec } from '#lib/curriculum/types.ts';

const net: NetWorldSpec = {
	kind: 'net', flavour: 'network', at: 'laptop',
	nodes: [
		{ id: 'laptop', kind: 'laptop', ip: '192.168.1.20' },
		{ id: 'home-router', kind: 'router' },
		{ id: 'dns', kind: 'dns', ip: '9.9.9.9' },
		{ id: 'fw', kind: 'firewall', allow: [443] },
		{ id: 'web', kind: 'server', ip: '203.0.113.10', listens: { 443: 'reader' } }
	],
	links: [{ from: 'laptop', to: 'home-router', latencyMs: 4 }, { from: 'home-router', to: 'dns' }, { from: 'home-router', to: 'fw' }, { from: 'fw', to: 'web' }],
	dns: { 'inkwell.app': '203.0.113.10' }
};
const git: GitWorldSpec = { kind: 'git', files: { 'notes.txt': 'hi' } };

it('renders', async () => {
	const a = render(NetWorld, { props: { spec: net } });
	console.log(a.body.replace(/<!--[^>]*-->/g, '').slice(0, 2500));
	const b = render(GitWorld, { props: { spec: git } });
	console.log(b.body.replace(/<!--[^>]*-->/g, '').slice(0, 1500));
	const r = await runInNode("const ip = lookup('inkwell.app')\nconnect(ip, 443)\nconnect(ip, 22)\nping('web')", net);
	console.log(JSON.stringify(r.trace), r.error);
	const g = await runInNode('git init\necho "x" > a.txt\ngit add .\ngit commit -m "first"\ngit switch -c b\necho "y" >> a.txt\ngit commit -am "two"\ngit switch main\ngit merge b', git);
	console.log(JSON.stringify(g.trace), JSON.stringify(g.git?.commits.map(c=>[c.id,c.parents])), JSON.stringify(g.git?.branches), g.error);
	const cloud: NetWorldSpec = { kind: 'net', flavour: 'cloud', at: 'client', nodes: [{id:'client',kind:'phone'},{id:'lb',kind:'lb'},{id:'eu',kind:'cloud'}], links:[{from:'client',to:'lb'},{from:'lb',to:'eu'}], images: {'reader:1.0': {port: 443, capacity: 30}}, traffic: [{count: 100, path: '/'}] };
	const c = await runInNode("deploy('reader', { image: 'reader:1.0', replicas: 2 })\nroute('/', 'reader')", cloud);
	console.log(c.trace.length, JSON.stringify(c.trace.slice(0, 8)), JSON.stringify(c.net?.traffic), c.error);
});
