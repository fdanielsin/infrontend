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

`users` et `tasks` sont réellement modularisés depuis le lot "nettoyage
frontend" du 2026-09-30 (F-03 réglé : voir `handoff.md`). `stats` reste hors
périmètre, rien n'y justifie encore un dossier de fonctionnalité séparé.

- [x] Définir les frontières `users`, `tasks` et `stats`.
- [x] Déplacer les composants par fonctionnalité (`TaskForm.svelte` dans
      `lib/features/tasks/`).
- [x] Séparer progressivement API, stores, état local et présentation.
- [x] Décider pour chaque store s'il est propre à une fonctionnalité ou
      transversal (`lib/features/tasks/store.ts` propre à `tasks` ;
      `loading`/`error` transversaux dans `lib/stores/request-status.ts`).
- [x] Scinder le store utilisateur actuel selon ces frontières sans changer le
      comportement (`lib/stores/user.ts` supprimé, contenu redistribué).
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
      cocher d'une tâche après un `toggleTask` refusé, test de composant
      dédié. Le point 1 de Q-01 (consommer `response.data`) est reporté :
      voir `handoff.md`.
- [x] Lot "nettoyage frontend" (2026-09-30) — règle F-03 : `lib/features/tasks/`
      créé (store + `TaskForm.svelte`), `lib/stores/user.ts` supprimé,
      `loading`/`error` déplacés dans `lib/stores/request-status.ts`
      (transversal, comportement inchangé — F-02 reste présent, seulement
      mieux rangé), `Notification.svelte` déplacé vers `lib/ui/`. Code et
      config morts retirés : `fetchUserTasks` (jamais appelée), `lib/index.ts`
      (placeholder vide), Husky/lint-staged (hooks inertes, `core.hooksPath`
      pointait vers un dossier inexistant), bloc `test` mort de
      `vite.config.ts` (jamais exécuté, masqué par `vitest.config.ts`). Ce lot
      remplace l'ancien "Lot 7".
- [ ] Lot 2 — F-01 (le client HTTP perd le message d'erreur du backend sur
      toute réponse non-2xx) et F-02 (partage `loading`/`error` entre
      `users` et `tasks`, symptôme visible encore présent après le nettoyage).
- [ ] Lot 3 — Q-07.
- [ ] Lot 5 — doublon du job CI "component-tests" (relance exactement
      `bun run test`, déjà fait par "unit-tests").
- [ ] Lot 8 — propositions d'amélioration : FP-03 (confirmation avant
      suppression d'une tâche), FP-01 (filtrer les tâches), FP-02 (compteur
      de tâches restantes), FP-04 (« tout marquer comme terminé »).

## Hors périmètre actuel

- Plusieurs applications SvelteKit.
- Packages frontend partagés.
- Authentification BFF.
- Internationalisation multi-application.
- Génération de types depuis un contrat OpenAPI non encore stabilisé.
