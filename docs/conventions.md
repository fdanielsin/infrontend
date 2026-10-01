# Conventions frontend

## Runtime et commandes

Le projet utilise Bun. Les commandes documentées et exécutées doivent utiliser
Bun :

```bash
bun install
bun run dev
bun run check
bun run lint
bun run test
bun run build
bun x playwright test
```

Les anciennes commandes d'un autre runtime ne doivent pas être ajoutées aux
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
  `inbackend/docs/specs/api/openapi.yaml`) ; ne pas les recopier à la main.
  Les mocks de tests sont typés par ces mêmes types.
- Un échec attendu (par exemple `TASK_NOT_FOUND`) se traite par le code
  d'erreur stable du contrat, jamais par le message ni par le seul statut, et
  se déclare « géré » (`isHandled` de `run`) pour ne produire ni erreur ni
  toast d'erreur.
- Les réponses `204 No Content` sont traitées explicitement.
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

- `tests/unit/api/` pour les tests du client et des façades API ;
- `tests/unit/stores/` pour les tests des stores ;
- `tests/unit/components/` pour les tests de composants ;
- `tests/e2e/` pour les scénarios Playwright contre l'application et l'API
  `inbackend`.

Les dossiers `__tests__` et les fichiers de test ne doivent pas être placés
dans `src/`.
Les noms de scénarios doivent décrire le comportement attendu et préciser le
`happy path` ou le `sad path` lorsque cette distinction est utile.
Chaque scénario suit les étapes `GIVEN`, `WHEN` et `THEN`.

Une porte n'est utile que si elle est exécutée. Toute commande de validation
doit échouer lorsque le contrôle correspondant échoue ; les `|| true` ne
doivent pas masquer les erreurs des contrôles obligatoires.

La porte cible sera centralisée dans un script Bun de vérification qui regroupe
formatage, lint, typage, tests et build.

## Documentation et invariants

Un commentaire affirmant une propriété durable doit être garanti par un type
ou par un test. Sinon, le commentaire doit expliquer une raison, une limite ou
un piège sans présenter cette information comme une garantie.

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
