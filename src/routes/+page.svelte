<script lang="ts">
	import UserForm from '$lib/features/users/UserForm.svelte';
	import TaskForm from '$lib/features/tasks/TaskForm.svelte';
	import ButtonLink from '$lib/ui/ButtonLink.svelte';
	import PageShell from '$lib/ui/PageShell.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	const { users, availability } = getAppState();

	onMount(() => availability.runWhenAvailable(() => users.fetch()));
</script>

<svelte:head>
	<title>{m.home_page_title()}</title>
</svelte:head>

<PageShell heading={m.home_heading()} icon="📋" subtitle={m.home_subtitle()}>
	{#snippet actions()}
		<ButtonLink href={resolve('/stats')}>
			<span aria-hidden="true">📊</span>
			{m.home_view_stats()}
		</ButtonLink>
	{/snippet}

	<div class="grid gap-8 md:grid-cols-2">
		<div class="min-w-0">
			<UserForm />
		</div>
		<div class="min-w-0">
			<!-- A task form belongs to one user: another user starts it again from scratch. -->
			{#key users.selected?.id}
				<TaskForm user={users.selected} />
			{/key}
		</div>
	</div>
</PageShell>
