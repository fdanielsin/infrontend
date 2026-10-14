import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import collection from '@iconify-json/iconoir/icons.json';
import { api } from '$lib/api/client';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';
import type { NotificationType } from '$lib/state/notification.svelte';
import AvailabilityBanner from '$lib/features/availability/AvailabilityBanner.svelte';
import TaskForm from '$lib/features/tasks/TaskForm.svelte';
import UserForm from '$lib/features/users/UserForm.svelte';
import UserList from '$lib/features/users/UserList.svelte';
import Alert from '$lib/ui/Alert.svelte';
import Icon from '$lib/ui/Icon.svelte';
import type { IconName } from '$lib/ui/icons';
import PageShell from '$lib/ui/PageShell.svelte';
import ReferenceLine from '$lib/ui/ReferenceLine.svelte';
import TextField from '$lib/ui/TextField.svelte';
import ToastItem from '$lib/ui/ToastItem.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({
	api: {
		ready: vi.fn(),
		getUsers: vi.fn(),
		createUser: vi.fn(),
		getUser: vi.fn(),
		getUserTasks: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		deleteTask: vi.fn()
	}
}));

const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
const grace = { id: 2, name: 'Grace', email: 'grace@example.com' };
const review = { id: 10, title: 'Review', description: 'Code', user_id: 1, completed: false };
const snippet = (html: string) => createRawSnippet(() => ({ render: () => html }));
// The first drawing of an Iconoir icon, read from the set itself, not from the component.
const drawingOf = (name: string): string | undefined =>
	/ d="([^"]+)"/.exec(collection.icons[name as keyof typeof collection.icons].body)?.[1];
const drawn = (node: Element | null) => node?.querySelector('path')?.getAttribute('d');
const draw = (node: Element | null) => node?.querySelector('svg') ?? null;
const sizeOf = (svg: Element | null) => svg?.getAttribute('class') ?? '';

// Every icon the interface uses: each must exist in Iconoir (an unknown name does not build) and
// be listed in icons.ts.
const USED_ICONS: IconName[] = [
	'check',
	'check-circle',
	'copy',
	'edit-pencil',
	'graph-up',
	'group',
	'info-circle',
	'list',
	'nav-arrow-left',
	'nav-arrow-right',
	'plus',
	'refresh',
	'sort',
	'stats-report',
	'undo',
	'warning-circle',
	'warning-triangle',
	'xmark'
];

describe('icon list', () => {
	afterEach(cleanup);

	for (const icon of USED_ICONS) {
		it(`draws ${icon} (happy path)`, () => {
			const { container } = render(Icon, { props: { icon } });
			expect(drawn(container)).toBe(drawingOf(icon));
			expect(drawn(container)).toBeTruthy();
			expect(container.querySelector('svg')?.getAttribute('data-icon')).toBe(icon);
		});
	}
});

describe('no emoji as decoration', () => {
	function files(dir: string): string[] {
		return readdirSync(dir).flatMap((entry) => {
			const path = join(dir, entry);
			return statSync(path).isDirectory() ? files(path) : [path];
		});
	}

	it('keeps pictographs out of the sources and the messages (limit)', () => {
		const sources = [...files('src/routes'), ...files('src/lib/ui'), ...files('src/lib/features')]
			.concat(files('messages'))
			.filter((path) => /\.(svelte|ts|json)$/.test(path));
		const offending = sources.filter((path) =>
			/\p{Extended_Pictographic}/u.test(readFileSync(path, 'utf8'))
		);
		expect(offending).toEqual([]);
	});
});

describe('field and banner errors', () => {
	afterEach(cleanup);

	it('shows color, icon and message in an invalid field, the icon hidden from assistive technology (error)', () => {
		const { container } = render(TextField, {
			props: { id: 'f', label: 'Name', error: 'Required' }
		});

		const message = container.querySelector('#f-error');
		expect(message?.textContent?.trim()).toBe('Required');
		expect(message?.classList.contains('text-danger')).toBe(true);
		const icon = draw(message);
		expect(icon?.getAttribute('aria-hidden')).toBe('true');
		expect(sizeOf(icon)).toContain('size-4');
		expect(container.querySelector('input')?.getAttribute('aria-describedby')).toBe('f-error');
	});

	it('draws no icon without an error (boundary)', () => {
		const { container } = render(TextField, { props: { id: 'f', label: 'Name' } });
		expect(container.querySelector('svg')).toBeNull();
	});

	it('keeps the compact field error with its icon (boundary)', () => {
		const { container } = render(TextField, {
			props: { id: 'g', label: 'Name', compact: true, error: 'Too long' }
		});
		expect(draw(container.querySelector('#g-error'))).not.toBeNull();
	});

	it('puts a 20 px icon before the text of an alert (error)', () => {
		const { container } = render(Alert, {
			props: { children: createRawSnippet(() => ({ render: () => '<span>Broken</span>' })) }
		});
		expect(sizeOf(draw(container))).toContain('size-5');
		expect(container.textContent).toContain('Broken');
	});
});

describe('toasts', () => {
	afterEach(cleanup);

	const ICON_OF_TYPE: Record<NotificationType, string> = {
		success: 'check-circle',
		error: 'warning-circle',
		info: 'info-circle',
		warning: 'warning-triangle'
	};

	function renderToast(type: NotificationType, extra = {}) {
		return render(ToastItem, {
			toast: { id: 't', message: 'Hello', type, ...extra },
			onpause: vi.fn(),
			onresume: vi.fn(),
			ondismiss: vi.fn(),
			onaction: vi.fn(),
			oncopyreference: vi.fn()
		});
	}

	for (const [type, icon] of Object.entries(ICON_OF_TYPE)) {
		it(`a ${type} toast leads with its own icon, hidden, before the message (happy path)`, () => {
			const reference = render(Icon, { props: { icon: icon as IconName, size: 20 } });
			const expected = reference.container.querySelector('path')?.getAttribute('d');
			cleanup();

			const { container } = renderToast(type as NotificationType);

			const lead = container.querySelector('[data-toast-icon]');
			expect(lead?.querySelector('path')?.getAttribute('d')).toBe(expected);
			expect(lead?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
			expect(lead?.querySelector('svg')?.getAttribute('data-icon')).toBe(icon);
			expect(lead?.querySelector('svg')?.classList.contains('size-5')).toBe(true);
			expect(container.querySelector('[data-toast] > p')?.textContent?.trim()).toBe('Hello');
		});
	}

	it('renders the action as a secondary small inverse Button with its icon and visible label (happy path)', () => {
		const { container } = renderToast('error', {
			action: { label: 'Retry now', icon: 'refresh', run: vi.fn() }
		});

		const action = container.querySelector<HTMLButtonElement>('button[data-toast-action]')!;
		expect(action.textContent?.trim()).toBe('Retry now');
		expect(action.type).toBe('button');
		expect(action.classList.contains('border-on-toast')).toBe(true);
		expect(action.classList.contains('text-sm')).toBe(true);
		expect(draw(action)).not.toBeNull();
	});
});

describe('actions carry an icon and a visible text', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
		vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [review] });
		vi.mocked(api.getUser).mockResolvedValue({ success: true, data: ada });
	});

	afterEach(() => {
		app.availability.destroy();
		cleanup();
		document.body.innerHTML = '';
		overwriteGetLocale(() => 'en');
	});

	it('the create user button has a plus icon and its text (happy path)', () => {
		const { getByRole } = renderWithApp(app, UserForm);
		const button = getByRole('button', { name: 'Create User' });
		expect(draw(button)).not.toBeNull();
		expect(button.textContent?.trim()).toBe('Create User');
	});

	it('the add task, edit and order controls have icons; delete stays one cross; save and cancel have none (happy path)', async () => {
		app.tasks.tasks = [review, { ...review, id: 11, title: 'Other' }];
		const { getByRole, getAllByRole, getByLabelText } = renderWithApp(app, TaskForm, {
			user: ada
		});

		expect(draw(getByRole('button', { name: 'Add Task' }))).not.toBeNull();
		const edit = getAllByRole('button', { name: 'Edit Review' })[0]!;
		expect(draw(edit)).not.toBeNull();
		expect(edit.textContent?.trim()).toBe('Edit');
		expect(draw(getByLabelText('Sort by').closest('div'))).not.toBeNull();
		expect(getAllByRole('button', { name: 'Delete Review' })[0]?.textContent?.trim()).toBe('');

		await fireEvent.click(edit);
		expect(draw(getByRole('button', { name: 'Save' }))).toBeNull();
		expect(draw(getByRole('button', { name: 'Cancel' }))).toBeNull();
	});

	it('the description field says it is optional (boundary)', () => {
		const { getByLabelText } = renderWithApp(app, TaskForm, { user: ada });
		expect(getByLabelText('Description (optional)')).toBeTruthy();
	});

	it('the copy button has an icon and its visible text (happy path)', () => {
		const { getByRole } = render(ReferenceLine, { reference: 'req-1', oncopy: vi.fn() });
		const button = getByRole('button');
		expect(draw(button)).not.toBeNull();
		expect(button.textContent?.trim()).toBe('Copy');
	});

	it('the retry button of the outage banner and the banner itself have icons (error)', async () => {
		vi.mocked(api.ready).mockResolvedValue({ success: false, error: 'x', status: 503 });
		const view = renderWithApp(app, AvailabilityBanner);
		await app.availability.check();

		const banner = await waitFor(() => view.getByRole('region'));
		expect(draw(banner.querySelector('p'))).not.toBeNull();
		expect(draw(view.getByRole('button', { name: /Retry|Checking/ }))).not.toBeNull();
	});
});

describe('headings and rows', () => {
	afterEach(cleanup);

	it('PageShell draws the named icon at 24 px before the title (happy path)', () => {
		const { container } = renderWithApp(new AppState(), PageShell, {
			heading: 'Tasks',
			icon: 'list' as const,
			children: snippet('<p>Body</p>')
		});
		const icon = draw(container.querySelector('h1'));
		expect(sizeOf(icon)).toContain('size-6');
		expect(icon?.getAttribute('aria-hidden')).toBe('true');
	});

	it('PageShell without icon draws none (boundary)', () => {
		const { container } = renderWithApp(new AppState(), PageShell, {
			heading: 'Tasks',
			children: snippet('<p>Body</p>')
		});
		expect(draw(container.querySelector('h1'))).toBeNull();
	});

	it('user rows end with a 20 px chevron, or a check when selected, drawn from the set (happy path)', async () => {
		vi.resetAllMocks();
		vi.mocked(api.getUser).mockResolvedValue({ success: true, data: ada });
		vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });
		const app = new AppState();
		app.users.users = [ada, grace];
		const { container } = renderWithApp(app, UserList);
		const rowIcon = (index: number) =>
			container.querySelectorAll('li')[index]!.querySelector('svg');

		expect(rowIcon(0)?.getAttribute('data-icon')).toBe('nav-arrow-right');
		expect(drawn(rowIcon(0)?.parentElement ?? null)).toBe(drawingOf('nav-arrow-right'));
		expect(rowIcon(0)?.classList.contains('size-5')).toBe(true);
		expect(rowIcon(0)?.querySelector('path')?.getAttribute('stroke-width')).toBe('1.5');

		await fireEvent.click(container.querySelectorAll('button')[0]!);
		await waitFor(() => expect(rowIcon(0)?.getAttribute('data-icon')).toBe('check'));
		expect(drawn(rowIcon(0)?.parentElement ?? null)).toBe(drawingOf('check'));
		expect(rowIcon(0)?.classList.contains('size-5')).toBe(true);
		expect(drawn(rowIcon(1)?.parentElement ?? null)).toBe(drawingOf('nav-arrow-right'));
	});
});
