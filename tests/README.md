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

Les noms décrivent le comportement attendu et finissent par sa catégorie
(voir `docs/specs/test-matrix.md` à la racine du workspace) : `happy path`,
`sad path` (erreur), `limit`, `boundary` ou `exception`. Un test qui fige une
règle de validation actuelle, dont le comportement peut encore être décidé
autrement, commence par `current rule:`.

Les tests ne dépendent d'aucun backend réel : les stores et les composants
mockent `$lib/api/client` avec `vi.mock` ; les tests du client, et ceux qui
vérifient ce que les stores font d'une panne de transport
(`stores/stores-real-client.test.ts`), remplacent seulement `fetch`.

`bun run verify` exige `PUBLIC_API_URL` (lu via `$env/static/public`) : la CI
le fixe dans son workflow ; en local, il vient de `.env.local` ou de la ligne
de commande (`PUBLIC_API_URL=http://localhost:8080 bun run verify`).

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

Chaque test de composant nettoie le DOM rendu (`cleanup()` dans un
`afterEach`).
