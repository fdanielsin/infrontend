import { describe, expect, it } from 'vitest';
import { assertImage, isForbiddenUrl } from '../../../scripts/lib/capture-guards.ts';

describe('isForbiddenUrl', () => {
	it.each([
		'http://localhost:8080/api/v1/users',
		'http://localhost:8081/openapi.yaml',
		'http://localhost:5173/',
		'http://localhost:5174',
		'http://127.0.0.1:8080/ready',
		'http://0.0.0.0:5173/',
		'http://[::1]:8081/x',
		'http://localhost.:8080/x',
		'https://localhost:8080/x'
	])('stops %s (error)', (url) => {
		expect(isForbiddenUrl(url)).toBe(true);
	});

	it.each([
		'http://localhost:59999/api/v1/users',
		'http://localhost:4114/',
		'http://localhost:80801/',
		'http://localhost:8082/ready',
		'http://example.com:8080/',
		'http://localhost:8080.evil.test/'
	])('lets %s through (limit)', (url) => {
		expect(isForbiddenUrl(url)).toBe(false);
	});
});

describe('assertImage', () => {
	const png = (size: number) =>
		Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			Buffer.alloc(size - 8)
		]);

	it('returns the size of a real image (happy path)', () => {
		expect(assertImage('a.png', png(5000))).toBe(5000);
	});

	it('refuses an empty file, a tiny one and a file that is no PNG (error)', () => {
		expect(() => assertImage('a.png', Buffer.alloc(0))).toThrow(/a\.png is empty or too small/);
		expect(() => assertImage('a.png', png(999))).toThrow(/too small/);
		expect(() => assertImage('a.png', Buffer.alloc(5000))).toThrow(/not a PNG/);
	});

	it('accepts the smallest size allowed (boundary value)', () => {
		expect(assertImage('a.png', png(1000))).toBe(1000);
	});
});
