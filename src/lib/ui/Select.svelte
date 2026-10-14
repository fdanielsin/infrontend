<script lang="ts">
	import Icon from '$lib/ui/Icon.svelte';
	import type { IconName } from '$lib/ui/icons';

	interface Option {
		value: string;
		label: string;
		// Language of the option text, when it differs from the page (WCAG 3.1.2).
		lang?: string;
	}

	interface Props {
		id: string;
		// Already translated visible label.
		label: string;
		value: string;
		options: readonly Option[];
		onchange: (value: string) => void;
		// A decorative icon before the label.
		icon?: IconName;
		// The label above the selector, whatever its length: the selector sits at the same place in
		// every language instead of after a label of a different width.
		stacked?: boolean;
	}

	let { id, label, value, options, onchange, icon, stacked = false }: Props = $props();
</script>

<div
	class={[
		'flex text-sm text-heading',
		stacked ? 'flex-col items-start gap-1' : 'flex-wrap items-center gap-2'
	]}
>
	<label for={id} class="flex items-center gap-1">
		{#if icon}<Icon {icon} size={16} />{/if}
		{label}
	</label>
	<select
		{id}
		{value}
		onchange={(event) => onchange(event.currentTarget.value)}
		class="max-w-full min-w-0 rounded-control border border-field-border bg-surface px-2 py-1"
	>
		{#each options as option (option.value)}
			<option value={option.value} lang={option.lang}>{option.label}</option>
		{/each}
	</select>
</div>
