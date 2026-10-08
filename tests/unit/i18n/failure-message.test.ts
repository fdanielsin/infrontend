import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ApiFailure, ErrorCode } from '$lib/api/client';
import { failureMessage } from '$lib/i18n/errors';
import { overwriteGetLocale, type Locale } from '$lib/paraglide/runtime';

const LOCALES: Locale[] = ['en', 'fr', 'de', 'es'];
const CODES: ErrorCode[] = [
	'INVALID_BODY',
	'INVALID_ID',
	'VALIDATION_FAILED',
	'USER_NOT_FOUND',
	'TASK_NOT_FOUND',
	'EMAIL_TAKEN',
	'ROUTE_NOT_FOUND',
	'METHOD_NOT_ALLOWED',
	'PAYLOAD_TOO_LARGE',
	'DATABASE_UNAVAILABLE',
	'INTERNAL_ERROR'
];

function translation(locale: Locale, key: string) {
	const messages = JSON.parse(
		readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
	) as Record<string, string>;
	return messages[key];
}

function useLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

const fallback = () => 'Fallback of the action';

describe('failureMessage', () => {
	afterEach(() => {
		useLocale('en');
	});

	it.each(LOCALES.flatMap((locale) => CODES.map((code) => [locale, code] as const)))(
		'shows %s for the known code %s, not the server text (happy path)',
		(locale, code) => {
			// GIVEN: A failure with a code of the contract and an English server message.
			useLocale(locale);
			const failure: ApiFailure = { success: false, error: 'Server text', status: 400, code };

			// WHEN: The message is resolved.
			const message = failureMessage(failure, fallback);

			// THEN: It is the translation of the code in the interface language.
			expect(message).toBe(translation(locale, `error_${code.toLowerCase()}`));
			expect(message).not.toBe('Server text');
		}
	);

	it('keeps the server message for a code unknown to the contract (sad path)', () => {
		// GIVEN: A code the server may add later.
		useLocale('fr');
		const failure: ApiFailure = { success: false, error: 'Quota exceeded', code: 'QUOTA_EXCEEDED' };

		// WHEN / THEN: The server text is shown as is.
		expect(failureMessage(failure, fallback)).toBe('Quota exceeded');
	});

	it('keeps the server message when there is no code (limit)', () => {
		// GIVEN: A failure without code.
		useLocale('de');

		// WHEN / THEN: The server text is shown.
		expect(failureMessage({ success: false, error: 'HTTP 502', status: 502 }, fallback)).toBe(
			'HTTP 502'
		);
	});

	it('uses the action fallback when there is neither code nor message (limit)', () => {
		// GIVEN: An empty failure.
		// WHEN / THEN: The fallback of the action is used.
		expect(failureMessage({ success: false, error: '' }, fallback)).toBe('Fallback of the action');
	});

	it.each(LOCALES)('translates failures born in the client in %s (happy path)', (locale) => {
		// GIVEN: The interface language.
		useLocale(locale);

		// WHEN / THEN: Invalid responses and unknown errors are translated.
		expect(
			failureMessage(
				{ success: false, error: 'Invalid server response', kind: 'invalid_response' },
				fallback
			)
		).toBe(translation(locale, 'error_invalid_response'));
		expect(
			failureMessage({ success: false, error: 'Unknown error', kind: 'unknown' }, fallback)
		).toBe(translation(locale, 'error_unknown'));
	});

	it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
		'does not take the inherited property %s for a known code (boundary)',
		(code) => {
			// GIVEN: A code that is the name of an object property.
			// WHEN / THEN: It is treated as unknown: the server text is kept.
			expect(failureMessage({ success: false, error: 'Odd', code }, fallback)).toBe('Odd');
		}
	);

	it('prefers a known code to the client kind (exception)', () => {
		// GIVEN: A failure that has both.
		useLocale('es');
		const failure: ApiFailure = {
			success: false,
			error: 'x',
			code: 'INTERNAL_ERROR',
			kind: 'invalid_response'
		};

		// WHEN / THEN: The code decides.
		expect(failureMessage(failure, fallback)).toBe(translation('es', 'error_internal_error'));
	});

	// A server failure is worded for the person, never as a log line: it says it is on our side or
	// that the service is down, and what to do next.
	it.each([
		['en', 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again in a moment.'],
		[
			'en',
			'DATABASE_UNAVAILABLE',
			'The service is temporarily unavailable. Please try again in a moment.'
		],
		['fr', 'INTERNAL_ERROR', 'Un problème est survenu de notre côté. Réessayez dans un instant.'],
		[
			'fr',
			'DATABASE_UNAVAILABLE',
			'Le service est momentanément indisponible. Réessayez dans un instant.'
		],
		[
			'de',
			'INTERNAL_ERROR',
			'Auf unserer Seite ist etwas schiefgelaufen. Bitte versuchen Sie es gleich noch einmal.'
		],
		[
			'de',
			'DATABASE_UNAVAILABLE',
			'Der Dienst ist vorübergehend nicht verfügbar. Bitte versuchen Sie es gleich noch einmal.'
		],
		['es', 'INTERNAL_ERROR', 'Algo salió mal por nuestra parte. Inténtalo de nuevo en un momento.'],
		[
			'es',
			'DATABASE_UNAVAILABLE',
			'El servicio no está disponible temporalmente. Inténtalo de nuevo en un momento.'
		]
	] as const)('words %s %s for a person, with the next step (happy path)', (locale, code, text) => {
		useLocale(locale);

		const message = failureMessage({ success: false, error: 'Boom', status: 500, code }, fallback);

		expect(message).toBe(text);
		expect(message).not.toMatch(/internal|database|datenbank|base de (datos|données)|interne/i);
	});
});
