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
  sont pas validés (le contrat peut ajouter des codes). Il n'y a pas de méthode
  `ready` : aucun écran ne l'utilise (son schéma généré existe). Les champs inconnus
  dans `data` sont conservés mais jamais lus : ne pas itérer sur les clés d'une
  réponse.
- Un appel qui ne reçoit aucune réponse en 10 s (`API_TIMEOUT_MS`) échoue avec
  `kind: 'timeout'` et le message traduit `error_timeout`, sans relance
  automatique. Le message ne suggère pas de renvoyer : une écriture a pu aboutir
  côté serveur (le contrat n'a pas de clé d'idempotence).
- Les erreurs ne sont pas transformées silencieusement en succès ou en liste
  vide.
- Les tests API couvrent les succès, les erreurs et les réponses sans contenu.

## Fonctionnalités

Une fonctionnalité regroupe son orchestration, ses composants spécifiques, ses
types, son état et ses tests. Elle ne doit pas importer une route.

Les composants génériques vont dans `lib/ui` et ne doivent pas connaître les
l'état partagé ni les endpoints d'une fonctionnalité.

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

Les erreurs de validation doivent :

- être associées au champ concerné ;
- être visibles ;
- préserver la saisie de l'utilisateur en cas d'échec ;
- être couvertes par un test lorsque le comportement est important.

## Tests et portes

Tous les tests frontend vivent sous `tests/` à la racine du projet :

`tests/unit/` pour les tests unitaires et de composants, `tests/e2e/` pour les
scénarios Playwright, `tests/hooks/` pour le hook Git versionné
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

`bun run mutate` lance Stryker sur les modules TypeScript de `src/lib`
(`.svelte.ts` compris, hors composants `.svelte`), à la demande et sans bloquer
la CI ; rapport dans `reports/mutation/`. Pour un fichier :
`bunx stryker run --mutate src/lib/state/request-status.svelte.ts --concurrency 1`
(avec plusieurs processus, une course sur le cache de vite fait échouer le lancement).

## Documentation et invariants

Un commentaire affirmant une propriété durable doit être garanti par un type
ou par un test. Sinon, le commentaire doit expliquer une raison, une limite ou
un piège sans présenter cette information comme une garantie.

## Design system

- Les jetons vivent dans le bloc `@theme` de `src/routes/layout.css` : couleurs
  sémantiques (`surface`, `line`, `field-border`, `muted`, `primary`, `danger`, `focus`…), rayons
  (`control`, `card`) et ombres (`card`, `card-raised`). Un jeton nomme une valeur
  déjà utilisée (une teinte de palette Tailwind) ; ses ratios de contraste validés
  sont en commentaire. On ajoute un jeton quand une valeur est utilisée deux fois
  ou plus, jamais par anticipation.
- Les composants de `src/lib/ui/` (`Button`, `IconButton`, `Card`, `TextField`,
  `Select`, `Alert`, `ToastItem`) portent leur accessibilité : nom accessible
  obligatoire (`label` de `IconButton`, `label` de `TextField` et `Select`), cible
  de 24 px, `aria-invalid` et `aria-describedby` de `TextField`. Les libellés
  arrivent déjà traduits en props : un composant n'a de texte propre que son
  libellé d'accessibilité (`ToastItem`).
- Les classes Tailwind d'un composant sont des chaînes complètes (pas de
  concaténation), sinon Tailwind ne les trouve pas. Les `{@attach}` et attributs
  posés sur un composant passent par `...rest` jusqu'à l'élément.
- Un test qui vérifie des noms de classes (ex. la sélection d'un utilisateur)
  fige ces classes : ne pas les remplacer par un jeton sans le dire à qa.
- Focus et erreurs passent par les jetons : un seul contour de focus global
  (`--color-focus`, règle `:focus-visible` de `layout.css`, `--color-focus-inverse`
  sur les fonds colorés) et une seule couleur d'erreur (`--color-danger`). Pas de
  `focus:ring-*`, de `outline-none` ni de rouge en dur dans un composant ; un
  champ invalide a aussi une bordure `danger`. La bordure d'un champ (`TextField`,
  `Select`) est `field-border` (3:1 minimum, WCAG 1.4.11) ; `line` reste pour les
  cadres de cartes et séparateurs. Les toasts sont en bas ; la hauteur mesurée de
  la pile (`--toast-stack-height`, publiée par `Notification`) est réservée par
  `scroll-padding-bottom` et `padding-bottom` : un contrôle focalisé ne reste jamais dessous.
  Un gestionnaire `focusin` de `Notification` termine le travail : Chromium ne remonte pas un
  contrôle déjà partiellement visible, donc il le défile (instantanément) au-dessus de la pile.

## Accessibilité (WCAG 2.2 AA)

- Un contrôle a un nom accessible stable : label visible, jamais un
  `aria-label` qui change avec l'état (case à cocher = titre de la tâche).
- Un bouton d'icône a un `aria-label` et une icône `aria-hidden` ; toute cible
  fait au moins 24 px (`min-h-6 min-w-6`).
- Les erreurs de champ sont reliées par `aria-describedby` et `aria-invalid` ;
  après un échec de validation, le focus va au premier champ invalide.
- Après une action qui retire l'élément focalisé (suppression, fermeture d'une
  édition, tâche disparue du serveur à la coche, à l'édition ou à la
  suppression), le focus va à un endroit logique (titre de la liste ou bouton
  d'origine), jamais au `body`. Échap annule une édition. Fermer un toast
  qui avait le focus (mesuré avant la suppression) le déplace vers le bouton de fermeture du toast voisin (suivant, sinon
  précédent), sinon vers l'élément qui l'avait avant l'entrée dans les toasts,
  sinon vers `main` (`tabindex="-1"`) ; un toast fermé à la souris sans
  focus (Safari) laisse le focus où il est.
- Les notifications vivent dans deux régions persistantes : `role="status"`
  (info, succès, avertissement) et `role="alert"` (erreur). Un toast se met en
  pause au survol et au focus et peut être fermé. Les bannières d'erreur en
  ligne n'ont pas de rôle : une seule annonce, par le toast.
- Contraste texte 4,5:1 minimum : teintes 700 sur fond coloré. Le texte posé
  sur le dégradé de la page n'est pas mesurable par axe (« incomplet ») ; il a
  été calculé à la main (> 6:1).
- Les émojis décoratifs sont `aria-hidden` ; le contenu en français de la page
  stats porte `lang="fr"`.
- Animations désactivées avec `prefers-reduced-motion`.
- Limite connue : le bouton d'envoi est `disabled` pendant une requête, ce qui
  fait perdre le focus à qui valide au bouton ; non corrigé volontairement (les
  tests s'appuient sur `disabled`, gain faible).

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
- Sélecteur : `<select>` natif avec label visible traduit ; chaque option porte
  sa langue en `lang` et son nom dans sa propre langue. Il est en haut de chaque
  page (dans le flux, rien ne le chevauche à 320 px de large ni à 200 % de zoom) ; le
  focus reste sur lui à la bascule.

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
