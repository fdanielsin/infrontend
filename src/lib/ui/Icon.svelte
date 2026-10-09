<script lang="ts">
	import type { ClassValue, SvelteHTMLElements } from 'svelte/elements';
	import { ICONS, SIZE_CLASSES, type IconName, type IconSize } from './icons';

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
