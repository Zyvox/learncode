/**
 * Reference for the UI cheat sheet: every command per world, and the JavaScript basics.
 * Summaries are ThemedText (render with renderText()) and written for absolute beginners.
 */
import type {
	NetWorldSpec,
	ThemedText,
	WebWorldSpec,
	WorldKind
} from '#lib/curriculum/types.ts';

export interface CommandDoc {
	/** As the learner writes it, e.g. 'move()', 'say(text)' */
	name: string;
	/** One line, plain language */
	summary: ThemedText;
	example?: string;
	/** web world only: the roles (WebWorldSpec.role) where this command exists */
	roles?: WebRole[];
	/** net world only: the flavours (NetWorldSpec.flavour) where this command exists */
	flavours?: NetFlavour[];
}

export type WebRole = WebWorldSpec['role'];
export type NetFlavour = NetWorldSpec['flavour'];

export interface SyntaxDoc {
	id: string;
	name: string;
	summary: ThemedText;
	example: string;
}

/** SQL in the cheat sheet: used in the SQL editor (sql role) and inside db.* calls (server role). */
export const SQL_COMMANDS: CommandDoc[] = [
	{
		name: 'SELECT',
		summary:
			'Ask the database for rows. List the columns you want (or `*` for all of them), then `FROM` and the table.',
		example: 'SELECT title, genre FROM series;',
		roles: ['sql', 'server']
	},
	{
		name: 'WHERE',
		summary: 'Only keep the rows that match. Text goes in single quotes.',
		example: "SELECT * FROM series WHERE genre = 'comedy';",
		roles: ['sql', 'server']
	},
	{
		name: 'ORDER BY',
		summary: 'Sort the rows by a column. Add `DESC` for biggest first.',
		example: 'SELECT title, likes FROM episodes ORDER BY likes DESC;',
		roles: ['sql', 'server']
	},
	{
		name: 'LIMIT',
		summary: 'Keep only the first few rows.',
		example: 'SELECT title FROM episodes ORDER BY likes DESC LIMIT 3;',
		roles: ['sql', 'server']
	},
	{
		name: 'COUNT(*)',
		summary: 'Count rows instead of listing them.',
		example: 'SELECT COUNT(*) AS total FROM episodes;',
		roles: ['sql', 'server']
	},
	{
		name: 'INSERT INTO',
		summary: 'Add a new row. Name the columns, then give one value for each, in the same order.',
		example: "INSERT INTO comments (episode_id, author, text) VALUES (1, 'Mina', 'Love it');",
		roles: ['sql', 'server']
	},
	{
		name: 'UPDATE',
		summary:
			'Change values in rows that already exist. Without a `WHERE`, it changes every row in the table.',
		example: 'UPDATE episodes SET likes = likes + 1 WHERE id = 1;',
		roles: ['sql', 'server']
	},
	{
		name: 'DELETE FROM',
		summary: 'Remove rows. Without a `WHERE`, it removes every row in the table.',
		example: 'DELETE FROM comments WHERE id = 1;',
		roles: ['sql', 'server']
	},
	{
		name: 'JOIN',
		summary:
			'Put rows from two tables side by side, matched up by the rule after `ON`, usually an id in one table pointing at the other.',
		example:
			'SELECT episodes.title, series.title AS series\nFROM episodes\nJOIN series ON series.id = episodes.series_id;',
		roles: ['sql', 'server']
	},
	{
		name: 'GROUP BY',
		summary:
			'Squash rows that share a value into one row each, so you can count or add them up per group.',
		example: 'SELECT series_id, COUNT(*) AS episodes FROM episodes GROUP BY series_id;',
		roles: ['sql', 'server']
	}
];

const WEB_COMMANDS: CommandDoc[] = [
	// ---- the phone (client role) ----
	{
		name: 'get(path)',
		summary: 'Ask the server for something. You get back a response with a status and a body.',
		example: "const res = get('/series')\nshow(res.body)",
		roles: ['client']
	},
	{
		name: 'post(path, body)',
		summary: 'Send something new to the server, like a comment. The body is an object.',
		example: "post('/comments', { episodeId: 1, author: 'Mina', text: 'wow' })",
		roles: ['client']
	},
	{
		name: 'put(path, body)',
		summary: 'Ask the server to change something that already exists.',
		example: "put('/episodes/1', { title: 'The first night' })",
		roles: ['client']
	},
	{
		name: 'del(path)',
		summary: 'Ask the server to delete something.',
		example: "del('/comments/1')",
		roles: ['client']
	},
	{
		name: 'show(value)',
		summary:
			'Put something on the phone screen: text, an object (a card) or a list (a list of cards).',
		example: "show('Hello from the phone')",
		roles: ['client']
	},
	{
		name: 'res.status',
		summary:
			'The status code of a response: `200` means OK, `404` means not found, `500` means the server broke.',
		example: "const res = get('/series')\nshow(res.status)",
		roles: ['client']
	},
	{
		name: 'res.ok',
		summary: '`true` when the status is in the 200s, so everything went fine.',
		example: "const res = get('/series')\nif (res.ok) {\n  show(res.body)\n}",
		roles: ['client']
	},
	{
		name: 'res.body',
		summary: 'What the server sent back, ready to use: an object, a list or text.',
		example: "const res = get('/series')\nshow(res.body)",
		roles: ['client']
	},
	{
		name: 'res.json()',
		summary:
			'The same as `res.body`. It exists so code for real apps (with `fetch`) looks familiar.',
		example: "const series = get('/series').json()\nshow(series)",
		roles: ['client']
	},
	{
		name: 'res.text()',
		summary: 'The body as plain text.',
		example: "show(get('/series').text())",
		roles: ['client']
	},
	// ---- the server (server role) ----
	{
		name: 'app.get(path, handler)',
		summary:
			'Add an endpoint: when a GET request for this path arrives, run the handler function. `:name` in the path catches a part of it.',
		example: "app.get('/hello', (req, res) => {\n  res.json({ message: 'Hello' })\n})",
		roles: ['server']
	},
	{
		name: 'app.post(path, handler)',
		summary: 'Add an endpoint for POST requests, which send something new in `req.body`.',
		example:
			"app.post('/comments', (req, res) => {\n  res.status(201).json({ text: req.body.text })\n})",
		roles: ['server']
	},
	{
		name: 'app.put(path, handler)',
		summary: 'Add an endpoint for PUT requests, which change something that exists.',
		example: "app.put('/episodes/:id', (req, res) => {\n  res.json({ id: req.params.id })\n})",
		roles: ['server']
	},
	{
		name: 'app.delete(path, handler)',
		summary: 'Add an endpoint for DELETE requests.',
		example: "app.delete('/comments/:id', (req, res) => {\n  res.status(204).end()\n})",
		roles: ['server']
	},
	{
		name: 'req.params',
		summary:
			"The parts of the path caught by `:name` in the route. `/episodes/:id` with `/episodes/12` gives `{ id: '12' }`. Always text.",
		example: "app.get('/episodes/:id', (req, res) => {\n  res.json({ id: req.params.id })\n})",
		roles: ['server']
	},
	{
		name: 'req.query',
		summary:
			"What comes after `?` in the path. `/episodes?page=2` gives `{ page: '2' }`. Always text.",
		example: "app.get('/episodes', (req, res) => {\n  res.json({ page: req.query.page })\n})",
		roles: ['server']
	},
	{
		name: 'req.body',
		summary: 'The data the phone sent with a POST or PUT request.',
		example: "app.post('/comments', (req, res) => {\n  res.json(req.body)\n})",
		roles: ['server']
	},
	{
		name: 'req.headers',
		summary: 'Extra labels on the request, like a login token. The names are always lower case.',
		example: "app.get('/me', (req, res) => {\n  res.json({ token: req.headers.token })\n})",
		roles: ['server']
	},
	{
		name: 'res.status(code)',
		summary: 'Set the status code of the answer, like `404` or `201`. Put it before `.json()`.',
		example: "app.get('/nope', (req, res) => {\n  res.status(404).json({ error: 'Not here' })\n})",
		roles: ['server']
	},
	{
		name: 'res.json(value)',
		summary:
			'Send the answer as JSON: an object or a list. Every request needs exactly one answer.',
		example: "app.get('/hello', (req, res) => {\n  res.json({ message: 'Hello' })\n})",
		roles: ['server']
	},
	{
		name: 'res.send(value)',
		summary: 'Send the answer as plain text (objects and lists are sent as JSON).',
		example: "app.get('/ping', (req, res) => {\n  res.send('pong')\n})",
		roles: ['server']
	},
	{
		name: 'res.end()',
		summary: 'Send an answer with nothing in it, often after `res.status(204)`.',
		example: "app.delete('/comments/:id', (req, res) => {\n  res.status(204).end()\n})",
		roles: ['server']
	},
	{
		name: 'db.all(sql, params)',
		summary:
			'Run a query and get back a list of rows. Each `?` in the SQL is filled with the next value from the list.',
		example:
			"const rows = db.all('SELECT * FROM episodes WHERE series_id = ?', [1])\nlog(rows.length)",
		roles: ['server']
	},
	{
		name: 'db.get(sql, params)',
		summary: 'Run a query and get back just the first row, or `undefined` when there is none.',
		example: "const one = db.get('SELECT * FROM series WHERE id = ?', [1])\nlog(one.title)",
		roles: ['server']
	},
	{
		name: 'db.run(sql, params)',
		summary:
			'Run a change (INSERT, UPDATE, DELETE). You get back how many rows changed and the id of a new row.',
		example:
			"const info = db.run('UPDATE episodes SET likes = likes + 1 WHERE id = ?', [1])\nlog(info.changes)",
		roles: ['server']
	},
	{
		name: 'hash(text)',
		summary:
			"Scramble a password into a fixed-length fingerprint. The same text always gives the same fingerprint, but there's no way back to the password. Store this, never the password itself.",
		example: "const fingerprint = hash('mina-pass')\nlog(fingerprint)",
		roles: ['server']
	},
	{
		name: 'hashMatches(text, hash)',
		summary:
			'Check what someone typed against a fingerprint you stored with `hash()`. Gives `true` when they match, without ever un-scrambling anything.',
		example: "const stored = hash('mina-pass')\nlog(hashMatches('mina-pass', stored))",
		roles: ['server']
	},
	{
		name: 'escape(text)',
		summary:
			'Make text safe to put on a page: `<` becomes `&lt;` and so on, so a tag someone typed is shown as text instead of being run.',
		example: "log(escape('<b>hello</b>'))",
		roles: ['server']
	},
	{
		name: 'env',
		summary:
			'Settings for the server, like `env.PORT`, kept outside the code so they can change without editing it.',
		example: 'log(env)',
		roles: ['server']
	},
	// ---- both ----
	{
		name: 'log(value)',
		summary:
			'Write a line in the log, a diary only developers read. Good for checking what is going on.',
		example: "log('Hello, log')",
		roles: ['client', 'server']
	},
	...SQL_COMMANDS
];

/** The net world: networks (`flavour: 'network'`) and the cloud (`flavour: 'cloud'`). See docs/INFRA.md. */
const NET_COMMANDS: CommandDoc[] = [
	// ---- network ----
	{
		name: 'lookup(name)',
		summary:
			"Ask the DNS server, the internet's phone book, for the address behind a name. You get `null` when it doesn't know the name.",
		example: "const ip = lookup('inkwell.app')\nlog(ip)",
		flavours: ['network']
	},
	{
		name: 'ping(host)',
		summary:
			"Send a tiny message to a machine and time the trip there. You get the milliseconds, or `'unreachable'` when no way leads there.",
		example: "log(ping('inkwell.app'))",
		flavours: ['network']
	},
	{
		name: 'connect(host, port)',
		summary:
			"Knock on one door (port) of a machine. You get `'open'`, `'closed'` (nobody there), `'filtered'` (a firewall said no), `'no route'` or `'unknown host'`.",
		example: "log(connect('inkwell.app', 443))",
		flavours: ['network']
	},
	{
		name: 'trace(host)',
		summary:
			'List every machine a message passes on its way there. An empty list means it never arrived; the log says where it stopped.',
		example: "log(trace('inkwell.app'))",
		flavours: ['network']
	},
	{
		name: 'allow(node, port)',
		summary: 'Let messages for this port through a firewall or into a machine.',
		example: "allow('inkwell-fw', 443)",
		flavours: ['network']
	},
	{
		name: 'block(node, port)',
		summary: 'Stop messages for this port at a firewall or a machine.',
		example: "block('inkwell-fw', 22)",
		flavours: ['network']
	},
	{
		name: 'listen(node, port, name)',
		summary: 'Start a program on a machine that answers on this port.',
		example: "listen('inkwell-web', 443, 'reader')",
		flavours: ['network']
	},
	{
		name: 'addRecord(name, ip)',
		summary: 'Teach the DNS server which address a name belongs to.',
		example: "addRecord('inkwell.app', '203.0.113.10')",
		flavours: ['network']
	},
	// ---- cloud ----
	{
		name: 'deploy(name, options)',
		summary:
			'Start your app in the cloud: give it a name, the image (your app packed in a box) and how many copies to run.',
		example: "deploy('reader', { image: 'reader:1.0', replicas: 2 })",
		flavours: ['cloud']
	},
	{
		name: 'scale(name, count)',
		summary: 'Change how many copies of a service run. More copies can serve more readers at once.',
		example: "scale('reader', 4)",
		flavours: ['cloud']
	},
	{
		name: 'route(path, service)',
		summary:
			'Tell the load balancer which service answers requests whose path starts with this. The longest match wins.',
		example: "route('/', 'reader')",
		flavours: ['cloud']
	},
	{
		name: 'release(name, image)',
		summary:
			'Switch a service to a new version, one copy at a time, so readers never see it go away.',
		example: "release('reader', 'reader:1.1')",
		flavours: ['cloud']
	},
	{
		name: 'health(name, path)',
		summary:
			'Give the load balancer a page to check on every copy. Copies that fail the check get no traffic, and a broken release stops.',
		example: "health('reader', '/health')",
		flavours: ['cloud']
	},
	{
		name: 'env(name, key, value)',
		summary:
			'Give a service a setting from outside its image, so the same image works in every place.',
		example: "env('reader', 'DB_URL', 'postgres://db')",
		flavours: ['cloud']
	},
	// ---- both ----
	{
		name: 'log(value)',
		summary: 'Write a line in the log, so you can see what an answer was.',
		example: "log(lookup('inkwell.app'))",
		flavours: ['network', 'cloud']
	}
];

/** Bare command names for one flavour of the net world, e.g. network → ['lookup', 'ping', …, 'log'] */
export function netCommandNames(flavour: NetFlavour): string[] {
	return NET_COMMANDS.filter((c) => c.flavours?.includes(flavour)).map((c) =>
		c.name.replace(/\(.*$/, '').trim()
	);
}

/**
 * Cheat-sheet names for one role of the web world, without the bracket part:
 * client → ['get', 'post', …, 'res.status', …], server → ['app.get', …, 'db.all', …, 'SELECT', …],
 * sql → ['SELECT', 'WHERE', 'ORDER BY', …].
 */
export function webCommandNames(role: WebRole): string[] {
	return COMMANDS.web
		.filter((c) => c.roles?.includes(role))
		.map((c) => c.name.replace(/\(.*$/, '').trim())
		.filter((n, i, all) => all.indexOf(n) === i);
}

export const COMMANDS: Record<WorldKind, CommandDoc[]> = {
	grid: [
		{ name: 'move()', summary: 'Move {hero} one square forward.', example: 'move()' },
		{
			name: 'turnLeft()',
			summary: '{Hero} turns a quarter turn to the left, staying on the same square.',
			example: 'turnLeft()'
		},
		{
			name: 'turnRight()',
			summary: '{Hero} turns a quarter turn to the right, staying on the same square.',
			example: 'turnRight()'
		},
		{
			name: 'pickUp()',
			summary: 'Pick up the {item} {hero} is standing on.',
			example: 'pickUp()'
		},
		{
			name: 'say(text)',
			summary: '{Hero} says something out loud. Put words in quotes.',
			example: 'say("Hello!")'
		},
		{
			name: 'pathAhead()',
			summary:
				'Is the square in front of {hero} free? `true` means yes. `false` means no: a {wall} or the edge is in the way.',
			example: 'if (pathAhead()) {\n  move()\n}'
		},
		{
			name: 'pathLeft()',
			summary: 'Is the square to the left of {hero} free? `true` for yes, `false` for no.',
			example: 'if (pathLeft()) {\n  turnLeft()\n}'
		},
		{
			name: 'pathRight()',
			summary: 'Is the square to the right of {hero} free? `true` for yes, `false` for no.',
			example: 'if (pathRight()) {\n  turnRight()\n}'
		},
		{
			name: 'onItem()',
			summary: 'Is {hero} standing on a {item}? `true` for yes, `false` for no.',
			example: 'if (onItem()) {\n  pickUp()\n}'
		},
		{
			name: 'atGoal()',
			summary: 'Is {hero} on the {goal} yet? `true` for yes, `false` for no.',
			example: 'while (!atGoal()) {\n  move()\n}'
		},
		{
			name: 'itemsLeft()',
			summary: 'How many {items} are still waiting to be picked up.',
			example: 'say(itemsLeft())'
		}
	],
	console: [
		{
			name: 'print(value)',
			summary: 'Show a line in the output: text in quotes, a number, or a variable.',
			example: 'print("Hello")'
		},
		{
			name: 'print(a, b, …)',
			summary: 'Show several things on one line, with a space between each.',
			example: 'print("Score:", score)'
		}
	],
	canvas: [
		{
			name: 'background(color)',
			summary: 'Fill the whole canvas with one colour.',
			example: 'background("skyblue")'
		},
		{
			name: 'color(name)',
			summary:
				'Pick the colour for the shapes you draw next. Any colour name works, like `"red"`, `"gold"` or `"#ff8800"`.',
			example: 'color("tomato")'
		},
		{
			name: 'circle(x, y, size)',
			summary:
				'Draw a circle with its middle at x, y. Size is how far the edge is from the middle.',
			example: 'circle(150, 150, 40)'
		},
		{
			name: 'rect(x, y, width, height)',
			summary: 'Draw a rectangle. x, y is its top-left corner.',
			example: 'rect(50, 50, 100, 80)'
		},
		{
			name: 'line(x1, y1, x2, y2)',
			summary: 'Draw a straight line from x1, y1 to x2, y2.',
			example: 'line(0, 0, 300, 300)'
		},
		{
			name: 'text(x, y, words)',
			summary: 'Write words on the canvas, starting at x, y.',
			example: 'text(20, 40, "Hello")'
		},
		{
			name: 'width, height',
			summary:
				'The size of the canvas (300 by 300 unless the lesson says otherwise). x goes right from 0, y goes down from 0 at the top.',
			example: 'circle(width / 2, height / 2, 50)'
		}
	],
	web: WEB_COMMANDS,
	net: NET_COMMANDS,
	// placeholder: filled by the git world (worlds/git.ts)
	git: []
};

/** Bare command names per world (no brackets), e.g. ['move', 'turnLeft', …] */
export function commandNames(kind: WorldKind): string[] {
	return COMMANDS[kind]
		.filter((c) => !SQL_COMMANDS.includes(c))
		.map((c) => c.name.match(/^([A-Za-z_$][\w$]*)\(/)?.[1])
		.filter((n): n is string => !!n)
		.filter((n, i, all) => all.indexOf(n) === i);
}

export const SYNTAX: SyntaxDoc[] = [
	{
		id: 'comment',
		name: 'Comments',
		summary: 'Anything after `//` is a note for humans. JavaScript skips it.',
		example: '// go around the corner\nmove()'
	},
	{
		id: 'let-variable',
		name: 'Variables',
		summary:
			'`let` makes a box with a name that holds a value. Later you can put a new value in it with `=`.',
		example: 'let score = 0\nscore = score + 1\nprint(score)'
	},
	{
		id: 'text-join',
		name: 'Joining text',
		summary: 'Use `+` to stick pieces of text (and numbers) together.',
		example: 'let name = "Ada"\nprint("Hello, " + name)'
	},
	{
		id: 'compare',
		name: 'Comparing',
		summary:
			'`===` asks "are these the same?", `!==` asks "are they different?". `<`, `>`, `<=`, `>=` compare numbers. The answer is `true` or `false`.',
		example: 'score > 10\nname === "Ada"'
	},
	{
		id: 'and-or-not',
		name: 'And, or, not',
		summary: '`&&` means and, `||` means or, `!` means not.',
		example: 'if (pathAhead() && !onItem()) {\n  move()\n}'
	},
	{
		id: 'if',
		name: 'if',
		summary:
			'Runs the lines inside `{ }` only when the answer to the question in `( )` is yes (`true`).',
		example: 'if (onItem()) {\n  pickUp()\n}'
	},
	{
		id: 'if-else',
		name: 'if … else',
		summary: "Does one thing when the answer is yes, and something else when it's no.",
		example: 'if (pathAhead()) {\n  move()\n} else {\n  turnLeft()\n}'
	},
	{
		id: 'while-loop',
		name: 'while loop',
		summary:
			'Repeats the lines inside `{ }` for as long as the answer to the question in `( )` is yes. If the answer never changes, it never stops.',
		example: 'while (!atGoal()) {\n  move()\n}'
	},
	{
		id: 'for-loop',
		name: 'for loop',
		summary:
			'Repeat something a set number of times. `i` counts 0, 1, 2 … and the loop stops when `i < 3` is no longer true.',
		example: 'for (let i = 0; i < 3; i++) {\n  move()\n}'
	},
	{
		id: 'function',
		name: 'Functions',
		summary:
			'Give a few lines a name, then run them whenever you like by writing the name with `()`.',
		example: 'function turnAround() {\n  turnLeft()\n  turnLeft()\n}\n\nturnAround()'
	},
	{
		id: 'function-params',
		name: 'Function inputs',
		summary:
			'A function can take inputs in its `( )`, so it can do slightly different things each time.',
		example:
			'function walk(steps) {\n  for (let i = 0; i < steps; i++) {\n    move()\n  }\n}\n\nwalk(3)'
	},
	{
		id: 'return',
		name: 'return',
		summary: '`return` hands a value back from a function, and ends it right there.',
		example: 'function double(n) {\n  return n * 2\n}\n\nprint(double(4))'
	},
	{
		id: 'array',
		name: 'Lists (arrays)',
		summary:
			'A list of values in `[ ]`. Count from 0: the first item is `list[0]`. `.length` tells you how many.',
		example: 'let pets = ["cat", "dog"]\nprint(pets[0])\nprint(pets.length)'
	}
];
