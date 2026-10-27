/**
 * SQL helpers for the web world: a small tokenizer (statement splitting, placeholder counting)
 * and the mapping from raw SQLite error messages to warm, specific learner-facing ones.
 * Pure TS — no sql.js import here, so it runs anywhere.
 */
import { CommandError } from './core.ts';
import { closestName } from './errors.ts';

const tick = (s: string) => '`' + s + '`';

/** Keywords a beginner meets in this track (used for "did you mean" on syntax errors). */
export const SQL_KEYWORDS = [
	'SELECT',
	'FROM',
	'WHERE',
	'ORDER',
	'BY',
	'LIMIT',
	'OFFSET',
	'INSERT',
	'INTO',
	'VALUES',
	'UPDATE',
	'SET',
	'DELETE',
	'JOIN',
	'LEFT',
	'INNER',
	'ON',
	'GROUP',
	'HAVING',
	'COUNT',
	'AND',
	'OR',
	'NOT',
	'NULL',
	'IS',
	'LIKE',
	'IN',
	'AS',
	'ASC',
	'DESC',
	'DISTINCT',
	'CREATE',
	'TABLE',
	'DROP',
	'PRIMARY',
	'KEY',
	'INTEGER',
	'TEXT',
	'DEFAULT'
];

const SQL_FUNCTIONS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'LOWER', 'UPPER', 'LENGTH', 'ROUND'];

/**
 * A database query failed. `message` (and `friendly`) is the learner-facing text, so a handler
 * that catches it and logs `e.message` shows the friendly version; `raw` keeps SQLite's own words.
 */
export class SqlError extends CommandError {
	readonly raw: string;
	readonly line?: number;
	constructor(friendly: string, raw: string, line?: number) {
		super(friendly, friendly);
		this.name = 'SqlError';
		this.raw = raw;
		this.line = line;
	}
}

// ---------------------------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------------------------

type Mode = 'code' | 'line' | 'block' | "'" | '"' | '`' | '[';

/**
 * Walks SQL text and calls `onCode(char, index)` for every character that is real code
 * (not inside a string, quoted name or comment; opening quotes are reported). `onString`
 * gets the content of every complete '…' string literal.
 */
function scanSql(
	sql: string,
	onCode: (c: string, i: number) => void,
	onString?: (text: string) => void
): void {
	let mode: Mode = 'code';
	let str = '';
	for (let i = 0; i < sql.length; i++) {
		const c = sql[i];
		const next = sql[i + 1];
		switch (mode) {
			case 'code':
				if (c === '-' && next === '-') {
					mode = 'line';
					i++;
				} else if (c === '/' && next === '*') {
					mode = 'block';
					i++;
				} else {
					if (c === "'" || c === '"' || c === '`' || c === '[') {
						mode = c;
						str = '';
					}
					onCode(c, i);
				}
				break;
			case 'line':
				if (c === '\n') mode = 'code';
				break;
			case 'block':
				if (c === '*' && next === '/') {
					mode = 'code';
					i++;
				}
				break;
			case '[':
				if (c === ']') mode = 'code';
				break;
			default:
				// '…' strings and "…" / `…` names: a doubled quote is an escaped quote
				if (c === mode && next === mode) {
					str += c;
					i++;
				} else if (c === mode) {
					if (mode === "'") onString?.(str);
					mode = 'code';
				} else str += c;
		}
	}
}

export interface SqlStatement {
	/** The statement text (comments kept, no trailing `;`) */
	sql: string;
	/** 1-based line of the statement's first real character in the whole source */
	line: number;
}

/**
 * Splits SQL source into statements at `;` — but not at a `;` inside a string, a quoted name or
 * a comment. Statements that are only whitespace and comments are dropped.
 */
export function splitSqlStatements(source: string): SqlStatement[] {
	const out: SqlStatement[] = [];
	let start = 0;
	let firstCode = -1;
	// Line numbers counted incrementally: re-scanning from the start each time is quadratic.
	let line = 1;
	let counted = 0;
	const lineAt = (i: number) => {
		for (; counted < i; counted++) if (source.charCodeAt(counted) === 10) line++;
		return line;
	};
	const push = (end: number) => {
		if (firstCode >= 0) out.push({ sql: source.slice(start, end).trim(), line: lineAt(firstCode) });
		start = end + 1;
		firstCode = -1;
	};
	scanSql(source, (c, i) => {
		if (c === ';') push(i);
		else if (firstCode < 0 && !/\s/.test(c)) firstCode = i;
	});
	push(source.length);
	return out;
}

/** Number of `?` placeholders outside strings and comments; null if numbered/named ones are used. */
export function countPlaceholders(sql: string): number | null {
	let n = 0;
	let other = false;
	scanSql(sql, (c, i) => {
		if (c === '?') {
			if (/\d/.test(sql[i + 1] ?? '')) other = true;
			else n++;
		} else if ((c === ':' || c === '@' || c === '$') && /[A-Za-z_]/.test(sql[i + 1] ?? '')) {
			other = true;
		}
	});
	return other ? null : n;
}

/** The SQL with comments removed and every string or quoted name reduced to a space. */
export function sqlCodeOnly(sql: string): string {
	let code = '';
	scanSql(sql, (c) => {
		code += c === "'" || c === '"' || c === '`' || c === '[' ? ' ' : c;
	});
	return code;
}

/** Bare words outside strings and comments. */
function codeWords(sql: string): string[] {
	return sqlCodeOnly(sql).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
}

/** The text inside every '…' string literal of a statement. */
export function sqlStringLiterals(sql: string): string[] {
	const out: string[] = [];
	scanSql(
		sql,
		() => {},
		(s) => out.push(s)
	);
	return out;
}

// ---------------------------------------------------------------------------------------------
// Friendly errors
// ---------------------------------------------------------------------------------------------

export interface SqlErrorContext {
	/** The statement that failed */
	sql: string;
	/** User tables in the database */
	tables: string[];
	/** Columns per table */
	columns: Record<string, string[]>;
}

const list = (names: string[]) =>
	names.length === 0
		? ''
		: names.length === 1
			? tick(names[0])
			: names.slice(0, -1).map(tick).join(', ') + ' and ' + tick(names[names.length - 1]);

/** A misspelled keyword anywhere in the statement, e.g. `LIMT` → `LIMIT`. */
function keywordTypoIn(sql: string, ctx: SqlErrorContext): [string, string] | undefined {
	const known = new Set(
		[...ctx.tables, ...Object.values(ctx.columns).flat(), ...SQL_KEYWORDS, ...SQL_FUNCTIONS].map(
			(w) => w.toLowerCase()
		)
	);
	for (const w of codeWords(sql)) {
		if (known.has(w.toLowerCase()) || w.length < 3) continue;
		const k = closestName(w.toUpperCase(), SQL_KEYWORDS);
		if (k && k.toLowerCase() !== w.toLowerCase()) return [w, k];
	}
	return undefined;
}

/** Tables mentioned in a statement (only ones that exist). */
function tablesUsed(sql: string, ctx: SqlErrorContext): string[] {
	const words = new Set(codeWords(sql).map((w) => w.toLowerCase()));
	return ctx.tables.filter((t) => words.has(t.toLowerCase()));
}

/** Turns a raw SQLite error message into a friendly, specific one. */
export function friendlySqlMessage(raw: string, ctx: SqlErrorContext): string {
	const msg = raw.replace(/^Error:\s*/, '').trim();

	// near "selec": syntax error
	const near = msg.match(/^near "([^"]*)": syntax error/);
	if (near) {
		const word = near[1];
		const isWord = /^[A-Za-z_][A-Za-z0-9_]*$/.test(word);
		const isKeyword = SQL_KEYWORDS.includes(word.toUpperCase());
		if (isWord && !isKeyword) {
			const k = closestName(word.toUpperCase(), SQL_KEYWORDS);
			if (k) return `SQLite didn't understand ${tick(word)}. Did you mean ${tick(k)}?`;
		}
		const typo = keywordTypoIn(ctx.sql, ctx);
		if (typo) return `SQLite didn't understand ${tick(typo[0])}. Did you mean ${tick(typo[1])}?`;
		if (isKeyword) {
			return `SQLite got confused just before ${tick(word)}. Check the words in front of it: maybe something is missing (like a comma or a column name), or the words are in the wrong order.`;
		}
		return `SQLite didn't understand the statement near ${tick(word)}. Check for a typo, a missing comma or quote, or a word in the wrong place.`;
	}

	if (/^incomplete input/.test(msg)) {
		return 'The statement seems unfinished. Maybe something is missing at the end, or a closing quote or bracket.';
	}

	const unrecognized = msg.match(/^unrecognized token: "(.*)"$/);
	if (unrecognized) {
		const tok = unrecognized[1];
		if (tok.startsWith("'")) {
			return `A piece of text is missing its closing quote. In SQL, text goes between single quotes at both ends, like ${tick("'Moonlit Deliveries'")}.`;
		}
		return `SQLite doesn't understand ${tick(tok)}. Delete anything unusual and type it again.`;
	}

	const noTable = msg.match(/^no such table: (?:main\.)?(.+)$/);
	if (noTable) {
		const t = noTable[1];
		if (ctx.tables.length === 0) {
			return `There's no table called ${tick(t)}. In fact the database has no tables yet.`;
		}
		const s = closestName(t, ctx.tables);
		return (
			`There's no table called ${tick(t)}.` +
			(s ? ` Did you mean ${tick(s)}?` : '') +
			` The tables are ${list(ctx.tables)}.`
		);
	}

	const noColumn = msg.match(/^no such column: (.+)$/);
	if (noColumn) {
		const full = noColumn[1];
		const col = full.includes('.') ? full.slice(full.lastIndexOf('.') + 1) : full;
		const used = tablesUsed(ctx.sql, ctx);
		const pool = used.length ? used : ctx.tables;
		const columns = [...new Set(pool.flatMap((t) => ctx.columns[t] ?? []))];
		const s = closestName(col, columns);
		let text = `There's no column called ${tick(full)}.`;
		if (s) text += ` Did you mean ${tick(s)}?`;
		if (used.length === 1 && ctx.columns[used[0]]) {
			text += ` The columns in ${tick(used[0])} are ${list(ctx.columns[used[0]])}.`;
		} else if (!s && /^[A-Za-z]/.test(col)) {
			text += ` If you meant a piece of text, put it in single quotes: ${tick(`'${col}'`)}.`;
		}
		return text;
	}

	const notNull = msg.match(/^NOT NULL constraint failed: ([\w]+)\.([\w]+)/);
	if (notNull) {
		return `Every row in ${tick(notNull[1])} needs a value for ${tick(notNull[2])}.`;
	}

	const unique = msg.match(/^UNIQUE constraint failed: ([\w]+)\.([\w]+)/);
	if (unique) {
		return `There's already a row in ${tick(unique[1])} with that ${tick(unique[2])}. Each ${tick(unique[2])} can only be used once.`;
	}
	if (/^UNIQUE constraint failed/.test(msg)) {
		return "There's already a row with that value, and this table only allows each one once.";
	}

	const countMismatch = msg.match(/^table (\w+) has (\d+) columns but (\d+) values were supplied/);
	if (countMismatch) {
		const [, t, cols, vals] = countMismatch;
		return `${tick(t)} has ${cols} columns, but you gave ${vals} ${vals === '1' ? 'value' : 'values'}. Name the columns you're filling in, like ${tick(`INSERT INTO ${t} (${(ctx.columns[t] ?? ['a', 'b']).slice(1, 3).join(', ')}) VALUES (…)`)}.`;
	}
	const valuesFor = msg.match(/^(\d+) values for (\d+) columns/);
	if (valuesFor) {
		return `You listed ${valuesFor[2]} columns but gave ${valuesFor[1]} values. Each column needs exactly one value, in the same order.`;
	}

	const exists = msg.match(/^table (\w+) already exists/);
	if (exists) return `There's already a table called ${tick(exists[1])}.`;

	const noFn = msg.match(/^no such function: (\w+)/);
	if (noFn) {
		const s = closestName(noFn[1].toUpperCase(), SQL_FUNCTIONS);
		return (
			`SQLite doesn't have a function called ${tick(noFn[1])}.` +
			(s ? ` Did you mean ${tick(s)}?` : '')
		);
	}

	const ambiguous = msg.match(/^ambiguous column name: (\w+)/);
	if (ambiguous) {
		const c = ambiguous[1];
		const owners = tablesUsed(ctx.sql, ctx).filter((t) => ctx.columns[t]?.includes(c));
		return `${tick(c)} is a column in more than one of the tables here. Say which one you mean, like ${tick(`${owners[0] ?? 'episodes'}.${c}`)}.`;
	}

	if (/^misuse of aggregate/.test(msg)) {
		return `${tick('COUNT')}, ${tick('SUM')} and friends can't go in ${tick('WHERE')}. To filter on them, use ${tick('HAVING')} after ${tick('GROUP BY')}.`;
	}

	if (/datatype mismatch/.test(msg)) {
		return "A value doesn't fit its column, for example text in a column that only takes whole numbers.";
	}

	return `The database said: ${msg}`;
}
