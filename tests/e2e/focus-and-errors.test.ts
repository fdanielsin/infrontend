import { expect, test, type Locator, type Page } from '@playwright/test';
import { measure, worstContrast } from './support/contrast';
import { nextFocusKey } from './support/keyboard';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// One focus indicator and one error color for the whole interface, measured on the computed style
// in a real browser (never on class names). The API is mocked: no backend needed.

// Keyboard only: `:focus-visible` is what the user sees, so each control is reached with Tab.
async function tabTo(page: Page, target: Locator, browserName: string) {
	for (let step = 0; step < 90; step++) {
		await page.keyboard.press(nextFocusKey(browserName));
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

// Headless Firefox scrolls the page by itself, a few milliseconds after a correct `focusin`, back to
// the text field left 1 to 3 Tab earlier (no script call, no toast: measured on develop, about 6 % of
// the runs of the 6-toast case). Playwright presses Tab every 5 ms, a person never does, so the next
// Tab and the measure wait until `scrollY` has been read equal 5 times in a row (about 50 ms). A
// polled read, not `requestAnimationFrame`: `page.clock` fakes it. A control that is really hidden
// stays hidden once the scroll is stable: the wait hides nothing.
async function waitForStableScroll(page: Page) {
	let previous = Number.NaN;
	let equalReads = 0;
	await expect
		.poll(
			async () => {
				const scrollY = await page.evaluate(() => window.scrollY);
				equalReads = scrollY === previous ? equalReads + 1 : 0;
				previous = scrollY;
				return equalReads;
			},
			{ intervals: [10], timeout: 5000, message: 'the scroll never became stable' }
		)
		.toBeGreaterThanOrEqual(5);
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
			page,
			browserName
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
				await tabTo(page, control, browserName);
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
		page,
		browserName
	}) => {
		// GIVEN: An error toast, on its red background.
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		api.failNext('PUT /tasks/{id}', { status: 500, error: 'Database unavailable' });
		await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
		const close = page.getByRole('button', { name: 'Dismiss notification' });
		await expect(close).toBeVisible();

		// WHEN: Its close button is reached with Tab.
		await tabTo(page, close, browserName);

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

	for (const width of [1280, 320]) {
		test(`the focus outline of the toast Undo button is white and at 4.5:1 or more, at ${width} px (limit)`, async ({
			page
		}) => {
			// GIVEN: A deleted task: its toast offers Undo, on its green background.
			await page.setViewportSize({ width, height: 900 });
			await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			const del = page.getByRole('button', { name: 'Delete Review 2' });
			await del.focus();
			await page.keyboard.press('Enter');
			const undo = page.getByRole('button', { name: 'Undo' });

			// WHEN: The keyboard deletion has put the focus on it (so `:focus-visible` applies).
			await expect(undo).toBeFocused();
			await waitForStableScroll(page);

			// THEN: The outline is the inverse one, white, 2 px, readable on the toast.
			expect(await outlineOf(undo)).toEqual({ style: 'solid', width: '2px', offset: '2px' });
			const outline = await measure(undo, 'outlineColor');
			expect(outline.color).toEqual([255, 255, 255]);
			const toast = await measure(page.locator('[data-toast]').first(), 'color', 'self');
			expect(toast.backgrounds, 'the toast has its own background').toHaveLength(1);
			expect(
				worstContrast({ color: outline.color, backgrounds: toast.backgrounds })
			).toBeGreaterThanOrEqual(4.5);
			// The ring is wholly on screen, not clipped by the toast stack or the window.
			const box = await undo.boundingBox();
			const viewport = page.viewportSize()!;
			expect(box!.x - 4).toBeGreaterThanOrEqual(0);
			expect(box!.x + box!.width + 4).toBeLessThanOrEqual(viewport.width);
		});
	}

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
				.filter({ hasText: /^\s*(Edit|Modifier|Bearbeiten|Editar)\s*$/ })
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
		const statsError = page.getByText('Statistics could not be loaded.');
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
				page,
				browserName
			}) => {
				// GIVEN: A short page and `count` error toasts on the screen. The clock is frozen, so that
				// the toasts stay while the whole page is gone through.
				await page.setViewportSize({ width, height });
				await page.clock.install({ time: 0 });
				await page.clock.pauseAt(1000);
				const api = await mockApi(page, { users: [ada], tasks: adaTasks });
				await openHomeWithUser(page);
				for (let toast = 1; toast <= count; toast++) {
					// The real backend gives every 5xx a reference: each toast has two stops, Copy then Dismiss.
					api.failNext('PUT /tasks/{id}', {
						status: 500,
						error: `Database unavailable ${toast}`,
						requestId: `req-${toast}`
					});
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
				// A trap that cancels Tab is seen whatever the browser does at the end of the page.
				await page.evaluate(() => {
					const tabs = window as unknown as { lastTab: KeyboardEvent | null };
					tabs.lastTab = null;
					window.addEventListener(
						'keydown',
						(event) => {
							if (event.key === 'Tab') tabs.lastTab = event;
						},
						true
					);
				});
				for (let step = 0; step < 90; step++) {
					await page.keyboard.press(nextFocusKey(browserName));
					if (browserName === 'firefox') await waitForStableScroll(page);
					const { prevented, stop } = await page.evaluate(() => {
						const tabs = window as unknown as { lastTab: KeyboardEvent | null };
						const prevented = tabs.lastTab?.defaultPrevented ?? false;
						tabs.lastTab = null;
						const stop = (() => {
							const element = document.activeElement as HTMLElement | null;
							if (!element || element === document.body) return null;
							const previous = (window as { previousStop?: Element }).previousStop;
							(window as { previousStop?: Element }).previousStop = element;
							// Where the page really ends: the last control in document order. A browser
							// without its own chrome (headless Firefox) keeps the focus there, a keyboard
							// trap keeps it anywhere else.
							const tabbable = [
								...document.querySelectorAll<HTMLElement>(
									'a[href], button, input, select, textarea'
								)
							].filter(
								(control) =>
									!(control as HTMLInputElement).disabled &&
									control.tabIndex >= 0 &&
									control.getClientRects().length > 0
							);
							const repeated = previous === element;
							const lastInDocument = tabbable.at(-1) === element;
							const first = element.dataset.probe === '0';
							element.dataset.probe ??= String(document.querySelectorAll('[data-probe]').length);
							const box = element.getBoundingClientRect();
							const stack = element.closest('[data-toast]')?.closest('.fixed');
							const name = [
								element.tagName.toLowerCase(),
								element.id && `#${element.id}`,
								element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 40)
							]
								.filter(Boolean)
								.join(' ');
							// Firefox makes a scrolling area a tab stop of its own: the stack itself, no other element.
							const isStack = element === document.querySelector('[data-toast]')?.closest('.fixed');
							if (isStack)
								return { first, name, repeated, lastInDocument, kind: 'stack', ok: true };
							// Any other stop must be a real control: no stray tab stop on a container.
							if (!stack && !tabbable.includes(element)) {
								return { first, name, repeated, lastInDocument, kind: 'page', ok: false };
							}
							if (stack) {
								const area = stack.getBoundingClientRect();
								const inside = box.top >= area.top - 1 && box.bottom <= area.bottom + 1;
								const detail = `top+${(box.top - area.top).toFixed(1)} bottom-${(area.bottom - box.bottom).toFixed(1)} scrollTop=${stack.scrollTop}`;
								return {
									first,
									name: `${name} (${detail})`,
									repeated,
									lastInDocument,
									kind: 'toast',
									ok: inside
								};
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
							return {
								first,
								name,
								repeated,
								lastInDocument,
								kind: 'page',
								detail: `top=${box.top.toFixed(1)} bottom=${box.bottom.toFixed(1)} innerHeight=${innerHeight} scrollY=${scrollY.toFixed(1)} coveredPoints=${covered}`,
								ok: covered === 0 && visible
							};
						})();
						return { prevented, stop };
					});
					if (prevented) problems.push(`Tab cancelled on ${stop?.name ?? 'the page'}`);
					if (!stop) continue;
					if (stop.repeated) {
						// Only headless Firefox, which has no browser toolbar to leave the page for, keeps the
						// focus on the last control; anywhere else a repeated stop is a trap.
						if (browserName !== 'firefox' || !stop.lastInDocument) {
							problems.push(`focus stuck on ${stop.name}`);
						}
						break;
					}
					if (stop.first && stops > 0) break;
					stops++;
					if (stop.kind === 'toast') closeButtons++;
					if (!stop.ok) problems.push(`${stop.name}${'detail' in stop ? ` (${stop.detail})` : ''}`);
				}

				// WHEN: Tab leaves the last control of the page, and time passes. A trap may let Tab through and
				// give the focus back a moment later. Chromium and WebKit hand the focus to the browser
				// window (nothing is focused in the page); headless Firefox fires no event at all there, so
				// a trap that reacts to the focus leaving is never triggered and cannot be told apart.
				if (browserName !== 'firefox') {
					await page.evaluate(() => {
						const controls = [
							...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea')
						].filter(
							(control) =>
								!(control as HTMLInputElement).disabled &&
								control.tabIndex >= 0 &&
								control.getClientRects().length > 0
						);
						controls.at(-1)?.focus();
					});
					await page.keyboard.press(nextFocusKey(browserName));
					await page.clock.runFor(500);
					const pulledBack = await page.evaluate(() => {
						const element = document.activeElement as HTMLElement | null;
						if (!element || element === document.body) return null;
						return element.getAttribute('aria-label') || element.tagName.toLowerCase();
					});
					if (pulledBack) problems.push(`focus pulled back to ${pulledBack}`);
				}

				// THEN: Every stop is visible: none under the stack, and each close button is in view
				// of the stack; the page really was gone through, toasts included.
				expect(problems, 'controls hidden by the toasts').toEqual([]);
				expect(closeButtons, 'toast stops reached (Copy and Dismiss of each)').toBe(2 * count);
				expect(stops, 'stops of the page').toBeGreaterThanOrEqual(15 + 2 * count);
			});
		}
	}
});
