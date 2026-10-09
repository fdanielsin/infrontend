<script lang="ts">
	import { tick } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { ref } from '$lib/ui/attachments';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';

	const { users, availability } = getAppState();
	let section = $state<HTMLElement>();
	const refs: { retry?: HTMLElement } = {};

	// Neither a count nor "No users yet" is claimed for data that is only not known yet. Users
	// already shown stay shown when a later load fails.
	const loaded = $derived(users.loadState === 'loaded' || users.users.length > 0);

	// The button is replaced by the loading state: the focus goes to the list first, never to <body>.
	async function retry() {
		section?.focus();
		await users.fetch();
		// The button came back after a failed retry: the keyboard user is where they were.
		if (users.loadState === 'failed') {
			await tick();
			refs.retry?.focus();
		}
	}
</script>

<Card>
	<h2 class="mb-4 text-xl font-bold">
		{loaded ? m.users_list_heading({ count: users.users.length }) : m.users_list_title()}
	</h2>
	<div bind:this={section} tabindex="-1" class="focus:outline-none">
		{#if !loaded}
			{#if availability.status === 'unavailable'}
				<p class="text-subtle">{m.users_unavailable()}</p>
			{:else if users.loadState === 'failed'}
				<p class="text-subtle">{m.users_load_failed()}</p>
				<Button
					variant="outline"
					class="mt-3"
					{@attach ref(refs, 'retry')}
					onclick={() => void retry()}
				>
					<Icon icon="refresh" size={16} class="mr-1 inline align-text-bottom" />
					{m.users_retry()}
				</Button>
			{:else}
				<p class="text-subtle">{m.users_loading()}</p>
			{/if}
		{:else if users.users.length === 0}
			<p class="text-subtle">{m.users_empty()}</p>
			<p class="mt-1 text-sm text-subtle">{m.users_empty_hint()}</p>
		{:else}
			<ul class="space-y-2">
				{#each users.users as user (user.id)}
					{@const selected = users.selected?.id === user.id}
					<li class="rounded-control bg-surface-muted">
						<!-- The selection is a fill, a bar and a check (not a ring, which is the focus). The bar
					     replaces 4px of padding so the text does not move. -->
						<button
							type="button"
							class={[
								'flex min-h-11 w-full min-w-0 items-center gap-3 rounded-control p-3 text-left',
								selected
									? 'border-l-4 border-primary bg-surface-selected pl-3'
									: 'pl-4 hover:bg-surface-hover'
							]}
							aria-pressed={selected}
							onclick={() => users.select(user.id)}
						>
							<span class="min-w-0 flex-1">
								<span class="block font-medium wrap-anywhere">{user.name}</span>
								<span class="block text-sm wrap-anywhere text-muted">{user.email}</span>
							</span>
							<Icon icon={selected ? 'check' : 'nav-arrow-right'} class="text-muted" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Card>
