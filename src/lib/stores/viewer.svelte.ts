/**
 * Who is looking at the page and which vibe they're in. Works for logged-in users (from the
 * root layout data) and guests (from the guest store).
 */
import { page } from '$app/state';
import { DEFAULT_THEME_ID, getTheme } from '#lib/curriculum/index.ts';
import type { Theme, ThemeId } from '#lib/curriculum/types.ts';
import { guest } from './guest.svelte.ts';

/** Mirrors `App.Locals['user']` (docs/ARCHITECTURE.md) */
export interface SessionUser {
	id: number;
	email: string;
	displayName: string;
	themeId: ThemeId;
	xp: number;
	streak: number;
	createdAt: string;
}

export function currentUser(): SessionUser | null {
	return (page.data?.user as SessionUser | null | undefined) ?? null;
}

export function currentThemeId(): ThemeId {
	const user = currentUser();
	if (user) return user.themeId;
	return guest.themeId ?? DEFAULT_THEME_ID;
}

export function currentTheme(): Theme {
	return getTheme(currentThemeId());
}

/** Readable text colour on top of the accent (WCAG relative luminance). */
export function onAccentFor(hex: string): string {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return '#ffffff';
	let h = m[1];
	if (h.length === 3)
		h = h
			.split('')
			.map((c) => c + c)
			.join('');
	const [r, g, b] = [0, 2, 4].map((i) => {
		const c = parseInt(h.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	// Contrast vs white = 1.05 / (lum + 0.05); vs near-black ink ≈ (lum + 0.05) / 0.06
	return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.06 ? '#ffffff' : '#231c17';
}
