import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectSilent, announcement } from './support/announcement';
import { horizontalOverflow } from './support/layout';
import { LOCALES, setLocaleCookie, text, type Locale } from './support/locale';
import { ada, adaTasks, mockApi } from './support/mock-api';

// The theme selector and its cookie (THEME-R01 to R07, brick 2). No dark palette exists yet: the
// theme is proved by the `data-theme` attribute of <html>, the checked radio and the cookie, never
// by a color. What needs a dark background (criteria 1, 12 and 13 background, 15, 16 to 21
// background, 23 background, 25) is proved by brick 3. The API is mocked; the page is the build.

const PORT = process.env.E2E_PORT || 4173;
const ORIGIN = `http://localhost:${PORT}`;
const MARKER = 'xss-marker-7f3a';

const themeCookie = (value: string) => ({ name: 'theme', value, url: ORIGIN });
const setTheme = (context: BrowserContext, value: string) =>
	context.addCookies([themeCookie(value)]);
const themeOf = (page: Page) =>
	page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const radio = (page: Page, locale: Locale, key: 'light' | 'dark' | 'system') =>
	page.getByRole('radio', { name: text(locale, `theme_${key}`), exact: true });
// The radio is visually hidden: a user clicks its label (the square with the icon).
const pick = (page: Page, locale: Locale, key: 'light' | 'dark' | 'system') =>
	radio(page, locale, key).locator('xpath=..').click();
const group = (page: Page, locale: Locale) =>
	page.getByRole('radiogroup', { name: text(locale, 'theme_label') });

async function openHome(page: Page, path = '/') {
	await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 1, tasks: 2 } });
	// The page asks the API once it is hydrated: only then does a click reach the application.
	const hydrated = page.waitForResponse((response) => response.url().includes('/api/v1/'));
	await page.goto(path);
	await hydrated;
	await expect(page.getByRole('radiogroup')).toBeVisible();
}

// Hydration is done when the page reacts: a click on a radio is only applied once it is.
async function chooseTheme(page: Page, locale: Locale, key: 'light' | 'dark' | 'system') {
	await pick(page, locale, key);
	await expect(radio(page, locale, key)).toBeChecked();
}

test.describe('Theme selector (mocked API)', () => {
	test('THEME-R02: the group follows the language selector, with three named radios and hidden icons, on both pages in four languages (happy path)', async ({
		page,
		context
	}) => {
		for (const locale of LOCALES) {
			await setLocaleCookie(context, locale);
			for (const path of ['/', '/stats']) {
				await openHome(page, path);
				const themeGroup = group(page, locale);
				await expect(themeGroup).toBeVisible();
				await expect(themeGroup.getByRole('radio')).toHaveCount(3);
				for (const key of ['light', 'dark', 'system'] as const) {
					await expect(radio(page, locale, key)).toBeAttached();
				}
				// The selector comes after the language list in the document and on the screen.
				const order = await page.evaluate(() => {
					const language = document.querySelector('#language')!;
					const themeGroup = document.querySelector('[role="radiogroup"]')!;
					return {
						inDocument: !!(
							language.compareDocumentPosition(themeGroup) & Node.DOCUMENT_POSITION_FOLLOWING
						),
						decorative: [...themeGroup.querySelectorAll('svg')].every(
							(svg) => svg.getAttribute('aria-hidden') === 'true'
						)
					};
				});
				expect(order).toEqual({ inDocument: true, decorative: true });
				await expect(radio(page, locale, 'system')).toBeChecked();
			}
		}
	});

	test('THEME-R02: Tab enters the group on the checked radio, arrows move and choose, Tab leaves (boundary)', async ({
		page
	}) => {
		await openHome(page);
		await page.locator('#language').focus();
		await page.keyboard.press('Tab');
		await expect(radio(page, 'en', 'system')).toBeFocused();

		await page.keyboard.press('ArrowLeft');
		await expect(radio(page, 'en', 'dark')).toBeFocused();
		await expect(radio(page, 'en', 'dark')).toBeChecked();
		expect(await themeOf(page)).toBe('dark');

		await page.keyboard.press('Tab');
		const stillInGroup = await page.evaluate(
			() => !!document.activeElement?.closest('[role="radiogroup"]')
		);
		expect(stillInGroup).toBe(false);
	});

	test('THEME-R03: choosing Dark changes the page at once, with no reload, input, scroll and focus kept, and no announcement (happy path)', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1280, height: 500 });
		await openHome(page);
		await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
		await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();
		const title = page.getByLabel(text('en', 'tasks_title_label'));
		await title.fill('Draft in progress');
		await page.evaluate(() => {
			document.body.dataset.proof = 'same-document';
			window.scrollTo(0, 10);
		});
		const scrollBefore = await page.evaluate(() => window.scrollY);
		const announcedBefore = await announcement(page).textContent();

		// Scrolled by 10 px, the selector is still whole on screen: the click scrolls nothing.
		await pick(page, 'en', 'dark');

		await expect(radio(page, 'en', 'dark')).toBeChecked();
		expect(await themeOf(page)).toBe('dark');
		expect(await page.evaluate(() => document.body.dataset.proof)).toBe('same-document');
		await expect(title).toHaveValue('Draft in progress');
		expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
		await expect(radio(page, 'en', 'dark')).toBeFocused();
		expect(await announcement(page).textContent()).toBe(announcedBefore);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
	});

	test('THEME-R03: the language and the theme do not change each other (boundary)', async ({
		page
	}) => {
		await openHome(page);
		await chooseTheme(page, 'en', 'dark');
		await page.locator('#language').selectOption('fr');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		expect(await themeOf(page)).toBe('dark');
		await expect(radio(page, 'fr', 'dark')).toBeChecked();

		await chooseTheme(page, 'fr', 'light');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		expect(await themeOf(page)).toBe('light');
	});

	for (const [choice, device] of [
		['dark', 'light'],
		['light', 'dark']
	] as const) {
		test(`THEME-R04: ${choice} is kept after a reload and in a new tab, on a ${device} device (happy path)`, async ({
			browser
		}) => {
			const context = await browser.newContext({ colorScheme: device });
			const page = await context.newPage();
			await openHome(page);
			await chooseTheme(page, 'en', choice);

			await page.reload();
			expect(await themeOf(page)).toBe(choice);
			await expect(radio(page, 'en', choice)).toBeChecked();

			const other = await context.newPage();
			await openHome(other);
			expect(await themeOf(other)).toBe(choice);
			await expect(radio(other, 'en', choice)).toBeChecked();
			await context.close();
		});
	}

	test('THEME-R04: the cookie has the intended attributes (happy path)', async ({
		page,
		context
	}) => {
		await openHome(page);
		await chooseTheme(page, 'en', 'dark');
		const cookie = (await context.cookies()).find((c) => c.name === 'theme');
		expect(cookie).toBeDefined();
		expect(cookie).toMatchObject({
			value: 'dark',
			path: '/',
			sameSite: 'Lax',
			httpOnly: false,
			secure: false,
			domain: 'localhost'
		});
		const year = 365 * 24 * 3600;
		const remaining = cookie!.expires - Date.now() / 1000;
		expect(remaining).toBeGreaterThan(year - 3600);
		expect(remaining).toBeLessThan(year + 3600);
	});

	test('THEME-R04: choosing System removes the cookie and the page follows the device again (boundary)', async ({
		page,
		context
	}) => {
		await setTheme(context, 'dark');
		await openHome(page);
		await expect(radio(page, 'en', 'dark')).toBeChecked();
		await chooseTheme(page, 'en', 'system');
		expect(await themeOf(page)).toBeNull();
		expect((await context.cookies()).filter((c) => c.name === 'theme')).toEqual([]);

		await page.reload();
		expect(await themeOf(page)).toBeNull();
		await expect(radio(page, 'en', 'system')).toBeChecked();
	});

	test('THEME-R04: opening and reloading without a choice writes no cookie, no storage key and no Set-Cookie (limit)', async ({
		page,
		context
	}) => {
		const setCookies: string[] = [];
		page.on('response', (response) => {
			void response.headerValue('set-cookie').then((value) => {
				if (value) setCookies.push(value);
			});
		});
		await openHome(page);
		await page.reload();
		await expect(radio(page, 'en', 'system')).toBeChecked();
		await page.waitForLoadState('networkidle');

		expect((await context.cookies()).filter((c) => c.name === 'theme')).toEqual([]);
		const keys = await page.evaluate(() => [
			...Object.keys(localStorage),
			...Object.keys(sessionStorage)
		]);
		expect(keys.filter((key) => /theme/i.test(key))).toEqual([]);
		expect(setCookies.filter((value) => /theme/i.test(value))).toEqual([]);
	});

	for (const [name, script] of [
		['ignored', "Object.defineProperty(document, 'cookie', { get: () => '', set: () => {} });"],
		[
			'throwing',
			"Object.defineProperty(document, 'cookie', { get: () => '', set: () => { throw new DOMException('denied', 'SecurityError'); } });"
		]
	] as const) {
		test(`THEME-R04: with cookie writes ${name}, Dark still applies, silently, and a reload is System (limit)`, async ({
			page
		}) => {
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.addInitScript(script);
			await openHome(page);

			await chooseTheme(page, 'en', 'dark');
			expect(await themeOf(page)).toBe('dark');
			await expect(page.locator('[data-toast]')).toHaveCount(0);
			expect(errors).toEqual([]);

			await page.reload();
			expect(await themeOf(page)).toBeNull();
			await expect(radio(page, 'en', 'system')).toBeChecked();
		});
	}

	test('THEME-R04: the cookie is never sent to the API (limit)', async ({ page, context }) => {
		await setTheme(context, 'dark');
		const apiRequests: { url: string; cookie: string | undefined }[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/api/v1/')) {
				apiRequests.push({ url: request.url(), cookie: request.headers()['cookie'] });
			}
		});
		await openHome(page);
		await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
		await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();
		expect(apiRequests.length).toBeGreaterThan(0);
		expect(apiRequests.filter((request) => request.cookie !== undefined)).toEqual([]);
	});
});

// THEME-R06: the table of hostile values. Whatever the cookie holds, the page is 200, in System,
// the value is never in the HTML, and the page has as many scripts as without a cookie.
const HOSTILE: [string, string][] = [
	['a capital', 'Dark'],
	['all capitals', 'DARK'],
	['a capital light', 'Light'],
	['all capitals light', 'LIGHT'],
	['an empty value', ''],
	['4 KB', 'a'.repeat(4000)],
	['a broken encoding', '%E0%A4%A'],
	['__proto__', '__proto__'],
	['constructor', 'constructor'],
	['toString', 'toString'],
	['unicode', 'dárk'],
	['a script', `"><script>${MARKER}</script>`]
];
const scriptCount = (html: string) => (html.match(/<script\b/g) ?? []).length;

test.describe('Theme cookie, hostile values (production build)', () => {
	test('THEME-R06: each hostile cookie gives a 200 page in System, without the value, with the same scripts (limit)', async ({
		request
	}) => {
		const baseline = scriptCount(await (await request.get('/')).text());
		const headers: [string, string][] = [
			...HOSTILE.map(([name, value]): [string, string] => [name, `theme=${value}`]),
			['a space after dark', 'theme=dark ; a=1'],
			['two cookies', 'theme=dark; theme=light']
		];
		for (const [name, header] of headers) {
			const response = await request.get('/', { headers: { Cookie: header } });
			const html = await response.text();
			expect(response.status(), name).toBe(200);
			expect(html, name).not.toContain('data-theme');
			expect(html, name).not.toContain(MARKER);
			expect(scriptCount(html), name).toBe(baseline);
			expect(html, name).toMatch(
				/<input[^>]*value="system"[^>]*checked|<input[^>]*checked[^>]*value="system"/
			);
		}
	});

	test('THEME-R06: the browser opens each hostile cookie in System, with a quiet console (limit)', async ({
		browser
	}) => {
		for (const [name, value] of HOSTILE) {
			const context = await browser.newContext();
			const page = await context.newPage();
			const problems: string[] = [];
			page.on('console', (message) => {
				if (message.type() === 'error') problems.push(message.text());
			});
			page.on('pageerror', (error) => problems.push(error.message));
			try {
				await context.addCookies([themeCookie(value)]);
			} catch {
				// The browser refuses to store it: nothing to send, so nothing to prove.
				await context.close();
				continue;
			}
			await mockApi(page, { users: [ada], tasks: adaTasks });
			const response = await page.goto('/');
			expect(response?.status(), name).toBe(200);
			await expect(radio(page, 'en', 'system'), name).toBeChecked();
			expect(await themeOf(page), name).toBeNull();
			expect(await page.content(), name).not.toContain(MARKER);
			expect(
				problems.filter((p) => !p.includes('59999')),
				name
			).toEqual([]);
			await context.close();
		}
	});
});

test.describe('First render (production build)', () => {
	test('THEME-R05: the HTML itself carries data-theme and the checked radio of the cookie (happy path)', async ({
		request
	}) => {
		for (const choice of ['dark', 'light'] as const) {
			const html = await (
				await request.get('/', { headers: { Cookie: `theme=${choice}` } })
			).text();
			expect(html).toMatch(new RegExp(`<html lang="en" data-theme="${choice}">`));
			const checked = [...html.matchAll(/<input[^>]*name="theme"[^>]*>/g)]
				.map((match) => match[0])
				.filter((tag) => /\bchecked\b/.test(tag));
			expect(checked).toHaveLength(1);
			expect(checked[0]).toContain(`value="${choice}"`);
		}
	});

	test('THEME-R05: without a cookie the HTML has no data-theme and System is checked (boundary)', async ({
		request
	}) => {
		const html = await (await request.get('/')).text();
		expect(html).toContain('<html lang="en">');
		expect(html).not.toContain('data-theme');
		expect(html).toMatch(
			/<input[^>]*value="system"[^>]*checked|<input[^>]*checked[^>]*value="system"/
		);
	});

	test('THEME-R05: the 404 page follows the choice too (boundary)', async ({ request }) => {
		const response = await request.get('/does-not-exist', { headers: { Cookie: 'theme=dark' } });
		expect(response.status()).toBe(404);
		expect(await response.text()).toContain(' data-theme="dark"');
	});

	test('THEME-R05: with JavaScript off the server still writes the theme and checks the radio (limit)', async ({
		browser,
		baseURL
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'dark' });
		const page = await context.newPage();
		await page.goto(`${baseURL}/`);
		await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
		await expect(radio(page, 'en', 'system')).toBeChecked();

		await context.addCookies([themeCookie('dark')]);
		await page.goto(`${baseURL}/`);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(radio(page, 'en', 'dark')).toBeChecked();
		await context.close();
	});

	test('THEME-R05: hydration never touches data-theme, even with the scripts delayed (limit)', async ({
		browser
	}) => {
		const observe = `
			window.__themeMutations = [];
			new MutationObserver((records) => {
				for (const record of records) {
					if (record.attributeName === 'data-theme') window.__themeMutations.push(record.target.nodeName);
				}
			}).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] });`;
		const run = async (setup: (context: BrowserContext) => Promise<void>, init?: string) => {
			const context = await browser.newContext();
			await setup(context);
			const page = await context.newPage();
			await page.addInitScript(observe);
			if (init) await page.addInitScript(init);
			await mockApi(page, { users: [ada], tasks: adaTasks });
			await page.route('**/_app/**', async (route) => {
				await new Promise((done) => setTimeout(done, 1200));
				await route.continue();
			});
			await page.goto('/');
			await radio(page, 'en', 'dark')
				.or(radio(page, 'en', 'system'))
				.first()
				.waitFor();
			// Hydrated: the user list answers a click.
			await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
			await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();
			const result = {
				mutations: await page.evaluate(
					() => (window as never as { __themeMutations: string[] }).__themeMutations
				),
				theme: await themeOf(page)
			};
			await context.close();
			return result;
		};

		// WITH the cookie: dark from the first byte, and no mutation of the attribute.
		expect(await run((context) => setTheme(context, 'dark'))).toEqual({
			mutations: [],
			theme: 'dark'
		});
		// Negative witness: a choice kept only in localStorage is not read, the page stays in System.
		expect(
			await run(
				async () => {},
				"try { localStorage.setItem('theme', 'dark'); } catch (error) { void error; }"
			)
		).toEqual({ mutations: [], theme: null });
	});
});

test.describe('Content-Security-Policy (production build)', () => {
	test('THEME-R06: the cookie adds no script, no style and no style attribute to the page (limit)', async ({
		request
	}) => {
		const plain = await (await request.get('/')).text();
		const themed = await (await request.get('/', { headers: { Cookie: 'theme=dark' } })).text();
		const inline = (html: string) => [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
		expect(inline(themed)).toHaveLength(inline(plain).length);
		for (const html of [plain, themed]) {
			expect(html).not.toMatch(/<style\b/);
			expect(html).not.toMatch(/\sstyle="/);
			for (const tag of inline(html).filter((tag) => !/\bsrc=/.test(tag))) {
				expect(tag).toMatch(/\snonce="[^"]+"/);
			}
		}
	});

	test('THEME-R06: no policy violation at the first load in Dark nor during three changes (limit)', async ({
		page,
		context
	}) => {
		await setTheme(context, 'dark');
		const messages: string[] = [];
		page.on('console', (message) => messages.push(message.text()));
		await page.addInitScript(() => {
			(window as never as { __violations: string[] }).__violations = [];
			document.addEventListener('securitypolicyviolation', (event) =>
				(window as never as { __violations: string[] }).__violations.push(event.violatedDirective)
			);
		});
		await openHome(page);
		await chooseTheme(page, 'en', 'light');
		await chooseTheme(page, 'en', 'system');
		await chooseTheme(page, 'en', 'dark');
		expect(
			await page.evaluate(() => (window as never as { __violations: string[] }).__violations)
		).toEqual([]);
		expect(messages.filter((m) => /content security policy|refused to/i.test(m))).toEqual([]);
		await expectSilent(page);
	});
});

test.describe('Narrow screen (production build)', () => {
	test('THEME-R02: at 320 px the two selectors fit without sideways scroll, in four languages, with targets of 24 px or more (limit)', async ({
		page,
		context
	}) => {
		await page.setViewportSize({ width: 320, height: 700 });
		for (const locale of LOCALES) {
			await setLocaleCookie(context, locale);
			for (const path of ['/', '/stats']) {
				await openHome(page, path);
				expect(await horizontalOverflow(page), `${locale} ${path}`).toBeLessThanOrEqual(0);
				await expect(page.locator('#language')).toBeVisible();
				await expect(group(page, locale)).toBeVisible();
				for (const key of ['light', 'dark', 'system'] as const) {
					const box = await radio(page, locale, key).locator('xpath=..').boundingBox();
					expect(box?.width ?? 0, `${locale} ${key}`).toBeGreaterThanOrEqual(24);
					expect(box?.height ?? 0, `${locale} ${key}`).toBeGreaterThanOrEqual(24);
				}
			}
		}
	});
});

test.describe('Forced colors (production build)', () => {
	test.skip(
		({ browserName }) => browserName !== 'chromium',
		'forced-colors is emulated on Chromium only (Firefox and WebKit have no emulation)'
	);

	for (const device of ['light', 'dark'] as const) {
		test(`THEME-R10: with forced colors on a ${device} device, the active position differs from the two others by more than its fill (limit)`, async ({
			browser
		}) => {
			const context = await browser.newContext({ forcedColors: 'active', colorScheme: device });
			const page = await context.newPage();
			await openHome(page);
			await chooseTheme(page, 'en', 'dark');

			const styleOf = (key: 'light' | 'dark' | 'system') =>
				radio(page, 'en', key)
					.locator('xpath=..')
					.evaluate((label) => {
						const style = getComputedStyle(label);
						return {
							width: style.borderTopWidth,
							color: style.borderTopColor,
							fill: style.backgroundColor
						};
					});
			const [light, dark, system] = [
				await styleOf('light'),
				await styleOf('dark'),
				await styleOf('system')
			];
			// The two others look alike, and the active one differs from them by its border (width or
			// color), not by its fill alone, which forced colors may flatten.
			expect(light).toEqual(system);
			expect(dark.width !== light.width || dark.color !== light.color).toBe(true);
			expect(dark.fill).not.toBe(light.fill);
			await context.close();
		});
	}
});
