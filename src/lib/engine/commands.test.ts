import { describe, expect, it } from 'vitest';
import type { WorldSpec } from '#lib/curriculum/types.ts';
import { COMMANDS, SYNTAX, commandNames } from './commands.ts';
import { runInNode } from './node.ts';
import { createWorld } from './worlds/index.ts';

const specs: WorldSpec[] = [
	{ kind: 'grid', width: 3, height: 3, hero: { x: 0, y: 0, dir: 'E' } },
	{ kind: 'console', variables: { score: 3 } },
	{ kind: 'canvas' }
];

describe('command reference', () => {
	it('documents exactly the commands each world has', () => {
		for (const spec of specs) {
			expect(commandNames(spec.kind).sort()).toEqual(Object.keys(createWorld(spec).api).sort());
			expect(COMMANDS[spec.kind].every((c) => c.summary && c.name)).toBe(true);
		}
	});

	it('syntax examples are valid JavaScript', () => {
		for (const s of SYNTAX) {
			expect(() => new Function('move', 'turnLeft', 'pickUp', 'print', s.example)).not.toThrow();
		}
		expect(new Set(SYNTAX.map((s) => s.id)).size).toBe(SYNTAX.length);
	});

	it('command examples run in their world', async () => {
		for (const spec of specs) {
			for (const c of COMMANDS[spec.kind]) {
				if (!c.example) continue;
				const r = await runInNode(c.example, spec);
				// a grid example may bump into the edge; everything else must run cleanly
				if (!r.ok) expect(r.error?.message, `${spec.kind}: ${c.example}`).toMatch(/edge/);
			}
		}
	});
});

describe('web command reference', async () => {
	const { INKWELL_TEST_SCHEMA } = await import('./worlds/web.fixtures.ts');
	const { SQL_COMMANDS, webCommandNames } = await import('./commands.ts');
	const serverCode = `
app.get('/series', (req, res) => res.json(db.all('SELECT * FROM series')))
app.post('/comments', (req, res) => res.status(201).json(req.body))
app.put('/episodes/:id', (req, res) => res.json(req.body))
app.delete('/comments/:id', (req, res) => res.status(204).end())`;
	const worlds: Record<'client' | 'server' | 'sql', WorldSpec> = {
		client: { kind: 'web', role: 'client', schema: INKWELL_TEST_SCHEMA, serverCode },
		server: { kind: 'web', role: 'server', schema: INKWELL_TEST_SCHEMA },
		sql: { kind: 'web', role: 'sql', schema: INKWELL_TEST_SCHEMA }
	};

	it('every web command has a role, a summary and a unique name', () => {
		const names = COMMANDS.web.map((c) => c.name);
		expect(new Set(names).size).toBe(names.length);
		for (const c of COMMANDS.web) {
			expect(c.roles?.length, c.name).toBeGreaterThan(0);
			expect(c.summary, c.name).toBeTruthy();
		}
	});

	it('the client globals match the client api', async () => {
		const { loadSqlInNode } = await import('./node.ts');
		const SQL = await loadSqlInNode();
		const { createWebWorld } = await import('./worlds/web.ts');
		const api = Object.keys(createWebWorld({ kind: 'web', role: 'client' }, { SQL }).api).sort();
		expect(commandNames('web').sort()).toEqual(api);
		expect(webCommandNames('sql')).toEqual(SQL_COMMANDS.map((c) => c.name.replace(/\(.*$/, '')));
		expect(webCommandNames('server')).toContain('app.get');
		expect(webCommandNames('server')).toContain('db.all');
		expect(webCommandNames('client')).toEqual(
			expect.arrayContaining(['get', 'post', 'show', 'log', 'res.status'])
		);
	});

	it('examples run in their role', async () => {
		for (const c of COMMANDS.web) {
			if (!c.example) continue;
			for (const role of c.roles ?? []) {
				// SQL examples are shown for the server too, but they are SQL, not JavaScript
				if (role === 'server' && SQL_COMMANDS.includes(c)) continue;
				const r = await runInNode(c.example, worlds[role]);
				expect(r.error?.raw, `${role}: ${c.name}`).toBeUndefined();
			}
		}
	});
});
