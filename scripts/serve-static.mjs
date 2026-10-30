/**
 * A tiny static server for `site/` that behaves like GitHub Pages, for local checks and the
 * static e2e tests:
 *   - serves the site under BASE_PATH (e.g. /learncode/), `/learn` -> `learn.html`
 *   - unknown addresses get `404.html` (the app's fallback page) with status 404
 *
 *   BASE_PATH=/learncode node scripts/serve-static.mjs     # http://localhost:4174/learncode/
 *   PORT=8080 node scripts/serve-static.mjs
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const base = (process.env.BASE_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
const prefix = base ? `/${base}` : '';
const port = Number(process.env.PORT) || 4174;

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
	'.wasm': 'application/wasm',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8',
	'.woff2': 'font/woff2'
};

/** The file for a path inside the site, or null. */
function find(rel) {
	const clean = path.normalize(rel).replace(/^([/\\])+/, '');
	if (clean.startsWith('..')) return null;
	const full = path.join(root, clean);
	for (const candidate of [full, `${full}.html`, path.join(full, 'index.html')]) {
		try {
			if (statSync(candidate).isFile()) return candidate;
		} catch {
			/* try the next one */
		}
	}
	return null;
}

function send(res, file, status = 200) {
	res.writeHead(status, {
		'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
		'cache-control': 'no-cache'
	});
	createReadStream(file).pipe(res);
}

createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost');
	let pathname;
	try {
		pathname = decodeURIComponent(url.pathname);
	} catch {
		pathname = url.pathname;
	}
	if (prefix && pathname === prefix) {
		// Like GitHub Pages: the folder itself redirects to its trailing-slash form.
		res.writeHead(301, { location: `${prefix}/${url.search}` });
		res.end();
		return;
	}
	const fallback = path.join(root, '404.html');
	if (prefix && !pathname.startsWith(`${prefix}/`)) return send(res, fallback, 404);
	const file = find(pathname.slice(prefix.length));
	if (file) return send(res, file);
	send(res, fallback, 404);
}).listen(port, () => {
	console.log(`Serving site/ at http://localhost:${port}${prefix}/`);
});
