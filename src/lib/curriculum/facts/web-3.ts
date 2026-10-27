/**
 * "What really happens" for the predict lessons of "Behind the app", modules 9–13
 * (server-meets-database, the-reader-app, who-are-you, shipping-it, launch-inkwell).
 * The curriculum tests run each lesson's code and compare `pick(result)` with `equals`.
 */
import type { PredictFacts } from './types.ts';

const statuses = (r: Parameters<PredictFacts[string]['pick']>[0]) =>
	r.web?.responses.map((x) => x.status);

export const FACTS: PredictFacts = {
	'server-meets-database/04-predict-missing-row': { pick: statuses, equals: [200, 500] },
	'server-meets-database/06-predict-the-comment': {
		pick: (r) => [statuses(r), r.web?.responses[2]?.body, r.web?.tables.comments?.rows.length],
		equals: [[201, 201, 200], [], 0]
	},
	'the-reader-app/04-predict-order': {
		pick: (r) => r.web?.screen,
		equals: [{ kind: 'json', value: 2 }]
	},
	'who-are-you/01-predict-the-hash': {
		pick: (r) => {
			const rows = r.web?.responses[0]?.body as { name: string; password_hash: string }[];
			const mina = rows.find((u) => u.name === 'mina');
			return [mina?.password_hash.startsWith('$argon2id$'), mina?.password_hash === 'inkwell-mina'];
		},
		equals: [true, false]
	},
	'who-are-you/04-predict-401-or-403': { pick: statuses, equals: [401, 403] },
	'shipping-it/01-predict-laptop-lid': { pick: statuses, equals: [0] },
	'shipping-it/02-predict-the-path': {
		pick: (r) => r.trace.flatMap((e) => (e.t === 'log' ? [e.text] : [])),
		equals: ['path: /series/3']
	},
	'shipping-it/05-predict-bad-gateway': {
		pick: (r) => [statuses(r), r.web?.screen.at(-1)],
		equals: [[502], { kind: 'text', text: '502 Bad gateway' }]
	}
};
