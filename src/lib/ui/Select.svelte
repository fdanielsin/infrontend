<script lang="ts">
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
	}

	let { id, label, value, options, onchange }: Props = $props();
</script>

<div class="flex flex-wrap items-center gap-2 text-sm text-gray-800">
	<label for={id}>{label}</label>
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
