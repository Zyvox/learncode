import type { RunResult } from '#lib/engine/types.ts';

export type PredictFacts = Record<string, { pick: (r: RunResult) => unknown; equals: unknown }>;
