import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 60_000,
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure',
		// PW_CHROMIUM_PATH lets CI or a sandbox point at a pre-installed Chromium build
		launchOptions: process.env.PW_CHROMIUM_PATH
			? { executablePath: process.env.PW_CHROMIUM_PATH }
			: undefined
	},
	webServer: {
		command:
			'rm -f data/e2e.sqlite* && ORIGIN=http://localhost:4173 npm run build && DATABASE_PATH=./data/e2e.sqlite PORT=4173 ORIGIN=http://localhost:4173 SIGNUPS_PER_IP_PER_HOUR=1000 node build',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
