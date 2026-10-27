/**
 * Turns raw JavaScript errors into warm, specific, learner-facing messages.
 * Messages are ThemedText (placeholders like {hero} allowed) and use markdown-lite `code`.
 */
import type { ThemedText } from '#lib/curriculum/types.ts';
import { RunTimeout, formatValue, isFriendlyEngineError } from './core.ts';
import { codeOnly, maskStrings, stripComments } from './source.ts';
import type { FriendlyError } from './types.ts';

export const TIMEOUT_MESSAGE: ThemedText =
	'Your program ran for too long, so it was stopped. Usually that means a loop that never ends. Look at the question your loop asks: does the answer ever change?';

export const BRACKET_MESSAGE: ThemedText =
	'It looks like a bracket is missing. Every `(` needs a `)` and every `{` needs a `}`.';

export const SMART_QUOTES_MESSAGE: ThemedText =
	'There\'s a curly quote mark (like “ or ”) in your code, probably pasted from somewhere else. Code only understands plain straight quotes: " ".';

export const MISSING_QUOTE_MESSAGE: ThemedText =
	'A piece of text is missing its closing quote. Text needs a quote at both ends, like `"Hello"`.';

/** Built-in names learners commonly reach for (and mistype). Functions are marked with (). */
const JS_NAMES = [
	'Math',
	'String',
	'Number',
	'Boolean',
	'Array',
	'Object',
	'JSON',
	'parseInt()',
	'parseFloat()',
	'isNaN()',
	'true',
	'false',
	'null',
	'undefined'
];

/** Python / other-language habits → JavaScript */
const GLOBAL_ALIASES: Record<string, string> = {
	True: 'true',
	False: 'false',
	None: 'null',
	nil: 'null',
	elif: 'else if',
	def: 'function',
	func: 'function',
	fn: 'function',
	var_dump: 'console.log'
};

const KEYWORDS = ['while', 'for', 'if', 'else', 'function', 'let', 'const', 'return', 'break'];

/** Methods learners call on strings, numbers and arrays (for typo suggestions). */
const COMMON_METHODS = [
	'toUpperCase',
	'toLowerCase',
	'includes',
	'indexOf',
	'slice',
	'split',
	'trim',
	'repeat',
	'replace',
	'startsWith',
	'endsWith',
	'charAt',
	'toString',
	'toFixed',
	'push',
	'pop',
	'shift',
	'unshift',
	'join',
	'reverse',
	'sort',
	'map',
	'filter',
	'forEach',
	'find',
	'concat',
	'padStart',
	'padEnd',
	'round',
	'floor',
	'ceil',
	'random',
	'max',
	'min',
	'abs'
];

const SMART_QUOTES = /[“”„‟‘’‚‛″′«»]/;
const ODD_CHARS: [RegExp, ThemedText][] = [
	[SMART_QUOTES, SMART_QUOTES_MESSAGE],
	[
		/[–—−]/,
		"There's a long dash (– or —) in your code. JavaScript only understands the short minus sign `-`, so type it again with the minus key."
	],
	[/×/, 'JavaScript multiplies with `*`, not ×. Swap the × for a `*`.'],
	[/÷/, 'JavaScript divides with `/`, not ÷. Swap the ÷ for a `/`.']
];

export interface FriendlyErrorOptions {
	/** Which of knownNames are commands (shown as `name()`). Default: all of knownNames. */
	commandNames?: string[];
	/** Likely wrong names → what they meant, e.g. { forward: 'move' } */
	aliases?: Record<string, string>;
	/** Known line (e.g. from findSyntaxErrorLine); wins over the stack */
	line?: number;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Optimal-string-alignment distance (Levenshtein + adjacent swaps count as 1). */
export function editDistance(a: string, b: string): number {
	const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
		Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
	);
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			}
		}
	}
	return d[a.length][b.length];
}

/** Closest candidate within a small edit distance (case differences are free). */
export function closestName(name: string, candidates: Iterable<string>): string | undefined {
	const max = name.length <= 2 ? 0 : name.length <= 4 ? 1 : 2;
	let best: string | undefined;
	let bestScore = Infinity;
	for (const c of candidates) {
		if (c === name) continue;
		const ci = editDistance(name.toLowerCase(), c.toLowerCase());
		if (ci > max) continue;
		// prefer exact-but-for-case, then smallest real distance
		const score = ci * 10 + (editDistance(name, c) > ci ? 1 : 0);
		if (score < bestScore) {
			best = c;
			bestScore = score;
		}
	}
	return best;
}

/** Names the learner declared: let/const/var, function names and parameters. */
export function declaredNames(code: string): { variables: string[]; functions: string[] } {
	const src = maskStrings(stripComments(code));
	const variables = new Set<string>();
	const functions = new Set<string>();
	for (const m of src.matchAll(/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)/g)) variables.add(m[1]);
	for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) functions.add(m[1]);
	for (const m of src.matchAll(/\bfunction\s*[\w$]*\s*\(([^)]*)\)/g)) {
		for (const p of m[1].split(',')) {
			const n = p.trim().match(/^[A-Za-z_$][\w$]*/);
			if (n) variables.add(n[0]);
		}
	}
	for (const m of src.matchAll(
		/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g
	)) {
		functions.add(m[1]);
	}
	return { variables: [...variables], functions: [...functions] };
}

export function splitLines(code: string): string[] {
	return code.split(/\r\n|\r|\n/);
}

/**
 * Finds the learner's line in a stack trace. Handles V8 (`<anonymous>:L:C`, also Node's
 * `evalmachine.<anonymous>:L:C`) and Firefox (`> Function:L:C`).
 */
export function lineFromStack(
	stack: string | undefined,
	prefixLines: number,
	lineCount: number
): { line: number; column?: number } | undefined {
	if (!stack) return undefined;
	// Prefer a real frame (line and column); Node's vm may prefix the stack with `file:line`.
	const m =
		stack.match(/(?:<anonymous>|> Function):(\d+):(\d+)/) ??
		stack.match(/(?:<anonymous>|> Function):(\d+)/);
	if (!m) return undefined;
	const raw = Number(m[1]) - prefixLines;
	const line = Math.min(Math.max(raw, 1), Math.max(lineCount, 1));
	return { line, column: m[2] && raw === line ? Number(m[2]) : undefined };
}

/**
 * V8 gives no line number for a SyntaxError from `new Function`. Find it by compiling growing
 * prefixes of the code: the first prefix that fails with the same message contains the mistake.
 * `compileCode` must throw like the real compile (same wrapping). Returns undefined when unsure
 * (e.g. "Unexpected end of input" — the missing piece could be anywhere).
 */
export function findSyntaxErrorLine(
	code: string,
	message: string,
	compileCode: (code: string) => void
): number | undefined {
	if (/end of input|end of script/i.test(message)) return undefined;
	// An unclosed `{` swallows the wrapper's `}`; the first failing prefix would point at the
	// wrong block, so don't guess.
	const src = codeOnly(code);
	if ((src.match(/\{/g) ?? []).length > (src.match(/\}/g) ?? []).length) return undefined;
	const lines = splitLines(code);
	if (lines.length > 400) return undefined;
	for (let k = 1; k <= lines.length; k++) {
		try {
			compileCode(lines.slice(0, k).join('\n'));
		} catch (e) {
			if ((e as Error)?.message === message) return k;
		}
	}
	return undefined;
}

function firstLineMatching(lines: string[], re: RegExp): number | undefined {
	const i = lines.findIndex((l) => re.test(l));
	return i >= 0 ? i + 1 : undefined;
}

const tick = (s: string) => '`' + s + '`';

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

export function toFriendlyError(
	err: unknown,
	code: string,
	knownNames: string[],
	prefixLines: number,
	opts: FriendlyErrorOptions = {}
): FriendlyError {
	const lines = splitLines(code);
	const lineText = (n?: number) => (n ? (lines[n - 1] ?? '') : '');

	if (err instanceof RunTimeout) {
		return { message: TIMEOUT_MESSAGE, raw: err.message };
	}

	const isObj = typeof err === 'object' && err !== null;
	const stack = isObj ? (err as { stack?: unknown }).stack : undefined;
	const loc = lineFromStack(
		typeof stack === 'string' ? stack : undefined,
		prefixLines,
		lines.length
	);
	let line = opts.line ?? loc?.line;
	const column = opts.line === undefined ? loc?.column : undefined;
	const done = (message: ThemedText, raw: string): FriendlyError => {
		const out: FriendlyError = { message, raw };
		if (line !== undefined) out.line = Math.min(Math.max(line, 1), Math.max(lines.length, 1));
		if (column !== undefined && out.line === loc?.line) out.column = column;
		return out;
	};

	if (isFriendlyEngineError(err)) return done(err.friendly, err.message);

	if (!isObj || typeof (err as { message?: unknown }).message !== 'string') {
		// `throw "oops"` or `throw 42`
		return done(`Your code stopped with this message: ${formatValue(err)}`, formatValue(err));
	}

	const name = String((err as { name?: unknown }).name ?? 'Error');
	const msg = (err as Error).message;
	const raw = `${name}: ${msg}`;

	const commandNames = new Set(opts.commandNames ?? knownNames);
	const aliases = { ...GLOBAL_ALIASES, ...(opts.aliases ?? {}) };
	const declared = declaredNames(code);
	const functionNames = new Set([...commandNames, ...declared.functions]);
	const show = (n: string) =>
		n.endsWith('()') || !functionNames.has(n) ? tick(n) : tick(`${n}()`);
	const candidates = [...knownNames, ...declared.variables, ...declared.functions, ...JS_NAMES];
	const suggestFor = (n: string, pool: string[] = candidates): string | undefined => {
		const alias = aliases[n];
		if (alias) return alias;
		const c = closestName(
			n,
			pool.map((p) => p.replace(/\(\)$/, ''))
		);
		if (!c) return undefined;
		return pool.includes(`${c}()`) ? `${c}()` : c;
	};
	const didYouMean = (n: string, s: string) =>
		` Did you mean ${show(s)}?` +
		(s.replace(/\(\)$/, '').toLowerCase() === n.toLowerCase()
			? ' Capital letters matter in JavaScript.'
			: '');

	// --- ReferenceError: X is not defined -----------------------------------------------------
	const notDefined =
		msg.match(/^([\w$]+) is not defined$/) ?? msg.match(/^Can't find variable: ([\w$]+)/);
	if (notDefined) {
		const x = notDefined[1];
		const s = suggestFor(x);
		let text = `I don't know anything called ${tick(x)}.`;
		if (s) text += didYouMean(x, s);
		else if (
			new RegExp(`(^|[^.\\w$])${x.replace(/\$/g, '\\$')}\\s*([-+*/]?=)(?!=)`).test(lineText(line))
		)
			text += ` To make a new variable, start with ${tick('let')}: ${tick(`let ${x} = …`)}.`;
		else
			text += ` If it's text, put it in quotes: ${tick(`"${x}"`)}. If it's a variable, create it first with ${tick('let')}.`;
		return done(text, raw);
	}

	// --- TDZ ------------------------------------------------------------------------------------
	const tdz =
		msg.match(/^Cannot access '([\w$]+)' before initialization/) ??
		msg.match(/can't access lexical declaration [`'"]?([\w$]+)[`'"]? before initialization/);
	if (tdz) {
		return done(
			`You used ${tick(tdz[1])} before the line that creates it. Move the ${tick(`let ${tdz[1]} = …`)} line higher up.`,
			raw
		);
	}

	// --- X is not a function ----------------------------------------------------------------
	const notFn = msg.match(/^(.+?) is not a function/);
	if (notFn && name === 'TypeError') {
		const x = notFn[1].trim();
		if (x.endsWith('(...)')) {
			return done(
				`${tick(x.replace(/\(\.\.\.\)$/, '()'))} gives back a value, not a command, so it can't be followed by more round brackets.`,
				raw
			);
		}
		if (x.includes('.')) {
			const method = x.slice(x.lastIndexOf('.') + 1);
			const s = COMMON_METHODS.includes(method) ? undefined : closestName(method, COMMON_METHODS);
			return done(
				`${tick(`.${method}()`)} isn't something this value can do.` +
					(s
						? ` Did you mean ${tick(`.${s}()`)}?`
						: COMMON_METHODS.includes(method)
							? ' It works on some kinds of values but not on the one stored here. Check what this variable holds.'
							: ' Check the spelling.'),
				raw
			);
		}
		if (commandNames.has(x)) {
			const reused = new RegExp(
				`(\\b(let|const|var)\\s+${x}\\b)|((^|[^.\\w$])${x}\\s*=(?!=))`
			).test(maskStrings(stripComments(code)));
			return done(
				reused
					? `${tick(x)} is the name of a command, but your code also uses that name for something else. Give your variable a different name so ${tick(`${x}()`)} still works.`
					: `${tick(x)} is a command, so it needs round brackets: ${tick(`${x}()`)}.`,
				raw
			);
		}
		const pool = [...commandNames]
			.map((c) => `${c}()`)
			.concat(declared.functions.map((f) => `${f}()`));
		const s = suggestFor(x, pool);
		return done(
			`${tick(x)} isn't a command, so it can't be run with round brackets ${tick('()')}.` +
				(s ? didYouMean(x, s) : ''),
			raw
		);
	}

	// --- undefined / null property access ----------------------------------------------------
	const readProp =
		msg.match(
			/^Cannot read propert(?:y|ies) (?:of (undefined|null) \(reading '([^']*)'\)|'([^']*)' of (undefined|null))/
		) ?? null;
	const ffProp = msg.match(/can't access property "([^"]*)", .* is (undefined|null)/);
	if (readProp || ffProp || /^Cannot set propert/.test(msg)) {
		const what =
			readProp?.[1] ??
			readProp?.[4] ??
			ffProp?.[2] ??
			(msg.includes('null') ? 'null' : 'undefined');
		const prop = readProp?.[2] ?? readProp?.[3] ?? ffProp?.[1];
		const use =
			prop !== undefined
				? /^\d+$/.test(prop)
					? `item ${tick(`[${prop}]`)}`
					: tick(`.${prop}`)
				: 'something';
		return done(
			`Something was ${tick(what)} (it had no value) when your code tried to use ${use} on it. Check that the variable got a value before this line.`,
			raw
		);
	}

	if (/^Assignment to constant variable/.test(msg) || /invalid assignment to const/.test(msg)) {
		const n = msg.match(/const [`'"]?([\w$]+)/)?.[1];
		return done(
			`You made ${n ? tick(n) : 'this variable'} with ${tick('const')}, which means it can't change. Use ${tick('let')} instead if its value needs to change.`,
			raw
		);
	}

	if (/Maximum call stack size exceeded|too much recursion/.test(msg)) {
		return done(
			'A function kept calling itself and never stopped. Make sure it has a way to finish.',
			raw
		);
	}

	// --- SyntaxError ----------------------------------------------------------------------------
	if (name === 'SyntaxError') {
		// Odd characters outside strings and comments (smart quotes, long dashes, ×, ÷)
		const bare = splitLines(codeOnly(code));
		const odd = ODD_CHARS.find(([re]) => bare.some((l) => re.test(l)));
		if (odd) {
			line = firstLineMatching(bare, odd[0]) ?? line;
			return done(odd[1], raw);
		}
		const quoteProblem = /Invalid or unexpected token|unterminated|illegal character/i.test(msg);
		const brackets = quoteProblem ? {} : bracketBalance(code);
		if (brackets.extraClose) {
			const [close, open] = brackets.extraClose.char === '}' ? ['}', '{'] : [')', '('];
			line = brackets.extraClose.line;
			return done(
				`There's a ${tick(close)} here without a matching ${tick(open)} before it. Look for one ${tick(close)} too many.`,
				raw
			);
		}
		if (brackets.unclosed === '{') {
			// the unclosed block swallowed our wrapper's `}`, so any line we found is a guess
			line = undefined;
			return done(BRACKET_MESSAGE, raw);
		}
		const typo = keywordTypo(lineText(line), knownNames, declared);
		if (typo) {
			return done(
				`${tick(typo[0])} isn't a word JavaScript knows. Did you mean ${tick(typo[1])}?`,
				raw
			);
		}
		let text = syntaxMessage(msg, lineText(line));
		text += syntaxHints(lineText(line), knownNames, declared);
		return done(text, raw);
	}

	if (
		name === 'Error' ||
		name === 'RangeError' ||
		name === 'TypeError' ||
		name === 'ReferenceError'
	) {
		return done(
			name === 'Error'
				? `Your code stopped with this message: ${msg}`
				: `Your code ran into a problem it couldn't get past: ${msg}`,
			raw
		);
	}
	return done(`Your code ran into a problem it couldn't get past: ${raw}`, raw);
}

function syntaxMessage(msg: string, line: string): string {
	const declaredTwice =
		msg.match(/^Identifier '([\w$]+)' has already been declared/) ??
		msg.match(/^redeclaration of (?:let|const|var) ([\w$]+)/);
	if (declaredTwice) {
		const x = declaredTwice[1];
		return `You created ${tick(x)} twice. Use ${tick(`let ${x}`)} only the first time; after that, just write ${tick(`${x} = …`)}.`;
	}
	if (/Unterminated template/i.test(msg)) {
		return 'A piece of text starts with a backtick but never ends. Close it with another backtick, or use normal quotes " ".';
	}
	if (/unterminated string/i.test(msg)) return MISSING_QUOTE_MESSAGE as string;
	if (/Invalid or unexpected token|illegal character/i.test(msg)) {
		const quotes = (line.match(/"/g) ?? []).length + (line.match(/'/g) ?? []).length;
		if (quotes % 2 === 1) return MISSING_QUOTE_MESSAGE as string;
		return "There's a character on this line JavaScript doesn't understand. Delete anything unusual and type it again.";
	}
	if (/Unexpected token '?else'?|unexpected token: keyword 'else'/.test(msg)) {
		return `${tick('else')} has to come straight after the closing ${tick('}')} of an ${tick('if')} block. Check that nothing is in between, and that the ${tick('if')} has its ${tick('{ }')}.`;
	}
	if (
		/missing \) after argument list/.test(msg) &&
		/["'`]\s+[\w$"'`]|[\w$)]\s+["'`]/.test(maskStrings(stripComments(line)))
	) {
		return `Two things sit side by side here with nothing between them. To join text, put a ${tick('+')} between the pieces, like ${tick('print("Hi " + name)')}.`;
	}
	if (
		/end of input|end of script|missing \) after|missing \} |missing \] |Unexpected token '?[)}\]{]'?|expected expression, got '?[)}\]]/.test(
			msg
		)
	) {
		return BRACKET_MESSAGE as string;
	}
	const ident =
		msg.match(/^Unexpected identifier(?: '([^']*)')?/) ?? msg.match(/unexpected token: identifier/);
	if (ident) {
		const what = ident[1] ? tick(ident[1]) : 'a name';
		return `JavaScript found ${what} somewhere it didn't expect a name. That's often a typo or a missing bracket just before it, or two commands squashed onto one line. Give each command a line of its own.`;
	}
	if (/Unexpected string|unexpected token: string literal/.test(msg)) {
		return `There's a piece of text in quotes where JavaScript didn't expect one. Maybe the round brackets are missing, like ${tick('say("Hi")')}, or a ${tick('+')} or comma is missing, like ${tick('print("Hi " + name)')}.`;
	}
	if (/Unexpected number|unexpected token: numeric literal/.test(msg)) {
		return `There's a number where JavaScript didn't expect one. Maybe a comma, a ${tick('+')} or a bracket is missing just before it.`;
	}
	if (/Missing initializer in const/.test(msg) || /missing = in const/.test(msg)) {
		return `${tick('const')} needs a value straight away, like ${tick('const size = 5')}.`;
	}
	if (/Invalid left-hand side in assignment|invalid assignment left-hand side/.test(msg)) {
		return `The left side of ${tick('=')} has to be a variable name, like ${tick('score = 5')}. To compare two things, use ${tick('===')}.`;
	}
	if (/Illegal break statement|unlabeled break must be inside loop/.test(msg)) {
		return `${tick('break')} only works inside a loop.`;
	}
	if (/Illegal continue statement|continue must be inside loop/.test(msg)) {
		return `${tick('continue')} only works inside a loop.`;
	}
	if (/reserved word/.test(msg)) {
		return `This line uses a word JavaScript keeps for itself (like ${tick('let')}, ${tick('class')} or ${tick('new')}) as a name. Pick a different name.`;
	}
	const tok =
		msg.match(/^Unexpected token '?([^']+?)'?$/) ??
		msg.match(/^expected expression, got '?([^']+?)'?$/);
	if (tok) {
		return `JavaScript didn't expect ${tick(tok[1])} there. Check for a typo, or a missing bracket just before it.`;
	}
	return "JavaScript couldn't understand this line. Check it for a typo, or a missing bracket or quote.";
}

/** Finds a `)`/`}` with no opener (and its line), or an opener that is never closed. */
export function bracketBalance(code: string): {
	extraClose?: { char: ')' | '}'; line: number };
	unclosed?: '(' | '{';
} {
	const lines = splitLines(codeOnly(code));
	let paren = 0;
	let brace = 0;
	for (let i = 0; i < lines.length; i++) {
		for (const c of lines[i]) {
			if (c === '(') paren++;
			else if (c === ')' && --paren < 0) return { extraClose: { char: ')', line: i + 1 } };
			else if (c === '{') brace++;
			else if (c === '}' && --brace < 0) return { extraClose: { char: '}', line: i + 1 } };
		}
	}
	if (brace > 0) return { unclosed: '{' };
	if (paren > 0) return { unclosed: '(' };
	return {};
}

/** `whlie (x) {` / `fucntion go() {` / `Let x = 1`: a mistyped keyword at the start of a line. */
function keywordTypo(
	line: string,
	knownNames: string[],
	declared: { variables: string[]; functions: string[] }
): [string, string] | undefined {
	const m = maskStrings(stripComments(line)).match(/^\s*(?:\}\s*)?([A-Za-z_$][\w$]*)\s*[({\w]/);
	if (!m) return undefined;
	const w = m[1];
	if (
		KEYWORDS.includes(w) ||
		[...knownNames, ...declared.variables, ...declared.functions].includes(w)
	) {
		return undefined;
	}
	const k = closestName(w, KEYWORDS);
	return k ? [w, k] : undefined;
}

function syntaxHints(
	line: string,
	knownNames: string[],
	declared: { variables: string[]; functions: string[] }
): string {
	if (!line) return '';
	const masked = maskStrings(stripComments(line));
	const hints: string[] = [];
	if (/^\s*(?:\}\s*else\s+)?(?:if|while)\s+[^\s(]/.test(masked)) {
		hints.push(
			`The question after ${tick('if')} or ${tick('while')} goes inside round brackets, like ${tick('if (x > 5) {')}.`
		);
	}
	if (/\b(and|or|not)\b/.test(masked)) {
		hints.push(
			`In JavaScript, **and** is written ${tick('&&')}, **or** is ${tick('||')} and **not** is ${tick('!')}.`
		);
	}
	if (/\belif\b/.test(masked))
		hints.push(`In JavaScript it's ${tick('else if')}, not ${tick('elif')}.`);
	if (hints.length === 0) {
		const known = new Set([...knownNames, ...declared.variables, ...declared.functions]);
		for (const m of masked.matchAll(/[A-Za-z_$][\w$]*/g)) {
			const w = m[0];
			if (KEYWORDS.includes(w) || known.has(w) || w.length < 2) continue;
			const k = closestName(w, KEYWORDS);
			if (k) {
				hints.push(`Did you mean ${tick(k)}?`);
				break;
			}
		}
	}
	return hints.length ? ' ' + hints.join(' ') : '';
}
