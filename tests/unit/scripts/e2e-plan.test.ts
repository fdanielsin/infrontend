import { describe, expect, it } from 'vitest';
import { planE2e } from '../../../scripts/lib/e2e.ts';

const ROOT = '/work/infrontend/.worktrees/lot';
const present = () => true;
const absent = () => false;

describe('planE2e, mocked suite', () => {
	it('forces the unreachable API, the mocked tests only and the output folder (happy path)', () => {
		const plan = planE2e('mocked', { E2E_PORT: '4103' }, ['--project=chromium'], ROOT, present);

		expect(plan.args).toEqual(['test', '--project=chromium', '--output=test-results/e2e']);
		expect(plan.env.PUBLIC_API_URL).toBe('http://localhost:59999');
		expect(plan.env.E2E_MOCKED_ONLY).toBe('1');
		expect(plan.env.E2E_PORT).toBe('4103');
	});

	it('overrides a PUBLIC_API_URL that points at a real backend, even the user one (limit)', () => {
		const plan = planE2e(
			'mocked',
			{ E2E_PORT: '4103', PUBLIC_API_URL: 'http://localhost:8080' },
			[],
			ROOT,
			present
		);

		expect(plan.env.PUBLIC_API_URL).toBe('http://localhost:59999');
	});

	it('requires E2E_PORT, so that two worktrees never meet (error)', () => {
		expect(() => planE2e('mocked', {}, [], ROOT, present)).toThrow(/E2E_PORT/);
		expect(() => planE2e('mocked', { E2E_PORT: '8080' }, [], ROOT, present)).toThrow(/user/);
	});

	it('keeps an output folder given on the command line (boundary values)', () => {
		const plan = planE2e('mocked', { E2E_PORT: '4103' }, ['--output=other'], ROOT, present);

		expect(plan.args).toEqual(['test', '--output=other']);
	});

	it('passes every argument through, in order (limit)', () => {
		const plan = planE2e(
			'mocked',
			{ E2E_PORT: '4103' },
			['tests/e2e/a.test.ts', '-g', 'some title', '--reporter=line'],
			ROOT,
			present
		);

		expect(plan.args).toEqual([
			'test',
			'tests/e2e/a.test.ts',
			'-g',
			'some title',
			'--reporter=line',
			'--output=test-results/e2e'
		]);
	});

	it('uses the browsers folder shared by the worktrees when it exists (happy path)', () => {
		const plan = planE2e('mocked', { E2E_PORT: '4103' }, [], ROOT, present);

		expect(plan.env.PLAYWRIGHT_BROWSERS_PATH).toBe(
			'/work/infrontend/.worktrees/.playwright-browsers'
		);
	});

	it('keeps a PLAYWRIGHT_BROWSERS_PATH already set, and sets none when no folder exists (boundary)', () => {
		const given = planE2e(
			'mocked',
			{ E2E_PORT: '4103', PLAYWRIGHT_BROWSERS_PATH: '/elsewhere' },
			[],
			ROOT,
			present
		);
		const none = planE2e('mocked', { E2E_PORT: '4103' }, [], ROOT, absent);

		expect(given.env.PLAYWRIGHT_BROWSERS_PATH).toBe('/elsewhere');
		expect(none.env.PLAYWRIGHT_BROWSERS_PATH).toBeUndefined();
	});
});

describe('planE2e, real backend suite', () => {
	it('targets tests/e2e/backend with the URL it is given, and no mocked-only flag (happy path)', () => {
		const plan = planE2e(
			'backend',
			{ E2E_PORT: '4103', PUBLIC_API_URL: 'http://localhost:8083', E2E_MOCKED_ONLY: '1' },
			['--project=chromium'],
			ROOT,
			present
		);

		expect(plan.args).toEqual([
			'test',
			'tests/e2e/backend',
			'--project=chromium',
			'--grep-invert=@alone',
			'--output=test-results/e2e'
		]);
		expect(plan.env.PUBLIC_API_URL).toBe('http://localhost:8083');
		expect(plan.env.E2E_MOCKED_ONLY).toBeUndefined();
	});

	it('plans a second run, one worker, for the tests tagged @alone, with an output folder of its own (happy path)', () => {
		const plan = planE2e(
			'backend',
			{ E2E_PORT: '4103', PUBLIC_API_URL: 'http://localhost:8083' },
			['--project=firefox', '--workers=4'],
			ROOT,
			present
		);

		expect(plan.alone?.args).toEqual([
			'test',
			'tests/e2e/backend',
			'--project=firefox',
			'--workers=4',
			'--grep=@alone',
			'--workers=1',
			'--pass-with-no-tests',
			'--output=test-results/e2e-alone'
		]);
		expect(plan.alone?.env).toEqual(plan.env);
	});

	it('derives the output folder of the second run from the one given (boundary values)', () => {
		const plan = planE2e(
			'backend',
			{ E2E_PORT: '4103', PUBLIC_API_URL: 'http://localhost:8083' },
			['--output=elsewhere'],
			ROOT,
			present
		);

		expect(plan.args).toContain('--output=elsewhere');
		expect(plan.alone?.args).toContain('--output=elsewhere-alone');
	});

	it.each([['-g'], ['--grep'], ['--grep-invert']])(
		'leaves a run alone when a filter of titles (%s) is given: one run, as asked (limit)',
		(flag) => {
			const plan = planE2e(
				'backend',
				{ E2E_PORT: '4103', PUBLIC_API_URL: 'http://localhost:8083' },
				[flag, 'critère 32'],
				ROOT,
				present
			);

			expect(plan.alone).toBeUndefined();
			expect(plan.args).not.toContain('--grep-invert=@alone');
		}
	);

	it('plans no second run for the mocked suite (limit)', () => {
		const plan = planE2e('mocked', { E2E_PORT: '4103' }, [], ROOT, present);

		expect(plan.alone).toBeUndefined();
		expect(plan.args).not.toContain('--grep-invert=@alone');
	});

	it('has no default URL (error)', () => {
		expect(() => planE2e('backend', { E2E_PORT: '4103' }, [], ROOT, present)).toThrow(
			/PUBLIC_API_URL is required/
		);
	});

	it.each(['http://localhost:8080', 'http://127.0.0.1:5173', 'http://localhost:8081'])(
		'refuses %s: the user services and the read-only reference (error)',
		(url) => {
			expect(() =>
				planE2e('backend', { E2E_PORT: '4103', PUBLIC_API_URL: url }, [], ROOT, present)
			).toThrow();
		}
	);

	it('still requires E2E_PORT (error)', () => {
		expect(() =>
			planE2e('backend', { PUBLIC_API_URL: 'http://localhost:8083' }, [], ROOT, present)
		).toThrow(/E2E_PORT/);
	});
});
