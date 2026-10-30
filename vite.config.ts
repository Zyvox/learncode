import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Two builds from one codebase (docs/ARCHITECTURE.md, "Builds"):
 * - server (default): adapter-node, accounts, SQLite. Nothing is prerendered.
 * - static (`STATIC_BUILD=1`, see scripts/build-static.mjs): every page prerendered into `site/`,
 *   progress stays on the device, installable and offline. `BASE_PATH` (e.g. `/learncode`) when
 *   it's hosted under a sub-path such as GitHub Pages.
 */
const STATIC = process.env.STATIC_BUILD === '1';
// App code reads this as `STATIC` from #lib/config.ts. Set before Vite loads the env.
process.env.VITE_STATIC = STATIC ? '1' : '';

/** '' or '/something' without a trailing slash, which is what SvelteKit wants. */
function basePath(raw: string | undefined): '' | `/${string}` {
	const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
	return trimmed ? `/${trimmed}` : '';
}

/**
 * The inline vibe-colour script in app.html is allowed by its hash (in both builds): prerendered
 * pages can't carry a per-request nonce, and the hash follows any edit to the script.
 */
function appHtmlScriptHashes(): string[] {
	const html = readFileSync(new URL('./src/app.html', import.meta.url), 'utf8');
	return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(
		(m) => `sha256-${createHash('sha256').update(m[1]).digest('base64')}`
	);
}

/**
 * `virtual:worker-files` for the service worker: the engine worker's own chunks and the sql.js
 * wasm. SvelteKit's `immutable` list only names the worker entry, and offline lessons need all of
 * it. Read from the client build, which is finished before the service worker is built.
 */
function workerFilesForServiceWorker(): Plugin {
	const id = 'virtual:worker-files';
	const dir = '_app/immutable/workers';
	return {
		name: 'learncode:worker-files',
		resolveId: (source) => (source === id ? `\0${id}` : undefined),
		load(resolved) {
			if (resolved !== `\0${id}`) return;
			let files: string[] = [];
			try {
				const root = fileURLToPath(new URL(`./.svelte-kit/output/client/${dir}`, import.meta.url));
				files = readdirSync(root, { recursive: true, withFileTypes: true })
					.filter((f) => f.isFile())
					.map((f) => path.relative(root, path.join(f.parentPath, f.name)))
					.map((rel) => `${dir}/${rel.split(path.sep).join('/')}`);
			} catch {
				// Dev server or no client build yet: nothing extra to cache.
			}
			return `export default ${JSON.stringify(files)};`;
		}
	};
}

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		workerFilesForServiceWorker(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: STATIC
				? adapterStatic({ pages: 'site', assets: 'site', fallback: '404.html', precompress: false })
				: adapterNode({ out: 'build' }),
			// Content-Security-Policy for every rendered page. SvelteKit adds a fresh nonce to the
			// scripts it renders and to nothing else; app.html's own script is allowed by hash.
			// - 'unsafe-eval': the engine compiles learner code with `new Function` (the page does it
			//   for syntax checks; the worker inherits the policy).
			// - worker-src/child-src blob: allow both a bundled worker file and a Blob worker.
			// - Inline styles are allowed (Svelte style directives, CodeMirror).
			// hooks.server.ts adds a stricter fallback to HTML responses that don't get this one.
			// The static build uses hashes in a <meta> tag instead (no server to mint nonces, and
			// frame-ancestors only works as a header, which GitHub Pages can't set).
			csp: {
				mode: STATIC ? 'hash' : 'nonce',
				directives: {
					'default-src': ['self'],
					'script-src': [
						'self',
						'unsafe-eval',
						'blob:',
						...(appHtmlScriptHashes() as `sha256-${string}`[])
					],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self', 'data:'],
					'connect-src': command === 'serve' ? ['self', 'ws:', 'wss:'] : ['self'],
					'worker-src': ['self', 'blob:'],
					'child-src': ['self', 'blob:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					...(STATIC ? {} : { 'frame-ancestors': ['self'] as 'self'[] })
				}
			},
			paths: STATIC
				? {
						base: basePath(process.env.BASE_PATH),
						// Relative links keep working even if the site is moved to another folder.
						relative: true
					}
				: {
						// Set ORIGIN at build time when the app is served over plain http without a reverse
						// proxy (local runs, e2e). Behind a proxy leave it unset and set PROTOCOL_HEADER instead.
						origin: process.env.ORIGIN || undefined,
						relative: false
					},
			// Only the static build has prerendered pages (the root layout turns prerendering on
			// there). Lesson pages come from `entries` in the lesson route.
			prerender: STATIC
				? { entries: ['/', '/learn', '/profile', '/login', '/signup', '/logout'] }
				: undefined,
			// The static build registers src/service-worker itself (src/lib/pwa.svelte.ts) so it
			// can offer "Update available". The server build never registers it.
			serviceWorker: { register: false }
		})
	],
	worker: {
		// ES-format workers let Vite split the sql.js loader into its own chunk, so the
		// Learn-to-code lessons never download the database engine.
		format: 'es'
	},
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node',
		// The curriculum registry uses import.meta.glob; the module cache would hide new files
		fsModuleCache: false
	}
}));
