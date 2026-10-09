<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import Icon from '$lib/ui/Icon.svelte';

	interface Props extends HTMLAttributes<HTMLElement> {
		id: string;
		// Already translated: the label stays in the interface language.
		label: string;
		value?: string;
		// 'email' is a text field that asks for the e-mail keyboard: with type="email", the browser
		// rewrites what is typed (Chrome turns an international domain into punycode). No autofill:
		// the address typed is another person's, not the user's (WCAG 1.3.5 is about the user's own).
		type?: 'text' | 'email';
		multiline?: boolean;
		rows?: number;
		required?: boolean;
		// Already translated error text; its presence marks the field invalid.
		error?: string | undefined;
		// The value was checked and is fine: a green border and a check, never the color alone.
		valid?: boolean;
		// Defaults to `<id>-error`.
		errorId?: string;
		// Tighter control for fields inside a list row (edit form).
		compact?: boolean;
		// Keeps the label for assistive technology only.
		labelHidden?: boolean;
		// A multiline field that grows with its content instead of scrolling.
		autoGrow?: boolean;
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
		valid = false,
		errorId = `${id}-error`,
		compact = false,
		labelHidden = false,
		autoGrow = false,
		...rest
	}: Props = $props();

	// Whole class names, so Tailwind finds them.
	const CONTROL_CLASSES = 'w-full rounded-control border aria-invalid:border-danger';
	// Two border colors on one element: the stylesheet order, not the class order, would decide.
	const NEUTRAL_BORDER = 'border-field-border';
	const VALID_CLASSES = 'border-success pr-8';
	const SIZE_CLASSES = { default: 'px-3 py-2', compact: 'px-2 py-1' };
	const WRAPPER_CLASSES = { default: 'relative mt-1', compact: 'relative' };
	const CHECK_CLASSES = { default: 'top-3', compact: 'top-2' };
	const ERROR_CLASSES = {
		default: 'mt-1 flex items-start gap-1 text-sm text-danger',
		compact: 'flex items-start gap-1 text-sm text-danger'
	};
	const size = $derived(compact ? 'compact' : 'default');

	// The height follows the content: typed, pasted, or reflowed by a new column width. Only a width
	// change is observed, since resizing the field itself must not notify the observer again.
	function growToContent(field: HTMLElement) {
		const resize = () => {
			field.style.height = 'auto';
			field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
		};
		resize();
		field.addEventListener('input', resize);
		let width = field.clientWidth;
		let observer: ResizeObserver | undefined;
		try {
			observer = new ResizeObserver(() => {
				if (field.clientWidth === width) return;
				width = field.clientWidth;
				resize();
			});
			observer.observe(field);
		} catch {
			observer = undefined;
		}
		return () => {
			field.removeEventListener('input', resize);
			observer?.disconnect();
		};
	}
</script>

<label for={id} class={labelHidden ? 'sr-only' : 'block text-sm font-medium text-label'}>
	{label}
</label>
<div class={WRAPPER_CLASSES[size]}>
	{#if multiline}
		<textarea
			{id}
			bind:value
			{rows}
			{required}
			aria-invalid={!!error}
			aria-describedby={error ? errorId : undefined}
			class={[
				CONTROL_CLASSES,
				SIZE_CLASSES[size],
				valid ? VALID_CLASSES : NEUTRAL_BORDER,
				autoGrow && 'resize-none overflow-hidden'
			]}
			{@attach autoGrow ? growToContent : undefined}
			{...rest}></textarea>
	{:else if type === 'email'}
		<input
			{id}
			type="text"
			inputmode="email"
			autocomplete="off"
			spellcheck="false"
			autocapitalize="off"
			bind:value
			{required}
			aria-invalid={!!error}
			aria-describedby={error ? errorId : undefined}
			class={[CONTROL_CLASSES, SIZE_CLASSES[size], valid ? VALID_CLASSES : NEUTRAL_BORDER]}
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
			class={[CONTROL_CLASSES, SIZE_CLASSES[size], valid ? VALID_CLASSES : NEUTRAL_BORDER]}
			{...rest}
		/>
	{/if}
	{#if valid}
		<Icon
			icon="check"
			size={16}
			class={['pointer-events-none absolute right-2 text-success', CHECK_CLASSES[size]]}
		/>
	{/if}
</div>
{#if error}
	<p id={errorId} class={ERROR_CLASSES[size]}>
		<Icon icon="warning-circle" size={16} class="mt-0.5" />
		<span class="min-w-0 wrap-anywhere">{error}</span>
	</p>
{/if}
