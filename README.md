# Hatch — learn to code, one small level at a time

A self-hosted web app that teaches absolute beginners to code through short, game-like levels.
You write a few lines of real JavaScript, press Run, and watch a little character act out your
code. Mistakes get plain-language explanations. Levels take a minute or two.

- **Pick a vibe** (games, stories & comics, music, space, nature, sports, food) — it changes the
  character, what you collect and how the story is told. The puzzles are the same.
- **Seven parts, 50 levels**: first steps → loops → choices → your own commands → variables →
  drawing with code → a tiny game. Each part ends in a boss level. Python and web pages are
  stubbed as "coming soon".
- **Three worlds**: a grid your character walks on, a console that prints, and a canvas you draw on.
- **Play as a guest** first; sign up later and your progress comes with you.
- **XP, level titles, streaks and badges** on an account basis. One Node process, one SQLite file.

Learner code never runs on the server: it runs in a Web Worker in the learner's own browser, with
a step cap and a timeout, and the result is animated afterwards.

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

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_PATH` | `./data/learncode.sqlite` | SQLite file; directory is created |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Where the Node server listens |
| `ORIGIN` | – | Public URL. Build-time: CSRF origin. Run-time: Secure cookie flag |
| `PROTOCOL_HEADER`, `HOST_HEADER` | – | Derive origin from a reverse proxy (`x-forwarded-proto`, `x-forwarded-host`) |
| `ADDRESS_HEADER`, `XFF_DEPTH` | – | Client IP from the proxy (`X-Forwarded-For`, `1`) |
| `MIGRATIONS_PATH` | `./drizzle` | Where migration SQL lives, if you move the build |

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
   shape). Give it a `solution` and `checks`.
2. Run `npm test`. The curriculum tests check that the solution passes, the starter does not, every
   text renders in every vibe, and every command used has been introduced.
3. That's it: the map, the cheat sheet, the badges and XP all follow from the data.

New vibes go in `src/lib/curriculum/themes.ts`; every theme must define the same vocabulary keys.

### Renaming the app

`src/lib/config.ts` holds the name and tagline.

## Security notes

- Passwords are hashed with argon2id. Sessions are random tokens stored hashed, in an
  `httpOnly`, `SameSite=Lax` cookie, Secure when `ORIGIN` is https.
- Login and signup are rate-limited in memory per process.
- Learner code runs only in the browser, inside a Worker, never on the server. Progress is
  self-reported by the client (the engine runs client-side), so a determined person can award
  themselves XP; nothing lets them touch anyone else's account.
- A Content-Security-Policy is sent with every HTML page. `'unsafe-eval'` is required because the
  learner's code is compiled with `new Function` inside the worker.

## License

MIT
