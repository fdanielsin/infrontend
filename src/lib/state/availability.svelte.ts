import { api } from '$lib/api/client';
import { m } from '$lib/paraglide/messages';
import { isOutage, retryDelayMs, type Jitter } from './availability-policy';
import type { NotificationState } from './notification.svelte';

// `available` means no outage was seen: an answer that is neither ready nor an outage (a 4xx, a
// malformed body) leaves the screens loading as they always did.
export type Availability = 'unknown' | 'available' | 'unavailable';

interface Options {
	jitter?: Jitter;
}

export class AvailabilityState {
	status = $state<Availability>('unknown');
	checking = $state(false);
	// Counts the failed checks that follow a click on "Retry": the banner announces its alert again.
	retryFailures = $state(0);
	// Server reference (`X-Request-Id`) of the last failed check, for a support request.
	reference = $state<string | null>(null);

	readonly #notifications: NotificationState;
	readonly #jitter: Jitter | undefined;
	// Never rendered: a plain Set is enough, reactivity would only add cost.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #recoveredListeners = new Set<() => void>();
	#inFlight: Promise<Availability> | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#failures = 0;
	#watchingVisibility = false;
	#destroyed = false;

	constructor(notifications: NotificationState, { jitter }: Options = {}) {
		this.#notifications = notifications;
		this.#jitter = jitter;
	}

	// The first answer, shared by every caller: later calls do not ask again.
	ensure(): Promise<Availability> {
		return this.status === 'unknown' ? this.check() : Promise.resolve(this.status);
	}

	// The "Retry" button: the backoff starts again at its first step, and a new failure is announced.
	async retry(): Promise<Availability> {
		this.#failures = 0;
		const status = await this.check();
		if (status === 'unavailable') this.retryFailures += 1;
		return status;
	}

	// An immediate check. A check already running is joined, never doubled.
	check(): Promise<Availability> {
		this.#inFlight ??= this.#run().finally(() => {
			this.#inFlight = null;
		});
		return this.#inFlight;
	}

	// Called once when the service comes back after an outage, to reload what failed to load.
	onRecovered(listener: () => void): () => void {
		this.#recoveredListeners.add(listener);
		return () => void this.#recoveredListeners.delete(listener);
	}

	// Runs `load` once the service is known to be up, and again each time it comes back after an
	// outage; while it is down nothing is requested, so no list fails in a cascade. The returned
	// function stops it (the screen is gone).
	runWhenAvailable(load: () => void | Promise<void>): () => void {
		let active = true;
		const run = () => {
			if (active) void load();
		};
		const unsubscribe = this.onRecovered(run);
		void this.ensure().then((status) => {
			if (status === 'available') run();
		});
		return () => {
			active = false;
			unsubscribe();
		};
	}

	destroy() {
		this.#destroyed = true;
		this.#stopRetrying();
		this.#recoveredListeners.clear();
	}

	async #run(): Promise<Availability> {
		this.#clearTimer();
		this.checking = true;
		let result: Awaited<ReturnType<typeof api.ready>>;
		try {
			result = await api.ready();
		} finally {
			this.checking = false;
		}
		// A check that answers after destroy() changes nothing: no state, no timer, no listener.
		if (this.#destroyed) return this.status;
		this.reference = (!result.success && result.requestId) || null;
		if (!result.success && isOutage(result)) {
			this.#failures += 1;
			this.status = 'unavailable';
			this.#scheduleRetry();
			return this.status;
		}
		const wasDown = this.status === 'unavailable';
		this.status = 'available';
		this.#stopRetrying();
		if (wasDown) this.#announceRecovery();
		return this.status;
	}

	#announceRecovery() {
		this.#notifications.add(m.availability_recovered(), 'success');
		for (const listener of this.#recoveredListeners) listener();
	}

	#scheduleRetry() {
		this.#clearTimer();
		if (typeof document !== 'undefined') {
			if (!this.#watchingVisibility) {
				document.addEventListener('visibilitychange', this.#onVisibilityChange);
				this.#watchingVisibility = true;
			}
			// A hidden tab does not poll: it checks again as soon as it is shown.
			if (document.hidden) return;
		}
		this.#timer = setTimeout(() => void this.check(), retryDelayMs(this.#failures, this.#jitter));
	}

	#onVisibilityChange = () => {
		if (document.hidden) this.#clearTimer();
		else void this.check();
	};

	#stopRetrying() {
		this.#failures = 0;
		this.#clearTimer();
		if (this.#watchingVisibility) {
			document.removeEventListener('visibilitychange', this.#onVisibilityChange);
			this.#watchingVisibility = false;
		}
	}

	#clearTimer() {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
	}
}
