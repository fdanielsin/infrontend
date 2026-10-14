<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from '$lib/ui/Icon.svelte';

	type Tone = 'danger' | 'inverse';

	interface Props extends HTMLButtonAttributes {
		// The accessible name: an icon button has no visible text. It wins over any aria-label.
		label: string;
		tone?: Tone;
	}

	let { label, tone = 'danger', type = 'button', class: className, ...rest }: Props = $props();

	// 24 px minimum target (WCAG 2.5.8), 44 px for a coarse pointer. `inverse` is for white-on-color
	// surfaces such as toasts.
	const TONE_CLASSES: Record<Tone, string> = {
		danger:
			'inline-flex min-h-6 min-w-6 pointer-coarse:min-h-11 pointer-coarse:min-w-11 items-center justify-center rounded-control text-danger hover:text-danger-hover',
		inverse:
			'inline-flex min-h-6 min-w-6 pointer-coarse:min-h-11 pointer-coarse:min-w-11 items-center justify-center rounded-control hover:bg-on-toast-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse'
	};
</script>

<button {type} class={[TONE_CLASSES[tone], className]} {...rest} aria-label={label}>
	<Icon icon="xmark" size={16} />
</button>
