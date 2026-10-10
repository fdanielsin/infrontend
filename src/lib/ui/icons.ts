import type { Component } from 'svelte';
import type { SvelteHTMLElements } from 'svelte/elements';
import Check from '~icons/iconoir/check';
import CheckCircle from '~icons/iconoir/check-circle';
import Copy from '~icons/iconoir/copy';
import EditPencil from '~icons/iconoir/edit-pencil';
import Filter from '~icons/iconoir/filter';
import GraphUp from '~icons/iconoir/graph-up';
import Group from '~icons/iconoir/group';
import InfoCircle from '~icons/iconoir/info-circle';
import List from '~icons/iconoir/list';
import NavArrowLeft from '~icons/iconoir/nav-arrow-left';
import NavArrowRight from '~icons/iconoir/nav-arrow-right';
import Plus from '~icons/iconoir/plus';
import Refresh from '~icons/iconoir/refresh';
import Sort from '~icons/iconoir/sort';
import StatsReport from '~icons/iconoir/stats-report';
import Undo from '~icons/iconoir/undo';
import WarningCircle from '~icons/iconoir/warning-circle';
import WarningTriangle from '~icons/iconoir/warning-triangle';
import Xmark from '~icons/iconoir/xmark';

// The icons of the interface, alphabetical. One static import per icon: the bundle holds
// the icons listed here and no others. To add one, import it and name it (design-system.md).
export const ICONS = {
	check: Check,
	'check-circle': CheckCircle,
	copy: Copy,
	'edit-pencil': EditPencil,
	filter: Filter,
	'graph-up': GraphUp,
	group: Group,
	'info-circle': InfoCircle,
	list: List,
	'nav-arrow-left': NavArrowLeft,
	'nav-arrow-right': NavArrowRight,
	plus: Plus,
	refresh: Refresh,
	sort: Sort,
	'stats-report': StatsReport,
	undo: Undo,
	'warning-circle': WarningCircle,
	'warning-triangle': WarningTriangle,
	xmark: Xmark
} satisfies Record<string, Component<SvelteHTMLElements['svg']>>;

export type IconName = keyof typeof ICONS;
// 16 px next to small text, 20 px by default, 24 px for headings and empty states.
export type IconSize = 16 | 20 | 24;

// Whole class names, so Tailwind finds them.
export const SIZE_CLASSES: Record<IconSize, string> = {
	16: 'size-4',
	20: 'size-5',
	24: 'size-6'
};
