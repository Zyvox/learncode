<!--
  /profile in the static (offline) build: no account, so everything comes from the guest store on
  this device. XP, level, streak, levels done, badges, the vibe, and keeping progress safe:
  persistent storage, installing, and a backup file to download or restore.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { APP_NAME } from '#lib/config.ts';
	import {
		THEMES,
		getLessonContext,
		getModules,
		renderText,
		totalLessonCount
	} from '#lib/curriculum/index.ts';
	import type { ThemeId } from '#lib/curriculum/types.ts';
	import { allBadges, evaluateBadges } from '#lib/game/badges.ts';
	import { backupFileName, makeBackup, parseBackup } from '#lib/game/backup.ts';
	import { streaksFromCompletions, utcDay } from '#lib/game/streak.ts';
	import { pwa } from '#lib/pwa.svelte.ts';
	import { guest } from '#lib/stores/guest.svelte.ts';
	import { allTracks, lessonsOfTrack } from '#lib/stores/tracks.ts';
	import { currentTheme, currentThemeId } from '#lib/stores/viewer.svelte.ts';
	import ThemePicker from './ThemePicker.svelte';
	import XpBar from './XpBar.svelte';

	const modules = getModules();
	const badges = allBadges(modules);
	const total = totalLessonCount();
	const tracks = allTracks(modules);

	const doneIds = $derived(
		Object.entries(guest.entries)
			.filter(([, e]) => e.completedAt)
			.map(([id]) => id)
	);
	const doneCount = $derived(doneIds.filter((id) => getLessonContext(id)).length);
	const streaks = $derived(
		streaksFromCompletions(
			Object.values(guest.entries).flatMap((e) => (e.completedAt ? [e.completedAt] : [])),
			utcDay()
		)
	);
	const earned = $derived(
		new Set(
			evaluateBadges({
				progress: Object.fromEntries(
					Object.entries(guest.entries).map(([id, e]) => [
						id,
						{ status: e.completedAt ? 'done' : 'started', hintsUsed: e.hintsUsed }
					])
				),
				modules,
				streak: streaks.longest,
				lesson: null,
				hour: null,
				earned: []
			})
		)
	);
	const trackStats = $derived(
		tracks.map((t) => {
			const lessons = lessonsOfTrack(t.id, modules);
			return {
				id: t.id,
				emoji: t.emoji,
				title: renderText(t.title, currentTheme()),
				done: lessons.filter((l) => guest.isDone(l.id)).length,
				total: lessons.length
			};
		})
	);

	const themeId = $derived(currentThemeId());
	function pick(id: ThemeId) {
		guest.setTheme(id);
	}

	onMount(() => {
		// Opening this page is a good moment to ask the browser to keep the progress around.
		void pwa.requestPersistence();
	});

	// ---------- backup ----------
	let restoreMessage = $state<{ ok: boolean; text: string } | null>(null);
	let fileInput = $state<HTMLInputElement>();

	function download() {
		const backup = makeBackup(guest.snapshot(), APP_NAME);
		const blob = new Blob([JSON.stringify(backup, null, '\t')], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = backupFileName(APP_NAME);
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function restore(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		let text: string;
		try {
			text = await file.text();
		} catch {
			restoreMessage = { ok: false, text: 'That file couldn’t be read. Try picking it again.' };
			return;
		}
		const parsed = parseBackup(text, (id) => !!getLessonContext(id));
		if (!parsed.ok) {
			restoreMessage = { ok: false, text: parsed.error };
			return;
		}
		const newlyDone = guest.restore(parsed.progress);
		const skipped = parsed.skipped
			? ` ${parsed.skipped} item${parsed.skipped === 1 ? '' : 's'} in the file didn’t match this app and ${parsed.skipped === 1 ? 'was' : 'were'} left out.`
			: '';
		restoreMessage = {
			ok: true,
			text:
				(newlyDone
					? `Restored. ${newlyDone} more level${newlyDone === 1 ? ' is' : 's are'} done now.`
					: 'Restored. Everything in that backup was already here.') + skipped
		};
	}
</script>

<div class="mx-auto max-w-4xl space-y-6 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
	<header class="flex items-center gap-4">
		<div
			class="bg-accent text-on-accent grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-3xl"
			aria-hidden="true"
		>
			{currentTheme().hero.emoji}
		</div>
		<div class="min-w-0">
			<h1 class="text-3xl font-black tracking-tight">Your progress</h1>
			<p class="text-ink-soft">Kept on this device. No account needed.</p>
		</div>
	</header>

	<section class="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]" aria-label="Your stats">
		<div class="card p-5"><XpBar xp={guest.xp} /></div>
		<div class="card flex items-center gap-3 p-5">
			<span class="text-3xl" aria-hidden="true">🔥</span>
			<div>
				<div class="text-2xl leading-none font-black">{streaks.current}</div>
				<div class="text-muted text-sm">day streak</div>
			</div>
		</div>
		<div class="card flex items-center gap-3 p-5">
			<span class="text-3xl" aria-hidden="true">🗺️</span>
			<div>
				<div class="text-2xl leading-none font-black" data-testid="device-done-count">
					{doneCount}<span class="text-muted text-base">/{total}</span>
				</div>
				<div class="text-muted text-sm">levels done</div>
			</div>
		</div>
	</section>

	{#if trackStats.length > 1}
		<ul class="-mt-2 flex flex-wrap gap-2" aria-label="Levels done per track">
			{#each trackStats as t (t.id)}
				<li class="chip bg-sand text-ink-soft" data-testid="profile-track-{t.id}">
					<span aria-hidden="true">{t.emoji}</span>
					{t.title}: <strong class="text-ink">{t.done}</strong> of {t.total}
				</li>
			{/each}
		</ul>
	{/if}

	<section class="card p-5 sm:p-6" aria-labelledby="keep-heading">
		<h2 id="keep-heading" class="text-xl font-extrabold">Keep it safe</h2>
		<p class="text-ink-soft mt-1.5 text-sm" data-testid="storage-status">
			<span aria-hidden="true">💾</span>
			{pwa.persisted
				? 'Progress is stored on this device, and marked persistent, so the browser won’t clear it to save space.'
				: 'Progress is stored on this device.'}
		</p>
		<p class="text-muted mt-2 text-sm">
			It lives in this browser only. Installing the app to your home screen keeps it safest (on
			iPhone and iPad, Safari clears website data after a week of not using it, unless the app is
			installed). A backup file moves it to another device.
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-3">
			<button
				type="button"
				class="btn btn-primary"
				onclick={download}
				data-testid="backup-download"
			>
				<span aria-hidden="true">⬇︎</span> Download a backup
			</button>
			<button type="button" class="btn btn-quiet" onclick={() => fileInput?.click()}>
				<span aria-hidden="true">⬆︎</span> Restore from a backup
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				class="sr-only"
				tabindex="-1"
				aria-label="Backup file to restore"
				onchange={restore}
				data-testid="backup-file"
			/>
			{#if pwa.installPrompt}
				<button type="button" class="btn btn-ghost" onclick={() => pwa.install()}>
					Install app
				</button>
			{/if}
		</div>
		{#if restoreMessage}
			<p
				class="mt-3 rounded-2xl border px-4 py-3 text-sm {restoreMessage.ok
					? 'border-good/25 bg-good-soft'
					: 'border-oops/25 bg-oops-soft'}"
				role="status"
				data-testid="restore-message"
			>
				{restoreMessage.text}
			</p>
		{/if}
	</section>

	<section class="card p-5 sm:p-6" aria-labelledby="badges-heading">
		<div class="mb-4 flex items-baseline justify-between gap-2">
			<h2 id="badges-heading" class="text-xl font-extrabold">Badges</h2>
			<span class="text-muted text-sm"
				>{badges.filter((b) => earned.has(b.id)).length} of {badges.length}</span
			>
		</div>
		<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
			{#each badges as badge (badge.id)}
				{@const got = earned.has(badge.id)}
				<li
					class="flex flex-col items-center rounded-2xl border p-4 text-center {got
						? 'border-accent/40 bg-accent-soft'
						: 'border-line bg-sand/50'}"
					data-earned={got ? 'yes' : 'no'}
				>
					<span class="mb-2 text-4xl {got ? '' : 'opacity-35 grayscale'}" aria-hidden="true"
						>{badge.emoji}</span
					>
					<span class="text-sm font-extrabold {got ? '' : 'text-ink-soft'}">{badge.name}</span>
					<span class="text-ink-soft mt-1 text-xs leading-snug">{badge.description}</span>
					<span class="text-muted mt-2 text-[0.7rem] font-bold">{got ? 'Earned' : 'Not yet'}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="card p-5 sm:p-6" aria-labelledby="vibe-heading">
		<h2 id="vibe-heading" class="mb-4 text-xl font-extrabold">Vibe</h2>
		<ThemePicker themes={THEMES} value={themeId} onpick={pick} compact legend="Vibe" />
	</section>
</div>
