<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { buttonClasses } from './button-styles';

	interface Props extends HTMLAnchorAttributes {
		// Already resolved by the caller (`resolve('/stats')`).
		href: string;
		children: Snippet;
	}

	// A link to another page, with the look of a secondary button: a way elsewhere is not the
	// main action of a screen, and the way there and the way back look alike.
	let { href, class: className, children, ...rest }: Props = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller resolves href -->
<a {href} class={[buttonClasses({ variant: 'secondary' }), 'inline-block', className]} {...rest}>
	{@render children()}
</a>
