<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import {
		buttonClasses,
		type ButtonSize,
		type ButtonTone,
		type ButtonVariant
	} from './button-styles';

	interface Props extends HTMLButtonAttributes {
		variant?: ButtonVariant;
		size?: ButtonSize;
		tone?: ButtonTone;
		// Full width, for the submit button of a form.
		block?: boolean;
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		tone = 'default',
		block = false,
		type = 'button',
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<button {type} class={[buttonClasses({ variant, size, tone, block }), className]} {...rest}>
	{@render children()}
</button>
