<script lang="ts">
	import { flushSync, tick } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { ref } from '$lib/ui/attachments';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';

	import { focusIfInToast, focusUndoButton } from '$lib/ui/toast-focus';
	import UserRow from './UserRow.svelte';

	const { users, availability } = getAppState();
	let section = $state<HTMLElement>();
	const refs: { retry?: HTMLElement; heading?: HTMLElement } = {};
	// One row is edited at a time. An id no longer in the list edits nothing.
	let editingId = $state<number | null>(null);
	const activeEditId = $derived(
		users.users.some((user) => user.id === editingId) ? editingId : null
	);

	// Neither a count nor "No users yet" is claimed for data that is only not known yet. Users
	// already shown stay shown when a later load fails.
	const loaded = $derived(users.loadState === 'loaded' || users.users.length > 0);

	// The user is gone from the list: the focus goes to its title, never to <body>.
	const focusHeading = () => refs.heading;

	async function remove(id: number) {
		const removed = users.remove(id, {
			onundo: (userId) => {
				// Undo runs from the toast button, which is about to disappear: the row is rendered and
				// focused now. It is not selected again.
				flushSync();
				(document.getElementById(`user-select-${userId}`) ?? refs.heading)?.focus();
			},
			onleave: () => focusIfInToast(focusHeading)
		});
		if (removed) await focusUndoButton(focusHeading);
	}

	// A user found deleted elsewhere from this list: the focus goes to the title of the list.
	$effect(() => {
		if (users.gone?.from !== 'list') return;
		users.consumeGone('list');
		void tick().then(() => refs.heading?.focus());
	});

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
	<h2 {@attach ref(refs, 'heading')} tabindex="-1" class="mb-4 text-xl font-bold">
		{loaded ? m.users_list_heading({ count: users.users.length }) : m.users_list_title()}
	</h2>
	<div bind:this={section} tabindex="-1" class="focus:outline-none">
		{#if !loaded}
			{#if availability.status === 'unavailable'}
				<p class="text-subtle">{m.users_unavailable()}</p>
			{:else if users.loadState === 'failed'}
				<p class="text-subtle">{m.users_load_failed()}</p>
				<Button
					variant="secondary"
					size="sm"
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
			<div class="py-4 text-center">
				<Icon icon="group" size={24} class="mx-auto text-subtle" />
				<p class="mt-2 text-subtle">{m.users_empty()}</p>
				<p class="mt-1 text-sm text-subtle">{m.users_empty_hint()}</p>
			</div>
		{:else}
			<ul class="@container space-y-2">
				{#each users.users as user (user.id)}
					<UserRow
						{user}
						selected={users.selected?.id === user.id}
						editing={activeEditId === user.id}
						editLocked={activeEditId !== null && activeEditId !== user.id}
						onselect={() => users.select(user.id)}
						onstartedit={() => (editingId = user.id)}
						onstopedit={() => (editingId = null)}
						ondelete={() => void remove(user.id)}
					/>
				{/each}
			</ul>
		{/if}
	</div>
</Card>
