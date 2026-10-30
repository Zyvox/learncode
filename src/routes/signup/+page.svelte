<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { APP_NAME, STATIC } from '#lib/config.ts';
	import NoAccountsNote from '#lib/components/NoAccountsNote.svelte';
	import { DEFAULT_THEME_ID, THEMES } from '#lib/curriculum/index.ts';
	import type { ThemeId } from '#lib/curriculum/types.ts';
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import { guest } from '#lib/stores/guest.svelte.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	type Values = { email?: string; displayName?: string; themeId?: string };
	const values = $derived((form?.values ?? {}) as Values);

	let themeId = $state<ThemeId>(DEFAULT_THEME_ID);
	let submitting = $state(false);
	let showPassword = $state(false);
	let guestProgress = $state('');

	onMount(() => {
		guest.load();
		if (guest.themeId) themeId = guest.themeId;
		if (guest.hasCompleted) guestProgress = JSON.stringify({ entries: guest.importEntries() });
	});

	// After a failed submit, keep the vibe they had picked.
	$effect(() => {
		const v = values.themeId;
		if (v && THEMES.some((t) => t.id === v)) themeId = v as ThemeId;
	});
</script>

<svelte:head>
	<title>Create your account · {APP_NAME}</title>
</svelte:head>

{#if STATIC}
	<NoAccountsNote />
{:else}
	<div class="mx-auto max-w-2xl px-4 py-10 sm:py-14">
		<div class="card p-6 sm:p-8">
			<h1 class="text-3xl font-black tracking-tight">Create your free account</h1>
			<p class="text-ink-soft mt-1.5">
				{#if guest.loaded && guest.completedCount > 0}
					You've already finished {guest.completedCount} level{guest.completedCount === 1
						? ''
						: 's'}. Sign up and they come with you.
				{:else}
					Save your progress, keep a streak, and collect a few badges along the way.
				{/if}
			</p>

			<form
				method="POST"
				class="mt-7 space-y-6"
				use:enhance={({ formData }) => {
					submitting = true;
					// Read fresh, in case they finished a level in another tab.
					if (guest.hasCompleted) {
						formData.set('guestProgress', JSON.stringify({ entries: guest.importEntries() }));
					}
					return async ({ result, update }) => {
						if (result.type === 'redirect') {
							// The server imported finished levels from the form; send drafts along too.
							await guest.transferToAccount({ importCompleted: false });
						}
						await update({ reset: false });
						submitting = false;
					};
				}}
			>
				{#if form?.error}
					<div
						class="border-oops/25 bg-oops-soft rounded-2xl border px-4 py-3 text-sm"
						role="alert"
					>
						{form.error}
					</div>
				{/if}

				<input type="hidden" name="guestProgress" value={guestProgress} />

				<div>
					<p class="mb-2 font-bold">Your vibe</p>
					<ThemePicker
						themes={THEMES}
						bind:value={themeId}
						compact
						legend="Your vibe"
						onpick={(id) => guest.setTheme(id)}
					/>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="sm:col-span-2">
						<label for="displayName" class="mb-1.5 block text-sm font-bold"
							>What should we call you?</label
						>
						<input
							id="displayName"
							name="displayName"
							class="field"
							autocomplete="nickname"
							maxlength="40"
							required
							value={values.displayName ?? ''}
						/>
					</div>
					<div class="sm:col-span-2">
						<label for="email" class="mb-1.5 block text-sm font-bold">Email</label>
						<input
							id="email"
							name="email"
							type="email"
							class="field"
							autocomplete="email"
							required
							value={values.email ?? ''}
						/>
					</div>
					<div class="sm:col-span-2">
						<label for="password" class="mb-1.5 block text-sm font-bold">Password</label>
						<div class="relative">
							<input
								id="password"
								name="password"
								type={showPassword ? 'text' : 'password'}
								class="field pr-16"
								autocomplete="new-password"
								minlength="8"
								required
								aria-describedby="password-help"
							/>
							<button
								type="button"
								class="text-ink-soft hover:bg-sand absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold"
								aria-pressed={showPassword}
								onclick={() => (showPassword = !showPassword)}
								>{showPassword ? 'Hide' : 'Show'}</button
							>
						</div>
						<p id="password-help" class="text-muted mt-1.5 text-xs">
							At least 8 characters. A short sentence works great.
						</p>
					</div>
				</div>

				<button type="submit" class="btn btn-primary w-full text-base" disabled={submitting}>
					{submitting ? 'Creating your account…' : 'Create account'}
				</button>
			</form>

			<p class="text-ink-soft mt-6 text-center text-sm">
				Already have an account? <a
					href={resolve('/login')}
					class="text-accent-ink font-bold underline underline-offset-4">Log in</a
				>
			</p>
		</div>
	</div>
{/if}
