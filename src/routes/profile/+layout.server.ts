/**
 * Levels done per track, for the small per-track counts on the profile page. Lives in a layout
 * load so the profile's own +page.server.ts (auth-owned) stays untouched.
 */
import { getModules } from '#lib/curriculum/index.ts';
import type { TrackId } from '#lib/curriculum/types.ts';
import { getProgress } from '#lib/server/progress.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const trackDone: Partial<Record<TrackId, number>> = {};
	if (!locals.user) return { trackDone };
	const progress = getProgress(locals.user.id);
	for (const m of getModules()) {
		if (m.comingSoon) continue;
		const track = m.track ?? 'code';
		const done = m.lessons.filter((l) => progress[l.id]?.status === 'done').length;
		trackDone[track] = (trackDone[track] ?? 0) + done;
	}
	return { trackDone };
};
