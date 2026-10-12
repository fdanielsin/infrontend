import { apiBaseUrl } from '../../../scripts/lib/guard.ts';

// The backend of the real E2E tests (tests/e2e/backend): the same `PUBLIC_API_URL` the build under
// test is made with. No fallback: a test run by hand cannot land on the user's backend.
export const API = apiBaseUrl(process.env);
