<script lang="ts">
	import { tick } from 'svelte';
	import { ref } from '$lib/ui/attachments';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import UserList from './UserList.svelte';
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
	// The server refused this email: said under the field until it is edited.
	let emailTaken = $state(false);
	const refs: Partial<Record<'nameInput' | 'emailInput', HTMLElement>> = {};

	async function handleSubmit() {
		const result = UserSchema.safeParse({ name, email });
		fieldErrors = {};
		emailTaken = false;
		if (!result.success) {
			fieldErrors = zodIssuesToFieldErrors(result.error, USER_FIELDS);
			await tick();
			(fieldErrors.name ? refs.nameInput : refs.emailInput)?.focus();
			return;
		}
		const outcome = await users.add(result.data.name, result.data.email);
		if (outcome.status === 'created') {
			name = '';
			email = '';
		} else if (outcome.status === 'email_taken') {
			emailTaken = true;
			await tick();
			refs.emailInput?.focus();
		}
	}
</script>

<div class="space-y-6">
	<Card>
		<h2 class="mb-4 text-xl font-bold">{m.users_create_heading()}</h2>

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
					oninput={() => (emailTaken = false)}
					error={fieldErrors.email
						? validationMessage(fieldErrors.email)
						: emailTaken
							? m.error_email_taken()
							: undefined}
				/>
			</div>

			<Button type="submit" block disabled={status.loading}>
				<Icon icon="plus" class="mr-1 inline align-text-bottom" />
				{status.loading ? m.users_creating() : m.users_create_button()}
			</Button>
		</form>
	</Card>
	<UserList />
</div>
