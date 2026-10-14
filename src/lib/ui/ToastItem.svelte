<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { Notification, NotificationType, PauseReason } from '$lib/state/notification.svelte';
	import ReferenceLine from '$lib/ui/ReferenceLine.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import type { IconName } from '$lib/ui/icons';
	import IconButton from '$lib/ui/IconButton.svelte';
	import { TOAST_BACKGROUNDS, TOAST_BORDERS } from '$lib/ui/toast-styles';

	interface Props {
		toast: Notification;
		// Hovering or focusing a toast pauses its timer (WCAG 2.2.1); it goes on when both are gone.
		onpause: (reason: PauseReason) => void;
		onresume: (reason: PauseReason) => void;
		ondismiss: (closeButton: HTMLElement) => void;
		onaction: (actionButton: HTMLElement) => void;
		oncopyreference: (reference: string) => void;
	}

	const TOAST_ICONS: Record<NotificationType, IconName> = {
		success: 'check-circle',
		error: 'warning-circle',
		info: 'info-circle',
		warning: 'warning-triangle'
	};

	let { toast, onpause, onresume, ondismiss, onaction, oncopyreference }: Props = $props();
</script>

<!-- Hover and focus only pause the timer; the close button is the keyboard path. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	data-toast
	class={[
		'animate-slide-in grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-card px-4 py-3 text-on-toast shadow-card-raised',
		TOAST_BACKGROUNDS[toast.type],
		TOAST_BORDERS[toast.type]
	]}
	onmouseenter={() => onpause('hover')}
	onmouseleave={() => onresume('hover')}
	onfocusin={() => onpause('focus')}
	onfocusout={(event) => {
		// Focus moving between the toast's own buttons is not leaving it.
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onresume('focus');
	}}
>
	<p class="min-w-0 wrap-anywhere">
		<span data-toast-icon
			><Icon icon={TOAST_ICONS[toast.type]} class="mr-2 inline align-text-bottom" /></span
		>{toast.message}
	</p>
	{#if toast.reference}
		<!-- Under the message, before the close button in the reading order. -->
		<ReferenceLine reference={toast.reference} oncopy={oncopyreference} class="col-start-1 mt-1" />
	{/if}
	{#if toast.action}
		<Button
			variant="secondary"
			size="sm"
			tone="inverse"
			class="col-start-1 mt-2 max-w-full justify-self-start text-left wrap-anywhere"
			data-toast-action
			onclick={(event: MouseEvent & { currentTarget: HTMLButtonElement }) =>
				onaction(event.currentTarget)}
		>
			{#if toast.action.icon}
				<Icon icon={toast.action.icon} size={16} class="mr-1 inline align-text-bottom" />
			{/if}
			{toast.action.label}
		</Button>
	{/if}
	<IconButton
		tone="inverse"
		class="col-start-2 row-span-3 row-start-1"
		data-toast-dismiss
		label={m.notifications_dismiss()}
		onclick={(event: MouseEvent & { currentTarget: HTMLButtonElement }) =>
			ondismiss(event.currentTarget)}
	/>
</div>

<style>
	@keyframes slideIn {
		from {
			transform: translateX(400px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.animate-slide-in {
			animation: slideIn 0.3s ease-out;
		}
	}
</style>
