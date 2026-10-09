import { expect, test } from '@playwright/test';
import { isValidEmail } from '../../../src/lib/validation/email';
import { EMAIL_CASES } from '../../shared/email-cases';

// Needs a real backend: the point is that the e-mail rule of the client and the one of the server
// coincide on every address of the shared table. The check goes through the API, so one browser
// is enough.

const API = process.env.PUBLIC_API_URL || 'http://localhost:8080';

test.describe('E-mail rule, client and server together', () => {
	test.skip(
		({ browserName }) => browserName !== 'chromium',
		'The API does not depend on the browser'
	);

	for (const [email, accepted, why] of EMAIL_CASES) {
		test(`${accepted ? 'accepts' : 'refuses'} ${why}, as isValidEmail does`, async ({
			request
		}) => {
			// WHEN: A user is created with the address. The format is checked before the uniqueness,
			// so a second run of an accepted address answers 409, not 400.
			const response = await request.post(`${API}/api/v1/users`, {
				data: { name: `parity ${why}`, email }
			});

			// THEN: The server answers as the table says, and so does the client.
			expect([201, 400, 409]).toContain(response.status());
			expect(response.status() !== 400).toBe(accepted);
			expect(isValidEmail(email)).toBe(accepted);
		});
	}
});
