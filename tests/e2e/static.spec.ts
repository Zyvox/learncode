import { test, expect, type Page } from '@playwright/test';
import { expectPassed, typeAndRun } from './helpers';

/**
 * The static, offline build, served under /learncode/ (playwright.static.config.ts). Paths here are
 * relative to that base: page.goto('learn') opens /learncode/learn.
 */

const BASE = '/learncode';
const FIRST = 'learn/first-steps/01-first-step';
const SQL = 'learn/where-the-data-lives/01-select';

/** Wait until the service worker controls the page and has precached the whole app. */
async function waitForOffline(page: Page) {
	await page.waitForFunction(
		async () => {
			const reg = await navigator.serviceWorker.ready;
			return !!reg.active && !!navigator.serviceWorker.controller;
		},
		null,
		{ timeout: 30_000 }
	);
	const cached = await page.evaluate(async () => {
		const keys = await caches.keys();
		const cache = await caches.open(keys.find((k) => k.startsWith('hatch-offline-'))!);
		const urls = (await cache.keys()).map((r) => new URL(r.url).pathname);
		return { keys, count: urls.length, urls };
	});
	expect(cached.keys.some((k) => k.startsWith('hatch-offline-'))).toBe(true);
	expect(cached.urls).toContain(`${BASE}/${FIRST}`);
	expect(cached.urls).toContain(`${BASE}/${SQL}`);
	expect(cached.urls.some((u) => u.endsWith('.wasm'))).toBe(true);
	expect(cached.urls.some((u) => /sandbox\.worker-.*\.js$/.test(u))).toBe(true);
	await expect(page.getByTestId('offline-ready')).toBeAttached();
}

test('the landing page has no account links and says progress stays on the device', async ({
	page
}) => {
	await page.goto('');
	await expect(page).toHaveURL(`${BASE}/`);
	await expect(page.getByRole('heading', { level: 1 })).toContainText(/learn to code/i);
	await expect(page.getByTestId('device-note')).toBeVisible();
	await expect(page.locator('a[href*="login"], a[href*="signup"], a[href*="logout"]')).toHaveCount(
		0
	);
	await expect(page.locator('body')).not.toContainText(/sign up|log in|create .*account/i);
	// Every internal link stays under the base path
	const hrefs = await page
		.locator('a[href^="/"]')
		.evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
	expect(hrefs.length).toBeGreaterThan(0);
	for (const href of hrefs) expect(href.startsWith(`${BASE}/`) || href === BASE).toBe(true);
});

test('a guest solves the first level and the map shows it after a reload', async ({ page }) => {
	await page.goto('');
	await page.getByTestId('start-first-level').click();
	await expect(page).toHaveURL(`${BASE}/${FIRST}`);
	await typeAndRun(page, 'move();\nmove();\n');
	await expectPassed(page);
	await expect(page.getByTestId('xp-gained')).toContainText('XP');
	const nudge = page.getByTestId('progress-nudge');
	await expect(nudge).toContainText(/saved on this device/i);
	await expect(nudge).not.toContainText(/account/i);

	await page.getByTestId('next-level').click();
	await expect(page).toHaveURL(`${BASE}/learn/first-steps/02-turning`);

	await page.goto('learn');
	await expect(page.locator('body')).toContainText('1 of 8');
	await expect(page.getByTestId('device-banner')).toBeVisible();
	await page.reload();
	await expect(page.locator('body')).toContainText('1 of 8');
	await expect(page.locator('a[href*="signup"]')).toHaveCount(0);
});

test('the map opens the track named in ?track=', async ({ page }) => {
	await page.goto('learn?track=web');
	await expect(page.getByTestId('track-tab-web')).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('[data-module-id="where-the-data-lives"]')).toBeVisible();
});

test('the web app manifest is served for the sub-path', async ({ page, request }) => {
	await page.goto('');
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	const manifestUrl = new URL(href!, page.url());
	expect(manifestUrl.pathname).toBe(`${BASE}/manifest.webmanifest`);

	const res = await request.get(manifestUrl.href);
	expect(res.ok()).toBe(true);
	expect(res.headers()['content-type']).toContain('manifest+json');
	const manifest = await res.json();
	expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(`${BASE}/`);
	expect(new URL(manifest.scope, manifestUrl).pathname).toBe(`${BASE}/`);
	expect(manifest.display).toBe('standalone');
	expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
		expect.arrayContaining(['192x192', '512x512'])
	);
	for (const icon of manifest.icons) {
		const img = await request.get(new URL(icon.src, manifestUrl).href);
		expect(img.headers()['content-type']).toBe('image/png');
	}
	const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
	expect((await request.get(new URL(touch!, page.url()).href)).ok()).toBe(true);
});

test('after one visit, lessons load and run offline, including the SQL engine', async ({
	page,
	context
}) => {
	await page.goto(FIRST);
	await expect(page.getByTestId('lesson-title')).toBeVisible();
	await waitForOffline(page);

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByTestId('lesson-title')).toBeVisible();
	await typeAndRun(page, 'move();\nmove();\n');
	await expectPassed(page);

	// Never opened online: it comes from the precache, and so do the worker and the sql.js wasm.
	await page.goto(SQL);
	await expect(page.getByTestId('web-db')).toBeVisible();
	await typeAndRun(page, 'SELECT * FROM series;');
	const result = page.getByTestId('sql-result');
	await expect(result.locator('table')).toBeVisible({ timeout: 20_000 });
	await expect(result).toContainText('Moonlit Deliveries');

	// Client-side navigation offline uses the cached page data too
	await page.getByRole('link', { name: '← Map' }).click();
	await expect(page).toHaveURL(`${BASE}/learn`);
	await expect(page.locator('[data-module-id="first-steps"]')).toBeVisible();
	await context.setOffline(false);
});

test('the progress page is device-only, with backup and restore', async ({ page }) => {
	await page.goto(FIRST);
	await typeAndRun(page, 'move();\nmove();\n');
	await expectPassed(page);

	await page.goto('profile');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your progress');
	await expect(page.getByTestId('device-done-count')).toContainText('1');
	await expect(page.getByTestId('storage-status')).toContainText(/stored on this device/i);
	await expect(page.locator('input[name="email"], input[name="displayName"]')).toHaveCount(0);
	await expect(page.locator('body')).not.toContainText(/log out|signed in/i);

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByTestId('backup-download').click()
	]);
	expect(download.suggestedFilename()).toMatch(/^hatch-progress-\d{4}-\d{2}-\d{2}\.json$/);
	const backup = JSON.parse(
		await new Promise<string>((done, fail) => {
			download.createReadStream().then((s) => {
				const chunks: Buffer[] = [];
				s.on('data', (c: Buffer) => chunks.push(c));
				s.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
				s.on('error', fail);
			}, fail);
		})
	);
	expect(backup.entries[`first-steps/01-first-step`].completedAt).toBeTruthy();

	// Restoring adds a finished level and keeps the one already here
	backup.entries['first-steps/02-turning'] = {
		code: 'turnLeft();',
		hintsUsed: 0,
		attempts: 1,
		completedAt: '2026-01-02T10:00:00.000Z'
	};
	backup.entries['made-up/level'] = { code: '', hintsUsed: 0, attempts: 1, completedAt: null };
	await page.getByTestId('backup-file').setInputFiles({
		name: 'backup.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(backup))
	});
	await expect(page.getByTestId('restore-message')).toContainText(/1 more level is done/i);
	await expect(page.getByTestId('restore-message')).toContainText(/1 item/i);
	await expect(page.getByTestId('device-done-count')).toContainText('2');

	await page.getByTestId('backup-file').setInputFiles({
		name: 'nope.json',
		mimeType: 'application/json',
		buffer: Buffer.from('{"hello": "world"}')
	});
	await expect(page.getByTestId('restore-message')).toContainText(
		/doesn’t look like a progress backup/i
	);
	await expect(page.getByTestId('device-done-count')).toContainText('2');
});

test('typing an account address shows a friendly note instead', async ({ page }) => {
	for (const path of ['login', 'signup', 'logout']) {
		await page.goto(path);
		await expect(page.getByTestId('no-accounts-note')).toBeVisible();
		await expect(page.locator('form')).toHaveCount(0);
	}
});

test('an unknown address gets the friendly 404 page', async ({ page }) => {
	const res = await page.goto('learn/first-steps/99-nope');
	expect(res?.status()).toBe(404);
	await expect(page.locator('body')).toContainText(/wandered off/i);
});
