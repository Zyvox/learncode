/**
 * Track helpers for the UI: which track a module belongs to, the track list, the cast of the
 * webtoon panels and the remembered track tab. Pure except for the guarded localStorage helpers.
 */
import * as curriculum from '#lib/curriculum/index.ts';
import type { CastId, Lesson, Module, Track, TrackId } from '#lib/curriculum/types.ts';

/** Used when the curriculum doesn't export TRACKS (yet). Mirrors docs/WEB_TRACK.md. */
const FALLBACK_TRACKS: Track[] = [
	{
		id: 'code',
		title: 'Learn to code',
		blurb: 'Tell a little character what to do, one small level at a time.',
		emoji: '🧭',
		audience: 'For total beginners.'
	},
	{
		id: 'web',
		title: 'Behind the app',
		blurb: 'Servers, endpoints and databases, built for a webtoon studio’s reader app.',
		emoji: '✒️',
		audience: 'For people who work around tech and want to see how apps actually work.'
	}
];

export interface CastMember {
	name: string;
	emoji: string;
	color: string;
}

const FALLBACK_CAST: Record<CastId, CastMember> = {
	you: { name: 'You', emoji: '🙂', color: '#e8743b' },
	mina: { name: 'Mina', emoji: '🎨', color: '#c2577f' },
	theo: { name: 'Theo', emoji: '🧢', color: '#3f7cc0' },
	bit: { name: 'Bit', emoji: '📦', color: '#c99a2e' },
	narrator: { name: 'Narrator', emoji: '📖', color: '#8a8077' }
};

// cast.ts is written by the content work; pick it up when it's there without breaking the build.
const castModules = import.meta.glob<{ CAST?: Partial<Record<CastId, CastMember>> }>(
	'../curriculum/cast.ts',
	{ eager: true }
);
const CAST_FROM_CURRICULUM = Object.values(castModules)[0]?.CAST ?? {};

export function castMember(id: CastId | undefined): CastMember {
	const key = id ?? 'narrator';
	return CAST_FROM_CURRICULUM[key] ?? FALLBACK_CAST[key] ?? FALLBACK_CAST.narrator;
}

export function trackOf(module: Pick<Module, 'track'> | undefined): TrackId {
	return module?.track ?? 'code';
}

/** Tracks in display order. Only tracks that have at least one module show up. */
export function allTracks(modules: readonly Module[] = curriculum.getModules()): Track[] {
	const fromCurriculum = (curriculum as unknown as { TRACKS?: Track[] }).TRACKS;
	const list =
		Array.isArray(fromCurriculum) && fromCurriculum.length ? fromCurriculum : FALLBACK_TRACKS;
	const present = new Set(modules.map((m) => trackOf(m)));
	const shown = list.filter((t) => present.has(t.id));
	return shown.length ? shown : list.slice(0, 1);
}

export function trackInfo(id: TrackId): Track {
	return allTracks().find((t) => t.id === id) ?? FALLBACK_TRACKS.find((t) => t.id === id)!;
}

/** Modules of one track, in map order. */
export function modulesOfTrack(
	id: TrackId,
	modules: readonly Module[] = curriculum.getModules()
): Module[] {
	return modules.filter((m) => trackOf(m) === id).sort((a, b) => a.order - b.order);
}

/** All playable lessons of a track, in course order. */
export function lessonsOfTrack(
	id: TrackId,
	modules: readonly Module[] = curriculum.getModules()
): Lesson[] {
	return modulesOfTrack(id, modules)
		.filter((m) => !m.comingSoon)
		.flatMap((m) => m.lessons);
}

export function firstLessonOfTrack(
	id: TrackId,
	modules: readonly Module[] = curriculum.getModules()
): Lesson | undefined {
	return lessonsOfTrack(id, modules)[0];
}

export function isTrackId(v: unknown): v is TrackId {
	return v === 'code' || v === 'web';
}

export const TRACK_KEY = 'lc:track';

export function loadTrackChoice(): TrackId | null {
	try {
		const v = localStorage.getItem(TRACK_KEY);
		return isTrackId(v) ? v : null;
	} catch {
		return null;
	}
}

export function saveTrackChoice(id: TrackId) {
	try {
		localStorage.setItem(TRACK_KEY, id);
	} catch {
		// Private mode: the tab just won't be remembered.
	}
}
