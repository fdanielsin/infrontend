// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { localeCookie, text } from '../../e2e/support/locale';

// The helpers the E2E tests share to read a message and to choose a language.

describe('text of the E2E tests', () => {
	it('reads a message of the catalog, with its parameters (happy path)', () => {
		expect(text('en', 'availability_retry')).not.toBe('');
		expect(text('fr', 'availability_retry')).not.toBe(text('en', 'availability_retry'));
	});

	it('refuses a key that the catalog lacks, instead of expecting an empty text (exception)', () => {
		expect(() => text('en', 'no_such_message')).toThrow(/no_such_message.*en\.json/);
	});
});

describe('locale cookie of the E2E tests', () => {
	it('is written for the server of this run, whatever its port (happy path)', () => {
		expect(localeCookie('fr', { E2E_PORT: '4112' })).toEqual({
			name: 'PARAGLIDE_LOCALE',
			value: 'fr',
			url: 'http://localhost:4112'
		});
	});

	it('falls back on the port of the Playwright configuration without E2E_PORT (boundary)', () => {
		expect(localeCookie('de', {}).url).toBe('http://localhost:4173');
		expect(localeCookie('de', { E2E_PORT: '' }).url).toBe('http://localhost:4173');
	});
});
