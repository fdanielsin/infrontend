<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Tone = 'danger' | 'inverse';

	interface Props extends HTMLButtonAttributes {
		// The accessible name: an icon button has no visible text. It wins over any aria-label.
		label: string;
		tone?: Tone;
	}

	let { label, tone = 'danger', type = 'button', class: className, ...rest }: Props = $props();

	// 24 px minimum target (WCAG 2.5.8). `inverse` is for white-on-color surfaces such as toasts.
	const TONE_CLASSES: Record<Tone, string> = {
		danger:
			'inline-flex min-h-6 min-w-6 items-center justify-center rounded-control text-danger hover:text-danger-hover',
		inverse:
			'inline-flex min-h-6 min-w-6 items-center justify-center rounded-control hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse'
	};
</script>

<button {type} class={[TONE_CLASSES[tone], className]} {...rest} aria-label={label}>
	<svg
		aria-hidden="true"
		viewBox="0 0 20 20"
		class="h-4 w-4"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
	>
		<path d="M5 5l10 10M15 5L5 15" />
	</svg>
</button>
