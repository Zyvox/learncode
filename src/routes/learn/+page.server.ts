import { getProgress } from '#lib/server/progress.ts';
import type { StatusMap } from '#lib/stores/map.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const status: StatusMap = {};
	if (locals.user) {
		for (const [lessonId, p] of Object.entries(getProgress(locals.user.id))) {
			status[lessonId] = p.status;
		}
	}
	return { status };
};
