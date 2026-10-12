import { describe, expect, it } from 'vitest';
import { planApi } from '../../../scripts/lib/api.ts';

const OK = { OPENAPI_URL: 'http://localhost:8081/openapi.yaml' };

describe('planApi', () => {
	it('refuses to run without OPENAPI_URL: there is no default backend (error)', () => {
		expect(() => planApi('check', {})).toThrow(/OPENAPI_URL is required/);
		expect(() => planApi('generate', { OPENAPI_URL: '  ' })).toThrow(/OPENAPI_URL is required/);
	});

	it('reads the contract of develop when OPENAPI_URL says :8081 (happy path)', () => {
		const plan = planApi('check', { OPENAPI_URL: 'http://localhost:8081/openapi.yaml' });

		expect(plan.steps[0]?.args).toContain('http://localhost:8081/openapi.yaml');
	});

	it('reads the contract of a branch backend when OPENAPI_URL says so (happy path)', () => {
		const plan = planApi('generate', { OPENAPI_URL: 'http://localhost:8084/openapi.yaml' });

		expect(plan.env.OPENAPI_URL).toBe('http://localhost:8084/openapi.yaml');
	});

	it.each([
		'http://localhost:8080/openapi.yaml',
		'http://127.0.0.1:8080/openapi.yaml',
		'http://localhost:5173/openapi.yaml'
	])('refuses %s (error)', (url) => {
		expect(() => planApi('check', { OPENAPI_URL: url })).toThrow(/user/);
	});

	it('generates the types, then the zod schemas (happy path)', () => {
		const plan = planApi('generate', OK);

		expect(plan.steps.map((step) => [step.command, ...step.args.slice(1)])).toEqual([
			['openapi-typescript', '-o', 'src/lib/api/schema.d.ts'],
			['openapi-ts']
		]);
	});

	it('checks the types and the zod schemas against fresh copies, stopping at the first difference (happy path)', () => {
		const plan = planApi('check', OK);

		expect(plan.steps.map((step) => step.command)).toEqual([
			'openapi-typescript',
			'diff',
			'openapi-ts',
			'diff'
		]);
		expect(plan.steps[1]?.args).toEqual([
			'-u',
			'src/lib/api/schema.d.ts',
			'node_modules/.cache/schema.check.d.ts'
		]);
		expect(plan.steps[3]?.args).toEqual([
			'-u',
			'src/lib/api/zod/zod.gen.ts',
			'node_modules/.cache/zod/zod.gen.ts'
		]);
	});
});
