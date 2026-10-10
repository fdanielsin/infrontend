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
	import { createFieldValidation } from '$lib/validation/field-validation.svelte';
	const { users } = getAppState();
	const USER_FIELDS = ['name', 'email'] as const;
	let submitting = $state(false);
	let name = $state('');
	let email = $state('');
	const fields = createFieldValidation<(typeof USER_FIELDS)[number]>({
		fields: USER_FIELDS,
		values: () => ({ name, email }),
		check: () => {
			const result = UserSchema.safeParse({ name, email });
			return result.success ? {} : zodIssuesToFieldErrors(result.error, USER_FIELDS);
		}
	});
	// A server refusal is not a schema key: it has its own message.
	const fieldError = (field: (typeof USER_FIELDS)[number]) => {
		const key = fields.error(field);
		if (!key) return undefined;
		return key === 'error_email_taken' ? m.error_email_taken() : validationMessage(key);
	};
	const refs: Partial<Record<'nameInput' | 'emailInput', HTMLElement>> = {};

	async function handleSubmit() {
		if (submitting) return;
		const errors = fields.submit();
		if (errors.name || errors.email) {
			await tick();
			(errors.name ? refs.nameInput : refs.emailInput)?.focus();
			return;
		}
		submitting = true;
		const outcome = await users.add(name.trim(), email.trim()).finally(() => {
			submitting = false;
		});
		if (outcome.status === 'created') {
			name = '';
			email = '';
			fields.reset();
		} else if (outcome.status === 'email_taken') {
			fields.reject('email', 'error_email_taken');
			await tick();
			refs.emailInput?.focus();
		}
	}
</script>

<div class="space-y-6">
	<Card>
		<h2 class="mb-4 text-xl font-bold">{m.users_create_heading()}</h2>

		<form
			novalidate
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
					error={fieldError('name')}
					valid={fields.status('name') === 'valid'}
					oninput={() => fields.input('name')}
					onblur={(event: FocusEvent) => fields.blur('name', event)}
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
					error={fieldError('email')}
					valid={fields.status('email') === 'valid'}
					oninput={() => fields.input('email')}
					onblur={(event: FocusEvent) => fields.blur('email', event)}
				/>
			</div>

			<Button type="submit" block aria-busy={submitting ? 'true' : undefined}>
				<Icon icon="plus" class="mr-1 inline align-text-bottom" />
				{submitting ? m.users_creating() : m.users_create_button()}
			</Button>
		</form>
	</Card>
	<UserList />
</div>
