# Frontend tests

Tous les tests du frontend vivent sous `tests/`.

- `tests/unit/` contient les tests unitaires et les tests de composants,
  organisés par domaine :
  - `tests/unit/api/` pour le client API et les contrats de ses réponses ;
  - `tests/unit/stores/` pour l'état de l'application (`src/lib/state/`) ;
  - `tests/unit/components/` pour les composants lorsque nécessaire ;
  - `tests/unit/i18n/` pour les langues : parité des fichiers `messages/*.json`,
    traduction des `ErrorCode` du contrat, nombres, langue d'une requête et
    hook serveur, règles de validation du serveur couvertes par le client ;
  - `tests/unit/support/` pour les aides partagées (hôte de contexte, `fetch` simulé :
    `support/fetch.ts`, lecture de `messages/<langue>.json` : `support/messages.ts`).
- `tests/shared/` contient les données de test communes aux tests unitaires et aux E2E :
  la table des adresses e-mail du contrat (`email-cases.ts`), passée par `UserSchema` en
  unitaire et envoyée à un vrai serveur par `tests/e2e/backend/email-rule.test.ts`.
- `tests/hooks/` contient le test du hook Git `.githooks/pre-push` : des
  dépôts Git jetables `tests/hooks/.tmp/case-*` (dossier ignoré, chaque `case-*`
  supprimé après son test ; `tests/hooks/.tmp` reste, vide et ignoré), des
  `git push` réels vers un dépôt bare, sans variable `GIT_*` héritée.
- `tests/e2e/` contient les scénarios Playwright de bout en bout contre
  l'application et l'API `inbackend` (jamais ses fichiers).

Les E2E de `tests/e2e/backend/` nécessitent un backend `inbackend` de test, dont l'URL est donnée par
`PUBLIC_API_URL` (obligatoire, sans défaut ; `:8080`, `:5173` et `:8081` sont interdits), lancés par
`PUBLIC_API_URL=http://localhost:<port du backend> E2E_PORT=<port du worktree> bun run test:e2e:backend`. La CI ne les lance pas
(`bun run test:e2e:mocked`) et ils se vérifient en local avant chaque merge, comme
`OPENAPI_URL=http://localhost:8081/openapi.yaml bun run api:check`. Une URL de backend déployé les remplacera en CI plus tard.

Les E2E ne tournent que sur Chromium (en local comme en CI) ; `E2E_ALL_BROWSERS=1` remet Firefox et WebKit (`--project=firefox`, `--project=webkit`).

Le script des E2E réels lance Playwright deux fois : d'abord tous les tests sauf ceux étiquetés `@alone`,
puis ceux-là seuls, avec `--workers=1` (sortie dans `test-results/e2e-alone`). Un test porte cette étiquette
quand sa mesure dépend de la charge du banc : la suppression envoyée à la fermeture réelle de la page
(`backend/user-delete.test.ts`) arrive 10 fois sur 10 sur Firefox quand rien d'autre ne tourne, 10 sur 12 avec
4 workers. Avec `-g`, `--grep` ou `--grep-invert` sur la ligne de commande, il n'y a qu'une seule passe.

Les E2E d'accessibilité (`accessibility.test.ts`, axe avec les règles par
défaut), de clavier (`keyboard-focus.test.ts`), de langues (`i18n.test.ts`), de
focus et d'erreurs (`focus-and-errors.test.ts`), de bordures de champs
(`field-borders.test.ts`), d'icônes (`icons.test.ts`) et de stabilité de page
(`page-stability.test.ts`) mockent l'API avec `page.route` (`e2e/support/mock-api.ts`)
et tournent sans backend ; `focus-and-errors.test.ts`, `field-borders.test.ts` et
`icons.test.ts` mesurent le style calculé avec `e2e/support/contrast.ts` :
`E2E_PORT=<port> bun run test:e2e:mocked -- accessibility keyboard-focus i18n focus-and-errors field-borders icons page-stability --project=chromium`.
Aides communes des E2E (`tests/e2e/support/`) : `mock-api.ts` (API simulée), `contrast.ts`
(contrastes calculés), `keyboard.ts` (touche de tabulation par moteur), `announcement.ts` (région
d'annonce), `axe.ts` (`expectNoAxeViolations`), `layout.ts` (`horizontalOverflow`) et `locale.ts`
(`text` lit un message dans `messages/<langue>.json`, `switchLanguage` change la langue dans la
page). Un texte lu dans `messages/` prouve le câblage du message, jamais sa traduction : un texte
que seul un E2E garde est écrit en toutes lettres dans le test.

Ces E2E tournent contre un build de production (`vite build` puis `vite preview`,
le port `E2E_PORT`, obligatoire avec `test:e2e:mocked` et `test:e2e:backend` (un port par
worktree, par exemple `E2E_PORT=4104 bun run test:e2e:mocked -- i18n --project=chromium`), jamais réutilisé : un serveur
déjà présent sur ce port fait échouer le lancement), pas contre `vite dev` : le client de développement recharge la page
quand sa websocket HMR est perdue (par exemple quand la machine se fige), ce qui
efface l'état d'un test en cours (`page-stability.test.ts` le vérifie). Le
`webServer` de `playwright.config.ts` construit donc l'application avant les
tests (`PUBLIC_API_URL` doit être défini ; avec l'API mockée la valeur n'a pas d'effet, sauf
son port : Firefox et WebKit refusent un « bad port » du
[Fetch Standard](https://fetch.spec.whatwg.org/#port-blocking) (9, par exemple) avant que
`page.route` l'intercepte, et le bandeau « service indisponible » s'affiche partout ;
`http://localhost:59999` est injoignable exprès sans être interdit).

Machine saturée. Ne l'accuser que si deux signes se cumulent : un swap plein
(`sysctl vm.swapusage`) et des échecs simultanés sur tous les workers (lancement
de navigateur de plus de 180 s, test figé, action qui répond avec 10 s de
retard). Sinon c'est un défaut à analyser. Dans le premier cas, fermer des
applications et lancer avec `--workers=1` (0 échec sur 300 en `CI=1`) ; ne pas
augmenter les timeouts ni relancer jusqu'à ce que ça passe.

Les minuteries des toasts y sont pilotées par `page.clock`. Attendre la
première réponse de l'API avant de remplir un champ : une saisie faite avant
l'hydratation est effacée.

Langues. Les tests unitaires tournent en anglais (navigateur jsdom en-US).
Un test qui change de langue passe par `app.locale.set(...)` ou
`app.changeLocale(...)` d'un `new AppState()`, ou par `overwriteGetLocale`
pour une fonction isolée, et remet l'anglais et efface le cookie
`PARAGLIDE_LOCALE` dans son `afterEach`. Les textes attendus dans une autre
langue sont lus dans `messages/<langue>.json`, jamais recopiés. En E2E, la
langue se choisit par le cookie `PARAGLIDE_LOCALE` (`context.addCookies`) ou
par la langue du navigateur (`test.use({ locale: 'fr-FR' })`). Le `<select>`
natif change au clavier par saisie de lettre (« f » pour « FR - Français ») :
les flèches ouvrent la liste sur certains systèmes.

Vitest exécute les tests dans un ordre aléatoire (`sequence.shuffle`, graine affichée
en tête de run) : un test ne doit dépendre ni d'un autre ni de l'ordre.

Chaque fichier de test utilise le suffixe `.test.ts`. Un test qui utilise une
rune (`$effect`, `$effect.root`, `$state`) dans son propre code prend le
suffixe `.svelte.test.ts`, pour être compilé par Svelte.

Les scénarios suivent une structure explicite :

```ts
// GIVEN: Préconditions et données de test.
// WHEN: Action testée.
// THEN: Résultat attendu.
```

Les noms décrivent le comportement attendu et finissent par sa catégorie
(voir `docs/specs/test-matrix.md` à la racine du workspace) : `happy path`,
`sad path` (erreur), `limit`, `boundary` ou `exception`. Un test qui fige une
règle de validation actuelle, dont le comportement peut encore être décidé
autrement, commence par `current rule:`.

Les tests ne dépendent d'aucun backend réel : les tests d'état et de
composants mockent `$lib/api/client` avec `vi.mock` ; les tests du client, et
ceux qui vérifient ce que l'état fait d'une panne de transport
(`stores/stores-real-client.test.ts`), remplacent seulement `fetch`.

Le client valide chaque réponse contre le contrat : une réponse simulée doit
être complète et conforme, sinon elle devient un échec `invalid_response`.
Pour tester le délai, instancier `new ApiClient({ timeoutMs })` avec un fetch
qui ne répond jamais et rejette sur `request.signal`. `AbortSignal.timeout`
tourne sur un minuteur natif que les faux minuteurs de Vitest ne pilotent pas :
`timeoutOnFakeTimers` (`support/fetch.ts`) le double par un équivalent sur le `setTimeout` simulé.

Chaque test construit son propre `new AppState()` (ou `NotificationState`,
`RequestStatus`) : aucun état de module n'est partagé, il n'y a rien à remettre
à zéro entre deux tests. Le test prépare et inspecte l'état directement
(`app.tasks.tasks = [...]`, `app.users.loadState`).

Les fichiers de production ne doivent pas contenir de fichiers `*.test.*`,
`*.spec.*` ou de dossiers `__tests__/`.

## Tests de composants

Les tests sous `tests/unit/components/` rendent un composant Svelte avec
`@testing-library/svelte` (`render`, `fireEvent`, `waitFor`, `cleanup`) sous
l'environnement `jsdom` de Vitest. Cela exige
`resolve: { conditions: ['browser'] }` dans `vitest.config.ts` (déjà présent) :
sans cette option, Vite résout le build serveur de Svelte même sous Vitest, et
`mount()` échoue avec `lifecycle_function_unavailable`. Voir
[la documentation Svelte sur les tests](https://svelte.dev/docs/svelte/testing#Component-testing).

Chaque test de composant nettoie le DOM rendu (`cleanup()` dans un
`afterEach`).

Trois fichiers de `tests/unit/components/` sortent du moule jsdom pour les icônes :
`Icon.server.test.ts` et `icon-bundle.test.ts` portent `// @vitest-environment node`
(Vitest compile alors les composants pour le serveur : `render` de `svelte/server`
produit le HTML du serveur) ; `icon-bundle.test.ts` lance un vrai `vite build` en
mémoire (environ 10 s) pour prouver que seules les icônes importées sont embarquées ;
`Icon.hydration.test.ts` hydrate, sous jsdom, le HTML figé dans
`tests/unit/support/icon-server-markup.ts` (que le test serveur épingle), sans
avertissement de désaccord.

## Captures reproductibles

`CAPTURE_PORT=<port du worktree> bun run captures` construit l'application contre l'API simulée
(`tests/e2e/support/mock-api.ts`, `PUBLIC_API_URL` forcé à l'adresse injoignable), la sert avec
`vite preview` sur `CAPTURE_PORT` (jamais `:8080`, `:5173`, `:5174` ni `:8081`) et prend, pour chaque
écran (accueil, statistiques) et chaque état utile (repos, vide, chargement, erreur, panne, sélection,
édition, suppression en attente, formulaires refusés, textes longs), une capture à 320, 768 et 1280 px
dans les 4 langues, en `reducedMotion`. Sortie : `test-results/captures/<écran>/<état>/<largeur>-<langue>.png`,
avec `index.md` et `index.json` (fichier, taille, ce que la capture montre) et `requests.log`. Aucune
capture n'est commitée (`test-results/` est ignoré).

- Filtres : `--screen=`, `--state=`, `--width=`, `--locale=` (listes séparées par des virgules),
  `--out=test-results/<dossier>` (vidé au départ, seul un dossier de `test-results/` est accepté),
  `--skip-build` pour réutiliser le dernier `build/` (qui doit avoir été construit contre l'API simulée,
  donc par ce script).
- Gardes : une requête vers `:8080`, `:8081`, `:5173` ou `:5174` est coupée, comptée même si l'API
  simulée la reçoit, et fait échouer la commande ; un fichier vide, trop petit ou qui n'est pas un PNG
  aussi. Un état qui n'arrive pas à l'écran fait échouer la commande (jamais une capture d'un autre état).
- Un état se décrit dans `scripts/lib/capture-catalog.ts` (nom, texte de l'index) et se pilote dans
  `scripts/lib/capture-drivers.ts` ; `tests/unit/scripts/capture-*.test.ts` vérifient le plan, les
  gardes et qu'aucun état n'est sans pilote.
- Le build et le navigateur en font une suite lourde : à lancer sous le verrou
  (skill `indrive-heavy-suite-lock`).
