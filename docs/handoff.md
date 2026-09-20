# Handoff frontend

## État vérifié

Le frontend est une application SvelteKit unique utilisant Bun. Les corrections
fonctionnelles issues de l'audit frontend ont été appliquées sans modifier le
backend.

Les validations suivantes passent au moment de la rédaction :

```text
bun run verify
bun run check
bun run test
bun run build
```

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

## Contraintes

- Ne pas modifier le backend pendant la modularisation frontend.
- Ne pas introduire plusieurs applications ou packages sans consommateur réel.
- Utiliser Bun dans les commandes, la documentation et la CI frontend.
- Ne pas considérer un contrôle comme valide s'il est masqué par `|| true`.

## Prochaine étape

Poursuivre la modularisation de `tasks` puis de `stats` uniquement lorsqu'une
extraction apporte une séparation claire et sans changement fonctionnel.
