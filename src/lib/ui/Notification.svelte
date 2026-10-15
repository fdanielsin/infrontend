<script lang="ts">
	import { tick } from 'svelte';
	import ToastItem from '$lib/ui/ToastItem.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import type { PauseReason } from '$lib/state/notification.svelte';

	const { notifications } = getAppState();

	// The page reserves the room of the stack (see layout.css): a focused control can always be
	// scrolled above it, even on a page that did not scroll (WCAG 2.4.11).
	let stackHeight = $state(0);
	// The stack is a landmark only while it holds something to reach; the live regions inside it
	// stay rendered, empty, so that a later message is announced.
	const hasToasts = $derived(notifications.shown.length > 0);
	const reservedHeight = $derived(hasToasts ? stackHeight : 0);
	$effect(() => {
		const root = document.documentElement;
		root.style.setProperty('--toast-stack-height', `${reservedHeight}px`);
		return () => root.style.removeProperty('--toast-stack-height');
	});

	$effect(() => () => notifications.clearAnnouncement());

	// A close button reached by Tab must be wholly inside the stack, which scrolls when it is tall.
	// Firefox on Linux leaves a button clipped by a few pixels where it is (its outline with it);
	// "nearest" scrolls the stack by the missing distance, and by nothing when it already shows.
	// The browser leaves a control that is only partly under the stack where it is; this brings
	// it fully above the stack, without ever pushing its top out of the window.
	let stack: HTMLElement | undefined = $state();
	function keepClearOfStack(event: FocusEvent) {
		if (event.target instanceof HTMLElement) clearOfStack(event.target);
	}

	function clearOfStack(target: HTMLElement) {
		if (!stack || reservedHeight === 0) return;
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

	// A toast arrives while a control already has the focus (a command that stays after a partial
	// failure, a checkbox whose update was refused): no focus event comes, and the stack may now
	// cover that control. Once the stack has its size, the control is brought above it.
	$effect(() => {
		if (reservedHeight === 0) return;
		const frame = requestAnimationFrame(() => {
			const active = document.activeElement;
			if (active instanceof HTMLElement && active !== document.body) clearOfStack(active);
		});
		return () => cancelAnimationFrame(frame);
	});

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
	// Safari) leaves the focus where it is, and so does one whose action has put the focus
	// somewhere else, on a control that is still there.
	function leave(control: HTMLElement, close: () => void) {
		const toastElement = control.closest('[data-toast]');
		const hadFocus = toastElement?.contains(document.activeElement) ?? false;
		const neighbour = toastElement?.nextElementSibling ?? toastElement?.previousElementSibling;
		const neighbourButton = neighbour?.querySelector<HTMLElement>('[data-toast-dismiss]') ?? null;
		try {
			close();
		} finally {
			// The toast is gone even if its action failed: the focus must not be lost with it.
			if (hadFocus) void refocus(neighbourButton);
		}
	}

	async function refocus(neighbourButton: HTMLElement | null) {
		await tick();
		const focused = document.activeElement;
		if (focused instanceof HTMLElement && focused !== document.body && focused.isConnected) return;
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

<!-- Low-severity news (sort order, a row that moved) is read, never shown. The region is always
rendered, empty: a region that appears with its text is not announced. It is explicitly live, not
role="status": the toasts own the page's single status region. The key renders a repeated
sentence anew. -->
<p data-announcement aria-live="polite" aria-atomic="true" class="sr-only">
	{#key notifications.announcement?.id}{notifications.announcement?.message ?? ''}{/key}
</p>

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
				onpause={(reason: PauseReason) => notifications.pause(toast.id, reason)}
				onresume={(reason: PauseReason) => notifications.resume(toast.id, reason)}
				ondismiss={(closeButton: HTMLElement) =>
					leave(closeButton, () => notifications.remove(toast.id))}
				onaction={(actionButton: HTMLElement) =>
					leave(actionButton, () => notifications.runAction(toast.id))}
				oncopyreference={(reference: string) => void notifications.copyReference(reference)}
			/>
		{/each}
	</div>
	<div role="alert" aria-atomic="false" class="space-y-2">
		{#each notifications.alerts as toast (toast.id)}
			<ToastItem
				{toast}
				onpause={(reason: PauseReason) => notifications.pause(toast.id, reason)}
				onresume={(reason: PauseReason) => notifications.resume(toast.id, reason)}
				ondismiss={(closeButton: HTMLElement) =>
					leave(closeButton, () => notifications.remove(toast.id))}
				onaction={(actionButton: HTMLElement) =>
					leave(actionButton, () => notifications.runAction(toast.id))}
				oncopyreference={(reference: string) => void notifications.copyReference(reference)}
			/>
		{/each}
	</div>
</div>
