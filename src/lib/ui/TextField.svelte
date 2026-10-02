<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLElement> {
		id: string;
		// Already translated: the label stays in the interface language.
		label: string;
		value?: string;
		type?: 'text' | 'email';
		multiline?: boolean;
		rows?: number;
		required?: boolean;
		// Already translated error text; its presence marks the field invalid.
		error?: string | undefined;
		// Defaults to `<id>-error`.
		errorId?: string;
		// Tighter control for fields inside a list row (edit form).
		compact?: boolean;
		// Keeps the label for assistive technology only.
		labelHidden?: boolean;
	}

	let {
		id,
		label,
		value = $bindable(''),
		type = 'text',
		multiline = false,
		rows,
		required,
		error,
		errorId = `${id}-error`,
		compact = false,
		labelHidden = false,
		...rest
	}: Props = $props();

	// Whole class names, so Tailwind finds them.
	const CONTROL_CLASSES =
		'w-full rounded-control border border-field-border aria-invalid:border-danger';
	const SIZE_CLASSES = { default: 'mt-1 px-3 py-2', compact: 'px-2 py-1' };
	const ERROR_CLASSES = { default: 'mt-1 text-sm text-danger', compact: 'text-sm text-danger' };
	const size = $derived(compact ? 'compact' : 'default');
</script>

<label for={id} class={labelHidden ? 'sr-only' : 'block text-sm font-medium text-label'}>
	{label}
</label>
{#if multiline}
	<textarea
		{id}
		bind:value
		{rows}
		{required}
		aria-invalid={!!error}
		aria-describedby={error ? errorId : undefined}
		class={[CONTROL_CLASSES, SIZE_CLASSES[size]]}
		{...rest}></textarea>
{:else if type === 'email'}
	<input
		{id}
		type="email"
		bind:value
		{required}
		aria-invalid={!!error}
		aria-describedby={error ? errorId : undefined}
		class={[CONTROL_CLASSES, SIZE_CLASSES[size]]}
		{...rest}
	/>
{:else}
	<input
		{id}
		type="text"
		bind:value
		{required}
		aria-invalid={!!error}
		aria-describedby={error ? errorId : undefined}
		class={[CONTROL_CLASSES, SIZE_CLASSES[size]]}
		{...rest}
	/>
{/if}
{#if error}
	<p id={errorId} class={ERROR_CLASSES[size]}>{error}</p>
{/if}
