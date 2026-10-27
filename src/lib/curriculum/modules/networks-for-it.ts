import type { Module, NetNode, NetWorldSpec } from '#lib/curriculum/types.ts';

const M = 'networks-for-it';

/**
 * One network for the whole module: Mina's laptop in the Inkwell office, out through the office
 * router and firewall to the internet provider, then across to the server Inkwell rents (behind
 * its own firewall) and the database next to it. The DNS server hangs off the provider.
 * Levels change one thing each (a down router, a slow line, a wrong record, a firewall list).
 *
 * Trip times from the laptop: office-router 2 ms, office-fw 3 ms, isp 11 ms, inkwell.app 29 ms.
 */
function office(patch: (s: NetWorldSpec) => void = () => {}): NetWorldSpec {
	const spec: NetWorldSpec = {
		kind: 'net',
		flavour: 'network',
		at: 'laptop',
		nodes: [
			{ id: 'laptop', kind: 'laptop', label: 'Mina’s laptop', ip: '192.168.1.20' },
			{ id: 'office-router', kind: 'router', ip: '192.168.1.1' },
			{ id: 'office-fw', kind: 'firewall', ip: '192.168.1.254' },
			{ id: 'isp', kind: 'router', ip: '198.51.100.1' },
			{ id: 'dns', kind: 'dns', ip: '198.51.100.53' },
			{ id: 'inkwell-fw', kind: 'firewall', ip: '203.0.113.1', allow: [443] },
			{
				id: 'inkwell-web',
				kind: 'server',
				ip: '203.0.113.10',
				listens: { 443: 'reader', 22: 'ssh' }
			},
			{
				id: 'inkwell-db',
				kind: 'db',
				ip: '10.0.0.5',
				listens: { 5432: 'postgres' },
				allow: [5432]
			}
		],
		links: [
			{ from: 'laptop', to: 'office-router', latencyMs: 2 },
			{ from: 'office-router', to: 'office-fw', latencyMs: 1 },
			{ from: 'office-fw', to: 'isp', latencyMs: 8 },
			{ from: 'isp', to: 'dns', latencyMs: 4 },
			{ from: 'isp', to: 'inkwell-fw', latencyMs: 17 },
			{ from: 'inkwell-fw', to: 'inkwell-web', latencyMs: 1 },
			{ from: 'inkwell-fw', to: 'inkwell-db', latencyMs: 1 }
		],
		dns: { 'inkwell.app': '203.0.113.10' }
	};
	patch(spec);
	return spec;
}

const node = (s: NetWorldSpec, id: string): NetNode => s.nodes.find((n) => n.id === id)!;

export const networksForIt: Module = {
	id: M,
	track: 'web',
	order: 14,
	emoji: '🌐',
	title: 'Networks for IT',
	blurb:
		'Names, addresses, routes and doors: the four reasons “I can’t reach it” ever happens, and how to tell which one you’ve got.',
	prereq: 'Easier if you’ve done Learn to code, parts 1–5 (variables, if, loops, functions).',
	lessons: [
		{
			id: `${M}/01-lookup`,
			slug: '01-lookup',
			kind: 'code',
			title: 'A name is not an address',
			xp: 15,
			story:
				'Mina has typed `inkwell.app` into her browser a thousand times. This morning she asks the question nobody in the studio can answer: how does her laptop know where that *is*? Her laptop is on the left of the picture. Inkwell’s server is far over on the right.',
			task: 'Ask the DNS server for the address behind `inkwell.app` and log it. Then look up `inkwel.app` (one `l`, the way Mina types it before coffee) and log that too.',
			concept: {
				title: 'The phone book of the internet',
				panels: [
					{
						who: 'mina',
						text: 'I type `inkwell.app` and the app just appears. How does my laptop know where that is?',
						scene: 'phone'
					},
					{
						who: 'bit',
						text: 'It doesn’t. Names are for people. I travel to **addresses**: four numbers with dots between them.',
						scene: 'wire',
						code: '203.0.113.10'
					},
					{
						who: 'you',
						text: 'So before anything else, the laptop asks the **DNS server**, the internet’s phone book: name in, address out.',
						scene: 'cloud',
						code: "lookup('inkwell.app')   // '203.0.113.10'"
					},
					{
						who: 'narrator',
						text: 'Every trip on the internet starts with that question. When the phone book doesn’t know a name, the answer is `null`: no address, no trip.',
						scene: 'none'
					}
				]
			},
			newCommands: ['lookup(name)'],
			hints: [
				'`lookup()` takes a name in quotes and gives back its address. Wrap it in `log(...)` so you can see what came back.',
				"Two lines, one per name: `log(lookup('inkwell.app'))`, then the same with `'inkwel.app'`.",
				"Here it is:\n```js\nlog(lookup('inkwell.app'))\nlog(lookup('inkwel.app'))\n```\nThe second one gives `null`, and the log under it says why."
			],
			world: office(),
			starterCode: `// Where is inkwell.app? Right now this only logs the name itself.
log('inkwell.app')
`,
			solution: `log(lookup('inkwell.app'))
log(lookup('inkwel.app'))
`,
			checks: [
				{
					type: 'net-call-result',
					call: "lookup('inkwell.app')",
					result: '203.0.113.10',
					message: "Ask the DNS server with `lookup('inkwell.app')` and log what comes back."
				},
				{
					type: 'net-call-result',
					call: "lookup('inkwel.app')",
					result: 'null',
					message:
						"Now try Mina’s typo: `lookup('inkwel.app')`, with one `l`. What does the phone book say to a name it has never heard of?"
				}
			]
		},
		{
			id: `${M}/02-ping`,
			slug: '02-ping',
			kind: 'code',
			title: 'Is it the Wi-Fi?',
			xp: 15,
			story:
				'The app has felt sluggish all morning. Theo says it’s the Wi-Fi, because Theo always says it’s the Wi-Fi. A **ping** settles it: it sends a tiny message to a machine and times the trip.',
			task: 'Ping the office router (`office-router`) and the app (`inkwell.app`), and log both times. Which stretch of the trip is the slow one?',
			concept: {
				title: 'What “slow” means',
				body: 'A ping comes back in **milliseconds** (ms), thousandths of a second. Inside an office, a trip takes a few ms. Across a country, maybe 20 or 30. Under about 50 feels instant to a person.\n\nOpening one episode takes the app several trips, one after another, so a stretch that costs 150 ms every time adds up to a pause you can feel. Ping something near and something far, and the difference tells you where the time goes.'
			},
			newCommands: ['ping(host)'],
			hints: [
				"`ping()` takes an address or a name, like `ping('inkwell.app')`, and gives back the number of milliseconds. Machines in the picture can be pinged by their name too.",
				"You already have the router. Add `log(ping('inkwell.app'))` and compare the two numbers.",
				"```js\nlog(ping('office-router'))\nlog(ping('inkwell.app'))\n```\nIf you’re curious, ping `isp` too: the jump happens between the office and the provider."
			],
			world: office((s) => {
				s.links.find((l) => l.from === 'office-fw' && l.to === 'isp')!.latencyMs = 160;
			}),
			starterCode: `// Is it the Wi-Fi? Time a short trip and a long one.
log(ping('office-router'))
`,
			solution: `log(ping('office-router'))
log(ping('inkwell.app'))
`,
			checks: [
				{
					type: 'net-call-result',
					call: 'ping(',
					result: '2',
					message:
						"Ping the office router as well: `ping('office-router')`. It shows how the office part of the trip is doing."
				},
				{
					type: 'net-call-result',
					call: 'ping(',
					result: '181',
					message: "Ping the app too, `ping('inkwell.app')`, and log how long the whole trip takes."
				}
			],
			outro: {
				text: '2 ms to the router: the Wi-Fi is fine. 181 ms to the server, and 160 of them are spent on the one wire between the office and the provider. Theo rings the provider about the office’s internet line. He doesn’t mention the Wi-Fi again.'
			}
		},
		{
			id: `${M}/03-connect`,
			slug: '03-connect',
			kind: 'code',
			title: 'Knock on the door',
			xp: 20,
			story:
				'Jun, who writes most of Inkwell’s code, used to run a test copy of the reader app behind door 8080 of the server. He swears it’s still there. Mina wants to know which doors on the Inkwell server actually answer.',
			task: 'Knock on door 443 and door 8080 of `inkwell.app`, and log both answers.',
			concept: {
				title: 'One machine, many doors',
				body: 'A server runs several programs that talk to the network, and each one waits behind its own numbered door: a **port**. Door 443 is HTTPS, where the reader app lives. Door 22 is SSH, how admins like Jun log in to the machine from far away. Door 5432 is usually a Postgres database.\n\n`connect(host, port)` knocks on one door. `\'open\'` means a program answered. `\'closed\'` means you got all the way to the machine, but nobody is behind that door.'
			},
			newCommands: ['connect(host, port)'],
			hints: [
				"`connect()` takes the host and the port number (no quotes around the number): `connect('inkwell.app', 443)`.",
				"Log two knocks: `log(connect('inkwell.app', 443))` and the same for 8080.",
				"```js\nlog(connect('inkwell.app', 443))\nlog(connect('inkwell.app', 8080))\n```\nOne `open`, one `closed`: Jun’s test copy is long gone."
			],
			world: office((s) => {
				node(s, 'inkwell-fw').allow = [443, 8080];
			}),
			starterCode: `// The ping says the server is there. Which doors answer?
log(ping('inkwell.app'))
`,
			solution: `log(connect('inkwell.app', 443))
log(connect('inkwell.app', 8080))
`,
			checks: [
				{
					type: 'net-call-result',
					call: 'connect(',
					result: 'open',
					message:
						"Knock on the reader app’s door: `connect('inkwell.app', 443)`. It should come back `open`."
				},
				{
					type: 'net-call-result',
					call: 'connect(',
					result: 'closed',
					message:
						"Now knock on Jun’s old door, 8080: `connect('inkwell.app', 8080)`. Is anybody still behind it?"
				}
			]
		},
		{
			id: `${M}/04-predict-firewall`,
			slug: '04-predict-firewall',
			kind: 'predict',
			title: 'The door that says nothing',
			xp: 15,
			story:
				'The Inkwell server listens on two doors: 443 for the reader app and 22 for SSH. The database next to it listens on 5432. Mina knocks on all three from her laptop.',
			task: 'Decide what the three knocks log.',
			concept: {
				title: 'What a firewall is for',
				panels: [
					{
						who: 'theo',
						text: 'Why does our server have doors we don’t want people to use?',
						scene: 'server'
					},
					{
						who: 'you',
						text: 'Door 22 is how Jun logs in to fix things, and 5432 is the database. We need both. The whole internet doesn’t.',
						scene: 'database'
					},
					{
						who: 'narrator',
						text: 'A **firewall** stands in front of the machines with a list of ports. Ports on the list go through. Everything else is dropped.',
						scene: 'lock'
					},
					{
						who: 'bit',
						text: 'And when I’m dropped, nobody tells me. No “closed”, no “go away”. I just wait, and give up. That’s `filtered`.',
						scene: 'wire'
					},
					{
						who: 'mina',
						text: 'So `filtered` means the firewall is doing its job?',
						scene: 'none'
					},
					{
						who: 'you',
						text: 'Usually. Unless it’s the door you actually need.',
						scene: 'none'
					}
				]
			},
			code: `log(connect('inkwell.app', 443))
log(connect('inkwell.app', 22))
log(connect('inkwell-db', 5432))
`,
			world: office(),
			question: 'What do the three lines log?',
			choices: [
				'`open`, `open`, `open`: something is listening behind all three',
				'`open`, `closed`, `closed`',
				'`open`, `filtered`, `filtered`',
				'`open`, `filtered`, `no route`'
			],
			answer: 2,
			explanation:
				'`inkwell-fw` only has 443 on its list. The knocks on 22 and 5432 are dropped right there, without a reply: `filtered`. Not `closed`, because something *is* listening behind both doors; Mina’s knock just never got near them. That’s the firewall doing its job: Jun’s admin door and the database are for Inkwell’s own machines, not for anyone with a laptop. When a door you *need* comes back `filtered`, the fix is on a firewall’s list, not on the server.',
			hints: [
				'Look at `inkwell-fw` in the picture. Which ports are on its list?',
				'A firewall that says no doesn’t send anything back. Which answer means “dropped on the way”?'
			]
		},
		{
			id: `${M}/05-fix-firewall`,
			slug: '05-fix-firewall',
			kind: 'fix',
			title: 'One door, not all of them',
			xp: 20,
			story:
				'Inkwell has a new upload page for artists, on port 8443 of the server, and it won’t load from the office. Jun had a go at it at 23:40 last night. At 08:05 Theo got an email from a stranger: “your server’s SSH door is open to the whole internet, just so you know.”',
			task: 'Make the upload door (8443) reachable through `inkwell-fw`, and shut door 22 again. The reader app on 443 must keep working.',
			newCommands: ['allow(node, port)', 'block(node, port)'],
			hints: [
				'Run it as it is. 8443 is `filtered` and 22 is `open`: Jun opened the wrong door. `allow(node, port)` puts a port on a firewall’s list.',
				"Change Jun’s line to `allow('inkwell-fw', 8443)`. Then shut 22 with `block('inkwell-fw', 22)`: his change went live last night, so deleting his line doesn’t undo it.",
				"```js\nallow('inkwell-fw', 8443)\nblock('inkwell-fw', 22)\n\nlog(connect('inkwell.app', 8443))\nlog(connect('inkwell.app', 22))\n```"
			],
			// Jun's change from last night is already live: 22 is on the list
			world: office((s) => {
				node(s, 'inkwell-fw').allow = [443, 22];
				node(s, 'inkwell-web').listens = { 443: 'reader', 22: 'ssh', 8443: 'upload' };
			}),
			starterCode: `// Jun, 23:40: "upload page broken?? opening 22, that'll be it"
allow('inkwell-fw', 22)

log(connect('inkwell.app', 8443))
log(connect('inkwell.app', 22))
`,
			solution: `allow('inkwell-fw', 8443)
block('inkwell-fw', 22)

log(connect('inkwell.app', 8443))
log(connect('inkwell.app', 22))
`,
			checks: [
				{ type: 'net-reachable', from: 'laptop', to: 'inkwell.app', port: 8443 },
				{
					type: 'net-allows',
					id: 'inkwell-fw',
					port: 22,
					allowed: false,
					message:
						"Door 22 is still open to the whole internet. Deleting Jun’s line doesn’t undo what it did last night: `block('inkwell-fw', 22)` shuts it."
				},
				{
					type: 'net-allows',
					id: 'inkwell-fw',
					port: 443,
					allowed: true,
					message: 'Careful: the reader app lives behind door 443. That one stays open.'
				}
			]
		},
		{
			id: `${M}/06-trace`,
			slug: '06-trace',
			kind: 'code',
			title: 'Where the trip stops',
			xp: 20,
			story:
				'Monday, 9:12. Nothing works in the office: not the app, not email, not even the weather. Theo is already reaching for the phone. Before he shouts at the wrong people, find out where the trip actually stops.',
			task: 'Log a trace to the Inkwell server’s address, `203.0.113.10`, and read the log line under it. Then ping the last machine that still answers, to show that the office side is fine.',
			concept: {
				title: 'Reading a trace',
				panels: [
					{
						who: 'mina',
						text: 'Everything’s broken. The app, email, all of it.',
						scene: 'phone'
					},
					{
						who: 'you',
						text: 'When everything is down, it’s rarely everything. It’s usually one machine that all of it passes through.',
						scene: 'wire'
					},
					{
						who: 'bit',
						text: '`trace()` follows me hop by hop and lists every machine I pass. If I never arrive, you get an empty list, and the log says where I got stuck.',
						scene: 'wire',
						code: "trace('203.0.113.10')"
					},
					{
						who: 'narrator',
						text: 'Read a trip from the left: your own machines first, then your provider’s, then the other side’s. The trouble is just past the last machine that answers.',
						scene: 'none'
					},
					{ who: 'theo', text: 'So who do I shout at?', scene: 'none' },
					{
						who: 'you',
						text: 'Whoever owns the machine where it stops. Let’s find out who that is first.',
						scene: 'none'
					}
				]
			},
			newCommands: ['trace(host)'],
			hints: [
				"Use the address, not the name: with the DNS server out of reach, the name goes nowhere. `log(trace('203.0.113.10'))`, then read the line the log adds under it.",
				'The log names the machine where the trip stops. In the picture, which machine comes just before it? Ping that one by its name.',
				"```js\nlog(trace('203.0.113.10'))\nlog(ping('office-fw'))\n```\n`office-fw` answers in 3 ms, so the office is fine. The trip dies at `isp`, the provider’s router."
			],
			world: office((s) => {
				node(s, 'isp').down = true;
			}),
			starterCode: `// Monday, 9:12. Nothing loads. Not even the name:
log(lookup('inkwell.app'))
`,
			solution: `log(trace('203.0.113.10'))
log(ping('office-fw'))
`,
			checks: [
				{
					type: 'net-call-result',
					call: 'trace(',
					result: '[]',
					message:
						"Trace the server’s address and log it: `log(trace('203.0.113.10'))`. The log line under it says where the trip stops."
				},
				{
					type: 'net-call-result',
					call: 'ping(',
					result: '3',
					message:
						'Now ping the last machine that still answers: the one just before the place the trip stops. Find it in the picture and ping it by its name.'
				}
			],
			outro: {
				text: 'Everything up to `office-fw` answers. The trip dies at `isp`, the provider’s router, which also stands between you and the DNS server: that’s why even the name went nowhere. Nothing in the office needs fixing. Theo rings the provider, who already know, and twenty minutes later the world comes back.'
			}
		},
		{
			id: `${M}/07-fix-dns`,
			slug: '07-fix-dns',
			kind: 'fix',
			title: 'The phone book is wrong',
			xp: 20,
			story:
				'On Tuesday Inkwell moved to a new, faster server, `inkwell-web` at `203.0.113.10`. Since then `inkwell.app` doesn’t open from anywhere. Jun says he fixed the DNS record this morning. It still doesn’t open.',
			task: 'Point `inkwell.app` at the new server, and check that door 443 answers.',
			newCommands: ['addRecord(name, ip)'],
			hints: [
				'Run it and look at the two answers. The name turns into *an* address, and that address has a door 443 with nobody behind it. Whose address is `203.0.113.1`? Find it in the picture.',
				'`203.0.113.1` is `inkwell-fw`, the firewall, not the server. The server is `203.0.113.10`: one digit, one very different machine.',
				"```js\naddRecord('inkwell.app', '203.0.113.10')\n\nlog(lookup('inkwell.app'))\nlog(connect('inkwell.app', 443))\n```"
			],
			// the record still points at the old server, which has been switched off and returned
			world: office((s) => {
				s.dns = { 'inkwell.app': '203.0.113.99' };
			}),
			starterCode: `// Jun, 08:50: "fixed the dns record, should be fine now"
addRecord('inkwell.app', '203.0.113.1')

log(lookup('inkwell.app'))
log(connect('inkwell.app', 443))
`,
			solution: `addRecord('inkwell.app', '203.0.113.10')

log(lookup('inkwell.app'))
log(connect('inkwell.app', 443))
`,
			checks: [
				{ type: 'net-resolves', name: 'inkwell.app', ip: '203.0.113.10' },
				{ type: 'net-reachable', from: 'laptop', to: 'inkwell.app', port: 443 }
			]
		},
		{
			id: `${M}/08-boss-ticket`,
			slug: '08-boss-ticket',
			kind: 'code',
			boss: true,
			title: 'Ticket #214',
			xp: 45,
			story:
				'A support ticket lands at 08:31, from Theo’s phone on the train: “Nobody in the office can open the app since this morning. Works fine on my phone (4G). Readers at home are fine too, apparently. Can you look?”',
			task: 'From Mina’s laptop, check the name, the address, the route and the door, logging each answer. Find the one wrong thing and fix it, without opening any door that should stay shut.',
			concept: {
				title: 'A name, an address, a route, a door',
				panels: [
					{
						who: 'narrator',
						text: 'Every “I can’t reach it” comes down to four questions. Ask them in order.',
						scene: 'none'
					},
					{
						who: 'you',
						text: '**A name.** Does the DNS server know it?',
						scene: 'cloud',
						code: "lookup('inkwell.app')"
					},
					{
						who: 'you',
						text: '**An address.** Is that the address of the right machine, or of the old one, or of the firewall?',
						scene: 'server'
					},
					{
						who: 'bit',
						text: '**A route.** Can I get there at all? A number of ms means yes.',
						scene: 'wire',
						code: "ping('inkwell.app')"
					},
					{
						who: 'bit',
						text: '**A door.** Open, closed, or filtered somewhere on the way?',
						scene: 'lock',
						code: "connect('inkwell.app', 443)"
					},
					{
						who: 'mina',
						text: 'And “works on 4G”? Is that a clue?',
						scene: 'phone'
					},
					{
						who: 'you',
						text: 'A big one. Whatever 4G and the office share is fine. Look at what only the office’s trip goes through.',
						scene: 'none'
					}
				]
			},
			hints: [
				'Fill in the four checks in the starter. Three of them look healthy. Which answer is the odd one out?',
				'The door comes back `filtered`. Theo’s phone gets in, so `inkwell-fw` is letting 443 through. Follow the office’s trip in the picture: which firewall does Theo’s phone never pass?',
				"`office-fw`, the office’s own firewall, has lost 443 from its list. One line fixes it:\n```js\nallow('office-fw', 443)\n```\nPut it after your four checks, and knock on 443 again to see it open."
			],
			world: office((s) => {
				// somebody tidied the office firewall's list last night
				node(s, 'office-fw').allow = [80, 53];
				// Theo's phone on 4G reaches the internet without passing the office
				s.nodes.push(
					{ id: 'theo-phone', kind: 'phone', label: 'Theo’s phone (4G)', ip: '100.64.12.7' },
					{ id: 'mobile', kind: 'router', label: '4G network', ip: '100.64.0.1' }
				);
				s.links.push(
					{ from: 'theo-phone', to: 'mobile', latencyMs: 25 },
					{ from: 'mobile', to: 'isp', latencyMs: 10 }
				);
			}),
			starterCode: `// Ticket #214 (Theo, 08:31, from his phone):
// "Nobody in the office can open the app since this morning.
//  Works fine on my phone (4G). Can you look?"

// 1. The name: does DNS know inkwell.app?
log('name:', lookup('inkwell.app'))

// 2. The address: is that the Inkwell server? (compare with the picture)

// 3. The route: is there a way there?

// 4. The door: does 443 let you in?

// Then fix the one wrong thing.
`,
			solution: `log('name:', lookup('inkwell.app'))
log('route:', ping('inkwell.app'), 'ms')
log('door:', connect('inkwell.app', 443))

// Filtered, and 4G works, so inkwell-fw is fine.
// The only firewall on the office's way is office-fw.
allow('office-fw', 443)
log('door now:', connect('inkwell.app', 443))
`,
			checks: [
				{
					type: 'net-call-result',
					call: 'lookup(',
					result: '203.0.113.10',
					message: "Start with the name: log `lookup('inkwell.app')`."
				},
				{
					type: 'net-call-result',
					call: 'ping(',
					result: '29',
					message:
						"Check the route as well: log `ping('inkwell.app')`. A number of milliseconds means there’s a way there."
				},
				{
					type: 'net-call-result',
					call: 'connect(',
					result: 'filtered',
					message:
						"Knock on door 443 from the laptop before you change anything, `connect('inkwell.app', 443)`, so you know which of the four it is."
				},
				{ type: 'net-reachable', from: 'laptop', to: 'inkwell.app', port: 443 },
				{
					type: 'net-allows',
					id: 'inkwell-fw',
					port: 22,
					allowed: false,
					message:
						'The Inkwell firewall should keep door 22 shut. The problem is on the office side: Theo’s phone gets in fine.'
				}
			],
			outro: {
				panels: [
					{
						who: 'narrator',
						text: '08:52. Mina’s laptop opens the app. Then the rest of the office does, one “oh, it’s back” at a time.',
						scene: 'phone'
					},
					{ who: 'theo', text: 'What was it?', scene: 'none' },
					{
						who: 'you',
						text: 'Someone tidied the office firewall last night. Its list kept 80 and 53 and lost 443. The server was fine the whole time: that’s what your 4G was telling us.',
						scene: 'lock'
					},
					{
						who: 'mina',
						text: 'Name, address, route, door. I’m putting that on a sticky note.',
						scene: 'none'
					},
					{
						who: 'bit',
						text: 'Door 443, wide open. My favourite door.',
						scene: 'wire'
					}
				]
			}
		}
	]
};
