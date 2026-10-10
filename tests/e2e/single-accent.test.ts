import { expect, test, type Locator, type Page } from '@playwright/test';
import { contrast, measure, worstContrast, type Rgb } from './support/contrast';
import { ada, adaTasks, mockApi } from './support/mock-api';

// One accent color and one button system: the filled accent is the action, the outline is the
// second choice, green/red/amber only say a state, and both pages share one frame. Every check
// reads computed styles (never class names). The API is mocked; the page is a production build.

type Style = Record<string, string>;

const style = (locator: Locator, properties: string[]) =>
	locator.evaluate((element, names) => {
		const computed = getComputedStyle(element);
		return Object.fromEntries(names.map((name) => [name, computed.getPropertyValue(name)]));
	}, properties) as Promise<Style>;

// Any CSS color (the palette is in oklch) as sRGB, through a canvas.
async function rgbOf(page: Page, css: string): Promise<Rgb> {
	return page.evaluate((value) => {
		const context = document
			.createElement('canvas')
			.getContext('2d', { willReadFrequently: true })!;
		context.fillStyle = '#000';
		context.fillStyle = value;
		context.fillRect(0, 0, 1, 1);
		const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
		return [red!, green!, blue!] as [number, number, number];
	}, css);
}

const token = (page: Page, name: string) =>
	page.evaluate(
		(variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
		name
	);

async function backgroundRgb(page: Page, locator: Locator) {
	return rgbOf(page, (await style(locator, ['background-color']))['background-color']!);
}

async function openHome(page: Page, width = 1280) {
	await page.setViewportSize({ width, height: 900 });
	const api = await mockApi(page, { users: [ada], tasks: adaTasks });
	await page.goto('/');
	await page.getByRole('button', { name: /Ada Lovelace/ }).click();
	await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();
	return api;
}

test.describe('One accent color (mocked API)', () => {
	test('the submit buttons of both forms are the same primary blue (happy path)', async ({
		page
	}) => {
		// GIVEN: The home page with a selected user, so both forms are on screen.
		await openHome(page);

		// WHEN: The two submit buttons are measured.
		const createUser = await backgroundRgb(page, page.getByRole('button', { name: 'Create User' }));
		const addTask = await backgroundRgb(page, page.getByRole('button', { name: 'Add Task' }));
		const primary = await rgbOf(page, await token(page, '--color-primary'));

		// THEN: Both are the primary color: no green, no second accent.
		expect(createUser).toEqual(primary);
		expect(addTask).toEqual(primary);
	});

	for (const [path, width] of [
		['/', 1280],
		['/', 320],
		['/stats', 1280],
		['/stats', 320]
	] as const) {
		test(`no element draws indigo on ${path} at ${width} px (limit)`, async ({ page }) => {
			// GIVEN: A page with data, at a wide and a narrow width.
			await page.setViewportSize({ width, height: 900 });
			await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 5, tasks: 12 } });
			await page.goto(path);
			await page.getByRole('heading', { level: 1 }).waitFor();
			const indigo = [
				await rgbOf(page, await token(page, '--color-indigo-600')),
				await rgbOf(page, await token(page, '--color-indigo-700'))
			].map((rgb) => rgb.join(','));

			// WHEN: Every visible element's colors are read.
			const used = await page.evaluate(() => {
				const context = document
					.createElement('canvas')
					.getContext('2d', { willReadFrequently: true })!;
				const toRgb = (css: string) => {
					context.fillStyle = '#000';
					context.fillStyle = css;
					context.fillRect(0, 0, 1, 1);
					return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3)).join(',');
				};
				const found = new Set<string>();
				for (const element of document.body.querySelectorAll('*')) {
					const computed = getComputedStyle(element);
					for (const property of ['color', 'backgroundColor', 'borderTopColor'] as const) {
						found.add(toRgb(computed[property]));
					}
				}
				return [...found];
			});

			// THEN: Neither indigo shade is among them.
			for (const shade of indigo) expect(used).not.toContain(shade);
		});
	}

	test('the information toast is not the color of an action (happy path)', async ({ page }) => {
		// GIVEN: A task that disappeared on the server, so the page shows an information toast.
		const api = await openHome(page);
		api.failNext('PUT /tasks/{id}', {
			status: 404,
			error: 'Task not found',
			code: 'TASK_NOT_FOUND'
		});

		// WHEN: The task is ticked.
		await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
		const toast = page.locator('[data-toast]').first();
		await expect(toast).toBeVisible();

		// THEN: Its background is neither the primary blue nor the strong action blue, and white
		// text reads on it at 4.5:1 or more.
		const background = await backgroundRgb(page, toast);
		const primary = await rgbOf(page, await token(page, '--color-primary'));
		const strong = await rgbOf(page, await token(page, '--color-action-strong'));
		expect(background).not.toEqual(primary);
		expect(background).not.toEqual(strong);
		expect(contrast([255, 255, 255], background)).toBeGreaterThanOrEqual(4.5);
	});
});

test.describe('Buttons of the same role look alike (mocked API)', () => {
	test('Save and Cancel have the height of Add Task, and Save is the primary blue (boundary)', async ({
		page
	}) => {
		// GIVEN: A task in edition on the home page.
		await openHome(page);
		const addTaskHeight = (await page.getByRole('button', { name: 'Add Task' }).boundingBox())!
			.height;
		await page.getByRole('button', { name: 'Edit Review', exact: true }).click();

		// WHEN: Save and Cancel are measured.
		const save = page.getByRole('button', { name: 'Save' });
		const cancel = page.getByRole('button', { name: 'Cancel' });
		const [saveBox, cancelBox] = [await save.boundingBox(), await cancel.boundingBox()];

		// THEN: Both are as tall as the main submit button; Save is filled, Cancel is an outline.
		expect(saveBox!.height).toBeCloseTo(addTaskHeight, 0);
		expect(cancelBox!.height).toBeCloseTo(addTaskHeight, 0);
		expect(await backgroundRgb(page, save)).toEqual(
			await rgbOf(page, await token(page, '--color-primary'))
		);
		const cancelStyle = await style(cancel, ['border-top-width', 'background-color']);
		expect(parseFloat(cancelStyle['border-top-width']!)).toBeGreaterThan(0);
		expect(await backgroundRgb(page, cancel)).not.toEqual(
			await rgbOf(page, await token(page, '--color-primary'))
		);
	});

	test('Retry and Copy of the banner share one secondary style; the toast Copy is the same in white (happy path)', async ({
		page
	}) => {
		// GIVEN: An outage whose answer carries a server reference, then a failing call elsewhere.
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		api.readiness = 503;
		api.readinessRequestId = 'req-banner-503';
		await page.goto('/');
		const retry = page.getByRole('button', { name: 'Retry' });
		const bannerCopy = page.getByRole('button', { name: /Copy reference req-banner-503/ });
		await expect(retry).toBeVisible();
		await expect(bannerCopy).toBeVisible();

		// WHEN: Their computed styles are read.
		const names = [
			'border-top-color',
			'border-top-width',
			'color',
			'font-size',
			'background-color'
		];
		const [retryStyle, copyStyle] = [await style(retry, names), await style(bannerCopy, names)];
		const [retryBox, copyBox] = [await retry.boundingBox(), await bannerCopy.boundingBox()];

		// THEN: Same border, same text color, same size, no filled background: one secondary style.
		expect(copyStyle).toEqual(retryStyle);
		expect(copyBox!.height).toBeCloseTo(retryBox!.height, 0);
		const border = await rgbOf(page, retryStyle['border-top-color']!);
		expect(border).toEqual(await rgbOf(page, await token(page, '--color-danger')));
	});

	test('a toast Copy is a secondary button in white, as tall as the banner ones (happy path)', async ({
		page
	}) => {
		// GIVEN: A server error with a reference, shown as a toast.
		const api = await openHome(page);
		api.failNext('PUT /tasks/{id}', {
			status: 500,
			error: 'boom',
			code: 'INTERNAL_ERROR',
			requestId: 'req-toast-500'
		});
		await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
		const copy = page.getByRole('button', { name: /Copy reference req-toast-500/ });
		await expect(copy).toBeVisible();

		// WHEN: Its border and text are measured against the toast.
		const copyStyle = await style(copy, ['border-top-color', 'border-top-width', 'color']);

		// THEN: White outline and text, with a visible border.
		const white: Rgb = [255, 255, 255];
		expect(await rgbOf(page, copyStyle['border-top-color']!)).toEqual(white);
		expect(await rgbOf(page, copyStyle.color!)).toEqual(white);
		expect(parseFloat(copyStyle['border-top-width']!)).toBeGreaterThan(0);
	});

	test('the secondary button reads on the page: text 4.5:1 and border 3:1 (limit)', async ({
		page
	}) => {
		// GIVEN: The home page, whose "View Statistics" link is a secondary button on the gradient.
		await openHome(page);
		const link = page.getByRole('link', { name: /View Statistics/ });

		// WHEN: Its text and border are measured against the gradient ends.
		const text = await measure(link, 'color');
		const border = await measure(link, 'borderTopColor');

		// THEN: The text reaches 4.5:1 and the border 3:1 on both ends.
		expect(worstContrast(text)).toBeGreaterThanOrEqual(4.5);
		expect(worstContrast(border)).toBeGreaterThanOrEqual(3);
	});

	test('a secondary button gets a tint under the pointer, a primary one a darker fill (happy path)', async ({
		page
	}) => {
		// GIVEN: A task in edition, so Save (primary) and Cancel (secondary) are on screen.
		await openHome(page);
		await page.getByRole('button', { name: 'Edit Review', exact: true }).click();
		const cancel = page.getByRole('button', { name: 'Cancel' });
		const save = page.getByRole('button', { name: 'Save' });
		const [cancelRest, saveRest] = [
			await backgroundRgb(page, cancel),
			await backgroundRgb(page, save)
		];

		// WHEN: The pointer is over each of them.
		await cancel.hover();
		const cancelHover = await backgroundRgb(page, cancel);
		await save.hover();
		const saveHover = await backgroundRgb(page, save);

		// THEN: Each background changes: the outline gets a tint, the fill its hover color.
		expect(cancelHover).not.toEqual(cancelRest);
		expect(saveHover).not.toEqual(saveRest);
		expect(saveHover).toEqual(await rgbOf(page, await token(page, '--color-primary-hover')));
	});

	test('the primary button text reads on its fill: 4.5:1 (limit)', async ({ page }) => {
		await openHome(page);
		const button = page.getByRole('button', { name: 'Add Task' });

		const ratio = contrast(
			await rgbOf(page, (await style(button, ['color']))['color']!),
			await backgroundRgb(page, button)
		);

		expect(ratio).toBeGreaterThanOrEqual(4.5);
	});

	test('the failure state of the statistics page has a danger Retry (exception)', async ({
		page
	}) => {
		// GIVEN: A failing statistics call.
		const api = await mockApi(page, { users: [] });
		api.failNext('GET /stats', { status: 500, error: 'boom' });

		// WHEN: The page shows its failure state.
		await page.goto('/stats');
		const retry = page.getByRole('button', { name: 'Retry' });
		await expect(retry).toBeVisible();

		// THEN: The button uses the danger border and reads on the danger-soft fill.
		const border = await style(retry, ['border-top-color']);
		expect(await rgbOf(page, border['border-top-color']!)).toEqual(
			await rgbOf(page, await token(page, '--color-danger'))
		);
		expect(worstContrast(await measure(retry, 'color'))).toBeGreaterThanOrEqual(4.5);
	});
});

test.describe('Both pages share one frame (mocked API)', () => {
	async function frame(page: Page, path: string) {
		await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 5, tasks: 12 } });
		await page.goto(path);
		const heading = page.getByRole('heading', { level: 1 });
		await heading.waitFor();
		const language = page.getByRole('combobox', { name: 'Language' });
		const link = page.getByRole('link', { name: /View Statistics|Back to home/ });
		return {
			heading: (await heading.boundingBox())!,
			headingStyle: await style(heading, ['text-align', 'font-size', 'color']),
			language: (await language.boundingBox())!,
			link: (await link.boundingBox())!,
			linkStyle: await style(link, [
				'color',
				'border-top-color',
				'border-top-width',
				'border-top-left-radius',
				'font-size',
				'background-color'
			])
		};
	}

	for (const width of [1280, 768, 320]) {
		test(`title, language switcher and navigation link are in the same place at ${width} px (happy path)`, async ({
			page
		}) => {
			// GIVEN: Both pages measured at the same width.
			await page.setViewportSize({ width, height: 900 });
			const home = await frame(page, '/');
			const stats = await frame(page, '/stats');

			// THEN: Same left edge for the title, same place for the switcher, aligned to the left.
			expect(stats.heading.x).toBeCloseTo(home.heading.x, 0);
			expect(stats.language.x).toBeCloseTo(home.language.x, 0);
			expect(stats.language.y).toBeCloseTo(home.language.y, 0);
			expect(['left', 'start']).toContain(home.headingStyle['text-align']);
			expect(['left', 'start']).toContain(stats.headingStyle['text-align']);
			expect(stats.headingStyle['font-size']).toBe(home.headingStyle['font-size']);
			expect(stats.headingStyle.color).toBe(home.headingStyle.color);
		});
	}

	test('"View Statistics" and "Back to home" are the same button, in the same place under the title (boundary)', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		const home = await frame(page, '/');
		const stats = await frame(page, '/stats');

		// Same look (color, border, radius, size, no fill), same left edge as the title, below it.
		expect(stats.linkStyle).toEqual(home.linkStyle);
		expect(home.link.x).toBeCloseTo(home.heading.x, 0);
		expect(stats.link.x).toBeCloseTo(stats.heading.x, 0);
		expect(home.link.y).toBeGreaterThan(home.heading.y + home.heading.height - 1);
		expect(stats.link.y).toBeGreaterThan(stats.heading.y + stats.heading.height - 1);
		expect(stats.link.height).toBeCloseTo(home.link.height, 0);
	});
});

test.describe('Statistics tiles (mocked API)', () => {
	test('three tiles in one row on a wide screen, in one column on a narrow one (boundary)', async ({
		page
	}) => {
		await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 5, tasks: 12 } });

		for (const [width, oneRow] of [
			[1280, true],
			[768, true],
			[320, false]
		] as const) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto('/stats');
			const tiles = page.locator('[data-stat]');
			await expect(tiles).toHaveCount(3);
			const boxes = await tiles.evaluateAll((nodes) =>
				nodes.map((node) => {
					const box = node.getBoundingClientRect();
					return { x: box.x, y: box.y };
				})
			);
			const sameRow = boxes.every((box) => Math.abs(box.y - boxes[0]!.y) < 2);
			expect(sameRow, `${width} px`).toBe(oneRow);
		}
	});

	for (const width of [1280, 768]) {
		test(`the three tiles share the width of the content, as on the home page, at ${width} px (boundary)`, async ({
			page
		}) => {
			// GIVEN: The statistics page, whose title and language switcher mark the content edges.
			await page.setViewportSize({ width, height: 900 });
			await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 5, tasks: 12 } });
			await page.goto('/stats');
			await expect(page.locator('[data-stat]')).toHaveCount(3);
			const heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
			const language = (await page.getByRole('combobox', { name: 'Language' }).boundingBox())!;

			// WHEN: The tiles are measured.
			const tiles = await page
				.locator('[data-stat]')
				.evaluateAll((nodes) =>
					nodes.map((node) => node.getBoundingClientRect()).map(({ x, width }) => ({ x, width }))
				);

			// THEN: Equal widths, from the left edge of the title to the right edge of the switcher.
			expect(tiles).toHaveLength(3);
			for (const tile of tiles) expect(tile.width).toBeCloseTo(tiles[0]!.width, 0);
			expect(tiles[0]!.x).toBeCloseTo(heading.x, 0);
			const last = tiles[2]!;
			expect(last.x + last.width).toBeCloseTo(language.x + language.width, 0);
		});
	}

	test('a tile does not react to the pointer: nothing there is a button (limit)', async ({
		page
	}) => {
		await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 5, tasks: 12 } });
		await page.goto('/stats');
		const tile = page.locator('[data-stat]').first();
		const read = () =>
			tile.evaluate((element) => {
				const style = getComputedStyle(element);
				return {
					shadow: style.boxShadow,
					transform: style.transform,
					transition: style.transitionDuration
				};
			});
		const before = await read();

		await tile.hover();

		const after = await read();
		expect(after).toEqual(before);
		expect(after.transform).toBe('none');
		expect(after.transition).toBe('0s');
	});

	test('the figures share one neutral color: no meaning in blue versus indigo (happy path)', async ({
		page
	}) => {
		await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 5, tasks: 12 } });
		await page.goto('/stats');
		await expect(page.locator('[data-stat-value]')).toHaveCount(3);

		const colors = await page
			.locator('[data-stat-value]')
			.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color));

		expect(new Set(colors).size).toBe(1);
		expect(await rgbOf(page, colors[0]!)).toEqual(
			await rgbOf(page, await token(page, '--color-heading'))
		);
	});

	test('shows the average as a tile, with no repeated totals and no "Summary" (happy path)', async ({
		page
	}) => {
		await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 5, tasks: 12 } });
		await page.goto('/stats');

		await expect(page.getByText('Average tasks per user')).toBeVisible();
		await expect(page.locator('[data-stat-value]').nth(2)).toHaveText('2.40');
		await expect(page.getByText('Summary')).toHaveCount(0);
		await expect(page.getByText('Total users created')).toHaveCount(0);
		await expect(page.getByText('Total tasks created')).toHaveCount(0);
	});

	test('the average is 0 when there is no user but tasks exist (boundary)', async ({ page }) => {
		await mockApi(page, { users: [], tasks: adaTasks, stats: { users: 0, tasks: 2 } });
		await page.goto('/stats');

		await expect(page.locator('[data-stat-value]').nth(2)).toHaveText('0');
	});
});
