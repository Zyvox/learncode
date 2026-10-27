import type { Theme, ThemeId } from '#lib/curriculum/types.ts';

/**
 * The seven vibes. Every theme defines the same `vocab` keys:
 *   place    where the story happens ("the dungeon")
 *   friend   a helper character ("the old wizard")
 *   villain  a light-hearted troublemaker ("Grumble the goblin")
 *   reward   what you earn at the end of a module ("a shiny new sword")
 *   greeting how the hero says hi ("Hiya")
 * Content may use any of them as {place}, {Place}, {friend}, {Friend}, and so on.
 */
export const VOCAB_KEYS = ['place', 'friend', 'villain', 'reward', 'greeting'] as const;

export const THEMES: Theme[] = [
	{
		id: 'games',
		name: 'Games',
		tagline: 'Guide a hero through a dungeon full of loot',
		emoji: '🎮',
		hero: { name: 'Pix', emoji: '🧝' },
		item: { singular: 'coin', plural: 'coins', emoji: '🪙' },
		goal: { name: 'treasure chest', emoji: '🧰' },
		wall: { name: 'crate', emoji: '📦' },
		accent: '#7c5cff',
		vocab: {
			place: 'the dungeon',
			friend: 'the old wizard',
			villain: 'Grumble the goblin',
			reward: 'a shiny new sword',
			greeting: 'Hiya'
		}
	},
	{
		id: 'stories',
		name: 'Stories & comics',
		tagline: 'Help a comic-book cat leap from panel to panel',
		emoji: '📚',
		hero: { name: 'Inky', emoji: '🐱' },
		item: { singular: 'panel', plural: 'panels', emoji: '🖼️' },
		goal: { name: 'next page', emoji: '📖' },
		wall: { name: 'smudge', emoji: '⬛' },
		accent: '#e8590c',
		vocab: {
			place: 'the comic book',
			friend: 'the narrator',
			villain: 'the Eraser',
			reward: 'a brand-new chapter',
			greeting: 'Meow there'
		}
	},
	{
		id: 'music',
		name: 'Music',
		tagline: 'Gather the notes and get the band on stage',
		emoji: '🎵',
		hero: { name: 'Lyra', emoji: '🧑‍🎤' },
		item: { singular: 'note', plural: 'notes', emoji: '🎵' },
		goal: { name: 'stage', emoji: '🎤' },
		wall: { name: 'speaker', emoji: '🔊' },
		accent: '#d6336c',
		vocab: {
			place: 'the studio',
			friend: 'the drummer',
			villain: 'DJ Static',
			reward: 'a gold record',
			greeting: 'Hey hey'
		}
	},
	{
		id: 'space',
		name: 'Space',
		tagline: 'Drive a little rover across an alien planet',
		emoji: '🚀',
		hero: { name: 'Rova', emoji: '🤖' },
		item: { singular: 'crystal', plural: 'crystals', emoji: '💎' },
		goal: { name: 'lander', emoji: '🛸' },
		wall: { name: 'rock', emoji: '🪨' },
		accent: '#1c7ed6',
		vocab: {
			place: 'the red planet',
			friend: 'mission control',
			villain: 'the dust storm',
			reward: 'a new star on the map',
			greeting: 'Beep boop, hello'
		}
	},
	{
		id: 'nature',
		name: 'Nature',
		tagline: 'Help a fox forage through the forest',
		emoji: '🌿',
		hero: { name: 'Fern', emoji: '🦊' },
		item: { singular: 'chestnut', plural: 'chestnuts', emoji: '🌰' },
		goal: { name: 'burrow', emoji: '🕳️' },
		wall: { name: 'tree', emoji: '🌳' },
		accent: '#2f9e44',
		vocab: {
			place: 'the forest',
			friend: 'the wise owl',
			villain: 'the greedy squirrel',
			reward: 'a cosy winter stash',
			greeting: 'Good morning'
		}
	},
	{
		id: 'sports',
		name: 'Sports',
		tagline: 'Dribble, dodge and score',
		emoji: '⚽',
		hero: { name: 'Dash', emoji: '🏃' },
		item: { singular: 'ball', plural: 'balls', emoji: '⚽' },
		goal: { name: 'goal', emoji: '🥅' },
		wall: { name: 'cone', emoji: '🚧' },
		accent: '#0c8599',
		vocab: {
			place: 'the training pitch',
			friend: 'the coach',
			villain: 'the rival team',
			reward: 'a shiny trophy',
			greeting: "What's up"
		}
	},
	{
		id: 'food',
		name: 'Food',
		tagline: 'Cook up something tasty in a busy kitchen',
		emoji: '🍳',
		hero: { name: 'Nico', emoji: '🧑‍🍳' },
		item: { singular: 'tomato', plural: 'tomatoes', emoji: '🍅' },
		goal: { name: 'pot', emoji: '🍲' },
		wall: { name: 'jar', emoji: '🫙' },
		accent: '#c92a2a',
		vocab: {
			place: 'the kitchen',
			friend: 'the head chef',
			villain: 'the sneaky raccoon',
			reward: 'a golden spatula',
			greeting: 'Bonjour'
		}
	}
];

export const DEFAULT_THEME_ID: ThemeId = 'games';

const BY_ID = new Map<ThemeId, Theme>(THEMES.map((t) => [t.id, t]));

/** Look up a theme. Unknown or missing ids fall back to the default theme. */
export function getTheme(id: ThemeId | string | null | undefined): Theme {
	return BY_ID.get(id as ThemeId) ?? (BY_ID.get(DEFAULT_THEME_ID) as Theme);
}
