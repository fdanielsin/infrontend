<script lang="ts">
	import { tick } from 'svelte';
	import {
		notifications,
		pauseNotification,
		removeNotification,
		resumeNotification,
		type Notification as Toast
	} from '$lib/stores/notification';

	const alerts = $derived($notifications.filter((toast) => toast.type === 'error'));
	const statuses = $derived($notifications.filter((toast) => toast.type !== 'error'));

	// Where focus was before it entered the toasts: a dismissal gives it back there.
	let focusOrigin: HTMLElement | null = null;
	let refocusing = false;

	function rememberFocusOrigin(event: FocusEvent & { currentTarget: HTMLElement }) {
		if (refocusing) return;
		const origin = event.relatedTarget;
		if (origin instanceof Node && event.currentTarget.contains(origin)) return;
		focusOrigin = origin instanceof HTMLElement ? origin : null;
	}

	// Closing the toast that holds focus must not drop it on the body (WCAG 2.4.3):
	// next toast in the region, else the previous one, else where focus came from,
	// else the page's main landmark. A toast closed without focus (mouse click in
	// Safari) leaves the focus where it is.
	async function dismiss(toastId: string, closeButton: HTMLElement) {
		const toastElement = closeButton.closest('[data-toast]');
		const hadFocus = toastElement?.contains(document.activeElement) ?? false;
		const neighbour = toastElement?.nextElementSibling ?? toastElement?.previousElementSibling;
		const neighbourButton = neighbour?.querySelector<HTMLElement>('button') ?? null;
		removeNotification(toastId);
		if (!hadFocus) return;
		await tick();
		const candidates = [neighbourButton, focusOrigin, document.querySelector<HTMLElement>('main')];
		// The removed button leaves no relatedTarget: this move must not reset the origin.
		refocusing = true;
		try {
			for (const candidate of candidates) {
				if (!candidate?.isConnected) continue;
				candidate.focus();
				if (document.activeElement === candidate) return;
			}
		} finally {
			refocusing = false;
		}
	}
</script>

{#snippet toastView(toast: Toast)}
	<!-- Hover and focus only pause the timer; the close button is the keyboard path. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		data-toast
		class={[
			'animate-slide-in flex items-start gap-3 rounded-lg px-4 py-3 text-white shadow-lg',
			{
				'bg-green-700': toast.type === 'success',
				'bg-red-700': toast.type === 'error',
				'bg-blue-700': toast.type === 'info',
				'bg-amber-700': toast.type === 'warning'
			}
		]}
		onmouseenter={() => pauseNotification(toast.id)}
		onmouseleave={(event) => {
			if (!event.currentTarget.matches(':focus-within')) resumeNotification(toast.id);
		}}
		onfocusin={() => pauseNotification(toast.id)}
		onfocusout={(event) => {
			if (!event.currentTarget.matches(':hover')) resumeNotification(toast.id);
		}}
	>
		<p class="flex-1">{toast.message}</p>
		<button
			type="button"
			onclick={(event) => void dismiss(toast.id, event.currentTarget)}
			aria-label="Dismiss notification"
			class="inline-flex min-h-6 min-w-6 items-center justify-center rounded hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 20 20"
				class="h-4 w-4"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M5 5l10 10M15 5L5 15" />
			</svg>
		</button>
	</div>
{/snippet}

<!-- The handler only records where focus came from; it adds no interaction. -->
<div class="fixed top-0 right-0 z-50 flex flex-col gap-2 p-4" onfocusin={rememberFocusOrigin}>
	<div role="status" aria-atomic="false" class="space-y-2">
		{#each statuses as toast (toast.id)}
			{@render toastView(toast)}
		{/each}
	</div>
	<div role="alert" aria-atomic="false" class="space-y-2">
		{#each alerts as toast (toast.id)}
			{@render toastView(toast)}
		{/each}
	</div>
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
		:global(.animate-slide-in) {
			animation: slideIn 0.3s ease-out;
		}
	}
</style>
