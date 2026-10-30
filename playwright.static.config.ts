import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests for the static, offline build (`npm run test:e2e:static`): builds `site/` for
 * the sub-path /learncode/ (like GitHub Pages) and serves it with scripts/serve-static.mjs.
 */
const port = 4174;
const base = '/learncode';
const url = `http://localhost:${port}${base}/`;

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: 'static.spec.ts',
	timeout: 60_000,
	use: {
		// Trailing slash: tests use relative paths, e.g. page.goto('learn') -> /learncode/learn
		baseURL: url,
		trace: 'retain-on-failure',
		serviceWorkers: 'allow',
		launchOptions: process.env.PW_CHROMIUM_PATH
			? { executablePath: process.env.PW_CHROMIUM_PATH }
			: undefined
	},
	webServer: {
		// STATIC_SITE_READY=1 (CI) serves the site built by the previous step instead of rebuilding.
		command: process.env.STATIC_SITE_READY
			? 'node scripts/serve-static.mjs'
			: 'node scripts/build-static.mjs && node scripts/serve-static.mjs',
		env: { BASE_PATH: base, PORT: String(port) },
		url,
		reuseExistingServer: !process.env.CI,
		timeout: 300_000
	}
});
