# Architecture frontend

## Statut

Stack : SvelteKit avec Svelte 5 (runes), TypeScript strict, Bun, Tailwind CSS 4,
Paraglide (textes en en/fr/de/es), icônes Iconoir (`unplugin-icons`, voir l'ADR
[0003](./decisions/0003-icones-iconoir-unplugin-icons.md)), openapi-fetch avec types
générés, zod pour la validation locale ; tests avec Vitest et Playwright.

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
    │   ├── users/          # UserForm (création) + UserList (liste en carte propre, sélection)
    │   ├── tasks/          # TaskForm (ajout, brouillon d'édition) + TaskList + TaskItem (une ligne) + ClampedText (description repliée)
    │   └── stats/
    ├── ui/                 # Composants visuels génériques et jetons de design (layout.css)
    ├── state/              # Classes d'état réactif ($state), fournies par contexte
    ├── i18n/               # Messages d'erreur de l'API, formats de nombres, noms des langues
    ├── validation/         # Validation UX locale
    ├── config/             # Configuration injectée
    └── testing/            # Utilitaires de test
messages/                   # Textes de l'interface, un fichier JSON par langue
project.inlang/             # Projet Paraglide (langues, plugin de format de messages)
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
  `TaskState`, `NotificationState`, `AvailabilityState`, `RequestStatus`), sans singleton de module ;
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

## Disponibilité du service

`AvailabilityState` (`lib/state/`, état `unknown`, `available`, `unavailable`) interroge
`GET /ready` (délai 5 s). `ensure()` donne la première réponse, `check()` vérifie
tout de suite ; les appels simultanés partagent une seule requête. Tant que le service
est en incident, il revérifie après 5, 10, 20, 40 puis 60 s (jitter 0,8 à 1,2, plafond
strict de 60 s appliqué après le jitter), se met en pause quand l'onglet est caché et
vérifie aussitôt à son retour. Au rétablissement, les abonnés `onRecovered` sont appelés
une fois et un toast `success` l'annonce. Les écrans (`/`, `/stats`) chargent leurs
données avec `runWhenAvailable` : rien n'est demandé tant que le service est en incident,
donc aucune cascade d'erreurs de liste ; sur un 4xx ou une réponse mal formée de
`/ready`, ils chargent comme avant. Une panne qui survient après le chargement reste
signalée par les toasts habituels (pas de bandeau).

`features/availability/AvailabilityBanner.svelte` (dans `+layout.svelte`, dans le flux
de la page) garde son conteneur toujours rendu ; le texte est un `role="alert"` inséré à
l'incident (et réinséré après un « Réessayer » qui échoue), le bouton « Réessayer » est
hors de l'alerte et rend le focus à `main` quand il rétablit le service.
`ApiVersion.svelte` affiche en pied de page « API x.y.z » (`GET /health`), sans bruit
en cas d'échec et sans décaler la page (hauteur fixe).

## Tri des tâches

`features/tasks/sort-tasks.ts` (pur, muté par Stryker) trie sans modifier son entrée : ordre
de création (id croissant, celui de l'API), titre (`Intl.Collator(langue de l'interface,
{ numeric: true, sensitivity: 'base' })` : « Tâche 2 » avant « Tâche 10 », casse et accents
ignorés, `ñ` après `n` en espagnol) ou état (à faire puis terminées). Toute égalité est
départagée par l'id, donc l'ordre est stable. `TaskOrderState` (`lib/state/`) garde le choix
dans `localStorage` sous la clé `indrive.task-order` : lu à la construction (jamais sur le
serveur), valeur inconnue ou stockage absent, refusé ou qui lève = ordre de création, sans
message ; écrit à chaque changement. `TaskList` dérive la liste affichée
(`$derived(sortTasks(...))`) : `tasks.tasks` n'est jamais réordonné, donc création,
modification, suppression, changement d'utilisateur et de langue sont triés sans code en plus.
Le sélecteur (`Select` natif, à partir de 2 tâches) annonce « Tâches triées par … »
dans la région d'annonce de `Notification` (`NotificationState.announce`, `aria-live`, sans toast)
une fois par changement de choix, jamais au chargement. Quand une modification
(case à cocher, enregistrement d'une édition) déplace la ligne, le focus reste sur le même
contrôle (restauré après `tick()`) et « titre : position N sur M » est annoncé de même.

## Évolution future

Un découpage en packages ou plusieurs applications ne sera envisagé que
lorsqu'un second consommateur réel nécessitera du code partagé. Il ne sera pas
créé par anticipation.
