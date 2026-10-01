# Architecture frontend

## Statut

Architecture retenue pour une modularisation progressive. `users` et `tasks`
sont réellement modularisés (composant dédié chacun) ; `stats` reste dans sa
route (`routes/stats/+page.svelte`), rien n'y justifie encore un dossier de
fonctionnalité séparé. L'état partagé vit dans des classes `.svelte.ts`
(`lib/state/`), créées une fois dans `+layout.svelte` et fournies par
`createContext` ; `loading`/`error` sont propres à chaque domaine (une
instance de `RequestStatus` par classe d'état).

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
    ├── state/              # Classes d'état réactif ($state), fournies par contexte
    ├── i18n/               # Messages d'erreur de l'API, formats de nombres, noms des langues
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
- Les types du contrat sont générés (`src/lib/api/schema.d.ts`, openapi-typescript,
  jamais édité à la main) et le client `lib/api/client.ts` appelle l'API avec
  openapi-fetch : chemin, méthode, corps et paramètres sont vérifiés par le
  compilateur. Une dérive entre ce fichier et le contrat est détectée par
  `bun run api:check` (job CI `contract`).
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

L'état partagé est une responsabilité explicite de l'architecture :

- il est porté par des classes `.svelte.ts` dans `lib/state/` (`UserState`,
  `TaskState`, `NotificationState`, `RequestStatus`), sans singleton de module ;
  leurs dépendances arrivent par le constructeur ;
- `AppState` les assemble ; `+layout.svelte` en crée une instance et la
  fournit avec `setAppState` ; les composants la lisent avec `getAppState`
  (`createContext`, sans clé à gérer). Une instance par arbre de composants :
  pas d'état partagé entre deux requêtes côté serveur ni entre deux tests ;
- l'état temporaire d'un formulaire ou d'un écran reste local au composant ou
  à la route (la page stats crée son propre `RequestStatus`) ;
- une classe ne mélange pas plusieurs domaines sans frontière claire ;
- les appels API et l'état restent séparés : la classe orchestre l'état, le
  client API exécute la communication.

L'état global n'est justifié que s'il est partagé entre plusieurs routes ou
fonctionnalités. Sinon, il reste local à la fonctionnalité ou à la route.

## Évolution future

Un découpage en packages ou plusieurs applications ne sera envisagé que
lorsqu'un second consommateur réel nécessitera du code partagé. Il ne sera pas
créé par anticipation.
