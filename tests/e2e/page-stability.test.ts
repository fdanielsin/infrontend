import { expect, test, type WebSocketRoute } from '@playwright/test';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// A page under test must never reload by itself in the middle of a scenario. The Vite dev client
// does it when its HMR websocket drops and comes back (a stalled machine is enough), which wipes
// the state of the test: the E2E run against a production build, which has no such socket.

test.describe('Page stability (mocked API)', () => {
	async function openWithSockets(page: import('@playwright/test').Page) {
		const sockets: WebSocketRoute[] = [];
		await page.routeWebSocket(/.*/, (socket) => {
			socket.connectToServer();
			sockets.push(socket);
		});
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.evaluate(() => {
			(window as unknown as { pageMarker: string }).pageMarker = 'same page';
		});
		return sockets;
	}

	const marker = (page: import('@playwright/test').Page) =>
		page.evaluate(() => (window as unknown as { pageMarker?: string }).pageMarker);

	test('keeps the page when nothing disconnects (happy path)', async ({ page }) => {
		// GIVEN: The home page, marked in memory.
		await openWithSockets(page);

		// WHEN: A while passes without any disconnection.
		await page.waitForTimeout(1500);

		// THEN: It is the same page.
		expect(await marker(page)).toBe('same page');
	});

	test('opens no websocket that could drop and reload the page (sad path)', async ({ page }) => {
		// GIVEN: The home page, marked in memory, with every websocket it opened.
		const sockets = await openWithSockets(page);

		// WHEN: The sockets that exist are dropped, as when the machine stalls, and the server answers.
		for (const socket of sockets) await socket.close();
		await page.waitForTimeout(3000);

		// THEN: A production build opened none (the dev client would have), and it is still the same page.
		expect(sockets, 'websockets opened by the page').toHaveLength(0);
		expect(await marker(page)).toBe('same page');
	});
});
