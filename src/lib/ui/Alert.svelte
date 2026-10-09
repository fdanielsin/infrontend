<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Icon from '$lib/ui/Icon.svelte';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		children: Snippet;
	}

	// An inline error banner. It has no ARIA role on purpose: the error is announced once, by its
	// toast (see design-system.md).
	let { class: className, children, ...rest }: Props = $props();
</script>

<div
	class={['flex items-start gap-2 rounded-control bg-danger-soft p-3 text-danger', className]}
	{...rest}
>
	<Icon icon="warning-circle" />
	<div class="min-w-0 wrap-anywhere">{@render children()}</div>
</div>
