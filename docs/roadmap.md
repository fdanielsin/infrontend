# Roadmap frontend

## Phase 0 — documentation et validation

- [x] Préparer l'architecture cible de l'application unique.
- [x] Préparer la direction des dépendances.
- [x] Préparer la frontière frontend/backend.
- [x] Documenter Bun comme runtime officiel.
- [ ] Valider cette proposition avec le propriétaire du projet.

## Phase 1 — porte de validation

- [ ] Ajouter une commande Bun unique pour la vérification complète.
- [ ] Rendre les contrôles obligatoires et supprimer les contournements
      `|| true` des étapes obligatoires.
- [ ] Rationaliser les workflows CI frontend.
- [ ] Vérifier que chaque suite de tests déclarée est réellement exécutée.

## Phase 2 — modularisation sans changement fonctionnel

- [ ] Définir les frontières `users`, `tasks` et `stats`.
- [ ] Déplacer les composants par fonctionnalité.
- [ ] Séparer progressivement API, stores, état local et présentation.
- [ ] Décider pour chaque store s'il est propre à une fonctionnalité ou
      transversal.
- [ ] Scinder le store utilisateur actuel selon ces frontières sans changer le
      comportement.
- [ ] Conserver les routes comme des compositions d'écrans.
- [ ] Ajouter les tests comportementaux au fil des déplacements.

## Phase 3 — garde-fous d'architecture

- [ ] Tester la direction des imports.
- [ ] Vérifier qu'aucun module partagé ne dépend d'une route ou d'une app.
- [ ] Vérifier la centralisation des projections API.
- [ ] Formaliser les états d'écran discriminés là où ils sont nécessaires.

## Hors périmètre actuel

- Plusieurs applications SvelteKit.
- Packages frontend partagés.
- Authentification BFF.
- Internationalisation multi-application.
- Génération de types depuis un contrat OpenAPI non encore stabilisé.
