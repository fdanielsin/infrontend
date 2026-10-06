import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import { cleanup } from '@testing-library/svelte';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import HomePage from '../../../src/routes/+page.svelte';
import StatsPage from '../../../src/routes/stats/+page.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({
	api: { ready: vi.fn(), getUsers: vi.fn(), getStats: vi.fn() }
}));

const READY = { success: true as const, data: { status: 'ready' as const } };
const OUTAGE = { success: false as const, error: 'x', status: 503 };
const USERS = { success: true as const, data: [{ id: 1, name: 'Ada', email: 'ada@example.com' }] };
const STATS = { success: true as const, data: { users: 1, tasks: 2 } };

const PAGES: {
	name: string;
	page: Component<Record<string, never>>;
	load: () => () => Promise<unknown>;
}[] = [
	{ name: 'home page', page: HomePage, load: () => api.getUsers },
	{ name: 'stats page', page: StatsPage, load: () => api.getStats }
];

describe.each(PAGES)('$name and the availability of the service', ({ page, load }) => {
	let app: AppState;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetAllMocks();
		vi.mocked(api.getUsers).mockResolvedValue(USERS);
		vi.mocked(api.getStats).mockResolvedValue(STATS);
		app = new AppState();
	});

	afterEach(() => {
		app.availability.destroy();
		cleanup();
		vi.useRealTimers();
	});

	it('loads its data once the service is ready (happy path)', async () => {
		vi.mocked(api.ready).mockResolvedValue(READY);

		renderWithApp(app, page);
		await vi.advanceTimersByTimeAsync(0);

		expect(vi.mocked(load())).toHaveBeenCalledTimes(1);
	});

	it('asks for nothing while the service is down, and shows no cascade of errors (sad path)', async () => {
		vi.mocked(api.ready).mockResolvedValue(OUTAGE);

		renderWithApp(app, page);
		await vi.advanceTimersByTimeAsync(30_000);

		expect(vi.mocked(load())).not.toHaveBeenCalled();
		expect(app.notifications.items.filter((toast) => toast.type === 'error')).toEqual([]);
	});

	it('loads once, and only once, when the service comes back (happy path)', async () => {
		vi.mocked(api.ready).mockResolvedValue(OUTAGE);
		renderWithApp(app, page);
		await vi.advanceTimersByTimeAsync(0);

		vi.mocked(api.ready).mockResolvedValue(READY);
		await vi.advanceTimersByTimeAsync(5_000);
		await vi.advanceTimersByTimeAsync(120_000);

		expect(vi.mocked(load())).toHaveBeenCalledTimes(1);
	});

	it('loads normally when the check answers a 4xx (boundary)', async () => {
		vi.mocked(api.ready).mockResolvedValue({ success: false, error: 'x', status: 404 });

		renderWithApp(app, page);
		await vi.advanceTimersByTimeAsync(0);

		expect(vi.mocked(load())).toHaveBeenCalledTimes(1);
	});

	it('does not load after the page is left, and leaves no subscriber (exception)', async () => {
		vi.mocked(api.ready).mockResolvedValue(OUTAGE);
		renderWithApp(app, page);
		await vi.advanceTimersByTimeAsync(0);
		cleanup();

		vi.mocked(api.ready).mockResolvedValue(READY);
		await vi.advanceTimersByTimeAsync(5_000);

		expect(vi.mocked(load())).not.toHaveBeenCalled();
	});
});
