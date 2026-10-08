import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '$lib/api/client';
import { isPersistentFailure } from '$lib/state/failure-persistence';

const failure = (fields: Partial<ApiFailure>): ApiFailure => ({
	success: false,
	error: 'Failure',
	...fields
});

describe('isPersistentFailure', () => {
	it.each([
		['a 500', failure({ status: 500 })],
		['a 500 with a reference', failure({ status: 500, requestId: 'req-1' })],
		['a 502', failure({ status: 502 })],
		['a 503', failure({ status: 503, code: 'DATABASE_UNAVAILABLE' })],
		['a 599', failure({ status: 599 })]
	])('keeps the toast of %s (happy path)', (_name, result) => {
		expect(isPersistentFailure(result)).toBe(true);
	});

	it.each([
		['a network error, which has no status', failure({ error: 'Failed to fetch' })],
		['a timeout', failure({ kind: 'timeout' })],
		['an unknown failure', failure({ kind: 'unknown' })]
	])('keeps the toast of %s: no answer at all (sad path)', (_name, result) => {
		expect(isPersistentFailure(result)).toBe(true);
	});

	it.each([
		['a malformed success answer', failure({ status: 200, kind: 'invalid_response' })],
		['a malformed empty answer', failure({ status: 204, kind: 'invalid_response' })],
		['a malformed answer of a 4xx', failure({ status: 404, kind: 'invalid_response' })]
	])('keeps the toast of %s: the server is at fault (exception)', (_name, result) => {
		expect(isPersistentFailure(result)).toBe(true);
	});

	it.each([
		['a 400', failure({ status: 400, code: 'VALIDATION_FAILED' })],
		['a 404', failure({ status: 404, code: 'TASK_NOT_FOUND' })],
		['a 409', failure({ status: 409, code: 'EMAIL_TAKEN' })],
		['a 413', failure({ status: 413 })],
		['a 422', failure({ status: 422 })],
		['a 499', failure({ status: 499 })]
	])('lets the toast of %s expire: the user can fix it (limit)', (_name, result) => {
		expect(isPersistentFailure(result)).toBe(false);
	});

	it('draws the line between 499 and 500 (boundary)', () => {
		expect(isPersistentFailure(failure({ status: 499 }))).toBe(false);
		expect(isPersistentFailure(failure({ status: 500 }))).toBe(true);
	});

	it('draws the line at the end of the 5xx range, as the outage policy does (boundary)', () => {
		expect(isPersistentFailure(failure({ status: 599 }))).toBe(true);
		expect(isPersistentFailure(failure({ status: 600 }))).toBe(false);
	});
});
