// The table of the contrast pairs of the interface (THEME-R08, appearance.md "Parcours et états"),
// the one source of the pairs measured in both themes. A pair is a foreground token, the background
// tokens it sits on and the ratio it must reach: 4.5 for a text (WCAG 1.4.3), 3 for what is not a text
// (a border, a check, a focus ring: WCAG 1.4.11). `page` is the two ends of the gradient behind
// the whole page. A token that is on no pair is in EXCEPTIONS, with its reason.
//
// The values are not here: they are those of the page, read in the rendered page for each theme. A
// pair listed for the dark theme only (`themes`) is one whose light version does not exist.

export type PairBackground = `--color-${string}` | 'page';

export interface Pair {
	name: string;
	foreground: `--color-${string}`;
	backgrounds: PairBackground[];
	minimum: 3 | 4.5;
	themes?: ('light' | 'dark')[];
}

export const PAIRS: Pair[] = [
	{
		name: 'titles and figures',
		foreground: '--color-heading',
		backgrounds: [
			'--color-surface',
			'--color-surface-muted',
			'--color-surface-hover',
			'--color-surface-selected',
			'page'
		],
		minimum: 4.5
	},
	{
		name: 'field labels',
		foreground: '--color-label',
		backgrounds: ['--color-surface', '--color-surface-muted'],
		minimum: 4.5
	},
	{
		name: 'secondary text, also under the pointer and on the selected row',
		foreground: '--color-muted',
		backgrounds: [
			'--color-surface',
			'--color-surface-muted',
			'--color-surface-hover',
			'--color-surface-selected',
			'page'
		],
		minimum: 4.5
	},
	{
		// On a card only (every use is in a Card: empty states, hints). Never on surface-muted or
		// surface-hover (appearance.md), nor on the page gradient: 3.93:1 at its light end, which it
		// never sits on.
		name: 'empty states and hints',
		foreground: '--color-subtle',
		backgrounds: ['--color-surface'],
		minimum: 4.5
	},
	{
		// "Edit" of a row, also under the pointer: blue-300 on the first dark hover color was 4.17:1.
		name: 'action text and links, also under the pointer',
		foreground: '--color-action-strong',
		backgrounds: [
			'--color-surface',
			'--color-surface-muted',
			'--color-surface-hover',
			'--color-surface-selected',
			'page'
		],
		minimum: 4.5
	},
	{
		name: 'action text hovered',
		foreground: '--color-action-strong-hover',
		backgrounds: ['--color-surface', '--color-surface-muted'],
		minimum: 4.5
	},
	{
		// The delete cross of a row, also under the pointer, and the error text.
		name: 'error text and the delete cross, also under the pointer',
		foreground: '--color-danger',
		backgrounds: [
			'--color-surface',
			'--color-surface-muted',
			'--color-surface-hover',
			'--color-danger-soft',
			'page'
		],
		minimum: 4.5
	},
	{
		name: 'the delete cross hovered',
		foreground: '--color-danger-hover',
		backgrounds: ['--color-surface', '--color-surface-muted'],
		minimum: 4.5
	},
	{
		name: 'valid field: its check and border',
		foreground: '--color-success',
		backgrounds: ['--color-surface', '--color-surface-muted'],
		minimum: 3
	},
	{
		name: 'text of the primary button',
		foreground: '--color-on-primary',
		backgrounds: ['--color-primary', '--color-primary-hover'],
		minimum: 4.5
	},
	{
		name: 'text of a toast',
		foreground: '--color-on-toast',
		backgrounds: [
			'--color-success-solid',
			'--color-danger-solid',
			'--color-warning',
			'--color-info'
		],
		minimum: 4.5
	},
	{
		name: 'focus ring on a toast',
		foreground: '--color-focus-inverse',
		backgrounds: [
			'--color-success-solid',
			'--color-danger-solid',
			'--color-warning',
			'--color-info'
		],
		minimum: 3
	},
	{
		name: 'the one focus ring',
		foreground: '--color-focus',
		backgrounds: [
			'--color-surface',
			'--color-surface-muted',
			'--color-surface-hover',
			'--color-surface-selected',
			'page'
		],
		minimum: 3
	},
	{
		name: 'border of a field',
		foreground: '--color-field-border',
		backgrounds: ['--color-surface', '--color-surface-muted', 'page'],
		minimum: 3
	},
	{
		name: 'selection edge: the active theme button and the selected row',
		foreground: '--color-accent',
		backgrounds: ['--color-surface', '--color-surface-selected', 'page'],
		minimum: 3
	},
	{
		// The ring around the native box of a task, under the pointer too (none in light: transparent).
		name: 'ring of the native checkbox',
		foreground: '--color-control-edge',
		backgrounds: ['--color-surface-muted', '--color-surface-hover'],
		minimum: 3,
		themes: ['dark']
	},
	...(
		[
			['success', '--color-success-edge'],
			['error', '--color-danger-edge'],
			['warning', '--color-warning-edge'],
			['info', '--color-info-edge']
		] as const
	).map(([type, edge]): Pair => ({
		name: `left edge of a ${type} toast, against the page`,
		foreground: edge,
		backgrounds: ['page'],
		minimum: 3
	}))
];

// Tokens that are on no pair, each with its reason.
export const EXCEPTIONS: Record<string, string> = {
	'--color-surface': 'a background: it is the background of the pairs above',
	'--color-surface-muted': 'a background: it is the background of the pairs above',
	'--color-surface-hover': 'a background: it is the background of the pairs above',
	'--color-surface-selected': 'a background: it is the background of the pairs above',
	'--color-page-from': 'a background (the gradient): it is the `page` of the pairs above',
	'--color-page-to': 'a background (the gradient): it is the `page` of the pairs above',
	'--color-primary': 'a background: the one of the text of the primary button',
	'--color-primary-hover': 'a background: the one of the text of the primary button',
	'--color-danger-soft': 'a background: the one of the error text',
	'--color-success-solid': 'a background: the one of the text of a success toast',
	'--color-danger-solid': 'a background: the one of the text of an error toast',
	'--color-warning': 'a background: the one of the text of a warning toast',
	'--color-info': 'a background: the one of the text of an info toast',
	'--color-line': 'decorative (a card frame, a separator): WCAG 1.4.11 does not ask for it',
	'--color-disabled': 'a disabled control is exempt from contrast (WCAG 1.4.3 and 1.4.11)',
	'--color-on-toast-hover':
		'a 20% white veil over the toast: the text keeps the ratio of its toast (pair above)'
};
