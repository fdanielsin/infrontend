import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALES, STATES } from '../../../scripts/lib/capture-catalog.ts';
import { DRIVERS, messageText } from '../../../scripts/lib/capture-drivers.ts';

const root = process.cwd();

describe('the drivers of the capture states', () => {
	it('every state of the catalog has a driver and every driver a state, so that none is silently skipped (invariant)', () => {
		for (const screen of ['home', 'stats'] as const) {
			const catalog = STATES.filter((state) => state.screen === screen).map((state) => state.name);
			expect(Object.keys(DRIVERS[screen]).sort()).toEqual([...catalog].sort());
		}
	});

	it('the languages of the catalog are those of messages/ (invariant)', () => {
		const files = readdirSync(`${root}/messages`)
			.filter((name) => name.endsWith('.json'))
			.map((name) => name.replace('.json', ''));

		expect([...LOCALES].sort()).toEqual(files.sort());
	});

	it('every message a driver waits for exists in every language (a missing one would wait for ever)', () => {
		const source = readFileSync(`${root}/scripts/lib/capture-drivers.ts`, 'utf8');
		const keys = [...source.matchAll(/\.t\(\s*'([a-z_]+)'/g)].map((match) => match[1]!);

		expect(keys.length).toBeGreaterThan(10);
		for (const locale of LOCALES) {
			for (const key of keys) expect(() => messageText(root, locale, key)).not.toThrow();
		}
	});

	it('fills the parameters of a message and refuses an unknown key (error)', () => {
		expect(messageText(root, 'en', 'tasks_for_user', { name: 'Ada' })).toBe('Tasks for Ada');
		expect(() => messageText(root, 'en', 'no_such_key')).toThrow(/no key/);
	});
});
