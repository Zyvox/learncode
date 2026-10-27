import { test, expect } from '@playwright/test';
import { typeAndRun, expectPassed } from './helpers';

test('landing page lets a guest pick a vibe and start the first level', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText(/learn to code/i);
	await page.getByText('Space', { exact: false }).first().click();
	await page.getByRole('link', { name: /try the first level/i }).click();
	await expect(page).toHaveURL(/\/learn\/first-steps\/01-first-step/);
	// The space vibe swaps the hero
	await expect(page.locator('body')).toContainText('Rova');
});

test('a guest can solve the first level, see XP, and the next level unlocks', async ({ page }) => {
	await page.goto('/learn/first-steps/01-first-step');
	await typeAndRun(page, 'move();\nmove();\n');
	await expectPassed(page);
	await expect(page.getByTestId('xp-gained')).toContainText('XP');
	await page.getByTestId('next-level').click();
	await expect(page).toHaveURL(/\/learn\/first-steps\/02-turning/);

	// Progress survives a reload (localStorage) and shows on the map
	await page.goto('/learn');
	await expect(page.locator('body')).toContainText('1 of 8');
	const stored = await page.evaluate(() => localStorage.getItem('lc:progress:v1'));
	expect(stored).toContain('first-steps/01-first-step');
});

test('a wrong answer gets a friendly, specific message instead of a JS error', async ({ page }) => {
	await page.goto('/learn/first-steps/01-first-step');
	await typeAndRun(page, 'mov();\n');
	const err = page.getByTestId('result-error');
	await expect(err).toBeVisible({ timeout: 15_000 });
	await expect(err).toContainText(/don't know anything called/i);
	await expect(err).toContainText('move()');
	await expect(err).not.toContainText('ReferenceError');
});

test('bumping into the edge ends the run with an explanation, not a crash', async ({ page }) => {
	await page.goto('/learn/first-steps/01-first-step');
	await typeAndRun(page, 'move();\nmove();\nmove();\nmove();\nmove();\nmove();\n');
	const err = page.getByTestId('result-error');
	await expect(err).toBeVisible({ timeout: 15_000 });
	await expect(err).toContainText(/edge/i);
});

test('an endless loop is stopped and explained', async ({ page }) => {
	await page.goto('/learn/first-steps/01-first-step');
	await typeAndRun(page, 'while (true) {}\n');
	const err = page.getByTestId('result-error');
	await expect(err).toBeVisible({ timeout: 20_000 });
	await expect(err).toContainText(/too long|never ends/i);
});

test('hints reveal one at a time', async ({ page }) => {
	await page.goto('/learn/first-steps/02-turning');
	await page.getByRole('button', { name: /nudge/i }).click();
	await expect(page.locator('body')).toContainText('1 of 3');
});

test('predict lessons accept an answer and explain it', async ({ page }) => {
	await page.goto('/learn/first-steps/06-predict');
	const choices = page.getByTestId('choice');
	await expect(choices.first()).toBeVisible();
	// The second choice is the correct one for this lesson
	await choices.nth(1).click();
	await expectPassed(page);
});

test('unknown lessons show the friendly 404 page', async ({ page }) => {
	const res = await page.goto('/learn/first-steps/99-nope');
	expect(res?.status()).toBe(404);
	await expect(page.locator('body')).not.toContainText('Internal Error');
});

test('console world prints output', async ({ page }) => {
	await page.goto('/learn/remembering-things/01-print');
	await typeAndRun(page, 'print("hello");\n');
	await expect(page.locator('body')).toContainText('hello', { timeout: 15_000 });
});
