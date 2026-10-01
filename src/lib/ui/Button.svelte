<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'success' | 'strong' | 'outline' | 'link';

	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		children: Snippet;
	}

	let {
		variant = 'primary',
		type = 'button',
		class: className,
		children,
		...rest
	}: Props = $props();

	// Whole class names, so Tailwind finds them.
	const VARIANT_CLASSES: Record<Variant, string> = {
		primary:
			'w-full rounded-control bg-primary px-4 py-2 text-white hover:bg-primary-hover disabled:bg-disabled',
		success:
			'w-full rounded-control bg-success px-4 py-2 text-white hover:bg-success-hover disabled:bg-disabled',
		strong: 'min-h-6 rounded-control bg-action-strong px-2 py-1 text-sm text-white',
		outline: 'min-h-6 rounded-control border px-2 py-1 text-sm',
		link: 'min-h-6 rounded-control px-1 text-action-strong hover:text-action-strong-hover'
	};
</script>

<button {type} class={[VARIANT_CLASSES[variant], className]} {...rest}>
	{@render children()}
</button>
