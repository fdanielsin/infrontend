import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';
import {
	ada,
	adaTasks,
	grace,
	mockApi,
	type MockApi,
	type MockTask,
	type MockUser
} from '../../tests/e2e/support/mock-api.ts';
import type { Locale } from './capture-catalog.ts';

// Each state is reached the way a person reaches it, on the simulated API (tests/e2e/support/mock-api.ts).
// A driver returns when the state is on screen; the function it may return lifts what it holds back
// (an answer kept waiting), once the capture is taken.

export interface DriverContext {
	page: Page;
	locale: Locale;
	// The text of a message in the language of the capture.
	t: (key: string, params?: Record<string, string>) => string;
	root: string;
}

type Release = () => void;
export type Driver = (context: DriverContext) => Promise<Release | void>;

const catalogs = new Map<string, Record<string, string>>();

export function messageText(
	root: string,
	locale: Locale,
	key: string,
	params: Record<string, string> = {}
): string {
	let catalog = catalogs.get(locale);
	if (!catalog) {
		catalog = JSON.parse(
			readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8')
		) as Record<string, string>;
		catalogs.set(locale, catalog);
	}
	const message = catalog[key];
	if (message === undefined) throw new Error(`messages/${locale}.json has no key "${key}".`);
	return Object.entries(params).reduce(
		(text, [name, value]) => text.replace(`{${name}}`, value),
		message
	);
}

const lastTask: MockTask = {
	id: 12,
	title: 'Write the release notes',
	description: 'Keep it short.',
	user_id: 1,
	completed: false
};
const tasks: MockTask[] = [...adaTasks, lastTask];

const LONG_NAME = 'Maximiliano Alexandrovich Featherstonehaugh-Wolfeschlegelsteinhausen';
const longUser: MockUser = {
	id: 3,
	name: LONG_NAME,
	email: 'maximiliano.alexandrovich.featherstonehaugh-wolfeschlegelsteinhausen@example.com'
};
const longTasks: MockTask[] = [
	{
		id: 30,
		title: 'Reconcile the quarterly statements of every regional subsidiary before the audit',
		description:
			'A description that goes on and on, to show how a long text is clamped or wrapped: '.repeat(
				6
			),
		user_id: 3,
		completed: false
	}
];

// An answer to a GET that waits for `release`, then goes on to the simulated API.
function hold(page: Page, pattern: RegExp): Release {
	let release: Release = () => {};
	const gate = new Promise<void>((resolve) => (release = resolve));
	void page.route(
		(url) => pattern.test(url.pathname),
		async (route: Route) => {
			if (route.request().method() !== 'GET') return route.fallback();
			await gate;
			// The page may be gone by then: nothing is left to answer.
			await route.fallback().catch(() => {});
		}
	);
	return release;
}

const pick = (context: DriverContext, user: MockUser) =>
	context.page.locator(`#user-select-${user.id}`);

async function selectUser(context: DriverContext, user: MockUser) {
	await pick(context, user).click();
	await context.page
		.getByRole('heading', { name: context.t('tasks_for_user', { name: user.name }) })
		.waitFor();
}

async function open(
	context: DriverContext,
	api: Partial<Parameters<typeof mockApi>[1]>,
	path = '/'
) {
	const mock = await mockApi(context.page, api);
	await context.page.goto(path);
	return mock;
}

const usersRest = { users: [ada, grace], tasks };
const home: Record<string, Driver> = {
	async rest(context) {
		await open(context, usersRest);
		await pick(context, ada).waitFor();
	},
	async empty(context) {
		await open(context, {});
		await context.page.getByText(context.t('users_empty'), { exact: true }).waitFor();
	},
	async loading(context) {
		const api = await mockApi(context.page, usersRest);
		void api;
		const release = hold(context.page, /\/api\/v1\/users$/);
		await context.page.goto('/');
		await context.page.getByText(context.t('users_loading'), { exact: true }).waitFor();
		return release;
	},
	async error(context) {
		const api = await mockApi(context.page, usersRest);
		api.failNext('GET /users', { status: 404, error: 'Not found', code: 'ROUTE_NOT_FOUND' });
		await context.page.goto('/');
		await context.page.getByText(context.t('users_load_failed'), { exact: true }).waitFor();
	},
	async outage(context) {
		const api = await mockApi(context.page, usersRest);
		api.readiness = 'unreachable';
		await context.page.goto('/');
		await context.page.getByText(context.t('users_unavailable'), { exact: true }).waitFor();
	},
	async 'long-text'(context) {
		await open(context, { users: [longUser, ada], tasks: longTasks });
		await selectUser(context, longUser);
		await context.page.locator('#task-30').waitFor();
	},
	async 'user-form-invalid'(context) {
		await open(context, usersRest);
		await context.page.getByRole('button', { name: context.t('users_create_button') }).click();
		await context.page.locator('#name[aria-invalid="true"]').waitFor();
	},
	async selected(context) {
		await open(context, usersRest);
		await selectUser(context, ada);
		await context.page.locator('#task-12').waitFor();
	},
	async 'selected-empty'(context) {
		await open(context, usersRest);
		await selectUser(context, grace);
		await context.page.getByText(context.t('tasks_empty'), { exact: true }).waitFor();
	},
	async 'tasks-loading'(context) {
		await open(context, usersRest);
		const release = hold(context.page, /\/api\/v1\/users\/\d+\/tasks$/);
		await pick(context, ada).click();
		await context.page
			.getByRole('heading', { name: context.t('tasks_for_user', { name: ada.name }) })
			.waitFor();
		return release;
	},
	async 'tasks-error'(context) {
		const api = await open(context, usersRest);
		api.failNext('GET /users/{id}/tasks', {
			status: 500,
			error: 'Internal error',
			code: 'INTERNAL_ERROR'
		});
		await pick(context, ada).click();
		await context.page.locator('[data-toast]').first().waitFor();
	},
	async 'task-form-invalid'(context) {
		await open(context, usersRest);
		await selectUser(context, ada);
		await context.page.getByRole('button', { name: context.t('tasks_add_button') }).click();
		await context.page.locator('#title[aria-invalid="true"]').waitFor();
	},
	async 'user-edit'(context) {
		await open(context, usersRest);
		await context.page
			.getByRole('button', {
				name: context.t('users_edit_named', { name: ada.name, email: ada.email })
			})
			.click();
		await context.page.locator('#user-name-1').waitFor();
	},
	async 'user-edit-invalid'(context) {
		await open(context, usersRest);
		await context.page
			.getByRole('button', {
				name: context.t('users_edit_named', { name: ada.name, email: ada.email })
			})
			.click();
		await context.page.locator('#user-name-1').fill('');
		await context.page.getByRole('button', { name: context.t('users_save') }).click();
		await context.page.locator('#user-name-1[aria-invalid="true"]').waitFor();
	},
	async 'task-edit'(context) {
		await open(context, usersRest);
		await selectUser(context, ada);
		await context.page
			.getByRole('button', {
				name: context.t('tasks_edit_named', { title: 'Review' }),
				exact: true
			})
			.click();
		await context.page.locator('#edit-title-10').waitFor();
	},
	async 'user-delete-pending'(context) {
		await open(context, usersRest);
		await context.page
			.getByRole('button', {
				name: context.t('users_delete_named', { name: ada.name, email: ada.email })
			})
			.click();
		await context.page
			.getByRole('status')
			.getByRole('button', { name: context.t('users_undo_delete') })
			.waitFor();
	},
	async 'task-delete-pending'(context) {
		await open(context, usersRest);
		await selectUser(context, ada);
		await context.page
			.getByRole('button', {
				name: context.t('tasks_delete_named', { title: 'Review' }),
				exact: true
			})
			.click();
		await context.page
			.getByRole('status')
			.getByRole('button', { name: context.t('tasks_undo_delete') })
			.waitFor();
	}
};

const stats: Record<string, Driver> = {
	async rest(context) {
		await open(context, usersRest, '/stats');
		await context.page.locator('[data-stat]').first().waitFor();
	},
	async empty(context) {
		await open(context, {}, '/stats');
		await context.page.getByText(context.t('stats_empty'), { exact: true }).waitFor();
	},
	async loading(context) {
		await mockApi(context.page, usersRest);
		const release = hold(context.page, /\/api\/v1\/stats$/);
		await context.page.goto('/stats');
		await context.page.getByText(context.t('stats_loading'), { exact: true }).waitFor();
		return release;
	},
	async error(context) {
		const api = await mockApi(context.page, usersRest);
		api.failNext('GET /stats', { status: 500, error: 'Internal error', code: 'INTERNAL_ERROR' });
		await context.page.goto('/stats');
		await context.page.getByText(context.t('stats_load_failed'), { exact: true }).waitFor();
	},
	async outage(context) {
		const api: MockApi = await mockApi(context.page, usersRest);
		api.readiness = 'unreachable';
		await context.page.goto('/stats');
		await context.page.getByText(context.t('stats_unavailable'), { exact: true }).waitFor();
	}
};

export const DRIVERS: Record<'home' | 'stats', Record<string, Driver>> = { home, stats };
