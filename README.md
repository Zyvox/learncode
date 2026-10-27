# Hatch — learn to code, one small level at a time

A self-hosted web app that teaches beginners through short, game-like levels. Two tracks share
one engine, one account system and one map:

**Learn to code** — you write a few lines of real JavaScript, press Run, and watch a little
character act out your code step by step. Mistakes get plain explanations like "I don't know
anything called `mov`. Did you mean `move()`?" instead of JavaScript errors.

- **Pick a vibe** (games, stories & comics, music, space, nature, sports, food): it changes the
  character, what you collect, the story and the accent colour. The puzzles stay the same.
- **Seven parts, 50 levels**: first steps → loops → choices → your own commands → variables →
  drawing with code → a tiny game built in checkpoints. Mixed level types (write, fix the bug,
  predict what happens), boss levels, progressive hints.

**Behind the app** — for people who work _around_ tech (IT, ops, support, product, QA) and want
the real picture of what a server, an endpoint and a database are and how they connect. You play
the new tech person at a webtoon studio, Inkwell, and build the backend of its reader app.

- **Thirteen parts, 85 levels**: what happens when you tap → requests and responses → endpoints
  → your first server → sending data in → where the data lives (SQL) → changing data → connecting
  tables → server meets database → the reader app → logins → shipping it → launch day.
- **One picture, three boxes**: the phone, the server with its endpoints, and the database. A
  packet named Bit carries every request along the wires so you can watch the round trip, the
  queries and the response. The database is **real SQLite** (sql.js, WebAssembly) running in the
  browser, so the SQL you write is the SQL that runs.
- **Three roles**: some levels you are the phone (`get('/series')`), some the server
  (`app.get('/series/:id', (req, res) => …)`), some the database (plain SQL).
- **Concepts as webtoon strips**: explanations are short vertical comic panels with a cast (Mina
  the artist, Theo who runs the studio, Bit the packet) instead of paragraphs.
- Eight more modules are on the map as "coming soon": networks for IT, the command line, git,
  security basics, reading logs, cloud and containers, APIs in the wild, automation scripts.

Both tracks: **play as a guest** first; sign up later and your progress comes with you. XP, level
titles, streaks and badges on an account basis. One Node process, one SQLite file.

Learner code never runs on the server: it runs in a Web Worker in the learner's own browser, with
step caps and timeouts, and the result is animated afterwards.

## Run it locally

```bash
npm ci
npm run dev          # http://localhost:5173
```

Production build and run (plain http, no reverse proxy):

```bash
ORIGIN=http://localhost:3000 npm run build
DATABASE_PATH=./data/learncode.sqlite PORT=3000 ORIGIN=http://localhost:3000 node build
```

`ORIGIN` is read at **build** time (it's baked in for CSRF checks on form posts) and at run time
(whether the session cookie is marked Secure). Behind a reverse proxy you can leave it out of the
build and let the app derive the origin from forwarded headers instead — see below.

## Deploy on your own Linux server

### Option A: Docker (recommended)

```bash
git clone <this repo> learncode && cd learncode
# edit docker-compose.yml: set ORIGIN to your public URL, e.g. https://code.example.com
docker compose up -d --build
```

The container listens on `127.0.0.1:3000` and keeps the database in `./data/`. Put a reverse
proxy with TLS in front of it:

- **Caddy**: copy `deploy/Caddyfile`, change the hostname, `systemctl reload caddy`. Caddy handles certificates.
- **nginx**: copy `deploy/nginx.conf` into `sites-enabled`, change the hostname, run certbot.

The compose file already sets `PROTOCOL_HEADER`, `HOST_HEADER`, `ADDRESS_HEADER` and `XFF_DEPTH`
so the app trusts the proxy's forwarded headers (needed for CSRF checks and login rate limiting).

### Option B: systemd, no Docker

```bash
sudo useradd --system --home /opt/learncode learncode
sudo git clone <this repo> /opt/learncode && cd /opt/learncode
sudo -u learncode npm ci && sudo -u learncode npm run build && sudo -u learncode npm prune --omit=dev
sudo mkdir -p /opt/learncode/data && sudo chown learncode:learncode /opt/learncode/data
sudo cp deploy/learncode.service /etc/systemd/system/   # edit ORIGIN first
sudo systemctl daemon-reload && sudo systemctl enable --now learncode
```

Then add the Caddy or nginx config as above. Node 22 or newer is required.

### Updating

```bash
git pull
docker compose up -d --build        # or: npm ci && npm run build && systemctl restart learncode
```

Database migrations run automatically at startup (SQL files in `drizzle/`).

### Backups

Everything lives in one SQLite file (`DATABASE_PATH`, default `./data/learncode.sqlite`, or
`/data/learncode.sqlite` in Docker). Copy it while the app is stopped, or use
`sqlite3 learncode.sqlite ".backup backup.sqlite"` while it runs.

## Configuration

| Variable                         | Default                   | Meaning                                                                                                                 |
| -------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_PATH`                  | `./data/learncode.sqlite` | SQLite file; directory is created                                                                                       |
| `PORT` / `HOST`                  | `3000` / `0.0.0.0`        | Where the Node server listens                                                                                           |
| `ORIGIN`                         | –                         | Public URL. Build-time: CSRF origin. Run-time: Secure cookie flag                                                       |
| `PROTOCOL_HEADER`, `HOST_HEADER` | –                         | Derive origin from a reverse proxy (`x-forwarded-proto`, `x-forwarded-host`)                                            |
| `ADDRESS_HEADER`, `XFF_DEPTH`    | –                         | Client IP from the proxy (`X-Forwarded-For`, `1`). Needed behind a proxy, or every visitor shares one rate-limit bucket |
| `SIGNUPS_PER_IP_PER_HOUR`        | `20`                      | New accounts allowed per client IP per hour (raise it for a classroom behind one NAT address)                           |
| `MIGRATIONS_PATH`                | `./drizzle`               | Where migration SQL lives, if you move the build                                                                        |

See `.env.example`.

## Development

```bash
npm run check        # svelte-check (types)
npm test             # vitest: engine, curriculum (every solution is run through the engine), server, game
npm run test:e2e     # playwright: builds, starts the app on :4173 and plays real levels in Chromium
npm run format
```

Project layout and the contracts between parts are described in `docs/ARCHITECTURE.md`.
Conventions (including the SvelteKit 3 specifics) are in `CLAUDE.md`.

### Adding a level or a module

1. Add a lesson object to the right file in `src/lib/curriculum/modules/` (see `types.ts` for the
   shape). Give it a `solution` and `checks`. A new module is just a new file in that folder
   exporting a `Module` (set `track: 'code'` or `'web'`); it is registered automatically.
2. Run `npm test`. The curriculum tests check that the solution passes, the starter does not, every
   text renders in every vibe, every command used has been introduced, and (for predict levels)
   that the marked answer is what really happens (`src/lib/curriculum/facts/`).
3. That's it: the map, the cheat sheet, the badges and XP all follow from the data.

The "Behind the app" simulation, its learner-facing API and the Inkwell data model are described
in `docs/WEB_TRACK.md`.

New vibes go in `src/lib/curriculum/themes.ts`; every theme must define the same vocabulary keys.

### Renaming the app

`src/lib/config.ts` holds the name and tagline.

## Security notes

- Passwords are hashed with argon2id. Sessions are random tokens stored hashed, in an
  `httpOnly`, `SameSite=Lax` cookie, Secure when `ORIGIN` is https or the request came in over
  https. At most 20 sessions per user are kept.
- Login failures (10 per 15 minutes per IP+email) and new accounts (20 per hour per IP) are
  rate-limited in memory per process.
- Rendered pages get a nonce-based Content-Security-Policy (`csp` in `vite.config.ts`).
  `POST`s to `/api/*` from another site are refused (Sec-Fetch-Site / Origin check in hooks).
- Learner programs are stored up to 20,000 characters.
- Learner code runs only in the browser, inside a Worker, never on the server. Progress is
  self-reported by the client (the engine runs client-side), so a determined person can award
  themselves XP; nothing lets them touch anyone else's account.
- A Content-Security-Policy is sent with every HTML page. `'unsafe-eval'` is required because the
  learner's code is compiled with `new Function` inside the worker.

## License

MIT
