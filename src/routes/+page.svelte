<script lang="ts">
	import UserForm from '$lib/features/users/UserForm.svelte';
	import TaskForm from '$lib/features/tasks/TaskForm.svelte';
	import LanguageSwitcher from '$lib/ui/LanguageSwitcher.svelte';
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

<main
	tabindex="-1"
	class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 focus:outline-none"
>
	<div class="mx-auto max-w-6xl">
		<header class="mb-8 text-center">
			<div class="mb-4 flex justify-end">
				<LanguageSwitcher />
			</div>
			<h1 class="text-4xl font-bold wrap-break-word hyphens-auto text-gray-900">
				<span aria-hidden="true">📋</span>
				{m.home_heading()}
			</h1>
			<p class="mt-2 text-muted">{m.home_subtitle()}</p>
			<div class="mt-4">
				<a
					href={resolve('/stats')}
					class="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-white transition hover:bg-indigo-700"
				>
					<span aria-hidden="true">📊</span>
					{m.home_view_stats()}
				</a>
			</div>
		</header>

		<div class="grid gap-8 lg:grid-cols-2">
			<div>
				<UserForm />
			</div>
			<div>
				<TaskForm user={users.selected} />
			</div>
		</div>
	</div>
</main>
