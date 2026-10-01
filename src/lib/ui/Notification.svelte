<script lang="ts">
	import { tick } from 'svelte';
	import ToastItem from '$lib/ui/ToastItem.svelte';
	import { getAppState } from '$lib/state/app-state.svelte';

	const { notifications } = getAppState();

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
		notifications.remove(toastId);
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

<!-- The handler only records where focus came from; it adds no interaction. -->
<div class="fixed top-0 right-0 z-50 flex flex-col gap-2 p-4" onfocusin={rememberFocusOrigin}>
	<div role="status" aria-atomic="false" class="space-y-2">
		{#each notifications.statuses as toast (toast.id)}
			<ToastItem
				{toast}
				onpause={() => notifications.pause(toast.id)}
				onresume={() => notifications.resume(toast.id)}
				ondismiss={(closeButton: HTMLElement) => void dismiss(toast.id, closeButton)}
			/>
		{/each}
	</div>
	<div role="alert" aria-atomic="false" class="space-y-2">
		{#each notifications.alerts as toast (toast.id)}
			<ToastItem
				{toast}
				onpause={() => notifications.pause(toast.id)}
				onresume={() => notifications.resume(toast.id)}
				ondismiss={(closeButton: HTMLElement) => void dismiss(toast.id, closeButton)}
			/>
		{/each}
	</div>
</div>
