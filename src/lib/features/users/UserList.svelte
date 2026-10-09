<script lang="ts">
	import Card from '$lib/ui/Card.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';

	const { users } = getAppState();
</script>

<Card>
	<h2 class="mb-4 text-xl font-bold">{m.users_list_heading({ count: users.users.length })}</h2>
	{#if users.users.length === 0}
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
						<Icon
							icon={selected ? 'check' : 'nav-arrow-right'}
							data-row-icon={selected ? 'check' : 'chevron'}
							class="text-muted"
						/>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</Card>
