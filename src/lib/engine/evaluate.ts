/**
 * Decides whether a run passed a lesson's checks, with learner-friendly failure messages
 * (ThemedText — render with renderText()). A lesson's own `message` always wins.
 */
import type { Check, CodeLesson, ThemedText, WorldKind } from '#lib/curriculum/types.ts';
import { commandNames } from './commands.ts';
import { declaredNames } from './errors.ts';
import { codeOnly, stripComments } from './source.ts';
import type {
	DrawOp,
	EvaluateResult,
	RunResult,
	SimResponse,
	SqlResultSet,
	TraceEvent,
	WebResult
} from './types.ts';
import { matchRoute, parseQuery, segmentsOf } from './worlds/web.ts';
import { netCheckFails } from './worlds/net.ts';

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
export function bareCommands(code: string, kind: WorldKind, names = commandNames(kind)): string[] {
	const src = codeOnly(code);
	const found: string[] = [];
	const declared = declaredNames(code);
	for (const name of names) {
		if (declared.variables.includes(name) || declared.functions.includes(name)) continue;
		const re = new RegExp(`(^|[^\\w$.])${escapeRegExp(name)}(?![\\w$])(?!\\s*\\()`, 'g');
		for (const m of src.matchAll(re)) {
			const before = src.slice(0, m.index! + m[1].length);
			const after = src.slice(m.index! + m[0].length);
			// skip declarations / assignments / object keys: `function move`, `let move`, `move = …`,
			// `{ hash: h }`
			if (/\b(function|let|const|var)\s*$/.test(before) || /^\s*(=(?!=)|:)/.test(after)) continue;
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

/** Global functions in the web world's client role (for the "missing brackets" hint). */
const CLIENT_FUNCTIONS = ['get', 'post', 'put', 'del', 'show', 'log'];
/** …and in the server role (`if (hashMatches) {` is always true) */
const SERVER_FUNCTIONS = ['log', 'hash', 'hashMatches', 'escape'];

// ---------------------------------------------------------------------------------------------
// Web world helpers
// ---------------------------------------------------------------------------------------------

/**
 * The SQL the runner must run after the learner's code so `db-rows` checks can be evaluated:
 * `runInWorker(code, world, { verifySql: verifySqlFor(lesson.checks) })`. Results come back in
 * `web.verification`, in the same order.
 */
export function verifySqlFor(checks: readonly Check[]): string[] {
	return checks.flatMap((c) => (c.type === 'db-rows' ? [c.sql] : []));
}

/** Short JSON for messages. */
function brief(v: unknown, max = 80): string {
	let s: string;
	try {
		s = v === undefined ? 'undefined' : (JSON.stringify(v) ?? String(v));
	} catch {
		s = String(v);
	}
	return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

const reqName = (r: SimResponse) => tick(`${r.method} ${r.path}`);

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type JsonDiff =
	| { why: 'value' | 'type'; path: string; expected: unknown; actual: unknown }
	| { why: 'missing'; path: string; expected: unknown }
	| { why: 'extra'; path: string; actual: unknown }
	| { why: 'length'; path: string; expected: number; actual: number };

const joinKey = (path: string, k: string) =>
	/^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`;

/** First difference between expected and actual JSON values (subset: extra keys are fine). */
export function jsonDiff(
	expected: unknown,
	actual: unknown,
	subset = false,
	path = ''
): JsonDiff | null {
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual)) return { why: 'type', path, expected, actual };
		if (expected.length !== actual.length) {
			return { why: 'length', path, expected: expected.length, actual: actual.length };
		}
		for (let i = 0; i < expected.length; i++) {
			const d = jsonDiff(expected[i], actual[i], subset, `${path}[${i}]`);
			if (d) return d;
		}
		return null;
	}
	if (isPlainObject(expected)) {
		if (!isPlainObject(actual)) return { why: 'type', path, expected, actual };
		for (const k of Object.keys(expected)) {
			if (!(k in actual)) return { why: 'missing', path: joinKey(path, k), expected: expected[k] };
			const d = jsonDiff(expected[k], actual[k], subset, joinKey(path, k));
			if (d) return d;
		}
		if (!subset) {
			for (const k of Object.keys(actual)) {
				if (!(k in expected)) return { why: 'extra', path: joinKey(path, k), actual: actual[k] };
			}
		}
		return null;
	}
	return Object.is(expected, actual) ? null : { why: 'value', path, expected, actual };
}

function describeJsonDiff(d: JsonDiff, r: SimResponse): string {
	const where = tick(`body${d.path}`);
	const answer = `the answer to ${reqName(r)}`;
	switch (d.why) {
		case 'missing':
			return `${where} is missing from ${answer}. It should be ${tick(brief(d.expected))}.`;
		case 'extra':
			return `${answer[0].toUpperCase()}${answer.slice(1)} has ${where}, which shouldn't be there.`;
		case 'length':
			return `In ${answer}, ${where} should be a list of ${d.expected}, but it has ${d.actual}.`;
		case 'type':
		case 'value': {
			let text = `In ${answer}, ${where} should be ${tick(brief(d.expected))}, but it is ${tick(brief(d.actual))}.`;
			const scalar = (v: unknown) => typeof v === 'string' || typeof v === 'number';
			if (
				scalar(d.expected) &&
				scalar(d.actual) &&
				typeof d.expected !== typeof d.actual &&
				String(d.expected) === String(d.actual)
			) {
				text += ` One is a number and the other is text. Check for quotes, and remember that ${tick('req.params')} and ${tick('req.query')} values are always text.`;
			}
			return text;
		}
	}
}

const looseEq = (a: unknown, b: unknown) =>
	(a === null || a === undefined) && (b === null || b === undefined)
		? true
		: a === null || a === undefined || b === null || b === undefined
			? false
			: typeof a === 'object' || typeof b === 'object'
				? JSON.stringify(a) === JSON.stringify(b)
				: String(a) === String(b);

function normalizedRow(row: Record<string, unknown>): string {
	return JSON.stringify(
		Object.keys(row)
			.sort()
			.map((k) => [k, row[k] === null || row[k] === undefined ? null : String(row[k])])
	);
}

/**
 * Compares rows: key order ignored, values compared loosely (1 and '1' match), row order
 * matters unless `anyOrder`. Returns a sentence describing the first problem, or null.
 */
export function rowsDiff(
	expected: Record<string, unknown>[],
	actual: Record<string, unknown>[],
	anyOrder = false
): string | null {
	const rows = (n: number) => `${n} ${plural(n, 'row', 'rows')}`;
	if (expected.length !== actual.length) {
		return `there should be ${rows(expected.length)}, but there ${plural(actual.length, 'is', 'are')} ${rows(actual.length)}.`;
	}
	const eCols = [...new Set(expected.flatMap((r) => Object.keys(r)))].sort();
	const aCols = [...new Set(actual.flatMap((r) => Object.keys(r)))].sort();
	if (expected.length > 0 && eCols.join('\u0000') !== aCols.join('\u0000')) {
		const missing = eCols.filter((c) => !aCols.includes(c));
		const extra = aCols.filter((c) => !eCols.includes(c));
		const parts: string[] = [];
		if (missing.length)
			parts.push(`${missing.map(tick).join(', ')} ${plural(missing.length, 'is', 'are')} missing`);
		if (extra.length) parts.push(`${extra.map(tick).join(', ')} shouldn't be there`);
		return `the columns aren't right: ${parts.join(', and ')}.`;
	}
	const e = anyOrder
		? [...expected].sort((a, b) => normalizedRow(a).localeCompare(normalizedRow(b)))
		: expected;
	const a = anyOrder
		? [...actual].sort((x, y) => normalizedRow(x).localeCompare(normalizedRow(y)))
		: actual;
	for (let i = 0; i < e.length; i++) {
		const same = eCols.every((c) => looseEq(e[i][c], a[i][c]));
		if (same) continue;
		if (anyOrder) {
			return `the row ${tick(brief(e[i]))} isn't there (or doesn't look like that).`;
		}
		return `row ${i + 1} should be ${tick(brief(e[i]))}, but it is ${tick(brief(a[i]))}.`;
	}
	return null;
}

const sentence = (s: string) => s[0].toUpperCase() + s.slice(1);

function screenText(web: WebResult): string[] {
	return web.screen.map((item) =>
		item.kind === 'text'
			? item.text
			: item.kind === 'error'
				? `${item.status} ${item.text}`
				: item.kind === 'html'
					? item.raw
					: (JSON.stringify(item.value) ?? String(item.value))
	);
}

function logLines(trace: TraceEvent[], id?: number): string[] {
	return trace.flatMap((e) => (e.t === 'log' && (id === undefined || e.id === id) ? [e.text] : []));
}

/** Values the requests carried (path params, query, body): the things that must never be glued into SQL. */
function requestValues(trace: TraceEvent[]): { text: string[]; numbers: string[] } {
	const patterns = new Map<number, string | null>();
	for (const e of trace) if (e.t === 'route') patterns.set(e.id, e.pattern);
	const values: unknown[] = [];
	const walk = (v: unknown) => {
		if (Array.isArray(v)) v.forEach(walk);
		else if (isPlainObject(v)) Object.values(v).forEach(walk);
		else values.push(v);
	};
	for (const e of trace) {
		if (e.t !== 'request') continue;
		const q = e.path.indexOf('?');
		const pathname = q < 0 ? e.path : e.path.slice(0, q);
		if (q >= 0) values.push(...Object.values(parseQuery(e.path.slice(q + 1))));
		const pattern = patterns.get(e.id);
		if (pattern) {
			const params = matchRoute(segmentsOf(pattern), segmentsOf(pathname));
			if (params) values.push(...Object.values(params));
		}
		walk(e.body);
	}
	const text = new Set<string>();
	const numbers = new Set<string>();
	for (const v of values) {
		if (typeof v === 'number' && Number.isFinite(v)) numbers.add(String(v));
		else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) numbers.add(v.trim());
		else if (typeof v === 'string' && v.length >= 2) text.add(v);
	}
	return { text: [...text], numbers: [...numbers] };
}

/** The first query with a request value glued into its SQL text, if any. */
export function gluedQuery(trace: TraceEvent[]): string | undefined {
	const { text, numbers } = requestValues(trace);
	for (const e of trace) {
		if (e.t !== 'query') continue;
		if (text.some((v) => e.sql.includes(v))) return e.sql;
		if (
			e.params.length === 0 &&
			numbers.some((n) => new RegExp(`(^|[^\\w.])${n.replace('.', '\\.')}(?![\\w.])`).test(e.sql))
		) {
			return e.sql;
		}
	}
	return undefined;
}

function webCheckFails(
	check: Check,
	result: RunResult,
	msg: (f: ThemedText) => ThemedText,
	dbRowsIndex?: number
): ThemedText | null {
	const web = result.web ?? { responses: [], tables: {}, screen: [], queryCount: 0 };
	const responseFor = (n: number): SimResponse | ThemedText => {
		const r = web.responses[n];
		if (r) return r;
		const sent = web.responses.length;
		return msg(
			sent === 0
				? 'No requests were sent, so there is no answer to look at yet.'
				: `Only ${sent} ${plural(sent, 'request was', 'requests were')} sent, so there is no answer to look at for request number ${n + 1}.`
		);
	};
	const why = (r: SimResponse): string => {
		if (r.status === 0) return " The server couldn't be reached.";
		if (r.route === null && r.status === 404) {
			return ' No endpoint matched it, so the server answered 404 (not found).';
		}
		if (r.status >= 500) {
			const lines = logLines(result.trace, r.id).filter((l) =>
				/^(Error in|The handler for)/.test(l)
			);
			if (lines.length) return ` The server log says: "${lines[0]}"`;
		}
		return '';
	};

	switch (check.type) {
		case 'response-status': {
			const r = responseFor(check.request);
			if (typeof r !== 'object' || !('status' in r)) return r as ThemedText;
			if (r.status === check.status) return null;
			return msg(
				`${reqName(r)} should get the status ${tick(String(check.status))}, but it got ${tick(String(r.status))}.${why(r)}`
			);
		}
		case 'response-json': {
			const r = responseFor(check.request);
			if (typeof r !== 'object' || !('status' in r)) return r as ThemedText;
			const d = jsonDiff(check.expected, r.body, check.mode === 'subset');
			if (!d) return null;
			const status =
				r.status >= 300 || r.status === 0 ? ` (It got the status ${r.status}.${why(r)})` : '';
			return msg(describeJsonDiff(d, r) + status);
		}
		case 'response-includes': {
			const r = responseFor(check.request);
			if (typeof r !== 'object' || !('status' in r)) return r as ThemedText;
			const text = typeof r.body === 'string' ? r.body : (JSON.stringify(r.body) ?? '');
			if (text.includes(check.text)) return null;
			return msg(
				`The answer to ${reqName(r)} should include ${tick(check.text)}, but it doesn't yet.${why(r)}`
			);
		}
		case 'all-responses-ok': {
			if (web.responses.length === 0)
				return msg('No requests were sent, so there are no answers to check yet.');
			const bad = web.responses.find((r) => r.status < 200 || r.status >= 300);
			if (!bad) return null;
			return msg(
				`${reqName(bad)} got the status ${tick(String(bad.status))}. Every request should get an answer in the 200s.${why(bad)}`
			);
		}
		case 'db-rows': {
			const results = web.verification ?? [];
			const set: SqlResultSet | undefined = results[dbRowsIndex ?? (results.length === 1 ? 0 : -1)];
			if (!set || set.error) {
				return msg("The database couldn't be checked this time. That's our mistake, not yours.");
			}
			const d = rowsDiff(check.expected, set.rows, check.anyOrder);
			return d ? msg(`The data in the database isn't right yet: ${d}`) : null;
		}
		case 'sql-result': {
			const set = web.sqlResult;
			if (!set) {
				return msg(
					`Your SQL didn't give back any rows to look at. The last statement that gives back rows, like ${tick('SELECT …')}, is the one that's checked.`
				);
			}
			const d = rowsDiff(check.expected, set.rows, check.anyOrder);
			if (!d) return null;
			if (check.expected.length > 0 && set.rows.length === 0 && set.columns.length) {
				const eCols = Object.keys(check.expected[0])
					.map((c) => c.toLowerCase())
					.sort();
				const aCols = set.columns.map((c) => c.toLowerCase()).sort();
				if (eCols.join() === aCols.join()) {
					return msg(`Your result is empty: no rows matched. Check the ${tick('WHERE')} part.`);
				}
			}
			return msg(`Your result isn't quite right yet: ${d}`);
		}
		case 'sql-columns': {
			const set = web.sqlResult;
			if (!set) {
				return msg(
					`Your SQL didn't give back any rows to look at. End with a ${tick('SELECT …')} statement.`
				);
			}
			const want = check.columns.map((c) => c.toLowerCase()).sort();
			const got = set.columns.map((c) => c.toLowerCase()).sort();
			if (want.join('\u0000') === got.join('\u0000')) return null;
			return msg(
				`Your result has the ${plural(set.columns.length, 'column', 'columns')} ${set.columns.map(tick).join(', ') || 'nothing'}, but it should have ${check.columns.map(tick).join(', ')}.`
			);
		}
		case 'sql-row-count': {
			const set = web.sqlResult;
			const n = set?.rows.length ?? 0;
			if (!set) {
				return msg(
					`Your SQL didn't give back any rows to look at. End with a ${tick('SELECT …')} statement.`
				);
			}
			if (check.min !== undefined && n < check.min) {
				return msg(
					`Your result has ${n} ${plural(n, 'row', 'rows')}. It should have at least ${check.min}.`
				);
			}
			if (check.max !== undefined && n > check.max) {
				return msg(
					`Your result has ${n} ${plural(n, 'row', 'rows')}. It should have at most ${check.max}.`
				);
			}
			return null;
		}
		case 'screen-includes': {
			const texts = screenText(web);
			if (texts.some((t) => t.includes(check.text))) return null;
			if (texts.length === 0) {
				return msg(
					`Nothing is on the phone screen yet. Use ${tick('show(…)')} to put something there.`
				);
			}
			return msg(`The phone screen should show ${tick(check.text)}, but it doesn't yet.`);
		}
		case 'log-includes': {
			const lines = logLines(result.trace);
			if (lines.some((l) => l.includes(check.text))) return null;
			if (lines.length === 0) {
				return msg(`Nothing was written to the log. Use ${tick('log(…)')} to write a line.`);
			}
			return msg(`The log should include ${tick(check.text)}, but it doesn't yet.`);
		}
		case 'screen-no-script': {
			const scripted = web.screen.find((item) => item.kind === 'html' && item.scripted);
			if (!scripted) return null;
			return msg(
				`A script ran on the reader's phone: the screen got text with a ${tick('<script>')} tag in it, and the phone ran it instead of showing it. Escape text before it goes out, like ${tick('escape(comment.text)')}, so ${tick('<')} becomes ${tick('&lt;')} and the tag is shown as plain text.`
			);
		}
		case 'response-no-script': {
			const r = responseFor(check.request);
			if (typeof r !== 'object' || !('status' in r)) return r as ThemedText;
			const text = typeof r.body === 'string' ? r.body : (JSON.stringify(r.body) ?? '');
			if (!/<script/i.test(text)) return null;
			return msg(
				`The answer to ${reqName(r)} still has a raw ${tick('<script')} tag in it, so a phone that shows it would run it. Escape the text with ${tick('escape(…)')} before sending it.`
			);
		}
		case 'log-excludes': {
			if (!logLines(result.trace).some((l) => l.includes(check.text))) return null;
			return msg(
				`The server log contains ${tick(check.text)}. Secrets and passwords must never be logged.`
			);
		}
		case 'queries-parameterized': {
			const sql = gluedQuery(result.trace);
			if (!sql) return null;
			return msg(
				`A query has a value from the request glued right into the SQL: ${tick(clip(sql.replace(/\s+/g, ' '), 90))}. Put a ${tick('?')} in the SQL and pass the value in the list instead, like ${tick("db.all('SELECT * FROM comments WHERE author = ?', [name])")}.`
			);
		}
		case 'max-queries': {
			const n = web.queryCount;
			if (n <= check.count) return null;
			return msg(
				`Your code ran ${n} database ${plural(n, 'query', 'queries')}. It can be done with at most ${check.count}.`
			);
		}
	}
	return null;
}

/**
 * Returns a failure message, or null when the check passes. `dbRowsIndex`: for a `db-rows`
 * check, its position among the lesson's db-rows checks (= its index in `web.verification`).
 */
export function checkFails(
	check: Check,
	result: RunResult,
	code: string,
	dbRowsIndex?: number
): ThemedText | null {
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
		// ---- net world (networks + cloud): rules and messages live in worlds/net.ts ----
		case 'net-reachable':
		case 'net-unreachable':
		case 'net-resolves':
		case 'net-node':
		case 'net-allows':
		case 'cloud-replicas':
		case 'cloud-route':
		case 'cloud-success-rate':
		case 'net-call-result':
			return netCheckFails(check, result.net, msg);
		// ---- end net world ----
		default:
			return webCheckFails(check, result, msg, dbRowsIndex);
	}
}

export function evaluate(lesson: CodeLesson, result: RunResult, code: string): EvaluateResult {
	if (!result.ok) {
		return {
			passed: false,
			failures: [result.error?.message ?? "Your program didn't finish. Press Run to try again."]
		};
	}
	const failures: ThemedText[] = [];
	let dbRows = 0;
	for (const check of lesson.checks) {
		const f = checkFails(check, result, code, check.type === 'db-rows' ? dbRows++ : undefined);
		if (f !== null) failures.push(f);
	}
	if (failures.length > 0 && lesson.world) {
		const world = lesson.world;
		const bare =
			world.kind !== 'web'
				? bareCommands(code, world.kind)
				: world.role === 'sql' || lesson.language === 'sql'
					? []
					: bareCommands(
							code,
							'web',
							world.role === 'client' ? CLIENT_FUNCTIONS : SERVER_FUNCTIONS
						);
		failures.unshift(
			...bare.map(
				(n) =>
					`${tick(n)} needs round brackets to work: ${tick(`${n}()`)}. Without them JavaScript only looks at the name and doesn't run it.`
			)
		);
	}
	return { passed: failures.length === 0, failures };
}
