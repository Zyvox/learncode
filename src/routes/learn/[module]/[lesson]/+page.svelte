<script lang="ts">
	import { APP_NAME } from '#lib/config.ts';
	import { getLessonContext, getTheme, renderText } from '#lib/curriculum/index.ts';
	import LessonPlayer from '#lib/components/LessonPlayer.svelte';
	import { currentThemeId } from '#lib/stores/viewer.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ctx = $derived(getLessonContext(data.lessonId));
	const theme = $derived(getTheme(currentThemeId()));
</script>

<svelte:head>
	<title>{ctx ? `${renderText(ctx.lesson.title, theme)} · ` : ''}{APP_NAME}</title>
</svelte:head>

{#if ctx}
	{#key data.lessonId}
		<LessonPlayer
			lesson={ctx.lesson}
			module={ctx.module}
			index={ctx.index}
			next={ctx.next}
			{theme}
			user={data.user}
			progress={data.progress}
			doneIds={data.doneIds}
		/>
	{/key}
{/if}
