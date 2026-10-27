/**
 * Grid world: a hero on a grid with walls, items and a goal.
 * Coordinates: x to the right, y DOWN, (0, 0) is the top-left cell.
 */
import type { Direction, GridWorldSpec, ThemedText } from '#lib/curriculum/types.ts';
import type { GridState } from '../types.ts';
import { CommandError, SpecError, WorldHalt, createBase, formatArgs, type World } from '../core.ts';

export const DEFAULT_MAX_STEPS = 500;

const DIRS: Direction[] = ['N', 'E', 'S', 'W'];
const DELTA: Record<Direction, [number, number]> = {
	N: [0, -1],
	E: [1, 0],
	S: [0, 1],
	W: [-1, 0]
};

export function turnLeftOf(d: Direction): Direction {
	return DIRS[(DIRS.indexOf(d) + 3) % 4];
}
export function turnRightOf(d: Direction): Direction {
	return DIRS[(DIRS.indexOf(d) + 1) % 4];
}

const key = (x: number, y: number) => `${x},${y}`;

function checkCell(spec: GridWorldSpec, cell: unknown, what: string): [number, number] {
	if (
		!Array.isArray(cell) ||
		cell.length !== 2 ||
		!Number.isInteger(cell[0]) ||
		!Number.isInteger(cell[1])
	) {
		throw new SpecError(`${what} must be [x, y] with whole numbers, got ${JSON.stringify(cell)}`);
	}
	const [x, y] = cell as [number, number];
	if (x < 0 || y < 0 || x >= spec.width || y >= spec.height) {
		throw new SpecError(`${what} (${x}, ${y}) is outside the ${spec.width}×${spec.height} grid`);
	}
	return [x, y];
}

/** Validates a grid spec. Throws SpecError (a content bug) when something is off. */
export function validateGridSpec(spec: GridWorldSpec): void {
	for (const dim of ['width', 'height'] as const) {
		const v = spec[dim];
		if (!Number.isInteger(v) || v < 1 || v > 30) {
			throw new SpecError(`grid ${dim} must be a whole number between 1 and 30, got ${v}`);
		}
	}
	if (!spec.hero || !DIRS.includes(spec.hero.dir)) {
		throw new SpecError(`hero.dir must be one of N, E, S, W`);
	}
	const hero = checkCell(spec, [spec.hero.x, spec.hero.y], 'hero');
	const walls = new Set(
		(spec.walls ?? []).map((w, i) => key(...checkCell(spec, w, `walls[${i}]`)))
	);
	if (walls.has(key(...hero))) throw new SpecError(`hero (${hero[0]}, ${hero[1]}) is on a wall`);
	(spec.items ?? []).forEach((it, i) => {
		const c = checkCell(spec, it, `items[${i}]`);
		if (walls.has(key(...c))) throw new SpecError(`items[${i}] (${c[0]}, ${c[1]}) is on a wall`);
	});
	if (spec.goal) {
		const g = checkCell(spec, spec.goal, 'goal');
		if (walls.has(key(...g))) throw new SpecError(`goal (${g[0]}, ${g[1]}) is on a wall`);
	}
	if (spec.maxSteps !== undefined && (!Number.isInteger(spec.maxSteps) || spec.maxSteps < 1)) {
		throw new SpecError(`maxSteps must be a positive whole number`);
	}
}

/** The starting state for a spec (what the UI draws before Run). Validates the spec. */
export function gridStateFromSpec(spec: GridWorldSpec): GridState {
	validateGridSpec(spec);
	return {
		width: spec.width,
		height: spec.height,
		hero: { x: spec.hero.x, y: spec.hero.y, dir: spec.hero.dir },
		walls: (spec.walls ?? []).map(([x, y]) => [x, y] as [number, number]),
		items: (spec.items ?? []).map(([x, y]) => [x, y] as [number, number]),
		goal: spec.goal ? [spec.goal[0], spec.goal[1]] : null,
		collected: 0
	};
}

export function cloneGridState(s: GridState): GridState {
	return {
		...s,
		hero: { ...s.hero },
		walls: s.walls.map(([x, y]) => [x, y] as [number, number]),
		items: s.items.map(([x, y]) => [x, y] as [number, number]),
		goal: s.goal ? [s.goal[0], s.goal[1]] : null
	};
}

/** Wrong names learners often type in the grid world → the command they meant. */
export const GRID_ALIASES: Record<string, string> = {
	forward: 'move',
	moveForward: 'move',
	walk: 'move',
	step: 'move',
	go: 'move',
	left: 'turnLeft',
	right: 'turnRight',
	turn: 'turnLeft',
	pickup: 'pickUp',
	take: 'pickUp',
	grab: 'pickUp',
	collect: 'pickUp',
	print: 'say',
	isPathAhead: 'pathAhead',
	isAtGoal: 'atGoal'
};

export type GridWorld = World & { kind: 'grid'; state: GridState };

export function createGridWorld(spec: GridWorldSpec): GridWorld {
	const state = gridStateFromSpec(spec);
	const maxSteps = spec.maxSteps ?? DEFAULT_MAX_STEPS;
	const base = createBase(
		maxSteps,
		`Your program ran for more than ${maxSteps} steps. That usually means a loop that never ends.`
	);
	const walls = new Set(state.walls.map(([x, y]) => key(x, y)));
	let moves = 0;

	const free = (x: number, y: number) =>
		x >= 0 && y >= 0 && x < state.width && y < state.height && !walls.has(key(x, y));
	const ahead = (d: Direction): [number, number] => [
		state.hero.x + DELTA[d][0],
		state.hero.y + DELTA[d][1]
	];
	const itemIndexHere = () =>
		state.items.findIndex(([x, y]) => x === state.hero.x && y === state.hero.y);

	function noArgs(name: string, args: unknown[]) {
		if (args.length > 0) {
			throw new CommandError(
				name === 'move'
					? "`move()` always takes exactly one step, so it doesn't need anything inside the round brackets. To go further, write it again or use a loop."
					: `\`${name}()\` doesn't need anything inside the round brackets. Just write \`${name}()\`.`,
				`${name}() called with ${args.length} argument(s)`
			);
		}
	}

	const api = {
		move(...args: unknown[]) {
			base.step();
			noArgs('move', args);
			moves++;
			const { x, y, dir } = state.hero;
			const [nx, ny] = ahead(dir);
			if (!free(nx, ny)) {
				base.trace.push({ t: 'bump', at: [x, y], dir });
				const inside = nx >= 0 && ny >= 0 && nx < state.width && ny < state.height;
				const message: ThemedText = inside
					? `{Hero} bumped into the {wall} on move ${moves}. Is a turn missing before that move?`
					: `{Hero} tried to walk off the edge of the map on move ${moves}. Is a turn missing before that move?`;
				base.halt(
					new WorldHalt(
						'bump',
						message,
						`Bumped into ${inside ? 'a wall' : 'the edge'} at (${nx}, ${ny})`
					)
				);
			}
			state.hero.x = nx;
			state.hero.y = ny;
			base.trace.push({ t: 'move', from: [x, y], to: [nx, ny], dir });
		},
		turnLeft(...args: unknown[]) {
			base.step();
			noArgs('turnLeft', args);
			state.hero.dir = turnLeftOf(state.hero.dir);
			base.trace.push({ t: 'turn', dir: 'left', facing: state.hero.dir });
		},
		turnRight(...args: unknown[]) {
			base.step();
			noArgs('turnRight', args);
			state.hero.dir = turnRightOf(state.hero.dir);
			base.trace.push({ t: 'turn', dir: 'right', facing: state.hero.dir });
		},
		pickUp(...args: unknown[]) {
			base.step();
			noArgs('pickUp', args);
			const i = itemIndexHere();
			const at: [number, number] = [state.hero.x, state.hero.y];
			if (i >= 0) {
				state.items.splice(i, 1);
				state.collected++;
			}
			base.trace.push({ t: 'pickup', at, ok: i >= 0 });
			return i >= 0;
		},
		say(...args: unknown[]) {
			base.step();
			base.trace.push({ t: 'say', text: formatArgs(args) });
		},
		pathAhead() {
			base.step();
			return free(...ahead(state.hero.dir));
		},
		pathLeft() {
			base.step();
			return free(...ahead(turnLeftOf(state.hero.dir)));
		},
		pathRight() {
			base.step();
			return free(...ahead(turnRightOf(state.hero.dir)));
		},
		onItem() {
			base.step();
			return itemIndexHere() >= 0;
		},
		atGoal() {
			base.step();
			return !!state.goal && state.goal[0] === state.hero.x && state.goal[1] === state.hero.y;
		},
		itemsLeft() {
			base.step();
			return state.items.length;
		}
	};

	return {
		kind: 'grid',
		api,
		variables: {},
		log: api.say,
		state,
		trace: base.trace,
		output: base.output,
		get steps() {
			return base.steps;
		},
		get halted() {
			return base.halted;
		},
		aliases: GRID_ALIASES,
		finish: () => ({ grid: cloneGridState(state) })
	};
}
