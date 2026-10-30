/** App-wide constants. Rename the product here. */
export const APP_NAME = 'Hatch';
export const APP_TAGLINE = 'Learn to code, one small level at a time.';

/**
 * True in the static, offline build (`npm run build:static`): no server, no accounts, progress
 * stays on the device. Set by vite.config.ts; '' or undefined in the normal server build.
 */
export const STATIC = import.meta.env.VITE_STATIC === '1';
