import { describe, expect, it } from 'vitest';
import {
	REFERENCE_PORTS,
	USER_PORTS,
	apiBaseUrl,
	checkPort,
	checkUrl
} from '../../../scripts/lib/guard.ts';

const WRITE_FORBIDDEN = [...USER_PORTS, ...REFERENCE_PORTS];

describe('checkUrl', () => {
	it('accepts a branch backend and a QA backend (happy path)', () => {
		expect(checkUrl('X', 'http://localhost:8083', USER_PORTS).port).toBe('8083');
		expect(checkUrl('X', 'http://127.0.0.1:8089/', WRITE_FORBIDDEN).port).toBe('8089');
	});

	it.each([
		'http://localhost:8080',
		'http://127.0.0.1:8080/api/v1',
		'http://[::1]:8080',
		'http://0.0.0.0:8080/',
		'https://example.test:8080',
		'http://localhost:08080',
		'http://user:pass@localhost:8080',
		'http://localhost:5173',
		'http://127.0.0.1:5173/stats'
	])('refuses the user services whatever the host: %s (error)', (value) => {
		expect(() => checkUrl('X', value, USER_PORTS)).toThrow(/user/);
	});

	it('refuses the read-only reference backend only when asked to (boundary values)', () => {
		expect(() => checkUrl('X', 'http://localhost:8081', WRITE_FORBIDDEN)).toThrow(/read-only/);
		expect(checkUrl('X', 'http://localhost:8081', USER_PORTS).port).toBe('8081');
	});

	it.each([undefined, '', '   '])('requires a value: %j (error)', (value) => {
		expect(() => checkUrl('PUBLIC_API_URL', value, USER_PORTS)).toThrow(
			/PUBLIC_API_URL is required/
		);
	});

	it.each(['localhost:8083', 'not a url', 'ftp://localhost:8083'])(
		'refuses what is not an http URL: %s (error)',
		(value) => {
			expect(() => checkUrl('X', value, USER_PORTS)).toThrow(/http/);
		}
	);

	it('treats a URL without a port as port 80 or 443, never as a user port (limit)', () => {
		expect(checkUrl('X', 'http://localhost', USER_PORTS).port).toBe('');
		expect(checkUrl('X', 'https://backend.example.test', USER_PORTS).port).toBe('');
	});

	it('names the variable and the port in the message (happy path)', () => {
		expect(() => checkUrl('OPENAPI_URL', 'http://localhost:8080/openapi.yaml', USER_PORTS)).toThrow(
			/OPENAPI_URL.*8080/
		);
	});
});

describe('checkPort', () => {
	it.each(['4103', '1', '65535'])('accepts %s (boundary values)', (value) => {
		expect(checkPort('E2E_PORT', value, USER_PORTS)).toBe(Number(value));
	});

	it.each([undefined, '', '0', '65536', '-1', '41.5', 'abc', '4103abc', ' '])(
		'refuses %j (error)',
		(value) => {
			expect(() => checkPort('E2E_PORT', value, USER_PORTS)).toThrow(/E2E_PORT/);
		}
	);

	it.each(['8080', '5173'])('refuses the user port %s (error)', (value) => {
		expect(() => checkPort('E2E_PORT', value, USER_PORTS)).toThrow(/user/);
	});
});

describe('apiBaseUrl', () => {
	it('returns the URL without a trailing slash, for the real E2E tests (happy path)', () => {
		expect(apiBaseUrl({ PUBLIC_API_URL: 'http://localhost:8089/' })).toBe('http://localhost:8089');
		expect(apiBaseUrl({ PUBLIC_API_URL: 'http://localhost:8083' })).toBe('http://localhost:8083');
	});

	it('has no default: an unset variable, :8080, :5173 and :8081 all throw (error)', () => {
		expect(() => apiBaseUrl({})).toThrow(/PUBLIC_API_URL is required/);
		for (const port of [8080, 5173, 8081]) {
			expect(() => apiBaseUrl({ PUBLIC_API_URL: `http://localhost:${port}` })).toThrow();
		}
	});
});
