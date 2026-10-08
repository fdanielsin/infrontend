<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';

	const { users } = getAppState();
</script>

<div class="mt-6">
	<h3 class="mb-3 font-semibold">{m.users_list_heading({ count: users.users.length })}</h3>
	{#if users.users.length === 0}
		<p class="text-subtle">{m.users_empty()}</p>
	{:else}
		<ul class="space-y-2">
			{#each users.users as user (user.id)}
				{@const selected = users.selected?.id === user.id}
				<li class="rounded-control bg-surface-muted p-3">
					<button
						type="button"
						class={[
							'w-full min-w-0 rounded-control p-1 text-left',
							selected && 'bg-blue-100 ring-2 ring-primary ring-inset'
						]}
						aria-pressed={selected}
						onclick={() => users.select(user.id)}
					>
						<p class="font-medium wrap-anywhere">{user.name}</p>
						<p class="text-sm wrap-anywhere text-muted">{user.email}</p>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
