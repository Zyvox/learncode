# Round 3: networks, cloud, git, security — and story fixes

Four new modules for the "Behind the app" track, two new simulated worlds, and story-level
improvements. Companion to `docs/WEB_TRACK.md` (read that first).

## Story fixes

- **Outro (boss epilogue).** `lesson.outro = { text?, panels? }` is shown _after_ a level is
  cleared, inside the pass banner ("What just happened"). Boss levels get the story beat that
  happens because of the learner's work (the episode goes live, readers comment, Theo reacts).
  Stories before the work stop pretending the thing is already done.
- **Inkwell remembers.** Modules are checkpoints in one story, so the seed data moves with it.
  `src/lib/curriculum/inkwell.ts` exports **stages**: `INKWELL_AT('start' | 'published' | 'live')`.
  - `start`: modules 1–7. Episode 4 "Sketches" unpublished.
  - `published`: from module 8. Episode 4 is published (retitled "The night market" by the module
    7 boss) and the comment the learner inserted in module 7 exists.
  - `live`: from module 10. Comments the learner posted in module 9, a like or two, Ravi's session.
    Lessons use the stage that matches their place in the story. Data never persists _between_
    lessons at runtime (every run is deterministic and testable); the story moves, the seeds follow.
- **Steep spots**: capstone checkpoint 1 no longer opens with a JOIN+GROUP BY handler (plain
  list first; the counts become their own checkpoint with the SQL supplied); the logins boss is
  split into two levels; the capstone finale is a real launch-day traffic wave with an outro.

## New world: `net` (flavour `network`)

One picture: nodes and wires. The learner's code runs _on_ one node (`spec.at`, usually the
laptop). Packets travel the links; a dropped packet stops at the node that dropped it.

Learner API (JavaScript, synchronous):

```js
lookup('inkwell.app'); // -> '203.0.113.10' or null (needs a reachable dns node with the record)
ping('203.0.113.10'); // -> number of ms, or 'unreachable' (no route, or node down)
connect('203.0.113.10', 443); // -> 'open' | 'closed' | 'filtered' | 'no route' | 'unknown host'
trace('203.0.113.10'); // -> ['laptop', 'home-router', 'isp', 'inkwell-fw', 'inkwell-web']
allow('inkwell-fw', 443); // opens a port on a firewall or server (config levels)
block('inkwell-fw', 22);
listen('inkwell-web', 443, 'reader'); // starts a service on a node
addRecord('inkwell.app', '203.0.113.10'); // adds a DNS record
log(...values);
```

Hostnames are accepted anywhere an ip is (resolved through dns first). Rules:

- `closed`: route exists, nothing listens on that port. `filtered`: a firewall (or the node's
  own `allow` list) drops it. `no route`: no path of links, or a node on the path is down.
- `ping` latency = sum of link `latencyMs` (default 10 each). A down node is unreachable.
- Every call is one step and produces a `call` trace event plus `packet` events for the trip.

## New world: `net` (flavour `cloud`)

Same picture, different vocabulary: a `cloud` node (a region) that containers live in, an `lb`
(load balancer) in front, the client that sends traffic. The learner's code configures; then
`spec.traffic` batches hit the load balancer.

```js
deploy('reader', { image: 'reader:1.0', replicas: 2 }); // containers reader-1, reader-2 appear in the cloud node
scale('reader', 4); // adds/removes containers
route('/', 'reader'); // lb: path prefix -> service
release('reader', 'reader:1.1'); // rolling update: replace containers one at a time
health('reader', '/health'); // lb only sends traffic to healthy containers
env('reader', 'DB_URL', 'postgres://…'); // config lives outside the image
log(...values);
```

Traffic rules: each request goes client → lb → a healthy container of the routed service
(round robin). A container over its `capacity` for the batch answers 503. No route → 404. No
healthy container → 503. Unhealthy images (`images[x].unhealthy`) fail health checks, so a
`release` to a broken image with `health` set keeps the old containers (that's the lesson).
`net.traffic` summarises `{ total, ok, failed, byStatus }`.

## New world: `git`

A working folder, a staging area, a history. The editor language is `shell`: one command per
line, run top to bottom. Supported:

```
git init | status | add <file|.> | commit -m "msg" | log | branch [name] | checkout <branch|-b name>
git switch <branch|-c name> | merge <branch> | diff | restore <file> | rm <file>
echo "text" > file      echo "text" >> file      cat file      ls      rm file      touch file
```

Anything else prints a friendly "this little shell doesn't know `x`" line (not a crash).
Merges: fast-forward when possible; otherwise a merge commit; a conflict (both branches changed
the same file) writes conflict markers into the file and leaves the merge for the learner to
resolve (`edit the file, git add, git commit`). Commit ids are short deterministic hashes.
`git log` prints `<id> (branch markers) message`. Every command is one `shell` trace event; the
UI shows the terminal, the file list with status colours, and the commit graph.

## Web world: security extensions

- `hash(text)` and `hashMatches(text, hash)` on the server: a toy one-way function that looks
  like a real hash (hex, 64 chars) and is deterministic. `spec.schema` for login levels stores
  `hash('…')` values via `serverCode`.
- `escape(text)` on the server: `<`, `>`, `&`, `"` → entities.
- `spec.dbReadOnly`: `db.run` with INSERT/UPDATE/DELETE throws "This connection may only read…"
  (least privilege).
- `spec.renderHtml`: the phone renders strings as HTML. Any shown text (or 2xx string/JSON field)
  containing `<script` becomes a `screen` item `{ kind: 'html', raw, scripted: true }`. Checks
  `screen-no-script`, `response-no-script`, `log-excludes`.
- `spec.plainHttp`: packets carry readable headers; used by predict/concept levels (`request`
  trace events get `label: 'http'`; the UI shows a little "readable on the wire" tag).

## Module plan (track `web`, replacing four coming-soon stubs)

| order | id                     | world       | levels | the one idea                                                                                                                                      |
| ----- | ---------------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14    | `networks-for-it`      | net/network | 8      | Names → addresses (DNS), addresses → routes, ports → services, firewalls → filtered. "Can't reach the server" has exactly four causes.            |
| 15    | `git-and-versions`     | git         | 8      | A history you can trust: commit, branch, merge, resolve, and why "it works on my machine".                                                        |
| 16    | `security-basics`      | web         | 7      | The four habits: hash passwords, parameterise queries, escape output, give the least access. Secrets stay out of logs.                            |
| 17    | `cloud-and-containers` | net/cloud   | 7      | A container is your app in a box; the cloud is someone else's machines; a load balancer spreads the load; scale, health checks, rolling releases. |

The remaining stubs (`command-line`, `reading-logs`, `apis-in-the-wild`, `automation-scripts`)
keep their orders after these (18–21).

Networks levels (sketch): 1 `lookup` a name → ip (DNS is the phonebook); 2 `ping` and latency;
3 `connect` to 443 (open) vs 8080 (closed) — ports are doors; 4 predict: the firewall (filtered);
5 fix: open the right port on the firewall (`allow`); 6 `trace` and a down router (no route);
7 fix: wrong DNS record; 8 boss: a support ticket — "readers in the office can't open the app" —
diagnose with the four calls and fix the one wrong thing.

Git levels: 1 `git init`, `git status`, first commit; 2 edit, diff, commit again; 3 `git log`
and what a commit is (snapshot + parent); 4 branch: `git switch -c comments`; 5 merge (fast-
forward); 6 predict: two branches touched the same line; 7 fix: resolve a conflict; 8 boss:
feature branch, merge, log looks right.

Security levels: 1 predict: the database leaked, what did the attacker get (hashes vs passwords);
2 `hash()` on signup + `hashMatches` on login; 3 recap injection in one fix (`?`); 4 XSS:
renderHtml predict, comment with a script runs on every phone; 5 fix: `escape()` on output;
6 least privilege: the public endpoint's connection is read-only (fix the design, not the
connection); 7 boss: secrets out of logs + all four habits in one server.

Cloud levels: 1 concept + `deploy` one container, traffic arrives; 2 traffic spike → 503s, `scale`;
3 `route` and a second service; 4 predict: a container dies (node down) — what happens with 1 vs
3 replicas; 5 `health` + `release` of a broken image (safe rollout); 6 fix: config baked into the
image → `env`; 7 boss: launch-day traffic on the real Inkwell topology.
