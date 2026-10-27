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
