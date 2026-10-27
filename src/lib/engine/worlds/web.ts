/**
 * Web world ("Behind the app"): a phone (client) → a server with routes → a real SQLite
 * database (sql.js). The learner's code plays ONE role per lesson (see docs/WEB_TRACK.md):
 *
 * - server: `app.get(path, handler)` … registers routes; after the program returns, the
 *   phone's `spec.requests` are fired at them in order (`afterProgram`).
 * - client: `get(path)` / `post(path, body)` … call the server from `spec.serverCode`
 *   synchronously and return a Response; `show(value)` puts things on the phone screen.
 * - sql:    the editor holds SQL; the world runs it itself (`executeSource`).
 *
 * sql.js is loaded by the runner (async) and passed in, so everything here is synchronous.
 */
import type { SqlJsStatic, Database, SqlValue } from 'sql.js';
import type { SimRequest, ThemedText, WebWorldSpec } from '#lib/curriculum/types.ts';
import type { ScreenItem, SimResponse, SqlResultSet, TraceEvent, WebResult } from '../types.ts';
import {
	CommandError,
	SpecError,
	WorldHalt,
	createBase,
	formatArgs,
	formatValue,
	type ApiFunction,
	type ObjectMethods,
	type World
} from '../core.ts';
import {
	SqlError,
	countPlaceholders,
	friendlySqlMessage,
	splitSqlStatements
} from '../sql-errors.ts';

export const WEB_MAX_STEPS = 500;
export const MAX_SCREEN_ITEMS = 50;
/** Rows read per statement at most (protects against huge or endless results) */
export const MAX_ROWS = 1000;
/** Rows per table in the database snapshot */
export const SNAPSHOT_ROWS = 25;
export const MAX_ROUTES = 200;

export const DB_LOAD_MESSAGE: ThemedText =
	"The database engine couldn't load. Check your connection and try again.";

export const WEB_TOO_MANY_STEPS: ThemedText = `Your program did more than ${WEB_MAX_STEPS} things (requests, database queries and log lines), so it was stopped. That usually means a loop that never ends.`;

export const SCREEN_FULL: ThemedText = `The phone screen is full: ${'`show()`'} was used more than ${MAX_SCREEN_ITEMS} times. Show a whole list at once with one ${'`show(list)`'} instead.`;

export const DB_READ_ONLY: ThemedText =
	'This database connection may only read. Writes need a connection with more rights.';
/** SQLite's own wording for the same thing (the "show details" text and the query trace) */
export const DB_READ_ONLY_RAW = 'attempt to write a readonly database';
/** Statements a read-only connection refuses (first keyword) */
export const WRITE_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'DROP', 'ALTER', 'CREATE'];

/** Client log line when a renderHtml phone "ran" a script (the simulated XSS) */
export const SCRIPT_RAN = "💥 A script ran on the reader's phone.";

export const SERVER_DOWN_BODY = { error: 'Could not reach the server' };
export const SERVER_ERROR_BODY = { error: 'Server error' };

const tick = (s: string) => '`' + s + '`';
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;
type Method = (typeof METHODS)[number];
type Role = WebWorldSpec['role'];

export const WEB_OBJECT_METHODS: Record<Role, Record<string, ObjectMethods>> = {
	server: {
		app: { methods: ['get', 'post', 'put', 'delete'], what: `something ${tick('app')} can do` },
		db: { methods: ['all', 'get', 'run'], what: 'a database command' },
		res: { methods: ['status', 'json', 'send', 'end'], what: `something ${tick('res')} can do` }
	},
	client: {
		res: { methods: ['json', 'text'], what: 'something a response can do' },
		response: { methods: ['json', 'text'], what: 'something a response can do' }
	},
	sql: {}
};

export const WEB_ALIASES: Record<Role, Record<string, string>> = {
	server: {
		print: 'log',
		sha256: 'hash',
		hashPassword: 'hash',
		checkPassword: 'hashMatches',
		escapeHtml: 'escape',
		sanitize: 'escape',
		router: 'app',
		server: 'app',
		express: 'app',
		database: 'db',
		sql: 'db'
	},
	client: {
		fetch: 'get',
		request: 'get',
		print: 'show',
		display: 'show',
		render: 'show',
		remove: 'del',
		patch: 'put'
	},
	sql: {}
};

export interface WebWorldDeps {
	SQL: SqlJsStatic;
	/** Run after everything else; results go to `web.verification` (same order) */
	verifySql?: string[];
}

export interface WebState {
	responses: SimResponse[];
	screen: ScreenItem[];
	sqlResult?: SqlResultSet;
	queryCount: number;
}

export type WebWorld = World & {
	kind: 'web';
	state: WebState;
	/** Sends one request through the pipeline (also used by the client commands) */
	dispatch(request: SimRequest, id: number): SimResponse;
};

interface Route {
	method: Method;
	pattern: string;
	segments: string[];
	handler: (req: unknown, res: unknown) => unknown;
}

interface ExecResult {
	columns: string[];
	rows: Record<string, unknown>[];
	changes: number;
	lastId: number;
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/** Plain JSON copy: what actually travels over the wire. Throws on circular values. */
function jsonCopy(v: unknown): unknown {
	const s = JSON.stringify(v);
	return s === undefined ? null : JSON.parse(s);
}

function decode(s: string, plusIsSpace: boolean): string {
	try {
		return decodeURIComponent(plusIsSpace ? s.replace(/\+/g, ' ') : s);
	} catch {
		return s;
	}
}

/** `?a=1&b=2` → { a: '1', b: '2' }; repeated keys: the last one wins. */
export function parseQuery(qs: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of qs.split('&')) {
		if (!part) continue;
		const eq = part.indexOf('=');
		const k = decode(eq < 0 ? part : part.slice(0, eq), true);
		if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
		out[k] = eq < 0 ? '' : decode(part.slice(eq + 1), true);
	}
	return out;
}

/** '/episodes/' → ['episodes']; '/' → [] */
export function segmentsOf(path: string): string[] {
	return path.split('/').filter((s, i, all) => !(s === '' && (i === 0 || i === all.length - 1)));
}

/** Matches a route pattern like '/episodes/:id' against a path (no query string). */
export function matchRoute(pattern: string[], path: string[]): Record<string, string> | null {
	if (pattern.length !== path.length) return null;
	const params: Record<string, string> = {};
	for (let i = 0; i < pattern.length; i++) {
		const p = pattern[i];
		if (p.startsWith(':') && p.length > 1) {
			if (path[i] === '') return null;
			params[p.slice(1)] = decode(path[i], false);
		} else if (p !== path[i]) return null;
	}
	return params;
}

function friendlyText(t: ThemedText): string {
	return typeof t === 'string' ? t : t.default;
}

/** What goes in the server log when a handler throws. */
function errorText(e: unknown): string {
	if (e instanceof CommandError) return friendlyText(e.friendly);
	if (typeof e === 'object' && e !== null && typeof (e as Error).message === 'string') {
		return (e as Error).message;
	}
	return formatValue(e);
}

// ---------------------------------------------------------------------------------------------
// Security helpers (pure: also used by tests and lesson authors)
// ---------------------------------------------------------------------------------------------

/**
 * A toy one-way function for the security lessons. Deterministic, 64 hex characters, so it
 * looks like SHA-256 output, but it is NOT a real cryptographic hash: eight 32-bit FNV-1a
 * passes with different seeds, each chained to the one before and finished with a mixer.
 */
export function toyHash(text: string): string {
	let out = '';
	let prev = 0x6a09e667;
	for (let round = 0; round < 8; round++) {
		let h = (0x811c9dc5 ^ Math.imul(round + 1, 0x9e3779b9) ^ prev) >>> 0;
		for (let i = 0; i < text.length; i++) {
			h ^= text.charCodeAt(i);
			h = Math.imul(h, 0x01000193);
		}
		h ^= text.length;
		// murmur3's finalizer: every input bit changes about half of the output bits
		h ^= h >>> 16;
		h = Math.imul(h, 0x85ebca6b);
		h ^= h >>> 13;
		h = Math.imul(h, 0xc2b2ae35);
		h ^= h >>> 16;
		prev = h >>> 0;
		out += prev.toString(16).padStart(8, '0');
	}
	return out;
}

const HTML_ENTITIES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/** `<b>` → `&lt;b&gt;`: the text is shown as it is instead of being read as HTML. */
export function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

const SCRIPT_TAG = /<script/i;
const ANY_TAG = /<\/?[a-z][^<>]*>|<img\b/i;

/** Leaf values of a response body or shown value (a few levels deep), as text */
function leafTexts(v: unknown, depth = 0, out: string[] = []): string[] {
	if (out.length >= 200) return out;
	if (typeof v === 'string') out.push(v);
	else if (typeof v === 'number' || typeof v === 'boolean') out.push(String(v));
	else if (depth < 3 && Array.isArray(v)) v.forEach((x) => leafTexts(x, depth + 1, out));
	else if (depth < 3 && typeof v === 'object' && v !== null) {
		Object.values(v).forEach((x) => leafTexts(x, depth + 1, out));
	}
	return out;
}

export type HtmlScreenItem = Extract<ScreenItem, { kind: 'html' }>;

/**
 * renderHtml lessons: how a careless phone app shows this value. Text with a tag in it (at the
 * top level or inside a list/object) becomes an `html` item; `scripted` when a `<script` tag is
 * among it. Plain values give null (shown as usual). Nothing is ever evaluated.
 */
export function htmlScreenItem(value: unknown): HtmlScreenItem | null {
	const texts = leafTexts(value);
	const strings = texts.filter((t): t is string => typeof t === 'string');
	if (!strings.some((t) => SCRIPT_TAG.test(t) || ANY_TAG.test(t))) return null;
	return {
		kind: 'html',
		raw: typeof value === 'string' ? value : texts.join('\n'),
		scripted: strings.some((t) => SCRIPT_TAG.test(t))
	};
}

/** First keyword of a statement, skipping leading comments: 'select', 'insert', … (upper case) */
export function firstKeyword(sql: string): string {
	const rest = sql.replace(/^(\s+|--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/)*/, '');
	return (rest.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase();
}

function screenItemFor(status: number, body: unknown): ScreenItem {
	if (status >= 200 && status < 300) {
		return typeof body === 'string' ? { kind: 'text', text: body } : { kind: 'json', value: body };
	}
	const err =
		typeof body === 'object' &&
		body !== null &&
		typeof (body as { error?: unknown }).error === 'string'
			? (body as { error: string }).error
			: typeof body === 'string' && body
				? body
				: `Error ${status}`;
	return { kind: 'error', status, text: err };
}

// ---------------------------------------------------------------------------------------------
// Spec validation
// ---------------------------------------------------------------------------------------------

export function validateWebSpec(spec: WebWorldSpec): void {
	if (!['client', 'server', 'sql'].includes(spec.role)) {
		throw new SpecError(`web role must be client, server or sql, got ${JSON.stringify(spec.role)}`);
	}
	for (const [k, v] of [
		['schema', spec.schema],
		['serverCode', spec.serverCode]
	] as const) {
		if (v !== undefined && typeof v !== 'string') throw new SpecError(`${k} must be a string`);
	}
	if (spec.requests !== undefined && !Array.isArray(spec.requests)) {
		throw new SpecError('requests must be an array');
	}
	(spec.requests ?? []).forEach((r, i) => {
		if (!METHODS.includes(r?.method)) {
			throw new SpecError(`requests[${i}].method must be GET, POST, PUT or DELETE`);
		}
		if (typeof r.path !== 'string' || !r.path.startsWith('/')) {
			throw new SpecError(`requests[${i}].path must start with "/"`);
		}
	});
	for (const [k, v] of Object.entries(spec.env ?? {})) {
		if (typeof v !== 'string') throw new SpecError(`env.${k} must be a string`);
	}
}

// ---------------------------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------------------------

export function createWebWorld(spec: WebWorldSpec, deps: WebWorldDeps): WebWorld {
	validateWebSpec(spec);
	if (!deps?.SQL) throw new Error('sql.js is not loaded');
	const role = spec.role;
	const base = createBase(WEB_MAX_STEPS, WEB_TOO_MANY_STEPS);
	const state: WebState = { responses: [], screen: [], queryCount: 0 };
	const routes: Route[] = [];
	/** Request being handled right now (for trace ids) */
	let current: number | undefined;
	/** serverCode is running: no trace, no steps */
	let setup = false;
	let nextClientId = 0;

	const db: Database = new deps.SQL.Database();
	if (spec.schema) {
		try {
			db.exec(spec.schema);
		} catch (e) {
			db.close();
			throw new SpecError(`schema failed: ${(e as Error)?.message ?? e}`);
		}
	}

	const push = (e: TraceEvent) => {
		if (!setup) base.trace.push(e);
	};
	const step = () => {
		if (!setup) base.step();
	};
	const withId = <T extends object>(e: T): T => (current === undefined ? e : { ...e, id: current });

	// ---- database ---------------------------------------------------------------------------

	function scalar(sql: string): number {
		return Number(db.exec(sql)[0]?.values[0]?.[0] ?? 0);
	}

	function schemaInfo(): { tables: string[]; columns: Record<string, string[]> } {
		const tables = (
			db.exec(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid"
			)[0]?.values ?? []
		).map((r) => String(r[0]));
		const columns: Record<string, string[]> = {};
		for (const t of tables) {
			columns[t] = (db.exec(`PRAGMA table_info("${t.replace(/"/g, '""')}")`)[0]?.values ?? []).map(
				(r) => String(r[1])
			);
		}
		return { tables, columns };
	}

	function sqlErrorFrom(e: unknown, sql: string, line?: number): SqlError {
		if (e instanceof SqlError) return e;
		const raw =
			typeof (e as Error)?.message === 'string' ? (e as Error).message : String(e ?? 'error');
		let friendly: string;
		try {
			friendly = friendlySqlMessage(raw, { sql, ...schemaInfo() });
		} catch {
			friendly = `The database said: ${raw}`;
		}
		return new SqlError(friendly, raw, line);
	}

	function cell(v: unknown): unknown {
		return v instanceof Uint8Array ? '[binary data]' : v;
	}

	/**
	 * Rows are objects, so a repeated column name (`SELECT *` over a JOIN gives two `id`s) would
	 * silently keep only the last value. Repeats get SQLite's own suffix instead: `id`, `id:1`.
	 */
	function uniqueColumns(names: string[]): string[] {
		const used = new Set<string>();
		return names.map((name) => {
			let out = name;
			for (let n = 1; used.has(out); n++) out = `${name}:${n}`;
			used.add(out);
			return out;
		});
	}

	/** Runs one statement. Throws SQLite's error untouched. */
	function execOne(sql: string, params: SqlValue[], maxRows = MAX_ROWS): ExecResult {
		const before = scalar('SELECT total_changes()');
		const stmt = db.prepare(sql);
		try {
			if (params.length) stmt.bind(params);
			const columns = uniqueColumns(stmt.getColumnNames());
			const rows: Record<string, unknown>[] = [];
			while (rows.length < maxRows && stmt.step()) {
				const values = stmt.get();
				const row: Record<string, unknown> = {};
				columns.forEach((c, i) => (row[c] = cell(values[i])));
				rows.push(row);
			}
			const changes = scalar('SELECT total_changes()') - before;
			return { columns, rows, changes, lastId: scalar('SELECT last_insert_rowid()') };
		} finally {
			stmt.free();
		}
	}

	/** One traced, counted query. */
	function query(sql: string, params: SqlValue[], maxRows = MAX_ROWS, line?: number): ExecResult {
		step();
		if (!setup) state.queryCount++;
		const event: Extract<TraceEvent, { t: 'query' }> = withId({
			t: 'query',
			sql,
			params: [...params]
		});
		try {
			const r = execOne(sql, params, maxRows);
			if (r.columns.length > 0) event.rows = r.rows.length;
			else event.changes = r.changes;
			push(event);
			return r;
		} catch (e) {
			const err = sqlErrorFrom(e, sql, line);
			event.error = err.raw;
			push(event);
			throw err;
		}
	}

	function bindValue(v: unknown, cmd: string): SqlValue {
		if (v === null || typeof v === 'string') return v;
		if (typeof v === 'number') {
			if (!Number.isFinite(v)) {
				throw new CommandError(
					`One of the values for the ${tick('?')} placeholders in ${tick(`${cmd}()`)} isn't a real number (it's ${tick(String(v))}).`
				);
			}
			return v;
		}
		if (typeof v === 'boolean') return v ? 1 : 0;
		if (typeof v === 'bigint') return Number(v);
		if (v instanceof Date) return v.toISOString();
		if (v === undefined) {
			throw new CommandError(
				`One of the values for the ${tick('?')} placeholders in ${tick(`${cmd}()`)} is ${tick('undefined')}, so it has no value. Check the spelling of what you passed, like ${tick('req.params.id')} or ${tick('req.body.text')}.`,
				`${cmd}(): undefined bind value`
			);
		}
		throw new CommandError(
			`Each value for a ${tick('?')} placeholder has to be text, a number or ${tick('null')}, not a list or an object. Pass the single values, like ${tick('[req.body.text]')}.`,
			`${cmd}(): unsupported bind value`
		);
	}

	/** dbReadOnly: the write is refused before it reaches the database (traced like a failed query). */
	function refuseWrite(sql: string, params: SqlValue[]): never {
		step();
		state.queryCount++;
		push(withId({ t: 'query', sql, params: [...params], error: DB_READ_ONLY_RAW }));
		throw new CommandError(DB_READ_ONLY, DB_READ_ONLY_RAW);
	}

	/** db.all / db.get / db.run: validates, runs every statement in the string, traces each. */
	function dbCall(cmd: 'all' | 'get' | 'run', sql: unknown, params: unknown): ExecResult {
		const name = `db.${cmd}`;
		if (typeof sql !== 'string') {
			throw new CommandError(
				`${tick(`${name}()`)} needs an SQL statement in quotes first, like ${tick(`${name}('SELECT * FROM series')`)}.`,
				`${name}() called without an SQL string`
			);
		}
		if (params !== undefined && !Array.isArray(params)) {
			throw new CommandError(
				`The values for the ${tick('?')} placeholders go in square brackets, like ${tick(`${name}('SELECT * FROM episodes WHERE id = ?', [id])`)}.`,
				`${name}() params is not an array`
			);
		}
		const values = (params ?? []).map((v) => bindValue(v, name));
		const statements = splitSqlStatements(sql);
		if (statements.length === 0) {
			throw new CommandError(
				`${tick(`${name}()`)} got no SQL to run. Put a statement in the quotes, like ${tick(`${name}('SELECT * FROM series')`)}.`,
				`${name}() with empty SQL`
			);
		}
		const holes = countPlaceholders(statements[0].sql);
		if (holes !== null && holes !== values.length) {
			throw new CommandError(
				holes === 0
					? `${tick(`${name}()`)} got ${values.length === 1 ? 'a value' : 'values'} for ${tick('?')} placeholders, but the SQL has no ${tick('?')} to put ${values.length === 1 ? 'it' : 'them'} in.`
					: `The SQL in ${tick(`${name}()`)} has ${holes} ${tick('?')} ${holes === 1 ? 'placeholder' : 'placeholders'}, but ${values.length} ${values.length === 1 ? 'value was' : 'values were'} given. Each ${tick('?')} needs exactly one value in the list.`,
				`${name}(): ${holes} placeholders, ${values.length} values`
			);
		}
		// Several statements in one string (that's how SQL injection does its damage): run them all.
		let first: ExecResult | undefined;
		let changes = 0;
		let lastId = 0;
		statements.forEach((s, i) => {
			if (spec.dbReadOnly && !setup && WRITE_KEYWORDS.includes(firstKeyword(s.sql))) {
				refuseWrite(s.sql, i === 0 ? values : []);
			}
			const r = query(s.sql, i === 0 ? values : [], cmd === 'get' ? 1 : MAX_ROWS);
			if (!first && r.columns.length > 0) first = r;
			changes += r.changes;
			lastId = r.lastId;
		});
		return first ? { ...first, changes, lastId } : { columns: [], rows: [], changes, lastId };
	}

	const dbApi = Object.freeze({
		all(sql?: unknown, params?: unknown) {
			return dbCall('all', sql, params).rows;
		},
		get(sql?: unknown, params?: unknown) {
			return dbCall('get', sql, params).rows[0];
		},
		run(sql?: unknown, params?: unknown) {
			const r = dbCall('run', sql, params);
			return { changes: r.changes, lastId: r.lastId };
		}
	});

	// ---- security helpers (server globals) ---------------------------------------------------

	function hash(text?: unknown): string {
		if (typeof text !== 'string') {
			throw new CommandError(
				text === undefined
					? `${tick('hash()')} got ${tick('undefined')}, so there is nothing to scramble. Check the spelling of what you passed, like ${tick('hash(req.body.password)')}.`
					: `${tick('hash()')} needs a piece of text, like ${tick('hash(req.body.password)')}.`,
				`hash(${formatValue(text)})`
			);
		}
		return toyHash(text);
	}

	const looksHashed = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

	function hashMatches(text?: unknown, hashed?: unknown): boolean {
		const usage = `${tick('hashMatches()')} needs the text someone typed first and the stored hash second, like ${tick('hashMatches(req.body.password, user.password_hash)')}.`;
		if (looksHashed(text) && typeof hashed === 'string' && !looksHashed(hashed)) {
			throw new CommandError(
				`${usage} It looks like the two are the other way round.`,
				'hashMatches(): arguments swapped'
			);
		}
		if (typeof text !== 'string' || typeof hashed !== 'string') {
			const missing = text === undefined || hashed === undefined;
			throw new CommandError(
				missing
					? `${usage} One of them is ${tick('undefined')}: check the spelling, and that the row was found.`
					: usage,
				`hashMatches(${formatValue(text)}, ${formatValue(hashed)})`
			);
		}
		return toyHash(text) === hashed.trim().toLowerCase();
	}

	function escape(text?: unknown): string {
		if (typeof text === 'number' || typeof text === 'boolean') return String(text);
		if (typeof text !== 'string') {
			throw new CommandError(
				text === undefined || text === null
					? `${tick('escape()')} got ${tick(String(text))}, so there is nothing to make safe. Check the spelling of what you passed, like ${tick('escape(req.body.text)')}.`
					: `${tick('escape()')} makes one piece of text safe to show. Escape each text on its own, like ${tick('escape(comment.text)')}.`,
				`escape(${formatValue(text)})`
			);
		}
		return escapeHtml(text);
	}

	// ---- logging & screen --------------------------------------------------------------------

	function writeLog(where: 'server' | 'client', args: unknown[]) {
		step();
		push(withId({ t: 'log', where, text: formatArgs(args) }));
	}
	const serverLog = (...args: unknown[]) => writeLog('server', args);
	const clientLog = (...args: unknown[]) => writeLog('client', args);
	const logLine = (text: string) => writeLog('server', [text]);

	function addScreen(item: ScreenItem) {
		state.screen.push(item);
		push({ t: 'screen', item });
	}

	/** renderHtml: the phone renders the text; a script in it "runs" (only a log line, never real). */
	function showHtml(item: HtmlScreenItem, id?: number) {
		addScreen(item);
		if (item.scripted) {
			step();
			push(
				id === undefined
					? { t: 'log', where: 'client', text: SCRIPT_RAN }
					: { t: 'log', id, where: 'client', text: SCRIPT_RAN }
			);
		}
	}

	// ---- router ------------------------------------------------------------------------------

	function register(method: Method) {
		const name = `app.${method.toLowerCase()}`;
		return (path?: unknown, handler?: unknown) => {
			const usage = `${tick(`${name}()`)} needs a path like ${tick("'/episodes'")} and a function to run.`;
			if (typeof path !== 'string' || typeof handler !== 'function') {
				throw new CommandError(
					typeof path === 'string' && handler === undefined
						? `${usage} Add the function after the path: ${tick(`${name}('${path}', (req, res) => { … })`)}.`
						: usage,
					`${name}() called with (${typeof path}, ${typeof handler})`
				);
			}
			if (!path.startsWith('/')) {
				throw new CommandError(
					`${usage} The path has to start with ${tick('/')}, like ${tick(`'/${path.replace(/^\/*/, '')}'`)}.`,
					`${name}() path without leading slash`
				);
			}
			if (path.includes('?')) {
				throw new CommandError(
					`Leave the ${tick('?…')} part out of the path in ${tick(`${name}()`)}. Whatever comes after ${tick('?')} in a request ends up in ${tick('req.query')} on its own.`,
					`${name}() path with query string`
				);
			}
			if (routes.length >= MAX_ROUTES) {
				throw new CommandError(
					`That's more than ${MAX_ROUTES} routes. Is ${tick(`${name}()`)} inside a loop that never ends?`,
					'too many routes'
				);
			}
			routes.push({
				method,
				pattern: path,
				segments: segmentsOf(path),
				handler: handler as Route['handler']
			});
		};
	}

	const app = Object.freeze({
		get: register('GET'),
		post: register('POST'),
		put: register('PUT'),
		delete: register('DELETE')
	});

	function respond(
		r: Omit<SimResponse, 'body'> & { body: unknown },
		autoScreen: boolean
	): SimResponse {
		state.responses.push(r);
		push({ t: 'response', id: r.id, status: r.status, body: r.body });
		if (autoScreen) {
			const html =
				spec.renderHtml && r.status >= 200 && r.status < 300 ? htmlScreenItem(r.body) : null;
			if (html) showHtml(html, r.id);
			else addScreen(screenItemFor(r.status, r.body));
		}
		return r;
	}

	/** Sends one request through phone → server → database → phone. */
	function dispatch(request: SimRequest, id: number, autoScreen = false): SimResponse {
		step();
		const method = String(request.method).toUpperCase() as Method;
		const path = request.path;
		const reqEvent: Extract<TraceEvent, { t: 'request' }> = { t: 'request', id, method, path };
		if (request.body !== undefined) reqEvent.body = jsonCopy(request.body);
		if (request.label) reqEvent.label = request.label;
		if (spec.plainHttp) reqEvent.label = (reqEvent.label ? reqEvent.label + ' · ' : '') + 'http';
		push(reqEvent);

		const done = (status: number, body: unknown, route: string | null) =>
			respond({ id, method, path, status, body, route }, autoScreen);

		if (spec.serverDown) {
			const r = respond(
				{ id, method, path, status: 0, body: { ...SERVER_DOWN_BODY }, route: null },
				false
			);
			addScreen({ kind: 'error', status: 0, text: SERVER_DOWN_BODY.error });
			return r;
		}

		const q = path.indexOf('?');
		const pathname = (q < 0 ? path : path.slice(0, q)).split('#')[0];
		const query = q < 0 ? {} : parseQuery(path.slice(q + 1).split('#')[0]);
		const segments = segmentsOf(pathname);
		const where = `${method} ${pathname}`;

		let route: Route | undefined;
		let params: Record<string, string> = {};
		for (const r of routes) {
			if (r.method !== method) continue;
			const m = matchRoute(r.segments, segments);
			if (m) {
				route = r;
				params = m;
				break;
			}
		}
		if (!route) {
			push({ t: 'route', id, pattern: null });
			return done(404, { error: `Not found: ${where}` }, null);
		}
		push({ t: 'route', id, pattern: route.pattern });

		const headers: Record<string, string> = {};
		for (const [k, v] of Object.entries(request.headers ?? {}))
			headers[k.toLowerCase()] = String(v);
		const req = {
			method,
			path: pathname,
			params,
			query,
			body: request.body === undefined ? undefined : jsonCopy(request.body),
			headers
		};

		let sent: { status: number; body: unknown } | null = null;
		let status = 200;
		/** The answer has gone back to the phone: later sends (after an `await`) change nothing. */
		let closed = false;
		const send = (body: unknown) => {
			if (closed) return;
			if (sent) {
				logLine(
					`Warning: the handler for ${where} tried to send a second response. Only the first one counts.`
				);
				return;
			}
			sent = { status, body };
		};
		const res = Object.freeze({
			status(code?: unknown) {
				if (typeof code !== 'number' || !Number.isInteger(code) || code < 100 || code > 599) {
					throw new CommandError(
						`${tick('res.status()')} needs a status code number, like ${tick('res.status(404)')}.`,
						`res.status(${formatValue(code)})`
					);
				}
				status = code;
				return res;
			},
			json(value?: unknown) {
				let body: unknown;
				try {
					body = jsonCopy(value);
				} catch {
					throw new CommandError(
						`${tick('res.json()')} couldn't turn this value into JSON. Send plain values: text, numbers, lists and objects.`,
						'res.json(): value is not JSON-serializable'
					);
				}
				send(body);
				return res;
			},
			send(value?: unknown) {
				if (typeof value === 'string') send(value);
				else if (value === undefined || value === null) send('');
				else if (typeof value === 'object') return res.json(value);
				else send(String(value));
				return res;
			},
			end() {
				send('');
				return res;
			}
		});

		current = id;
		let isAsync = false;
		try {
			const ret = route.handler(req, res);
			if (ret && typeof (ret as Promise<unknown>).then === 'function') {
				isAsync = true;
				(ret as Promise<unknown>).then(undefined, () => {});
			}
		} catch (e) {
			if (base.halted) throw base.halted;
			if (e instanceof WorldHalt) throw e;
			logLine(`Error in ${where}: ${errorText(e)}`);
			if (!sent) sent = { status: 500, body: { ...SERVER_ERROR_BODY } };
		} finally {
			current = undefined;
		}
		if (base.halted) throw base.halted;
		if (!sent) {
			current = id;
			try {
				logLine(
					`The handler for ${where} finished without sending a response.` +
						(isAsync
							? ` It's an ${tick('async')} function, and in this simulation the database answers straight away, so there's nothing to wait for. Leave out ${tick('async')} and ${tick('await')}.`
							: '')
				);
			} finally {
				current = undefined;
			}
			sent = { status: 500, body: { ...SERVER_ERROR_BODY } };
		}
		closed = true;
		const final = sent as { status: number; body: unknown };
		return done(final.status, final.body, route.pattern);
	}

	// ---- server code from the lesson ---------------------------------------------------------

	const env = Object.freeze({ ...(spec.env ?? {}) });
	const serverConsole = Object.freeze({
		log: serverLog,
		info: serverLog,
		warn: serverLog,
		error: serverLog,
		debug: serverLog
	});

	if (spec.serverCode) {
		setup = true;
		try {
			new Function(
				'app',
				'db',
				'log',
				'env',
				'console',
				'hash',
				'hashMatches',
				'escape',
				`"use strict";\n${spec.serverCode}`
			)(app, dbApi, serverLog, env, serverConsole, hash, hashMatches, escape);
		} catch (e) {
			db.close();
			throw new SpecError(`serverCode failed: ${errorText(e)}`);
		} finally {
			setup = false;
		}
	}

	// ---- client commands ---------------------------------------------------------------------

	function makeResponse(r: SimResponse) {
		const body = r.body === undefined ? undefined : jsonCopy(r.body);
		return Object.freeze({
			status: r.status,
			ok: r.status >= 200 && r.status < 300,
			body,
			headers: Object.freeze({
				'content-type': typeof body === 'string' ? 'text/plain' : 'application/json'
			}),
			json: () => body,
			text: () => (typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body))
		});
	}

	function clientCall(
		method: Method,
		name: string,
		path: unknown,
		body: unknown,
		options: unknown
	) {
		if (typeof path !== 'string' || !path.startsWith('/')) {
			const fullUrl = typeof path === 'string' && /^https?:\/\//i.test(path);
			throw new CommandError(
				fullUrl
					? `In this app the server's address is already known, so ${tick(`${name}()`)} only needs the path, the part that starts with ${tick('/')}, like ${tick(`${name}('/episodes')`)}.`
					: `${tick(`${name}()`)} needs a path in quotes that starts with ${tick('/')}, like ${tick(`${name}('/episodes')`)}.`,
				`${name}() called with ${formatValue(path)}`
			);
		}
		if (body !== undefined) {
			try {
				body = jsonCopy(body);
			} catch {
				throw new CommandError(
					`${tick(`${name}()`)} couldn't turn the body into JSON. Send plain values: text, numbers, lists and objects.`,
					`${name}(): body is not JSON-serializable`
				);
			}
		}
		const headers =
			typeof options === 'object' && options !== null
				? ((options as { headers?: Record<string, string> }).headers ?? undefined)
				: undefined;
		const request: SimRequest = { method, path };
		if (body !== undefined) request.body = body;
		if (headers) request.headers = { ...headers };
		return makeResponse(dispatch(request, nextClientId++));
	}

	function show(...args: unknown[]) {
		step();
		if (state.screen.length >= MAX_SCREEN_ITEMS) {
			base.trace.push({ t: 'stopped', reason: 'max-steps' });
			base.halt(
				new WorldHalt('max-steps', SCREEN_FULL, `More than ${MAX_SCREEN_ITEMS} screen items`)
			);
		}
		const value = args[0];
		if (spec.renderHtml && typeof value !== 'function') {
			let html: HtmlScreenItem | null = null;
			try {
				html = htmlScreenItem(typeof value === 'string' ? value : jsonCopy(value));
			} catch {
				// not JSON: the error below explains it
			}
			if (html) return showHtml(html);
		}
		if (typeof value === 'string') return addScreen({ kind: 'text', text: value });
		if (value === undefined) return addScreen({ kind: 'text', text: 'undefined' });
		if (typeof value === 'function') {
			throw new CommandError(
				`${tick('show()')} got a command instead of a value. Did you forget the round brackets? Write ${tick('show(res.json())')}, not ${tick('show(res.json)')}.`,
				'show(): value is a function'
			);
		}
		let copy: unknown;
		try {
			copy = jsonCopy(value);
		} catch {
			throw new CommandError(
				`${tick('show()')} can't put this value on the screen. Show text, numbers, lists or objects.`,
				'show(): value is not JSON-serializable'
			);
		}
		addScreen({ kind: 'json', value: copy });
	}

	// ---- per role ----------------------------------------------------------------------------

	let api: Record<string, ApiFunction> = {};
	let variables: Record<string, unknown> = {};
	let log: (...args: unknown[]) => void = serverLog;
	if (role === 'server') {
		api = {
			log: serverLog,
			hash: hash as ApiFunction,
			hashMatches: hashMatches as ApiFunction,
			escape: escape as ApiFunction
		};
		variables = { app, db: dbApi, env };
	} else if (role === 'client') {
		api = {
			get: (path?: unknown, options?: unknown) =>
				clientCall('GET', 'get', path, undefined, options),
			post: (path?: unknown, body?: unknown, options?: unknown) =>
				clientCall('POST', 'post', path, body, options),
			put: (path?: unknown, body?: unknown, options?: unknown) =>
				clientCall('PUT', 'put', path, body, options),
			del: (path?: unknown, options?: unknown) =>
				clientCall('DELETE', 'del', path, undefined, options),
			show,
			log: clientLog
		};
		log = clientLog;
	}

	function fireRequests() {
		(spec.requests ?? []).forEach((r, i) => dispatch(r, i, true));
	}

	function runSql(code: string) {
		const statements = splitSqlStatements(code);
		if (statements.length === 0) {
			throw new CommandError(
				`There's no SQL to run yet. Write a statement, like ${tick('SELECT * FROM series;')}`,
				'empty SQL'
			);
		}
		for (const s of statements) {
			const r = query(s.sql, [], MAX_ROWS, s.line);
			if (r.columns.length > 0) state.sqlResult = { columns: r.columns, rows: r.rows };
		}
	}

	// ---- finish ------------------------------------------------------------------------------

	function resultSet(sql: string): SqlResultSet {
		let last: SqlResultSet = { columns: [], rows: [] };
		try {
			for (const s of splitSqlStatements(sql)) {
				const r = execOne(s.sql, []);
				if (r.columns.length > 0) last = { columns: r.columns, rows: r.rows };
			}
		} catch (e) {
			return { columns: [], rows: [], error: String((e as Error)?.message ?? e) };
		}
		return last;
	}

	let finished: { web: WebResult } | undefined;
	function finish(): { web: WebResult } {
		if (finished) return finished;
		const web: WebResult = {
			responses: state.responses,
			tables: {},
			screen: state.screen,
			queryCount: state.queryCount
		};
		if (state.sqlResult) web.sqlResult = state.sqlResult;
		try {
			if (deps.verifySql) web.verification = deps.verifySql.map((sql) => resultSet(sql));
			for (const t of schemaInfo().tables) {
				const r = resultSet(`SELECT * FROM "${t.replace(/"/g, '""')}" LIMIT ${SNAPSHOT_ROWS}`);
				web.tables[t] = { columns: r.columns, rows: r.rows };
			}
		} catch {
			// a broken database still gives a result
		}
		try {
			db.close();
		} catch {
			// already closed
		}
		finished = { web };
		return finished;
	}

	const world: WebWorld = {
		kind: 'web',
		api,
		variables,
		log,
		state,
		trace: base.trace,
		output: base.output,
		get steps() {
			return base.steps;
		},
		get halted() {
			return base.halted;
		},
		aliases: WEB_ALIASES[role],
		objectMethods: WEB_OBJECT_METHODS[role],
		dispatch: (request, id) => dispatch(request, id, role !== 'client'),
		finish
	};
	if (role === 'server') world.afterProgram = fireRequests;
	if (role === 'sql') {
		world.executeSource = runSql;
		if (spec.requests?.length) world.afterProgram = fireRequests;
	}
	return world;
}
