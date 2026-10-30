import { defineConfig } from '@playwright/test';

const origin = 'http://localhost:4173';

export default defineConfig({
	testDir: 'tests/e2e',
	// The static build has its own config (playwright.static.config.ts)
	testIgnore: 'static.spec.ts',
	timeout: 60_000,
	use: {
		baseURL: origin,
		trace: 'retain-on-failure',
		// PW_CHROMIUM_PATH lets CI or a sandbox point at a pre-installed Chromium build
		launchOptions: process.env.PW_CHROMIUM_PATH
			? { executablePath: process.env.PW_CHROMIUM_PATH }
			: undefined
	},
	webServer: {
		// Cross-platform (Windows cmd, PowerShell, bash): no shell-specific syntax here.
		command:
			"node -e \"for (const f of ['data/e2e.sqlite','data/e2e.sqlite-wal','data/e2e.sqlite-shm']) require('fs').rmSync(f, { force: true })\" && npm run build && node build",
		env: {
			ORIGIN: origin,
			DATABASE_PATH: './data/e2e.sqlite',
			PORT: '4173',
			SIGNUPS_PER_IP_PER_HOUR: '1000'
		},
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
