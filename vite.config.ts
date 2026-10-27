import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ out: 'build' }),
			// Content-Security-Policy for every rendered page. SvelteKit adds a fresh nonce to the
			// scripts it renders (and to `%sveltekit.nonce%` in app.html) and to nothing else.
			// - 'unsafe-eval': the engine compiles learner code with `new Function` (the page does it
			//   for syntax checks; the worker inherits the policy).
			// - worker-src/child-src blob: allow both a bundled worker file and a Blob worker.
			// - Inline styles are allowed (Svelte style directives, CodeMirror).
			// hooks.server.ts adds a stricter fallback to HTML responses that don't get this one.
			csp: {
				mode: 'nonce',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'unsafe-eval', 'blob:'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self', 'data:'],
					'connect-src': command === 'serve' ? ['self', 'ws:', 'wss:'] : ['self'],
					'worker-src': ['self', 'blob:'],
					'child-src': ['self', 'blob:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['self']
				}
			},
			paths: {
				// Set ORIGIN at build time when the app is served over plain http without a reverse
				// proxy (local runs, e2e). Behind a proxy leave it unset and set PROTOCOL_HEADER instead.
				origin: process.env.ORIGIN || undefined
			}
		})
	],
	worker: {
		// ES-format workers let Vite split the sql.js loader into its own chunk, so the
		// Learn-to-code lessons never download the database engine.
		format: 'es'
	},
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node'
	}
}));
