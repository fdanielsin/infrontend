<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		children: Snippet;
	}

	// An inline error banner. It has no ARIA role on purpose: the error is announced once, by its
	// toast (see design-system.md).
	let { class: className, children, ...rest }: Props = $props();
</script>

<div class={['rounded-control bg-danger-soft p-3 wrap-anywhere text-danger', className]} {...rest}>
	{@render children()}
</div>
