# Handoff frontend

## État vérifié

Le frontend est une application SvelteKit unique utilisant Bun. Les corrections
fonctionnelles issues de l'audit frontend ont été appliquées sans modifier le
backend.

Les validations suivantes passent au moment de la rédaction :

```text
bun run check
bun run test
bun run build
```

Le lint comporte encore des écarts de formatage Prettier à traiter dans une
phase dédiée.

## Prochaine étape

Faire valider l'architecture et ces conventions avant de déplacer les fichiers.
Après validation, commencer par la porte de vérification Bun, puis modulariser
une fonctionnalité à la fois sans changement fonctionnel.

## Contraintes

- Ne pas modifier le backend pendant la modularisation frontend.
- Ne pas introduire plusieurs applications ou packages sans consommateur réel.
- Utiliser Bun dans les commandes, la documentation et la CI frontend.
- Ne pas considérer un contrôle comme valide s'il est masqué par `|| true`.
