import { defineConfig } from '@hey-api/openapi-ts';

// Generates the zod schemas of the API responses from the backend contract. The TypeScript types
// come from openapi-typescript (`bun run api:generate` runs both).
export default defineConfig({
	input: process.env.OPENAPI_PATH ?? '../inbackend/docs/specs/api/openapi.yaml',
	output: { path: 'src/lib/api/zod', clean: true },
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
