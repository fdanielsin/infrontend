# Design system

Ce document décrit l'interface telle qu'elle est dans le code : jetons, composants
de `src/lib/ui/`, motifs d'écran, règles de contenu. Il sert à un développeur qui
ajoute un écran et à un relecteur qui vérifie qu'il reste cohérent. Une règle n'y
figure que si le code ou un test la porte, et cite sa **preuve**. Ce qui n'existe
pas encore est marqué **Cible**. Les règles d'architecture (où vit le code, qui
parle à l'API) restent dans [architecture.md](./architecture.md) et
[conventions.md](./conventions.md).

1. [Principes](#1-principes)
2. [Fondations](#2-fondations)
3. [Composants](#3-composants)
4. [Motifs](#4-motifs)
5. [Contenu](#5-contenu)
6. [Gouvernance et checklist de revue](#6-gouvernance-et-checklist-de-revue)

## 1. Principes

1. **Accessibilité d'abord.** Niveau visé : WCAG 2.2 AA
   ([Recommandation W3C du 5 octobre 2023, mise à jour du 12 décembre 2024](https://www.w3.org/TR/WCAG22/)). Un
   composant porte son nom accessible, son focus et sa cible : l'écran qui
   l'utilise n'a rien à ajouter.
2. **Cohérence par les jetons.** Un seul contour de focus, une seule couleur
   d'erreur, une seule bordure de champ.
3. **Retour clair.** Toute action reçoit une réponse visible et annoncée (message
   relié au champ, toast, bandeau). Quand une action retire l'élément focalisé,
   le focus va à un endroit logique, jamais au `body` (WCAG 2.4.3), y compris quand la tâche a disparu du serveur à la coche, à l'édition ou à la suppression (titre de la liste).
4. **Pas d'état par la couleur seule.** Un état se lit aussi dans le texte
   (« Création… », barré, `aria-invalid` avec message).

## 2. Fondations

### Couleurs sémantiques

Les jetons vivent dans le bloc `@theme` de `src/routes/layout.css`. Chacun nomme
une teinte de palette Tailwind déjà rendue ; ses ratios validés sont en
commentaire du jeton. Ratios mesurés (WCAG 1.4.3 texte 4,5:1, 1.4.11 non-texte 3:1) :

| Jeton                              | Teinte               | Usage                                     | Contraste (source : commentaires de `layout.css`)                                                                           |
| ---------------------------------- | -------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `surface`, `surface-muted`         | blanc, gray-100      | carte, ligne de liste                     |                                                                                                                             |
| `label`, `muted`, `subtle`         | gray-700, 600, 500   | libellé, texte secondaire, état vide      | muted 7,56:1 ; subtle 4,84:1 sur blanc                                                                                      |
| `field-border`                     | gray-500             | bordure des champs                        | 4,84 blanc, 4,39 gray-100, 3,93 au pire sur le dégradé (extrémité indigo-100 ; 4,44 sur blue-50 ; 3:1 requis)               |
| `line`                             | gray-300             | cadre de carte, séparateur                | décoratif, pas pour un champ                                                                                                |
| `disabled`                         | gray-400             | fond d'un bouton désactivé                |                                                                                                                             |
| `primary` / `-hover`               | blue-600 / 700       | action principale                         | texte blanc 4,5:1 ou plus                                                                                                   |
| `action-strong` / `-hover`         | blue-700 / 900       | petite action, lien, toast d'info         | aussi texte sur gris : 4,5:1 ou plus                                                                                        |
| `success`, `warning`               | green-700, amber-700 | action de succès, toast de succès, alerte | texte blanc 4,5:1 ou plus                                                                                                   |
| `danger` / `-hover`, `danger-soft` | red-700 / 900, 100   | l'unique couleur d'erreur, fond d'erreur  | 5,21:1 ou plus sur blanc, gray-100, red-100, dégradé                                                                        |
| `focus`, `focus-inverse`           | blue-700, blanc      | contour de focus                          | 6,83 blanc, 5,55 indigo-100 ; inverse 4,95 ou plus sur les toasts (succès 4,95, avertissement 5,03, erreur 6,42, info 6,83) |

Preuves : `tests/e2e/focus-and-errors.test.ts` (même contour de focus à 4,5:1, même
rouge pour toutes les erreurs, dans les quatre langues), `tests/e2e/field-borders.test.ts`
(bordures à 3:1 à 1280 et 320 px), mesures par `tests/e2e/support/contrast.ts`.
Le texte posé sur le dégradé de la page n'est pas mesurable par axe (« incomplet ») :
il a été calculé à la main (plus de 6:1).

### Typographie, espacements, rayons, ombres

Police : celle de Tailwind par défaut (aucun `font-family` défini). Pas d'échelle
propre au projet ; usages constatés :

| Rôle                   | Classes                                              |
| ---------------------- | ---------------------------------------------------- |
| Titre de page (`h1`)   | `text-4xl font-bold`, `wrap-break-word hyphens-auto` |
| Titre de carte (`h2`)  | `text-xl font-bold`                                  |
| Titre de liste (`h3`)  | `font-semibold`                                      |
| Libellé de champ       | `text-sm font-medium text-label`                     |
| Texte secondaire, aide | `text-sm text-muted`                                 |
| État vide              | `text-subtle`                                        |

Espacements : `p-6` (carte, `p-8` en `lg`), `space-y-4` entre champs, `space-y-2`
entre lignes de liste, `gap-2` ou `gap-3` entre contrôles. Page : `main` en `p-8`,
largeur max 6xl (accueil) ou 2xl (statistiques), fond en dégradé
`from-blue-50 to-indigo-100`. Rayons : `control` (0,25 rem) pour boutons, champs,
lignes ; `card` (`rounded-lg`) pour cartes et toasts. Ombres : `card`,
`card-raised`, `card-raised-hover` (carte « raised » au survol).

### Focus

Un seul contour : règle `:focus-visible` de `layout.css`, `outline: 2px solid
var(--color-focus)` avec `outline-offset: 2px` (un contour, pas une ombre : il
reste visible en mode contraste forcé). `--color-focus-inverse` sur les fonds
colorés (toasts). Interdits : `focus:ring-*`, `outline-none` dans un composant, rouge
en dur. Seule exception : `main`, cible programmatique (`tabindex="-1"`,
`focus:outline-none`) qui reçoit le focus après une action, jamais au clavier.
Un champ invalide a aussi une bordure `danger`.

La pile de toasts est fixée en bas ; sa hauteur mesurée (`--toast-stack-height`,
publiée par `Notification`) est réservée par `scroll-padding-bottom` et
`padding-bottom`, et un gestionnaire `focusin` fait défiler un contrôle partiellement
masqué au-dessus de la pile (WCAG 2.4.11). Preuve :
`tests/e2e/focus-and-errors.test.ts` (« Tab never leaves a control under N toasts »),
`tests/unit/components/Notification.test.ts`.

### Mouvement

Seule animation par keyframes : l'entrée des toasts (`slideIn`, 0,3 s), déclarée sous
`@media (prefers-reduced-motion: no-preference)` dans `ToastItem.svelte`. Toute
nouvelle animation suit la même règle (les transitions de survol existantes y échappent : voir les écarts). Preuve : `tests/e2e/availability.test.ts`
(émulation `reducedMotion: 'reduce'`).

### 320 px

Aucun défilement horizontal à 320 px ni à 200 % de zoom (WCAG 1.4.10). Les titres
longs se coupent (`wrap-break-word`, `wrap-anywhere` dans les lignes de tâche),
le sélecteur de langue est dans le flux, au-dessus du titre. Preuve :
`tests/e2e/i18n.test.ts` (« Reflow », 320, 640, 1280 px, quatre langues),
`tests/e2e/task-sorting.test.ts` (titre de 200 caractères).

### Écarts constatés

À corriger dans un lot séparé (changements visibles, non faits ici) :

- Des écrans écrivent des teintes brutes au lieu de jetons : lien « Statistiques »
  de l'accueil (`bg-indigo-600`, `rounded-lg`) face au lien de retour de la page
  statistiques (`bg-primary`, `rounded-card`) ; `text-gray-900`, `text-gray-800`,
  `text-blue-600`, `text-indigo-600` sur les titres et chiffres ; `Select` utilise
  `text-gray-800`.
- Trois transitions de survol ne sont pas conditionnées par `prefers-reduced-motion` : `Card` `raised` (`Card.svelte`, ligne 23), le lien « Statistiques » (`routes/+page.svelte`, ligne 36) et le lien de retour (`routes/stats/+page.svelte`, ligne 94).
- Les variantes `strong`, `outline` et `link` de `Button` n'ont pas de style
  `disabled`.
- Le bouton d'envoi est `disabled` pendant la requête, ce qui fait perdre le focus à
  qui valide au bouton. Non corrigé volontairement (les tests s'appuient sur
  `disabled`, gain faible).

## 3. Composants

Tous dans `src/lib/ui/`, sauf indication. Les libellés arrivent traduits en props : un composant n'a de texte propre que son libellé d'accessibilité (`ToastItem`).
États : « n/a » quand le composant n'en a pas. Preuves communes : axe dans
`tests/e2e/accessibility.test.ts`, focus dans `tests/e2e/keyboard-focus.test.ts`.

### Button

Action à texte visible. Variantes : `primary` (pleine largeur, `bg-primary`),
`success` (pleine largeur, ajout), `strong` (petite, action de confirmation),
`outline` (petite, secondaire), `link` (action en ligne, ex. « Modifier »).
États : survol (`primary`, `success`, `link`), focus global, désactivé
(`bg-disabled` sur `primary` et `success`), chargement (le texte change, ex.
« Création… », et le bouton est `disabled`). Cible minimale `min-h-6` pour les
petites variantes. À faire : un verbe court, décrit par le texte ; un
`aria-label` plus précis seulement s'il ajoute le sujet (« Modifier {titre} »,
`messages/*.json` `tasks_edit_named`). À éviter : un bouton sans texte (utiliser
`IconButton`), un `aria-label` qui contredit le texte visible.

### IconButton

Action sans texte (aujourd'hui : fermer un toast, supprimer une tâche), avec un
`label` obligatoire qui devient l'`aria-label`. Tons : `danger` (rouge, survol
`danger-hover`) et `inverse` (sur fond coloré, contour de focus blanc). Cible
`min-h-6 min-w-6`. Le dessin est une croix en SVG inline `aria-hidden`, taille
`h-4 w-4`, trait 2. À faire : un nom qui nomme l'objet (« Supprimer {titre} »,
« Fermer la notification »). **Cible** : remplacer la croix inline par une icône du
jeu d'icônes à venir (voir [Cible](#cible)).

### Card

Conteneur. Variantes : `outlined` (cadre `line`, ombre `card`), `raised` (ombre
relevée, plus forte au survol, pour les chiffres des statistiques), `flat` (ombre
relevée sans survol). Marge intérieure `md` (`p-6`) ou `lg` (`p-8`). Rôle
purement visuel : le titre de la carte est un `h2` posé par l'écran.

### TextField

Champ texte, e-mail ou zone de texte (`multiline`). Anatomie : libellé visible
(`labelHidden` le réserve aux technologies d'assistance, pour les lignes d'édition),
contrôle, message d'erreur. États : défaut, focus global, invalide (la présence de
`error` donne `aria-invalid`, la bordure `danger` et `aria-describedby` vers
`<id>-error`), `required`. Variante `compact` pour une ligne de liste. Après un
échec de validation, le focus va au premier champ invalide (`UserForm`,
`TaskForm`). À éviter : un placeholder à la place du libellé, un message d'erreur
non relié.

### Select

`<select>` natif étiqueté (libellé visible), utilisé pour la langue et l'ordre
de tri. Chaque option peut porter son `lang` (WCAG 3.1.2) ; le focus reste sur lui
après un changement. Natif : navigation clavier et lecteurs d'écran sans code.

### Alert

Bandeau d'erreur en ligne (`bg-danger-soft text-danger`), **sans rôle ARIA** : l'erreur
est annoncée une seule fois, par son toast (voir [Motifs](#4-motifs)).

### Notification et ToastItem

`Notification` est la pile fixée en bas, avec deux régions vives persistantes :
`role="status"` (info, succès, avertissement) et `role="alert"` (erreur), qui
restent rendues, vides, pour que l'annonce suivante soit lue. La pile n'est une
région nommée (`notifications_region`) que tant qu'elle contient un toast.
`ToastItem` : fond par type (`success`, `error`, `info`, `warning`), texte blanc,
`ReferenceLine` éventuelle, bouton de fermeture. Un toast se met en pause au survol
et au focus (WCAG 2.2.1) et garde le temps restant ; durée 3 s, 6 s pour une erreur.
Fermeture d'un toast qui avait le focus : le focus va au bouton du toast voisin
(suivant, sinon précédent), sinon à l'élément d'avant l'entrée dans les toasts,
sinon à `main` ; fermé à la souris sans focus (Safari), le focus ne bouge pas. Un
bouton de fermeture atteint par Tab est ramené entièrement dans la pile
(`scrollIntoView({ block: 'nearest' })`). Preuves : `tests/unit/components/Notification.test.ts`,
`tests/e2e/keyboard-focus.test.ts`.

### ReferenceLine

Ligne « Référence : … » avec bouton « Copier » : la référence serveur
(`X-Request-Id`) est sélectionnable en entier (`select-all`) et se coupe n'importe
où. Tons `inverse` (toast) et `danger` (bandeau). Nom accessible
« Copier la référence {référence} ». Preuve :
`tests/unit/components/NotificationReference.test.ts`.

### LanguageSwitcher

`Select` des quatre langues, option « EN - English » dans sa propre langue
(`lang` sur chaque option), en haut de chaque page. Annonce « Langue changée… »
en toast d'info. Preuve : `tests/e2e/i18n.test.ts`.

### AvailabilityBanner et ApiVersion

Dans `src/lib/features/availability/`. Le bandeau (`danger-soft`) apparaît en
tête de page quand le service est indisponible : le texte est un `role="alert"`
inséré à l'incident, le bouton « Réessayer » est hors de l'alerte (les essais
automatiques ne la relisent pas) et rend le focus à `main` au rétablissement. La
référence éventuelle est hors de l'alerte. `ApiVersion` affiche « API x.y.z » en
pied de page ; sa ligne est réservée (`min-h-12`) pour que l'arrivée de la version
ne déplace rien, et un échec n'affiche rien. Preuve : `tests/e2e/availability.test.ts`,
`tests/unit/components/ApiVersion.test.ts` (pied de page de hauteur constante).

## 4. Motifs

### Formulaires et validation

Validation côté client avec zod avant l'envoi : texte rogné, limites du serveur
(nom 100, e-mail 254, titre 200, description 2000 caractères, comptés comme le
serveur), message traduit sous le champ, focus au premier champ invalide. Le serveur
reste l'autorité : une erreur de champ renvoyée par l'API s'affiche en bandeau et
toast. Preuve : `tests/unit/validation/validation.test.ts`,
`tests/unit/components/UserForm.test.ts`, `tests/e2e/accessibility.test.ts`
(« forms showing validation errors »).

### Toast, bandeau ou message en ligne

| Besoin                                                                                              | Moyen                            | Pourquoi                                                            |
| --------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| Erreur d'un champ                                                                                   | message sous le champ            | relié par `aria-describedby`                                        |
| Erreur d'une requête (formulaire, liste)                                                            | `Alert` en ligne + toast `error` | l'alerte en ligne n'a pas de rôle : une seule annonce, par le toast |
| Confirmation ou information passagère (langue, tri, déplacement, service rétabli, référence copiée) | toast `status`                   | annonce polie, disparaît seule                                      |
| Service indisponible, durable                                                                       | bandeau `AvailabilityBanner`     | reste tant que l'incident dure, avec « Réessayer »                  |

Un succès de création n'a pas de toast : le formulaire se vide et la liste change.

### États vides et chargement

États vides en `text-subtle` (« Aucun utilisateur », « Aucune tâche »). Chargement :
l'état discriminé `RequestStatus` ; le texte du bouton change pendant l'envoi, la
page statistiques affiche « Chargement… ». Aucune requête de liste n'est lancée
tant que le service est indisponible (`runWhenAvailable`), pour éviter une cascade
d'erreurs.

### Erreur avec référence

Une réponse 5xx porte `X-Request-Id` : le toast d'erreur et le bandeau affichent
la `ReferenceLine`, avec « Copier » ; si le presse-papiers est refusé, un toast
d'avertissement le dit et la référence reste sélectionnable.

### Action destructive

Supprimer une tâche est immédiat, sans confirmation (`IconButton` rouge, nom
« Supprimer {titre} »). L'élément focalisé disparaît : le focus va au titre de la
liste (`tabindex="-1"`). Une tâche déjà supprimée sur le serveur est retirée avec
l'info « Tâche déjà supprimée ». Preuve : `tests/unit/components/TaskForm.a11y.test.ts`,
`tests/unit/stores/task-not-found.test.ts`. **Cible** : décider si une annulation ou une
confirmation est voulue (non tranché).

### Édition en ligne

Le bouton « Modifier » ouvre un formulaire dans la ligne : le focus va au champ
titre, Échap annule sans appeler l'API, enregistrer ou annuler rend le focus au
bouton « Modifier ». La case à cocher garde pour nom accessible le titre exact de la
tâche, quel que soit son état. Preuve : `tests/unit/components/TaskForm.a11y.test.ts`.

### Tri de la liste

`Select` « Trier par » (à partir de 2 tâches), trois ordres. Le choix est annoncé
une fois par changement (« Tâches triées par… », toast `status`), jamais au chargement.
Quand une modification déplace une ligne, le focus reste sur le même contrôle et
« titre : position N sur M » est annoncé. Règles de tri et stockage : voir
[architecture.md](./architecture.md#tri-des-tâches). Preuve :
`tests/e2e/task-sorting.test.ts`, `tests/unit/components/TaskSorting.test.ts`.

## 5. Contenu

- **Source et parité.** L'anglais est la langue source ; `fr`, `de` et `es` ont
  les mêmes clés et paramètres. Preuve : `tests/unit/i18n/messages.test.ts`.
- **Toute chaîne visible est un message** (`m.<clé>()`) : textes, noms accessibles,
  titres de page, notifications. Les données saisies (titres, noms) ne sont jamais
  traduites. Les émojis décoratifs (📋, 📊) sont `aria-hidden`.
- **Ton.** Court et direct : verbe à l'infinitif ou à l'impératif sur les
  boutons (« Add Task », « Retry »), états en `…` (« Creating… »), erreurs qui
  disent ce qui s'est passé sans jargon (« Failed to create task »). Le serveur
  garde son propre message pour un code inconnu.
- **Typographie.** Le caractère `…`, jamais trois points ; en français, une
  espace insécable avant `: ; ? !`. Preuve : `tests/unit/i18n/typography.test.ts`.
- **Libellés longs.** L'allemand et le français sont les plus longs : tout libellé
  doit tenir à 320 px (retour à la ligne, `min-w-0`, `break-all` pour une référence).
  Preuve : `tests/e2e/i18n.test.ts` (« Reflow »).
- **Langue.** Cookie `PARAGLIDE_LOCALE` écrit seulement au choix explicite, sinon
  langue du navigateur, sinon anglais ; `lang` posé par le serveur. Détails :
  [conventions.md](./conventions.md#internationalisation).

## 6. Gouvernance et checklist de revue

**Ajouter un jeton.** Seulement quand la valeur sert deux fois ou plus, jamais par
anticipation. Il nomme une valeur déjà rendue (adopter un jeton ne change aucun
pixel), ses ratios mesurés vont en commentaire, et le tableau de la section 2
est mis à jour dans le même changement.

**Ajouter un composant.** Quand les mêmes classes et le même comportement
apparaissent à deux endroits. Il exige un nom accessible en prop si le texte peut
manquer, reçoit ses textes traduits, écrit ses classes Tailwind en chaînes complètes
(sinon Tailwind ne les trouve pas), transmet `...rest` à son élément (pour
`{@attach}` et les attributs), et rejoint la section 3. Un test qui vérifie des noms
de classes les fige : ne pas les remplacer par un jeton sans prévenir qa.

**Checklist de revue** d'un changement d'interface :

- [ ] Contraste du texte 4,5:1, des bordures de champ et des icônes porteuses de
      sens 3:1, mesuré (`tests/e2e/support/contrast.ts`), pas estimé.
- [ ] Cible d'au moins 24 px (`min-h-6 min-w-6`, WCAG 2.5.8).
- [ ] Contour de focus global ; ni `outline-none`, ni `focus:ring-*`, ni rouge en dur.
- [ ] Nom accessible stable ; pas d'`aria-label` qui change avec l'état.
- [ ] Erreurs de champ reliées (`aria-describedby`, `aria-invalid`).
- [ ] Fonctionne à 320 px et à 200 % de zoom.
- [ ] Textes dans les quatre fichiers `messages/*.json`, libellés longs testés.
- [ ] Animation sous `prefers-reduced-motion: no-preference` seulement.
- [ ] Axe sans violation sur l'écran touché ; tests existants ni affaiblis ni
      modifiés pour passer.

## Cible

Non réalisé : un jeu d'icônes cohérent (échelle de tailles, un seul trait), icône
décorative à côté du texte des actions et des toasts, et la croix d'`IconButton`
issue de ce jeu ; l'unification des écarts listés en section 2. Le lot Iconoir
complète ce document.
