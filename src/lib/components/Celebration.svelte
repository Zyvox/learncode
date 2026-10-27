<!--
  Lightweight confetti on a fixed canvas. Call `fire()` (or `fire(true)` for a boss level).
  Does nothing when the learner prefers reduced motion.
-->
<script lang="ts">
	let canvas: HTMLCanvasElement;
	let raf = 0;

	interface Bit {
		x: number;
		y: number;
		vx: number;
		vy: number;
		rot: number;
		vr: number;
		w: number;
		h: number;
		color: string;
		life: number;
	}

	export function fire(big = false) {
		if (!canvas) return;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const W = window.innerWidth;
		const H = window.innerHeight;
		canvas.width = W * dpr;
		canvas.height = H * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const accent =
			getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e8743b';
		const colors = [accent, '#f4c25b', '#7ccf8a', '#6fb7f0', '#f08a6c', '#c49af0'];
		const n = big ? 220 : 120;
		const bits: Bit[] = [];
		for (let i = 0; i < n; i++) {
			const fromLeft = i % 2 === 0;
			bits.push({
				x: fromLeft ? -10 : W + 10,
				y: H * (0.55 + Math.random() * 0.25),
				vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7),
				vy: -(9 + Math.random() * 9),
				rot: Math.random() * Math.PI,
				vr: (Math.random() - 0.5) * 0.35,
				w: 6 + Math.random() * 6,
				h: 8 + Math.random() * 8,
				color: colors[i % colors.length],
				life: 0
			});
		}
		cancelAnimationFrame(raf);
		const start = performance.now();
		const tick = (now: number) => {
			const elapsed = now - start;
			ctx.clearRect(0, 0, W, H);
			let alive = 0;
			for (const b of bits) {
				b.vy += 0.32;
				b.vx *= 0.985;
				b.x += b.vx;
				b.y += b.vy;
				b.rot += b.vr;
				if (b.y < H + 20) alive++;
				ctx.save();
				ctx.globalAlpha = Math.max(0, 1 - elapsed / 2600);
				ctx.translate(b.x, b.y);
				ctx.rotate(b.rot);
				ctx.fillStyle = b.color;
				ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot * 2)));
				ctx.restore();
			}
			if (alive && elapsed < 2600) raf = requestAnimationFrame(tick);
			else ctx.clearRect(0, 0, W, H);
		};
		raf = requestAnimationFrame(tick);
	}

	$effect(() => () => cancelAnimationFrame(raf));
</script>

<canvas
	bind:this={canvas}
	class="pointer-events-none fixed inset-0 z-50 h-full w-full"
	aria-hidden="true"
></canvas>
