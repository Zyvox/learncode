<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { APP_NAME, STATIC } from '#lib/config.ts';
	import DeviceProfile from '#lib/components/DeviceProfile.svelte';
	import { THEMES, getModules, renderText, totalLessonCount } from '#lib/curriculum/index.ts';
	import type { ThemeId } from '#lib/curriculum/types.ts';
	import { allBadges } from '#lib/game/badges.ts';
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import XpBar from '#lib/components/XpBar.svelte';
	import { allTracks, lessonsOfTrack } from '#lib/stores/tracks.ts';
	import { currentTheme } from '#lib/stores/viewer.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// The load redirects guests, so the user is always there (except in the static build, which
	// shows DeviceProfile instead and never reads this).
	const user = $derived(data.user!);
	const badges = allBadges(getModules());
	const earnedAt = $derived(new Map(data.earned.map((b) => [b.badgeId, b.earnedAt])));
	const earnedCount = $derived(badges.filter((b) => earnedAt.has(b.id)).length);
	const total = totalLessonCount();
	const tracks = allTracks(getModules());
	const trackStats = $derived(
		tracks.map((t) => ({
			id: t.id,
			emoji: t.emoji,
			title: renderText(t.title, currentTheme()),
			done: data.trackDone?.[t.id] ?? 0,
			total: lessonsOfTrack(t.id, getModules()).length
		}))
	);

	let themeId = $state<ThemeId>(untrack(() => data.user?.themeId ?? 'games'));
	let displayName = $state(untrack(() => data.user?.displayName ?? ''));
	let saving = $state(false);
	let savedFlash = $state(false);

	const dirty = $derived(themeId !== user?.themeId || displayName.trim() !== user?.displayName);
	const memberSince = $derived(
		user
			? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
			: ''
	);
	const fmt = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
</script>

<svelte:head>
	<title>{STATIC ? 'Your progress' : 'Your profile'} · {APP_NAME}</title>
</svelte:head>

{#if STATIC || !user}
	<DeviceProfile />
{:else}
	<div class="mx-auto max-w-4xl space-y-6 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
		<header class="flex items-center gap-4">
			<div
				class="bg-accent text-on-accent grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-black"
				aria-hidden="true"
			>
				{user.displayName.slice(0, 1).toUpperCase()}
			</div>
			<div class="min-w-0">
				<h1 class="truncate text-3xl font-black tracking-tight">{user.displayName}</h1>
				<p class="text-ink-soft">Learning since {memberSince}</p>
			</div>
		</header>

		<section class="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]" aria-label="Your stats">
			<div class="card p-5"><XpBar xp={user.xp} /></div>
			<div class="card flex items-center gap-3 p-5">
				<span class="text-3xl" aria-hidden="true">🔥</span>
				<div>
					<div class="text-2xl leading-none font-black">{user.streak}</div>
					<div class="text-muted text-sm">day streak</div>
				</div>
			</div>
			<div class="card flex items-center gap-3 p-5">
				<span class="text-3xl" aria-hidden="true">🗺️</span>
				<div>
					<div class="text-2xl leading-none font-black">
						{data.doneCount}<span class="text-muted text-base">/{total}</span>
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

		<section class="card p-5 sm:p-6" aria-labelledby="badges-heading">
			<div class="mb-4 flex items-baseline justify-between gap-2">
				<h2 id="badges-heading" class="text-xl font-extrabold">Badges</h2>
				<span class="text-muted text-sm">{earnedCount} of {badges.length}</span>
			</div>
			<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				{#each badges as badge (badge.id)}
					{@const when = earnedAt.get(badge.id)}
					<li
						class="flex flex-col items-center rounded-2xl border p-4 text-center {when
							? 'border-accent/40 bg-accent-soft'
							: 'border-line bg-sand/50'}"
						data-earned={when ? 'yes' : 'no'}
					>
						<span class="mb-2 text-4xl {when ? '' : 'opacity-35 grayscale'}" aria-hidden="true"
							>{badge.emoji}</span
						>
						<span class="text-sm font-extrabold {when ? '' : 'text-ink-soft'}">{badge.name}</span>
						<span class="text-ink-soft mt-1 text-xs leading-snug">{badge.description}</span>
						<span class="text-muted mt-2 text-[0.7rem] font-bold">
							{when ? `Earned ${fmt(when)}` : 'Not yet'}
						</span>
					</li>
				{/each}
			</ul>
		</section>

		<section class="card p-5 sm:p-6" aria-labelledby="settings-heading">
			<h2 id="settings-heading" class="mb-4 text-xl font-extrabold">Name & vibe</h2>
			<form
				method="POST"
				action="?/save"
				class="space-y-5"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						saving = false;
						if (result.type === 'success') {
							savedFlash = true;
							setTimeout(() => (savedFlash = false), 2500);
						}
					};
				}}
			>
				{#if form && 'error' in form && form.error}
					<div
						class="border-oops/25 bg-oops-soft rounded-2xl border px-4 py-3 text-sm"
						role="alert"
					>
						{form.error}
					</div>
				{/if}
				<div class="max-w-sm">
					<label for="displayName" class="mb-1.5 block text-sm font-bold">Your name</label>
					<input
						id="displayName"
						name="displayName"
						class="field"
						maxlength="40"
						required
						bind:value={displayName}
					/>
				</div>
				<div>
					<p class="mb-2 text-sm font-bold">Vibe</p>
					<ThemePicker themes={THEMES} bind:value={themeId} compact legend="Vibe" />
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<button type="submit" class="btn btn-primary" disabled={saving || !dirty}>
						{saving ? 'Saving…' : 'Save changes'}
					</button>
					{#if savedFlash}<span class="text-good text-sm font-bold" role="status">Saved ✓</span
						>{/if}
				</div>
			</form>
		</section>

		<section
			class="border-line flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4"
		>
			<p class="text-ink-soft text-sm">
				Signed in as <strong class="text-ink">{user.email}</strong>
			</p>
			<form method="POST" action={resolve('/logout')}>
				<button type="submit" class="btn btn-quiet">👋 Log out</button>
			</form>
		</section>
	</div>
{/if}
