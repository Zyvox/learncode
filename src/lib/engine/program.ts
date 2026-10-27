/**
 * Turns learner code plus a world into something `new Function(...names, body)` can run.
 *
 * Layout of the function source every engine executor compiles (this is exactly what
 * `new Function` produces per the spec, and what the Node executor builds by hand):
 *
 *   line 1: function anonymous(<names>
 *   line 2: ) {
 *   line 3: return (function () { "use strict";      <- BODY_PREFIX_LINES = 1
 *   line 4: <learner line 1>
 *   ...
 *           }).call(undefined);
 *   }
 *
 * The outer function is sloppy so dangerous globals (including `eval`) can be shadowed as
 * parameters; the learner's code runs in an inner strict function, which also means their
 * `let score = …` never clashes with a parameter of the same name.
 */
import type { World } from './core.ts';

/** Lines `new Function` puts before the body: `function anonymous(…` and `) {`. */
export const FUNCTION_HEADER_LINES = 2;
/** Lines buildProgram puts before the learner's first line inside the body. */
export const BODY_PREFIX_LINES = 1;
/** Subtract this from a line number in the compiled function to get the learner's line. */
export const PREFIX_LINES = FUNCTION_HEADER_LINES + BODY_PREFIX_LINES;

/** Globals hidden from learner code (they are passed in as `undefined`). */
export const SHADOWED_GLOBALS = [
	'self',
	'window',
	'globalThis',
	'postMessage',
	'importScripts',
	'fetch',
	'XMLHttpRequest',
	'WebSocket',
	'Worker',
	'eval',
	'Function',
	'setTimeout',
	'setInterval',
	'require',
	'process'
] as const;

export interface Program {
	/** Parameter names: commands, lesson variables, `console`, then the shadowed globals */
	names: string[];
	/** Values for `names`, same order */
	values: unknown[];
	/** Function body wrapping the learner code */
	body: string;
	/** Lines before learner line 1 in the compiled function source (see PREFIX_LINES) */
	prefixLines: number;
	/** Lines before learner line 1 inside `body` */
	bodyPrefixLines: number;
	/** Names the learner can use: commands + lesson variables + console (for "did you mean") */
	knownNames: string[];
	/** Which of knownNames are commands (shown as `name()`) */
	commandNames: string[];
}

/** Hidden parameter that runs the world's `afterProgram` hook inside the same call (and time limit). */
export const AFTER_PROGRAM_NAME = '__learncodeAfterProgram__';

/**
 * Wraps learner code. Exported so syntax checks can compile the exact same shape. With
 * `after`, the world's afterProgram hook is called once the learner's code has returned
 * (on the last line, so learner line numbers don't move).
 */
export function buildBody(code: string, after = false): string {
	return (
		`return (function () { "use strict";\n${code}\n}).call(undefined)` +
		(after ? `, ${AFTER_PROGRAM_NAME}();` : ';')
	);
}

export function buildProgram(code: string, world: World): Program {
	const names: string[] = [];
	const values: unknown[] = [];
	const add = (name: string, value: unknown) => {
		if (names.includes(name)) return;
		names.push(name);
		values.push(value);
	};
	const commandNames = Object.keys(world.api);
	for (const name of commandNames) add(name, world.api[name]);
	for (const [name, value] of Object.entries(world.variables)) add(name, value);
	const log = world.log;
	add('console', Object.freeze({ log, info: log, warn: log, error: log, debug: log }));
	for (const name of SHADOWED_GLOBALS) add(name, undefined);
	const after = typeof world.afterProgram === 'function';
	if (after) add(AFTER_PROGRAM_NAME, () => world.afterProgram!());

	return {
		names,
		values,
		body: buildBody(code, after),
		prefixLines: PREFIX_LINES,
		bodyPrefixLines: BODY_PREFIX_LINES,
		knownNames: [...commandNames, ...Object.keys(world.variables), 'console'],
		commandNames
	};
}

/** Source text identical to what `new Function(...names, body)` compiles. */
export function functionSource(names: string[], body: string): string {
	return `function anonymous(${names.join(',')}\n) {\n${body}\n}`;
}
