/**
 * "What really happens" for the predict lessons of "Behind the app", module 16
 * (security-basics). The curriculum tests run each lesson's code and compare `pick(result)`
 * with `equals`.
 */
import type { PredictFacts } from './types.ts';

type Result = Parameters<PredictFacts[string]['pick']>[0];

const HASH = /^[0-9a-f]{64}$/;

/** password_hash per user name, from the database snapshot after the run */
function hashes(r: Result): Record<string, unknown> {
	const rows = r.web?.tables.users?.rows ?? [];
	return Object.fromEntries(rows.map((row) => [String(row.name), row.password_hash]));
}

export const FACTS: PredictFacts = {
	// The leaked users table holds names and 64-character scrambles, never a password
	'security-basics/01-predict-the-leak': {
		pick: (r) =>
			r.web?.sqlResult?.rows.map((row) => [
				row.name,
				HASH.test(String(row.password_hash)),
				row.password_hash === `inkwell-${row.name}`
			]),
		equals: [
			['mina', true, false],
			['ravi', true, false]
		]
	},
	// Same password, same hash: the twins' rows match each other and nobody else's
	'security-basics/03-predict-twins': {
		pick: (r) => {
			const h = hashes(r);
			return [
				r.web?.responses.map((x) => x.status),
				HASH.test(String(h.june_b)),
				h.june_b === h.noodlefan,
				h.june_b === h.mina,
				h.june_b === 'noodles4ever'
			];
		},
		equals: [[201, 201], true, true, false, false]
	},
	// The script runs on both phones: two scripted screen items, two "script ran" lines
	'security-basics/04-predict-script-comment': {
		pick: (r) => [
			r.web?.responses.map((x) => x.status),
			r.web?.screen.filter((item) => item.kind === 'html' && item.scripted).length,
			r.trace.filter((e) => e.t === 'log' && e.where === 'client' && e.text.includes('script ran'))
				.length
		],
		equals: [[200, 200], 2, 2]
	}
};
