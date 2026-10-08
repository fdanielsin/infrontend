import type { ApiFailure } from '$lib/api/client';
import { isOutage } from './availability-policy';

// The toast of an error the user cannot fix stays until it is closed, so that its reference can
// be copied (WCAG 2.2.1): no answer at all, a 5xx, or an answer the contract does not allow.
// A refusal the user can fix (4xx) leaves by itself.
export function isPersistentFailure(failure: ApiFailure): boolean {
	return isOutage(failure) || failure.kind === 'invalid_response';
}
