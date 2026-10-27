import { error } from '@sveltejs/kit';
import { getLessonContext } from '#lib/curriculum/index.ts';
import { getProgress, type LessonProgress } from '#lib/server/progress.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	const lessonId = `${params.module}/${params.lesson}`;
	const ctx = getLessonContext(lessonId);
	if (!ctx || ctx.module.id !== params.module || ctx.module.comingSoon) {
		error(404, 'We couldn’t find that level.');
	}

	let progress: LessonProgress | null = null;
	/** Lesson ids this user has finished (for "already done" + module-complete messages) */
	let doneIds: string[] = [];
	if (locals.user) {
		const all = getProgress(locals.user.id);
		progress = all[lessonId] ?? null;
		doneIds = Object.entries(all)
			.filter(([, p]) => p.status === 'done')
			.map(([id]) => id);
	}

	// The lesson content itself is looked up again on the client from the curriculum bundle,
	// so we only send ids and the learner's own progress.
	return { lessonId, moduleId: ctx.module.id, progress, doneIds };
};
