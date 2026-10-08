<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Variant = 'outlined' | 'raised' | 'flat';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		variant?: Variant;
		padding?: 'md' | 'lg';
		children: Snippet;
	}

	let {
		variant = 'outlined',
		padding = 'md',
		class: className,
		children,
		...rest
	}: Props = $props();

	const VARIANT_CLASSES: Record<Variant, string> = {
		outlined: 'rounded-card border border-line bg-surface shadow-card',
		raised: 'rounded-card bg-surface shadow-card-raised transition hover:shadow-card-raised-hover',
		flat: 'rounded-card bg-surface shadow-card-raised'
	};
	const PADDING_CLASSES = { md: 'p-4 sm:p-6', lg: 'p-6 sm:p-8' };
</script>

<div class={[VARIANT_CLASSES[variant], PADDING_CLASSES[padding], className]} {...rest}>
	{@render children()}
</div>
