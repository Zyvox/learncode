/**
 * A tiny shell highlighter for the git lessons' editor: `git` and its subcommands, the few file
 * commands the little shell knows (echo, cat, ls, rm, touch), flags, quoted strings, `#`
 * comments and the `>` / `>>` redirections.
 */
import { StreamLanguage, type StreamParser } from '@codemirror/language';

const COMMANDS = new Set(['git', 'echo', 'cat', 'ls', 'rm', 'touch']);

const GIT_SUBCOMMANDS = new Set(
	`init status add commit log branch checkout switch merge diff restore rm`.split(/\s+/)
);

interface ShellState {
	/** Position in the current command: 0 = command word, 1 = first argument, … */
	word: number;
	/** The command word of this line */
	command: string | null;
}

export const shellParser: StreamParser<ShellState> = {
	name: 'shell',
	startState: () => ({ word: 0, command: null }),
	token(stream, state) {
		if (stream.sol()) {
			state.word = 0;
			state.command = null;
		}
		if (stream.eatSpace()) return null;
		const ch = stream.peek();
		if (ch === '#') {
			stream.skipToEnd();
			return 'comment';
		}
		// A "$ " copied from a tutorial prompt
		if (state.word === 0 && ch === '$' && stream.match(/^\$\s/)) return 'meta';
		if (stream.match('>>') || stream.match('>')) {
			state.word++;
			return 'operator';
		}
		if (ch === '"' || ch === "'") {
			const quote = stream.next()!;
			let escaped = false;
			let c: string | void;
			while ((c = stream.next()) !== undefined) {
				if (c === quote && !escaped) break;
				escaped = quote === '"' && !escaped && c === '\\';
			}
			state.word++;
			return 'string';
		}
		if (stream.match(/^--?[\w-]+/)) {
			state.word++;
			return 'atom';
		}
		if (stream.match(/^[^\s"'#>]+/)) {
			const word = stream.current();
			const pos = state.word++;
			if (pos === 0) {
				state.command = word;
				return COMMANDS.has(word) ? 'keyword' : 'variableName';
			}
			if (pos === 1 && state.command === 'git' && GIT_SUBCOMMANDS.has(word)) {
				return 'variableName.function';
			}
			return 'variableName';
		}
		stream.next();
		return null;
	},
	languageData: {
		commentTokens: { line: '#' },
		closeBrackets: { brackets: ['"', "'"] }
	}
};

export const shellLanguage = StreamLanguage.define(shellParser);
