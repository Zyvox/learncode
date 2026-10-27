/**
 * "What really happens" for the predict lessons of "Behind the app", modules 4–8. The curriculum
 * tests run each lesson's code and compare `pick(result)` with `equals`.
 */
import type { PredictFacts } from './types.ts';

export const FACTS: PredictFacts = {
	// GET /series is on the list, GET /episodes isn't
	'your-first-server/03-predict-404': {
		pick: (r) => r.web?.responses.map((x) => x.status),
		equals: [200, 404]
	},
	// likes < 100: Rain on Pine Street, A seed in the gears, The clockwork fox, Sketches
	'where-the-data-lives/04-predict-where': {
		pick: (r) => r.web?.sqlResult?.rows.length,
		equals: 4
	},
	// UPDATE without WHERE hits every row
	'changing-data/03-predict-no-where': {
		pick: (r) => r.web?.sqlResult?.rows.map((row) => row.likes),
		equals: [0, 0, 0, 0, 0, 0, 0, 0]
	},
	// ravi gets 6, comment 5 is deleted, june_b gets 7 (max id + 1, gaps aren't reused)
	'changing-data/05-predict-ids': {
		pick: (r) => r.web?.sqlResult?.rows.map((row) => row.id),
		equals: [6, 7]
	},
	// one row per comment (6 from the 'published' stage on); episodes without comments drop out
	'connecting-tables/03-predict-join-rows': {
		pick: (r) => r.web?.sqlResult?.rows.length,
		equals: 6
	}
};
