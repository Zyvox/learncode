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
	type World,
	type ObjectMethods
} from './core.ts';
export { createWorld, SqlNotLoaded, type WorldDeps } from './worlds/index.ts';
export {
	createWebWorld,
	validateWebSpec,
	parseQuery,
	matchRoute,
	segmentsOf,
	WEB_MAX_STEPS,
	MAX_SCREEN_ITEMS,
	SNAPSHOT_ROWS,
	DB_LOAD_MESSAGE,
	SERVER_DOWN_BODY,
	SERVER_ERROR_BODY,
	type WebWorld,
	type WebWorldDeps,
	type WebState
} from './worlds/web.ts';
export {
	SqlError,
	SQL_KEYWORDS,
	friendlySqlMessage,
	splitSqlStatements,
	countPlaceholders,
	type SqlStatement,
	type SqlErrorContext
} from './sql-errors.ts';
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
	emptyWebResult,
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
	verifySqlFor,
	jsonDiff,
	rowsDiff,
	gluedQuery,
	countCalls,
	countCodeLines,
	bareCommands,
	stripComments
} from './evaluate.ts';
export {
	COMMANDS,
	SYNTAX,
	SQL_COMMANDS,
	commandNames,
	webCommandNames,
	type CommandDoc,
	type SyntaxDoc,
	type WebRole
} from './commands.ts';
