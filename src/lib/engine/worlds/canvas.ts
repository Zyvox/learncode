/**
 * Canvas world: drawing commands are recorded as DrawOps; the UI replays them onto a <canvas>.
 * Coordinates: x to the right, y DOWN, (0, 0) is the top-left corner. Default 300×300.
 */
import type { CanvasWorldSpec, ThemedText } from '#lib/curriculum/types.ts';
import type { DrawOp } from '../types.ts';
import {
	CommandError,
	SpecError,
	createBase,
	formatArgs,
	formatValue,
	type World
} from '../core.ts';

export const MAX_DRAW_OPS = 2000;
export const DEFAULT_CANVAS_SIZE = 300;
export const DEFAULT_FILL = 'black';

/**
 * Friendly colour names that aren't CSS colours. Anything else is passed to the browser as-is
 * (lower-cased), so every CSS colour — 'red', '#ff8800', 'rgb(0, 128, 255)' — works too.
 */
export const FRIENDLY_COLORS: Record<string, string> = {
	sky: '#87ceeb',
	sea: '#1e90ff',
	ocean: '#1e6fa8',
	grass: '#4caf50',
	leaf: '#3a9d23',
	sun: '#ffd23f',
	sunshine: '#ffd23f',
	sand: '#e8d29b',
	night: '#1b2140',
	fire: '#ff5a1f',
	rose: '#ff5c8a',
	cherry: '#d2042d',
	peach: '#ffb38a',
	mint: '#98ff98',
	banana: '#ffe135',
	cloud: '#f2f4f8',
	stone: '#8a8d91',
	grey: 'gray',
	lightgrey: 'lightgray',
	darkgrey: 'darkgray',
	transparent: 'transparent'
};

/** Normalises a learner colour: trims, lower-cases, maps friendly names. */
export function normalizeColor(c: string): string {
	const s = c.trim().toLowerCase();
	return FRIENDLY_COLORS[s.replace(/\s+/g, '')] ?? s;
}

export const CANVAS_ALIASES: Record<string, string> = {
	fill: 'color',
	colour: 'color',
	setColor: 'color',
	stroke: 'color',
	ellipse: 'circle',
	dot: 'circle',
	rectangle: 'rect',
	square: 'rect',
	box: 'rect',
	drawCircle: 'circle',
	drawRect: 'rect',
	drawLine: 'line',
	write: 'text',
	print: 'text',
	bg: 'background',
	clear: 'background'
};

export type CanvasWorld = World & { kind: 'canvas'; draws: DrawOp[] };

export function createCanvasWorld(spec: CanvasWorldSpec): CanvasWorld {
	const width = spec.width ?? DEFAULT_CANVAS_SIZE;
	const height = spec.height ?? DEFAULT_CANVAS_SIZE;
	for (const [n, v] of [
		['width', width],
		['height', height]
	] as const) {
		if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 2000) {
			throw new SpecError(`canvas ${n} must be a positive number up to 2000, got ${v}`);
		}
	}
	const base = createBase(
		MAX_DRAW_OPS,
		`Your drawing used more than ${MAX_DRAW_OPS} drawing commands. That usually means a loop that never ends.`
	);
	const draws: DrawOp[] = [];
	let fill = DEFAULT_FILL;

	function record(op: DrawOp) {
		draws.push(op);
		base.trace.push({ t: 'draw', op });
	}

	function numbers(name: string, args: unknown[], count: number, usage: ThemedText): number[] {
		const ok =
			args.length >= count &&
			args.slice(0, count).every((a) => typeof a === 'number' && Number.isFinite(a));
		if (!ok) {
			const got = args.map((a) => formatValue(typeof a === 'string' ? JSON.stringify(a) : a));
			throw new CommandError(usage, `${name}(${got.join(', ')})`);
		}
		return args.slice(0, count) as number[];
	}

	function colorArg(name: string, args: unknown[]): string {
		const c = args[0];
		if (typeof c !== 'string' || c.trim() === '') {
			throw new CommandError(
				`\`${name}()\` needs a colour name in quotes, like \`${name}("red")\`.`,
				`${name}(${args.map((a) => formatValue(a)).join(', ')})`
			);
		}
		return normalizeColor(c);
	}

	const api = {
		background(...args: unknown[]) {
			base.step();
			record({ op: 'background', color: colorArg('background', args) });
		},
		color(...args: unknown[]) {
			base.step();
			fill = colorArg('color', args);
			record({ op: 'color', color: fill });
		},
		circle(...args: unknown[]) {
			base.step();
			const [x, y, r] = numbers(
				'circle',
				args,
				3,
				'`circle()` needs three numbers: x, y and size. For example `circle(150, 150, 40)`. Numbers go without quotes.'
			);
			if (r < 0) {
				throw new CommandError(
					`A circle's size can't be negative. Try \`circle(${x}, ${y}, ${-r})\`.`,
					`circle(${x}, ${y}, ${r})`
				);
			}
			record({ op: 'circle', x, y, r, color: fill });
		},
		rect(...args: unknown[]) {
			base.step();
			const [x, y, w, h] = numbers(
				'rect',
				args,
				4,
				'`rect()` needs four numbers: x, y, width and height. For example `rect(50, 50, 100, 80)`. Numbers go without quotes.'
			);
			record({ op: 'rect', x, y, w, h, color: fill });
		},
		line(...args: unknown[]) {
			base.step();
			const [x1, y1, x2, y2] = numbers(
				'line',
				args,
				4,
				'`line()` needs four numbers: where it starts (x1, y1) and where it ends (x2, y2). For example `line(0, 0, 300, 300)`.'
			);
			record({ op: 'line', x1, y1, x2, y2, color: fill });
		},
		text(...args: unknown[]) {
			base.step();
			const usage = '`text()` needs x, y and the words to write, like `text(20, 40, "Hello")`.';
			const [x, y] = numbers('text', args, 2, usage);
			if (args.length < 3) throw new CommandError(usage, `text(${x}, ${y})`);
			record({ op: 'text', x, y, text: formatArgs(args.slice(2)), color: fill });
		}
	};

	return {
		kind: 'canvas',
		api,
		variables: { width, height },
		log: (...args: unknown[]) => base.print(formatArgs(args)),
		trace: base.trace,
		output: base.output,
		draws,
		get steps() {
			return base.steps;
		},
		get halted() {
			return base.halted;
		},
		aliases: CANVAS_ALIASES,
		finish: () => ({ draws: draws.slice() })
	};
}
