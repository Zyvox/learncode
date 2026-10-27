<script lang="ts">
	import { APP_NAME } from '#lib/config.ts';
	import { THEMES, getModules, getTheme } from '#lib/curriculum/index.ts';
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import { guest } from '#lib/stores/guest.svelte.ts';
	import { currentThemeId } from '#lib/stores/viewer.svelte.ts';
	import { lessonHref } from '#lib/stores/map.ts';
	import type { ThemeId } from '#lib/curriculum/types.ts';

	const firstLesson = (() => {
		const mod = [...getModules()]
			.sort((a, b) => a.order - b.order)
			.find((m) => !m.comingSoon && m.lessons.length);
		return mod?.lessons[0];
	})();
	const startHref = firstLesson ? lessonHref(firstLesson) : '/learn';

	const themeId = $derived(currentThemeId());
	const theme = $derived(getTheme(themeId));

	function pick(id: ThemeId) {
		guest.setTheme(id);
	}
</script>

<svelte:head>
	<title>{APP_NAME} · Learn to code, one small level at a time</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 sm:px-6">
	<!-- Hero -->
	<section
		class="grid items-center gap-10 pt-10 pb-14 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:gap-14"
	>
		<div>
			<p class="chip bg-accent-soft text-accent-ink mb-5">For total beginners · free</p>
			<h1
				class="text-4xl leading-[1.05] font-black tracking-tight text-balance sm:text-5xl lg:text-6xl"
			>
				Learn to code by telling a little character what to do.
			</h1>
			<p class="text-ink-soft mt-5 max-w-xl text-lg text-pretty sm:text-xl">
				You write a few lines of real JavaScript, press Run, and watch it happen, one step at a
				time. Each level takes a minute or two, and you don't need to know anything to start.
			</p>
			<div class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
				<a
					href={startHref}
					class="btn btn-primary px-6 py-3.5 text-lg"
					data-testid="start-first-level"
				>
					Try the first level, no account needed
					<span aria-hidden="true">→</span>
				</a>
				<a href="/learn" class="btn btn-ghost">See the whole map</a>
			</div>
		</div>

		<!-- A tiny, decorative preview of what playing looks like -->
		<div class="card relative p-5 sm:p-6" aria-hidden="true">
			<div class="text-muted mb-4 flex items-center gap-2 text-sm font-bold">
				<span class="h-2.5 w-2.5 rounded-full bg-[#f08a6c]"></span>
				<span class="h-2.5 w-2.5 rounded-full bg-[#f4c25b]"></span>
				<span class="h-2.5 w-2.5 rounded-full bg-[#7ccf8a]"></span>
				<span class="ml-2">level 1</span>
			</div>
			<div class="preview-strip mb-5">
				{#each [0, 1, 2, 3, 4] as i (i)}
					<div class="tile">
						{#if i === 2}<span class="item">{theme.item.emoji}</span>{/if}
						{#if i === 4}<span>{theme.goal.emoji}</span>{/if}
					</div>
				{/each}
				<span class="walker">{theme.hero.emoji}</span>
			</div>
			<pre
				class="rounded-2xl bg-[#2a2420] px-5 py-4 font-mono text-[0.95rem] leading-relaxed text-[#f6efe6]"><span
					class="text-[#7fb6e8]">move</span
				>();
<span class="text-[#7fb6e8]">move</span>();
<span class="text-[#7fb6e8]">pickUp</span>();  <span class="text-[#9a9088]"
					>// grab the {theme.item.singular}</span
				>
<span class="text-[#7fb6e8]">move</span>();
<span class="text-[#7fb6e8]">move</span>();</pre>
		</div>
	</section>

	<!-- Vibe picker -->
	<section class="pb-16" aria-labelledby="vibe-heading">
		<div class="mb-6 max-w-2xl">
			<h2 id="vibe-heading" class="text-2xl font-black tracking-tight sm:text-3xl">Pick a vibe</h2>
			<p class="text-ink-soft mt-2">
				It changes your character, what you collect and how the story is told. The puzzles are the
				same either way, so pick whatever makes you smile. You can switch any time.
			</p>
		</div>
		<ThemePicker themes={THEMES} value={themeId} onpick={pick} legend="Pick a vibe" />
		<div class="mt-6 flex flex-wrap items-center gap-3">
			<a href={startHref} class="btn btn-primary">
				Start as {theme.emoji}
				{theme.name}
				<span aria-hidden="true">→</span>
			</a>
			<span class="text-muted text-sm">No account needed. Your progress stays in this browser.</span
			>
		</div>
	</section>

	<!-- How it feels -->
	<section class="pb-20" aria-labelledby="feel-heading">
		<h2 id="feel-heading" class="sr-only">How it feels</h2>
		<div class="grid gap-4 md:grid-cols-3">
			<div class="card p-6">
				<div class="mb-3 text-3xl" aria-hidden="true">👀</div>
				<h3 class="text-lg font-extrabold">You see your code move</h3>
				<p class="text-ink-soft mt-1.5">
					Every line does something you can watch. {theme.hero.name} walks, turns and grabs things exactly
					as you wrote it, so you never have to guess what happened.
				</p>
			</div>
			<div class="card p-6">
				<div class="mb-3 text-3xl" aria-hidden="true">🤝</div>
				<h3 class="text-lg font-extrabold">Mistakes are part of it</h3>
				<p class="text-ink-soft mt-1.5">
					Typo? You'll get a plain explanation, like “I don't know anything called <code
						class="font-mono">mov</code
					>. Did you mean <code class="font-mono">move()</code>?” Hints are there if you want them.
				</p>
			</div>
			<div class="card p-6">
				<div class="mb-3 text-3xl" aria-hidden="true">⏱️</div>
				<h3 class="text-lg font-extrabold">A minute or two per level</h3>
				<p class="text-ink-soft mt-1.5">
					Small steps that add up. Do one on the bus, or ten in a row. Each one teaches one idea
					when you actually need it.
				</p>
			</div>
		</div>
	</section>
</div>

<footer class="border-line border-t">
	<div
		class="text-ink-soft mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6"
	>
		<p><strong class="text-ink">{APP_NAME}</strong> · learn to code, one small level at a time.</p>
		<p class="flex gap-4">
			<a href="/login" class="font-bold underline-offset-4 hover:underline">Log in</a>
			<a href="/signup" class="font-bold underline-offset-4 hover:underline"
				>Create a free account</a
			>
		</p>
	</div>
</footer>

<style>
	.preview-strip {
		position: relative;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		border-radius: 1rem;
		overflow: hidden;
		box-shadow: inset 0 0 0 2px #e6d9c6;
	}
	.tile {
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		background: #fbf5ec;
		box-shadow: inset 0 0 0 1px #efe4d4;
		font-size: clamp(1.4rem, 5vw, 2rem);
	}
	.tile:nth-child(even) {
		background: #f7efe3;
	}
	.tile:last-of-type {
		background: color-mix(in oklab, var(--accent) 16%, #fbf5ec);
	}
	.item {
		animation: vanish 6s infinite;
	}
	.walker {
		position: absolute;
		top: 0;
		left: 0;
		width: 20%;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		font-size: clamp(1.6rem, 5.5vw, 2.3rem);
		filter: drop-shadow(0 3px 2px rgb(0 0 0 / 0.18));
		animation: walk 6s infinite;
	}
	@keyframes walk {
		0%,
		8% {
			left: 0%;
		}
		18%,
		24% {
			left: 20%;
		}
		34%,
		48% {
			left: 40%;
		}
		58%,
		64% {
			left: 60%;
		}
		74%,
		100% {
			left: 80%;
		}
	}
	@keyframes vanish {
		0%,
		40% {
			opacity: 1;
			transform: scale(1);
		}
		46% {
			opacity: 1;
			transform: scale(1.5) translateY(-20%);
		}
		52%,
		96% {
			opacity: 0;
			transform: scale(0.3);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.walker,
		.item {
			animation: none;
		}
	}
</style>
