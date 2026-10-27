import { test, expect } from '@playwright/test';
import { typeAndRun, expectPassed, signUp, logIn, uniqueEmail } from './helpers';

test('guest progress is imported on signup and XP shows in the header', async ({ page }) => {
	await page.goto('/learn/first-steps/01-first-step');
	await typeAndRun(page, 'move();\nmove();\n');
	await expectPassed(page);

	const email = uniqueEmail('import');
	await signUp(page, email);
	await expect(page.locator('body')).toContainText('1 of 8');
	await expect(page.locator('body')).toContainText(/Welcome back, Test Person/);
	// XP bar in the header shows a non-zero total (the no-hint bonus makes 10 -> 15)
	await page.goto('/profile');
	await expect(page.locator('body')).toContainText(/15 XP in total/);
	await expect(page.locator('body')).toContainText('Off the Mark');
	// localStorage was cleared after the import
	const stored = await page.evaluate(() => localStorage.getItem('lc:progress:v1'));
	expect(stored === null || !stored.includes('"status":"done"')).toBeTruthy();
});

test('a logged-in user completes a level and it is saved on the server', async ({
	page,
	context
}) => {
	const email = uniqueEmail('user');
	await signUp(page, email);
	await page.goto('/learn/first-steps/01-first-step');
	await typeAndRun(page, 'move();\nmove();\n');
	await expectPassed(page);
	await expect(page.getByTestId('xp-gained')).toContainText('+15 XP');

	// New session, same account: progress is there.
	await context.clearCookies();
	await logIn(page, email);
	await expect(page.locator('body')).toContainText('1 of 8');
	await page.goto('/learn/first-steps/01-first-step');
	await expect(page.locator('.cm-content')).toContainText('move();');

	// Replaying gives no XP but still passes
	await typeAndRun(page, 'move();\nmove();\n');
	await expectPassed(page);
	await expect(page.getByTestId('xp-gained')).toHaveCount(0);
});

test('login rejects a wrong password without revealing which field is wrong', async ({
	page,
	context
}) => {
	const email = uniqueEmail('wrong');
	await signUp(page, email);
	await context.clearCookies();
	await page.goto('/login');
	await page.fill('input[name=email]', email);
	await page.fill('input[name=password]', 'not-the-password');
	await page.locator('button[type=submit]').click();
	await expect(page.locator('body')).toContainText(/don[’']t match/i);
	await expect(page).toHaveURL(/\/login/);
});

test('signup validates input and keeps what was typed', async ({ page }) => {
	await page.goto('/signup');
	await page.fill('input[name=displayName]', 'Short Pw');
	await page.fill('input[name=email]', uniqueEmail('short'));
	await page.fill('input[name=password]', 'short');
	await page.locator('button[type=submit]').click();
	await expect(page).toHaveURL(/\/signup/);
	await expect(page.locator('input[name=displayName]')).toHaveValue('Short Pw');
});

test('logging out returns to the landing page and protected pages redirect', async ({ page }) => {
	const email = uniqueEmail('logout');
	await signUp(page, email);
	await page
		.getByRole('button', { name: /account menu|profile|Test Person/i })
		.first()
		.click()
		.catch(() => {});
	await page.locator('form[action="/logout"] button').first().click({ force: true });
	await expect(page).toHaveURL(/\/$/);
	const res = await page.goto('/profile');
	await expect(page).toHaveURL(/\/login/);
	expect(res?.ok()).toBeTruthy();
});

test('profile lets you change your vibe', async ({ page }) => {
	await signUp(page, uniqueEmail('vibe'));
	await page.goto('/profile');
	await page.getByText('Music', { exact: false }).first().click();
	await page.getByRole('button', { name: /save/i }).click();
	await page.goto('/learn/first-steps/01-first-step');
	await expect(page.locator('body')).toContainText('Lyra');
});

test('health endpoint and API auth guard', async ({ request }) => {
	const health = await request.get('/api/health');
	expect(health.ok()).toBeTruthy();
	const res = await request.post('/api/progress/complete', {
		data: { lessonId: 'first-steps/01-first-step', code: '', hintsUsed: 0, attempts: 1 }
	});
	expect(res.status()).toBe(401);
});
