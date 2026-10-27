/**
 * Pure helpers for WebWorld.svelte: status codes in plain words, a peek at the schema before the
 * first run, and turning JSON bodies into friendly cards. No DOM here, so it is unit-tested.
 */
import type { SqlResultSet } from '#lib/engine/types.ts';

export type StatusFamily = 'ok' | 'redirect' | 'client' | 'server' | 'none';

export function statusFamily(status: number): StatusFamily {
	if (!status) return 'none';
	if (status >= 200 && status < 300) return 'ok';
	if (status >= 300 && status < 400) return 'redirect';
	if (status >= 400 && status < 500) return 'client';
	return 'server';
}

const STATUS_TEXT: Record<number, string> = {
	200: 'OK',
	201: 'Created',
	204: 'No content',
	301: 'Moved',
	302: 'Found elsewhere',
	304: 'Not changed',
	400: 'Bad request',
	401: 'Who are you?',
	403: 'Not allowed',
	404: 'Not found',
	405: 'Wrong method',
	409: 'Conflict',
	422: 'Can’t use that',
	429: 'Too many',
	500: 'Server error',
	502: 'Bad gateway',
	503: 'Unavailable'
};

/** "200 OK", "404 Not found", "no connection" for status 0. */
export function statusLabel(status: number): string {
	if (!status) return 'no connection';
	const text = STATUS_TEXT[status];
	return text ? `${status} ${text}` : String(status);
}

export interface SchemaTable {
	name: string;
	columns: string[];
}

const NOT_COLUMNS = /^(primary|foreign|unique|check|constraint)$/i;

/**
 * Table names and column names from `CREATE TABLE` statements, for the database panel before the
 * first run. Rough on purpose: good enough for the simple schemas the lessons use.
 */
export function tablesFromSchema(schema: string | undefined): SchemaTable[] {
	if (!schema) return [];
	const out: SchemaTable[] = [];
	const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?["`[]?(\w+)["`\]]?\s*\(/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(schema))) {
		// Find the matching closing bracket.
		let depth = 1;
		let i = re.lastIndex;
		const start = i;
		while (i < schema.length && depth > 0) {
			if (schema[i] === '(') depth++;
			else if (schema[i] === ')') depth--;
			i++;
		}
		const inner = schema.slice(start, i - 1);
		const columns: string[] = [];
		let part = '';
		depth = 0;
		for (const ch of inner + ',') {
			if (ch === '(') depth++;
			if (ch === ')') depth--;
			if (ch === ',' && depth === 0) {
				const name = part.trim().match(/^["`[]?(\w+)/)?.[1];
				if (name && !NOT_COLUMNS.test(name)) columns.push(name);
				part = '';
			} else part += ch;
		}
		if (!out.some((t) => t.name === m![1])) out.push({ name: m[1], columns });
		re.lastIndex = i;
	}
	return out;
}

/** Placeholder table snapshots (columns, no rows) from the schema. */
export function emptyTables(schema: string | undefined): Record<string, SqlResultSet> {
	const out: Record<string, SqlResultSet> = {};
	for (const t of tablesFromSchema(schema)) out[t.name] = { columns: t.columns, rows: [] };
	return out;
}

/** The table a query talks to, for highlighting it in the database panel. */
export function tableOfQuery(sql: string): string | null {
	const m = /\b(?:from|into|update|join|table)\s+["`[]?(\w+)/i.exec(sql);
	return m ? m[1] : null;
}

/** First keyword of a statement, e.g. "SELECT". */
export function sqlVerb(sql: string): string {
	const m = /^\s*(?:--[^\n]*\n\s*)*(\w+)/.exec(sql);
	return m ? m[1].toUpperCase() : 'SQL';
}

/** A cell value written for humans. */
export function cellText(v: unknown): string {
	if (v === null || v === undefined) return '—';
	if (typeof v === 'string') return v;
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	try {
		const s = JSON.stringify(v);
		return s.length > 80 ? s.slice(0, 77) + '…' : s;
	} catch {
		return String(v);
	}
}

export interface Card {
	/** Shown big at the top when the object has a title or name */
	heading?: string;
	rows: [string, string][];
}

export type ScreenView =
	| { kind: 'text'; text: string }
	| { kind: 'cards'; cards: Card[]; more: number }
	| { kind: 'list'; items: string[]; more: number };

const HEADING_KEYS = ['title', 'name', 'text'];
const MAX_CARDS = 30;

function toCard(obj: Record<string, unknown>): Card {
	const key = HEADING_KEYS.find((k) => typeof obj[k] === 'string' && obj[k] !== '');
	const rows: [string, string][] = [];
	for (const [k, v] of Object.entries(obj)) {
		if (k === key) continue;
		rows.push([k, cellText(v)]);
	}
	return key ? { heading: String(obj[key]), rows } : { rows };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);

/** How a JSON value looks on the phone: a list of cards, one card, a list, or plain text. */
export function viewOfJson(value: unknown): ScreenView {
	if (Array.isArray(value)) {
		if (value.length && value.every(isPlainObject)) {
			return {
				kind: 'cards',
				cards: value.slice(0, MAX_CARDS).map(toCard),
				more: Math.max(0, value.length - MAX_CARDS)
			};
		}
		return {
			kind: 'list',
			items: value.slice(0, MAX_CARDS).map(cellText),
			more: Math.max(0, value.length - MAX_CARDS)
		};
	}
	if (isPlainObject(value)) return { kind: 'cards', cards: [toCard(value)], more: 0 };
	return { kind: 'text', text: cellText(value) };
}

const ENTITIES: Record<string, string> = {
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
	'&#x27;': "'",
	'&nbsp;': ' ',
	'&amp;': '&'
};

/**
 * What a phone that renders HTML would show for `raw`, as plain text: scripts and styles vanish
 * (they run, they aren't shown), other tags are dropped, entities turn back into characters
 * (so escaped text like `&lt;script&gt;` shows up as harmless `<script>` text). The UI puts the
 * result in a text node: nothing here is ever injected as HTML.
 */
export function htmlToText(raw: string): string {
	return String(raw ?? '')
		.replace(/<(script|style)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/?[a-z][^>]*>/gi, '')
		.replace(/&(lt|gt|quot|#39|#x27|nbsp|amp);/g, (m) => ENTITIES[m] ?? m)
		.trim();
}
