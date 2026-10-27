/**
 * Decides whether a run passed a lesson's checks, with learner-friendly failure messages
 * (ThemedText — render with renderText()). A lesson's own `message` always wins.
 */
import type { Check, CodeLesson, ThemedText, WorldKind } from '#lib/curriculum/types.ts';
import { commandNames } from './commands.ts';
import { declaredNames } from './errors.ts';
import { codeOnly, stripComments } from './source.ts';
import type { DrawOp, EvaluateResult, RunResult } from './types.ts';

export { stripComments };

const tick = (s: string) => '`' + s + '`';
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const NOTHING_PRINTED: ThemedText =
	'Nothing was printed. Use `print(...)` to show something in the output.';

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lines of code that aren't empty or only comments. */
export function countCodeLines(code: string): number {
	return stripComments(code)
		.split(/\r\n|\r|\n/)
		.filter((l) => l.trim() !== '').length;
}

/**
 * How many times `command(` is written in the code, ignoring comments, strings and
 * `function command(` definitions. `command` may be given as 'move' or 'move()'.
 */
export function countCalls(code: string, command: string): number {
	const name = command.replace(/\(.*\)$/, '').trim();
	const re = new RegExp(`(^|[^\\w$.])(${escapeRegExp(name)})\\s*\\(`, 'g');
	const src = codeOnly(code);
	let n = 0;
	for (const m of src.matchAll(re)) {
		const before = src.slice(0, m.index! + m[1].length);
		if (/\bfunction\s*$/.test(before)) continue;
		n++;
	}
	return n;
}

/**
 * Commands written without round brackets, e.g. `move` or `if (pathAhead) {` — legal
 * JavaScript that silently does nothing (or is always true), a classic beginner trap.
 */
export function bareCommands(code: string, kind: WorldKind): string[] {
	const src = codeOnly(code);
	const found: string[] = [];
	const declared = declaredNames(code);
	for (const name of commandNames(kind)) {
		if (declared.variables.includes(name) || declared.functions.includes(name)) continue;
		const re = new RegExp(`(^|[^\\w$.])${escapeRegExp(name)}(?![\\w$])(?!\\s*\\()`, 'g');
		for (const m of src.matchAll(re)) {
			const before = src.slice(0, m.index! + m[1].length);
			const after = src.slice(m.index! + m[0].length);
			// skip declarations / assignments: `function move`, `let move`, `move = …`
			if (/\b(function|let|const|var)\s*$/.test(before) || /^\s*=(?!=)/.test(after)) continue;
			found.push(name);
			break;
		}
	}
	return found;
}

function countShapes(draws: DrawOp[], shape: 'circle' | 'rect' | 'line' | 'text' | 'any') {
	return draws.filter((d) =>
		shape === 'any' ? d.op !== 'background' && d.op !== 'color' : d.op === shape
	).length;
}

const SHAPE_WORDS: Record<string, [string, string]> = {
	circle: ['circle', 'circles'],
	rect: ['rectangle', 'rectangles'],
	line: ['line', 'lines'],
	text: ['piece of text', 'pieces of text'],
	any: ['shape', 'shapes']
};

function compareLines(expected: string[], got: string[]): string | null {
	const norm = (s: string) => s.replace(/\s+$/, '');
	const e = expected.map(norm);
	const g = got.map(norm);
	while (g.length > e.length && g[g.length - 1] === '') g.pop();
	const n = Math.max(e.length, g.length);
	for (let i = 0; i < n; i++) {
		if (e[i] === g[i]) continue;
		if (g[i] === undefined) {
			return `Your program printed ${g.length} ${plural(g.length, 'line', 'lines')}, but ${e.length} ${plural(e.length, 'is', 'are')} expected. The next one should be ${tick(e[i])}.`;
		}
		if (e[i] === undefined) {
			return `Your program printed ${g.length} lines, but only ${e.length} ${plural(e.length, 'is', 'are')} expected. The extra one is ${tick(g[i])}.`;
		}
		let hint = '';
		if (e[i].toLowerCase() === g[i].toLowerCase()) hint = ' Check the capital letters.';
		else if (e[i].replace(/\s+/g, '') === g[i].replace(/\s+/g, '')) hint = ' Check the spaces.';
		else if (e[i].replace(/[^\w\s]/g, '') === g[i].replace(/[^\w\s]/g, ''))
			hint = ' Check the punctuation.';
		return `Line ${i + 1} should be ${tick(e[i])}, but it was ${tick(g[i])}.${hint}`;
	}
	return null;
}

/** Returns a failure message, or null when the check passes. */
export function checkFails(check: Check, result: RunResult, code: string): ThemedText | null {
	const grid = result.grid;
	const draws = result.draws ?? [];
	const output = result.output;
	const msg = (fallback: ThemedText): ThemedText => check.message ?? fallback;

	switch (check.type) {
		case 'reach-goal': {
			if (!grid?.goal) return msg('This level has no {goal} to reach.');
			const ok = grid.hero.x === grid.goal[0] && grid.hero.y === grid.goal[1];
			return ok ? null : msg("{Hero} didn't reach the {goal}.");
		}
		case 'collect-all': {
			const n = grid?.items.length ?? 0;
			if (n === 0) return null;
			return msg(
				n === 1
					? "There's still 1 {itemEmoji} {item} left to pick up."
					: `There are still ${n} {itemEmoji} {items} left to pick up.`
			);
		}
		case 'hero-at': {
			const ok = !!grid && grid.hero.x === check.x && grid.hero.y === check.y;
			return ok
				? null
				: msg('{Hero} should finish on the marked square, but stopped somewhere else.');
		}
		case 'output-equals': {
			if (output.length === 0 && check.lines.length > 0) return msg(NOTHING_PRINTED);
			const diff = compareLines(check.lines, output);
			return diff === null ? null : msg(diff);
		}
		case 'output-includes': {
			if (output.join('\n').includes(check.text)) return null;
			if (output.length === 0) return msg(NOTHING_PRINTED);
			return msg(`Your output should include ${tick(check.text)}, but it doesn't yet.`);
		}
		case 'output-line-count': {
			const n = output.length;
			if (check.min !== undefined && n < check.min) {
				return msg(
					n === 0
						? NOTHING_PRINTED
						: `Your program should print at least ${check.min} ${plural(check.min, 'line', 'lines')}. It printed ${n}.`
				);
			}
			if (check.max !== undefined && n > check.max) {
				return msg(
					`Your program should print at most ${check.max} ${plural(check.max, 'line', 'lines')}. It printed ${n}.`
				);
			}
			return null;
		}
		case 'output-matches': {
			if (new RegExp(check.pattern, check.flags).test(output.join('\n'))) return null;
			if (output.length === 0) return msg(NOTHING_PRINTED);
			return msg(
				"The output isn't quite what the task asks for yet. Read the task again and compare."
			);
		}
		case 'said': {
			const said = result.trace.flatMap((e) => (e.t === 'say' ? [e.text] : []));
			if (said.some((t) => t.trim() === check.text.trim())) return null;
			if (said.length === 0)
				return msg(`{Hero} should say ${tick(check.text)}. Use ${tick(`say("${check.text}")`)}.`);
			return msg(`{Hero} should say ${tick(check.text)}, but said ${tick(said[said.length - 1])}.`);
		}
		case 'code-includes':
			return new RegExp(check.pattern).test(stripComments(code)) ? null : check.message;
		case 'code-excludes':
			return new RegExp(check.pattern).test(stripComments(code)) ? check.message : null;
		case 'max-lines':
			return countCodeLines(code) <= check.count ? null : check.message;
		case 'max-calls':
			return countCalls(code, check.command) <= check.count ? null : check.message;
		case 'draw-count': {
			const n = countShapes(draws, check.shape);
			const [one, many] = SHAPE_WORDS[check.shape];
			if (check.min !== undefined && n < check.min) {
				return msg(
					`Draw at least ${check.min} ${plural(check.min, one, many)}. So far there ${plural(n, 'is', 'are')} ${n}.`
				);
			}
			if (check.max !== undefined && n > check.max) {
				return msg(
					`Draw at most ${check.max} ${plural(check.max, one, many)}. Your drawing has ${n}.`
				);
			}
			return null;
		}
		case 'draw-colors': {
			const colors = new Set(
				draws.flatMap((d) => (d.op === 'background' || d.op === 'color' ? [] : [d.color]))
			);
			if (colors.size >= check.min) return null;
			return msg(
				`Use at least ${check.min} different ${plural(check.min, 'colour', 'colours')} for your shapes. So far there ${plural(colors.size, 'is', 'are')} ${colors.size}. Put ${tick('color("…")')} before a shape to change its colour.`
			);
		}
		case 'draw-background':
			return draws.some((d) => d.op === 'background')
				? null
				: msg(`Give the canvas a background colour with ${tick('background("…")')}.`);
	}
	return null;
}

export function evaluate(lesson: CodeLesson, result: RunResult, code: string): EvaluateResult {
	if (!result.ok) {
		return {
			passed: false,
			failures: [result.error?.message ?? "Your program didn't finish. Press Run to try again."]
		};
	}
	const failures: ThemedText[] = [];
	for (const check of lesson.checks) {
		const f = checkFails(check, result, code);
		if (f !== null) failures.push(f);
	}
	if (failures.length > 0 && lesson.world) {
		const bare = bareCommands(code, lesson.world.kind);
		failures.unshift(
			...bare.map(
				(n) =>
					`${tick(n)} needs round brackets to work: ${tick(`${n}()`)}. Without them JavaScript only looks at the name and doesn't run it.`
			)
		);
	}
	return { passed: failures.length === 0, failures };
}
