import { expect, test, type Locator, type Page } from '@playwright/test';
import { TOAST_BACKGROUNDS } from '../../src/lib/ui/toast-styles';
import { measure, worstContrast } from './support/contrast';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// Icons (Iconoir through Icon.svelte), measured on the computed style of a production build in a
// real browser, never on class names. The API is mocked: no backend needed.

const deleteButton = (page: Page) =>
	page.getByRole('button', { name: 'Delete Review', exact: true });
const crossOf = (button: Locator) => button.locator('svg');

// The only icon on a page today is the cross, at 16 px. 20 px and 24 px are measured on copies of
// that rendered <svg> whose size class alone is changed, with the stylesheet of the build.
const SCALE = [
	{ size: 16, className: 'size-4' },
	{ size: 20, className: 'size-5' },
	{ size: 24, className: 'size-6' }
] as const;

test.describe('Icons (computed style, mocked API)', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('the delete cross is a hidden 16 px Iconoir drawing, stroked 1.5 px in the button color (happy path)', async ({
		page
	}) => {
		// GIVEN: A selected user with a task.
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		const button = deleteButton(page);
		const cross = crossOf(button);

		// THEN: The button is still named by its label and holds nothing else for assistive technology.
		await expect(button).toMatchAriaSnapshot('- button "Delete Review"');
		await expect(cross).toHaveAttribute('aria-hidden', 'true');

		// THEN: The drawing is 16 px, in a 24 px target, with the one 1.5 px stroke of the set.
		const box = await cross.boundingBox();
		expect([box?.width, box?.height]).toEqual([16, 16]);
		const target = await button.boundingBox();
		expect([target?.width, target?.height]).toEqual([24, 24]);
		const stroke = await cross.locator('path').evaluate((path) => {
			const style = getComputedStyle(path);
			return {
				width: style.strokeWidth,
				effect: style.vectorEffect,
				color: style.stroke,
				text: getComputedStyle(path.closest('button')!).color
			};
		});
		expect(stroke.width).toBe('1.5px');
		expect(stroke.effect).toBe('non-scaling-stroke');
		expect(stroke.color).toBe(stroke.text);
	});

	test('the stroke stays 1.5 px and non-scaling at 16, 20 and 24 px (boundary)', async ({
		page
	}) => {
		// GIVEN: The rendered delete cross.
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await expect(crossOf(deleteButton(page))).toBeVisible();

		// WHEN: Copies of that <svg> take each size of the scale (only the size class changes).
		const measures = await page.evaluate((scale) => {
			const original = document.querySelector('button[aria-label^="Delete"] svg')!;
			const holder = document.createElement('span');
			holder.className = 'text-danger';
			document.body.append(holder);
			const result = scale.map(({ size, className }) => {
				const copy = original.cloneNode(true) as SVGElement;
				copy.setAttribute('class', copy.getAttribute('class')!.replace('size-4', className));
				holder.replaceChildren(copy);
				const box = copy.getBoundingClientRect();
				const path = getComputedStyle(copy.querySelector('path')!);
				return {
					size,
					box: [box.width, box.height],
					width: path.strokeWidth,
					effect: path.vectorEffect
				};
			});
			holder.remove();
			return result;
		}, SCALE);

		// THEN: Each copy has its size and the same stroke.
		expect(measures).toEqual(
			SCALE.map(({ size }) => ({
				size,
				box: [size, size],
				width: '1.5px',
				effect: 'non-scaling-stroke'
			}))
		);
	});

	test('the delete cross is 3:1 or more on its card, as an icon that carries a meaning (limit)', async ({
		page
	}) => {
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);

		const cross = await measure(crossOf(deleteButton(page)), 'color');

		expect(cross.backgrounds.length).toBeGreaterThan(0);
		expect(worstContrast(cross)).toBeGreaterThanOrEqual(3);
	});

	for (const width of [1280, 320]) {
		test(`the toast cross is a hidden white 16 px drawing that keeps the toast 48 px high, at ${width} px (limit)`, async ({
			page
		}) => {
			// GIVEN: A short error toast.
			await page.setViewportSize({ width, height: 700 });
			const api = await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			api.failNext('PUT /tasks/{id}', { status: 400, error: 'Nope' });
			await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
			const toast = page.locator('[data-toast]').first();
			await expect(toast).toBeVisible();
			const close = toast.locator('[data-toast-dismiss]');

			// THEN: The cross is hidden, 16 px, in a 24 px button, and the toast keeps the height of
			// its padding around one 24 px line (it was 48 px with the inline cross).
			await expect(crossOf(close)).toHaveAttribute('aria-hidden', 'true');
			const cross = await crossOf(close).boundingBox();
			expect([cross?.width, cross?.height]).toEqual([16, 16]);
			const target = await close.boundingBox();
			expect([target?.width, target?.height]).toEqual([24, 24]);
			expect((await toast.boundingBox())?.height).toBe(48);

			// THEN: It is drawn in the white of the toast, at 3:1 or more on the toast color.
			const drawn = await measure(crossOf(close), 'color');
			expect(drawn.color).toEqual([255, 255, 255]);
			expect(worstContrast(drawn)).toBeGreaterThanOrEqual(3);
		});
	}

	test('a white cross is 3:1 or more on each of the four toast colors (limit)', async ({
		page
	}) => {
		// GIVEN: Elements that wear the four classes of a toast (success, error, info, warning).
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.evaluate((backgrounds) => {
			for (const [type, background] of Object.entries(backgrounds)) {
				const probe = document.createElement('div');
				probe.dataset.toastProbe = type;
				probe.className = `${background} text-white`;
				document.body.append(probe);
			}
		}, TOAST_BACKGROUNDS);

		// THEN: White on each of them reaches 3:1 (the icon is the text color of the toast).
		for (const type of Object.keys(TOAST_BACKGROUNDS)) {
			const probe = await measure(page.locator(`[data-toast-probe="${type}"]`), 'color', 'self');
			expect(probe.color, type).toEqual([255, 255, 255]);
			expect(worstContrast(probe), type).toBeGreaterThanOrEqual(3);
		}
	});

	test('the cross is still drawn in forced colors mode, in the color of its button (sad path)', async ({
		page
	}) => {
		// GIVEN: A page in forced colors mode.
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await page.emulateMedia({ forcedColors: 'active' });
		await openHomeWithUser(page);

		// THEN: The stroke is the text color of the button, which differs from the button background.
		const drawn = await crossOf(deleteButton(page))
			.locator('path')
			.evaluate((path) => {
				const button = getComputedStyle(path.closest('button')!);
				return {
					stroke: getComputedStyle(path).stroke,
					text: button.color,
					background: button.backgroundColor
				};
			});
		expect(drawn.stroke).toBe(drawn.text);
		expect(drawn.stroke).not.toBe('none');
		expect(drawn.stroke).not.toBe(drawn.background);
	});
});
