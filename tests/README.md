# Frontend tests

Tous les tests du frontend vivent sous `tests/`.

- `tests/unit/` contient les tests unitaires et les tests de composants,
  organisés par domaine :
  - `tests/unit/api/` pour le client et les façades API ;
  - `tests/unit/stores/` pour les stores ;
  - `tests/unit/components/` pour les composants lorsque nécessaire.
- `tests/e2e/` contient les scénarios Playwright de bout en bout contre
  l'application et l'API `inbackend`.

Les E2E locaux nécessitent un backend `inbackend` disponible sur
`http://localhost:8080`. La CI démarre automatiquement `inbackend` avec une
base PostgreSQL de service.

Chaque fichier de test utilise le suffixe `.test.ts` ou `.test.svelte`.

Les scénarios suivent une structure explicite :

```ts
// GIVEN: Préconditions et données de test.
// WHEN: Action testée.
// THEN: Résultat attendu.
```

Les noms distinguent le chemin nominal (`happy path`) du chemin d'erreur ou
limite (`sad path`) et décrivent le comportement attendu.

Les fichiers de production ne doivent pas contenir de fichiers `*.test.*`,
`*.spec.*` ou de dossiers `__tests__/`.

## Tests de composants

Les tests sous `tests/unit/components/` rendent un composant Svelte avec
`@testing-library/svelte` (`render`, `fireEvent`, `waitFor`, `cleanup`) sous
l'environnement `jsdom` de Vitest. Cela exige
`resolve: { conditions: ['browser'] }` dans `vitest.config.ts` (déjà présent) :
sans cette option, Vite résout le build serveur de Svelte même sous Vitest, et
`mount()` échoue avec `lifecycle_function_unavailable`. Voir
[la documentation Svelte sur les tests](https://svelte.dev/docs/svelte/testing#Component-testing).

Comme pour les autres tests unitaires, `$lib/api/client` est mocké avec
`vi.mock` pour ne dépendre d'aucun backend réel, et chaque test nettoie le DOM
rendu (`cleanup()` dans un `afterEach`).
