import { STATIC } from '#lib/config.ts';
import type { LayoutServerLoad } from './$types';

/**
 * The static build prerenders every page (no request, so no user: everyone is a guest and their
 * progress lives on the device). The server build renders on request, as always.
 */
export const prerender = STATIC;

export const load: LayoutServerLoad = ({ locals }) => {
	return { user: locals.user ?? null };
};
