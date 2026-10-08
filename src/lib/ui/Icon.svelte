<script module lang="ts">
	import type { Component } from 'svelte';
	import type { ClassValue, SvelteHTMLElements } from 'svelte/elements';
	import Xmark from '~icons/iconoir/xmark';

	// The icons of the interface, alphabetical. One static import per icon: the bundle holds
	// the icons listed here and no others. To add one, import it and name it (design-system.md).
	const ICONS = {
		xmark: Xmark
	} satisfies Record<string, Component<SvelteHTMLElements['svg']>>;

	export type IconName = keyof typeof ICONS;
	// 16 px next to small text, 20 px by default, 24 px for headings and empty states.
	export type IconSize = 16 | 20 | 24;

	// Whole class names, so Tailwind finds them.
	const SIZE_CLASSES: Record<IconSize, string> = {
		16: 'size-4',
		20: 'size-5',
		24: 'size-6'
	};
</script>

<script lang="ts">
	// An icon is decorative: its meaning is always carried by a visible text or by the accessible
	// name of the control around it, so there is no way to name it here.
	interface Props extends Omit<
		SvelteHTMLElements['svg'],
		| 'class'
		| 'children'
		| 'width'
		| 'height'
		| 'role'
		| 'focusable'
		| 'aria-hidden'
		| 'aria-label'
		| 'aria-labelledby'
		| 'aria-describedby'
	> {
		icon: IconName;
		size?: IconSize;
		class?: ClassValue;
	}

	let { icon, size = 20, class: className, ...rest }: Props = $props();

	const Glyph = $derived(ICONS[icon]);
</script>

<!--
	The stroke stays 1.5 px whatever the size: Iconoir draws it at 1.5 on a 24 grid, so scaling the
	drawing alone would give 1 px at 16 px. `currentColor` comes from the Iconoir drawing.
-->
<Glyph
	{...rest}
	class={[SIZE_CLASSES[size], 'shrink-0 [&_*]:[vector-effect:non-scaling-stroke]', className]}
	aria-hidden="true"
	focusable="false"
/>
