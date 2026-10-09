# Conventions frontend

## Runtime et commandes

Le projet utilise Bun. Les commandes documentées et exécutées doivent utiliser
Bun (liste dans le [README](../README.md)). Les anciennes commandes d'un autre runtime ne doivent pas être ajoutées aux
nouvelles instructions ni utilisées comme référence de validation.

## Svelte

- Utiliser les runes Svelte 5 pour le nouveau code.
- Préférer `onclick` aux événements legacy `on:click`.
- Préférer `$derived` aux effets utilisés uniquement pour calculer une valeur.
- Éviter les effets qui modifient de l'état sans nécessité externe.
- Utiliser des blocs `each` indexés par une clé stable et unique.
- Les contrôles interactifs doivent avoir un nom accessible.
- Les erreurs dynamiques doivent être annoncées de manière accessible.

## API

- Les appels HTTP vivent dans `lib/api` ou dans le module API de leur
  fonctionnalité.
- Un client réutilisable reçoit sa configuration ; il ne connaît pas une route
  SvelteKit concrète.
- Les types de requête et de réponse viennent de `schema.d.ts` (généré depuis
  le contrat servi par le backend) ; ne pas les recopier à la main.
  Les mocks de tests sont typés par ces mêmes types.
- Un échec attendu (par exemple `TASK_NOT_FOUND`) se traite par le code
  d'erreur stable du contrat, jamais par le message ni par le seul statut, et
  se déclare « géré » (`isHandled` de `run`) pour ne produire ni erreur ni
  toast d'erreur.
- Les réponses `204 No Content` sont traitées explicitement.
- Toute réponse de succès est validée par le schéma zod généré de son opération
  (`client.ts`) : une réponse qui ne le respecte pas devient un échec
  `invalid_response`, jamais une donnée à moitié exacte. Les corps d'erreur ne
  sont pas validés (le contrat peut ajouter des codes). Les champs inconnus
  dans `data` sont conservés mais jamais lus : ne pas itérer sur les clés d'une
  réponse.
- Un appel qui ne reçoit aucune réponse en 10 s (`API_TIMEOUT_MS`) échoue avec
  `kind: 'timeout'` et le message traduit `error_timeout`, sans relance
  automatique. Le message ne suggère pas de renvoyer : une écriture a pu aboutir
  côté serveur (le contrat n'a pas de clé d'idempotence).
- `ready()` interroge `GET /ready` (sonde de disponibilité) ; `timeoutMs` borne un appel
  seul (5 s par défaut, `READY_TIMEOUT_MS`), les autres appels gardent le délai du
  client. Une réponse de la sonde est un **incident** si elle n'arrive pas (réseau,
  timeout) ou si son statut est de 500 à 599 ; un 4xx ou une réponse mal formée n'en
  est pas un (les écrans chargent comme avant). Cette classification et le calcul
  du délai de reprise vivent dans `state/availability-policy.ts` (TypeScript pur,
  muté par Stryker) ; `AvailabilityState` (`.svelte.ts`, hors mutation) ne fait que
  l'orchestration.
- Un échec de statut 500 à 599 porte `requestId` (en-tête `X-Request-Id`, que le
  serveur expose en CORS) seulement s'il respecte le contrat
  (`^[A-Za-z0-9._-]{1,64}$`) ; le client n'envoie pas d'identifiant. Le toast
  d'erreur l'affiche, sélectionnable, avec un bouton « Copier » ; sans identifiant
  conforme, ni référence ni bouton.
- Les erreurs ne sont pas transformées silencieusement en succès ou en liste
  vide.
- Les tests API couvrent les succès, les erreurs et les réponses sans contenu.

## Fonctionnalités

Une fonctionnalité regroupe son orchestration, ses composants spécifiques, ses
types, son état et ses tests. Elle ne doit pas importer une route (le lint le refuse, voir
[architecture](./architecture.md#contrôle-par-le-lint)).

Les composants génériques vont dans `lib/ui` et ne connaissent ni une fonctionnalité ni une
route ; ce que le lint refuse, et l'écart accepté pour les composants qui lisent l'état
applicatif, sont dans [architecture](./architecture.md#contrôle-par-le-lint).

Une classe d'état (`lib/state/`) expose un état cohérent et les actions qui le
modifient. Elle ne doit pas devenir un second client HTTP ni contenir des
données appartenant à plusieurs fonctionnalités sans justification. Pas de
singleton de module : les composants obtiennent l'état par `getAppState()`, les
tests créent un `new AppState()` par cas. Un test qui utilise `$effect` vit
dans un fichier `*.svelte.test.ts`.

## État partagé

1. L'état reste local au composant (`$state`, `$derived`) tant qu'un seul
   composant l'utilise.
2. Un état partagé est une classe `.svelte.ts` par responsabilité : champs
   `$state`, modifications par méthodes, dépendances reçues au constructeur
   (une classe n'importe jamais l'instance d'une autre, tout au plus son type
   pour typer le paramètre : `UserState` reçoit un `TaskState`).
3. Il est fourni par `createContext` (`getAppState` / `setAppState`), jamais en
   singleton de module : un singleton serait partagé entre les requêtes du
   serveur (fuite de données d'un utilisateur à l'autre) et entre les tests.
4. Quand une fonctionnalité grossit, son état et son contexte vont dans
   `src/lib/features/<fonctionnalité>/` ; `AppState` ne garde alors que le
   transversal (notifications, langue). Aujourd'hui tout vit dans
   `src/lib/state/` : le déplacement n'est pas fait, il est à faire quand une
   fonctionnalité le justifie.
5. Une seule source de vérité : ce qui se calcule est un `$derived`, jamais un
   second `$state` synchronisé à la main ; `$state.raw` pour les données
   remplacées en entier (listes reçues de l'API), pas d'objet profond réactif
   inutile.
6. Les rôles et permissions côté client ne servent qu'à l'affichage (masquer un
   bouton) ; c'est le backend qui autorise.

## Validation

La validation côté frontend est une validation UX. Elle ne remplace pas la
validation backend et ne doit pas recopier une règle métier complexe.

Une exception, voulue par le contrat : le format de l'e-mail (`CreateUserRequest.email`,
« à appliquer à l'identique côté client ») est une copie exacte de la règle du serveur, dans
`lib/validation/email.ts` (`isValidEmail`, branchée dans `UserSchema`). Une adresse que le
serveur refuse ne passe pas le formulaire, et une adresse qu'il accepte n'est jamais refusée
localement. Quand le contrat change cette règle, la fonction et la table de cas
`tests/shared/email-cases.ts` changent ensemble : la table passe par `UserSchema`
(`tests/unit/i18n/validation-parity.test.ts`) et par un vrai backend
(`tests/e2e/backend/email-rule.test.ts`). Le champ e-mail est un champ texte (`TextField`
`type="email"` rend `type="text"` avec `inputmode="email"`, `autocomplete="off"`,
`spellcheck="false"` et `autocapitalize="off"`) : un `<input type="email">` réécrit la saisie,
par exemple un domaine international devient du punycode dans `value` sous Chromium. Pas de
remplissage automatique : l'adresse saisie est celle d'une autre personne, et le critère WCAG
1.3.5 ne vise que les données de l'utilisateur lui-même. Écarts connus, non traités :
le formulaire retire les espaces de bord avec `trim()` de JavaScript, qui ne retire pas U+0085
(le serveur le retire) et retire U+FEFF (le serveur le garde), deux caractères qu'un clavier ne
produit pas ; les classes Unicode `\p{L}`, `\p{M}` et `\p{Nd}` suivent la version d'Unicode du
navigateur, alors que les tables du serveur s'arrêtent avant Unicode 15.1 : un caractère très
récent peut passer le formulaire et être refusé par le serveur (400, toast générique).

Les erreurs de validation doivent :

- être associées au champ concerné ;
- être visibles ;
- préserver la saisie de l'utilisateur en cas d'échec ;
- être couvertes par un test lorsque le comportement est important.

## Tests et portes

Tous les tests frontend vivent sous `tests/` à la racine du projet :

`tests/unit/` pour les tests unitaires et de composants, `tests/e2e/` pour les
scénarios Playwright, `tests/shared/` pour les données de test communes aux deux,
`tests/hooks/` pour le hook Git versionné
(`.githooks/pre-push`, voir le [README](../README.md)) ; l'organisation
détaillée et les règles d'écriture sont dans
[`tests/README.md`](../tests/README.md).

Les dossiers `__tests__` et les fichiers de test ne doivent pas être placés
dans `src/`.
Les noms de scénarios doivent décrire le comportement attendu et préciser le
`happy path` ou le `sad path` lorsque cette distinction est utile.
Chaque scénario suit les étapes `GIVEN`, `WHEN` et `THEN`.

Une porte n'est utile que si elle est exécutée. Toute commande de validation
doit échouer lorsque le contrôle correspondant échoue ; les `|| true` ne
doivent pas masquer les erreurs des contrôles obligatoires.

La porte est `bun run verify` (voir le [README](../README.md)) ; la CI lance la
même commande.

Les E2E à API mockée tournent sur Chromium, Firefox et WebKit : une jambe de
matrice par navigateur dans le job `e2e` de la CI (`fail-fast: false`). Trois
différences de navigateur sont attendues et gérées dans les tests, jamais par un
`test.skip` :

- Safari sur macOS ne s'arrête pas sur les liens, boutons et cases à cocher
  avec Tab tant que « Navigation au clavier » n'est pas activée dans les réglages
  système ; Option+Tab les atteint tous
  (<https://support.apple.com/en-mk/guide/safari/cpsh003>,
  <https://www.a11yproject.com/posts/macos-browser-keyboard-navigation/>).
  Le WebKit de Playwright suit l'hôte : Option+Tab sur macOS, Tab sur Linux
  (mesuré en CI : 75 tests verts). `nextFocusKey` (`tests/e2e/support/keyboard.ts`)
  choisit la touche ; tout test qui parcourt la page au clavier l'utilise.
- Firefox headless n'a pas de barre d'outils : après le dernier contrôle, Tab
  laisse le focus dessus au lieu de revenir au début. Le test de parcours des
  toasts n'accepte cette répétition que dans Firefox, et seulement sur le dernier
  contrôle de l'ordre du DOM calculé par le test ; dans Chromium et WebKit, toute
  répétition est un piège. Partout, un `keydown` Tab annulé (`preventDefault`) est
  un piège et fait échouer le test. Un piège qui laisse passer Tab puis rend le
  focus un instant après (`focusout` puis `setTimeout(() => focus())`) est vu par
  un Tab de plus sur le dernier contrôle, suivi de 500 ms d'horloge Playwright :
  Chromium et WebKit remettent alors le focus à la fenêtre (rien n'est focalisé
  dans la page, `document.hasFocus()` faux), et un élément focalisé ensuite est un
  piège. Limite, mesurée : Firefox headless ne déclenche aucun événement (ni
  `focusout` ni `blur`) quand Tab quitte le dernier contrôle, donc un piège qui
  réagit à la sortie du focus n'y est jamais exécuté et n'y est pas détectable ;
  ce cas n'est vérifié que dans les deux autres navigateurs.
- Firefox headless fait défiler la page tout seul, de façon asynchrone, juste
  après un `focusin` correct, vers le dernier champ texte quitté 1 à 3 Tab plus
  tôt (aucun appel de script, aucun toast, `page.clock` inutile : diagnostic
  instrumenté de qa sur 140 exécutions, environ 6 % d'échecs du cas à 6 toasts
  en 320x360 px, déjà sur `develop`). Ce défilement arrive après le Tab suivant
  de Playwright (environ 5 ms plus tard) et fausse la mesure de visibilité ;
  avec 50 ms d'attente après chaque Tab : 0 échec sur 19. Le test attend donc,
  sous Firefox seulement, que `scrollY` soit lu 5 fois de suite à l'identique
  (`waitForStableScroll`, lecture répétée plutôt que `requestAnimationFrame`
  que `page.clock` simule) avant de mesurer. Un contrôle réellement caché le
  reste une fois le défilement stable : l'attente ne masque rien.
- Firefox rend une zone défilante (ici la pile de toasts, au-delà de 40 % de la
  fenêtre) arrêt de Tab à elle seule ; WebKit non
  (<http://adrianroselli.com/2022/06/keyboard-only-scrolling-areas.html>). Le
  test accepte cet arrêt pour l'élément pile lui-même, et pour aucun autre.

### Contrat d'API

Les types de `src/lib/api/schema.d.ts` sont générés depuis le contrat du backend
(servi par le backend sur `GET /openapi.yaml`) et committés : `bun run api:generate`
les régénère, `bun run api:check` échoue s'ils ne sont plus à jour. Le contrat est lu par HTTP, par défaut
sur `http://localhost:8080/openapi.yaml` (backend lancé avec
`API_DOCS_ENABLED=true`) ; ailleurs, fournir `OPENAPI_URL`. Le frontend ne lit
aucun fichier du backend. La CI ne contacte pas le backend : `api:check` se lance en local avant
chaque merge, contre un backend qui tourne ; une URL de backend déployé le
remplacera en CI plus tard.

Les schémas zod des réponses (`src/lib/api/zod/zod.gen.ts`) sont générés par
`@hey-api/openapi-ts` (version exacte : l'outil est pré-1.0) depuis le même
contrat ; `api:generate` produit les deux fichiers et `api:check` compare les
deux. La configuration est `openapi-ts.config.ts`. Le générateur est piloté sans
correctif : un contrat qui le met en défaut (par exemple un entier `int64`, qu'il
traduit en `bigint`, ou un objet de réponse sans `properties`, dont il perd les
champs requis) se corrige dans le contrat, pas ici.

### Tests de mutation

`bun run mutate` lance Stryker sur les modules TypeScript de `src/lib` ; rapport
dans `reports/mutation/`. Le seuil `break` de `stryker.config.json` (85) fait
échouer la commande en dessous. Pour un fichier :
`bunx stryker run --mutate src/lib/api/client.ts --concurrency 2`.

Hors mutation, volontairement :

- les `*.svelte.ts` (les stores en runes) : l'instrumenteur enveloppe le
  corps des constructeurs dans un `if`, et Svelte refuse alors
  `this.x = $state(...)` (`state_invalid_placement`,
  <https://svelte.dev/e/state_invalid_placement>). Le lancement plante à
  l'« initial test run » avec `Error: [object Object]`, le runner vitest
  masquant l'erreur. **Un nouveau `*.svelte.ts` n'est pas muté** ; seule la
  couverture v8 le surveille (la logique pure va dans un `.ts` : `sort-tasks.ts`, `availability-policy.ts`) ;
- `src/lib/api/zod/**` : code généré par openapi-ts.

Ne pas lier les `node_modules` d'un autre worktree : le cache vite partagé
casse le test initial (« m.users_name_label is not a function »).

Pour voir l'erreur réelle d'un plantage, relancer vitest dans le sandbox
conservé `.stryker-tmp/sandbox-*` avec un script appelant `createVitest` de
`vitest/node` puis `ctx.start()`.

CI : `.github/workflows/mutation.yml`, hors de l'agrégat « All checks
passed ». Il tourne sur les PR qui touchent `src/**`, `tests/unit/**`,
`tests/hooks/**`, `messages/**`, `project.inlang/**`, `svelte.config.js`,
`vitest.config.ts`, `stryker.config.json`, `package.json`, `bun.lock` ou le
workflow lui-même, sur push vers `develop` et à la demande ; 30 minutes au plus, rapport HTML en artefact (7 jours). Score
mesuré le 2026-10-04 (concurrency 2, environ 3 min) : 91,85 % sur deux lancements consécutifs.

## Documentation et invariants

Un commentaire affirmant une propriété durable doit être garanti par un type
ou par un test. Sinon, le commentaire doit expliquer une raison, une limite ou
un piège sans présenter cette information comme une garantie.

## Design system et accessibilité

Jetons, composants de `src/lib/ui/`, règles de focus, de contraste, de notifications
et d'accessibilité (WCAG 2.2 AA) : [design-system.md](./design-system.md).

## Internationalisation

- Toute chaîne visible passe par un message Paraglide (`m.<cle>()`, fichiers
  `messages/{en,fr,de,es}.json`) : textes, noms accessibles, titres de page,
  notifications. Les messages de validation zod sont des clés (`validation_*`) ;
  `validationMessage(clé)` les traduit au rendu, donc une erreur de champ déjà
  affichée passe dans la nouvelle langue à la bascule. Les données saisies (titres, noms) ne sont jamais traduites.
- Les quatre fichiers ont les mêmes clés et les mêmes paramètres ; l'anglais
  est la langue source. `src/lib/paraglide/` est généré et ignoré par Git :
  `bun run i18n:compile` (déjà dans `verify`).
- Langue : cookie `PARAGLIDE_LOCALE` (écrit seulement quand l'utilisateur choisit
  dans le sélecteur ; préférence strictement fonctionnelle, pas de bandeau),
  sinon langue du navigateur (`Accept-Language`), sinon anglais. Pas de préfixe
  d'URL. Le serveur pose `lang` dans le HTML (`hooks.server.ts`) : pas
  d'éclair de mauvaise langue. Dans le navigateur, `LocaleState.current`
  (`$state`) est lu par chaque message : changer de langue met l'écran à jour
  sans rechargement ni perte de saisie ; l'attribut `lang` du document suit.
- Limite connue : la détection de langue de Paraglide ne traite pas `q=0` comme
  « non acceptable » (RFC 9110, 12.4.2) : un en-tête `fr;q=0` donne le français.
  Sans effet pratique, aucun navigateur ne l'envoie.
- La détection initiale dans le navigateur lit sans jamais écrire (cookie, puis
  `navigator.languages`, puis anglais), dans le même ordre que le serveur : même
  langue au rendu serveur et à l'hydratation. Le cookie n'est écrit que par
  `LocaleState.set` (choix explicite), et ce refus éventuel est sans conséquence.
- Cookies bloqués : la langue change pour la page en cours, sans erreur ; au
  rechargement on revient à la langue du navigateur.
- Erreurs de l'API : `failureMessage` (`lib/i18n/errors.ts`) traduit le
  `error_code` connu ; la table est exhaustive sur `ErrorCode` (un code ajouté
  au contrat sans traduction casse le typage). Un code inconnu garde le message
  du serveur. `VALIDATION_FAILED` s'affiche en message générique traduit : la
  validation zod du client donne déjà les messages précis et traduits avant
  l'envoi, le cas serveur n'existe que si le client est contourné. Un échec réseau (TypeError du navigateur) garde le message du
  navigateur, non traduit. À la bascule de langue, les erreurs affichées sont
  vidées ; les toasts expirent seuls.
- Le client envoie `Accept-Language` avec la langue active ; le backend le
  déclarera dans le contrat (lot api-i18n).
- Nombres : `formatNumber` (`Intl.NumberFormat` de la langue active), valeurs
  CLDR telles quelles.
- Sélecteur de langue : voir [design-system.md](./design-system.md#languageswitcher).

## Références

- [Svelte, bonnes pratiques](https://svelte.dev/docs/svelte/best-practices) :
  règle du projet (runes, `$derived` plutôt que `$effect`, `onclick`,
  snippets, props typées, blocs `each` à clé, attributs `class` en tableau,
  `{@attach}` plutôt qu'une action ou `getElementById`).
  Écart connu :
  - **Volontaire** : le chargement initial se fait dans `onMount` (accueil et
    stats) et non dans une fonction `load` SvelteKit ; la page de bonnes
    pratiques ne le demande pas et `load` changerait l'architecture (rendu
    serveur des données).
