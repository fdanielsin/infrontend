<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { api, type Stats } from '$lib/api/client';
	import { formatNumber } from '$lib/i18n/format';
	import { m } from '$lib/paraglide/messages';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ButtonLink from '$lib/ui/ButtonLink.svelte';
	import Card from '$lib/ui/Card.svelte';
	import PageShell from '$lib/ui/PageShell.svelte';
	import { ref } from '$lib/ui/attachments';
	import { getAppState } from '$lib/state/app-state.svelte';
	import { RequestStatus } from '$lib/state/request-status.svelte';

	const { availability, notifications } = getAppState();
	const status = new RequestStatus(notifications, true);
	let stats = $state.raw<Stats | null>(null);
	let page = $state<HTMLElement>();
	const refs: { retry?: HTMLElement } = {};

	async function load() {
		const result = await status.run(() => api.getStats(), {
			fallbackMessage: m.error_fetch_stats
		});
		if (result.success) stats = result.data;
	}

	// The button is replaced by the loading state: the focus goes to the page first, never to <body>.
	async function retry() {
		page?.focus();
		await load();
		// The button came back after a failed retry: the keyboard user is where they were.
		if (!stats) {
			await tick();
			refs.retry?.focus();
		}
	}

	onMount(() => availability.runWhenAvailable(load));
</script>

<svelte:head>
	<title>{m.stats_page_title()}</title>
</svelte:head>

<PageShell bind:element={page} heading={m.stats_heading()} icon="📊">
	{#snippet actions()}
		<ButtonLink href={resolve('/')}>{m.stats_back_home()}</ButtonLink>
	{/snippet}

	<div class="max-w-2xl">
		<!-- Each state says what is true: figures, a wait for the service, a load in progress, a
		     failure with its way out, or nothing to count. A toast carries the error detail. -->
		{#if stats && stats.users === 0 && stats.tasks === 0}
			<Card variant="flat" padding="lg" class="text-center">
				<p class="text-muted">{m.stats_empty()}</p>
				<a
					href={resolve('/')}
					class="mt-2 inline-block text-action-strong underline hover:text-action-strong-hover"
				>
					{m.stats_empty_action()}
				</a>
			</Card>
		{:else if stats}
			<div class="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
				<Card variant="raised" data-stat>
					<div data-stat-value class="text-4xl font-bold wrap-anywhere text-heading sm:text-5xl">
						{formatNumber(stats.users)}
					</div>
					<p class="mt-2 text-lg wrap-anywhere text-muted">
						<span aria-hidden="true">👥</span>
						{m.stats_users()}
					</p>
				</Card>
				<Card variant="raised" data-stat>
					<div data-stat-value class="text-4xl font-bold wrap-anywhere text-heading sm:text-5xl">
						{formatNumber(stats.tasks)}
					</div>
					<p class="mt-2 text-lg wrap-anywhere text-muted">
						<span aria-hidden="true">✅</span>
						{m.stats_tasks()}
					</p>
				</Card>
				<Card variant="raised" data-stat>
					<div data-stat-value class="text-4xl font-bold wrap-anywhere text-heading sm:text-5xl">
						{stats.users > 0
							? formatNumber(stats.tasks / stats.users, {
									minimumFractionDigits: 2,
									maximumFractionDigits: 2
								})
							: formatNumber(0)}
					</div>
					<p class="mt-2 text-lg wrap-anywhere text-muted">
						<span aria-hidden="true">📈</span>
						{m.stats_average()}
					</p>
				</Card>
			</div>
		{:else if availability.status === 'unavailable'}
			<Card variant="flat" padding="lg" class="text-center">
				<p class="text-muted">{m.stats_unavailable()}</p>
			</Card>
		{:else if status.loading}
			<Card variant="flat" padding="lg" class="text-center">
				<p class="text-muted">{m.stats_loading()}</p>
			</Card>
		{:else}
			<Alert class="font-semibold">
				<p>{m.stats_load_failed()}</p>
				<Button
					variant="secondary"
					size="sm"
					tone="danger"
					class="mt-3"
					{@attach ref(refs, 'retry')}
					onclick={() => void retry()}
				>
					{m.stats_retry()}
				</Button>
			</Alert>
		{/if}
	</div>
</PageShell>
