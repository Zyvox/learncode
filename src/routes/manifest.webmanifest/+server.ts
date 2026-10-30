/**
 * Web app manifest for the installable static build (linked from the root layout only there).
 * Prerendered to `site/manifest.webmanifest`. Its URLs are relative to the manifest itself, so
 * they follow the base path (e.g. /learncode/) wherever the site is hosted.
 */
import { asset, resolve } from '$app/paths';
import { APP_NAME, APP_TAGLINE, STATIC } from '#lib/config.ts';
import type { RequestHandler } from './$types';

export const prerender = STATIC;

/** `--color-paper` in src/app.css (also app.html's theme-color) */
const PAPER = '#fbf7f0';

export const GET: RequestHandler = () => {
	const icon = (src: string, size: number, purpose: 'any' | 'maskable') => ({
		src,
		sizes: `${size}x${size}`,
		type: 'image/png',
		purpose
	});
	const manifest = {
		id: resolve('/'),
		name: APP_NAME,
		short_name: APP_NAME,
		description: APP_TAGLINE,
		lang: 'en',
		start_url: resolve('/'),
		scope: resolve('/'),
		display: 'standalone',
		orientation: 'any',
		background_color: PAPER,
		theme_color: PAPER,
		categories: ['education'],
		icons: [
			icon(asset('icons/icon-192.png'), 192, 'any'),
			icon(asset('icons/icon-512.png'), 512, 'any'),
			icon(asset('icons/icon-maskable-512.png'), 512, 'maskable')
		]
	};
	return new Response(JSON.stringify(manifest, null, '\t'), {
		headers: { 'content-type': 'application/manifest+json; charset=utf-8' }
	});
};
