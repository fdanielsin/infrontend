import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// SEC-R04 on the production build (`vite build` then `vite preview`, the same server code as the
// Docker image): the headers of the real responses, and no screen that breaks the policy. The API
// is mocked. The build needs PUBLIC_API_URL, so does this file: there is no default to fall back on.

const API_URL = process.env.PUBLIC_API_URL;
if (!API_URL) throw new Error('PUBLIC_API_URL is required: the policy names the API origin');
const API_ORIGIN = new URL(API_URL).origin;

const NONCE = /^'nonce-[A-Za-z0-9+/=_-]{16,}'$/;

function directivesOf(response: APIResponse) {
	const policy = response.headers()['content-security-policy'] ?? '';
	return Object.fromEntries(
		policy
			.split(';')
			.map((directive) => directive.trim().split(/\s+/))
			.filter(([name]) => name)
			.map(([name, ...sources]) => [name, sources])
	) as Record<string, string[]>;
}

const nonceOf = (html: string) => /<script[^>]*\snonce="([^"]+)"/.exec(html)?.[1];

test.describe('SEC-R04: headers of the documents (production build)', () => {
	// The headers do not depend on the browser: one engine reads them.
	test.skip(({ browserName }) => browserName !== 'chromium', 'same server answer in every engine');

	for (const path of ['/', '/stats', '/does-not-exist']) {
		test(`SEC-R04: ${path} answers with the policy, Referrer-Policy and nosniff (happy path)`, async ({
			request
		}) => {
			const response = await request.get(path);

			expect(response.status()).toBe(path === '/does-not-exist' ? 404 : 200);
			expect(response.headers()['content-security-policy']).toBeTruthy();
			expect(response.headers()['referrer-policy']).toBe('no-referrer');
			expect(response.headers()['x-content-type-options']).toBe('nosniff');
		});
	}

	test('SEC-R04: the policy is the intended one, with no unsafe source and the API origin only (happy path)', async ({
		request
	}) => {
		const directives = directivesOf(await request.get('/'));

		expect(directives).toEqual({
			'default-src': ["'none'"],
			'script-src': ["'self'", expect.stringMatching(NONCE)],
			'style-src': expect.arrayContaining(["'self'"]),
			// Only the route announcer of SvelteKit, by hash.
			'style-src-attr': ["'unsafe-hashes'", expect.stringMatching(/^'sha256-[A-Za-z0-9+/]{43}='$/)],
			'img-src': ["'self'", 'data:'],
			'connect-src': ["'self'", API_ORIGIN],
			'base-uri': ["'self'"],
			'form-action': ["'self'"],
			'frame-ancestors': ["'none'"],
			'object-src': ["'none'"]
		});
		const sources = Object.values(directives).flat();
		expect(sources).not.toContain("'unsafe-inline'");
		expect(sources).not.toContain("'unsafe-eval'");
		expect(sources).not.toContain('*');
	});

	test('SEC-R04: the nonce of the header is the one of the start script, and changes at each request (limit)', async ({
		request
	}) => {
		const first = await request.get('/');
		const second = await request.get('/');

		const headerNonce = directivesOf(first)['script-src']?.find((source) => NONCE.test(source));
		const htmlNonce = nonceOf(await first.text());
		expect(htmlNonce).toBeTruthy();
		expect(headerNonce).toBe(`'nonce-${htmlNonce}'`);
		expect(nonceOf(await second.text())).not.toBe(htmlNonce);
	});

	for (const path of ['/', '/stats', '/does-not-exist']) {
		test(`SEC-R04: the HTML of ${path} has no inline style attribute, which the policy would block (limit)`, async ({
			request
		}) => {
			const html = await (await request.get(path)).text();

			expect(html).not.toMatch(/\sstyle\s*=/i);
		});
	}
});

// Everything that breaks the policy in the page: the event of the browser, and its console message.
async function watchViolations(page: Page) {
	const violations: string[] = [];
	await page.exposeFunction('reportViolation', (what: string) => violations.push(what));
	await page.addInitScript(() => {
		document.addEventListener('securitypolicyviolation', (event) =>
			(window as unknown as { reportViolation: (what: string) => void }).reportViolation(
				`${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`
			)
		);
	});
	page.on('console', (message) => {
		if (/content security policy|refused to/i.test(message.text())) {
			violations.push(`console: ${message.text()}`);
		}
	});
	return violations;
}

test.describe('SEC-R04: the screens against the policy (production build)', () => {
	test('SEC-R04: no screen of the app breaks the policy (happy path)', async ({ page }) => {
		const violations = await watchViolations(page);
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });

		// Home, a user and its tasks, an edit (the field grows with CSSOM styles), a deletion with its
		// Undo toast, an error toast, another language, then the statistics page.
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Edit Review', exact: true }).click();
		await page.getByLabel('Task Title').nth(1).fill('A longer title for the edit');
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: 'Delete Review 2' }).click();
		await page.getByRole('button', { name: 'Undo' }).click();
		api.failNext('PUT /tasks/{id}', { status: 500, error: 'Database unavailable' });
		await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
		await expect(page.getByRole('alert').getByText('Database unavailable')).toBeVisible();
		await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await page.locator('a[href="/stats"]').click();
		await expect(page).toHaveURL(/\/stats$/);
		await page.goto('/stats');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

		expect(violations).toEqual([]);
	});

	test('SEC-R04: the page wrapper keeps display: contents without an inline style (happy path)', async ({
		page
	}) => {
		await mockApi(page);
		await page.goto('/');

		const wrapper = page.locator('body > div').first();
		await expect(wrapper).toHaveCSS('display', 'contents');
		await expect(wrapper).not.toHaveAttribute('style', /.+/);
	});

	test('SEC-R04: the watcher sees an inline style and an external image blocked by the policy (sad path)', async ({
		page
	}) => {
		const violations = await watchViolations(page);
		await mockApi(page);
		await page.goto('/');

		await page.evaluate(() => {
			const style = document.createElement('style');
			style.textContent = 'body { color: red }';
			document.head.append(style);
			new Image().src = 'https://blocked.example.invalid/x.png';
		});

		await expect.poll(() => violations.some((what) => what.startsWith('style-src'))).toBe(true);
		await expect.poll(() => violations.some((what) => what.startsWith('img-src'))).toBe(true);
	});
});
