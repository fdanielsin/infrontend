<script lang="ts">
	import { notifications } from '$lib/stores/notification';
</script>

<div class="fixed top-0 right-0 z-50 space-y-2 p-4" aria-live="polite" aria-atomic="true">
	{#each $notifications as notif (notif.id)}
		<div
			role={notif.type === 'error' ? 'alert' : 'status'}
			class="animate-slide-in rounded-lg px-4 py-3 text-white shadow-lg"
			class:bg-green-500={notif.type === 'success'}
			class:bg-red-500={notif.type === 'error'}
			class:bg-blue-500={notif.type === 'info'}
			class:bg-yellow-500={notif.type === 'warning'}
		>
			{notif.message}
		</div>
	{/each}
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

	:global(.animate-slide-in) {
		animation: slideIn 0.3s ease-out;
	}
</style>
