<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { api, type Stats } from '$lib/api/client';
	import { formatNumber } from '$lib/i18n/format';
	import LanguageSwitcher from '$lib/ui/LanguageSwitcher.svelte';
	import { m } from '$lib/paraglide/messages';
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
			<div class="rounded-lg bg-white p-8 text-center shadow-lg">
				<p class="text-gray-600">{m.stats_loading()}</p>
			</div>
		{:else if status.error}
			<div class="rounded-lg border border-red-200 bg-red-50 p-8 shadow-lg">
				<p class="font-semibold text-red-700">
					<span aria-hidden="true">❌</span>
					{m.stats_error({ message: status.error })}
				</p>
			</div>
		{:else if stats}
			<div class="grid grid-cols-2 gap-6">
				<div class="rounded-lg bg-white p-6 shadow-lg transition hover:shadow-xl">
					<div class="text-5xl font-bold text-blue-600">{formatNumber(stats.users)}</div>
					<p class="mt-2 text-lg text-gray-600">
						<span aria-hidden="true">👥</span>
						{m.stats_users()}
					</p>
				</div>
				<div class="rounded-lg bg-white p-6 shadow-lg transition hover:shadow-xl">
					<div class="text-5xl font-bold text-indigo-600">{formatNumber(stats.tasks)}</div>
					<p class="mt-2 text-lg text-gray-600">
						<span aria-hidden="true">✅</span>
						{m.stats_tasks()}
					</p>
				</div>
			</div>

			<div class="mt-8 rounded-lg bg-white p-6 shadow-lg">
				<h2 class="mb-4 text-lg font-semibold text-gray-800">{m.stats_summary()}</h2>
				<ul class="space-y-2 text-gray-600">
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
			</div>
		{:else}
			<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-8 shadow-lg">
				<p class="text-yellow-700">{m.stats_no_data()}</p>
			</div>
		{/if}

		<div class="mt-8">
			<a
				href={resolve('/')}
				class="inline-block rounded-lg bg-blue-600 px-6 py-2 text-white transition hover:bg-blue-700"
			>
				{m.stats_back_home()}
			</a>
		</div>
	</div>
</main>
