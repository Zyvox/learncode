<!-- Top bar on every page: logo, map link, XP/level/streak for users, a gentle guest chip otherwise. -->
<script lang="ts">
	import { page } from '$app/state';
	import { APP_NAME } from '#lib/config.ts';
	import { guest } from '#lib/stores/guest.svelte.ts';
	import type { SessionUser } from '#lib/stores/viewer.svelte.ts';
	import XpBar from './XpBar.svelte';

	let { user }: { user: SessionUser | null } = $props();

	let menuOpen = $state(false);
	const path = $derived(page.url.pathname);
	const onLearn = $derived(path.startsWith('/learn'));
	const authPage = $derived(path === '/login' || path === '/signup');

	$effect(() => {
		void path;
		menuOpen = false;
	});
</script>

<header class="border-line/80 bg-paper/85 sticky top-0 z-30 border-b backdrop-blur-md">
	<div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
		<a
			href={user ? '/learn' : '/'}
			class="flex shrink-0 items-center gap-2 rounded-xl text-lg font-black tracking-tight"
			aria-label="{APP_NAME} home"
		>
			<span
				class="bg-accent text-on-accent grid h-9 w-9 place-items-center rounded-xl shadow-[var(--shadow-soft)]"
				aria-hidden="true"
			>
				<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none"
					><path
						d="M12 3c-3.6 0-6.5 4.2-6.5 8.6C5.5 16.2 8.4 20 12 20s6.5-3.8 6.5-8.4C18.5 7.2 15.6 3 12 3z"
						stroke="currentColor"
						stroke-width="2"
					/><path
						d="M7 12.5l2.2-1.8 2 2 2.2-2.4 2 1.6 1.6-1"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					/></svg
				>
			</span>
			<span>{APP_NAME}</span>
		</a>

		<nav class="ml-1 hidden items-center gap-1 sm:flex" aria-label="Main">
			<a
				href="/learn"
				class="btn btn-ghost min-h-0 px-3 py-1.5 text-sm {onLearn ? 'bg-sand text-ink' : ''}"
				aria-current={path === '/learn' ? 'page' : undefined}>🗺️ Map</a
			>
		</nav>

		<div class="ml-auto flex items-center gap-2 sm:gap-3">
			{#if user}
				<span
					class="chip bg-warn-soft text-ink"
					title="{user.streak}-day streak"
					aria-label="{user.streak} day streak"
				>
					<span aria-hidden="true">🔥</span>{user.streak}
				</span>
				<a href="/profile" class="rounded-xl px-1 py-1" aria-label="Your profile">
					<XpBar xp={user.xp} compact />
				</a>
				<div class="relative">
					<button
						type="button"
						class="bg-sand text-ink-soft hover:bg-line grid h-10 w-10 place-items-center rounded-full font-extrabold"
						aria-haspopup="menu"
						aria-expanded={menuOpen}
						aria-label="Account menu"
						onclick={() => (menuOpen = !menuOpen)}
					>
						{(user.displayName || user.email).slice(0, 1).toUpperCase()}
					</button>
					{#if menuOpen}
						<div
							class="card animate-pop-in absolute right-0 mt-2 w-52 p-1.5"
							role="menu"
							tabindex="-1"
							onkeydown={(e) => e.key === 'Escape' && (menuOpen = false)}
						>
							<p class="truncate px-3 pt-2 pb-1 text-sm font-bold">{user.displayName}</p>
							<a
								href="/learn"
								role="menuitem"
								class="hover:bg-sand block rounded-xl px-3 py-2 text-sm">🗺️ Map</a
							>
							<a
								href="/profile"
								role="menuitem"
								class="hover:bg-sand block rounded-xl px-3 py-2 text-sm">🙂 Profile & badges</a
							>
							<form method="POST" action="/logout">
								<button
									type="submit"
									role="menuitem"
									class="hover:bg-sand block w-full rounded-xl px-3 py-2 text-left text-sm"
									>👋 Log out</button
								>
							</form>
						</div>
					{/if}
				</div>
			{:else if !authPage}
				{#if guest.loaded && guest.xp > 0}
					<span class="hidden sm:block"><XpBar xp={guest.xp} compact /></span>
				{/if}
				<a
					href="/signup"
					class="chip bg-accent-soft text-accent-ink hover:bg-accent/20 hidden py-1 md:inline-flex"
					data-testid="guest-chip"
				>
					Playing as guest · sign up to save
				</a>
				<a href="/login" class="btn btn-ghost min-h-0 px-3 py-1.5 text-sm">Log in</a>
				<a href="/signup" class="btn btn-primary min-h-0 px-3.5 py-1.5 text-sm md:hidden">Sign up</a
				>
			{/if}
		</div>
	</div>
</header>

{#if menuOpen}
	<button
		type="button"
		class="fixed inset-0 z-20 cursor-default"
		aria-label="Close menu"
		tabindex="-1"
		onclick={() => (menuOpen = false)}
	></button>
{/if}
