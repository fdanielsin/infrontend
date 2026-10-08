import type { ApiFailure, ApiResult } from '$lib/api/client';
import { failureMessage } from '$lib/i18n/errors';
import { m } from '$lib/paraglide/messages';
import { isPersistentFailure } from './failure-persistence';
import type { NotificationState } from './notification.svelte';

interface RunOptions {
	fallbackMessage: () => string;
	// False for background actions (toggle, delete) that must not disable forms.
	tracksLoading?: boolean;
	// A superseded request leaves `loading` and `error` to the newer one.
	isCurrent?: () => boolean;
	// A handled failure is an expected outcome: the caller deals with it, nothing is reported.
	isHandled?: (failure: ApiFailure) => boolean;
}

// One instance per domain: a failure in one feature must not show up in another.
export class RequestStatus {
	loading: boolean;
	error: string | null = $state(null);

	readonly #notifications: NotificationState;

	constructor(notifications: NotificationState, initialLoading = false) {
		this.#notifications = notifications;
		this.loading = $state(initialLoading);
	}

	async run<T>(
		action: () => Promise<ApiResult<T>>,
		{
			fallbackMessage,
			tracksLoading = true,
			isCurrent = () => true,
			isHandled = () => false
		}: RunOptions
	): Promise<ApiResult<T>> {
		if (tracksLoading) this.loading = true;
		this.error = null;
		let result: ApiResult<T>;
		try {
			result = await action();
		} catch (err) {
			result =
				err instanceof Error
					? { success: false, error: err.message }
					: { success: false, error: m.error_unknown(), kind: 'unknown' };
		}
		if (isCurrent()) {
			if (!result.success && !isHandled(result)) {
				const message = failureMessage(result, fallbackMessage);
				this.error = message;
				this.#notifications.notifyError(message, {
					reference: result.requestId,
					persistent: isPersistentFailure(result)
				});
			}
			if (tracksLoading) this.loading = false;
		}
		return result;
	}
}
