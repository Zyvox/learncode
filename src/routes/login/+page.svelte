<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { APP_NAME, STATIC } from '#lib/config.ts';
	import NoAccountsNote from '#lib/components/NoAccountsNote.svelte';
	import { guest } from '#lib/stores/guest.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
	let showPassword = $state(false);

	const values = $derived((form?.values ?? {}) as { email?: string; redirectTo?: string });
</script>

<svelte:head>
	<title>Log in · {APP_NAME}</title>
</svelte:head>

{#if STATIC}
	<NoAccountsNote />
{:else}
	<div class="mx-auto max-w-md px-4 py-12 sm:py-16">
		<div class="card p-6 sm:p-8">
			<h1 class="text-3xl font-black tracking-tight">Welcome back</h1>
			<p class="text-ink-soft mt-1.5">Log in to pick up right where you left off.</p>

			<form
				method="POST"
				class="mt-6 space-y-4"
				use:enhance={() => {
					submitting = true;
					return async ({ result, update }) => {
						if (result.type === 'redirect') {
							// Logged in on a device that has guest progress: bring it along.
							await guest.transferToAccount({ importCompleted: true });
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

				<input type="hidden" name="redirectTo" value={values.redirectTo ?? data.redirectTo ?? ''} />

				<div>
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
				<div>
					<label for="password" class="mb-1.5 block text-sm font-bold">Password</label>
					<div class="relative">
						<input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							class="field pr-16"
							autocomplete="current-password"
							required
						/>
						<button
							type="button"
							class="text-ink-soft hover:bg-sand absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold"
							aria-pressed={showPassword}
							onclick={() => (showPassword = !showPassword)}
							>{showPassword ? 'Hide' : 'Show'}</button
						>
					</div>
				</div>

				<button type="submit" class="btn btn-primary w-full text-base" disabled={submitting}>
					{submitting ? 'Logging in…' : 'Log in'}
				</button>
			</form>

			<p class="text-ink-soft mt-6 text-center text-sm">
				New here? <a
					href={resolve('/signup')}
					class="text-accent-ink font-bold underline underline-offset-4">Create a free account</a
				>
				<br />or
				<a href={resolve('/')} class="font-bold underline underline-offset-4"
					>just play as a guest</a
				>.
			</p>
		</div>
	</div>
{/if}
