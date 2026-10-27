/**
 * "What really happens" for the predict lessons of "Behind the app", module 15
 * (git-and-versions). The curriculum tests run each lesson's code and compare `pick(result)`
 * with `equals`.
 */
import type { PredictFacts } from './types.ts';

type Result = Parameters<PredictFacts[string]['pick']>[0];

/** Output lines of the n-th command the lesson ran. */
const outputLines = (r: Result, n: number) => r.git?.terminal[n]?.output.split('\n') ?? [];

export const FACTS: PredictFacts = {
	'git-and-versions/03-reading-the-history': {
		// git log: three commits, newest first; the uncommitted scene 5 is nowhere in it
		pick: (r) => {
			const lines = outputLines(r, 1);
			return [
				lines.length,
				lines.map((l) => l.replace(/^[0-9a-f]{7} /, '')),
				r.git?.files['episode-9.txt']?.includes('Scene 5'),
				r.git?.modified
			];
		},
		equals: [
			3,
			['(HEAD -> main) Note about comments', 'Add scene 4', 'First save of the studio folder'],
			true,
			['episode-9.txt']
		]
	},
	'git-and-versions/06-same-line-twice': {
		// the merge stops on a content conflict in the script; Theo's note merges on its own
		pick: (r) => {
			const merge = r.git?.terminal[0];
			const script = r.git?.files['episode-9.txt'] ?? '';
			return [
				merge?.ok,
				merge?.output.split('\n').filter((l) => l.startsWith('CONFLICT')),
				script.includes('<<<<<<< HEAD') && script.includes('>>>>>>> theo-ending'),
				r.git?.files['notes.txt']?.includes('the ending needs a twist'),
				r.git?.commits.length
			];
		},
		equals: [false, ['CONFLICT (content): Merge conflict in episode-9.txt'], true, true, 3]
	}
};
