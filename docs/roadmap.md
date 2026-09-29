# Roadmap frontend

## Phase 0 — documentation et validation

- [x] Préparer l'architecture cible de l'application unique.
- [x] Préparer la direction des dépendances.
- [x] Préparer la frontière frontend/backend.
- [x] Documenter Bun comme runtime officiel.
- [x] Valider cette proposition avec le propriétaire du projet.

## Phase 1 — porte de validation

- [x] Ajouter une commande Bun unique pour la vérification complète.
- [x] Rendre les contrôles obligatoires et supprimer les contournements
      `|| true` des étapes obligatoires.
- [x] Rationaliser les workflows CI frontend.
- [x] Vérifier que chaque suite de tests déclarée est réellement exécutée.

## Phase 2 — modularisation sans changement fonctionnel

Seule `users` a été réellement modularisée. Les cases ci-dessous concernant
`tasks`/`stats` ont été décochées le 2026-09-29 : le code ne correspondait pas
à ce qu'elles affirmaient (constat F-03). Traitement au lot 7 (voir
"Plan de lots" ci-dessous).

- [x] Définir les frontières `users`, `tasks` et `stats`.
- [ ] Déplacer les composants par fonctionnalité (fait pour `users`
      uniquement ; `TaskForm.svelte` reste dans `lib/components/`).
- [ ] Séparer progressivement API, stores, état local et présentation (fait
      pour `users` ; les actions de tâches restent dans `lib/stores/user.ts`).
- [ ] Décider pour chaque store s'il est propre à une fonctionnalité ou
      transversal (non fait pour `tasks`, qui n'a pas de store dédié).
- [ ] Scinder le store utilisateur actuel selon ces frontières sans changer le
      comportement (non fait : `toggleTask`/`editTask`/`addTask`/`removeTask`
      vivent toujours dans `lib/stores/user.ts`).
- [x] Conserver les routes comme des compositions d'écrans.
- [x] Ajouter les tests comportementaux au fil des déplacements.

## Phase 3 — garde-fous d'architecture

- [ ] Tester la direction des imports.
- [ ] Vérifier qu'aucun module partagé ne dépend d'une route ou d'une app.
- [ ] Vérifier la centralisation des projections API.
- [ ] Formaliser les états d'écran discriminés là où ils sont nécessaires.

Les prochaines étapes d'architecture restent volontairement ouvertes : la
modularisation de `tasks` et `stats` pourra être approfondie si elle apporte
un bénéfice réel sans changer le comportement.

## Plan de lots (suite à l'audit frontend)

Découpage convenu avec le lead pour traiter les constats de l'audit
(F-01 à F-04) et les propositions (FP-01 à FP-05), plus les questions
ouvertes par `qa` (Q-xx). Un lot ne commence qu'après un plan envoyé au lead
et un « GO » explicite.

- [x] Lot 1 — Q-01, point 2 uniquement : resynchronisation de la case à
      cocher d'une tâche après un `toggleTask` refusé
      (`src/lib/stores/user.ts`, `src/lib/components/TaskForm.svelte`), test
      de composant dédié. Le point 1 de Q-01 (consommer `response.data`) est
      reporté : voir `handoff.md`.
- [ ] Lot 2 — F-01 (le client HTTP perd le message d'erreur du backend sur
      toute réponse non-2xx) et F-02 (partage `loading`/`error` entre
      `users` et `tasks`).
- [ ] Lot 3 — Q-07.
- [ ] Lot 7 — F-03 : mettre la documentation en accord avec le code (les
      cases de la Phase 2 ci-dessus ne sont pas corrigées avant ce lot) ou
      terminer réellement la modularisation `tasks`/`stats` qu'elles
      annoncent.
- [ ] Lot 8 — propositions d'amélioration : FP-03 (confirmation avant
      suppression d'une tâche), FP-01 (filtrer les tâches), FP-02 (compteur
      de tâches restantes), FP-04 (« tout marquer comme terminé »).

## Hors périmètre actuel

- Plusieurs applications SvelteKit.
- Packages frontend partagés.
- Authentification BFF.
- Internationalisation multi-application.
- Génération de types depuis un contrat OpenAPI non encore stabilisé.
