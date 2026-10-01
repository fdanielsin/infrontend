<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { Notification } from '$lib/state/notification.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';

	interface Props {
		toast: Notification;
		// Hovering or focusing a toast pauses its timer (WCAG 2.2.1); leaving both resumes it.
		onpause: () => void;
		onresume: () => void;
		ondismiss: (closeButton: HTMLElement) => void;
	}

	let { toast, onpause, onresume, ondismiss }: Props = $props();

	// Whole class names, so Tailwind finds them.
	const TYPE_CLASSES = {
		success: 'bg-success',
		error: 'bg-danger',
		info: 'bg-action-strong',
		warning: 'bg-warning'
	};
</script>

<!-- Hover and focus only pause the timer; the close button is the keyboard path. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	data-toast
	class={[
		'animate-slide-in flex items-start gap-3 rounded-card px-4 py-3 text-white shadow-card-raised',
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
	<p class="flex-1">{toast.message}</p>
	<IconButton
		tone="inverse"
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
