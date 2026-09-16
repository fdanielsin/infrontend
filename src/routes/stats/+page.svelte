<script lang="ts">
	import { onMount } from 'svelte';

	let stats = $state<{ users: number; tasks: number } | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			loading = true;
			// Fetch stats from API
			const statsResp = await fetch('http://localhost:8080/api/v1/stats');
			if (!statsResp.ok) throw new Error('Failed to fetch stats');

			const data = await statsResp.json();
			stats = data.data;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	});
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
	<div class="max-w-2xl mx-auto">
		<h1 class="text-4xl font-bold text-gray-800 mb-8">📊 Statistiques</h1>

		{#if loading}
			<div class="bg-white rounded-lg shadow-lg p-8 text-center">
				<p class="text-gray-600">Chargement des statistiques...</p>
			</div>
		{:else if error}
			<div class="bg-red-50 border border-red-200 rounded-lg shadow-lg p-8">
				<p class="text-red-600 font-semibold">❌ Erreur: {error}</p>
			</div>
		{:else if stats}
			<div class="grid grid-cols-2 gap-6">
				<div class="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition">
					<div class="text-5xl font-bold text-blue-600">{stats.users}</div>
					<p class="text-gray-600 text-lg mt-2">👥 Utilisateurs</p>
				</div>
				<div class="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition">
					<div class="text-5xl font-bold text-indigo-600">{stats.tasks}</div>
					<p class="text-gray-600 text-lg mt-2">✅ Tâches</p>
				</div>
			</div>

			<div class="mt-8 bg-white rounded-lg shadow-lg p-6">
				<h2 class="text-lg font-semibold text-gray-800 mb-4">Résumé</h2>
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
			<div class="bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg p-8">
				<p class="text-yellow-600">Pas de données disponibles</p>
			</div>
		{/if}

		<div class="mt-8">
			<a href="/" class="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
				← Retour à l'accueil
			</a>
		</div>
	</div>
</div>
