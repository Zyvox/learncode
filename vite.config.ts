import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ out: 'build' }),
			paths: {
				// Set ORIGIN at build time when the app is served over plain http without a reverse
				// proxy (local runs, e2e). Behind a proxy leave it unset and set PROTOCOL_HEADER instead.
				origin: process.env.ORIGIN || undefined
			}
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node'
	}
});
