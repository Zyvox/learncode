import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 60_000,
	use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
	webServer: {
		command:
			'npm run build && DATABASE_PATH=./data/e2e.sqlite PORT=4173 ORIGIN=http://localhost:4173 node build',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
