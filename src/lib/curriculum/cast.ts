/**
 * The cast of "Behind the app" (the web track). Used by webtoon-style concept panels.
 * Keep names short; they appear next to every speech bubble.
 */
import type { CastId } from '#lib/curriculum/types.ts';

export interface CastMember {
	name: string;
	emoji: string;
	/** Accent for the avatar circle */
	color: string;
	/** One line, for a "who's who" card */
	role: string;
}

export const CAST: Record<CastId, CastMember> = {
	you: { name: 'You', emoji: '🧑‍💻', color: '#4f46e5', role: 'The new tech person at Inkwell' },
	mina: {
		name: 'Mina',
		emoji: '🎨',
		color: '#db2777',
		role: 'Lead artist. Asks the good questions'
	},
	theo: { name: 'Theo', emoji: '🧢', color: '#d97706', role: 'Runs the studio. Wants it shipped' },
	bit: {
		name: 'Bit',
		emoji: '📦',
		color: '#0891b2',
		role: 'A packet. Travels the wires so you can watch'
	},
	narrator: { name: 'Narrator', emoji: '📖', color: '#6b7280', role: 'Captions' }
};
