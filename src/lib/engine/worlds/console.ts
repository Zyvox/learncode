/**
 * Console world: `print(...values)` writes lines of output. The lesson can pre-define
 * variables (e.g. `score`) that exist when the learner's code starts.
 */
import type { ConsoleWorldSpec } from '#lib/curriculum/types.ts';
import {
	MAX_OUTPUT_LINES,
	SpecError,
	TOO_MUCH_OUTPUT,
	createBase,
	formatArgs,
	type World
} from '../core.ts';

export const CONSOLE_ALIASES: Record<string, string> = {
	say: 'print',
	log: 'print',
	write: 'print',
	show: 'print',
	echo: 'print',
	println: 'print',
	printf: 'print',
	Print: 'print'
};

/** Names a lesson variable may not use (they'd hide engine names or can't be parameters). */
const RESERVED = new Set(
	(
		'break case catch class const continue debugger default delete do else enum export extends ' +
		'false finally for function if import in instanceof new null return super switch this throw ' +
		'true try typeof var void while with yield let static implements interface package private ' +
		'protected public await arguments eval undefined NaN Infinity console print'
	).split(' ')
);

export function validateVariableName(name: string): void {
	if (!/^[A-Za-z_$][\w$]*$/.test(name) || RESERVED.has(name)) {
		throw new SpecError(`"${name}" can't be used as a lesson variable name`);
	}
}

export type ConsoleWorld = World & { kind: 'console' };

export function createConsoleWorld(spec: ConsoleWorldSpec): ConsoleWorld {
	const variables: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(spec.variables ?? {})) {
		validateVariableName(name);
		if (!['number', 'string', 'boolean'].includes(typeof value)) {
			throw new SpecError(`lesson variable "${name}" must be a number, string or boolean`);
		}
		variables[name] = value;
	}
	// Every print() is one step, so the step cap is the output cap.
	const base = createBase(MAX_OUTPUT_LINES, TOO_MUCH_OUTPUT);

	const api = {
		print(...args: unknown[]) {
			base.step();
			base.print(formatArgs(args));
		}
	};

	return {
		kind: 'console',
		api,
		variables,
		log: api.print,
		trace: base.trace,
		output: base.output,
		get steps() {
			return base.steps;
		},
		get halted() {
			return base.halted;
		},
		aliases: CONSOLE_ALIASES,
		finish: () => ({})
	};
}
