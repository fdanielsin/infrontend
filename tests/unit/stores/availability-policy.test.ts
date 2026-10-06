import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '$lib/api/client';
import { isOutage, randomJitter, retryDelayMs } from '$lib/state/availability-policy';

const failure = (extra: Partial<ApiFailure>): ApiFailure => ({
	success: false,
	error: 'x',
	...extra
});

describe('retry delay', () => {
	it('doubles from 5 s up to 60 s without jitter (happy path)', () => {
		// GIVEN / WHEN: The delay after each failed check, with a jitter of 1.
		const delays = [1, 2, 3, 4, 5, 6, 7].map((attempt) => retryDelayMs(attempt, () => 1));

		// THEN: 5, 10, 20, 40, then the 60 s ceiling.
		expect(delays).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
	});

	it('spreads the first step over 4 to 6 s (boundary)', () => {
		expect(retryDelayMs(1, () => 0.8)).toBe(4_000);
		expect(retryDelayMs(1, () => 1.2)).toBe(6_000);
	});

	it('never exceeds 60 s: the ceiling applies after the jitter (boundary)', () => {
		// GIVEN / WHEN: The last steps with the highest and the lowest jitter.
		// THEN: 60 s at most, and 48 s at least (60 s x 0.8).
		expect(retryDelayMs(5, () => 1.2)).toBe(60_000);
		expect(retryDelayMs(40, () => 1.2)).toBe(60_000);
		expect(retryDelayMs(5, () => 0.8)).toBe(48_000);
		expect(retryDelayMs(4, () => 1.2)).toBe(48_000);
	});

	it('brings a jitter outside 0.8 to 1.2 back into the interval (limit)', () => {
		expect(retryDelayMs(1, () => 0)).toBe(4_000);
		expect(retryDelayMs(1, () => -5)).toBe(4_000);
		expect(retryDelayMs(1, () => 9)).toBe(6_000);
		expect(retryDelayMs(1, () => Infinity)).toBe(6_000);
		expect(retryDelayMs(1, () => -Infinity)).toBe(4_000);
	});

	it('uses a factor of 1 when the jitter is not a number (exception)', () => {
		expect(retryDelayMs(2, () => NaN)).toBe(10_000);
	});

	it('treats an attempt below 1 as the first (boundary)', () => {
		expect(retryDelayMs(0, () => 1)).toBe(5_000);
		expect(retryDelayMs(-3, () => 1)).toBe(5_000);
	});

	it('rounds to whole milliseconds (limit)', () => {
		expect(Number.isInteger(retryDelayMs(1, () => 0.8123456))).toBe(true);
	});

	it('draws its default jitter in 0.8 to 1.2 from Math.random (limit)', () => {
		const draw = (random: number) => {
			const original = Math.random;
			Math.random = () => random;
			try {
				return randomJitter();
			} finally {
				Math.random = original;
			}
		};
		expect(draw(0)).toBeCloseTo(0.8);
		expect(draw(0.5)).toBeCloseTo(1);
		expect(draw(0.999999)).toBeCloseTo(1.2);
		const delay = retryDelayMs(1);
		expect(delay).toBeGreaterThanOrEqual(4_000);
		expect(delay).toBeLessThanOrEqual(6_000);
	});
});

describe('outage classification', () => {
	it.each([500, 502, 503, 599])('is an outage for %i (happy path)', (status) => {
		expect(isOutage(failure({ status }))).toBe(true);
	});

	it.each([400, 404, 499, 600])('is not an outage for %i (boundary)', (status) => {
		expect(isOutage(failure({ status }))).toBe(false);
	});

	it('is an outage without any answer: network error or timeout (exception)', () => {
		expect(isOutage(failure({}))).toBe(true);
		expect(isOutage(failure({ kind: 'timeout' }))).toBe(true);
	});

	it('is not an outage for a malformed answer (exception)', () => {
		expect(isOutage(failure({ kind: 'invalid_response', status: 200 }))).toBe(false);
	});
});
