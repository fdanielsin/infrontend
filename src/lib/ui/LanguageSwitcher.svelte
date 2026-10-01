<script lang="ts">
	import { LOCALE_NAMES } from '$lib/i18n/locales';
	import { m } from '$lib/paraglide/messages';
	import Select from '$lib/ui/Select.svelte';
	import { getAppState } from '$lib/state/app-state.svelte';

	const app = getAppState();
	const { locale } = app;

	const options = locale.available.map((available) => ({
		value: available,
		label: `${available.toUpperCase()} - ${LOCALE_NAMES[available]}`,
		lang: available
	}));

	function chooseLocale(value: string) {
		const chosen = locale.available.find((available) => available === value);
		if (!chosen) return;
		app.changeLocale(chosen);
		app.notifications.add(m.language_changed({ language: LOCALE_NAMES[chosen] }), 'info');
	}
</script>

<Select
	id="language"
	label={m.language_label()}
	value={locale.current}
	{options}
	onchange={chooseLocale}
/>
