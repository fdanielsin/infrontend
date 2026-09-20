# Frontend tests

Tous les tests du frontend vivent sous `tests/`.

- `tests/unit/` contient les tests unitaires et les tests de composants,
  organisés par domaine :
  - `tests/unit/api/` pour le client et les façades API ;
  - `tests/unit/stores/` pour les stores ;
  - `tests/unit/components/` pour les composants lorsque nécessaire.
- `tests/e2e/` contient les scénarios Playwright de bout en bout.

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
