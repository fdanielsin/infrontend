import { vi } from 'vitest';

// A JSON answer of the API. `body` may already be text (a malformed body, an HTML error page).
export function jsonResponse(
	body: unknown,
	status = 200,
	headers: Record<string, string> = {}
): Response {
	return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});
}

// Replaces fetch: each call gets a copy of `answer`, or what `answer()` returns (or rejects with).
export function stubFetch(answer: Response | (() => Response | Promise<Response>)) {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(() =>
			Promise.resolve(typeof answer === 'function' ? answer() : answer.clone())
		);
}

// The request the first (or the n-th) call of a stubbed fetch received.
export function requestOf(spy: ReturnType<typeof stubFetch>, call = 0): Request {
	return spy.mock.calls[call]![0] as Request;
}

// A backend that never answers: the request only ends when its signal aborts it.
export function neverAnswer() {
	vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
		const request = input as Request;
		return new Promise<Response>((_resolve, reject) => {
			// The platform rejects with the signal's reason (a TimeoutError DOMException).
			request.signal.addEventListener('abort', () => reject(request.signal.reason as Error));
		});
	});
}

// AbortSignal.timeout runs on a native timer that fake timers do not drive: this double has the
// same behaviour (abort with a TimeoutError after `ms`) on the faked setTimeout.
export function timeoutOnFakeTimers() {
	return vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(new DOMException('signal timed out', 'TimeoutError')), ms);
		return controller.signal;
	});
}

// Lets the promise of a result settle without blocking the test when it does not.
export function settled<T>(promise: Promise<T>) {
	let value: T | undefined;
	void promise.then((result) => (value = result));
	return () => value;
}

// What a call of a stubbed fetch sends, whether it got a Request or a URL and an init.
export function sentOf(spy: ReturnType<typeof stubFetch>, call = 0) {
	const [input, init] = spy.mock.calls[call]! as [Request | string, RequestInit | undefined];
	if (input instanceof Request) {
		return {
			url: input.url,
			method: input.method,
			headers: input.headers,
			keepalive: input.keepalive
		};
	}
	return {
		url: input,
		method: init?.method ?? 'GET',
		headers: new Headers(init?.headers),
		keepalive: init?.keepalive ?? false
	};
}
