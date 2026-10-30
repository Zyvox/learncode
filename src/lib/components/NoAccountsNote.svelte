<!-- Shown at /login, /signup and /logout in the static (offline) build, which has no accounts. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { APP_NAME } from '#lib/config.ts';
</script>

<svelte:head>
	<title>No account needed · {APP_NAME}</title>
</svelte:head>

<div class="mx-auto max-w-md px-4 py-12 sm:py-16" data-testid="no-accounts-note">
	<div class="card p-6 sm:p-8">
		<div class="mb-4 text-4xl" aria-hidden="true">📱</div>
		<h1 class="text-3xl font-black tracking-tight">Accounts aren’t part of the offline app</h1>
		<p class="text-ink-soft mt-3">
			This version of {APP_NAME} runs entirely on your device. There’s nothing to sign up for: your progress
			is saved right here, and once you’ve opened it, it works offline too.
		</p>
		<div class="mt-6 flex flex-wrap gap-3">
			<a href={resolve('/learn')} class="btn btn-primary">Go to the map</a>
			<a href={resolve('/profile')} class="btn btn-quiet">Your progress</a>
		</div>
	</div>
</div>
