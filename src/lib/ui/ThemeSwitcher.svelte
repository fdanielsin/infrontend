<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import type { ThemeChoice } from '$lib/theme/theme';
	import Icon from '$lib/ui/Icon.svelte';
	import type { IconName } from '$lib/ui/icons';

	const { theme } = getAppState();

	// Native radios: one tab stop, arrows that move and choose, the checked state read by screen readers.
	const OPTIONS: { value: ThemeChoice; icon: IconName; name: () => string }[] = [
		{ value: 'light', icon: 'sun-light', name: () => m.theme_light() },
		{ value: 'dark', icon: 'half-moon', name: () => m.theme_dark() },
		{ value: 'system', icon: 'computer', name: () => m.theme_system() }
	];
</script>

<div class="flex flex-wrap items-center gap-2 text-sm text-heading">
	<span id="theme-label" class="wrap-break-word">{m.theme_label()}</span>
	<div
		role="radiogroup"
		aria-labelledby="theme-label"
		class="flex shrink-0 gap-0.5 rounded-control border border-field-border bg-surface p-0.5"
	>
		{#each OPTIONS as option (option.value)}
			<!-- The icon is decorative: the name is the text, also the tooltip (no tooltip component). -->
			<label
				title={option.name()}
				class="relative flex size-8 items-center justify-center rounded-control border-2 border-transparent text-label hover:bg-surface-hover has-checked:border-accent has-checked:bg-primary has-checked:text-on-primary has-checked:hover:bg-primary-hover has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus pointer-coarse:size-11"
			>
				<input
					type="radio"
					name="theme"
					value={option.value}
					checked={theme.current === option.value}
					onchange={() => theme.set(option.value)}
					class="sr-only"
				/>
				<Icon icon={option.icon} size={20} />
				<span class="sr-only">{option.name()}</span>
			</label>
		{/each}
	</div>
</div>
