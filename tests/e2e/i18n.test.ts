import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectAnnounced } from './support/announcement';
import { ada, adaTasks, grace, mockApi } from './support/mock-api';

// Interface languages (I2): cookie, then Accept-Language, then English; no URL prefix.
// The API is mocked; the page is served by the dev server, which renders it server side.

type Locale = 'en' | 'fr' | 'de' | 'es';
const LOCALES: Locale[] = ['en', 'fr', 'de', 'es'];
const BROWSER_LOCALES: Record<Locale, string> = {
	en: 'en-US',
	fr: 'fr-FR',
	de: 'de-DE',
	es: 'es-ES'
};

const messages = Object.fromEntries(
	LOCALES.map((locale) => [
		locale,
		JSON.parse(
			readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
		) as Record<string, string>
	])
) as Record<Locale, Record<string, string>>;

function t(locale: Locale, key: string, parameters: Record<string, string> = {}) {
	return Object.entries(parameters).reduce(
		(text, [name, value]) => text.replace(`{${name}}`, value),
		messages[locale][key] ?? ''
	);
}

async function chooseLocaleCookie(context: BrowserContext, locale: string) {
	await context.addCookies([
		{ name: 'PARAGLIDE_LOCALE', value: locale, url: 'http://localhost:4173' }
	]);
}

// Opens the home page once its data is loaded (hydrated), and selects Ada.
async function openHomeWithAda(page: Page, locale: Locale) {
	const usersLoaded = page.waitForResponse((response) => response.url().endsWith('/api/v1/users'));
	await page.goto('/');
	await usersLoaded;
	await page.getByRole('button', { name: new RegExp(ada.name) }).click();
	await expect(
		page.getByRole('heading', { name: t(locale, 'tasks_for_user', { name: ada.name }) })
	).toBeVisible();
}

async function expectNoViolations(page: Page) {
	const { violations } = await new AxeBuilder({ page }).analyze();
	const summary = violations.flatMap((violation) =>
		violation.nodes.map(
			(node) => `${violation.id}: ${node.target.join(' ')} (${node.any[0]?.message ?? ''})`
		)
	);
	expect(summary).toEqual([]);
}

test.describe('Server rendering in the request language', () => {
	for (const locale of LOCALES) {
		test(`serves the home page in ${locale} for a ${BROWSER_LOCALES[locale]} browser (happy path)`, async ({
			request
		}) => {
			// GIVEN / WHEN: The raw server HTML for a browser preferring that language.
			const html = await (
				await request.get('/', {
					headers: { 'Accept-Language': `${BROWSER_LOCALES[locale]},en;q=0.5` }
				})
			).text();

			// THEN: <html lang>, the title and the heading are in that language before any script runs.
			expect(html).toContain(`<html lang="${locale}">`);
			expect(html).toContain(`<title>${t(locale, 'home_page_title')}</title>`);
			expect(html).toContain(t(locale, 'home_heading'));
		});
	}

	test('lets the language cookie win over Accept-Language (happy path)', async ({ request }) => {
		// GIVEN / WHEN: A Spanish cookie and a French browser.
		const html = await (
			await request.get('/stats', {
				headers: { Cookie: 'PARAGLIDE_LOCALE=es', 'Accept-Language': 'fr-FR' }
			})
		).text();

		// THEN: The page is Spanish.
		expect(html).toContain('<html lang="es">');
		expect(html).toContain(`<title>${t('es', 'stats_page_title')}</title>`);
	});

	test('ignores an invalid cookie and falls back to Accept-Language (sad path)', async ({
		request
	}) => {
		// GIVEN / WHEN: A tampered cookie and a German browser.
		const html = await (
			await request.get('/', {
				headers: { Cookie: 'PARAGLIDE_LOCALE=<script>', 'Accept-Language': 'de-DE' }
			})
		).text();

		// THEN: The page is German and the cookie value is not echoed.
		expect(html).toContain('<html lang="de">');
		expect(html).not.toContain('<script>"');
	});

	test('serves English to a browser asking only for unsupported languages (limit)', async ({
		request
	}) => {
		// GIVEN / WHEN: An Italian and Brazilian Portuguese browser.
		const html = await (
			await request.get('/', { headers: { 'Accept-Language': 'it-IT, pt-BR;q=0.8' } })
		).text();

		// THEN: English.
		expect(html).toContain('<html lang="en">');
		expect(html).toContain(t('en', 'home_heading'));
	});
});

test.describe('No language flash at hydration', () => {
	test.use({ locale: 'fr-FR' });

	test('keeps the server text and lang when the page hydrates (limit)', async ({ page }) => {
		// GIVEN: A recorder of text and lang changes, installed before any page script.
		await mockApi(page, { users: [ada] });
		await page.addInitScript(() => {
			const changes: string[] = [];
			(window as unknown as { languageChanges: string[] }).languageChanges = changes;
			new MutationObserver((records) => {
				for (const record of records) {
					if (record.type === 'attributes') changes.push(`lang=${document.documentElement.lang}`);
					if (record.type === 'characterData')
						changes.push(`text=${record.target.nodeValue ?? ''}`);
				}
			}).observe(document, {
				subtree: true,
				attributes: true,
				attributeFilter: ['lang'],
				characterData: true
			});
		});

		// WHEN: The French page loads and hydrates.
		const usersLoaded = page.waitForResponse((response) =>
			response.url().endsWith('/api/v1/users')
		);
		await page.goto('/');
		await usersLoaded;

		// THEN: It was French from the server and nothing was rewritten in another language.
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await expect(page.getByRole('heading', { level: 1 })).toContainText(t('fr', 'home_heading'));
		const changes = await page.evaluate(
			() => (window as unknown as { languageChanges: string[] }).languageChanges
		);
		expect(changes.filter((change) => change.startsWith('lang='))).toEqual([]);
		expect(changes.filter((change) => change.includes(t('en', 'home_heading')))).toEqual([]);
	});

	test.describe('without JavaScript', () => {
		test.use({ javaScriptEnabled: false, locale: 'de-DE' });

		test('is already readable in the browser language (boundary)', async ({ page }) => {
			// GIVEN / WHEN: A German browser that runs no script.
			await page.goto('/');

			// THEN: Language, title and heading come from the server.
			await expect(page.locator('html')).toHaveAttribute('lang', 'de');
			await expect(page).toHaveTitle(t('de', 'home_page_title'));
			await expect(page.getByRole('heading', { level: 1 })).toContainText(t('de', 'home_heading'));
		});
	});
});

test.describe('Language switcher', () => {
	test('switches the page with the keyboard, keeps the focus and the draft, and remembers the choice (happy path)', async ({
		page,
		context
	}) => {
		// GIVEN: The English home page with a draft in the name field.
		await mockApi(page, { users: [ada] });
		const usersLoaded = page.waitForResponse((response) =>
			response.url().endsWith('/api/v1/users')
		);
		await page.goto('/');
		await usersLoaded;
		await page.getByLabel(t('en', 'users_name_label'), { exact: true }).fill('Grace draft');
		const switcher = page.getByRole('combobox', { name: t('en', 'language_label') });

		// WHEN: The keyboard user focuses the switcher and types "f" (type-ahead on the closed
		// select picks "FR - Français"; arrow keys open the list on some systems).
		await switcher.focus();
		await page.keyboard.press('f');

		// THEN: The page is French without reload, the focus and the draft stay.
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await expect(page.getByRole('heading', { level: 1 })).toContainText(t('fr', 'home_heading'));
		await expect(page.getByRole('combobox', { name: t('fr', 'language_label') })).toBeFocused();
		await expect(page.getByLabel(t('fr', 'users_name_label'), { exact: true })).toHaveValue(
			'Grace draft'
		);
		await expectAnnounced(page, t('fr', 'language_changed', { language: 'Français' }));
		expect(
			(await context.cookies()).find((cookie) => cookie.name === 'PARAGLIDE_LOCALE')?.value
		).toBe('fr');

		// WHEN: The page is reloaded.
		await page.reload();

		// THEN: French is remembered.
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
	});

	test('translates a field error already shown and keeps it linked (limit)', async ({ page }) => {
		// GIVEN: A refused user name in English.
		await mockApi(page);
		const usersLoaded = page.waitForResponse((response) =>
			response.url().endsWith('/api/v1/users')
		);
		await page.goto('/');
		await usersLoaded;
		await page.getByLabel(t('en', 'users_name_label'), { exact: true }).fill('   ');
		await page.getByLabel(t('en', 'users_email_label'), { exact: true }).fill('a@example.com');
		await page.getByRole('button', { name: t('en', 'users_create_button') }).click();
		await expect(page.getByText(t('en', 'validation_name_required'))).toBeVisible();

		// WHEN: Spanish is chosen.
		await page.getByRole('combobox', { name: t('en', 'language_label') }).selectOption('es');

		// THEN: The same error is shown in Spanish, still describing the field.
		const name = page.getByLabel(t('es', 'users_name_label'), { exact: true });
		await expect(name).toHaveAccessibleDescription(t('es', 'validation_name_required'));
		await expect(name).toHaveAttribute('aria-invalid', 'true');
	});

	test('stores no language cookie on a first visit without choice (limit)', async ({
		page,
		context
	}) => {
		// GIVEN / WHEN: A first visit by a French browser that does not touch the switcher.
		await context.clearCookies();
		await mockApi(page);
		const usersLoaded = page.waitForResponse((response) =>
			response.url().endsWith('/api/v1/users')
		);
		await page.goto('/');
		await usersLoaded;
		await page.reload();

		// THEN: No cookie: the browser language keeps deciding until an explicit choice.
		expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(
			'PARAGLIDE_LOCALE'
		);
	});

	test.describe('with cookies refused', () => {
		test('still switches the page, then falls back to the browser language after a reload (sad path)', async ({
			page
		}) => {
			// GIVEN: A browser that refuses to store cookies, and a watch on page errors.
			await mockApi(page);
			await page.addInitScript(() => {
				Object.defineProperty(document, 'cookie', {
					configurable: true,
					get: () => '',
					set: () => {
						throw new DOMException('Cookies are disabled', 'SecurityError');
					}
				});
			});
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			// Svelte reports a failed hydration as a warning, then renders again on the client.
			page.on('console', (message) => {
				if (message.text().includes('hydrat')) errors.push(message.text());
			});
			const usersLoaded = page.waitForResponse((response) =>
				response.url().endsWith('/api/v1/users')
			);
			await page.goto('/');
			await usersLoaded;

			// THEN: The page hydrates without error.
			expect(errors).toEqual([]);

			// WHEN: German is chosen.
			await page.getByRole('combobox', { name: t('en', 'language_label') }).selectOption('de');

			// THEN: The page is German, without error.
			await expect(page.locator('html')).toHaveAttribute('lang', 'de');
			await expect(page.getByRole('heading', { level: 1 })).toContainText(t('de', 'home_heading'));
			expect(errors).toEqual([]);

			// WHEN: The page is reloaded.
			await page.reload();

			// THEN: Back to the browser language (en-US).
			await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		});
	});
});

test.describe('API calls and server errors', () => {
	test('sends the interface language to the API, before and after a switch (happy path)', async ({
		page
	}) => {
		// GIVEN: A record of the Accept-Language of the API calls.
		const api = await mockApi(page, { users: [ada] });
		const sent: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/api/v1/')) sent.push(request.headers()['accept-language'] ?? '');
		});
		const usersLoaded = page.waitForResponse((response) =>
			response.url().endsWith('/api/v1/users')
		);
		await page.goto('/');
		await usersLoaded;

		// WHEN: German is chosen, then a user is created.
		await page.getByRole('combobox', { name: t('en', 'language_label') }).selectOption('de');
		await page.getByLabel(t('de', 'users_name_label'), { exact: true }).fill('Grace');
		await page.getByLabel(t('de', 'users_email_label'), { exact: true }).fill('grace@example.com');
		const created = page.waitForResponse((response) => response.request().method() === 'POST');
		await page.getByRole('button', { name: t('de', 'users_create_button') }).click();
		await created;

		// THEN: The first call asked for English, the creation for German.
		expect(sent[0]).toBe('en');
		expect(sent.at(-1)).toBe('de');
		expect(api.users.map((user) => user.name)).toContain('Grace');
	});

	for (const locale of ['fr', 'de', 'es'] as const) {
		test(`shows a taken email in ${locale}, from its error code (happy path)`, async ({
			page,
			context
		}) => {
			// GIVEN: The interface in that language and a server that refuses the email.
			await chooseLocaleCookie(context, locale);
			const api = await mockApi(page);
			api.failNext('POST /users', {
				status: 409,
				error: 'Email already in use',
				code: 'EMAIL_TAKEN'
			});
			const usersLoaded = page.waitForResponse((response) =>
				response.url().endsWith('/api/v1/users')
			);
			await page.goto('/');
			await usersLoaded;

			// WHEN: A user is created.
			await page.getByLabel(t(locale, 'users_name_label'), { exact: true }).fill('Ada');
			await page
				.getByLabel(t(locale, 'users_email_label'), { exact: true })
				.fill('ada@example.com');
			await page.getByRole('button', { name: t(locale, 'users_create_button') }).click();

			// THEN: The toast speaks the interface language, not the English server text.
			await expect(page.getByRole('alert').getByText(t(locale, 'error_email_taken'))).toBeVisible();
			await expect(page.getByText('Email already in use')).toHaveCount(0);
		});
	}

	test('shows the server text for a code the interface does not know (sad path)', async ({
		page,
		context
	}) => {
		// GIVEN: A French interface and a code added by the server later.
		await chooseLocaleCookie(context, 'fr');
		const api = await mockApi(page);
		api.failNext('POST /users', { status: 429, error: 'Too many requests', code: 'RATE_LIMITED' });
		const usersLoaded = page.waitForResponse((response) =>
			response.url().endsWith('/api/v1/users')
		);
		await page.goto('/');
		await usersLoaded;

		// WHEN: A user is created.
		await page.getByLabel(t('fr', 'users_name_label'), { exact: true }).fill('Ada');
		await page.getByLabel(t('fr', 'users_email_label'), { exact: true }).fill('ada@example.com');
		await page.getByRole('button', { name: t('fr', 'users_create_button') }).click();

		// THEN: The server text is shown as is.
		await expect(page.getByRole('alert').getByText('Too many requests')).toBeVisible();
	});
});

test.describe('Reflow (WCAG 1.4.10)', () => {
	for (const width of [320, 640, 1280]) {
		for (const locale of LOCALES) {
			test(`keeps the switcher off the heading at ${width} px in ${locale} (boundary)`, async ({
				page,
				context
			}) => {
				// GIVEN: A narrow or zoomed window (640 px = 1280 px at 200 %).
				await page.setViewportSize({ width, height: 800 });
				await chooseLocaleCookie(context, locale);
				await mockApi(page, { users: [ada] });

				for (const path of ['/', '/stats']) {
					// WHEN: The page is shown.
					await page.goto(path);
					const switcher = page.getByRole('combobox');
					const heading = page.getByRole('heading', { level: 1 });
					await expect(heading).toBeVisible();

					// THEN: Switcher and heading do not overlap, and nothing scrolls sideways.
					const [switcherBox, headingBox] = [
						await switcher.boundingBox(),
						await heading.boundingBox()
					];
					expect(switcherBox && headingBox).toBeTruthy();
					if (switcherBox && headingBox) {
						const overlap =
							switcherBox.x < headingBox.x + headingBox.width &&
							headingBox.x < switcherBox.x + switcherBox.width &&
							switcherBox.y < headingBox.y + headingBox.height &&
							headingBox.y < switcherBox.y + switcherBox.height;
						expect(overlap, `${path}: switcher over the heading`).toBe(false);
						expect(switcherBox.x + switcherBox.width).toBeLessThanOrEqual(width);
					}
					const sideways = await page.evaluate(
						() => document.documentElement.scrollWidth - document.documentElement.clientWidth
					);
					expect(sideways, `${path}: horizontal scroll`).toBeLessThanOrEqual(0);
				}
			});
		}
	}
});

test.describe('Accessibility in every language (axe)', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	for (const locale of LOCALES) {
		test(`has no violation in ${locale}: tasks, form errors, toasts and statistics (happy path)`, async ({
			page,
			context
		}) => {
			// GIVEN: The interface in that language.
			await chooseLocaleCookie(context, locale);
			const api = await mockApi(page, { users: [ada, grace], tasks: adaTasks });

			// WHEN / THEN: Home with a selected user and tasks.
			await openHomeWithAda(page, locale);
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
			await expectNoViolations(page);

			// WHEN / THEN: A refused form, an error toast and an information toast.
			await page.getByLabel(t(locale, 'users_name_label'), { exact: true }).fill('   ');
			await page.getByLabel(t(locale, 'users_email_label'), { exact: true }).fill('a@example.com');
			await page.getByRole('button', { name: t(locale, 'users_create_button') }).click();
			api.failNext('PUT /tasks/{id}', { status: 500, error: 'x', code: 'DATABASE_UNAVAILABLE' });
			await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
			api.failNext('DELETE /tasks/{id}', { status: 404, error: 'x', code: 'TASK_NOT_FOUND' });
			await page
				.getByRole('button', { name: t(locale, 'tasks_delete_named', { title: 'Review 2' }) })
				.click();
			await expect(page.getByRole('alert').locator('[data-toast]')).toHaveCount(1);
			await expect(page.getByRole('status').locator('[data-toast]')).toHaveCount(1);
			await expectNoViolations(page);

			// WHEN / THEN: The statistics page.
			await page.goto('/stats');
			await expect(page.getByRole('heading', { name: t(locale, 'stats_heading') })).toBeVisible();
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
			await expectNoViolations(page);
		});
	}
});
