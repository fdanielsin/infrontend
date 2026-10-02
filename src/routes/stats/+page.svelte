<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { api, type Stats } from '$lib/api/client';
	import { formatNumber } from '$lib/i18n/format';
	import LanguageSwitcher from '$lib/ui/LanguageSwitcher.svelte';
	import { m } from '$lib/paraglide/messages';
	import Alert from '$lib/ui/Alert.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { getAppState } from '$lib/state/app-state.svelte';
	import { RequestStatus } from '$lib/state/request-status.svelte';

	const status = new RequestStatus(getAppState().notifications, true);
	let stats = $state.raw<Stats | null>(null);

	onMount(async () => {
		const result = await status.run(() => api.getStats(), {
			fallbackMessage: m.error_fetch_stats
		});
		if (result.success) stats = result.data;
	});
</script>

<svelte:head>
	<title>{m.stats_page_title()}</title>
</svelte:head>

<main
	tabindex="-1"
	class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 focus:outline-none"
>
	<div class="mx-auto max-w-2xl">
		<div class="mb-4 flex justify-end">
			<LanguageSwitcher />
		</div>
		<h1 class="mb-8 text-4xl font-bold wrap-break-word hyphens-auto text-gray-800">
			<span aria-hidden="true">📊</span>
			{m.stats_heading()}
		</h1>

		{#if status.loading}
			<Card variant="flat" padding="lg" class="text-center">
				<p class="text-muted">{m.stats_loading()}</p>
			</Card>
		{:else if status.error}
			<Alert class="font-semibold">
				<span aria-hidden="true">❌</span>
				{m.stats_error({ message: status.error })}
			</Alert>
		{:else if stats}
			<div class="grid grid-cols-2 gap-6">
				<Card variant="raised">
					<div class="text-5xl font-bold text-blue-600">{formatNumber(stats.users)}</div>
					<p class="mt-2 text-lg text-muted">
						<span aria-hidden="true">👥</span>
						{m.stats_users()}
					</p>
				</Card>
				<Card variant="raised">
					<div class="text-5xl font-bold text-indigo-600">{formatNumber(stats.tasks)}</div>
					<p class="mt-2 text-lg text-muted">
						<span aria-hidden="true">✅</span>
						{m.stats_tasks()}
					</p>
				</Card>
			</div>

			<Card variant="flat" class="mt-8">
				<h2 class="mb-4 text-lg font-semibold text-gray-800">{m.stats_summary()}</h2>
				<ul class="space-y-2 text-muted">
					<li>• {m.stats_total_users()} <strong>{formatNumber(stats.users)}</strong></li>
					<li>• {m.stats_total_tasks()} <strong>{formatNumber(stats.tasks)}</strong></li>
					<li>
						• {m.stats_average()}
						<strong
							>{stats.users > 0
								? formatNumber(stats.tasks / stats.users, {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2
									})
								: formatNumber(0)}</strong
						>
					</li>
				</ul>
			</Card>
		{/if}

		<div class="mt-8">
			<a
				href={resolve('/')}
				class="inline-block rounded-card bg-primary px-6 py-2 text-white transition hover:bg-primary-hover"
			>
				{m.stats_back_home()}
			</a>
		</div>
	</div>
</main>
