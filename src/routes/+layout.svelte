<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { APP_NAME } from '#lib/config.ts';
	import Header from '#lib/components/Header.svelte';
	import { guest } from '#lib/stores/guest.svelte.ts';
	import { currentTheme, onAccentFor } from '#lib/stores/viewer.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	onMount(() => guest.load());

	const accent = $derived(currentTheme().accent);
	const onAccent = $derived(onAccentFor(accent));

	// Keep <html> in sync so portals/overlays and the pre-paint script agree.
	$effect(() => {
		const root = document.documentElement;
		root.style.setProperty('--accent', accent);
		root.style.setProperty('--on-accent', onAccent);
		try {
			localStorage.setItem('lc:accent', accent);
			localStorage.setItem('lc:on-accent', onAccent);
		} catch {
			/* ignore */
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{APP_NAME}</title>
	<meta name="description" content="Learn to code from zero with tiny, game-like levels." />
</svelte:head>

<div
	class="flex min-h-dvh flex-col"
	style:--accent={data.user ? accent : undefined}
	style:--on-accent={data.user ? onAccent : undefined}
>
	<a
		href="#main"
		class="sr-only z-50 rounded-xl bg-white px-4 py-2 font-bold shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
		>Skip to content</a
	>
	<Header user={data.user} />
	<main id="main" class="flex-1">
		{@render children()}
	</main>
</div>
