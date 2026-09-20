# 0001 — Architecture frontend modulaire dans une application unique

## Statut

proposed

## Date

2026-09-20

## Décision

Le frontend reste une seule application SvelteKit et adopte une séparation
progressive par responsabilités : routes, fonctionnalités, API, UI, état,
configuration et tests.

Les packages et applications séparés ne seront introduits que lorsqu'un
consommateur réel le justifiera.

## Raisons

- Le frontend actuel n'a qu'une application et peu de fonctionnalités.
- Copier immédiatement le monorepo du projet précédent créerait une complexité
  sans besoin démontré.
- Une séparation par fonctionnalité améliore déjà la lisibilité et les tests.
- Cette structure laisse une évolution future vers des packages sans la
  présupposer.

## Conséquences

- Les routes composent les écrans et ne portent pas la logique API complète.
- Les fonctionnalités regroupent leur code spécifique.
- Les modules partagés restent indépendants des routes.
- Toute extraction vers un package doit être motivée par un second consommateur.
