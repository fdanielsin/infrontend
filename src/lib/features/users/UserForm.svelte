<script lang="ts">
	import { users, selectedUser, addUser, selectUser } from './store';
	import { loading, error } from '$lib/stores/request-status';
	import { UserSchema } from '$lib/validation/schemas';
	let name = $state('');
	let email = $state('');
	let fieldErrors = $state<{ name?: string; email?: string }>({});

	async function handleSubmit() {
		const result = UserSchema.safeParse({ name, email });
		fieldErrors = {};
		if (!result.success) {
			for (const issue of result.error.issues) {
				const field = issue.path[0];
				if (field === 'name' || field === 'email') fieldErrors[field] = issue.message;
			}
			return;
		}
		const created = await addUser(result.data.name, result.data.email);
		if (created) {
			name = '';
			email = '';
		}
	}
</script>

<div class="rounded-lg border border-gray-300 bg-white p-6 shadow">
	<h2 class="mb-4 text-xl font-bold">Create User</h2>

	{#if $error}
		<div class="mb-4 rounded bg-red-100 p-3 text-red-700" role="alert">{$error}</div>
	{/if}

	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
		class="space-y-4"
	>
		<div>
			<label for="name" class="block text-sm font-medium text-gray-700">Name</label>
			<input
				id="name"
				type="text"
				bind:value={name}
				required
				aria-invalid={!!fieldErrors.name}
				aria-describedby={fieldErrors.name ? 'name-error' : undefined}
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			/>
			{#if fieldErrors.name}<p id="name-error" class="mt-1 text-sm text-red-600">
					{fieldErrors.name}
				</p>{/if}
		</div>

		<div>
			<label for="email" class="block text-sm font-medium text-gray-700">Email</label>
			<input
				id="email"
				type="email"
				bind:value={email}
				required
				aria-invalid={!!fieldErrors.email}
				aria-describedby={fieldErrors.email ? 'email-error' : undefined}
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			/>
			{#if fieldErrors.email}<p id="email-error" class="mt-1 text-sm text-red-600">
					{fieldErrors.email}
				</p>{/if}
		</div>

		<button
			type="submit"
			disabled={$loading}
			class="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
		>
			{$loading ? 'Creating...' : 'Create User'}
		</button>
	</form>

	<div class="mt-6">
		<h3 class="mb-3 font-semibold">Users ({$users.length})</h3>
		{#if $users.length === 0}
			<p class="text-gray-500">No users yet</p>
		{:else}
			<ul class="space-y-2">
				{#each $users as user (user.id)}
					<li class="rounded bg-gray-100 p-3">
						<button
							type="button"
							class={$selectedUser?.id === user.id
								? 'w-full rounded bg-blue-100 p-1 text-left ring-2 ring-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none'
								: 'w-full rounded p-1 text-left focus:ring-2 focus:ring-blue-500 focus:outline-none'}
							aria-pressed={$selectedUser?.id === user.id}
							onclick={() => selectUser(user.id)}
						>
							<p class="font-medium">{user.name}</p>
							<p class="text-sm text-gray-600">{user.email}</p>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
