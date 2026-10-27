import type { SqlJsStatic } from 'sql.js';
import type { WorldSpec } from '#lib/curriculum/types.ts';
import { SpecError, type World } from '../core.ts';
import { createCanvasWorld } from './canvas.ts';
import { createConsoleWorld } from './console.ts';
import { createGridWorld } from './grid.ts';
import { createWebWorld } from './web.ts';

/** What some worlds need besides the spec (the web world needs a loaded sql.js). */
export interface WorldDeps {
	SQL?: SqlJsStatic;
	/** web world: SQL to run after the program, results in `web.verification` */
	verifySql?: string[];
}

/**
 * Creates the right world for a spec. Throws SpecError for an invalid spec, and a plain Error
 * when a web spec arrives without sql.js loaded.
 */
export function createWorld(spec: WorldSpec, deps: WorldDeps = {}): World {
	switch (spec?.kind) {
		case 'grid':
			return createGridWorld(spec);
		case 'console':
			return createConsoleWorld(spec);
		case 'canvas':
			return createCanvasWorld(spec);
		case 'web':
			if (!deps.SQL) throw new SqlNotLoaded();
			return createWebWorld(spec, { SQL: deps.SQL, verifySql: deps.verifySql });
		default:
			throw new SpecError(
				`unknown world kind ${JSON.stringify((spec as { kind?: unknown })?.kind)}`
			);
	}
}

/** A web spec was run without sql.js (the runner couldn't load it). */
export class SqlNotLoaded extends Error {
	constructor() {
		super('sql.js is not loaded');
		this.name = 'SqlNotLoaded';
	}
}
