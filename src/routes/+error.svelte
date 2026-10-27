<script lang="ts">
	import { page } from '$app/state';

	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? 'Not found' : 'Something went wrong'}</title>
</svelte:head>

<div class="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center sm:py-28">
	<div class="mb-6 text-6xl" aria-hidden="true">{notFound ? '🧭' : '🫠'}</div>
	<p class="eyebrow mb-2">Error {page.status}</p>
	<h1 class="text-3xl font-black tracking-tight sm:text-4xl">
		{notFound ? 'This page wandered off.' : 'Well, that wasn’t supposed to happen.'}
	</h1>
	<p class="text-ink-soft mt-4 text-lg">
		{#if notFound}
			We couldn't find what you were looking for. Maybe the link is old, or a level moved.
		{:else}
			Something broke on our side, not yours. Give it another go in a moment.
		{/if}
	</p>
	{#if !notFound && page.error?.message && page.error.message !== 'Internal Error'}
		<p class="text-muted mt-3 text-sm">{page.error.message}</p>
	{/if}
	<div class="mt-8 flex flex-wrap justify-center gap-3">
		<a href="/learn" class="btn btn-primary">Back to the map</a>
		<a href="/" class="btn btn-quiet">Home</a>
	</div>
</div>
