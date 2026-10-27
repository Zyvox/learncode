/**
 * Test-only fake curriculum, for `vi.mock('#lib/curriculum/index.ts', () => import('./test-curriculum.ts'))`.
 * Two small modules with the ids the badge logic cares about.
 */
import type { Lesson, LessonKind, Module } from '#lib/curriculum/types.ts';

function lesson(moduleId: string, slug: string, kind: LessonKind, xp: number): Lesson {
	return {
		id: `${moduleId}/${slug}`,
		slug,
		kind: kind as 'code',
		xp,
		title: slug,
		story: '',
		task: '',
		hints: [],
		world: { kind: 'console' },
		starterCode: '',
		solution: '',
		checks: []
	};
}

const modules: Module[] = [
	{
		id: 'first-steps',
		title: 'First steps',
		blurb: '',
		emoji: '👣',
		order: 1,
		lessons: [lesson('first-steps', 'a', 'code', 10), lesson('first-steps', 'b', 'fix', 20)]
	},
	{
		id: 'doing-it-again',
		title: 'Doing it again',
		blurb: '',
		emoji: '🔁',
		order: 2,
		lessons: [
			lesson('doing-it-again', 'a', 'fix', 15),
			lesson('doing-it-again', 'b', 'fix', 10),
			lesson('doing-it-again', 'c', 'code', 10)
		]
	}
];

export function getModules(): Module[] {
	return modules;
}

export function getModule(id: string): Module | undefined {
	return modules.find((m) => m.id === id);
}

export function getLessonContext(id: string) {
	for (const module of modules) {
		const index = module.lessons.findIndex((l) => l.id === id);
		if (index >= 0) {
			return {
				module,
				lesson: module.lessons[index],
				index,
				prev: module.lessons[index - 1] ?? null,
				next: module.lessons[index + 1] ?? null
			};
		}
	}
	return undefined;
}

export function getLesson(id: string): Lesson | undefined {
	return getLessonContext(id)?.lesson;
}
