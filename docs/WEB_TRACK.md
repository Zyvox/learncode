# Track 2: "Behind the app" — how servers, endpoints and databases fit together

## Who it's for and what it promises

People who work _around_ tech (IT support, ops, admins, product, QA, analysts) and keep hearing
"the endpoint is down", "the server queries the database", "it's a 500", without a working picture
of what those things are. By the end they will have **built** a working (simulated) web app
backend themselves: endpoints, a real SQL database, a client that calls them, logins, and a
deployment picture — and they will be able to read API docs, logs and error codes with
understanding.

The running example is a **webtoon studio**: _Inkwell_. The studio's artists make vertical-scroll
comics; readers use the _Inkwell Reader_ app on their phone. The learner is the new "tech person"
who has to make the reader app actually work: series list, episodes, comments, likes, logins.
Every level is a small, concrete job from the studio.

Cast (defined in `src/lib/curriculum/cast.ts`, used in webtoon-style concept panels):

- **You** — the learner. Curious, no background assumed.
- **Mina** 🎨 — lead artist. Asks the questions a smart non-technical person asks ("Where does the
  episode actually _come from_ when I tap it?").
- **Theo** 🧢 — runs the studio. Business framing, impatience, "can readers comment yet?"
- **Bit** 📦 — a small packet that travels the wire. Comic relief and the camera: when we follow a
  request, we follow Bit.
- **Narrator** — one-line captions.

Concept explanations in this track are mostly **panels** (vertical strips, like a webtoon), not
prose. 3–6 panels, one idea each, a tiny code line where it helps. That's the comic/webtoon idea
applied as the teaching device itself.

## The simulation: the `web` world

One picture, three boxes, left to right: **the phone** (client) → **the server** (with its list
of endpoints) → **the database** (tables). Requests travel as a packet (Bit) along the wires.
Logs appear under the server. Queries appear as packets between server and database. The response
travels back and the phone screen updates. Everything the learner's code does shows up here.

The database is **real SQLite** (sql.js, WebAssembly) running inside the same sandboxed Web
Worker as the learner's code. Node tests use the same library, so every lesson's solution is
verified for real.

The learner's code runs in **one role per lesson** (`WebWorldSpec.role`):

### Role `client` — "you are the phone"

Globals available to the learner's JavaScript:

```js
get(path); // -> Response     e.g. get('/episodes')
post(path, body); // -> Response     e.g. post('/comments', { episodeId: 3, text: 'wow' })
put(path, body); // -> Response
del(path); // -> Response
show(value); // puts something on the phone screen: a string, an object (card) or an array (list of cards)
log(...values); // writes to the client log (like console.log)
```

`Response`:

```js
res.status; // 200, 404, ...
res.ok; // true when status is 200–299
res.body; // the parsed JSON body (or a string for text responses)
res.json(); // same as res.body (exists so real `fetch` feels familiar)
res.text(); // body as a string
```

Calls are **synchronous** in the simulation on purpose (no `await` until the learner has the
mental model). Module 10 has a concept strip showing the real `await fetch(...)` form.

The server in a client lesson comes from `spec.serverCode` (same API as below) and the database
from `spec.schema`. Every `get/post/...` call produces the full trace: request → route → queries →
response, and the phone auto-shows nothing — the learner calls `show()` to display things.

### Role `server` — "you are the server"

Globals:

```js
app.get(path, handler)     app.post(path, handler)     app.put(path, handler)     app.delete(path, handler)
db.all(sql, params?)       // -> array of row objects          db.all('SELECT * FROM episodes WHERE series_id = ?', [id])
db.get(sql, params?)       // -> first row object or undefined
db.run(sql, params?)       // -> { changes, lastId }
log(...values)             // server log
env                        // object from spec.env, e.g. env.DB_PATH (configuration lessons)
```

Handler signature `(req, res)`:

```js
req.method; // 'GET'
req.path; // '/episodes/12'      (no query string)
req.params; // { id: '12' }        from ':id' in the route pattern — ALWAYS strings
req.query; // { page: '2' }       from '?page=2' — strings
req.body; // parsed JSON body (POST/PUT) or undefined
req.headers; // { token: 'abc' }    lower-cased keys

res.status(code); // sets the status, returns res (chainable)
res.json(value); // sends JSON, status defaults to 200
res.send(value); // sends text (strings) or JSON (objects/arrays)
res.end(); // sends an empty body
```

Rules of the simulation (teachable moments, each has a lesson):

- Routes are matched in registration order; first match wins. Method must match. `:name` segments
  capture path params. Query strings are parsed into `req.query`. Trailing slashes are ignored.
- No matching route → **404** `{ "error": "Not found: GET /x" }` and a `route` trace event with
  `pattern: null`.
- Handler throws → **500** `{ "error": "Server error" }`; the error message goes to the server log.
- Handler returns without sending → **500** and the log line
  `The handler for GET /x finished without sending a response.`
- Sending twice → the first response stands; a log warning is written.
- `spec.serverCode` runs before the learner's code (so a lesson can say "add one more endpoint").
- After the learner's code has registered routes, `spec.requests` are fired **in order**. The
  request index is `id` in trace events and `request` in checks.
- `spec.serverDown: true` → every request fails with status 0 and the phone shows a
  "Could not reach the server" error. Used in predict/story levels.
- Every `db.*` call produces a `query` trace event (sql, params, rows/changes). SQL errors inside a
  handler → 500, with the SQLite message in the log (friendly-ified).
- The step cap counts requests + queries + log lines (default 500).

### Role `sql` — "you are talking to the database"

The editor holds **SQL** (`lesson.language = 'sql'`). All statements run in order on the database
built from `spec.schema`. The last statement that returned rows becomes `web.sqlResult`
(shown as a table). SQLite errors become friendly messages with the usual "did you mean"
treatment for keywords (`selec` → `SELECT`, `form` → `FROM`) and unknown tables/columns
(suggest existing ones).

### What the run produces (see `src/lib/engine/types.ts`)

`RunResult.web = { responses, sqlResult?, tables, screen, queryCount }` plus the trace events
`request`, `route`, `log`, `query`, `response`, `screen`. `tables` is a snapshot of every table
(first 25 rows) after the run, so the database panel can show live data.

### Checks (see `src/lib/curriculum/types.ts`)

`response-status`, `response-json` (equal/subset), `response-includes`, `all-responses-ok`,
`db-rows` (verification SQL after the run), `sql-result`, `sql-columns`, `sql-row-count`,
`screen-includes`, `log-includes`, `queries-parameterized`, `max-queries` — plus the existing
`code-includes`/`code-excludes`/`max-lines`.

## Module plan (track id `web`)

Lesson counts are targets. Kinds: `code` (write), `fix` (broken starter), `predict` (read and
choose). Roles in brackets. Every module ends in a boss level. Modules 1–3 need no programming at
all beyond typing a line; from module 4 on, a `prereq` note points at "Learn to code" parts 1–5.

| #   | id                          | title                        | role          | levels | the one idea                                                                                                                 |
| --- | --------------------------- | ---------------------------- | ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `what-happens-when-you-tap` | What happens when you tap    | client        | 6      | A phone _asks_, a server _answers_. The answer has a status and a body.                                                      |
| 2   | `requests-and-responses`    | Requests and responses       | client        | 7      | Method + path = the question. Status code families. Query strings and path parameters.                                       |
| 3   | `endpoints`                 | Endpoints: the server's menu | client        | 6      | An endpoint is a path the server knows how to answer; the list of them is the API. Reading docs.                             |
| 4   | `your-first-server`         | Your first server            | server        | 8      | `app.get(path, handler)`. Routes, params, query, status codes, the handler that never answers. Data from an in-memory array. |
| 5   | `sending-data-in`           | Sending data in              | server        | 6      | POST bodies, 201, validation → 400, PUT/DELETE.                                                                              |
| 6   | `where-the-data-lives`      | Where the data lives         | sql           | 7      | Tables, rows, columns. SELECT, WHERE, ORDER BY, LIMIT, COUNT.                                                                |
| 7   | `changing-data`             | Changing data                | sql           | 6      | INSERT, UPDATE, DELETE, the UPDATE without WHERE, primary keys.                                                              |
| 8   | `connecting-tables`         | Connecting tables            | sql           | 6      | Foreign keys, JOIN, GROUP BY.                                                                                                |
| 9   | `server-meets-database`     | Server meets database        | server        | 8      | Handlers that query. `?` placeholders. The comment that deleted the comments (injection). INSERT → 201 with the new id.      |
| 10  | `the-reader-app`            | The reader app               | client        | 6      | Calling your own API from the phone, handling 404/500, posting a comment, the whole trip. `await fetch` shown.               |
| 11  | `who-are-you`               | Who are you?                 | server        | 6      | Logins: hashed passwords (concept), session tokens in a table, 401 vs 403, protecting an endpoint.                           |
| 12  | `shipping-it`               | Shipping it                  | mixed         | 7      | Where a server lives, ports, domains/DNS, HTTPS, reverse proxy, environment variables, logs, "it's down" triage.             |
| 13  | `launch-inkwell`            | Launch Inkwell               | server+client | 6      | Capstone checkpoints: series list → episode page → comments → likes → search → launch day.                                   |

Coming-soon stubs on the map (`comingSoon: true`, no lessons): `networks-for-it`,
`command-line`, `git-and-versions`, `security-basics`, `reading-logs`, `cloud-and-containers`,
`apis-in-the-wild`, `automation-scripts`.

## The Inkwell data model (use consistently across modules)

```sql
CREATE TABLE series   (id INTEGER PRIMARY KEY, title TEXT NOT NULL, genre TEXT, author TEXT);
CREATE TABLE episodes (id INTEGER PRIMARY KEY, series_id INTEGER NOT NULL, number INTEGER NOT NULL,
                       title TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 1, likes INTEGER NOT NULL DEFAULT 0);
CREATE TABLE comments (id INTEGER PRIMARY KEY, episode_id INTEGER NOT NULL, author TEXT NOT NULL,
                       text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT '2026-10-01');
CREATE TABLE users    (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
```

Seed series: "Moonlit Deliveries" (slice of life), "Grove & Gear" (fantasy), "Night Shift Noodles"
(comedy). A handful of episodes each, a few comments. Keep seeds small so result tables fit on a
phone screen. Content files export the shared schema/seed from `src/lib/curriculum/inkwell.ts`.

## Voice

Same rules as the rest of the app (`CLAUDE.md`): plain, warm, a bit funny, no jargon before the
learner has met the thing. Here the learner _is_ an adult professional: don't talk down. Name
things properly once they've been used ("that list of paths is the API").
