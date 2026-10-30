/**
 * Service worker for the static, offline build (registered by src/lib/pwa.svelte.ts; the server
 * build never registers it).
 *
 * - install: precache everything the app needs to run offline: Vite's output (`immutable`: JS,
 *   CSS), the engine worker with its chunks and the sql.js wasm (`virtual:worker-files`, see
 *   vite.config.ts), the files in `static/` (`assets`: icons…), every prerendered page and its
 *   data file (`prerendered`), and the SPA fallback page `404.html`. One cache per build version.
 * - activate: delete the caches of older versions, take control of open pages.
 * - fetch: hashed build files are cache-first (they never change). Everything else of ours is
 *   network-first, falling back to the precached copy when offline, and for pages to the
 *   fallback page. Network responses are not written back, so the offline copy always matches
 *   the version that precached it.
 * - updates: a new version waits until the page asks it to take over ("Update available").
 */
import { self } from '$app/service-worker';
import { assets, immutable, prerendered } from '$app/manifest';
import { version } from '$app/env';
import workerFiles from 'virtual:worker-files';

const PREFIX = 'hatch-offline-';
const CACHE = `${PREFIX}${version}`;
/** e.g. `https://user.github.io/learncode/` — the folder the app lives in */
const SCOPE = new URL(self.registration.scope);
const at = (path: string) => new URL(path, SCOPE).pathname;

const IMMUTABLE = new Set([...immutable.map((f) => f.path), ...workerFiles].map(at));
const PRECACHE = [
	...IMMUTABLE,
	...assets.map((f) => at(f.path)),
	...prerendered.map((f) => at(f.path)),
	at('404.html')
];
/** Navigations wait this long for the network before the cached page is used instead. */
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...new Set(PRECACHE)])));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})()
	);
});

self.addEventListener('message', (event) => {
	if (event.data === 'skip-waiting') void self.skipWaiting();
});

/** The cached copy of a page or file, trying the usual spellings of the same path. */
async function fromCache(url: URL, navigate: boolean): Promise<Response | undefined> {
	const cache = await caches.open(CACHE);
	const paths = [url.pathname];
	if (url.pathname.endsWith('/')) paths.push(url.pathname.slice(0, -1));
	else paths.push(`${url.pathname}/`);
	for (const path of paths) {
		const hit = await cache.match(path, { ignoreSearch: true });
		if (hit) return hit;
	}
	// An address we never prerendered: the fallback page boots the app, which shows its own 404.
	return navigate ? cache.match(at('404.html')) : undefined;
}

async function networkFirst(request: Request, url: URL): Promise<Response> {
	const navigate = request.mode === 'navigate';
	const network = fetch(request);
	try {
		if (!navigate) return await network;
		// Slow or flaky connection: show the cached page rather than a spinner.
		const timeout = new Promise<undefined>((done) => setTimeout(done, NETWORK_TIMEOUT_MS));
		const winner = await Promise.race([network, timeout]);
		if (winner) return winner;
		return (await fromCache(url, true)) ?? (await network);
	} catch {
		const cached = await fromCache(url, navigate);
		if (cached) return cached;
		return new Response('You’re offline and this page isn’t saved on this device yet.', {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
	}
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

	if (IMMUTABLE.has(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(request)));
		return;
	}
	event.respondWith(networkFirst(request, url));
});
