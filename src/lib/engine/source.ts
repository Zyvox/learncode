/**
 * Tiny lexical helpers over learner source. Not a parser: good enough for beginner code
 * (comments, '…', "…" and `…` strings; regex literals are not recognised).
 * Both helpers keep every newline so line numbers stay the same.
 */

type Mode = 'code' | 'line' | 'block' | "'" | '"' | '`';

function scan(code: string, blankComments: boolean, blankStrings: boolean): string {
	let out = '';
	let mode: Mode = 'code';
	for (let i = 0; i < code.length; i++) {
		const c = code[i];
		const next = code[i + 1];
		const blank = (ch: string) => (ch === '\n' || ch === '\r' ? ch : ' ');
		switch (mode) {
			case 'code':
				if (c === '/' && next === '/') {
					mode = 'line';
					out += blankComments ? '  ' : '//';
					i++;
				} else if (c === '/' && next === '*') {
					mode = 'block';
					out += blankComments ? '  ' : '/*';
					i++;
				} else {
					if (c === "'" || c === '"' || c === '`') mode = c;
					out += c;
				}
				break;
			case 'line':
				if (c === '\n' || c === '\r') {
					mode = 'code';
					out += c;
				} else out += blankComments ? ' ' : c;
				break;
			case 'block':
				if (c === '*' && next === '/') {
					mode = 'code';
					out += blankComments ? '  ' : '*/';
					i++;
				} else out += blankComments ? blank(c) : c;
				break;
			default:
				// inside a string
				if (c === '\\' && next !== undefined) {
					out += blankStrings ? blank(c) + blank(next) : c + next;
					i++;
				} else if (c === mode) {
					mode = 'code';
					out += c;
				} else if ((c === '\n' || c === '\r') && mode !== '`') {
					// unterminated '…' / "…" string: stop at the end of the line
					mode = 'code';
					out += c;
				} else out += blankStrings ? blank(c) : c;
		}
	}
	return out;
}

/** Replaces comments with spaces (newlines kept). Strings are left alone. */
export function stripComments(code: string): string {
	return scan(code, true, false);
}

/** Replaces the inside of string literals with spaces (quotes and newlines kept). */
export function maskStrings(code: string): string {
	return scan(code, false, true);
}

/** Blanks both comments and string contents: only real code is left. */
export function codeOnly(code: string): string {
	return scan(code, true, true);
}
