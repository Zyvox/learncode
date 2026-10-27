import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Public liveness check: `GET /api/health` -> `{ ok: true }`. */
export const GET: RequestHandler = () =>
	json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
