<script lang="ts">
	import { tick } from 'svelte';
	import ToastItem from '$lib/ui/ToastItem.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';

	const { notifications } = getAppState();

	// The page reserves the room of the stack (see layout.css): a focused control can always be
	// scrolled above it, even on a page that did not scroll (WCAG 2.4.11).
	let stackHeight = $state(0);
	// The stack is a landmark only while it holds something to reach; the live regions inside it
	// stay rendered, empty, so that a later message is announced.
	const hasToasts = $derived(notifications.items.length > 0);
	const reservedHeight = $derived(hasToasts ? stackHeight : 0);
	$effect(() => {
		const root = document.documentElement;
		root.style.setProperty('--toast-stack-height', `${reservedHeight}px`);
		return () => root.style.removeProperty('--toast-stack-height');
	});

	// A close button reached by Tab must be wholly inside the stack, which scrolls when it is tall.
	// Firefox on Linux leaves a button clipped by a few pixels where it is (its outline with it);
	// "nearest" scrolls the stack by the missing distance, and by nothing when it already shows.
	// The browser leaves a control that is only partly under the stack where it is; this brings
	// it fully above the stack, without ever pushing its top out of the window.
	let stack: HTMLElement | undefined = $state();
	function keepClearOfStack(event: FocusEvent) {
		const target = event.target;
		if (!stack || reservedHeight === 0 || !(target instanceof HTMLElement)) return;
		if (target.closest('[data-toast]')) {
			target.scrollIntoView({ block: 'nearest' });
			return;
		}
		const control = target.getBoundingClientRect();
		const toasts = stack.getBoundingClientRect();
		const sideBySide = control.right <= toasts.left || control.left >= toasts.right;
		if (sideBySide || control.bottom <= toasts.top) return;
		const clearance = control.bottom - toasts.top + 8;
		window.scrollBy({ top: Math.max(0, Math.min(clearance, control.top - 8)) });
	}

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
		const neighbourButton = neighbour?.querySelector<HTMLElement>('[data-toast-dismiss]') ?? null;
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

<svelte:window onfocusin={keepClearOfStack} />

<!-- The handler only records where focus came from; it adds no interaction. -->
<div
	bind:this={stack}
	bind:clientHeight={stackHeight}
	role={hasToasts ? 'region' : undefined}
	aria-label={hasToasts ? m.notifications_region() : undefined}
	class="fixed right-0 bottom-0 z-50 flex max-h-[40vh] flex-col gap-2 overflow-x-hidden overflow-y-auto p-4"
	onfocusin={rememberFocusOrigin}
>
	<div role="status" aria-atomic="false" class="space-y-2">
		{#each notifications.statuses as toast (toast.id)}
			<ToastItem
				{toast}
				onpause={() => notifications.pause(toast.id)}
				onresume={() => notifications.resume(toast.id)}
				ondismiss={(closeButton: HTMLElement) => void dismiss(toast.id, closeButton)}
				oncopyreference={(reference: string) => void notifications.copyReference(reference)}
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
				oncopyreference={(reference: string) => void notifications.copyReference(reference)}
			/>
		{/each}
	</div>
</div>
