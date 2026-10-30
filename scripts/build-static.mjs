/**
 * The static, offline build: every page prerendered into `site/`, no server, progress kept on the
 * device. Works the same on Windows, macOS and Linux (no shell syntax, no extra packages).
 *
 *   node scripts/build-static.mjs                         # site at the root of a domain
 *   BASE_PATH=/learncode node scripts/build-static.mjs    # site under https://<user>.github.io/learncode/
 *
 * (PowerShell: `$env:BASE_PATH='/learncode'; npm run build:static`)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const env = { ...process.env, STATIC_BUILD: '1', VITE_STATIC: '1' };
console.log(`Static build, base path: ${env.BASE_PATH ? env.BASE_PATH : '(root)'}`);

const result = spawnSync(process.execPath, [vite, 'build'], { cwd: root, env, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

const site = path.join(root, 'site');
if (!existsSync(path.join(site, 'index.html'))) {
	console.error('The static build finished but site/index.html is missing.');
	process.exit(1);
}
// GitHub Pages runs Jekyll by default, which drops folders starting with "_" (like `_app/`).
writeFileSync(path.join(site, '.nojekyll'), '');
console.log('Static site written to site/');
