// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANNOUNCER_STYLE_HASH, apiOrigin, cspDirectives } from '../../../svelte.csp.js';

// The origin of the API in the CSP (`connect-src`) comes from PUBLIC_API_URL at build time. There is
// no fallback: a wrong address must stop the build, not open the policy to a default.

describe('connect-src origin of the CSP', () => {
	it('SEC-R04: keeps only the origin of the API address, without path, query or trailing slash (limit)', () => {
		expect(apiOrigin('https://api.example.com/v1/?x=1#top')).toBe('https://api.example.com');
		expect(apiOrigin('http://localhost:8080/')).toBe('http://localhost:8080');
	});

	it('SEC-R04: writes the port as the browser does, none for the default of the scheme (boundary)', () => {
		expect(apiOrigin('https://api.example.com:443')).toBe('https://api.example.com');
		expect(apiOrigin('http://api.example.com:80/x')).toBe('http://api.example.com');
		expect(apiOrigin('http://localhost:65535')).toBe('http://localhost:65535');
		expect(apiOrigin('http://localhost:1')).toBe('http://localhost:1');
	});

	it.each([undefined, '', '   ', 'localhost:8080', '/relative', 'not a url'])(
		'SEC-R04: stops the build with a clear message when PUBLIC_API_URL is %j (exception)',
		(value) => {
			expect(() => apiOrigin(value)).toThrow(/PUBLIC_API_URL/);
			expect(() => cspDirectives(value)).toThrow(/PUBLIC_API_URL/);
		}
	);

	it.each([
		'ftp://files.example.com',
		'javascript:alert(1)',
		'file:///etc/passwd',
		'data:text/plain,x'
	])('SEC-R04: refuses %s, which is not a web address (sad path)', (value) => {
		expect(() => apiOrigin(value)).toThrow(/http/);
	});

	it('SEC-R04: puts the origin of the API in connect-src next to self, and nowhere else (happy path)', () => {
		const directives = cspDirectives('https://api.example.com/v1');

		expect(directives['connect-src']).toEqual(['self', 'https://api.example.com']);
		const others = Object.entries(directives).filter(([name]) => name !== 'connect-src');
		expect(JSON.stringify(others)).not.toContain('api.example.com');
	});
});

describe('inline style of the SvelteKit route announcer', () => {
	it('SEC-R04: the hash allowed in style-src-attr is the one of the style SvelteKit writes (boundary)', () => {
		// GIVEN: The announcer as the installed SvelteKit generates it.
		const source = readFileSync('node_modules/@sveltejs/kit/src/core/sync/write_root.js', 'utf8');
		const style = /id="svelte-announcer"[^>]*\sstyle="([^"]*)"/.exec(source)?.[1];

		// WHEN / THEN: A SvelteKit upgrade that changes it makes this fail, before the browser does.
		expect(style).toBeTruthy();
		const hash = createHash('sha256').update(style!).digest('base64');
		expect(ANNOUNCER_STYLE_HASH).toBe(`'sha256-${hash}'`);
		expect(cspDirectives('http://localhost:8080')['style-src-attr']).toEqual([
			'unsafe-hashes',
			ANNOUNCER_STYLE_HASH
		]);
	});
});
