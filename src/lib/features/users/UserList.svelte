<script lang="ts">
	import Card from '$lib/ui/Card.svelte';
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
						<!-- Temporary inline icons: to be replaced by ui/Icon. -->
						<svg
							aria-hidden="true"
							data-row-icon={selected ? 'check' : 'chevron'}
							viewBox="0 0 20 20"
							class="h-5 w-5 shrink-0 text-muted"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							{#if selected}
								<path d="M4 10.5l4 4 8-9" />
							{:else}
								<path d="M7.5 4l6 6-6 6" />
							{/if}
						</svg>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</Card>
