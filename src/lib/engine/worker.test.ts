/**
 * A real Web Worker can't run in Node. These tests prove the worker entry only uses the
 * engine core (no DOM), that it speaks the expected protocol when driven by hand, and that
 * runInWorker refuses to run during SSR.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldSpec } from '#lib/curriculum/types.ts';
import { runInNode } from './node.ts';
import { runInWorker } from './worker.ts';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');

describe('sandbox worker', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it('imports only the engine core and touches no DOM', () => {
		const src = read('./sandbox.worker.ts');
		const imports = [...src.matchAll(/^import\s.*?from\s+'([^']+)'/gm)].map((m) => m[1]);
		expect(imports.sort()).toEqual(['#lib/curriculum/types.ts', './run.ts', './types.ts']);
		expect(src).not.toMatch(/\b(document|window|localStorage)\b/);
	});

	it('the runner uses Vite’s module worker pattern', () => {
		const src = read('./worker.ts');
		expect(src).toMatch(
			/new Worker\(new URL\('\.\/sandbox\.worker\.ts', import\.meta\.url\), \{\s*type: 'module'\s*\}\)/
		);
	});

	it('handles a message and posts started + the same result as the Node runner', async () => {
		const posted: unknown[] = [];
		let listener: ((e: { data: unknown }) => void) | undefined;
		vi.stubGlobal('self', {
			postMessage: (m: unknown) => posted.push(m),
			addEventListener: (_: string, l: (e: { data: unknown }) => void) => (listener = l)
		});
		await import('./sandbox.worker.ts');
		expect(listener).toBeTypeOf('function');
		const world: WorldSpec = { kind: 'console', variables: { n: 2 } };
		const code = 'print(n * 21)\nprint(oops)';
		listener!({ data: { code, world } });
		expect(posted[0]).toEqual({ type: 'started' });
		expect(posted[1]).toEqual({ type: 'result', result: await runInNode(code, world) });
		// results must survive structured cloning (postMessage)
		expect(structuredClone(posted[1])).toEqual(posted[1]);
	});

	it('runInWorker throws a clear error during SSR', () => {
		expect(() => runInWorker('move()', { kind: 'console' })).toThrow(/only run in the browser/);
	});
});
