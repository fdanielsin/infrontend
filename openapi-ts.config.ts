import { defineConfig } from '@hey-api/openapi-ts';
import { USER_PORTS, checkUrl } from './scripts/lib/guard.ts';

// Generates the zod schemas of the API responses from the backend contract. The TypeScript types
// come from openapi-typescript (`bun run api:generate` runs both).
export default defineConfig({
	input: checkUrl('OPENAPI_URL', process.env.OPENAPI_URL, USER_PORTS).href,
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
