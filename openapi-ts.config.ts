import { defineConfig } from '@hey-api/openapi-ts';

// The part of an OpenAPI response the patch below reads and writes.
type ResponseObject = {
	content?: {
		'application/json'?: { schema?: { allOf?: Array<{ properties?: Record<string, unknown> }> } };
	};
};

// Generates the zod schemas of the API responses from the backend contract. The TypeScript types
// come from openapi-typescript (`bun run api:generate` runs both).
export default defineConfig({
	input: process.env.OPENAPI_PATH ?? '../inbackend/docs/specs/api/openapi.yaml',
	output: { path: 'src/lib/api/zod', clean: true },
	parser: {
		patch: {
			// Provisional: the 200 response of DELETE /api/v1/tasks/{id} requires `message` but declares
			// no `properties`, and the generator drops the `required` of such an object. Declare the
			// property so that a response without `message` is refused. Remove once the contract
			// declares `message` under `properties`.
			operations: (method, path, operation) => {
				if (method.toUpperCase() !== 'DELETE' || path !== '/api/v1/tasks/{id}') return;
				const responses = operation.responses as unknown as Record<string, ResponseObject>;
				const parts = responses['200']?.content?.['application/json']?.schema?.allOf;
				const messageOnly = parts?.find((part) => !('$ref' in part));
				if (messageOnly) messageOnly.properties = { message: { type: 'string' } };
			},
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
