import { test, expect } from '@playwright/test';
import { firstLessonHref, typeAndRun } from './helpers';

/**
 * "Behind the app" track. Lesson ids come from docs/WEB_TRACK.md's module plan; the exact
 * lesson slugs are read from the map (locked levels carry `data-lesson-href`).
 */

test('the landing page has a second way in that opens the first web level', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /pick your path/i })).toBeVisible();
	await page.getByTestId('path-web').click();
	await expect(page).toHaveURL(/\/learn\/what-happens-when-you-tap\//);
	await expect(page.getByTestId('web-phone')).toBeVisible();
	await expect(page.getByTestId('role-chip')).toContainText(/the phone/i);
});

test('the first web level: a request comes back 200 and the phone shows it', async ({ page }) => {
	const href = await firstLessonHref(page, 'what-happens-when-you-tap');
	await page.goto(href);
	await expect(page.getByTestId('web-phone')).toBeVisible();
	await expect(page.getByTestId('web-server')).toBeVisible();
	// Whatever the first endpoint is called in the lesson, one of these answers.
	await typeAndRun(
		page,
		[
			"for (const path of ['/episodes', '/series', '/']) {",
			'  const res = get(path)',
			'  if (res.ok) { show(res.body); break }',
			'}'
		].join('\n')
	);
	await expect(page.getByTestId('web-status')).toContainText('200', { timeout: 20_000 });
	await expect(page.getByTestId('web-screen-item').first()).toBeVisible();
	await expect(page.getByTestId('web-response').first()).toBeVisible();
});

test('a sql level shows the result as a table', async ({ page }) => {
	const href = await firstLessonHref(page, 'where-the-data-lives');
	await page.goto(href);
	await expect(page.getByTestId('web-db')).toBeVisible();
	await expect(page.getByTestId('code-editor')).toHaveAttribute('data-language', 'sql');
	await expect(page.getByTestId('run-button')).toContainText(/run query/i);
	await typeAndRun(page, 'SELECT * FROM series;');
	const result = page.getByTestId('sql-result');
	await expect(result.locator('table')).toBeVisible({ timeout: 20_000 });
	await expect(result).toContainText(/\d+ rows?/);
	await expect(result).toContainText('Moonlit Deliveries');
});

test('the map has two tracks and remembers the one you picked', async ({ page }) => {
	await page.goto('/learn');
	const webTab = page.getByTestId('track-tab-web');
	const codeTab = page.getByTestId('track-tab-code');
	await expect(webTab).toBeVisible();
	await expect(codeTab).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('[data-module-id="first-steps"]')).toBeVisible();

	await webTab.click();
	await expect(webTab).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('[data-module-id="what-happens-when-you-tap"]')).toBeVisible();
	await expect(page.locator('[data-module-id="first-steps"]')).toHaveCount(0);
	// Each track has its own progress and its first part is open.
	await expect(webTab).toContainText(/0 of \d+/);
	await expect(
		page.locator('[data-module-id="what-happens-when-you-tap"] a[aria-current="step"]')
	).toBeVisible();

	// Remembered across visits (guest-safe, in this browser).
	await page.goto('/learn');
	await expect(page.getByTestId('track-tab-web')).toHaveAttribute('aria-selected', 'true');
	await page.getByTestId('track-tab-code').click();
	await expect(page.locator('[data-module-id="first-steps"]')).toBeVisible();
});

test('the map follows ?track= in the URL while you are already on it', async ({ page }) => {
	await page.goto('/learn?track=code');
	await expect(page.getByTestId('track-tab-code')).toHaveAttribute('aria-selected', 'true');
	// A link elsewhere on the page (header, landing card…) to the other track: client-side nav.
	await page.evaluate(() => {
		const a = document.createElement('a');
		a.href = '/learn?track=web';
		a.textContent = 'to the web track';
		a.id = 'e2e-track-link';
		document.body.appendChild(a);
	});
	await page.locator('#e2e-track-link').click();
	await expect(page).toHaveURL(/track=web/);
	await expect(page.getByTestId('track-tab-web')).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('[data-module-id="what-happens-when-you-tap"]')).toBeVisible();
});
