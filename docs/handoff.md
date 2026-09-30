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
(`src/lib/features/tasks/TaskForm.svelte`), et `toggleTask`
(`src/lib/features/tasks/store.ts`) retourne désormais `Promise<boolean>` pour
que l'appelant sache s'il doit annuler son changement optimiste. Le point 1 de
Q-01 (faire consommer `response.data` par `toggleTask`/`editTask`) reste
volontairement non fait : la réponse du `PUT` ne reflétait pas l'état
réellement persisté avant la correction backend (DTO à pointeurs +
`Select(...).Updates(...)`), et n'a pas encore été re-validée côté frontend
depuis ce correctif.

Lot "nettoyage frontend" (2026-09-30) terminé — règle F-03 et retire du code
mort, sans changement de comportement (`bun run verify` vert avant/après
chaque étape) :

- `src/lib/features/tasks/` créé : `store.ts` (userTasks, addTask, editTask,
  toggleTask, removeTask) et `TaskForm.svelte`, déplacés depuis
  `src/lib/stores/user.ts` (supprimé) et `src/lib/components/`.
- `src/lib/stores/request-status.ts` créé (à ce stade `loading`/`error`
  partagés ; remplacés ensuite par la fabrique `createRequestStatus`, voir
  lot « erreurs » ci-dessous). `features/users/store.ts::selectUser` appelle
  `loadUserTasks` de `features/tasks/store.ts` (dépendance users→tasks
  documentée en commentaire).
- `src/lib/components/Notification.svelte` déplacé vers `src/lib/ui/`
  (`lib/components/` n'avait plus d'autre habitant).
- Code mort retiré : `fetchUserTasks` (jamais appelée dans l'app, seul un
  test l'appelait) et son test ; `src/lib/index.ts` (placeholder vide, aucun
  import de `$lib` nu dans le projet).
- Config morte retirée : `.husky/pre-commit`, `.lintstagedrc.json`, les
  dépendances `husky`/`lint-staged` — inertes (`git config core.hooksPath`
  pointait vers `.githooks/`, qui n'existe pas ; `.husky/_/husky.sh` était
  absent ; `package.json`'s `prepare` ne lançait jamais husky ; la CI ne les
  utilise pas). `core.hooksPath` a été désinscrit (`git config --unset`,
  configuration locale non suivie). **Il n'y a donc aucun hook Git local
  actif aujourd'hui : la CI est le seul filet.** Le bloc `test.projects` de
  `vite.config.ts` (jamais exécuté, masqué par `vitest.config.ts`) et les
  dépendances `@vitest/browser-playwright`/`vitest-browser-svelte` ont aussi
  été retirés.

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

La CI frontend lance `bun run verify` (formatage, lint avec
`--max-warnings 0`, typage, tests avec seuils de couverture dans
`vitest.config.ts` : lignes 85 %, branches 75 %, build), puis construit
l'image Docker (`docker build --build-arg`, sans push), exécute les E2E et
audite les dépendances avec `bun audit --audit-level=moderate` (bloquant). Au
2026-10-01 : 1 vulnérabilité faible signalée (`cookie` < 0.7.0, via
`@sveltejs/kit`, GHSA-pxg6-pf52-xh8x), donc l'audit passe ; aucune en
production (`bun audit --prod`). Couverture mesurée le même jour : lignes
92,12 %, branches 86,87 % (périmètre `src/**/*.{ts,svelte}`).

Docker : `PUBLIC_API_URL` est un `ARG` obligatoire, figé dans l'image au build
(`$env/static/public`) ; le runtime n'embarque que `build/` sans fichiers `.map` (adapter-node
regroupe les dépendances) et tourne sous l'utilisateur `bun`.

## État de la structure

- `users` et `tasks` possèdent chacun leur composant et leur store dédiés
  dans `src/lib/features/`.
- Les stores transversaux (`request-status.ts`, `notification.ts`) restent
  dans `src/lib/stores/`. Les composants visuels génériques
  (`Notification.svelte`) sont dans `src/lib/ui/`.
- Le client HTTP partagé reste dans `src/lib/api/`.
- Les routes composent les écrans sans déplacer la logique backend.
- Le workflow frontend unique est
  `.github/workflows/ci.yml`. L'étape E2E qui checkout `inbackend` (dépôt
  privé) requiert le secret de dépôt `INBACKEND_READ_TOKEN` (PAT en lecture
  seule) ; sans lui, cette étape échoue avec `git fetch` exit 128.
- `tests/unit/components/` existe désormais (premier fichier :
  `TaskForm.test.ts`), en plus de `tests/unit/api/` et `tests/unit/stores/`.
  Le rendu de composants Svelte sous Vitest exige
  `resolve: { conditions: ['browser'] }` dans `vitest.config.ts` (sinon Vite
  résout le build serveur de Svelte même sous `jsdom`, et `mount()` échoue) ;
  cette option est maintenant présente et documentée dans le fichier lui-même.

## Écarts connus avec les règles cibles d'architecture.md

- `src/lib/api/client.ts` lit `PUBLIC_API_URL` via `$env/static/public`, alors
  qu'`architecture.md` L.49-51 vise une URL injectée plutôt que lue
  directement par un module réutilisable.
- `features/users/store.ts` dépend de `features/tasks/store.ts` (sélectionner
  un utilisateur charge ses tâches), raison documentée en commentaire dans le
  fichier.

## Contraintes

- Ne pas modifier le backend pendant la modularisation frontend.
- Ne pas introduire plusieurs applications ou packages sans consommateur réel.
- Utiliser Bun dans les commandes, la documentation et la CI frontend.
- Ne pas considérer un contrôle comme valide s'il est masqué par `|| true`.

## Lot « erreurs » (2026-10-01, branche `fix/frontend-errors`)

F-01, F-02, QM-01, QM-02, QM-03 corrigés. `client.ts` renvoie une union
`ApiResult` (succès avec `data` / échec avec `error`, `status`, `code`
optionnel), lit le corps `ErrorResponse` et signale un JSON mal formé.
`createRequestStatus().run` porte `loading`/`error` par domaine
(`usersStatus`, `tasksStatus`), remet `error` à null au début de chaque
action et publie un toast d'erreur de 6 s. Les bannières inline n'ont plus
`role="alert"` : le toast annonce. `selectUser` désélectionne l'utilisateur et vide `userTasks` dès le début
de la sélection (QM-04, QM-05) : les tâches d'un autre utilisateur ne
restent jamais affichées, et si `getUser` échoue aucun utilisateur n'est
sélectionné. Le chargement initial de la page stats (`loading` vrai au
premier rendu serveur) n'est pas observable sous jsdom : à couvrir par un E2E.

## Lot « contrat et outillage » (branche `chore/frontend-contract-tooling`)

- `src/lib/api/schema.d.ts` est généré avec openapi-typescript 7.13.0 à partir
  du contrat de la branche backend `feat/lot5-migrations` (worktree
  `inbackend/.worktrees/lot5-migrations`, base `d970bc5`, fichier modifié et non
  commité au moment de la génération ; SHA-256 de `openapi.yaml` :
  `572bc4f61ee8488b695fd86038a3c1324f3ea73897e3483b90710196b964a2d7`). Ce
  contrat contient `error_code`, le 409 `EMAIL_TAKEN`, le 404 `TASK_NOT_FOUND`
  sur DELETE et le 404 `USER_NOT_FOUND` sur POST /tasks. À régénérer
  (`OPENAPI_PATH=... bun run api:generate`) au merge du backend.
- `client.ts` passe par openapi-fetch (`parseAs: 'text'`, le corps est parsé
  par le client pour garder `status` sur un JSON mal formé) ; la façade
  `ApiClient` et `ApiResult` restent. Le client lit `error_code` et l'expose
  comme `code` ; aucun store n'en dépend encore.
- `createTask` accepte `CreateTaskRequest`. La description d'une tâche est
  optionnelle comme dans le contrat (décision du lead) : zod n'impose plus de
  longueur minimale ; une description vide est envoyée telle quelle (`""`), à la
  création comme à l'édition, où le contrat l'applique telle quelle.
- TypeScript : `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitReturns`, `noImplicitOverride`, `noFallthroughCasesInSwitch` ; `svelte-check
--fail-on-warnings`. ESLint : `recommendedTypeChecked` sur `src` et `tests`,
  `unbound-method` désactivé dans `tests/` (`vi.mocked(api.method)`),
  `prefer-const` remplacé par `svelte/prefer-const` dans les `.svelte` (props
  déclarées avec `let`).
- Le job CI `contract` reste rouge tant que le contrat du lot B n'est pas
  dans `inbackend/develop` (il compare à celui de develop, sans `error_code`) :
  attendu, à rappeler dans la description de la PR.
- `zodIssuesToFieldErrors` (`lib/validation/field-errors.ts`) remplace trois
  boucles identiques de TaskForm et UserForm.
- Stryker : `bun run mutate`, config `stryker.config.json`, non bloquant.

## Prochaine étape

Lots suivants : Docker/CI/doc, contrat généré (openapi-typescript et
openapi-fetch, `api:check`), puis B-04 côté interface (404 sur la
suppression d'une tâche absente, décision fonctionnelle en attente). La
modularisation de `stats` reste ouverte, uniquement si elle apporte une
séparation claire.
