<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Icon from '$lib/ui/Icon.svelte';
	import type { IconName } from '$lib/ui/icons';
	import LanguageSwitcher from '$lib/ui/LanguageSwitcher.svelte';

	interface Props extends HTMLAttributes<HTMLElement> {
		heading: string;
		// A decorative icon before the heading, hidden from assistive technology.
		icon?: IconName;
		subtitle?: string;
		// A row under the title: the way to another page.
		actions?: Snippet;
		// The landmark, for a page that moves the focus to it.
		element?: HTMLElement | undefined;
		children: Snippet;
	}

	// The frame the two pages share: one container, the language switcher at the top right, the
	// title aligned to the left under it. `main` takes the focus by script only (tabindex -1).
	let {
		heading,
		icon,
		subtitle,
		actions,
		element = $bindable(),
		children,
		class: className,
		...rest
	}: Props = $props();
</script>

<main
	id="main-content"
	bind:this={element}
	tabindex="-1"
	class={['min-h-screen p-4 focus:outline-none sm:p-8', className]}
	{...rest}
>
	<div class="mx-auto max-w-6xl">
		<header class="mb-8">
			<div class="mb-4 flex justify-end">
				<LanguageSwitcher />
			</div>
			<h1 class="text-2xl font-bold wrap-break-word hyphens-auto text-heading sm:text-4xl">
				{#if icon}<Icon {icon} size={24} class="inline align-text-bottom" />{/if}
				{heading}
			</h1>
			{#if subtitle}<p class="mt-2 text-muted">{subtitle}</p>{/if}
			{#if actions}<div class="mt-4">{@render actions()}</div>{/if}
		</header>

		{@render children()}
	</div>
</main>
