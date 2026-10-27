import { expect, type Page } from '@playwright/test';

/** Replace the editor contents with `code` and press Run. */
export async function typeAndRun(page: Page, code: string) {
	const editor = page.locator('.cm-content');
	await editor.click();
	await page.keyboard.press('Control+A');
	await page.keyboard.press('Delete');
	// Type line by line so CodeMirror's auto-indent/close-brackets don't mangle the code.
	// We disable auto-closing by inserting text through the clipboard-free insertText command.
	await page.keyboard.insertText(code);
	await page.getByTestId('run-button').click();
}

export async function expectPassed(page: Page) {
	await expect(page.getByTestId('result-passed')).toBeVisible({ timeout: 15_000 });
}

export function uniqueEmail(prefix = 'e2e') {
	return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function signUp(
	page: Page,
	email: string,
	password = 'password123',
	name = 'Test Person'
) {
	await page.goto('/signup');
	await page.fill('input[name=displayName]', name);
	await page.fill('input[name=email]', email);
	await page.fill('input[name=password]', password);
	await page.locator('button[type=submit]').click();
	await page.waitForURL(/\/learn/);
}

export async function logIn(page: Page, email: string, password = 'password123') {
	await page.goto('/login');
	await page.fill('input[name=email]', email);
	await page.fill('input[name=password]', password);
	await page.locator('button[type=submit]').click();
	await page.waitForURL(/\/learn/);
}

/**
 * The first level of a module, read from the map (locked levels carry `data-lesson-href`), so
 * tests don't hard-code slugs that the content may rename.
 */
export async function firstLessonHref(page: Page, moduleId: string, track = 'web'): Promise<string> {
	await page.goto(`/learn?track=${track}`);
	const card = page.locator(`[data-module-id="${moduleId}"]`);
	await expect(card).toBeVisible();
	const node = card.locator('a[href^="/learn/"], [data-lesson-href]').first();
	const href = (await node.getAttribute('href')) ?? (await node.getAttribute('data-lesson-href'));
	expect(href).toBeTruthy();
	return href!;
}
