<script lang="ts">
	import { tick } from 'svelte';
	import { ref } from '$lib/ui/attachments';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import { UserSchema, validationMessage } from '$lib/validation/schemas';
	import { zodIssuesToFieldErrors } from '$lib/validation/field-errors';
	const { users } = getAppState();
	const status = users.status;
	const USER_FIELDS = ['name', 'email'] as const;
	let name = $state('');
	let email = $state('');
	let fieldErrors = $state.raw<{ name?: string; email?: string }>({});
	const refs: Partial<Record<'nameInput' | 'emailInput', HTMLElement>> = {};

	async function handleSubmit() {
		const result = UserSchema.safeParse({ name, email });
		fieldErrors = {};
		if (!result.success) {
			fieldErrors = zodIssuesToFieldErrors(result.error, USER_FIELDS);
			await tick();
			(fieldErrors.name ? refs.nameInput : refs.emailInput)?.focus();
			return;
		}
		const created = await users.add(result.data.name, result.data.email);
		if (created) {
			name = '';
			email = '';
		}
	}
</script>

<Card>
	<h2 class="mb-4 text-xl font-bold">{m.users_create_heading()}</h2>

	{#if status.error}
		<Alert class="mb-4">{status.error}</Alert>
	{/if}

	<form
		onsubmit={(e) => {
			e.preventDefault();
			void handleSubmit();
		}}
		class="space-y-4"
	>
		<div>
			<TextField
				id="name"
				label={m.users_name_label()}
				bind:value={name}
				{@attach ref(refs, 'nameInput')}
				required
				error={fieldErrors.name ? validationMessage(fieldErrors.name) : undefined}
			/>
		</div>

		<div>
			<TextField
				id="email"
				type="email"
				label={m.users_email_label()}
				bind:value={email}
				{@attach ref(refs, 'emailInput')}
				required
				error={fieldErrors.email ? validationMessage(fieldErrors.email) : undefined}
			/>
		</div>

		<Button type="submit" disabled={status.loading}>
			{status.loading ? m.users_creating() : m.users_create_button()}
		</Button>
	</form>

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
</Card>
