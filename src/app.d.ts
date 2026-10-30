// See https://svelte.dev/docs/kit/types#app.d.ts
// `Locals` is the contract from docs/ARCHITECTURE.md; it is set in src/hooks.server.ts.
import type { ThemeId } from '#lib/curriculum/types.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: null | {
				id: number;
				email: string;
				displayName: string;
				themeId: ThemeId;
				xp: number;
				/** Current streak: 0 if the last active day is older than yesterday (UTC). */
				streak: number;
				createdAt: string;
			};
			/** `id` is the hashed session id (not the cookie token). */
			session: null | { id: string; expiresAt: Date };
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface ImportMetaEnv {
		/** '1' in the static build (vite.config.ts); read it through `STATIC` in #lib/config.ts */
		readonly VITE_STATIC?: string;
	}
}

export {};
