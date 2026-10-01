import type { ApiFailure, ErrorCode } from '$lib/api/client';
import { m } from '$lib/paraglide/messages';

// Exhaustive on purpose: a code added to the contract without a translation fails the type check.
const MESSAGE_BY_CODE: Record<ErrorCode, () => string> = {
	INVALID_BODY: m.error_invalid_body,
	INVALID_ID: m.error_invalid_id,
	VALIDATION_FAILED: m.error_validation_failed,
	USER_NOT_FOUND: m.error_user_not_found,
	TASK_NOT_FOUND: m.error_task_not_found,
	EMAIL_TAKEN: m.error_email_taken,
	ROUTE_NOT_FOUND: m.error_route_not_found,
	METHOD_NOT_ALLOWED: m.error_method_not_allowed,
	PAYLOAD_TOO_LARGE: m.error_payload_too_large,
	DATABASE_UNAVAILABLE: m.error_database_unavailable,
	INTERNAL_ERROR: m.error_internal_error
};

function isKnownCode(code: string): code is ErrorCode {
	return Object.hasOwn(MESSAGE_BY_CODE, code);
}

// A known code is shown in the interface language. An unknown one (the contract lets the
// server add codes) keeps the server message; without any message the action's fallback is used.
export function failureMessage(failure: ApiFailure, fallback: () => string): string {
	if (failure.code && isKnownCode(failure.code)) return MESSAGE_BY_CODE[failure.code]();
	if (failure.kind === 'invalid_response') return m.error_invalid_response();
	if (failure.kind === 'timeout') return m.error_timeout();
	if (failure.kind === 'unknown') return m.error_unknown();
	return failure.error || fallback();
}
