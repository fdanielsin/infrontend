import type { ApiFailure } from '$lib/api/client';

// Waits between two readiness checks while the service is down: 5, 10, 20, 40, then 60 s.
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60_000;
// The jitter spreads the retries of many open tabs: a factor around the delay, 0.8 to 1.2.
const JITTER_MIN = 0.8;
const JITTER_MAX = 1.2;

export type Jitter = () => number;

export function randomJitter(): number {
	return JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);
}

// A factor outside 0.8 to 1.2 (or not a number) is brought back into it: the injected source
// cannot make the delay leave its range.
function boundedJitter(jitter: Jitter): number {
	const factor = jitter();
	if (Number.isNaN(factor)) return 1;
	return Math.min(JITTER_MAX, Math.max(JITTER_MIN, factor));
}

// `attempt` counts the failed checks since the service went down (1 for the first). The 60 s
// ceiling is strict: it applies after the jitter, so the last step lasts 48 to 60 s.
export function retryDelayMs(attempt: number, jitter: Jitter = randomJitter): number {
	const step = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (Math.max(1, attempt) - 1));
	return Math.min(MAX_DELAY_MS, Math.round(step * boundedJitter(jitter)));
}

// An outage is no answer at all (network error, timeout) or a 5xx. A 4xx or a malformed answer
// says nothing about the service being down: the screens load as before.
export function isOutage(failure: ApiFailure): boolean {
	return failure.status === undefined || (failure.status >= 500 && failure.status <= 599);
}
