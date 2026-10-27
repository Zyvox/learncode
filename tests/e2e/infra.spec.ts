import { test, expect } from '@playwright/test';
import { expectPassed, firstLessonHref, typeAndRun } from './helpers';

/**
 * Round 3: the net world (networks), the git world and boss outros. Module ids come from
 * docs/INFRA.md's plan; the first level of each module is found on the map, not hard-coded.
 */

test('a network level: look up a name, connect to 443 and see "open"', async ({ page }) => {
	const href = await firstLessonHref(page, 'networks-for-it');
	await page.goto(href);
	await expect(page.getByTestId('net-world')).toBeVisible();
	await expect(page.getByTestId('role-chip')).toContainText(/on the (laptop|phone)/i);
	await typeAndRun(
		page,
		["const ip = lookup('inkwell.app')", 'log(ip)', "connect(ip || 'inkwell.app', 443)"].join('\n')
	);
	const calls = page.getByTestId('net-calls');
	await expect(calls).toContainText('lookup(', { timeout: 20_000 });
	await expect(page.getByTestId('net-call').filter({ hasText: 'connect(' }).first()).toContainText(
		'open',
		{ timeout: 20_000 }
	);
});

test('a git level: init, add, commit, and the history shows one commit', async ({ page }) => {
	const href = await firstLessonHref(page, 'git-and-versions');
	await page.goto(href);
	await expect(page.getByTestId('git-terminal')).toBeVisible();
	await expect(page.getByTestId('code-editor')).toHaveAttribute('data-language', 'shell');
	await expect(page.getByTestId('run-button')).toContainText(/run commands/i);
	await expect(page.getByTestId('role-chip')).toContainText(/at the terminal/i);
	await typeAndRun(
		page,
		[
			'git init',
			'echo "Episode 1: the night market" > notes.txt',
			'git add notes.txt',
			'git commit -m "first notes"'
		].join('\n')
	);
	const graph = page.getByTestId('git-graph');
	await expect(graph.getByTestId('git-commit')).toHaveCount(1, { timeout: 20_000 });
	await expect(graph).toContainText('first notes');
	await expect(page.getByTestId('git-terminal')).toContainText('git commit -m "first notes"');
	await expect(
		page.getByTestId('git-files').locator('[data-testid="git-file"]', { hasText: 'notes.txt' })
	).toHaveAttribute('data-status', 'committed');
});

test('clearing a boss level tells you what happened next', async ({ page }) => {
	await page.goto('/learn/first-steps/08-boss');
	await typeAndRun(
		page,
		[
			'move();',
			'move();',
			'pickUp();',
			'turnRight();',
			'move();',
			'move();',
			'turnLeft();',
			'move();',
			'move();',
			'pickUp();',
			'move();',
			'turnRight();',
			'move();',
			'pickUp();',
			'move();'
		].join('\n')
	);
	await expectPassed(page);
	const outro = page.getByTestId('result-passed').getByTestId('outro');
	await expect(outro).toBeVisible();
	await expect(outro).toContainText(/what just happened/i);
	// The story beat comes before the way forward.
	const outroBox = await outro.boundingBox();
	const nextBox = await page.getByTestId('next-level').boundingBox();
	expect(outroBox && nextBox && outroBox.y < nextBox.y).toBeTruthy();
});
