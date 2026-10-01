<script lang="ts">
	import { LOCALE_NAMES } from '$lib/i18n/locales';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';

	const app = getAppState();
	const { locale } = app;

	function chooseLocale(value: string) {
		const chosen = locale.available.find((available) => available === value);
		if (!chosen) return;
		app.changeLocale(chosen);
		app.notifications.add(m.language_changed({ language: LOCALE_NAMES[chosen] }), 'info');
	}
</script>

<div class="flex items-center gap-2 text-sm text-gray-800">
	<label for="language">{m.language_label()}</label>
	<select
		id="language"
		value={locale.current}
		onchange={(event) => chooseLocale(event.currentTarget.value)}
		class="rounded border border-gray-300 bg-white px-2 py-1"
	>
		{#each locale.available as option (option)}
			<option value={option} lang={option}>{option.toUpperCase()} - {LOCALE_NAMES[option]}</option>
		{/each}
	</select>
</div>
