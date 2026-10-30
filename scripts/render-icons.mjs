/**
 * Renders the app icons in static/icons/ from the logo mark in the header (an egg about to hatch,
 * white on the default accent colour). Run it again after changing the mark or the colour:
 *
 *   node scripts/render-icons.mjs
 *
 * Needs Playwright's Chromium (`npx playwright install chromium`, or PW_CHROMIUM_PATH).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'static', 'icons');
const ACCENT = '#e8743b'; // --accent in src/app.css

/** The header's mark, in a 24×24 box */
const MARK = `<path d="M12 3c-3.6 0-6.5 4.2-6.5 8.6C5.5 16.2 8.4 20 12 20s6.5-3.8 6.5-8.4C18.5 7.2 15.6 3 12 3z" stroke="#fff" stroke-width="2" fill="none"/><path d="M7 12.5l2.2-1.8 2 2 2.2-2.4 2 1.6 1.6-1" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;

/**
 * @param {{ rounded: boolean; markScale: number }} o rounded: transparent corners (regular
 *   icon); markScale: share of the icon the mark fills (maskable icons keep it in the safe zone)
 */
function svg({ rounded, markScale }) {
	const size = 24 * markScale;
	const offset = (24 - size) / 2;
	const k = markScale;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<rect width="24" height="24" rx="${rounded ? 5.4 : 0}" fill="${ACCENT}"/>
<g transform="translate(${offset} ${offset + 0.4 * k}) scale(${k})">${MARK}</g>
</svg>`;
}

const icons = [
	{ file: 'icon-192.png', size: 192, rounded: true, markScale: 0.62 },
	{ file: 'icon-512.png', size: 512, rounded: true, markScale: 0.62 },
	{ file: 'icon-maskable-512.png', size: 512, rounded: false, markScale: 0.5 },
	{ file: 'apple-touch-icon.png', size: 180, rounded: false, markScale: 0.58 }
];

mkdirSync(out, { recursive: true });

const browser = await chromium.launch(
	process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
);
const page = await browser.newPage();
for (const icon of icons) {
	await page.setViewportSize({ width: icon.size, height: icon.size });
	await page.setContent(
		`<style>html,body{margin:0;background:transparent}svg{display:block;width:${icon.size}px;height:${icon.size}px}</style>${svg(icon)}`
	);
	await page
		.locator('svg')
		.screenshot({ path: path.join(out, icon.file), omitBackground: icon.rounded });
	console.log(`static/icons/${icon.file}`);
}
await browser.close();
