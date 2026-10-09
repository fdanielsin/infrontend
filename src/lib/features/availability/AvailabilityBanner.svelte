<script lang="ts">
	import { tick } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import ReferenceLine from '$lib/ui/ReferenceLine.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import Button from '$lib/ui/Button.svelte';

	const { availability, notifications } = getAppState();

	// The button leaves the page when the service is back: focus goes to the main landmark
	// instead of dropping on the body (WCAG 2.4.3).
	async function retry() {
		const status = await availability.retry();
		if (status !== 'available') return;
		await tick();
		document.querySelector<HTMLElement>('main')?.focus();
	}
</script>

<!-- The container stays rendered: the alert inside is inserted, and so announced, on an outage.
     The button is outside the alert so that the retries do not re-read it. -->
<div data-availability>
	{#if availability.status === 'unavailable'}
		<section
			aria-label={m.availability_region()}
			class="flex flex-wrap items-center justify-start gap-3 bg-danger-soft px-4 py-3 text-left text-danger sm:justify-center sm:text-center"
		>
			{#key availability.retryFailures}
				<p role="alert" class="flex items-center gap-2">
					<Icon icon="warning-triangle" />
					{m.availability_unavailable()}
				</p>
			{/key}
			<Button variant="secondary" size="sm" tone="danger" onclick={() => void retry()}>
				<Icon icon="refresh" size={16} class="mr-1 inline align-text-bottom" />
				{availability.checking ? m.availability_checking() : m.availability_retry()}
			</Button>
			<!-- Outside the alert: a retry that fails again does not read the reference again. -->
			{#if availability.reference}
				<ReferenceLine
					tone="danger"
					class="basis-full justify-start sm:justify-center"
					reference={availability.reference}
					oncopy={(reference: string) => void notifications.copyReference(reference)}
				/>
			{/if}
		</section>
	{/if}
</div>
