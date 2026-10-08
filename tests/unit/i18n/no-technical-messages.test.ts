import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Words of a log line, not of a sentence for a person: none of them may reach the screen.
const TECHNICAL = [
	'Internal server error',
	'Database unavailable',
	'Erreur interne du serveur',
	'Base de données indisponible',
	'Interner Serverfehler',
	'Datenbank nicht verfügbar',
	'Error interno del servidor',
	'Base de datos no disponible'
];

describe('messages shown to people', () => {
	it.each(['en', 'fr', 'de', 'es'])('%s has no log-line wording (limit)', (locale) => {
		const text = readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8');

		for (const phrase of TECHNICAL) expect(text).not.toContain(phrase);
	});

	it('has no leftover "Error: {message}" statistics banner in any language (limit)', () => {
		for (const locale of ['en', 'fr', 'de', 'es']) {
			const messages = JSON.parse(
				readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
			) as Record<string, string>;
			expect(messages).not.toHaveProperty('stats_error');
		}
	});
});
