import type { Theme, ThemeId, ThemedText } from '#lib/curriculum/types.ts';
import { DEFAULT_THEME_ID } from './themes.ts';

/**
 * Pick the raw (un-filled) string for a theme. Plain strings are the same everywhere;
 * objects fall back to `default` when the theme has no override.
 */
export function pickThemed(text: ThemedText, themeId: ThemeId = DEFAULT_THEME_ID): string {
	if (typeof text === 'string') return text;
	return text[themeId] ?? text.default;
}

function pluralize(word: string): string {
	if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
	return `${word}s`;
}

function capitalize(s: string): string {
	return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** All placeholder values for a theme, keyed by their lower-case (or camelCase) name. */
export function placeholderValues(theme: Theme): Record<string, string> {
	return {
		...theme.vocab,
		hero: theme.hero.name,
		heroEmoji: theme.hero.emoji,
		item: theme.item.singular,
		items: theme.item.plural,
		itemEmoji: theme.item.emoji,
		goal: theme.goal.name,
		goalEmoji: theme.goal.emoji,
		wall: theme.wall.name,
		walls: pluralize(theme.wall.name),
		wallEmoji: theme.wall.emoji
	};
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/**
 * Fill the placeholders in themed text:
 *   {hero} {item} {items} {goal} {wall} {walls} {itemEmoji} {heroEmoji} {goalEmoji} {wallEmoji}
 *   plus every key in `theme.vocab` ({place}, {friend}, {villain}, {reward}, {greeting}).
 * A capitalised placeholder ({Hero}, {Items}, {Place}) capitalises the first letter of the value.
 * Unknown placeholders are left exactly as written.
 */
export function renderText(text: ThemedText, theme: Theme): string {
	const values = placeholderValues(theme);
	return pickThemed(text, theme.id).replace(PLACEHOLDER, (whole, name: string) => {
		if (Object.hasOwn(values, name)) return values[name];
		const lower = name[0].toLowerCase() + name.slice(1);
		if (lower !== name && Object.hasOwn(values, lower)) return capitalize(values[lower]);
		return whole;
	});
}
