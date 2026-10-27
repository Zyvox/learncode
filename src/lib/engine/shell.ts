/**
 * A tiny command-line reader for the git world's shell: splits a line into words the way a
 * real shell does (double and single quotes, backslash escapes, `#` comments) and picks out a
 * `>` / `>>` redirection. No variables, globbing, pipes or `&&`: one command per line.
 * Pure TS — runs in the worker, in Node tests and on the main thread.
 */

export interface Redirect {
	/** `>` replaces the file, `>>` adds to the end of it */
	op: '>' | '>>';
	target: string;
}

export interface Tokens {
	/** The words, quotes removed: `echo "hi there"` → ['echo', 'hi there'] */
	args: string[];
	redirect: Redirect | null;
	/** Set when the line can't be read (unclosed quote, `>` with no file, `&&` …). Learner-facing. */
	error?: string;
}

export interface ShellLine {
	/** 1-based line number in the source */
	line: number;
	/** The line as written, trimmed */
	text: string;
}

const tick = (s: string) => '`' + s + '`';

/** Characters that mean "another command" in a real shell; this one runs one per line. */
const CHAINS = ['&&', '||', ';', '|'];

/**
 * Splits one command line into words. Quotes group words and are removed; `\"` inside double
 * quotes and `\x` outside quotes give the character itself; single quotes keep everything as
 * written. An unquoted `#` at the start of a word starts a comment. A leading `$ ` (copied from
 * a tutorial prompt) is ignored.
 */
export function tokenize(line: string): Tokens {
	const words: { text: string; quoted: boolean }[] = [];
	let cur = '';
	let started = false;
	let quoted = false;
	let i = 0;
	const s = String(line ?? '');

	const push = () => {
		if (started) words.push({ text: cur, quoted });
		cur = '';
		started = false;
		quoted = false;
	};

	while (i < s.length) {
		const c = s[i];
		if (c === ' ' || c === '\t') {
			push();
			i++;
			continue;
		}
		if (c === '#' && !started) break;
		if (c === '"') {
			started = true;
			quoted = true;
			i++;
			let closed = false;
			while (i < s.length) {
				const d = s[i];
				if (d === '\\' && i + 1 < s.length && /["\\$`]/.test(s[i + 1])) {
					cur += s[i + 1];
					i += 2;
					continue;
				}
				if (d === '"') {
					closed = true;
					i++;
					break;
				}
				cur += d;
				i++;
			}
			if (!closed) return unclosed('"');
			continue;
		}
		if (c === "'") {
			started = true;
			quoted = true;
			const end = s.indexOf("'", i + 1);
			if (end < 0) return unclosed("'");
			cur += s.slice(i + 1, end);
			i = end + 1;
			continue;
		}
		if (c === '\\') {
			started = true;
			if (i + 1 < s.length) cur += s[i + 1];
			i += 2;
			continue;
		}
		if (c === '>') {
			push();
			const op = s[i + 1] === '>' ? '>>' : '>';
			words.push({ text: op, quoted: false });
			i += op.length;
			continue;
		}
		if (c === '&' || c === '|' || c === ';') {
			push();
			const op = (c === '&' || c === '|') && s[i + 1] === c ? c + c : c;
			words.push({ text: op, quoted: false });
			i += op.length;
			continue;
		}
		started = true;
		cur += c;
		i++;
	}
	push();

	if (words.length > 0 && words[0].text === '$' && !words[0].quoted) words.shift();

	const args: string[] = [];
	let redirect: Redirect | null = null;
	for (let k = 0; k < words.length; k++) {
		const w = words[k];
		if (!w.quoted && CHAINS.includes(w.text)) {
			return {
				args: [],
				redirect: null,
				error: `This little shell runs one command per line. Put the part after ${tick(w.text)} on a line of its own.`
			};
		}
		if (!w.quoted && w.text === '&') {
			return {
				args: [],
				redirect: null,
				error: `This little shell doesn't run things in the background (${tick('&')}). Leave it off.`
			};
		}
		if (!w.quoted && (w.text === '>' || w.text === '>>')) {
			const target = words[k + 1];
			if (!target || (!target.quoted && /^(>>?|&&?|\|\|?|;)$/.test(target.text))) {
				return {
					args: [],
					redirect: null,
					error: `${tick(w.text)} needs a file name after it, like ${tick(`echo "hello" ${w.text} notes.txt`)}.`
				};
			}
			if (redirect) {
				return {
					args: [],
					redirect: null,
					error: `One ${tick('>')} per line is enough: it says which file the words go into.`
				};
			}
			redirect = { op: w.text, target: target.text };
			k++;
			continue;
		}
		args.push(w.text);
	}
	return { args, redirect };
}

function unclosed(q: string): Tokens {
	return {
		args: [],
		redirect: null,
		error: `This line has a ${tick(q)} that is never closed. Quotes come in pairs: ${q}like this${q}.`
	};
}

/** True when a line holds nothing to run (blank, or only a `#` comment). */
export function isBlankLine(text: string): boolean {
	const t = text.trim();
	return t === '' || t.startsWith('#');
}

/** The lines of a shell script that hold a command, with their 1-based line numbers. */
export function splitLines(code: string): ShellLine[] {
	return String(code ?? '')
		.split(/\r\n|\r|\n/)
		.map((text, i) => ({ line: i + 1, text: text.trim() }))
		.filter((l) => !isBlankLine(l.text));
}
