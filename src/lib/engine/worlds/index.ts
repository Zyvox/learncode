import type { WorldSpec } from '#lib/curriculum/types.ts';
import { SpecError, type World } from '../core.ts';
import { createCanvasWorld } from './canvas.ts';
import { createConsoleWorld } from './console.ts';
import { createGridWorld } from './grid.ts';

/** Creates the right world for a spec. Throws SpecError for an invalid spec. */
export function createWorld(spec: WorldSpec): World {
	switch (spec?.kind) {
		case 'grid':
			return createGridWorld(spec);
		case 'console':
			return createConsoleWorld(spec);
		case 'canvas':
			return createCanvasWorld(spec);
		default:
			throw new SpecError(
				`unknown world kind ${JSON.stringify((spec as { kind?: unknown })?.kind)}`
			);
	}
}
