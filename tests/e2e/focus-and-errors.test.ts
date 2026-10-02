import { expect, test, type Locator, type Page } from '@playwright/test';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// One focus indicator and one error color for the whole interface, measured on the computed style
// in a real browser (never on class names). The API is mocked: no backend needed.

type Rgb = [number, number, number];

interface Measure {
	color: Rgb;
	// Colors of the backgrounds the element can sit on, nearest first; the page gradient gives
	// its two ends.
	backgrounds: Rgb[];
}

function luminance([red, green, blue]: Rgb): number {
	const linear = (channel: number) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrast(first: Rgb, second: Rgb): number {
	const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
	return (light! + 0.05) / (dark! + 0.05);
}

// Resolves any CSS color (the palette is in oklch) to sRGB through a canvas, and walks up from
// the element's parent to the first opaque background (an outline or a border is drawn against
// what surrounds the element, not against its own fill); the page gradient is read from its two tokens.
async function measure(
	locator: Locator,
	property: 'outlineColor' | 'color' | 'borderTopColor',
	from: 'parent' | 'self' = 'parent'
): Promise<Measure> {
	return locator.evaluate(
		(element, [prop, origin]) => {
			const context = document
				.createElement('canvas')
				.getContext('2d', { willReadFrequently: true })!;
			const resolve = (css: string): [number, number, number, number] => {
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = '#000';
				context.fillStyle = css;
				context.fillRect(0, 0, 1, 1);
				const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
				return [red!, green!, blue!, alpha!];
			};
			const rgb = (css: string): [number, number, number] =>
				resolve(css).slice(0, 3) as [number, number, number];
			const root = getComputedStyle(document.documentElement);
			const gradient = [
				rgb(root.getPropertyValue('--color-blue-50')),
				rgb(root.getPropertyValue('--color-indigo-100'))
			];
			const backgrounds: [number, number, number][] = [];
			for (
				let node: Element | null = origin === 'self' ? element : element.parentElement;
				node;
				node = node.parentElement
			) {
				const style = getComputedStyle(node);
				if (style.backgroundImage.includes('gradient')) {
					backgrounds.push(...gradient);
					break;
				}
				const [red, green, blue, alpha] = resolve(style.backgroundColor);
				if (alpha === 255) {
					backgrounds.push([red, green, blue]);
					break;
				}
			}
			return {
				color: rgb(getComputedStyle(element)[prop]),
				backgrounds
			};
		},
		[property, from] as const
	);
}

function worstContrast({ color, backgrounds }: Measure): number {
	return Math.min(...backgrounds.map((background) => contrast(color, background)));
}

// Keyboard only: `:focus-visible` is what the user sees, so each control is reached with Tab.
async function tabTo(page: Page, target: Locator) {
	for (let step = 0; step < 90; step++) {
		await page.keyboard.press('Tab');
		if (await target.evaluate((element) => element === document.activeElement)) {
			// The outline color can still be moving (`transition` covers it on the links); measure
			// the style the user ends up seeing.
			await target.evaluate((element) =>
				Promise.all(element.getAnimations().map((animation) => animation.finished))
			);
			return;
		}
	}
	throw new Error('the control was never reached with Tab');
}

async function outlineOf(target: Locator) {
	return target.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			style: style.outlineStyle,
			width: style.outlineWidth,
			offset: style.outlineOffset
		};
	});
}

test.describe('Focus and errors (computed style, mocked API)', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	for (const width of [1280, 320]) {
		test(`every control has the same focus outline, at 4.5:1 or more, at ${width} px (happy path)`, async ({
			page
		}) => {
			// GIVEN: The home page with a selected user, its tasks and one task being edited.
			await page.setViewportSize({ width, height: 900 });
			await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			await page.getByRole('button', { name: 'Edit Review', exact: true }).click();
			await page.locator('body').click({ position: { x: 1, y: 1 } });
			await page.keyboard.press('Home');

			const controls: [string, Locator][] = [
				['language select', page.getByRole('combobox', { name: 'Language' })],
				['statistics link', page.getByRole('link', { name: /View Statistics/ })],
				['name field', page.getByLabel('Name', { exact: true })],
				['email field', page.getByLabel('Email', { exact: true })],
				['create user button', page.getByRole('button', { name: 'Create User' })],
				['user button', page.getByRole('button', { name: /Ada Lovelace/ })],
				['title field', page.getByLabel('Task Title').first()],
				['description field', page.getByLabel('Description').first()],
				['add task button', page.getByRole('button', { name: 'Add Task' })],
				['edit title field (compact)', page.getByLabel('Task Title').nth(1)],
				['save button', page.getByRole('button', { name: 'Save' })],
				['cancel button', page.getByRole('button', { name: 'Cancel' })],
				['task checkbox', page.getByRole('checkbox', { name: 'Review 2', exact: true })],
				['edit button', page.getByRole('button', { name: 'Edit Review 2', exact: true })],
				['delete icon button', page.getByRole('button', { name: 'Delete Review 2', exact: true })]
			];

			// WHEN / THEN: Each control reached with Tab shows the same 2 px solid outline, offset by
			// 2 px, in the same color, with 4.5:1 or more against what is behind it.
			const seen = new Set<string>();
			for (const [name, control] of controls) {
				await tabTo(page, control);
				const outline = await outlineOf(control);
				expect(outline, `${name}: outline`).toEqual({
					style: 'solid',
					width: '2px',
					offset: '2px'
				});
				const color = await measure(control, 'outlineColor');
				seen.add(color.color.join(','));
				expect(worstContrast(color), `${name}: contrast of the outline`).toBeGreaterThanOrEqual(
					4.5
				);
			}
			expect([...seen], 'a single outline color').toHaveLength(1);
		});
	}

	test('the focus outline of the toast close button is white and at 4.5:1 or more (limit)', async ({
		page
	}) => {
		// GIVEN: An error toast, on its red background.
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		api.failNext('PUT /tasks/{id}', { status: 500, error: 'Database unavailable' });
		await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
		const close = page.getByRole('button', { name: 'Dismiss notification' });
		await expect(close).toBeVisible();

		// WHEN: Its close button is reached with Tab.
		await tabTo(page, close);

		// THEN: The outline is the inverse one, white, readable on the toast.
		expect(await outlineOf(close)).toEqual({ style: 'solid', width: '2px', offset: '2px' });
		const outline = await measure(close, 'outlineColor');
		expect(outline.color).toEqual([255, 255, 255]);
		const toast = await measure(page.locator('[data-toast]').first(), 'color', 'self');
		expect(toast.backgrounds, 'the toast has its own background').toHaveLength(1);
		expect(
			worstContrast({ color: outline.color, backgrounds: toast.backgrounds })
		).toBeGreaterThanOrEqual(4.5);
	});

	for (const locale of ['en', 'fr', 'de', 'es'] as const) {
		test(`every error is the same red, at 4.5:1 or more, in ${locale} (sad path)`, async ({
			page
		}) => {
			// GIVEN: The home page in the language, a selected user and the edit form of a task.
			await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			await page.getByRole('combobox', { name: 'Language' }).selectOption(locale);
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
			const form = (id: string) => page.locator(`#${id}`);

			// WHEN: The user form, the task form and the edit form are all refused.
			await form('name').fill('   ');
			await form('email').fill('a@localhost');
			await form('name').press('Enter');
			await form('title').fill('   ');
			await form('title').press('Enter');
			await page
				.locator('li button[type="button"]')
				.filter({ hasText: /^(Edit|Modifier|Bearbeiten|Editar)$/ })
				.first()
				.click();
			await page.locator('#edit-title-10').fill('');
			await page.locator('#edit-title-10').press('Enter');

			// THEN: Every error text, and the border of every invalid field, is one red.
			const errors = page.locator('p[id$="-error"]');
			await expect(errors.first()).toBeVisible();
			expect(await errors.count()).toBeGreaterThanOrEqual(3);
			const colors = new Set<string>();
			for (const error of await errors.all()) {
				const text = await measure(error, 'color');
				colors.add(text.color.join(','));
				expect(worstContrast(text), 'error text contrast').toBeGreaterThanOrEqual(4.5);
			}
			const invalid = page.locator('[aria-invalid="true"]');
			expect(await invalid.count()).toBeGreaterThanOrEqual(3);
			for (const field of await invalid.all()) {
				const border = await measure(field, 'borderTopColor');
				colors.add(border.color.join(','));
				expect(worstContrast(border), 'invalid border contrast').toBeGreaterThanOrEqual(3);
			}
			expect([...colors], 'a single error color').toHaveLength(1);
		});
	}

	test('the banner and the statistics error use the same red (sad path)', async ({ page }) => {
		// GIVEN: A failing creation, on the home page.
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await page.goto('/');
		await page.getByRole('button', { name: /Ada Lovelace/ }).waitFor();
		api.failNext('POST /users', { status: 500, error: 'Database unavailable' });
		await page.locator('#name').fill('Grace');
		await page.locator('#email').fill('grace@example.com');
		await page.locator('#name').press('Enter');
		const banner = page.getByText('Database unavailable').first();
		await expect(banner).toBeVisible();
		const bannerColor = await measure(banner, 'color');

		// WHEN: The statistics page fails to load.
		api.failNext('GET /stats', { status: 500, error: 'Database unavailable' });
		await page.goto('/stats');
		const statsError = page.getByText(/Database unavailable/).first();
		await expect(statsError).toBeVisible();
		const statsColor = await measure(statsError, 'color');

		// THEN: Both are the one red, readable on their background.
		expect(statsColor.color).toEqual(bannerColor.color);
		expect(worstContrast(bannerColor)).toBeGreaterThanOrEqual(4.5);
		expect(worstContrast(statsColor)).toBeGreaterThanOrEqual(4.5);
	});

	const CASES = [
		{ width: 1280, height: 700, count: 1 },
		{ width: 1280, height: 700, count: 2 },
		{ width: 1280, height: 700, count: 4 },
		{ width: 1280, height: 700, count: 6 },
		{ width: 320, height: 700, count: 1 },
		{ width: 320, height: 700, count: 2 },
		{ width: 320, height: 700, count: 4 },
		{ width: 320, height: 700, count: 6 },
		// A pile as tall as the window: the stack stops at 40 % of it and scrolls inside.
		{ width: 320, height: 360, count: 6 }
	];
	for (const { width, height, count } of CASES) {
		{
			test(`Tab never leaves a control under ${count} toast(s), at ${width}x${height} px (limit)`, async ({
				page
			}) => {
				// GIVEN: A short page and `count` error toasts on the screen. The clock is frozen, so that
				// the toasts stay while the whole page is gone through.
				await page.setViewportSize({ width, height });
				await page.clock.install({ time: 0 });
				await page.clock.pauseAt(1000);
				const api = await mockApi(page, { users: [ada], tasks: adaTasks });
				await openHomeWithUser(page);
				for (let toast = 1; toast <= count; toast++) {
					api.failNext('PUT /tasks/{id}', { status: 500, error: `Database unavailable ${toast}` });
					await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
					await expect(page.locator('[data-toast]')).toHaveCount(toast);
				}
				// The announcements stay in their live regions: errors in `alert`.
				await expect(page.locator('[role="alert"] [data-toast]')).toHaveCount(count);
				await page.locator('body').click({ position: { x: 1, y: 1 } });

				// WHEN: Tab goes through every stop of the page, the toasts included, and comes back.
				const problems: string[] = [];
				let stops = 0;
				let closeButtons = 0;
				for (let step = 0; step < 90; step++) {
					await page.keyboard.press('Tab');
					const stop = await page.evaluate(() => {
						const element = document.activeElement as HTMLElement | null;
						if (!element || element === document.body) return null;
						const first = element.dataset.probe === '0';
						element.dataset.probe ??= String(document.querySelectorAll('[data-probe]').length);
						const box = element.getBoundingClientRect();
						const stack = element.closest('[data-toast]')?.closest('.fixed');
						const name = [
							element.tagName.toLowerCase(),
							element.id && `#${element.id}`,
							element.getAttribute('aria-label') || element.textContent?.trim()
						]
							.filter(Boolean)
							.join(' ');
						if (stack) {
							const area = stack.getBoundingClientRect();
							const inside = box.top >= area.top - 1 && box.bottom <= area.bottom + 1;
							return { first, name, inToast: true, ok: inside };
						}
						const points = [
							[box.left + 1, box.top + 1],
							[box.right - 1, box.top + 1],
							[box.left + 1, box.bottom - 1],
							[box.right - 1, box.bottom - 1],
							[box.left + box.width / 2, box.top + box.height / 2]
						];
						const covered = points.filter(([x, y]) =>
							document.elementFromPoint(x!, y!)?.closest('[data-toast]')
						).length;
						const visible = box.top >= 0 && box.bottom <= window.innerHeight;
						return { first, name, inToast: false, ok: covered === 0 && visible };
					});
					if (!stop) continue;
					if (stop.first && stops > 0) break;
					stops++;
					if (stop.inToast) closeButtons++;
					if (!stop.ok) problems.push(stop.name);
				}

				// THEN: Every stop is visible: none under the stack, and each close button is in view
				// of the stack; the page really was gone through, toasts included.
				expect(problems, 'controls hidden by the toasts').toEqual([]);
				expect(closeButtons, 'close buttons reached').toBe(count);
				expect(stops, 'stops of the page').toBeGreaterThanOrEqual(15 + count);
			});
		}
	}
});
