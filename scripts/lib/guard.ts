// The ports that no test, no script and no tool of this repository may reach: they belong to the
// user (docs/workflow.md, "Ports").
export const USER_PORTS: readonly number[] = [8080, 5173];
// The reference backend of `develop` is read-only: reading its contract is fine, writing to it is not.
export const REFERENCE_PORTS: readonly number[] = [8081];

const OWNERS = new Map<number, string>([
	[8080, "the user's backend"],
	[5173, "the user's site"],
	[8081, 'the read-only reference backend of develop']
]);

function refusal(name: string, port: number): Error {
	const owner = OWNERS.get(port) ?? 'a reserved service';
	return new Error(
		`${name} points to port ${port}, ${owner} (user services and read-only backends are never ` +
			'a test target; see docs/workflow.md, "Ports").'
	);
}

/** Parses `value` as an http(s) URL and refuses the `forbidden` ports whatever the host. */
export function checkUrl(
	name: string,
	value: string | undefined,
	forbidden: readonly number[]
): URL {
	const text = value?.trim();
	if (!text) throw new Error(`${name} is required: there is no default backend for this command.`);
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		throw new Error(`${name} is not an http(s) URL: ${text}`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`${name} is not an http(s) URL: ${text}`);
	}
	const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
	if (forbidden.includes(port)) throw refusal(name, port);
	return url;
}

/** A whole TCP port from 1 to 65535, other than the `forbidden` ones. */
export function checkPort(
	name: string,
	value: string | undefined,
	forbidden: readonly number[]
): number {
	const text = value?.trim() ?? '';
	if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 65_535) {
		throw new Error(`${name} must be a whole port from 1 to 65535, got "${value ?? ''}".`);
	}
	const port = Number(text);
	if (forbidden.includes(port)) throw refusal(name, port);
	return port;
}

/**
 * The backend the real E2E tests talk to: `PUBLIC_API_URL`, required, with no fallback. They write
 * data, so the user's ports and the read-only reference are refused.
 */
export function apiBaseUrl(env: Record<string, string | undefined>): string {
	const url = checkUrl('PUBLIC_API_URL', env.PUBLIC_API_URL, [...USER_PORTS, ...REFERENCE_PORTS]);
	return url.href.replace(/\/$/, '');
}
