/**
 * The installable, offline side of the static build: registers the service worker
 * (src/service-worker), offers "Install app" where the browser allows it, tells iOS visitors how
 * to add it to the home screen, notices when a new version is waiting, and asks the browser to
 * keep this site's storage (the learner's progress) instead of clearing it under pressure.
 *
 * Everything is a no-op outside the static build and on the server.
 */
import { browser, dev } from '$app/env';
import { resolve } from '$app/paths';
import { STATIC } from './config.ts';

/** Chrome/Edge/Android's install prompt (not in the DOM typings yet). */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class Pwa {
	/** The browser's deferred install prompt, while one is on offer */
	installPrompt = $state<BeforeInstallPromptEvent | null>(null);
	/** Every page and file is cached: the app works without a connection */
	offlineReady = $state(false);
	/** A newer version has been downloaded and is waiting for a reload */
	updateReady = $state(false);
	/** iPhone/iPad Safari, not yet added to the home screen (no install prompt there) */
	iosHint = $state(false);
	/** Running as an installed app */
	standalone = $state(false);
	/** null until known; true when the browser promised not to clear this site's storage */
	persisted = $state<boolean | null>(null);

	#started = false;
	#askedPersist = false;
	#waiting: ServiceWorker | null = null;

	/** Call once from the root layout, in the browser. */
	start() {
		if (!browser || !STATIC || this.#started) return;
		this.#started = true;

		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			this.installPrompt = e as BeforeInstallPromptEvent;
		});
		window.addEventListener('appinstalled', () => {
			this.installPrompt = null;
			this.standalone = true;
		});

		const nav = navigator as Navigator & { standalone?: boolean };
		this.standalone = matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
		const ios =
			/iphone|ipad|ipod/i.test(nav.userAgent) ||
			(nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
		this.iosHint = ios && !this.standalone;

		void this.checkPersisted();
		if (!dev && 'serviceWorker' in navigator) void this.#register();
	}

	async #register() {
		try {
			const sw = navigator.serviceWorker;
			// resolve('/') is the app's folder with a trailing slash, e.g. /learncode/
			const reg = await sw.register(`${resolve('/')}service-worker.js`, { type: 'module' });
			if (reg.waiting && sw.controller) this.#offerUpdate(reg.waiting);
			reg.addEventListener('updatefound', () => {
				const next = reg.installing;
				next?.addEventListener('statechange', () => {
					// "installed" with a controller already in charge = an update, not the first visit
					if (next.state === 'installed' && sw.controller) this.#offerUpdate(next);
				});
			});
			// The page that asked for the update reloads once the new version is in charge.
			let reloading = false;
			sw.addEventListener('controllerchange', () => {
				if (!this.#waiting || reloading) return;
				reloading = true;
				location.reload();
			});
			await sw.ready;
			this.offlineReady = true;
		} catch {
			// No service worker (private mode, old browser): the app still works online.
		}
	}

	#offerUpdate(worker: ServiceWorker) {
		this.#waiting = worker;
		this.updateReady = true;
	}

	/** "Update available — reload": let the waiting version take over, then reload. */
	applyUpdate() {
		if (this.#waiting) this.#waiting.postMessage('skip-waiting');
		else location.reload();
	}

	async install() {
		const prompt = this.installPrompt;
		if (!prompt) return;
		this.installPrompt = null; // a prompt can only be used once
		try {
			await prompt.prompt();
			await prompt.userChoice;
		} catch {
			/* the browser said no; nothing to do */
		}
	}

	async checkPersisted() {
		try {
			if (navigator.storage?.persisted) this.persisted = await navigator.storage.persisted();
		} catch {
			/* not supported */
		}
	}

	/**
	 * Ask the browser to keep this site's storage (and so the learner's progress) even when space
	 * runs low. Asked at most once per visit; some browsers decide silently, some never agree.
	 */
	async requestPersistence() {
		if (!browser || !STATIC || this.#askedPersist) return;
		this.#askedPersist = true;
		try {
			if (!navigator.storage?.persist) return;
			this.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
		} catch {
			/* ignore: progress is still saved, just not marked persistent */
		}
	}
}

export const pwa = new Pwa();
