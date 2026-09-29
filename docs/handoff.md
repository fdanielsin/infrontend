# Handoff frontend

## État vérifié

Le frontend est une application SvelteKit unique utilisant Bun. Les corrections
fonctionnelles issues de l'audit frontend ont été appliquées sans modifier le
backend.

Lot 1 de l'audit (Q-01, point 2) est terminé : la case à cocher d'une tâche
restait visuellement dans l'état du clic natif du navigateur après un
`toggleTask` refusé par l'API, car le binding Svelte `checked={task.completed}`
est à sens unique et ne réécrit pas le DOM quand la valeur lue reste identique
(vérifié par un test qui a d'abord fait échouer un correctif purement store,
avant de corriger l'hypothèse). Le correctif agit directement sur l'élément
DOM reçu par l'évènement `onchange` de la case
(`src/lib/components/TaskForm.svelte`), et `toggleTask`
(`src/lib/stores/user.ts`) retourne désormais `Promise<boolean>` pour que
l'appelant sache s'il doit annuler son changement optimiste. Le point 1 de
Q-01 (faire consommer `response.data` par `toggleTask`/`editTask`) reste
volontairement non fait : la réponse du `PUT` ne reflétait pas l'état
réellement persisté avant la correction backend (DTO à pointeurs +
`Select(...).Updates(...)`), et n'a pas encore été re-validée côté frontend
depuis ce correctif.

Les validations suivantes passent au moment de la rédaction :

```text
bun run verify
bun run check
bun run test
bun run build
```

Le test end-to-end Playwright de persistance (`tests/e2e/task-persistence.test.ts`,
écrit par `qa`) passe contre le backend corrigé, mais n'a pas été exécuté par
l'agent frontend (backend non lancé localement de ce côté).

La CI frontend vérifie également le formatage, le lint, le typage, le build, les
tests unitaires, les tests composants, la sécurité, les E2E et la couverture.
La couverture utilise `@vitest/coverage-v8`.

## État de la structure

- La fonctionnalité `users` possède son composant et son store dédiés dans
  `src/lib/features/users/`.
- Les stores transversaux restent dans `src/lib/stores/`.
- Le client HTTP partagé reste dans `src/lib/api/`.
- Les routes composent les écrans sans déplacer la logique backend.
- Le workflow frontend unique est
  `.github/workflows/ci.yml`.
- `tests/unit/components/` existe désormais (premier fichier :
  `TaskForm.test.ts`), en plus de `tests/unit/api/` et `tests/unit/stores/`.
  Le rendu de composants Svelte sous Vitest exige
  `resolve: { conditions: ['browser'] }` dans `vitest.config.ts` (sinon Vite
  résout le build serveur de Svelte même sous `jsdom`, et `mount()` échoue) ;
  cette option est maintenant présente et documentée dans le fichier lui-même.

## Contraintes

- Ne pas modifier le backend pendant la modularisation frontend.
- Ne pas introduire plusieurs applications ou packages sans consommateur réel.
- Utiliser Bun dans les commandes, la documentation et la CI frontend.
- Ne pas considérer un contrôle comme valide s'il est masqué par `|| true`.

## Prochaine étape

Lot 2 du plan d'audit (`roadmap.md`) : F-01 (le client HTTP perd le message
d'erreur du backend sur toute réponse non-2xx) et F-02 (partage
`loading`/`error` entre `users` et `tasks`). La modularisation de `tasks` puis
de `stats` reste par ailleurs à traiter au lot 7, uniquement lorsqu'une
extraction apporte une séparation claire et sans changement fonctionnel.
