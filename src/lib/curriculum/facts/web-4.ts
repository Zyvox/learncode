/**
 * "What really happens" for the predict lessons of "Behind the app", modules 14 and 17
 * (networks-for-it, cloud-and-containers). The curriculum tests run each lesson's code and
 * compare `pick(result)` with `equals`.
 */
import type { PredictFacts } from './types.ts';

type Result = Parameters<PredictFacts[string]['pick']>[0];

/** What the learner's code logged (not the network's own notes). */
const clientLogs = (r: Result) =>
	r.trace.flatMap((e) => (e.t === 'log' && e.where === 'client' ? [e.text] : []));

export const FACTS: PredictFacts = {
	// inkwell-fw only lets 443 through: 22 (ssh) and 5432 (postgres) are dropped there
	'networks-for-it/04-predict-firewall': {
		pick: clientLogs,
		equals: ['open', 'filtered', 'filtered']
	},
	// reader-1 is down; reader-2 and reader-3 take five each, well inside their ten
	'cloud-and-containers/04-predict-crash': {
		pick: (r) => r.net?.traffic,
		equals: { total: 10, ok: 10, failed: 0, byStatus: { 200: 10 } }
	}
};
