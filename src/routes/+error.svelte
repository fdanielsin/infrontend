<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import ButtonLink from '$lib/ui/ButtonLink.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import PageShell from '$lib/ui/PageShell.svelte';

	// Rendered inside the root layout, whose skip link points at the landmark of PageShell: an error
	// page without it would leave that link with no target. Only a 404 says that the page is missing.
	const missing = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{missing ? m.error_not_found_title() : m.error_generic_title()}</title>
</svelte:head>

<PageShell
	heading={missing ? m.error_not_found_heading() : m.error_generic_heading()}
	subtitle={missing ? m.error_not_found_text() : m.error_generic_text()}
>
	<ButtonLink href={resolve('/')}>
		<Icon icon="nav-arrow-left" class="mr-1 inline align-text-bottom" />
		{m.stats_back_home()}
	</ButtonLink>
</PageShell>
