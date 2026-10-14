import { describe, expect, it } from 'vitest';
import { LOCALES, SCREENS, STATES, WIDTHS } from '../../../scripts/lib/capture-catalog.ts';
import { parseCaptureArgs, planCaptures, renderIndex } from '../../../scripts/lib/capture-plan.ts';

const ROOT = '/work/infrontend/.worktrees/lot';
const env = { CAPTURE_PORT: '4114' };

describe('planCaptures', () => {
	it('takes every state at every width in every language, in a stable order (happy path)', () => {
		const entries = planCaptures();

		expect(entries).toHaveLength(STATES.length * WIDTHS.length * LOCALES.length);
		expect(entries[0]).toMatchObject({ screen: 'home', state: 'rest', width: 320, locale: 'en' });
		expect(entries[0]?.file).toBe('home/rest/320-en.png');
		expect(entries[1]?.file).toBe('home/rest/320-fr.png');
		expect(entries.at(-1)?.file).toBe('stats/outage/1280-es.png');
	});

	it('names no file twice, so that no capture hides another (invariant)', () => {
		const files = planCaptures().map((entry) => entry.file);

		expect(new Set(files).size).toBe(files.length);
	});

	it('covers the states the designer asked for on the home page (rest, empty, loading, error, selection, edit, pending deletion)', () => {
		const home = STATES.filter((state) => state.screen === 'home').map((state) => state.name);

		expect(home).toEqual(
			expect.arrayContaining([
				'rest',
				'empty',
				'loading',
				'error',
				'selected',
				'user-edit',
				'user-delete-pending',
				'task-delete-pending'
			])
		);
		expect(SCREENS.every((screen) => STATES.some((state) => state.screen === screen))).toBe(true);
	});

	it('uses the three widths of the brief and the four languages (boundary values)', () => {
		expect([...WIDTHS]).toEqual([320, 768, 1280]);
		expect([...LOCALES]).toEqual(['en', 'fr', 'de', 'es']);
	});

	it('narrows by screen, state, width and language (filters)', () => {
		const entries = planCaptures({
			screens: ['stats'],
			states: ['empty', 'error'],
			widths: [320],
			locales: ['de']
		});

		expect(entries.map((entry) => entry.file)).toEqual([
			'stats/empty/320-de.png',
			'stats/error/320-de.png'
		]);
	});

	it('a state name shared by two screens is taken on both unless a screen is given (limit)', () => {
		const both = planCaptures({ states: ['rest'], widths: [320], locales: ['en'] });

		expect(both.map((entry) => entry.screen)).toEqual(['home', 'stats']);
	});

	it('refuses an unknown state and a filter that selects nothing (error)', () => {
		expect(() => planCaptures({ states: ['nope'] })).toThrow(/"nope" is unknown/);
		expect(() => planCaptures({ screens: ['stats'], states: ['selected'] })).toThrow(/no capture/);
	});
});

describe('parseCaptureArgs', () => {
	it('reads the port, the default folder and no filter (happy path)', () => {
		const options = parseCaptureArgs([], env, ROOT);

		expect(options).toEqual({
			port: 4114,
			outDir: `${ROOT}/test-results/captures`,
			build: true,
			filters: {}
		});
	});

	it('reads comma-separated lists and --skip-build', () => {
		const options = parseCaptureArgs(
			['--skip-build', '--screen=home', '--state=rest,empty', '--width=320,1280', '--locale=fr,de'],
			env,
			ROOT
		);

		expect(options.build).toBe(false);
		expect(options.filters).toEqual({
			screens: ['home'],
			states: ['rest', 'empty'],
			widths: [320, 1280],
			locales: ['fr', 'de']
		});
	});

	it('requires a port of its own, never one of the user, of the reference or of their previews (error)', () => {
		expect(() => parseCaptureArgs([], {}, ROOT)).toThrow(/CAPTURE_PORT/);
		for (const port of ['8080', '5173', '8081', '5174']) {
			expect(() => parseCaptureArgs([], { CAPTURE_PORT: port }, ROOT)).toThrow(/CAPTURE_PORT/);
		}
	});

	it('refuses an unknown argument, width, language or screen (error)', () => {
		expect(() => parseCaptureArgs(['--colour=red'], env, ROOT)).toThrow(/Unknown argument/);
		expect(() => parseCaptureArgs(['verbose'], env, ROOT)).toThrow(/Unknown argument/);
		expect(() => parseCaptureArgs(['--width=400'], env, ROOT)).toThrow(/"400" is unknown/);
		expect(() => parseCaptureArgs(['--locale=it'], env, ROOT)).toThrow(/"it" is unknown/);
		expect(() => parseCaptureArgs(['--screen=admin'], env, ROOT)).toThrow(/"admin" is unknown/);
		expect(() => parseCaptureArgs(['--state=nope'], env, ROOT)).toThrow(/"nope" is unknown/);
		expect(() => parseCaptureArgs(['--width='], env, ROOT)).toThrow(/needs a value/);
	});

	it('empties only a folder inside test-results/ (security)', () => {
		expect(parseCaptureArgs(['--out=test-results/mine'], env, ROOT).outDir).toBe(
			`${ROOT}/test-results/mine`
		);
		for (const out of [
			'',
			'.',
			'test-results',
			'src',
			'../elsewhere',
			'test-results/../src',
			'/tmp/x'
		]) {
			expect(() => parseCaptureArgs([`--out=${out}`], env, ROOT)).toThrow(/--out/);
		}
	});
});

describe('renderIndex', () => {
	it('lists each capture with its file, its size and what it shows, and the forbidden requests counted', () => {
		const [entry] = planCaptures({
			states: ['empty'],
			screens: ['home'],
			widths: [320],
			locales: ['en']
		});

		const text = renderIndex([{ entry: entry!, bytes: 1234 }], 0);

		expect(text).toContain('1 captures, 0 request(s) to a forbidden port.');
		expect(text).toContain(
			'| home | empty | 320 | en | [home/empty/320-en.png](home/empty/320-en.png) | 1234 | No user yet. |'
		);
	});
});
