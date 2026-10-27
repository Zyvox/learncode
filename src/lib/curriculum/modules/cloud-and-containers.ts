import type { Module, NetNode, NetWorldSpec } from '#lib/curriculum/types.ts';

const M = 'cloud-and-containers';

/** One container serves this many requests per traffic batch. */
const CAPACITY = 10;

/** The images Jun has built. `reader:1.2` (night mode) fails its health check. */
const IMAGES: NonNullable<NetWorldSpec['images']> = {
	'reader:1.0': { port: 3000, capacity: CAPACITY },
	'reader:1.1': { port: 3000, capacity: CAPACITY },
	'reader:1.2': { port: 3000, capacity: CAPACITY, unhealthy: true },
	'comments:1.0': { port: 3000, capacity: CAPACITY }
};

/**
 * Inkwell's corner of the cloud: readers' phones → the load balancer → the `eu-west` region
 * (containers appear inside it) → the database. `containers` are already running when the
 * level starts (pre-provisioned, e.g. one that crashed overnight).
 */
function region(
	extra: Partial<NetWorldSpec> = {},
	containers: Omit<NetNode, 'kind'>[] = []
): NetWorldSpec {
	return {
		kind: 'net',
		flavour: 'cloud',
		at: 'readers',
		nodes: [
			{ id: 'readers', kind: 'phone' },
			{ id: 'lb', kind: 'lb', label: 'load balancer' },
			{ id: 'eu-west', kind: 'cloud' },
			{ id: 'inkwell-db', kind: 'db' },
			...containers.map((c): NetNode => ({ ...c, kind: 'container' }))
		],
		links: [
			{ from: 'readers', to: 'lb' },
			{ from: 'lb', to: 'eu-west' },
			{ from: 'eu-west', to: 'inkwell-db' },
			...containers.map((c) => ({ from: 'eu-west', to: c.id }))
		],
		images: IMAGES,
		traffic: [{ count: 5, path: '/', label: 'five readers' }],
		...extra
	};
}

export const cloudAndContainers: Module = {
	id: M,
	track: 'web',
	order: 17,
	emoji: '☁️',
	title: 'Cloud and containers',
	blurb:
		'What “it runs in containers in the cloud” actually means: the app in a box, copies of the box, a receptionist in front, and releases that can’t take the app down.',
	prereq: 'Easier if you’ve done Learn to code, parts 1–5 (variables, if, loops, functions).',
	lessons: [
		{
			id: `${M}/01-deploy`,
			slug: '01-deploy',
			kind: 'code',
			title: 'The app in a box',
			xp: 15,
			story:
				'Inkwell has outgrown its one rented server. Jun has packed the reader app into an image called `reader:1.0`, and Theo has opened an account with a cloud provider: a region called `eu-west`, somebody else’s datacentre, somewhere in Europe. Five readers are waiting to try it.',
			task: 'Jun’s line already starts one copy of the app. Run it and see what the readers get, then tell the load balancer to send every path (`/`) to the `reader` service.',
			concept: {
				title: 'Box, machine, region',
				panels: [
					{
						who: 'theo',
						text: 'Jun says we should “put the app in containers in the cloud”. I nodded. What did I agree to?',
						scene: 'none'
					},
					{
						who: 'you',
						text: 'Jun has packed the reader app in a box with everything it needs to run: the code, the right version of Node, the lot. The packed box is an **image**.',
						scene: 'server',
						code: "'reader:1.0'   // the app's name : its version"
					},
					{
						who: 'bit',
						text: 'A running copy of the image is a **container**. Same box, same behaviour, on Jun’s laptop or in a datacentre. No more “works on my machine”.',
						scene: 'server'
					},
					{
						who: 'you',
						text: 'And **the cloud** is someone else’s machines, rented by the hour, in a **region** like `eu-west`. We say what to run; they find a machine for it.',
						scene: 'cloud',
						code: "deploy('reader', { image: 'reader:1.0', replicas: 1 })"
					},
					{ who: 'mina', text: 'And how do readers find the box?', scene: 'phone' },
					{
						who: 'you',
						text: 'Through the **load balancer**, the front door. It has to be told which paths go to which service.',
						scene: 'wire',
						code: "route('/', 'reader')"
					}
				]
			},
			newCommands: ['deploy(name, options)', 'route(path, service)'],
			hints: [
				'Run it first. Every reader gets `404`: the app is running, but the load balancer doesn’t know to send anyone there.',
				"`route(path, service)` tells the load balancer where a path goes. `'/'` matches every path.",
				"```js\ndeploy('reader', { image: 'reader:1.0', replicas: 1 })\nroute('/', 'reader')\n```"
			],
			world: region(),
			starterCode: `deploy('reader', { image: 'reader:1.0', replicas: 1 })
`,
			solution: `deploy('reader', { image: 'reader:1.0', replicas: 1 })
route('/', 'reader')
`,
			checks: [
				{ type: 'cloud-replicas', service: 'reader', min: 1 },
				{ type: 'cloud-route', path: '/', service: 'reader' },
				{
					type: 'cloud-success-rate',
					min: 1,
					message:
						'Not every reader got the app yet. The container is running; the load balancer needs to send them there.'
				}
			]
		},
		{
			id: `${M}/02-scale`,
			slug: '02-scale',
			kind: 'code',
			title: 'Episode 5 drops at six',
			xp: 20,
			story:
				'At six o’clock episode 5 of Moonlit Deliveries goes up, and forty readers tap it in the same second. One container can look after ten readers at a time.',
			task: 'Use `scale()` to run enough copies of `reader` that at least 95% of the forty get the episode, without paying for more copies than you need.',
			concept: {
				title: 'A receptionist for machines',
				panels: [
					{
						who: 'narrator',
						text: '18:00. Episode 5. Forty readers at once.',
						scene: 'phone'
					},
					{
						who: 'bit',
						text: 'One container serves ten readers. Reader number eleven gets a `503`: “too busy, try later”.',
						scene: 'server'
					},
					{
						who: 'you',
						text: 'So we run more copies of the same box. `scale()` says how many.',
						scene: 'cloud',
						code: "scale('reader', 4)"
					},
					{
						who: 'mina',
						text: 'But readers only know one address. How do they get spread out?',
						scene: 'none'
					},
					{
						who: 'you',
						text: 'The load balancer is a receptionist for machines. Every request goes to the next copy in turn, so nobody gets buried.',
						scene: 'wire'
					},
					{
						who: 'theo',
						text: 'And every copy is a machine I’m paying for by the hour, so: enough, not more.',
						scene: 'none'
					}
				]
			},
			newCommands: ['scale(name, count)'],
			hints: [
				'Run it and read the log: ten readers get in, thirty get `503`. One copy serves ten at a time.',
				'Forty readers, ten each. How many copies is that? Add `scale(\'reader\', …)` after the `deploy`.',
				"```js\ndeploy('reader', { image: 'reader:1.0', replicas: 1 })\nscale('reader', 4)\nroute('/', 'reader')\n```"
			],
			world: region({ traffic: [{ count: 40, path: '/episodes/5', label: 'episode 5 drops' }] }),
			starterCode: `deploy('reader', { image: 'reader:1.0', replicas: 1 })
route('/', 'reader')
`,
			solution: `deploy('reader', { image: 'reader:1.0', replicas: 1 })
scale('reader', 4)
route('/', 'reader')
`,
			checks: [
				{ type: 'cloud-success-rate', min: 0.95 },
				{
					type: 'code-includes',
					pattern: 'scale\\s*\\(',
					message:
						"Use `scale('reader', …)` to change how many copies run. It’s what you reach for when the crowd is already at the door."
				},
				{ type: 'cloud-replicas', service: 'reader', min: 4, max: 6 }
			]
		},
		{
			id: `${M}/03-two-services`,
			slug: '03-two-services',
			kind: 'code',
			title: 'Comments get their own box',
			xp: 20,
			story:
				'Jun has split the comments out of the reader app into their own image, `comments:1.0`, so that a flood of opinions can never slow down reading. Right now every comment request still lands on the reader app.',
			task: 'Deploy `comments:1.0` as a service called `comments`, and send `/comments` to it. Reading (`/episodes/…`) stays with `reader`.',
			concept: {
				title: 'The longest match wins',
				body: 'The load balancer looks at the start of each path. `/comments/5` starts with `/`, and it also starts with `/comments`. When more than one route fits, the **longest one wins**, so `/comments/5` goes to `comments` and everything else falls through to `/`.\n\nThat makes `route(\'/\', …)` the catch-all: whatever no other route claims ends up there.'
			},
			hints: [
				'Two lines, in the same shape as the reader’s: a `deploy` with the comments image, then a `route` for `/comments`.',
				"`deploy('comments', { image: 'comments:1.0', replicas: 1 })`, then `route('/comments', 'comments')`. Leave the `/` route where it is.",
				"```js\ndeploy('reader', { image: 'reader:1.0', replicas: 2 })\nroute('/', 'reader')\n\ndeploy('comments', { image: 'comments:1.0', replicas: 1 })\nroute('/comments', 'comments')\n```"
			],
			world: region({
				traffic: [
					{ count: 10, path: '/episodes/5', label: 'readers' },
					{ count: 10, path: '/comments/5', label: 'commenters' }
				]
			}),
			starterCode: `deploy('reader', { image: 'reader:1.0', replicas: 2 })
route('/', 'reader')

// comments next
`,
			solution: `deploy('reader', { image: 'reader:1.0', replicas: 2 })
route('/', 'reader')

deploy('comments', { image: 'comments:1.0', replicas: 1 })
route('/comments', 'comments')
`,
			checks: [
				{ type: 'cloud-replicas', service: 'comments', min: 1 },
				{
					type: 'cloud-route',
					path: '/comments',
					service: 'comments',
					message:
						"Comment requests still go to the reader app. Add `route('/comments', 'comments')`: the longer route wins for `/comments/5`."
				},
				{ type: 'cloud-route', path: '/', service: 'reader' },
				{ type: 'cloud-success-rate', min: 1 }
			]
		},
		{
			id: `${M}/04-predict-crash`,
			slug: '04-predict-crash',
			kind: 'predict',
			title: 'Three copies, one crash',
			xp: 15,
			story:
				'Theo, looking at the bill: “Why do we pay for three copies of the reader when one does the job most mornings?” Then, overnight, `reader-1` crashes. Nobody notices. The morning readers arrive.',
			task: 'Decide what happens to the ten morning readers.',
			code: `// Overnight, reader-1 crashed. reader-2 and reader-3 are fine.
// Each container serves 10 readers at a time.
// The morning: 10 readers open the app.
route('/', 'reader')
`,
			world: region({ traffic: [{ count: 10, path: '/', label: 'morning readers' }] }, [
				{ id: 'reader-1', service: 'reader', image: 'reader:1.0', down: true },
				{ id: 'reader-2', service: 'reader', image: 'reader:1.0' },
				{ id: 'reader-3', service: 'reader', image: 'reader:1.0' }
			]),
			question: 'What do the ten morning readers get?',
			choices: [
				'About a third get an error: every third reader is still sent to `reader-1`',
				'All ten get the app: the load balancer only sends readers to copies that answer',
				'All ten get an error: one crashed copy takes the whole service down',
				'Nobody gets in until someone restarts `reader-1`'
			],
			answer: 1,
			explanation:
				'A crashed container is easy to spot: nothing answers at all, so the load balancer stops sending readers there and shares them between `reader-2` and `reader-3`, five each, well inside their ten. Nobody notices. With only one copy, that same crash means every reader gets `503`, because there’s nobody left to answer. That’s the other reason to run more than one copy: not just for crowds, but so one crash isn’t an outage. (A copy that is up but *broken* is harder to spot. That’s next.)',
			hints: [
				'Would a receptionist keep sending visitors to an empty office?',
				'Two copies are left, ten readers arrive, and each copy serves ten. Is that enough?'
			]
		},
		{
			id: `${M}/05-fix-release`,
			slug: '05-fix-release',
			kind: 'fix',
			title: 'Roll it out, safely',
			xp: 25,
			story:
				'Jun’s `reader:1.2` has night mode, and Theo has promised it to readers today. The last time a new version went out, the app was down for twenty minutes and Theo found out from a reader. Here is Jun’s release script. Run it and you’ll see why Theo is nervous.',
			task: 'Make the release safe: the load balancer should check `/health` on every `reader` container before the release starts, so a broken version gets stopped and the old one keeps serving. Keep the `release` line: it’s going out today either way.',
			concept: {
				title: 'Health checks and rolling releases',
				panels: [
					{
						who: 'theo',
						text: 'Last release, the app was down for twenty minutes. I found out from a reader.',
						scene: 'phone'
					},
					{
						who: 'you',
						text: 'This time it **rolls**: `release()` swaps one container at a time, so the others keep serving while it happens.',
						scene: 'cloud',
						code: "release('reader', 'reader:1.2')"
					},
					{
						who: 'bit',
						text: 'And with a **health check**, the load balancer knocks on each container’s `/health` page. No good answer, no readers.',
						scene: 'server',
						code: "health('reader', '/health')"
					},
					{
						who: 'narrator',
						text: 'Set the check before the release, and a broken version is caught at the very first container. The release stops there, and the old version carries on.',
						scene: 'none'
					},
					{ who: 'mina', text: 'And if nobody set the check?', scene: 'none' },
					{
						who: 'you',
						text: 'Then the release swaps every copy, one by one, and every reader gets the broken one.',
						scene: 'none'
					}
				]
			},
			newCommands: ['release(name, image)', 'health(name, path)'],
			hints: [
				'Run it. Every reader gets `500`: the release swapped all three copies to 1.2, and 1.2 is broken.',
				"Add `health('reader', '/health')` somewhere *before* the `release` line. Order matters: a check set after the release is too late to stop it.",
				"```js\ndeploy('reader', { image: 'reader:1.1', replicas: 3 })\nroute('/', 'reader')\nhealth('reader', '/health')\n\nrelease('reader', 'reader:1.2')\n```"
			],
			world: region({ traffic: [{ count: 20, path: '/episodes/5', label: 'readers' }] }),
			starterCode: `deploy('reader', { image: 'reader:1.1', replicas: 3 })
route('/', 'reader')

release('reader', 'reader:1.2')
`,
			solution: `deploy('reader', { image: 'reader:1.1', replicas: 3 })
route('/', 'reader')
health('reader', '/health')

release('reader', 'reader:1.2')
`,
			checks: [
				{
					type: 'cloud-success-rate',
					min: 0.95,
					message:
						'Readers still aren’t getting the app. The health check has to be in place *before* the release, so the broken version is caught at the first container.'
				},
				{
					type: 'log-includes',
					text: 'keeping the old one',
					message:
						'Keep the `release()` line: night mode goes out today. With the health check set first, the load balancer gets to judge it.'
				}
			]
		},
		{
			id: `${M}/06-fix-env`,
			slug: '06-fix-env',
			kind: 'fix',
			title: 'Settings live outside the box',
			xp: 20,
			story:
				'For a test, Jun built `reader:1.1-local` on his laptop, with the database address typed right into the code: `postgres://localhost:5432/inkwell`. On his laptop the database *is* `localhost`. In the cloud, `localhost` means “this very container”, and there’s no database in there.',
			task: 'Deploy the plain `reader:1.1` image instead, and give the `reader` service its database address from the outside: `DB_URL` should be `postgres://inkwell-db:5432/inkwell`.',
			concept: {
				title: 'Same box, different settings',
				body: 'Remember `env.DB_PATH` from Shipping it? Same idea, one level up. An image should be identical everywhere: on Jun’s laptop, in a test region, in `eu-west`. Whatever changes from place to place, like where the database is, goes in from the outside as a setting:\n```js\nenv(\'reader\', \'DB_URL\', \'postgres://inkwell-db:5432/inkwell\')\n```\nThe service has to exist before it can get settings, so `env()` comes after `deploy()`.'
			},
			newCommands: ['env(name, key, value)'],
			hints: [
				'Run it. Every reader gets `500`: the containers start, go looking for a database on `localhost`, and find nothing.',
				"Swap the image for `'reader:1.1'`, then add `env('reader', 'DB_URL', 'postgres://inkwell-db:5432/inkwell')` after the `deploy`.",
				"```js\ndeploy('reader', { image: 'reader:1.1', replicas: 2 })\nenv('reader', 'DB_URL', 'postgres://inkwell-db:5432/inkwell')\nroute('/', 'reader')\n```"
			],
			world: region({
				images: {
					...IMAGES,
					// localhost inside a container is the container itself: no database there
					'reader:1.1-local': { port: 3000, capacity: CAPACITY, unhealthy: true }
				},
				traffic: [{ count: 15, path: '/episodes/5', label: 'readers' }]
			}),
			starterCode: `// reader:1.1-local has DB_URL = 'postgres://localhost:5432/inkwell'
// typed into its code. Fine on Jun's laptop. Not here.
deploy('reader', { image: 'reader:1.1-local', replicas: 2 })
route('/', 'reader')
`,
			solution: `deploy('reader', { image: 'reader:1.1', replicas: 2 })
env('reader', 'DB_URL', 'postgres://inkwell-db:5432/inkwell')
route('/', 'reader')
`,
			checks: [
				{
					type: 'cloud-success-rate',
					min: 0.95,
					message:
						'Readers are getting `500`s: the containers can’t find their database. Run the plain `reader:1.1` image and give it the address from outside.'
				},
				{
					type: 'code-includes',
					pattern: 'env\\s*\\(\\s*[\'"]reader[\'"]\\s*,\\s*[\'"]DB_URL[\'"]\\s*,\\s*[\'"][^\'"]*inkwell-db',
					message:
						"Give `reader` its database address from the outside: `env('reader', 'DB_URL', 'postgres://inkwell-db:5432/inkwell')`."
				},
				{
					type: 'code-excludes',
					pattern: 'localhost',
					message:
						'In the cloud, `localhost` is the container itself, and there’s no database inside it. The database is `inkwell-db`.'
				}
			]
		},
		{
			id: `${M}/07-boss-launch-day`,
			slug: '07-boss-launch-day',
			kind: 'code',
			boss: true,
			title: 'Launch day',
			xp: 50,
			story:
				'Season two of Moonlit Deliveries launches at noon. Theo has told everyone he knows and quite a few people he doesn’t. The plan is a sticky note on the edge of your screen, and Jun’s night mode is on it, because Theo promised.',
			task: 'Get `reader` and `comments` running in `eu-west` with enough copies for the wave, both routed, with health checks on, and ship Jun’s `reader:1.2` safely. At least 95% of readers must get an answer, and Theo pays for every copy: at most 15 of `reader` and 5 of `comments`.',
			hints: [
				'Read the log after a run: it shows each wave and how it went. The biggest is 120 readers at once, and each copy serves ten.',
				'Order matters: deploy both services, put health checks on them, route `/` and `/comments`, and only then `release()`. With the checks on, the broken version is stopped at the first copy.',
				"```js\ndeploy('reader', { image: 'reader:1.1', replicas: 12 })\ndeploy('comments', { image: 'comments:1.0', replicas: 3 })\nhealth('reader', '/health')\nhealth('comments', '/health')\nroute('/', 'reader')\nroute('/comments', 'comments')\nrelease('reader', 'reader:1.2')\n```"
			],
			world: region({
				traffic: [
					{ count: 10, path: '/', label: 'a quiet morning' },
					{ count: 60, path: '/episodes/5', label: 'Theo posts the link' },
					{ count: 120, path: '/episodes/5', label: 'the wave' },
					{ count: 30, path: '/comments/5', label: 'everyone has opinions' }
				]
			}),
			starterCode: `// Launch day. Theo's sticky note:
//  - the reader app (reader:1.1) on '/', enough copies for the wave
//  - comments (comments:1.0) on '/comments'
//  - health checks on everything, BEFORE Jun's release
//  - night mode goes out today: release('reader', 'reader:1.2')
//
// Theo's guess for the wave: "a hundred? maybe more?"
deploy('reader', { image: 'reader:1.1', replicas: 1 })
route('/', 'reader')
`,
			solution: `deploy('reader', { image: 'reader:1.1', replicas: 12 })
deploy('comments', { image: 'comments:1.0', replicas: 3 })
health('reader', '/health')
health('comments', '/health')
route('/', 'reader')
route('/comments', 'comments')
release('reader', 'reader:1.2')
`,
			checks: [
				{ type: 'cloud-route', path: '/', service: 'reader' },
				{ type: 'cloud-route', path: '/comments', service: 'comments' },
				{ type: 'cloud-success-rate', min: 0.95 },
				{
					type: 'log-includes',
					text: 'keeping the old one',
					message:
						"Night mode is on the sticky note: `release('reader', 'reader:1.2')`, after the health checks are on, so they get to judge it."
				},
				{ type: 'cloud-replicas', service: 'reader', min: 1, max: 15 },
				{ type: 'cloud-replicas', service: 'comments', min: 1, max: 5 }
			],
			outro: {
				panels: [
					{
						who: 'narrator',
						text: '12:00. The counter on Theo’s screen starts to move. 10. 70. 190. 220.',
						scene: 'cloud'
					},
					{
						who: 'theo',
						text: 'Two hundred and twenty readers in the first minute, and the app didn’t even blink. Is it meant to be this boring?',
						scene: 'none'
					},
					{
						who: 'you',
						text: 'Boring is what working looks like. Night mode didn’t make it, by the way: the health check stopped it at the first copy. Jun is fixing it, and no reader will ever know.',
						scene: 'server'
					},
					{
						who: 'mina',
						text: 'The first comment on episode 5 is someone asking when episode 6 is out.',
						scene: 'phone'
					},
					{
						who: 'bit',
						text: 'Twelve identical boxes today. I loved every one of them.',
						scene: 'wire'
					}
				]
			}
		}
	]
};
