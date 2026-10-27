/**
 * Public engine API. Runners are imported directly so bundles stay clean:
 *   browser: import { runInWorker } from '#lib/engine/worker.ts'
 *   Node:    import { runInNode } from '#lib/engine/node.ts'
 */
export type * from './types.ts';
export {
	CommandError,
	RunTimeout,
	SpecError,
	WorldHalt,
	formatArgs,
	formatValue,
	MAX_OUTPUT_LINES,
	type World
} from './core.ts';
export { createWorld } from './worlds/index.ts';
export {
	createGridWorld,
	gridStateFromSpec,
	cloneGridState,
	validateGridSpec,
	turnLeftOf,
	turnRightOf,
	DEFAULT_MAX_STEPS,
	type GridWorld
} from './worlds/grid.ts';
export { createConsoleWorld, type ConsoleWorld } from './worlds/console.ts';
export {
	createCanvasWorld,
	normalizeColor,
	FRIENDLY_COLORS,
	MAX_DRAW_OPS,
	DEFAULT_CANVAS_SIZE,
	DEFAULT_FILL,
	type CanvasWorld
} from './worlds/canvas.ts';
export {
	buildProgram,
	buildBody,
	functionSource,
	PREFIX_LINES,
	SHADOWED_GLOBALS,
	type Program
} from './program.ts';
export {
	runProgram,
	timeoutResult,
	failureResult,
	functionExecutor,
	SPEC_ERROR_MESSAGE,
	type Executor,
	type Compiler,
	type RunProgramOptions
} from './run.ts';
export {
	toFriendlyError,
	findSyntaxErrorLine,
	lineFromStack,
	closestName,
	editDistance,
	TIMEOUT_MESSAGE,
	BRACKET_MESSAGE,
	SMART_QUOTES_MESSAGE,
	MISSING_QUOTE_MESSAGE,
	type FriendlyErrorOptions
} from './errors.ts';
export {
	evaluate,
	checkFails,
	countCalls,
	countCodeLines,
	bareCommands,
	stripComments
} from './evaluate.ts';
export { COMMANDS, SYNTAX, commandNames, type CommandDoc, type SyntaxDoc } from './commands.ts';
