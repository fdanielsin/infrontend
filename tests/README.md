# Frontend tests

Tous les tests du frontend vivent sous `tests/`.

- `tests/unit/` contient les tests unitaires et les tests de composants,
  organisés par domaine :
  - `tests/unit/api/` pour le client et les façades API ;
  - `tests/unit/stores/` pour l'état de l'application (`src/lib/state/`) ;
  - `tests/unit/components/` pour les composants lorsque nécessaire ;
  - `tests/unit/i18n/` pour les langues : parité des fichiers `messages/*.json`,
    traduction des `ErrorCode` du contrat, nombres, langue d'une requête et
    hook serveur, règles de validation du serveur couvertes par le client ;
  - `tests/unit/support/` pour les aides partagées (hôte de contexte).
- `tests/hooks/` contient le test du hook Git `.githooks/pre-push` : des
  dépôts Git jetables `tests/hooks/.tmp/case-*` (dossier ignoré, chaque `case-*`
  supprimé après son test ; `tests/hooks/.tmp` reste, vide et ignoré), des
  `git push` réels vers un dépôt bare, sans variable `GIT_*` héritée.
- `tests/e2e/` contient les scénarios Playwright de bout en bout contre
  l'application et l'API `inbackend` (jamais ses fichiers).

Les E2E de `tests/e2e/backend/` nécessitent un backend `inbackend` disponible sur
`http://localhost:8080`. La CI ne les lance pas
(`bun run test:e2e:mocked`) et ils se vérifient en local avant chaque merge, comme
`bun run api:check`. Une URL de backend déployé les remplacera en CI plus tard.

Les E2E d'accessibilité (`accessibility.test.ts`, axe avec les règles par
défaut), de clavier (`keyboard-focus.test.ts`), de langues (`i18n.test.ts`), de
focus et d'erreurs (`focus-and-errors.test.ts`), de bordures de champs
(`field-borders.test.ts`) et de stabilité de page (`page-stability.test.ts`)
mockent l'API avec `page.route` (`e2e/support/mock-api.ts`) et tournent sans
backend ; `focus-and-errors.test.ts` et `field-borders.test.ts` mesurent le
style calculé avec `e2e/support/contrast.ts` :
`PUBLIC_API_URL=http://localhost:8080 bun x playwright test accessibility keyboard-focus i18n focus-and-errors field-borders page-stability --project=chromium`.
Ces E2E tournent contre un build de production (`vite build` puis `vite preview`,
port 4173, jamais réutilisé : un serveur déjà présent sur ce port fait échouer
le lancement), pas contre `vite dev` : le client de développement recharge la page
quand sa websocket HMR est perdue (par exemple quand la machine se fige), ce qui
efface l'état d'un test en cours (`page-stability.test.ts` le vérifie). Le
`webServer` de `playwright.config.ts` construit donc l'application avant les
tests (`PUBLIC_API_URL` doit être défini, la valeur n'a pas d'effet avec l'API
mockée).

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
`api/timeout.test.ts` le double par un équivalent sur le `setTimeout` simulé.

Chaque test construit son propre `new AppState()` (ou `NotificationState`,
`RequestStatus`) : aucun état de module n'est partagé, il n'y a rien à remettre
à zéro entre deux tests. Le test prépare et inspecte l'état directement
(`app.tasks.tasks = [...]`, `app.users.status.error`).

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
