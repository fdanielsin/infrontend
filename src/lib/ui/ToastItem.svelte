<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { Notification } from '$lib/state/notification.svelte';
	import ReferenceLine from '$lib/ui/ReferenceLine.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';

	interface Props {
		toast: Notification;
		// Hovering or focusing a toast pauses its timer (WCAG 2.2.1); leaving both resumes it.
		onpause: () => void;
		onresume: () => void;
		ondismiss: (closeButton: HTMLElement) => void;
		onaction: (actionButton: HTMLElement) => void;
		oncopyreference: (reference: string) => void;
	}

	let { toast, onpause, onresume, ondismiss, onaction, oncopyreference }: Props = $props();

	// Whole class names, so Tailwind finds them.
	const TYPE_CLASSES = {
		success: 'bg-success',
		error: 'bg-danger',
		info: 'bg-info',
		warning: 'bg-warning'
	};
</script>

<!-- Hover and focus only pause the timer; the close button is the keyboard path. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	data-toast
	class={[
		'animate-slide-in grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-card px-4 py-3 text-white shadow-card-raised',
		TYPE_CLASSES[toast.type]
	]}
	onmouseenter={onpause}
	onmouseleave={(event) => {
		if (!event.currentTarget.matches(':focus-within')) onresume();
	}}
	onfocusin={onpause}
	onfocusout={(event) => {
		if (!event.currentTarget.matches(':hover')) onresume();
	}}
>
	<p class="min-w-0 wrap-anywhere">{toast.message}</p>
	{#if toast.reference}
		<!-- Under the message, before the close button in the reading order. -->
		<ReferenceLine reference={toast.reference} oncopy={oncopyreference} class="col-start-1 mt-1" />
	{/if}
	{#if toast.action}
		<button
			type="button"
			class="col-start-1 mt-2 min-h-6 max-w-full justify-self-start rounded-control border border-white px-2 text-left text-sm wrap-anywhere hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
			data-toast-action
			onclick={(event) => onaction(event.currentTarget)}
		>
			{toast.action.label}
		</button>
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
