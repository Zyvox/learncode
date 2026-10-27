import type { Track, TrackId } from '#lib/curriculum/types.ts';

/** The two tracks, in the order they appear on the map. */
export const TRACKS: Track[] = [
	{
		id: 'code',
		title: 'Learn to code',
		blurb: 'Tell a little character what to do, one small level at a time.',
		emoji: '🧭',
		audience: 'Never coded before. Pick a vibe and start.'
	},
	{
		id: 'web',
		title: 'Behind the app',
		blurb:
			'What a server is, what an endpoint is, where the data lives, and how it all connects. You build a webtoon app’s backend to find out.',
		emoji: '🖥️',
		audience: 'You work around tech and want the real picture.'
	}
];

export const TRACK_ORDER: TrackId[] = TRACKS.map((t) => t.id);

export function getTrack(id: TrackId | string | undefined): Track | undefined {
	return TRACKS.find((t) => t.id === id);
}
