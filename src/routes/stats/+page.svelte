<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { api, type Stats } from '$lib/api/client';
	import { createRequestStatus } from '$lib/stores/request-status';

	const { loading, error, run } = createRequestStatus();
	loading.set(true);
	let stats = $state<Stats | null>(null);

	onMount(async () => {
		const result = await run(() => api.getStats(), { fallbackMessage: 'Failed to fetch stats' });
		if (result.success) stats = result.data;
	});
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
	<div class="mx-auto max-w-2xl">
		<h1 class="mb-8 text-4xl font-bold text-gray-800">📊 Statistiques</h1>

		{#if $loading}
			<div class="rounded-lg bg-white p-8 text-center shadow-lg">
				<p class="text-gray-600">Chargement des statistiques...</p>
			</div>
		{:else if $error}
			<div class="rounded-lg border border-red-200 bg-red-50 p-8 shadow-lg">
				<p class="font-semibold text-red-600">❌ Erreur: {$error}</p>
			</div>
		{:else if stats}
			<div class="grid grid-cols-2 gap-6">
				<div class="rounded-lg bg-white p-6 shadow-lg transition hover:shadow-xl">
					<div class="text-5xl font-bold text-blue-600">{stats.users}</div>
					<p class="mt-2 text-lg text-gray-600">👥 Utilisateurs</p>
				</div>
				<div class="rounded-lg bg-white p-6 shadow-lg transition hover:shadow-xl">
					<div class="text-5xl font-bold text-indigo-600">{stats.tasks}</div>
					<p class="mt-2 text-lg text-gray-600">✅ Tâches</p>
				</div>
			</div>

			<div class="mt-8 rounded-lg bg-white p-6 shadow-lg">
				<h2 class="mb-4 text-lg font-semibold text-gray-800">Résumé</h2>
				<ul class="space-y-2 text-gray-600">
					<li>• Total d'utilisateurs créés: <strong>{stats.users}</strong></li>
					<li>• Total de tâches créées: <strong>{stats.tasks}</strong></li>
					<li>
						• Moyenne de tâches par utilisateur:
						<strong>{stats.users > 0 ? (stats.tasks / stats.users).toFixed(2) : 0}</strong>
					</li>
				</ul>
			</div>
		{:else}
			<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-8 shadow-lg">
				<p class="text-yellow-600">Pas de données disponibles</p>
			</div>
		{/if}

		<div class="mt-8">
			<a
				href={resolve('/')}
				class="inline-block rounded-lg bg-blue-600 px-6 py-2 text-white transition hover:bg-blue-700"
			>
				← Retour à l'accueil
			</a>
		</div>
	</div>
</div>
