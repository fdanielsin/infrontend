# Architecture frontend

## Statut

Architecture retenue pour une modularisation progressive. `users` et `tasks`
sont réellement modularisés (composant et store dédiés chacun) ; `stats`
reste dans sa route (`routes/stats/+page.svelte`), rien n'y justifie encore
un dossier de fonctionnalité séparé. `loading`/`error` sont propres à chaque domaine (`usersStatus`,
`tasksStatus`, fabrique `createRequestStatus` dans
`lib/stores/request-status.ts`).

## Cible

Le projet reste une application SvelteKit unique. La séparation se fait
d'abord par responsabilité :

```text
src/
├── routes/                 # Routage et composition des écrans
└── lib/
    ├── api/                # Client HTTP et types du contrat
    ├── features/           # Fonctionnalités orientées utilisateur
    │   ├── users/
    │   ├── tasks/
    │   └── stats/
    ├── ui/                 # Composants visuels génériques
    ├── stores/             # État partagé transversal réellement nécessaire
    ├── validation/         # Validation UX locale
    ├── config/             # Configuration injectée
    └── testing/            # Utilitaires de test
```

Les dossiers ne seront créés que lorsqu'un déplacement réel le justifie.
Cette structure n'impose pas de créer un fichier vide pour chaque catégorie.

## Direction des dépendances

```text
routes → features → api / ui / config
```

Règles :

- `api` ne dépend jamais de `routes` ni d'une fonctionnalité ;
- `ui` ne dépend jamais d'une fonctionnalité métier ;
- une fonctionnalité ne dépend pas d'une autre fonctionnalité sans raison
  documentée (ex. `features/users` dépend de `features/tasks` : sélectionner
  un utilisateur charge ses tâches) ;
- les modules réutilisables ne lisent pas directement les variables
  d'environnement SvelteKit ;
- l'URL backend et les dépendances externes sont injectées aux clients ;
- aucune route ne duplique la projection d'un endpoint déjà centralisée.

## Frontière avec le backend

- Le backend est propriétaire du contrat d'API et des règles métier.
- Le frontend ne recalcule pas de règles métier ou de montants.
- Les statuts et énumérations sont issus du contrat lorsqu'un contrat existe.
- La validation locale sert à l'ergonomie et au retour immédiat à l'utilisateur.
- Une validation UX ne doit pas devenir une seconde source de vérité métier.
- Une réponse vide, une liste vide et une erreur doivent rester distinguables.

## État d'écran

Les fonctionnalités doivent préférer des états discriminés lorsque plusieurs
booléens rendraient les combinaisons ambiguës :

```ts
type LoadState<T> =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'success'; data: T }
	| { status: 'error'; message: string };
```

Les stores sont une responsabilité explicite de l'architecture :

- un store de fonctionnalité vit près de sa fonctionnalité lorsqu'il porte son
  état et ses actions (`users`, `tasks`, `stats`) ;
- un store transversal vit dans `lib/stores` uniquement lorsqu'il est partagé
  entre plusieurs fonctionnalités ou routes ;
- l'état temporaire d'un formulaire ou d'un écran reste local au composant ou
  à la route ;
- un store ne doit pas mélanger plusieurs domaines sans frontière claire ;
- les appels API et les stores restent séparés : le store orchestre l'état,
  le client API exécute la communication.

Un store global n'est donc justifié que si l'état est partagé entre plusieurs
routes ou fonctionnalités. Sinon, l'état reste local à la fonctionnalité ou à
la route.

## Évolution future

Un découpage en packages ou plusieurs applications ne sera envisagé que
lorsqu'un second consommateur réel nécessitera du code partagé. Il ne sera pas
créé par anticipation.
