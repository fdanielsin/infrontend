import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { contrast, type Rgb } from './support/contrast';
import { ada, adaTasks, grace, mockApi } from './support/mock-api';
import { rgbOf } from './support/theme';

// THEME-R08 and THEME-R10, criteria 17 and 19: the focus ring of every stop of the keyboard is seen in
// the dark theme (3:1 against the page and against the element), and forced colors give a readable
// page in both schemes. The API is mocked; the page is the production build.

const ORIGIN = `http://localhost:${process.env.E2E_PORT || 4173}`;
const setTheme = (context: BrowserContext, value: 'light' | 'dark') =>
	context.addCookies([{ name: 'theme', value, url: ORIGIN }]);

// The page with a user selected (rows, form, checkboxes) and an error toast (its buttons), the way a
// person sees it.
async function openBusyHome(page: Page) {
	const api = await mockApi(page, { users: [ada, grace], tasks: adaTasks });
	const hydrated = page.waitForResponse((response) => response.url().includes('/api/v1/'));
	await page.goto('/');
	await hydrated;
	await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
	await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();
	api.failNext('PUT /tasks/{id}', {
		status: 500,
		error: 'Database unavailable',
		requestId: 'req-1'
	});
	await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
	await page.locator('[data-toast]').first().waitFor();
}

interface Stop {
	label: string;
	ring: Rgb | null;
	width: number;
	page: Rgb[];
	element: Rgb | null;
}

// What the focused element looks like: its ring (the outline of the element, or of its label for a
// visually hidden input) and what the ring is drawn against (the nearest fill around it, the two ends
// of the gradient when that is the page, and the element's own fill when it has one).
const focusedStop = (page: Page): Promise<Stop> =>
	page.evaluate(() => {
		const context = document
			.createElement('canvas')
			.getContext('2d', { willReadFrequently: true })!;
		const paint = (css: string): [number, number, number, number] => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = '#000';
			context.fillStyle = css;
			context.fillRect(0, 0, 1, 1);
			const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
			return [red!, green!, blue!, alpha!];
		};
		const token = (name: string) => {
			const probe = document.createElement('div');
			probe.style.setProperty('background-color', `var(${name})`);
			document.body.append(probe);
			const color = getComputedStyle(probe).backgroundColor;
			probe.remove();
			return paint(color).slice(0, 3) as [number, number, number];
		};
		const active = document.activeElement as HTMLElement;
		const ringOwner = [active, active.closest('label')].find(
			(element) => element && getComputedStyle(element).outlineStyle !== 'none'
		);
		const ring = ringOwner
			? (paint(getComputedStyle(ringOwner).outlineColor).slice(0, 3) as [number, number, number])
			: null;
		const fillAround: [number, number, number][] = [];
		for (
			let node = ringOwner?.parentElement ?? active.parentElement;
			node;
			node = node.parentElement
		) {
			const style = getComputedStyle(node);
			if (style.backgroundImage.includes('gradient')) {
				fillAround.push(token('--color-page-from'), token('--color-page-to'));
				break;
			}
			const [red, green, blue, alpha] = paint(style.backgroundColor);
			if (alpha === 255) {
				fillAround.push([red, green, blue]);
				break;
			}
		}
		const own = paint(getComputedStyle(ringOwner ?? active).backgroundColor);
		return {
			label: `${active.tagName.toLowerCase()} "${(active.getAttribute('aria-label') ?? active.textContent ?? '').trim().slice(0, 30)}"`,
			ring,
			width: ringOwner ? parseFloat(getComputedStyle(ringOwner).outlineWidth) : 0,
			page: fillAround,
			element: own[3] === 255 ? ([own[0], own[1], own[2]] as [number, number, number]) : null
		};
	});

test.describe('Keyboard focus in the dark theme (mocked API)', () => {
	test('THEME-R08: every stop of the keyboard has a ring of 3:1 against its surroundings and its own fill, on a dark choice and on a dark device (happy path)', async ({
		browser
	}) => {
		for (const choice of ['cookie', 'device'] as const) {
			const context = await browser.newContext({
				colorScheme: choice === 'device' ? 'dark' : 'light'
			});
			if (choice === 'cookie') await setTheme(context, 'dark');
			const page = await context.newPage();
			await openBusyHome(page);
			await page.locator('body').click({ position: { x: 1, y: 1 } });

			const problems: string[] = [];
			let stops = 0;
			for (let index = 0; index < 90; index++) {
				await page.keyboard.press('Tab');
				const stop = await focusedStop(page);
				// The cycle is over when the focus leaves the page (to its browser, shown as the body).
				if (stop.label.startsWith('body')) break;
				stops++;
				if (!stop.ring || stop.width <= 0) {
					problems.push(`${choice}: no focus ring on ${stop.label}`);
					continue;
				}
				for (const around of stop.page) {
					const ratio = contrast(stop.ring, around);
					if (ratio < 3) {
						problems.push(
							`${choice}: ring on ${stop.label} is ${ratio.toFixed(2)}:1 on its surroundings`
						);
					}
				}
				if (stop.element) {
					const ratio = contrast(stop.ring, stop.element);
					if (ratio < 3) {
						problems.push(
							`${choice}: ring on ${stop.label} is ${ratio.toFixed(2)}:1 on its own fill`
						);
					}
				}
			}
			// The page has dozens of stops (skip link, language, theme, forms, rows, toast buttons).
			expect(stops, choice).toBeGreaterThan(15);
			expect(problems).toEqual([]);
			await context.close();
		}
	});
});

test.describe('Forced colors (mocked API)', () => {
	test.skip(
		({ browserName }) => browserName !== 'chromium',
		'forced-colors is emulated on Chromium only (Firefox and WebKit have no emulation)'
	);

	for (const device of ['light', 'dark'] as const) {
		test(`THEME-R10: on a ${device} device with forced colors, text, field borders and the focus ring are seen on the header, a toast and the user list (limit)`, async ({
			browser
		}) => {
			const context = await browser.newContext({ forcedColors: 'active', colorScheme: device });
			const page = await context.newPage();
			await openBusyHome(page);
			const canvas = await rgbOf(page, 'Canvas');

			const measured = await page.evaluate(() => {
				const context = document
					.createElement('canvas')
					.getContext('2d', { willReadFrequently: true })!;
				const paint = (css: string): [number, number, number, number] => {
					context.clearRect(0, 0, 1, 1);
					context.fillStyle = '#000';
					context.fillStyle = css;
					context.fillRect(0, 0, 1, 1);
					const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
					return [red!, green!, blue!, alpha!];
				};
				const fillOf = (element: Element): [number, number, number] | null => {
					for (let node: Element | null = element; node; node = node.parentElement) {
						const [red, green, blue, alpha] = paint(getComputedStyle(node).backgroundColor);
						if (alpha === 255) return [red, green, blue];
					}
					return null;
				};
				const zones: Record<string, string> = {
					header: 'header',
					toast: '[data-toast]',
					users: 'ul'
				};
				const texts: {
					zone: string;
					text: string;
					color: [number, number, number];
					fill: [number, number, number] | null;
				}[] = [];
				const fields: {
					zone: string;
					width: number;
					color: [number, number, number];
					fill: [number, number, number] | null;
				}[] = [];
				for (const [zone, selector] of Object.entries(zones)) {
					for (const root of document.querySelectorAll(selector)) {
						for (const element of [root, ...root.querySelectorAll('*')]) {
							const style = getComputedStyle(element);
							if (style.visibility === 'hidden' || style.display === 'none') continue;
							const box = element.getBoundingClientRect();
							// A visually hidden text (the name of a radio) is not seen, so no contrast is asked of it.
							if (box.width <= 1 || box.height <= 1) continue;
							const own = [...element.childNodes].some(
								(node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== ''
							);
							if (own) {
								texts.push({
									zone,
									text: element.textContent.trim().slice(0, 30),
									color: paint(style.color).slice(0, 3) as [number, number, number],
									fill: fillOf(element)
								});
							}
							if (
								element.matches(
									'select, input:not([type="radio"]):not([type="checkbox"]), textarea'
								)
							) {
								fields.push({
									zone,
									width: parseFloat(style.borderTopWidth),
									color: paint(style.borderTopColor).slice(0, 3) as [number, number, number],
									fill: fillOf(element.parentElement!)
								});
							}
						}
					}
				}
				const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
				return { texts, fields, ring: getComputedStyle(box).boxShadow };
			});

			expect(measured.texts.length).toBeGreaterThan(10);
			for (const zone of ['header', 'toast', 'users']) {
				expect(measured.texts.filter((text) => text.zone === zone).length, zone).toBeGreaterThan(0);
			}
			for (const { zone, text, color, fill } of measured.texts) {
				expect(
					contrast(color, fill ?? canvas),
					`${device} ${zone}: "${text}"`
				).toBeGreaterThanOrEqual(4.5);
			}
			expect(measured.fields.length).toBeGreaterThan(0);
			for (const { zone, width, color, fill } of measured.fields) {
				expect(width, `${device} ${zone} field border`).toBeGreaterThan(0);
				expect(
					contrast(color, fill ?? canvas),
					`${device} ${zone} field border`
				).toBeGreaterThanOrEqual(3);
			}
			// The ring around the native box is the theme's: forced colors draw the box themselves.
			expect(measured.ring, `${device} checkbox ring`).toBe('none');

			// The focus ring is a system color, 3:1 against Canvas.
			await page.locator('body').click({ position: { x: 1, y: 1 } });
			await page.keyboard.press('Tab');
			const stop = await focusedStop(page);
			expect(stop.ring, 'a ring on the first stop').not.toBeNull();
			expect(stop.width).toBeGreaterThan(0);
			expect(contrast(stop.ring!, canvas)).toBeGreaterThanOrEqual(3);
			await context.close();
		});
	}
});
