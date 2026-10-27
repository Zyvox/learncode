/**
 * "What really happens" for each predict lesson of the Learn-to-code track. The curriculum
 * tests run the lesson's code and compare `pick(result)` with `equals`, so the marked answer
 * can't drift from reality. Every predict lesson needs an entry in some facts/*.ts file.
 */
import type { PredictFacts } from './types.ts';

export const FACTS: PredictFacts = {
	'first-steps/06-predict': { pick: (r) => [r.grid?.hero.x, r.grid?.hero.y], equals: [1, 2] },
	'doing-it-again/04-predict-inside': {
		pick: (r) => r.trace.filter((e) => e.t === 'turn').length,
		equals: 1
	},
	'making-choices/06-predict': {
		pick: (r) => r.trace.filter((e) => e.t === 'say' && e.text === 'Nope').length,
		equals: 1
	},
	'your-own-commands/04-predict': {
		pick: (r) => r.trace.filter((e) => e.t === 'turn').length,
		equals: 4
	},
	'remembering-things/07-predict': { pick: (r) => r.output, equals: ['Lives: 4'] },
	'drawing-with-code/05-predict': {
		pick: (r) => (r.draws ?? []).flatMap((d) => (d.op === 'circle' ? [d.x] : [])),
		equals: [50, 50, 50]
	}
};
