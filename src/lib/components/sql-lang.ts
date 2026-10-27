/**
 * A small SQL highlighter for the editor (there is no @codemirror/lang-sql in this project).
 * Keywords, functions, strings, numbers, comments and operators: enough for SQLite lessons.
 */
import { StreamLanguage, type StreamParser } from '@codemirror/language';

const KEYWORDS = new Set(
	`select from where and or not in is null like between order by asc desc limit offset insert into
	values update set delete create table drop alter add column primary key foreign references
	unique default join inner left right outer cross on as group having distinct union all case
	when then else end exists if integer text real blob numeric boolean autoincrement check
	constraint index view begin commit rollback transaction collate nocase returning glob escape`
		.split(/\s+/)
		.filter(Boolean)
);

const ATOMS = new Set([
	'null',
	'true',
	'false',
	'current_date',
	'current_time',
	'current_timestamp'
]);

const FUNCTIONS = new Set(
	`count sum avg min max length lower upper substr trim round abs coalesce ifnull date time
	datetime strftime random replace instr group_concat total typeof printf`
		.split(/\s+/)
		.filter(Boolean)
);

interface SqlState {
	inBlockComment: boolean;
}

export const sqlParser: StreamParser<SqlState> = {
	name: 'sql',
	startState: () => ({ inBlockComment: false }),
	token(stream, state) {
		if (state.inBlockComment) {
			if (stream.skipTo('*/')) {
				stream.next();
				stream.next();
				state.inBlockComment = false;
			} else stream.skipToEnd();
			return 'comment';
		}
		if (stream.eatSpace()) return null;
		if (stream.match('--')) {
			stream.skipToEnd();
			return 'comment';
		}
		if (stream.match('/*')) {
			state.inBlockComment = true;
			return 'comment';
		}
		const ch = stream.peek();
		if (ch === "'" || ch === '"' || ch === '`') {
			const quote = stream.next()!;
			let escaped = false;
			let c: string | void;
			while ((c = stream.next()) !== undefined) {
				if (c === quote && !escaped) {
					// '' inside a string is an escaped quote in SQL
					if (stream.peek() === quote) {
						stream.next();
						continue;
					}
					break;
				}
				escaped = false;
			}
			return quote === "'" ? 'string' : 'variableName';
		}
		if (stream.match(/^\d+(\.\d+)?/)) return 'number';
		if (stream.match(/^[?]/)) return 'atom';
		if (stream.match(/^(<>|!=|<=|>=|==|\|\||[=<>+\-*/%])/)) return 'operator';
		if (stream.match(/^[(),;.]/)) return 'punctuation';
		if (stream.match(/^[A-Za-z_][\w$]*/)) {
			const word = stream.current().toLowerCase();
			if (KEYWORDS.has(word)) return 'keyword';
			if (ATOMS.has(word)) return 'atom';
			if (FUNCTIONS.has(word) && stream.peek() === '(') return 'variableName.function';
			return 'variableName';
		}
		stream.next();
		return null;
	},
	languageData: {
		commentTokens: { line: '--', block: { open: '/*', close: '*/' } },
		closeBrackets: { brackets: ['(', "'", '"'] }
	}
};

export const sqlLanguage = StreamLanguage.define(sqlParser);
