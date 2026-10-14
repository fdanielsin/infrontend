// What the capture set holds: the screens, their states, the widths and the languages. Pure data,
// no browser: the plan and its tests read it, the drivers (capture-drivers.ts) give each state its
// way of being reached.

export const WIDTHS = [320, 768, 1280] as const;
export type Width = (typeof WIDTHS)[number];

// The languages of messages/*.json (a test compares both lists).
export const LOCALES = ['en', 'fr', 'de', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

export const SCREENS = ['home', 'stats'] as const;
export type Screen = (typeof SCREENS)[number];

export interface CaptureState {
	screen: Screen;
	name: string;
	// What the capture shows, for the index the designer reads.
	description: string;
}

export const STATES: readonly CaptureState[] = [
	{ screen: 'home', name: 'rest', description: 'Two users in the list, none selected.' },
	{ screen: 'home', name: 'empty', description: 'No user yet.' },
	{ screen: 'home', name: 'loading', description: 'The list of users is on its way.' },
	{ screen: 'home', name: 'error', description: 'The list failed to load, with Retry.' },
	{ screen: 'home', name: 'outage', description: 'The service does not answer: the banner.' },
	{ screen: 'home', name: 'long-text', description: 'Very long names, emails and task titles.' },
	{ screen: 'home', name: 'user-form-invalid', description: 'The create form, sent empty.' },
	{ screen: 'home', name: 'selected', description: 'A user is selected, with three tasks.' },
	{ screen: 'home', name: 'selected-empty', description: 'A user is selected, without a task.' },
	{ screen: 'home', name: 'tasks-loading', description: 'The tasks of the user are on their way.' },
	{ screen: 'home', name: 'tasks-error', description: 'The tasks failed to load.' },
	{ screen: 'home', name: 'task-form-invalid', description: 'The add-task form, sent empty.' },
	{ screen: 'home', name: 'user-edit', description: 'The name of a user is being edited.' },
	{ screen: 'home', name: 'user-edit-invalid', description: 'The edited name is empty and sent.' },
	{ screen: 'home', name: 'task-edit', description: 'A task is being edited.' },
	{
		screen: 'home',
		name: 'user-delete-pending',
		description: 'A user was deleted: the row left, Undo is offered.'
	},
	{
		screen: 'home',
		name: 'task-delete-pending',
		description: 'A task was deleted: the row left, Undo is offered.'
	},
	{ screen: 'stats', name: 'rest', description: 'The three figures.' },
	{ screen: 'stats', name: 'empty', description: 'Nothing to count yet.' },
	{ screen: 'stats', name: 'loading', description: 'The figures are on their way.' },
	{ screen: 'stats', name: 'error', description: 'The figures failed to load, with Retry.' },
	{ screen: 'stats', name: 'outage', description: 'The service does not answer: the banner.' }
];
