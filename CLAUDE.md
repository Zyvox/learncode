# learncode — working notes for contributors (human or AI)

Read `docs/ARCHITECTURE.md` first. It is the source of truth for product goals, module boundaries
and the contracts between them.

## Stack (pinned, already installed — do not run `npm install` unless you own package.json)

- SvelteKit **3** + Svelte **5** (runes mode is forced: use `$state`, `$derived`, `$props`, `$effect`; no `export let`, no `$:`)
- `@sveltejs/adapter-node` → `npm run build` produces `build/index.js`, start with `node build`
- Tailwind **v4** via `@tailwindcss/vite` (no tailwind.config.js; `@import 'tailwindcss'` in `src/app.css`, theme tokens via `@theme {}`)
- Drizzle ORM + better-sqlite3 (single SQLite file, path from `DATABASE_PATH`)
- `@node-rs/argon2` for password hashing, CodeMirror 6 for the editor, zod for validation
- Vitest for unit tests (`npm test`), Playwright for e2e (`npm run test:e2e`)

## SvelteKit 3 differences you must respect (newer than most training data)

- The lib alias is **`#lib`**, not `$lib`, and imports need the **file extension**: `import { x } from '#lib/engine/run.ts'`, `import Editor from '#lib/components/Editor.svelte'`, `import type { Lesson } from '#lib/curriculum/types.ts'`. Relative imports too: `./grid.ts`. (The resolver is Node subpath imports + `allowImportingTsExtensions`.) Server-only code lives in `src/lib/server/` and is imported as `#lib/server/...` (SvelteKit still forbids importing it from client code).
- Kit config lives in `vite.config.ts` inside `sveltekit({...})` — there is no `svelte.config.js`.
- `$app/environment` is now **`$app/env`** (`browser`, `dev`, `building`).
- Read env vars on the server with `process.env.X` (keep it simple; no `$env/*` imports).
- `$app/state` (not `$app/stores`) for `page`, `navigating`.
- Hooks still live in `src/hooks.server.ts` (`handle`, `init`).
- Route files: `+page.svelte`, `+page.server.ts`, `+layout.svelte`, `+server.ts`, `$types` imports as usual (`import type { PageServerLoad, Actions } from './$types'`).

## Conventions

- TypeScript strict. Prettier (tabs, single quotes, width 100). Run `npm run check` (svelte-check) before declaring work done.
- Pure logic goes in `src/lib/{engine,curriculum,game}` so it runs in Node tests _and_ the browser. No DOM access there.
- Everything user-facing is written in plain, warm, human language. No jargon before the learner has used the thing. No exclamation-mark spam, no "Great job, learner!" robot voice. Sound like a friendly person sitting next to them.
- Keep dependencies minimal. Prefer inline SVG / emoji over icon packages.
- Tests: `*.test.ts` next to the code. `npm test` must stay green.

## Suggestions from contributors and agents

If you notice an improvement outside your task (a better abstraction, a lesson that would land
better, a UI rough edge, a missing test), do not implement it. Put it in a **Suggestions** section
at the end of your report: what, why, and what it would cost. The orchestrator compares it with
what exists and decides; many good suggestions are declined because the current thing is good
enough. Never widen your scope because a suggestion felt obvious.

## Commands

```
npm run dev        # dev server
npm run build      # production build -> build/
npm start          # node build (needs DATABASE_PATH, PORT, ORIGIN)
npm run check      # svelte-check
npm test           # vitest
npm run test:e2e   # playwright (builds and starts the app itself)
```
