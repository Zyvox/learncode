<!--
  What happened after Run: running, a friendly error, failed checks, or a pass with XP,
  level-ups, new badges and the way forward.
-->
<script lang="ts" module>
	import type { Badge } from '#lib/game/badges.ts';

	export interface Completion {
		firstTime: boolean;
		xpGained: number;
		totalXp: number;
		levelUp: { level: number; title: string } | null;
		newBadges: Badge[];
		streak: number | null;
		/** Still talking to the server */
		saving: boolean;
		/** Couldn't save (offline etc.) */
		saveFailed: boolean;
	}

	export type Outcome =
		| { kind: 'running' }
		| { kind: 'error'; message: string; line?: number; raw: string }
		| { kind: 'failed'; failures: string[] }
		| { kind: 'wrong'; explanation: string }
		| { kind: 'passed'; completion: Completion; explanation?: string };
</script>

<script lang="ts">
	import RichText from './RichText.svelte';

	let {
		outcome,
		boss = false,
		nextHref,
		nextLabel,
		heroEmoji,
		onretry,
		onretrysave
	}: {
		outcome: Outcome;
		boss?: boolean;
		nextHref: string;
		nextLabel: string;
		heroEmoji: string;
		onretry?: () => void;
		onretrysave?: () => void;
	} = $props();

	let showDetails = $state(false);

	const PASS_LINES = ['You did it.', 'That’s it, nicely done.', 'Yes. Exactly that.', 'Smooth.'];
	const passLine = PASS_LINES[Math.floor(Math.random() * PASS_LINES.length)];
</script>

<div aria-live="polite" class="contents">
	{#if outcome.kind === 'running'}
		<div
			class="bg-sand text-ink-soft flex items-center gap-3 rounded-2xl px-4 py-3"
			data-testid="result-running"
		>
			<span class="spinner" aria-hidden="true"></span>
			Running your code…
		</div>
	{:else if outcome.kind === 'error'}
		<div
			class="animate-fade-up border-oops/25 bg-oops-soft rounded-2xl border px-4 py-4 sm:px-5"
			data-testid="result-error"
		>
			<div class="flex gap-3">
				<span class="text-2xl leading-none" aria-hidden="true">🤔</span>
				<div class="min-w-0 flex-1">
					<p class="font-extrabold">
						Something got in the way{outcome.line ? ` on line ${outcome.line}` : ''}.
					</p>
					<RichText text={outcome.message} class="text-ink-soft mt-1" />
					<p class="text-ink-soft mt-2 text-sm">
						Change something and press Run again. That's how everyone codes.
					</p>
					{#if outcome.raw}
						<button
							type="button"
							class="text-oops mt-2 text-sm font-bold underline underline-offset-4"
							aria-expanded={showDetails}
							onclick={() => (showDetails = !showDetails)}
						>
							{showDetails ? 'Hide details' : 'Show details'}
						</button>
						{#if showDetails}
							<pre
								class="text-ink-soft mt-2 overflow-x-auto rounded-xl bg-white/70 px-3 py-2 font-mono text-xs whitespace-pre-wrap">{outcome.raw}</pre>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	{:else if outcome.kind === 'failed'}
		<div
			class="animate-fade-up bg-warn-soft rounded-2xl border border-[#f0d9a0] px-4 py-4 sm:px-5"
			data-testid="result-failed"
		>
			<div class="flex gap-3">
				<span class="text-2xl leading-none" aria-hidden="true">🧐</span>
				<div class="min-w-0 flex-1">
					<p class="font-extrabold">Close. Not quite there yet.</p>
					<ul class="text-ink-soft mt-1.5 space-y-1.5">
						{#each outcome.failures as f, i (i)}
							<li class="flex gap-2">
								<span aria-hidden="true">→</span><RichText text={f} class="min-w-0 flex-1" />
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	{:else if outcome.kind === 'wrong'}
		<div
			class="animate-fade-up bg-warn-soft rounded-2xl border border-[#f0d9a0] px-4 py-4 sm:px-5"
			data-testid="result-wrong"
		>
			<p class="font-extrabold">Not quite — but good guess.</p>
			<RichText text={outcome.explanation} class="text-ink-soft mt-1.5" />
			{#if onretry}
				<button type="button" class="btn btn-quiet mt-3" onclick={onretry}>Pick again</button>
			{/if}
		</div>
	{:else if outcome.kind === 'passed'}
		{@const c = outcome.completion}
		<div
			class="animate-pop-in border-accent/40 bg-accent-soft overflow-hidden rounded-2xl border-2 px-4 py-5 sm:px-6"
			data-testid="result-passed"
		>
			<div class="flex items-start gap-3">
				<span class="text-3xl leading-none" aria-hidden="true">{boss ? '👑' : heroEmoji}</span>
				<div class="min-w-0 flex-1">
					<p class="text-xl font-black tracking-tight">{boss ? 'Boss level cleared.' : passLine}</p>
					{#if outcome.explanation}
						<RichText text={outcome.explanation} class="text-ink-soft mt-1.5" />
					{/if}
					<div class="mt-2 flex flex-wrap items-center gap-2">
						{#if c.saving}
							<span class="chip text-muted bg-white">saving…</span>
						{:else if c.firstTime && c.xpGained > 0}
							<span class="chip bg-accent text-on-accent px-3 py-1 text-sm" data-testid="xp-gained"
								>+{c.xpGained} XP</span
							>
						{:else if !c.firstTime}
							<span class="text-ink-soft text-sm"
								>Still got it. Replays don't add XP, but they do keep you sharp.</span
							>
						{/if}
						{#if c.levelUp}
							<span class="chip text-ink bg-white px-3 py-1 text-sm"
								>⬆️ Level {c.levelUp.level}: {c.levelUp.title}</span
							>
						{/if}
						{#if c.streak && c.streak > 1}
							<span class="chip text-ink bg-white px-3 py-1 text-sm">🔥 {c.streak}-day streak</span>
						{/if}
					</div>
					{#if c.saveFailed}
						<p class="text-oops mt-2 text-sm">
							We couldn't save this one — your connection may have dropped.
							{#if onretrysave}<button
									type="button"
									class="font-bold underline"
									onclick={onretrysave}>Try saving again</button
								>{/if}
						</p>
					{/if}
					{#if c.newBadges.length}
						<div class="mt-3 space-y-2">
							{#each c.newBadges as b (b.id)}
								<div
									class="animate-pop-in flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-[var(--shadow-soft)]"
								>
									<span class="text-2xl" aria-hidden="true">{b.emoji}</span>
									<div>
										<div class="text-sm font-extrabold">New badge: {b.name}</div>
										<div class="text-ink-soft text-xs">{b.description}</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
			<div class="mt-4 flex flex-wrap gap-2">
				<a
					href={nextHref}
					class="btn btn-primary"
					data-testid="next-level"
					data-sveltekit-preload-data="tap"
				>
					{nextLabel} <span aria-hidden="true">→</span>
				</a>
				<a href="/learn" class="btn btn-quiet">Map</a>
			</div>
		</div>
	{/if}
</div>

<style>
	.spinner {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 999px;
		border: 2.5px solid color-mix(in oklab, var(--accent) 30%, transparent);
		border-top-color: var(--accent);
		animation: spin 700ms linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
