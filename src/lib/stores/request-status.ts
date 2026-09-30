import { writable } from 'svelte/store';
import type { ApiResult } from '$lib/api/client';
import { notifyError } from './notification';

interface RunOptions {
	fallbackMessage: string;
	// False for background actions (toggle, delete) that must not disable forms.
	tracksLoading?: boolean;
	// A superseded request leaves `loading` and `error` to the newer one.
	isCurrent?: () => boolean;
}

// One instance per domain: a failure in one feature must not show up in another.
export function createRequestStatus() {
	const loading = writable(false);
	const error = writable<string | null>(null);

	async function run<T>(
		action: () => Promise<ApiResult<T>>,
		{ fallbackMessage, tracksLoading = true, isCurrent = () => true }: RunOptions
	): Promise<ApiResult<T>> {
		if (tracksLoading) loading.set(true);
		error.set(null);
		let result: ApiResult<T>;
		try {
			result = await action();
		} catch (err) {
			result = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
		}
		if (isCurrent()) {
			if (!result.success) {
				const message = result.error || fallbackMessage;
				error.set(message);
				notifyError(message);
			}
			if (tracksLoading) loading.set(false);
		}
		return result;
	}

	return { loading, error, run };
}
