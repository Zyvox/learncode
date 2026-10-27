/**
 * "What really happens" for the predict lessons of "Behind the app", modules 1–3
 * (what-happens-when-you-tap, requests-and-responses, endpoints).
 */
import type { PredictFacts } from './types.ts';

export const FACTS: PredictFacts = {
	// Server down: no answer at all, so status 0, and the phone shows the error card and then 0.
	'what-happens-when-you-tap/03-nobody-home': {
		pick: (r) => [
			r.web?.responses.map((res) => res.status),
			r.web?.screen.map((item) =>
				item.kind === 'error'
					? `${item.status} ${item.text}`
					: item.kind === 'json'
						? item.value
						: item.kind
			)
		],
		equals: [[0], ['0 Could not reach the server', 0]]
	},
	// Series 1 works, series 3 hits the broken handler: 500.
	'requests-and-responses/02-status-families': {
		pick: (r) => r.web?.responses.map((res) => res.status),
		equals: [200, 500]
	},
	// GET /episodes/7/comments is answered by the comments endpoint, with two comments.
	'endpoints/01-the-menu': {
		pick: (r) => {
			const res = r.web?.responses[0];
			return [res?.route, res?.status, Array.isArray(res?.body) ? res.body.length : null];
		},
		equals: ['/episodes/:id/comments', 200, 2]
	}
};
