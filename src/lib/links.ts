/**
 * Internal links that respect the base path (the static build can live under a sub-path such as
 * `/learncode/` on GitHub Pages). Components only: this reads `$app/paths`.
 */
import { resolve } from '$app/paths';

/** The play page of a lesson id like `first-steps/01-first-step`. */
export function lessonLink(lessonId: string): string {
	const [module, lesson] = lessonId.split('/');
	return resolve('/learn/[module]/[lesson]', { module, lesson });
}
