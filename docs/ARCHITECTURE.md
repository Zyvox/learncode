# Architecture

## What this is

A web app that teaches absolute beginners to code through short, game-like levels.
The learner is someone who does not yet "think like a programmer". So:

- Every concept is introduced **because the learner needs it** ("that's a lot of `move()`
  lines… what if you could say _do this 5 times_?"), never as a definition first.
- Every level gives **instant visual feedback**: a character moves on a grid, text appears, a
  drawing forms. You see what your code _did_, step by step.
- Levels are **tiny** (1–3 minutes). Variety keeps it moving: write code, fix broken code,
  predict what code will do, fill in a blank.
- Progressive hints: a nudge → a bigger clue → show the answer (then nudge them to retry the next
  one without help). Nobody gets stuck, nobody is shamed.
- Mistakes get **friendly, specific error messages** ("I don't know a command called `mov`. Did you
  mean `move()`?") instead of raw JavaScript errors.
- The **"hook"**: at the start the learner picks a vibe (games, stories & comics, music, space,
  nature, sports, food). That picks the character, the things they collect, the story framing and
  the accent colour. The underlying puzzles are identical, so content stays maintainable.
- Gamification that feels earned, not nagging: XP, a level title, a streak, a handful of badges, a
  map that fills in. Confetti when you pass. That's it.
- Human voice everywhere. Short sentences. No corporate-tutorial or robot tone.

The language taught is **real JavaScript** (no fake block language), but the vocabulary is gated:
levels only ever require the commands they have introduced. Later modules can add Python and web
pages; the engine is world-based so that is additive.

## Tracks

Two tracks share the engine, accounts, map and gamification:

- **Learn to code** (`track: 'code'`) — the modules below.
- **Behind the app** (`track: 'web'`) — servers, endpoints, databases and how they connect, built
  around a webtoon studio's reader app. Design and API: `docs/WEB_TRACK.md`.

## Curriculum shape

Modules (in order) and the one idea each one owns:

1. **First steps** — sequences. `move()`, `turnLeft()`, `pickUp()`. Reading code, fixing a typo.
2. **Doing it again** — loops. `while (pathAhead())`, then `for (let i = 0; i < n; i++)`.
3. **Making choices** — conditionals. `if (onItem())`, `if … else`, sensing commands.
4. **Your own commands** — functions. Name a block of steps, reuse it.
5. **Remembering things** — variables, numbers, text, `print()`. Switches to the console world.
6. **Drawing with code** — the canvas world. Shapes, colours, loops that draw patterns.
7. **Build a tiny game** — a capstone that combines everything, in checkpoints.

Each module is ~6–9 levels. Within a module, difficulty goes up and the hand-holding goes down.

## Module boundaries and ownership

```
src/lib/curriculum/   content: themes, modules, lessons, text rendering   (pure TS, no DOM)
src/lib/engine/       running learner code safely + the three "worlds"    (pure TS core + worker/vm wrappers)
src/lib/game/         XP, levels, streaks, badges                          (pure TS)
src/lib/server/       DB (drizzle+sqlite), auth, sessions, progress       (server only)
src/lib/components/   Svelte components                                   (UI)
src/routes/           pages, form actions, API endpoints                  (UI + thin server glue)
```

Contracts live in:

- `src/lib/curriculum/types.ts` — Lesson / Module / Theme / Check shapes
- `src/lib/engine/types.ts` — RunResult / TraceEvent / world state shapes and the learner-facing API
- this file (below) — server functions and HTTP endpoints, `App.Locals`

## Engine

Learner code runs **in the browser only** (never on the server) inside a module Web Worker (`sandbox.worker.ts`, bundled by Vite). The worker gets a small API object (the world's commands), runs the code synchronously with
`new Function`, and posts back a `RunResult`. The main thread kills the worker after a timeout
(infinite loops) and the world enforces a step cap (runaway `move()`s). The main thread then
_animates_ the trace — the worker never touches the DOM.

The same core (`runProgram(code, worldSpec)`) is also runnable in Node via `node:vm`, which is how
the curriculum tests prove every lesson's `solution` actually passes its `checks`.

Worlds:

- **grid** — hero on a grid with walls, items and a goal. Crashing into a wall/edge ends the run
  (friendly message). Commands: `move()`, `turnLeft()`, `turnRight()`, `pickUp()`, `say(text)`,
  sensors `pathAhead()`, `pathLeft()`, `pathRight()`, `onItem()`, `atGoal()`, `itemsLeft()`.
- **console** — `print(...values)`. The lesson can pre-define variables (e.g. `score`) that
  exist when the learner's code starts.
- **web** — a simulated phone → server → SQLite database pipeline (real SQL via sql.js in the
  worker). See `docs/WEB_TRACK.md`.
- **canvas** — `color(name)`, `circle(x, y, r)`, `rect(x, y, w, h)`, `line(x1, y1, x2, y2)`,
  `text(x, y, str)`, `background(name)`. Canvas is 300×300 by default. Ops are recorded and the UI
  replays them onto a `<canvas>`.

`checks` in a lesson are data (see types). The engine's `evaluate(lesson, result)` returns
`{ passed, failures: string[] }` with learner-friendly failure messages.

## Server

- SQLite file at `process.env.DATABASE_PATH ?? './data/learncode.sqlite'`, opened with Node's built-in `node:sqlite` (no native build). Migrations are SQL files
  in `drizzle/` generated by drizzle-kit and applied automatically at startup (`init` hook).
- Auth: email + password (argon2id). Session id (random 32 bytes, base64url) in an `httpOnly`,
  `sameSite=lax` cookie named `session`, `secure` when `ORIGIN` starts with https or the request
  is https. 30-day sessions, renewed when < 15 days remain, at most 20 per user. Login failures
  rate-limited in memory per IP+email; signups per IP (`SIGNUPS_PER_IP_PER_HOUR`, default 20).
- Guests can play: progress is kept in `localStorage` (`lc:progress:v1`) and merged on signup via
  `POST /api/progress/import`.

`App.Locals` (set in `hooks.server.ts`):

```ts
interface Locals {
	user: null | {
		id: number;
		email: string;
		displayName: string;
		themeId: ThemeId;
		xp: number;
		streak: number;
		createdAt: string;
	};
	session: null | { id: string; expiresAt: Date };
}
```

Server functions (all in `src/lib/server/`):

```ts
// auth.ts
createUser({ email, password, displayName, themeId }): Promise<User>   // throws AuthError('email-taken' | 'weak-password' | 'invalid-email')
verifyLogin(email, password): Promise<User | null>
createSession(userId): { id: string; expiresAt: Date }   // returns token to put in cookie
validateSession(token): { user, session } | null         // also renews
invalidateSession(token): void
setSessionCookie(cookies, token, expiresAt) / clearSessionCookie(cookies)

// progress.ts
getProgress(userId): Record<string /*lessonId*/, LessonProgress>
// LessonProgress = { status: 'done' | 'started'; attempts: number; hintsUsed: number;
//                    lastCode: string | null; completedAt: string | null; xpEarned: number }
saveDraft(userId, lessonId, code): void
completeLesson(userId, lessonId, { code, hintsUsed, attempts }): CompletionResult
// CompletionResult = { firstTime: boolean; xpGained: number; totalXp: number;
//                      level: LevelInfo; streak: number; newBadges: Badge[] }
importProgress(userId, entries: { lessonId, code, hintsUsed, attempts, completedAt }[]): void
getBadges(userId): { badgeId: string; earnedAt: string }[]
updateProfile(userId, { displayName?, themeId? }): void
```

HTTP endpoints (JSON, all require a logged-in user unless noted):

```
POST /api/progress/complete   { lessonId, code, hintsUsed, attempts }  -> CompletionResult
POST /api/progress/draft      { lessonId, code }                        -> { ok: true }
POST /api/progress/import     { entries: [...] }                        -> { imported: number }
POST /api/profile             { displayName?, themeId? }                -> { ok: true }
GET  /api/health              (public)                                   -> { ok: true }
```

Form actions (progressive enhancement, work without JS):

```
/signup   default action: email, password, displayName, themeId
/login    default action: email, password
/logout   default action
```

## Game logic (`src/lib/game/`)

- `xp.ts`: `levelForXp(xp) -> { level: number; title: string; xpIntoLevel: number; xpForNext: number; progress: number }`.
  Level titles are playful but not childish ("Curious", "Tinkerer", "Builder", …).
- Completion XP = lesson.xp, ×1.5 if passed with no hints, +10 first clear of a module, only on
  first completion of a lesson (replays give 0 but keep it fun with a "still got it" message).
- `streak.ts`: a streak counts consecutive UTC days with at least one completion.
- `badges.ts`: `BADGES` list + `evaluateBadges(ctx)` returning newly earned badge ids. ~12 badges
  (first level, first loop, bug squasher, five levels without hints, each module complete,
  7-day streak, night owl, etc.).

## UI

Routes:

```
/                         landing: what this is, pick a vibe, "try the first level" (no account needed)
/learn                    the map: modules as regions, levels as nodes, locked/available/done
/learn/[module]/[lesson]  the play page
/login  /signup  /logout
/profile                  xp, level, streak, badges, change vibe / name
```

Play page layout (desktop): story + task + hints on the left, the world in the middle, editor
below/right, Run / Reset / Hint buttons, result banner, "Next" when passed. On mobile it stacks:
world, editor, text. Keyboard: Ctrl/Cmd+Enter runs.

## Builds

One codebase, two builds, switched by `STATIC_BUILD=1` in `vite.config.ts` (app code reads
`STATIC` from `src/lib/config.ts`):

- **Server build** (`npm run build`, adapter-node → `build/`): accounts, SQLite, form actions and
  the JSON API. Nothing is prerendered. This is the self-hosted app described below.
- **Static build** (`npm run build:static` = `scripts/build-static.mjs`, adapter-static →
  `site/`): the root layout sets `prerender = true`, so every page is rendered at build time
  (`/`, `/learn`, every playable lesson via `entries` in the lesson route, `/profile`, the
  manifest), with `404.html` as the SPA fallback. `BASE_PATH` sets `paths.base` (e.g.
  `/learncode` on GitHub Pages) and paths are relative, so links go through `resolve()` /
  `asset()` from `$app/paths` (`#lib/links.ts` for lesson links). CSP comes as a `<meta>` tag with
  hashes instead of nonces.

What static mode disables or swaps:

- No request user ever (prerendering has no cookies): everyone plays as a guest and progress lives
  in `localStorage` (`stores/guest.svelte.ts`). `/api/*` is not part of the site.
- `/login`, `/signup`, `/logout` render a "no accounts here" note; their form actions and the
  profile's are left out (SvelteKit can't prerender pages with actions). No page links to them.
- `/profile` is `DeviceProfile.svelte`: XP, streak, badges and levels done from the device, the
  vibe, persistent-storage status, and backup download/restore (`#lib/game/backup.ts`, same
  validation rules as `POST /api/progress/import`, merging never undoes a finished level).
- PWA: `src/routes/manifest.webmanifest/+server.ts` (prerendered), icons in `static/icons/`
  (`scripts/render-icons.mjs`), and `src/service-worker/` (own tsconfig, checked by
  `npm run check`), registered by `#lib/pwa.svelte.ts` in static mode only. It precaches Vite's
  output, the engine worker with its chunks and the sql.js wasm, `static/`, every prerendered page
  and data file, and `404.html`; hashed files are cache-first, everything else network-first with
  the cache as the offline fallback. A new version waits until the learner taps "Update
  available"; old caches are dropped on activate.

## Deployment

Single Node process + one SQLite file. `Dockerfile` + `docker-compose.yml` with a `./data` volume,
plus a systemd unit example in `deploy/`. Reverse proxy (Caddy/nginx) terminates TLS. See README.

The static build deploys to GitHub Pages from `.github/workflows/pages.yml` (pushes to `main`);
`.github/workflows/ci.yml` checks other branches and pull requests.
