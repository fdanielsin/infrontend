import { defineConfig } from '@hey-api/openapi-ts';

// Generates the zod schemas of the API responses from the backend contract. The TypeScript types
// come from openapi-typescript (`bun run api:generate` runs both).
export default defineConfig({
	input: process.env.OPENAPI_PATH ?? '../inbackend/docs/specs/api/openapi.yaml',
	output: { path: 'src/lib/api/zod', clean: true },
	parser: {
		patch: {
			schemas: {
				// Provisional: the contract declares the counters as `int64`, which the generator turns
				// into `bigint`, while the API sends plain JSON numbers. Remove this patch once the
				// contract no longer carries `format: int64` on `Stats`.
				Stats: (schema) => {
					for (const property of Object.values(schema.properties ?? {})) {
						if (typeof property === 'object') delete property.format;
					}
				}
			}
		}
	},
	plugins: [
		{
			name: 'zod',
			compatibilityVersion: 4,
			requests: false,
			responses: true,
			definitions: true,
			types: { infer: false }
		}
	]
});
