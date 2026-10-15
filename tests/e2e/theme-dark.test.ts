import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { announcement } from './support/announcement';
import { contrast } from './support/contrast';
import { text } from './support/locale';
import { ada, adaTasks, grace, mockApi } from './support/mock-api';
import { canvasLuminance, resolvedTheme, rgbOf } from './support/theme';

// The dark palette (THEME-R01, R05, R07, R09, R11): what the theme is is read from the colors the
// page really paints (resolved page gradient, system Canvas), never from a class or an attribute.
// The API is mocked; the page is the production build.

const ORIGIN = `http://localhost:${process.env.E2E_PORT || 4173}`;
const setTheme = (context: BrowserContext, value: string) =>
	context.addCookies([{ name: 'theme', value, url: ORIGIN }]);
const radio = (page: Page, key: 'light' | 'dark' | 'system') =>
	page.getByRole('radio', { name: text('en', `theme_${key}`), exact: true });

// Opens the home page once hydrated (the page asks the API only then).
async function openHome(page: Page, path = '/') {
	await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 1, tasks: 2 } });
	const hydrated = page.waitForResponse((response) => response.url().includes('/api/v1/'));
	await page.goto(path);
	await hydrated;
}

test.describe('Dark palette (mocked API)', () => {
	test('THEME-R01: System with a dark device opens in the dark theme, with System checked (happy path)', async ({
		browser
	}) => {
		const context = await browser.newContext({ colorScheme: 'dark' });
		const page = await context.newPage();
		await openHome(page);
		expect(await resolvedTheme(page)).toBe('dark');
		await expect(radio(page, 'system')).toBeChecked();
		await context.close();
	});

	for (const scheme of ['light', 'no-preference'] as const) {
		test(`THEME-R01: System with a ${scheme} device opens in the light theme (boundary)`, async ({
			browser
		}) => {
			const context = await browser.newContext({ colorScheme: scheme });
			const page = await context.newPage();
			await openHome(page);
			expect(await resolvedTheme(page)).toBe('light');
			await context.close();
		});
	}

	test('THEME-R05: with JavaScript off, a dark cookie on a light device paints dark at once (limit)', async ({
		browser,
		baseURL
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'light' });
		await setTheme(context, 'dark');
		const page = await context.newPage();
		await page.goto(`${baseURL}/`);
		expect(await resolvedTheme(page)).toBe('dark');
		await context.close();
	});

	test('THEME-R05: with JavaScript off and no cookie, a dark device paints dark and the page has no data-theme (limit)', async ({
		browser,
		baseURL
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'dark' });
		const page = await context.newPage();
		await page.goto(`${baseURL}/`);
		await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
		expect(await resolvedTheme(page)).toBe('dark');
		await context.close();
	});

	test('THEME-R05: scripts delayed, a dark cookie paints dark before they arrive; a choice kept only in localStorage does not (limit)', async ({
		browser,
		baseURL
	}) => {
		const firstPaint = async (setup: (context: BrowserContext) => Promise<void>, init?: string) => {
			const context = await browser.newContext({ colorScheme: 'light' });
			await setup(context);
			const page = await context.newPage();
			if (init) await page.addInitScript(init);
			await mockApi(page, { users: [ada], tasks: adaTasks });
			await page.route('**/_app/**', async (route) => {
				await new Promise((done) => setTimeout(done, 1500));
				await route.continue();
			});
			// The document is there, the scripts are not: nothing but the server's HTML paints.
			await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
			const theme = await resolvedTheme(page);
			await context.close();
			return theme;
		};
		expect(await firstPaint((context) => setTheme(context, 'dark'))).toBe('dark');
		expect(
			await firstPaint(
				async () => {},
				"try { localStorage.setItem('theme', 'dark'); } catch (error) { void error; }"
			)
		).toBe('light');
	});

	test('THEME-R05: the 404 page is dark when Dark is chosen (boundary)', async ({ page }) => {
		await openHome(page);
		await radio(page, 'dark').locator('xpath=..').click();
		await expect(radio(page, 'dark')).toBeChecked();
		const response = await page.goto('/does-not-exist');
		expect(response?.status()).toBe(404);
		expect(await resolvedTheme(page)).toBe('dark');
	});

	test('THEME-R07: System follows the device while the page is open, with no reload and no announcement; Light does not (happy path)', async ({
		browser
	}) => {
		const context = await browser.newContext({ colorScheme: 'light' });
		const page = await context.newPage();
		await openHome(page);
		expect(await resolvedTheme(page)).toBe('light');
		await page.evaluate(() => {
			document.body.dataset.proof = 'same-document';
		});
		const announced = await announcement(page).textContent();

		await page.emulateMedia({ colorScheme: 'dark' });
		expect(await resolvedTheme(page)).toBe('dark');
		expect(await page.evaluate(() => document.body.dataset.proof)).toBe('same-document');
		expect(await announcement(page).textContent()).toBe(announced);
		await page.emulateMedia({ colorScheme: 'light' });
		expect(await resolvedTheme(page)).toBe('light');

		// Light chosen: a device that turns dark changes nothing.
		await radio(page, 'light').locator('xpath=..').click();
		await expect(radio(page, 'light')).toBeChecked();
		await page.emulateMedia({ colorScheme: 'dark' });
		expect(await resolvedTheme(page)).toBe('light');
		await context.close();
	});

	test('THEME-R09: the native controls follow the theme, by color-scheme (happy path)', async ({
		browser
	}) => {
		const context = await browser.newContext({ colorScheme: 'dark' });
		const page = await context.newPage();
		await openHome(page);
		const schemeOf = (selector: string) =>
			page.locator(selector).evaluate((element) => getComputedStyle(element).colorScheme);

		// System, dark device: both schemes are offered, and the system Canvas the controls paint with
		// is dark. (The computed value is `light dark`; the one in use shows in Canvas.)
		expect(await schemeOf('html')).toBe('light dark');
		expect(await schemeOf('#language')).toBe('light dark');
		expect(await canvasLuminance(page)).toBeLessThan(0.1);

		await radio(page, 'light').locator('xpath=..').click();
		await expect(radio(page, 'light')).toBeChecked();
		expect(await schemeOf('html')).toBe('light');
		expect(await schemeOf('#language')).toBe('light');
		expect(await canvasLuminance(page)).toBeGreaterThan(0.9);

		await radio(page, 'dark').locator('xpath=..').click();
		await expect(radio(page, 'dark')).toBeChecked();
		expect(await schemeOf('html')).toBe('dark');
		expect(await schemeOf('#language')).toBe('dark');
		expect(await canvasLuminance(page)).toBeLessThan(0.1);
		await context.close();
	});
});

const ringColors = (boxShadow: string) =>
	[...boxShadow.matchAll(/((?:rgba?|oklch|oklab|color)\([^)]*\))\s+0px 0px 0px 1px/g)].map(
		(match) => match[1]!
	);

test.describe('Unchecked box (mocked API)', () => {
	// WCAG 1.4.11: the border of a control reaches 3:1 against what it sits on. The browser draws the
	// border of a native box in a gray of its own, 2.79:1 on the dark muted row (measured), so a ring in
	// the `control-edge` token is added in the dark theme; in the light one the native border already
	// reaches 4.13:1 and the ring is transparent (the light theme does not change).
	test('THEME-R08: in the dark theme the box of an undone task has a ring of 3:1 on its row at rest and under the pointer (boundary)', async ({
		browser
	}) => {
		const context = await browser.newContext({ colorScheme: 'dark' });
		const page = await context.newPage();
		await openHome(page);
		await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
		await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();
		const box = page.getByRole('checkbox', { name: 'Review', exact: true }).first();
		const ring = await box.evaluate((element) => getComputedStyle(element).boxShadow);
		// A computed box-shadow lists every layer of Tailwind's shadow, the color first in each: the
		// ring is the layer with a 1px spread.
		const color = ringColors(ring).at(-1);
		expect(color, `box-shadow: ${ring}`).toBeDefined();
		const edge = await rgbOf(page, color!);
		for (const row of ['var(--color-surface-muted)', 'var(--color-surface-hover)']) {
			expect(contrast(edge, await rgbOf(page, row)), row).toBeGreaterThanOrEqual(3);
		}
		await context.close();
	});

	test('THEME-R08: in the light theme the ring is transparent, so nothing is added (boundary)', async ({
		browser
	}) => {
		const context = await browser.newContext({ colorScheme: 'light' });
		const page = await context.newPage();
		await openHome(page);
		await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
		await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();
		const ring = await page
			.getByRole('checkbox', { name: 'Review', exact: true })
			.first()
			.evaluate((element) => getComputedStyle(element).boxShadow);
		const painted = ringColors(ring).filter((color) => !/, 0\)$|\/ 0\)$/.test(color));
		expect(painted, ring).toEqual([]);
		await context.close();
	});
});

test.describe('Row under the pointer (mocked API)', () => {
	// WCAG 1.4.3: the text of a row reaches 4.5:1 on the row's hover color, in the dark theme too:
	// "Edit" (action-strong, blue-300) was 4.17:1 on the first dark hover color (gray-600).
	test('THEME-R08: in the dark theme every text of a task row and of a user row reaches 4.5:1 under the pointer (limit)', async ({
		browser
	}) => {
		const context = await browser.newContext({ colorScheme: 'dark' });
		const page = await context.newPage();
		await mockApi(page, { users: [ada, grace], tasks: adaTasks });
		const hydrated = page.waitForResponse((response) => response.url().includes('/api/v1/'));
		await page.goto('/');
		await hydrated;
		await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
		await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();
		const rows = [
			page.locator('li', { has: page.getByRole('checkbox', { name: 'Review', exact: true }) }),
			page.locator('li', { has: page.getByRole('button', { name: /^Grace Hopper/ }) })
		];
		for (const row of rows) {
			await row.hover();
			const texts = await row.evaluate((element) => {
				const fill = getComputedStyle(element).backgroundColor;
				const found: { text: string; color: string }[] = [];
				for (const node of element.querySelectorAll('*')) {
					const own = [...node.childNodes].some(
						(child) => child.nodeType === Node.TEXT_NODE && child.textContent!.trim() !== ''
					);
					if (own) {
						found.push({
							text: node.textContent.trim().slice(0, 30),
							color: getComputedStyle(node).color
						});
					}
				}
				return { fill, found };
			});
			expect(texts.found.length).toBeGreaterThan(1);
			const fill = await rgbOf(page, texts.fill);
			for (const { text: label, color } of texts.found) {
				expect(contrast(await rgbOf(page, color), fill), label).toBeGreaterThanOrEqual(4.5);
			}
		}
		await context.close();
	});
});

test.describe('Print (mocked API)', () => {
	for (const device of ['light', 'dark'] as const) {
		test(`THEME-R11: with Dark chosen on a ${device} device, a printed page is light, readable on white, and has no selector (happy path)`, async ({
			browser
		}) => {
			const context = await browser.newContext({ colorScheme: device });
			await setTheme(context, 'dark');
			const page = await context.newPage();
			await openHome(page);
			await radio(page, 'dark').locator('xpath=..').click();
			await expect(radio(page, 'dark')).toBeChecked();
			await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
			await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();

			await page.emulateMedia({ media: 'print' });

			expect(await resolvedTheme(page)).toBe('light');
			await expect(page.locator('#language')).toBeHidden();
			await expect(page.getByRole('radiogroup')).toBeHidden();
			// Every visible text reaches 4.5:1 against its background, white when it has none.
			const texts = await page.evaluate(() => {
				const context = document
					.createElement('canvas')
					.getContext('2d', { willReadFrequently: true })!;
				const rgb = (css: string): [number, number, number] => {
					context.fillStyle = '#000';
					context.fillStyle = css;
					context.fillRect(0, 0, 1, 1);
					const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
					return [red!, green!, blue!];
				};
				const found: {
					text: string;
					color: [number, number, number];
					fill: [number, number, number];
				}[] = [];
				for (const element of document.querySelectorAll('main *')) {
					const own = [...element.childNodes].some(
						(node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== ''
					);
					const box = element.getBoundingClientRect();
					if (!own || box.width === 0 || box.height === 0) continue;
					const style = getComputedStyle(element);
					if (style.visibility === 'hidden' || style.display === 'none') continue;
					// Against what it sits on: its own fill (a primary button) or else the white page.
					let fill: [number, number, number] = [255, 255, 255];
					for (let node: Element | null = element; node; node = node.parentElement) {
						context.clearRect(0, 0, 1, 1);
						context.fillStyle = '#000';
						context.fillStyle = getComputedStyle(node).backgroundColor;
						context.fillRect(0, 0, 1, 1);
						const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
						if (alpha === 255) {
							fill = [red!, green!, blue!];
							break;
						}
					}
					found.push({
						text: element.textContent.trim().slice(0, 30),
						color: rgb(style.color),
						fill
					});
				}
				return found;
			});
			expect(texts.length).toBeGreaterThan(5);
			for (const { text: label, color, fill } of texts) {
				expect(contrast(color, fill), label).toBeGreaterThanOrEqual(4.5);
			}
			await context.close();
		});
	}
});
