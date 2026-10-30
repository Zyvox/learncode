<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { asset, resolve } from '$app/paths';
	import { APP_NAME, STATIC } from '#lib/config.ts';
	import { pwa } from '#lib/pwa.svelte.ts';
	import Header from '#lib/components/Header.svelte';
	import { guest } from '#lib/stores/guest.svelte.ts';
	import { currentTheme, onAccentFor } from '#lib/stores/viewer.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	onMount(() => {
		guest.load();
		pwa.start();
	});

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
	{#if STATIC}
		<!-- Installable app (static build): manifest, home-screen icon and name -->
		<link rel="manifest" href={resolve('/manifest.webmanifest')} />
		<link rel="apple-touch-icon" href={asset('icons/apple-touch-icon.png')} />
		<meta name="mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-title" content={APP_NAME} />
		<meta name="apple-mobile-web-app-status-bar-style" content="default" />
	{/if}
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
