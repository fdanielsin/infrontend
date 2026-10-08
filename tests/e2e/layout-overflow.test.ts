import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mockApi, type MockTask, type MockUser } from './support/mock-api';

// Layout (320 px, WCAG 1.4.10): whatever a user typed, at the longest length the API accepts and
// without a single space, nothing makes the page wider than the window, and the page background
// belongs to the page, not to <main>. The API is mocked; the page is a production build.

type Locale = 'en' | 'fr' | 'de' | 'es';
const LOCALES: Locale[] = ['en', 'fr', 'de', 'es'];
const WIDTHS = [1280, 768, 375, 320];

// Longest values of the contract (name 100, e-mail 254, title 200, description 2000), no space.
const LONGEST_USER: MockUser = {
	id: 1,
	name: 'N'.repeat(100),
	email: `${'a'.repeat(64)}@${'d'.repeat(185)}.com`
};
const LONGEST_TASKS: MockTask[] = [
	{ id: 10, title: 'T'.repeat(200), description: 'D'.repeat(2000), user_id: 1, completed: false },
	{ id: 11, title: 'é<&>'.repeat(50), description: 'é<&>'.repeat(500), user_id: 1, completed: true }
];

async function chooseLocaleCookie(context: BrowserContext, locale: Locale) {
	await context.addCookies([
		{ name: 'PARAGLIDE_LOCALE', value: locale, url: 'http://localhost:4173' }
	]);
}

// Elements (and the document) whose right edge is past the window.
async function overflowing(page: Page) {
	return page.evaluate(() => {
		const width = document.documentElement.clientWidth;
		const wide: string[] = [];
		if (document.documentElement.scrollWidth > width) wide.push('<html> scrolls sideways');
		if (document.body.scrollWidth > width) wide.push('<body> scrolls sideways');
		for (const element of document.body.querySelectorAll('*')) {
			const box = element.getBoundingClientRect();
			if (box.width > 0 && box.right > width + 0.5) {
				wide.push(`${element.tagName.toLowerCase()} ${element.className?.toString().slice(0, 40)}`);
			}
		}
		return wide.slice(0, 5);
	});
}

// Cards of the two panels: inside the window, and side by side without overlapping.
async function cardsAreContained(page: Page, expectSideBySide: boolean) {
	const cards = await page.locator('main .rounded-card').evaluateAll((nodes) =>
		nodes
			.filter((node) => node.parentElement?.closest('.rounded-card') === null)
			.map((node) => {
				const box = node.getBoundingClientRect();
				return { left: box.left, right: box.right };
			})
	);
	const width = await page.evaluate(() => document.documentElement.clientWidth);
	// The form and the user list (left column), then the tasks (right column).
	expect.soft(cards.length).toBeGreaterThanOrEqual(3);
	for (const card of cards) expect.soft(card.right).toBeLessThanOrEqual(width + 0.5);
	const first = cards[0];
	const last = cards[cards.length - 1];
	if (expectSideBySide && first && last) {
		expect.soft(first.right).toBeLessThanOrEqual(last.left + 0.5);
	}
}

async function pageBackground(page: Page) {
	return page.evaluate(() => {
		const root = document.documentElement;
		const main = document.querySelector('main');
		const footer = document.querySelector('footer');
		return {
			rootImage: getComputedStyle(root).backgroundImage,
			mainImage: main ? getComputedStyle(main).backgroundImage : '',
			rootHeight: root.getBoundingClientRect().height,
			scrollHeight: root.scrollHeight,
			viewportHeight: window.innerHeight,
			footerBottom: footer ? footer.getBoundingClientRect().bottom + window.scrollY : 0
		};
	});
}

async function expectPageBackground(page: Page) {
	const background = await pageBackground(page);
	// The gradient is carried by <html>, so it covers the whole scrollable area.
	expect.soft(background.rootImage).toContain('linear-gradient');
	expect.soft(background.mainImage).toBe('none');
	expect.soft(background.rootHeight).toBeGreaterThanOrEqual(background.viewportHeight);
	expect.soft(background.rootHeight).toBeGreaterThanOrEqual(background.scrollHeight - 1);
	expect.soft(background.footerBottom).toBeLessThanOrEqual(background.rootHeight + 1);
}

// Selects the only user of the list and waits for its tasks.
async function openHomeWithUser(page: Page) {
	await page.goto('/');
	await page.locator('button[aria-pressed]').first().click();
	await page.getByRole('checkbox').first().waitFor();
	await scrollSettled(page);
}

// In a single column the page scrolls to the tasks after a selection (smoothly): measures wait for
// it, or the boxes of two elements would be taken at two different scroll positions.
async function scrollSettled(page: Page) {
	await page.evaluate(
		() =>
			new Promise<void>((done) => {
				let last = -1;
				let stable = 0;
				const tick = () => {
					stable = window.scrollY === last ? stable + 1 : 0;
					last = window.scrollY;
					if (stable >= 5) done();
					else requestAnimationFrame(tick);
				};
				tick();
			})
	);
}

test.describe('Layout without sideways scroll (mocked API)', () => {
	test.describe('limits: the longest values, unbroken', () => {
		for (const locale of LOCALES) {
			for (const width of WIDTHS) {
				test(`home, edit row and statistics at ${width} px in ${locale} (limit)`, async ({
					page,
					context
				}) => {
					// GIVEN: A user and tasks at the maximum length of every field, in one language.
					await page.setViewportSize({ width, height: 800 });
					await chooseLocaleCookie(context, locale);
					await mockApi(page, {
						users: [LONGEST_USER],
						tasks: LONGEST_TASKS,
						stats: { users: 123456789, tasks: 987654321 }
					});

					// WHEN: The home page shows them, with the first task in edition.
					await openHomeWithUser(page);

					// THEN: Nothing is wider than the window, and the background is the page's.
					expect.soft(await overflowing(page), 'home').toEqual([]);
					await cardsAreContained(page, width >= 768);
					await expectPageBackground(page);

					await page.locator('li:has(input[type=checkbox]) button').first().click();
					expect(await overflowing(page), 'home, task in edition').toEqual([]);

					// AND: The statistics page holds the same promise.
					await page.goto('/stats');
					await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
					await expect(page.locator('main')).toContainText(/987\D?654\D?321/);
					expect(await overflowing(page), 'statistics').toEqual([]);
					await expectPageBackground(page);
				});
			}
		}
	});

	test.describe('boundary values', () => {
		for (const [width, narrow] of [
			[767, true],
			[768, false]
		] as const) {
			test(`the two columns start at 768 px, not before (${width} px)`, async ({ page }) => {
				// GIVEN: A user with a task, at the width just under and at the breakpoint.
				await page.setViewportSize({ width, height: 900 });
				const user = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' };
				await mockApi(page, {
					users: [user],
					tasks: [{ id: 10, title: 'Review', description: 'Code', user_id: 1, completed: false }]
				});

				// WHEN: The home page shows the user and the tasks.
				await openHomeWithUser(page);

				// THEN: The panels are side by side from 768 px, stacked under it, without overflow.
				const [users, tasks] = [
					await page.locator('main h2').nth(0).boundingBox(),
					await page.locator('main h2').nth(2).boundingBox()
				];
				expect(users && tasks).toBeTruthy();
				if (users && tasks) {
					if (narrow) expect(tasks.y).toBeGreaterThan(users.y + users.height);
					else expect(Math.abs(tasks.y - users.y)).toBeLessThan(4);
				}
				expect(await overflowing(page)).toEqual([]);
			});
		}

		test('one-character values leave nothing wider than the window (boundary)', async ({
			page
		}) => {
			// GIVEN: The shortest values the form accepts, at the narrowest width.
			await page.setViewportSize({ width: 320, height: 800 });
			const user = { id: 1, name: 'A', email: 'a@b.c' };
			await mockApi(page, {
				users: [user],
				tasks: [{ id: 10, title: 'T', description: '', user_id: 1, completed: false }],
				stats: { users: 0, tasks: 0 }
			});

			// WHEN / THEN: The home and statistics pages fit.
			await openHomeWithUser(page);
			expect(await overflowing(page)).toEqual([]);
			await page.goto('/stats');
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			expect(await overflowing(page)).toEqual([]);
		});
	});

	test.describe('nominal: readable text on a narrow screen', () => {
		const TITLE = 'Préparer la présentation du trimestre prochain avec toute équipe';

		test('a task title gets the width of the card; the actions go under it at 320 px', async ({
			page
		}) => {
			// GIVEN: A task with a normal title, on a 320 px screen.
			await page.setViewportSize({ width: 320, height: 800 });
			const user = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' };
			await mockApi(page, {
				users: [user],
				tasks: [
					{ id: 10, title: TITLE, description: 'Avec les chiffres', user_id: 1, completed: false }
				]
			});

			// WHEN: The task is listed.
			await openHomeWithUser(page);
			const label = await page.getByText(TITLE, { exact: true }).boundingBox();
			const edit = await page.getByRole('button', { name: /^Edit/ }).boundingBox();

			// THEN: The text keeps most of the width (it was 110 px) and the actions are below it.
			expect(label && edit).toBeTruthy();
			if (label && edit) {
				expect(label.width).toBeGreaterThan(190);
				expect(edit.y).toBeGreaterThanOrEqual(label.y + label.height - 1);
			}
		});

		test('on a wide screen the actions stay beside the text', async ({ page }) => {
			// GIVEN: The same task on a 1280 px screen.
			await page.setViewportSize({ width: 1280, height: 800 });
			const user = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' };
			await mockApi(page, {
				users: [user],
				tasks: [
					{ id: 10, title: TITLE, description: 'Avec les chiffres', user_id: 1, completed: false }
				]
			});

			// WHEN: It is listed.
			await openHomeWithUser(page);
			const label = await page.getByText(TITLE, { exact: true }).boundingBox();
			const edit = await page.getByRole('button', { name: /^Edit/ }).boundingBox();

			// THEN: "Edit" is on the line of the title.
			expect(label && edit).toBeTruthy();
			if (label && edit) expect(edit.y).toBeLessThan(label.y + label.height);
		});

		for (const width of [375, 320]) {
			test(`page margin and card padding leave the room to read at ${width} px`, async ({
				page
			}) => {
				// GIVEN: The empty home page on a narrow screen.
				await page.setViewportSize({ width, height: 800 });
				await mockApi(page, { users: [] });

				// WHEN: It is shown.
				await page.goto('/');
				const field = await page.getByLabel(/Name/).boundingBox();

				// THEN: The form field is at least 240 px wide at 320 px (it was 208 px).
				expect(field).toBeTruthy();
				if (field) expect(field.width).toBeGreaterThanOrEqual(width - 80);
			});
		}
	});

	test.describe('errors: banner and alert with long texts', () => {
		for (const width of [320, 768]) {
			test(`the banner fits and reads from the left at ${width} px (error)`, async ({ page }) => {
				// GIVEN: An outage whose reference is one long unbroken identifier.
				await page.setViewportSize({ width, height: 800 });
				const api = await mockApi(page, { users: [] });
				api.readiness = 503;
				api.readinessRequestId = 'req'.repeat(40);

				// WHEN: The home page is opened.
				await page.goto('/');
				const banner = page.getByRole('region', { name: /Service status/ });
				await expect(banner).toBeVisible();

				// THEN: The banner fits; under 640 px its text is aligned to the left.
				expect(await overflowing(page)).toEqual([]);
				if (width < 640) {
					const alignment = await banner.evaluate((node) => getComputedStyle(node).textAlign);
					expect(['left', 'start']).toContain(alignment);
				}
			});
		}

		test('a long server message in an inline error fits at 320 px (technical exception)', async ({
			page
		}) => {
			// GIVEN: A server error that quotes a long unbroken value.
			// (No entry animation: a toast is measured where it rests, not mid-slide.)
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.setViewportSize({ width: 320, height: 800 });
			const api = await mockApi(page, { users: [] });
			api.failNext('POST /users', { status: 500, error: `Cannot create ${'x'.repeat(300)}` });
			await page.goto('/');

			// WHEN: The user form is submitted.
			await page.getByLabel(/Name/).fill('Ada');
			await page.getByLabel(/Email/).fill('ada@example.com');
			await page.getByRole('button', { name: /Create User/ }).click();
			await expect(page.getByText(/Cannot create/).first()).toBeVisible();

			// THEN: Neither the inline alert nor the toast widens the page.
			expect(await overflowing(page)).toEqual([]);
		});

		test('a statistics error with a long message fits at 320 px (technical exception)', async ({
			page
		}) => {
			// GIVEN: A statistics call that fails with a long message.
			// (No entry animation: a toast is measured where it rests, not mid-slide.)
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.setViewportSize({ width: 320, height: 800 });
			const api = await mockApi(page, { users: [] });
			api.failNext('GET /stats', { status: 400, error: `Bad ${'y'.repeat(300)}` });

			// WHEN: The statistics page is opened.
			await page.goto('/stats');
			await expect(page.getByText(/Bad y/).first()).toBeVisible();

			// THEN: The page does not scroll sideways.
			expect(await overflowing(page)).toEqual([]);
		});
	});
});
