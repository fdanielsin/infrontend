# Design system

Ce document décrit l'interface telle qu'elle est dans le code : jetons, composants
de `src/lib/ui/`, motifs d'écran, règles de contenu. Il sert à un développeur qui
ajoute un écran et à un relecteur qui vérifie qu'il reste cohérent. Quatre sortes
de contenu, toujours distinguées : une règle portée par le code ou un test cite sa
**preuve** ; une règle à suivre n'a pas de preuve ; ce que le code ne fait pas encore est
marqué **Cible** ; la section 8 liste des motifs pour des composants qui n'existent pas
encore. Les règles complémentaires viennent des fiches de
[designmotionhq.com](https://designmotionhq.com/patterns) et citent leur fiche. Les règles d'architecture (où vit le code, qui
parle à l'API) restent dans [architecture.md](./architecture.md) et
[conventions.md](./conventions.md).

1. [Principes](#1-principes)
2. [Fondations](#2-fondations)
3. [Composants](#3-composants)
4. [Motifs](#4-motifs)
5. [Contenu](#5-contenu)
6. [Gouvernance et checklist de revue](#6-gouvernance-et-checklist-de-revue)
7. [Cible](#7-cible)
8. [Motifs à venir](#8-motifs-à-venir)
9. [Compte rendu de l'intégration des fiches](#9-compte-rendu-de-lintégration-des-fiches)

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
5. **Un seul élément mis en avant par vue** (échelle, couleur, élévation) ; les voisins
   restent calmes ([von-restorff](https://designmotionhq.com/patterns/von-restorff)).
6. **Agir puis permettre d'annuler**, plutôt que demander confirmation ; la friction
   forte est réservée à l'irréversible ([undo-ux](https://designmotionhq.com/patterns/undo-ux)).
   Voir [Action destructive](#action-destructive).

## 2. Fondations

### Couleurs sémantiques

Les jetons vivent dans le bloc `@theme` de `src/routes/layout.css`. Chacun nomme
une teinte de palette Tailwind déjà rendue ; ses ratios validés sont en
commentaire du jeton. Ratios mesurés (WCAG 1.4.3 texte 4,5:1, 1.4.11 non-texte 3:1) :

| Jeton                                                      | Teinte                                  | Usage                                      | Contraste (source : commentaires de `layout.css`)                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `surface`, `surface-muted`                                 | blanc, gray-100                         | carte, ligne de liste                      |                                                                                                                                                                    |
| `heading`                                                  | gray-900                                | titres et chiffres                         | 17,9:1 sur blanc                                                                                                                                                   |
| `surface-hover`, `surface-selected`                        | gray-200, blue-100                      | ligne sous le pointeur, ligne sélectionnée | mesurés (`readable-lists.test.ts`) : nom 16,96 / 17,21, e-mail 6,10 / 6,19 (survol / sélectionnée) ; barre `primary` 4,30:1 et coche 6,19:1 sur `surface-selected` |
| `label`, `muted`, `subtle`                                 | gray-700, 600, 500                      | libellé, texte secondaire, état vide       | muted 7,56:1 ; subtle 4,84:1 sur blanc                                                                                                                             |
| `field-border`                                             | gray-500                                | bordure des champs                         | 4,84 blanc, 4,39 gray-100, 3,93 au pire sur le dégradé (extrémité indigo-100 ; 4,44 sur blue-50 ; 3:1 requis)                                                      |
| `page-from`, `page-to`                                     | blue-50, indigo-100                     | dégradé de fond de page, porté par `html`  | texte sur le dégradé : voir ci-dessous                                                                                                                             |
| `line`                                                     | gray-300                                | cadre de carte, séparateur                 | décoratif, pas pour un champ                                                                                                                                       |
| `disabled`                                                 | gray-400                                | fond d'un bouton désactivé                 |                                                                                                                                                                    |
| `primary` / `-hover`                                       | blue-600 / 700                          | action principale                          | texte blanc 4,5:1 ou plus                                                                                                                                          |
| `action-strong` / `-hover`                                 | blue-700 / 900                          | bouton secondaire, lien                    | aussi texte sur gris : 4,5:1 ou plus                                                                                                                               |
| `success`, `warning`                                       | green-700, amber-700                    | toast de succès, alerte                    | texte blanc 4,5:1 ou plus                                                                                                                                          |
| `danger` / `-hover`, `danger-soft`                         | red-700 / 900, 100                      | l'unique couleur d'erreur, fond d'erreur   | 5,21:1 ou plus sur blanc, gray-100, red-100, dégradé                                                                                                               |
| `info`                                                     | gray-800                                | fond du toast d'information                | blanc dessus 14,7:1 ; jamais la couleur d'une action                                                                                                               |
| `success-edge`, `danger-edge`, `warning-edge`, `info-edge` | green-900, red-950, amber-900, gray-950 | bord gauche de 4 px d'un toast             | 3:1 ou plus sur la page (`tests/e2e/icons.test.ts`)                                                                                                                |
| `focus`, `focus-inverse`                                   | blue-700, blanc                         | contour de focus                           | 6,83 blanc, 5,55 indigo-100 ; inverse 4,95 ou plus sur les toasts (succès 4,95, avertissement 5,03, erreur 6,42, info 6,83)                                        |

Preuves : `tests/e2e/focus-and-errors.test.ts` (même contour de focus à 4,5:1, même
rouge pour toutes les erreurs, dans les quatre langues), `tests/e2e/field-borders.test.ts`
(bordures à 3:1 à 1280 et 320 px), mesures par `tests/e2e/support/contrast.ts`.
Le texte posé sur le dégradé de la page n'est pas mesurable par axe (« incomplet ») :
il a été calculé à la main (plus de 6:1).

Règles complémentaires :

- **Nommer par rôle**, jamais par valeur (`primary`, pas `blue-600`). Trois couches :
  palette Tailwind, jeton sémantique (`@theme`), composant. Un composant n'écrit ni
  hex ni teinte brute, sauf les écarts listés plus bas ; changer un jeton se propage partout ([design-tokens](https://designmotionhq.com/patterns/design-tokens)). Une
  valeur hors échelle se ramène à l'échelle. Source unique : `layout.css`.
- **Le fond décide de la lisibilité** : le contraste se mesure sur le fond réel
  (gris `surface-muted`, dégradé), pas sur du blanc. Les gris « décoratifs » échouent
  souvent : une bordure ou un texte porteur de sens prend `field-border` ou `muted`
  ([color-accessibility](https://designmotionhq.com/patterns/color-accessibility)).
- **Jamais la couleur seule** : tout état a un second signal (icône, libellé, motif,
  flèche). Rouge et vert ne se distinguent pas seuls ([color-accessibility](https://designmotionhq.com/patterns/color-accessibility)).
- **Une seule couleur d'accent pour l'action principale** (`primary`). La hiérarchie
  vient du contraste entre rôles (titre fort, texte atténué ; bouton plein, bouton
  secondaire discret), de la taille, de la graisse et de l'espace, cumulés ; pas
  d'une couleur par élément ([visual-hierarchy](https://designmotionhq.com/patterns/visual-hierarchy)).
- **Mode sombre** : voir [Mode sombre et système visuel](#mode-sombre-et-système-visuel).

### Typographie, espacements, rayons, ombres

Police : celle de Tailwind par défaut (aucun `font-family` défini). Pas d'échelle
propre au projet ; usages constatés :

| Rôle                   | Classes                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| Titre de page (`h1`)   | `text-2xl sm:text-4xl font-bold`, `wrap-break-word hyphens-auto` |
| Titre de carte (`h2`)  | `text-xl font-bold`                                              |
| Titre de liste (`h3`)  | `font-semibold`                                                  |
| Libellé de champ       | `text-sm font-medium text-label`                                 |
| Texte secondaire, aide | `text-sm text-muted`                                             |
| État vide              | `text-subtle`                                                    |

Espacements : `p-4 sm:p-6` (carte, `p-6 sm:p-8` en `lg`), `space-y-4` entre champs, `space-y-2`
entre lignes de liste, `gap-2` ou `gap-3` entre contrôles. Page : `main` en `p-4 sm:p-8`,
largeur max 6xl (accueil) ou 2xl (statistiques), fond en dégradé
(`page-from` vers `page-to`) porté par `html`. Rayons : `control` (0,25 rem) pour boutons, champs,
lignes ; `card` (`rounded-lg`) pour cartes et toasts. Ombres : `card`,
`card-raised`, `card-raised-hover` (carte « raised » au survol).

Règles complémentaires :

- **Proximité** : l'écart à l'intérieur d'un groupe est plus petit que l'écart entre
  groupes. Dans le code : `space-y-4` entre champs liés, `space-y-2` entre lignes de
  liste, `space-y-6` entre blocs d'un même écran ; l'espace précède un séparateur, et
  l'on ne met pas de cadre là où l'espace suffit ([proximity-rule](https://designmotionhq.com/patterns/proximity-rule)).
- **Échelle** : espacements en multiples de 4 px (échelle de Tailwind), jamais
  « à l'œil ». Pas de suite de type nombre d'or (écart volontaire, [golden-ratio](https://designmotionhq.com/patterns/golden-ratio) : facteur 1,618 et partage 62/38 écartés).
- **Rayons** : jetons `control` et `card` seulement. Dans une surface arrondie qui
  contient un élément arrondi, rayon intérieur = rayon extérieur moins la marge
  intérieure. Le rayon croît avec la surface (champ, carte, panneau). Un rayon qui
  manque est une **Cible : jeton à créer**, jamais une valeur au hasard
  ([border-radius](https://designmotionhq.com/patterns/border-radius)).
- **Ombres** : seules les ombres nommées ci-dessus ; plus un élément est élevé, plus il
  est important, et une ombre n'est jamais décorative. **Cible** : trois niveaux
  (contact, intermédiaire, diffuse), un halo teinté de l'accent possible, une bordure
  éclaircie au survol, sans parallaxe excessive ; valeurs à définir (**Cible : jeton à
  créer**) ([shadow-elevation](https://designmotionhq.com/patterns/shadow-elevation), [depth-layers](https://designmotionhq.com/patterns/depth-layers)).
- **Icônes** : voir [Icônes](#icônes).
- **Zones tactiles** : une icône d'environ 20 px garde une zone de tap de 44 px sur
  écran tactile ([hover-trap](https://designmotionhq.com/patterns/hover-trap)) ; le minimum du projet reste 24 px (WCAG 2.5.8).

### Icônes

Un seul jeu, [Iconoir](https://iconoir.com) (contour, grille de 24 px, licence MIT), et un
seul composant, `Icon` (`src/lib/ui/Icon.svelte`). Le choix du jeu et de l'outil est dans
l'[ADR 0003](./decisions/0003-icones-iconoir-unplugin-icons.md). Règles de dessin tirées de
[icon-design-rules](https://designmotionhq.com/patterns/icon-design-rules) : un seul style, le
même trait sur tout le jeu, la même boîte englobante, des tailles prises dans l'échelle.

| `size` | Classe   | Usage                                                                    |
| ------ | -------- | ------------------------------------------------------------------------ |
| 16     | `size-4` | À côté d'un texte `text-sm` (boutons `sm`, `link`), croix d'`IconButton` |
| 20     | `size-5` | Défaut : texte courant, boutons `md`, icônes denses (listes, tuiles)     |
| 24     | `size-6` | Titres (`PageShell`), états vides                                        |

- **Trait** : 1,5 px d'écran à toutes les tailles. Iconoir dessine à 1,5 sur une grille de
  24, ce qui ferait 1 px à 16 px (trop mince, surtout en blanc sur un toast) ; `Icon` applique
  `vector-effect: non-scaling-stroke` aux tracés
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/vector-effect)), donc le trait garde sa
  largeur d'écran quand la taille change. Écart volontaire avec la fiche, qui prescrit 2 px :
  ce qui compte est le même trait pour tout le jeu. Preuve : `tests/e2e/icons.test.ts`
  (`stroke-width` et `vector-effect` calculés, trois navigateurs). Les icônes denses (langue,
  wifi coupé, tri, liste) restent lisibles à 16 px mais serrées : les mettre à 20 px
  (planches-contact du lot, 2026-10-08, non versionnées).
- **Couleur** : `currentColor`, héritée du texte du bouton ou du parent ; l'icône n'impose
  jamais de couleur (preuve : `tests/unit/components/Icon.test.ts`). Une icône qui porte seule
  un sens atteint 3:1 sur son fond (WCAG 1.4.11, `tests/e2e/icons.test.ts`) ; à côté d'un
  texte, c'est le texte qui porte le sens.
- **Décorative, toujours** : `aria-hidden="true"` et `focusable="false"`, sans `role`, sans
  `<title>`, et pas de prop `label` (le typage la refuse). Le sens passe par un texte visible
  ou par le nom accessible du contrôle qui l'entoure : une icône seule dans un bouton passe par
  `IconButton` et son `label`. Visible en mode contraste forcé (la couleur système remplace
  `currentColor`).
- **Usage** : `<Icon icon="xmark" size={16} />`, `size` vaut 20 par défaut. Le nom `icon` est
  une liste fermée (`IconName`) : une chaîne libre est une erreur de type.
- **Ajouter une icône** : chercher son nom sur iconoir.com, l'importer dans `icons.ts`
  (`import Nom from '~icons/iconoir/<nom>'`), l'ajouter à la liste `ICONS` dans l'ordre
  alphabétique, puis l'utiliser. Un nom inconnu fait échouer le build ; on n'importe jamais la
  collection entière (`icon-bundle.test.ts` échoue si elle entre dans le code livré). Ne mettre
  dans la liste que les icônes utilisées.
- **Où elles sont** : titre de page (`PageShell`, 24), actions (ajouter, modifier, réessayer,
  copier, retour, lien vers les statistiques : icône décorative + texte visible ; supprimer
  reste la croix d'`IconButton` ; Enregistrer et Annuler n'ont pas d'icône), libellé du tri,
  tuiles de statistiques et rangées de `UserList` (20), un type par toast (`check-circle`,
  `warning-circle`, `info-circle`, `warning-triangle`) et le bandeau d'indisponibilité. Un
  bouton d'action de toast prend l'icône donnée par `ToastAction.icon` (« Annuler » d'une
  suppression : `undo`).
- **Erreur de champ** : couleur, icône `warning-circle` (16) et message, jamais la couleur seule
  (WCAG 1.4.1) ; l'icône est cachée, le message reste lié au champ (`aria-describedby`).
  `Alert` met la même icône (20) devant son texte.
- **Champ facultatif** : le libellé le dit (« Description (facultatif) »), pas d'astérisque sur
  les champs obligatoires.
- **À faire** : une icône à côté d'un texte visible ; la même icône pour la même action dans
  toute l'interface ; une taille de l'échelle.
- **À éviter** : une icône seule sans `IconButton` ; une icône pour remplacer le texte d'une
  action ; l'émoji comme icône ; une couleur codée en dur ; un second jeu d'icônes ; une taille
  hors de l'échelle ; un état annoncé par la couleur de l'icône seule.

### Focus

Un seul contour : règle `:focus-visible` de `layout.css`, `outline: 2px solid
var(--color-focus)` avec `outline-offset: 2px` (un contour, pas une ombre : il
reste visible en mode contraste forcé). `--color-focus-inverse` sur les fonds
colorés (toasts). Interdits : `focus:ring-*`, `outline-none` dans un composant, rouge
en dur. Seule exception : `main`, cible programmatique (`tabindex="-1"`,
`focus:outline-none`) qui reçoit le focus après une action, jamais au clavier.
Un champ invalide a aussi une bordure `danger`.

Sélection et focus sont deux choses (`UserList`) : la sélection est un fond, une barre et une
coche, le focus est le contour ci-dessus, décalé de 2 px hors de la ligne. Après une sélection
explicite, quand les deux panneaux sont l'un sous l'autre (moins de 48 rem, même seuil que la
grille), le titre de la liste de tâches est amené dans la fenêtre et reçoit le focus (défilement
immédiat sous `prefers-reduced-motion`) : le focus quitte la liste volontairement, parce que son
résultat est plus bas ; côte à côte, rien ne bouge et le focus reste dans la liste
d'utilisateurs (`reveal-tasks.ts`).

Règles complémentaires ([focus-states](https://designmotionhq.com/patterns/focus-states)) : `:focus-visible` seulement ; l'ordre du DOM est
l'ordre visuel ; dans une modale, le focus est piégé, Échap ferme et rend le focus au
déclencheur. Un **lien d'évitement** (`SkipLink`, « Aller au contenu principal », traduit)
est le premier élément focalisable de chaque page, avant même le bandeau de panne : caché
(`sr-only`) tant qu'il n'a pas le focus, en haut à gauche et lisible (4,5:1 ou plus) au focus
(WCAG 2.4.1). Il mène à `#main-content` (le `<main>` de `PageShell`) et y met le focus par
script, car SvelteKit prend en charge les liens à ancre sans déplacer le focus. Preuves :
`tests/e2e/keyboard-focus.test.ts` (quatre langues, bandeau de panne, page des statistiques).

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

Règles complémentaires :

- Une entrée dure de 200 à 300 ms en `ease-out` ; une sortie est plus courte que
  l'entrée ; le linéaire ne sert qu'aux mouvements continus (spinner) ; un ressort est
  réservé aux moments qui le méritent, sans oscillation. Une cascade décale les éléments
  de quelques dizaines de ms. Courbes et durées réutilisées : **Cible : jeton à créer** ([animation-timing](https://designmotionhq.com/patterns/animation-timing),
  [easing-curves](https://designmotionhq.com/patterns/easing-curves)).
- **Temps de réponse** : retour visuel à l'action en moins de 100 ms ; aucun indicateur
  de chargement sous 300 ms, un indicateur au-delà ([doherty-threshold](https://designmotionhq.com/patterns/doherty-threshold),
  [loading-states-system](https://designmotionhq.com/patterns/loading-states-system)).
- **Survol d'une carte** : jamais de `scale` sur la carte entière. On anime le
  contenu (ombre, élévation) ; la grille ne bouge pas ([card-hover-anatomy](https://designmotionhq.com/patterns/card-hover-anatomy) ; pour une carte, les rayons et ombres de la section Composants).

### Cadre de page

`ui/PageShell.svelte` est le cadre des deux pages : `<main>` (tabindex -1), conteneur
`max-w-6xl`, sélecteur de langue en haut à droite, titre `h1` aligné à gauche
(`text-heading`), sous-titre, puis une rangée d'actions qui porte le lien vers l'autre page
(`ButtonLink`). Sur la page statistiques, les trois tuiles ont la largeur du
contenu (comme l'accueil) ; les cartes d'état (attente, échec, rien à compter) restent
étroites et centrées (`max-w-2xl`) pour la longueur de ligne. Preuve : `tests/unit/components/PageShell.test.ts`, `tests/e2e/single-accent.test.ts`.

### 320 px

Aucun défilement horizontal à 320 px ni à 200 % de zoom (WCAG 1.4.10). Les titres
longs se coupent (`wrap-break-word`, `wrap-anywhere` dans les lignes de tâche),
le sélecteur de langue est dans le flux, au-dessus du titre. Preuve :
`tests/e2e/i18n.test.ts` (« Reflow », 320, 640, 1280 px, quatre langues),
`tests/e2e/task-sorting.test.ts` (titre de 200 caractères),
`tests/e2e/layout-overflow.test.ts` (valeurs au maximum du contrat, sans espace, à 1280,
768, 375 et 320 px, quatre langues).

Règles :

- Tout texte qui affiche une donnée saisie (nom, e-mail, titre, description) passe à
  la ligne n'importe où (`wrap-anywhere`) : carte utilisateur, titre « Tâches de… »,
  lignes de tâche, alertes, toasts, tuiles de statistiques. Un enfant de grille ou de
  flex qui porte du texte saisi a `min-w-0` (ou `minmax(0,1fr)`), sinon il s'élargit.
- Le fond de page couvre toute la zone défilable : il est porté par `html` (jetons
  `page-from` et `page-to`), jamais par `<main>`.
- Dans une ligne de tâche, le texte garde toute la largeur de sa colonne : les actions
  passent sous le texte quand la colonne mesure moins de 28 rem (container query
  `@md`), à côté sinon. `wrap-anywhere` ne coupe un mot que s'il ne tient pas seul sur
  une ligne.
- Marge de page `p-4` sous `sm`, deux colonnes dès `md` (768 px). Les trois tuiles de
  statistiques (utilisateurs, tâches, moyenne par utilisateur) passent sur une colonne sous
  `md`, et leur chiffre est en `text-4xl` (`text-5xl` dès `sm`), en `text-heading` : la couleur
  d'un chiffre ne code rien.

### Écarts constatés

À corriger dans un lot séparé (changements visibles, non faits ici) :

- La transition de survol de `Card` `raised` (`Card.svelte`, ligne 23) n'est pas
  conditionnée par `prefers-reduced-motion`.

## 3. Composants

Tous dans `src/lib/ui/`, sauf indication. Les libellés arrivent traduits en props : un composant n'a de texte propre que son libellé d'accessibilité (`ToastItem`).
États : « n/a » quand le composant n'en a pas. Preuves communes : axe dans
`tests/e2e/accessibility.test.ts`, focus dans `tests/e2e/keyboard-focus.test.ts`.

### Button

Action à texte visible, une seule couleur d'accent (`primary`). Variantes : `primary`
(plein, l'action de la vue : bouton d'envoi d'un formulaire, « Add Task », « Save »),
`secondary` (contour, l'autre choix : « Cancel », « Retry », « Copy »), `link` (action
en ligne, ex. « Modifier »). Tailles : `md` (celle du bouton d'envoi) et `sm` (compacte,
cible minimale `min-h-6`). `tone` (`default`, `danger`, `inverse`) ne concerne que
`secondary` et suit la surface : `danger` sur un bandeau ou un encadré d'erreur,
`inverse` sur un toast. `block` donne la pleine largeur (bouton d'envoi). Le vert, le
rouge et l'ambre disent un état, jamais une action. `ButtonLink` est un lien vers une
autre page avec le look `secondary` : l'aller (« View Statistics ») et le retour
(« Back to home ») sont identiques, sous le titre. Les classes viennent de
`ui/button-styles.ts`. États : survol, focus global, désactivé (`bg-disabled` sur
`primary`, bordure et texte `disabled` sur `secondary` et `link`), envoi en cours (le
texte change, ex. « Création… », `aria-busy="true"`, curseur `progress`, jamais `disabled`).
Preuve : `tests/unit/components/SubmitButtons.test.ts`, `tests/e2e/submit-buttons.test.ts`,
`tests/unit/components/Button.test.ts`, `tests/e2e/single-accent.test.ts`. À faire : un verbe court, décrit par le texte ; un
`aria-label` plus précis seulement s'il ajoute le sujet (« Modifier {titre} »,
`messages/*.json` `tasks_edit_named`). À éviter : un bouton sans texte (utiliser
`IconButton`), un `aria-label` qui contredit le texte visible.

Règles complémentaires ([disabled-buttons](https://designmotionhq.com/patterns/disabled-buttons), [microcopy](https://designmotionhq.com/patterns/microcopy)) :

- Le libellé dit ce que l'on obtient (« Ajouter la tâche »), pas « Valider ».
- Pas de `disabled` pour empêcher une validation ni pendant un envoi : « Créer l'utilisateur »,
  « Ajouter la tâche » et « Enregistrer » restent actifs. La validation se fait au clic, avec
  nos messages (les formulaires portent `novalidate` : sans lui le navigateur bloquait l'envoi
  d'un champ `required` vide avec sa bulle native, dans sa propre langue, constat 22 de la revue
  visuelle) et le focus va au premier champ invalide. `required` reste pour la sémantique.
  Un bouton `disabled` sort de la tabulation, son infobulle ne s'affiche pas et son contraste
  échoue : réservé à une action réellement indisponible.
- Pendant un envoi, `aria-busy="true"` et un état d'envoi propre au formulaire (un chargement
  de liste du même domaine ne le touche pas) ; un second envoi est ignoré et le focus reste sur
  le bouton. « Enregistrer » garde son libellé. Pas d'opacité réduite, qui ferait baisser le
  contraste ; aucune animation.

### IconButton

Action sans texte (aujourd'hui : fermer un toast, supprimer une tâche), avec un
`label` obligatoire qui devient l'`aria-label`. Tons : `danger` (rouge, survol
`danger-hover`) et `inverse` (sur fond coloré, contour de focus blanc). Cible
`min-h-6 min-w-6`. Le dessin est la croix `xmark` d'Iconoir par `Icon`
(16 px, trait 1,5 px, `aria-hidden`, voir [Icônes](#icônes)) : le nom accessible reste celui du
bouton, et il nomme l'objet (`tasks_delete_named`, `notifications_dismiss`).

Sur écran tactile, `IconButton` passe lui-même à 44 px (`pointer-coarse:min-h-11
pointer-coarse:min-w-11`, deux tons), donc la croix du toast et le bouton « Supprimer » d'une
tâche ([hover-trap](https://designmotionhq.com/patterns/hover-trap)) ; preuve :
`tests/unit/components/IconButton.test.ts`, `tests/e2e/icons.test.ts`.

### Card

Conteneur. Variantes : `outlined` (cadre `line`, ombre `card`), `raised` (ombre
relevée, plus forte au survol, pour les chiffres des statistiques), `flat` (ombre
relevée sans survol). Marge intérieure `md` (`p-4 sm:p-6`) ou `lg` (`p-6 sm:p-8`). Rôle
purement visuel : le titre de la carte est un `h2` posé par l'écran. Règles
complémentaires ([perfect-card](https://designmotionhq.com/patterns/perfect-card)) : titre plus gras que la description, description
atténuée (`text-muted`), marge intérieure généreuse, contenu jamais collé au bord. Le
rayon reste `card` et la bordure `line` (rayon de 24 px de la fiche écarté, voir
[le compte rendu](#9-compte-rendu-de-lintégration-des-fiches)). **Cible** : au survol de
`raised`, ombre et élévation en environ 200 ms `ease-out` (aujourd'hui : la
`transition` Tailwind par défaut, 150 ms, sur l'ombre seule) et un signal d'interactivité
sur le bord d'une carte cliquable. Jamais de `scale` : voir [Mouvement](#mouvement).

### TextField

Champ texte, e-mail ou zone de texte (`multiline`). Anatomie : libellé visible
(`labelHidden` le réserve aux technologies d'assistance, pour les lignes d'édition),
contrôle, message d'erreur. États : défaut, focus global, invalide (la présence de
`error` donne `aria-invalid`, la bordure `danger` et `aria-describedby` vers
`<id>-error`), `required`. Variante `compact` pour une ligne de liste. Option `autoGrow` (zone de texte seulement, désactivée par défaut) : la hauteur suit le contenu, à la saisie, au collage et quand la largeur change (le champ lui-même n'est pas observé, pour ne pas boucler) ; le titre d'une tâche en édition l'utilise (une ligne logique : Entrée valide, Maj+Entrée ne fait rien, un retour à la ligne collé devient une espace). Après un
échec de validation, le focus va au premier champ invalide (`UserForm`,
`TaskForm`). À éviter : un placeholder à la place du libellé, un message d'erreur
non relié.

Règles complémentaires ([form-field-states](https://designmotionhq.com/patterns/form-field-states)) : six états distincts : défaut, focus,
erreur, succès, désactivé, chargement. Le libellé est hors du champ, l'aide dessous.
Une erreur combine couleur, icône et message (jamais une bordure rouge seule). Le succès
s'affiche dans le champ. Un champ désactivé n'est pas un champ en chargement, et le
désactivé ne se simule pas par une simple opacité. L'anneau de focus atteint 3:1.
**Cible** : états succès, chargement et icône d'erreur, absents aujourd'hui.

### UserList

Carte de la liste des utilisateurs, à part du formulaire de création (`UserForm` rend deux
cartes), titre `h2`. Toute la ligne est un `button` (`aria-pressed`, `min-h-11`) : un clic sur
sa marge sélectionne. Au repos un chevron, sélectionnée une coche (formes, pas seulement des
couleurs) ; survol `surface-hover` (sous `@media (hover: hover)`). Sélectionnée = fond
`surface-selected`, barre gauche de 4 px `primary` qui prend la place de 4 px de marge (le texte
ne bouge pas) et coche. Ce n'est jamais un anneau : le contour de focus (voir « Focus ») reste
le seul trait entourant la ligne, donc « sélectionné » et « focalisé » se distinguent. Ni pagination
ni défilement interne pour l'instant (voir « Motifs à venir »). Les icônes sont des SVG en ligne,
**temporaires** : à remplacer par `ui/Icon` (lot Iconoir). Preuve :
`tests/unit/components/UserList.test.ts`, `tests/e2e/readable-lists.test.ts`.

### TaskItem et ClampedText

`TaskItem` est une ligne de tâche : case, texte, actions. En édition, la case et la suppression de
la ligne éditée sont `disabled` (restent dans l'arbre d'accessibilité avec leur nom) : une tâche
en cours de modification ne se coche ni ne se supprime. Les actions « Modifier » et « Supprimer »
ont une cible de 44 px sur pointeur grossier (`pointer-coarse:min-h-11 pointer-coarse:min-w-11`,
passés par `class`). La case à cocher reste de 16 px ; sur pointeur grossier, une zone vide de
44 px autour d'elle (`data-touch-target`) renvoie le tap à la case, qui garde son nom et le
clavier. « Modifier » porte l'icône `edit-pencil` et « Supprimer » la croix `xmark` (`TaskItem.svelte`).
`ClampedText` limite la description à trois lignes (`line-clamp-3`) ; le bouton « Afficher
plus / moins » n'existe que si le texte déborde (un pixel d'écart est un arrondi), reste
disponible une fois déplié, et porte un nom propre à la ligne (« Afficher plus : {titre} »,
qui commence par le texte visible, WCAG 2.5.3) avec `aria-expanded` et `aria-controls`. Le texte
complet reste dans le DOM. La mesure se refait quand la largeur change. Preuve :
`tests/unit/components/ClampedText.test.ts`, `tests/unit/components/TaskList.readable.test.ts`,
`tests/e2e/readable-lists.test.ts`.

### Select

`<select>` natif étiqueté (libellé visible), utilisé pour la langue et l'ordre
de tri. Chaque option peut porter son `lang` (WCAG 3.1.2) ; le focus reste sur lui
après un changement. Natif : navigation clavier et lecteurs d'écran sans code.
Règles complémentaires ([dropdown-design](https://designmotionhq.com/patterns/dropdown-design)) pour un menu déroulant sur mesure : un
déclencheur qui se voit cliquable (caret, survol, cible d'au moins 44 px sur
tactile), un retournement vers le haut près du bord, la navigation au clavier, une
recherche au-delà d'une dizaine d'options, une ouverture d'environ 150 ms.

### Alert

Bandeau en ligne (`bg-danger-soft text-danger`), **sans rôle ARIA**. Il n'affiche plus d'erreur de
requête (le toast en est l'unique surface, voir [Motifs](#4-motifs)) ; la page statistiques
l'utilise encore pour son état d'échec.

### Notification et ToastItem

`Notification` est la pile fixée en bas, avec deux régions vives persistantes :
`role="status"` (info, succès, avertissement) et `role="alert"` (erreur), qui
restent rendues, vides, pour que l'annonce suivante soit lue. La pile n'est une
région nommée (`notifications_region`) que tant qu'elle contient un toast.
Une troisième région, `<p data-announcement aria-live="polite" aria-atomic="true"
class="sr-only">`, porte les annonces sans surface (tri, déplacement d'une ligne,
changement de langue : `NotificationState.announce`) : toujours rendue, vide, au même nœud
d'une annonce à l'autre (une clé de rendu relit une phrase répétée), masquée par `sr-only`
(jamais `display:none`, `hidden` ni `aria-hidden`, qui la rendraient muette), hors de la pile
(aucune hauteur réservée) et vidée après 10 s pour ne pas laisser une phrase périmée en
navigation. Elle n'a pas `role="status"` : la pile garde la seule région `status` de la
page, que les tests interrogent par son rôle (deux régions la rendraient ambiguë). Règle :
une sévérité basse, dont le résultat se voit déjà à l'écran, s'annonce dans cette région, sans toast (un
toast ne sert qu'à ce qui n'est pas visible ailleurs, ou à une erreur).
`ToastItem` : fond par type (`success`, `error`, `info`, `warning`), texte blanc,
`ReferenceLine` éventuelle, bouton de fermeture. Un toast se met en pause au survol
et au focus (WCAG 2.2.1) et garde le temps restant ; durée 3 s, 6 s pour une erreur que
l'utilisateur peut corriger (4xx). Une erreur qu'il ne peut pas corriger reste jusqu'à
fermeture, pour qu'il ait le temps de copier la référence : pas de réponse (réseau, délai
dépassé), 5xx ou réponse hors contrat (`isPersistentFailure`, qui reprend `isOutage` de la
politique de disponibilité). Une même erreur persistante (message et référence identiques)
n'est affichée qu'une fois à la fois ; deux 5xx de références différentes restent séparées.
Fermeture d'un toast qui avait le focus : le focus va au bouton du toast voisin
(suivant, sinon précédent), sinon à l'élément d'avant l'entrée dans les toasts,
sinon à `main` ; fermé à la souris sans focus (Safari), le focus ne bouge pas. Un
bouton de fermeture atteint par Tab est ramené entièrement dans la pile
(`scrollIntoView({ block: 'nearest' })`). Preuves : `tests/unit/components/Notification.test.ts`,
`tests/e2e/keyboard-focus.test.ts`.

Un toast peut porter une **action** : `notifications.add(message, type, { duration, reference,
action: { label, run }, onclose })`. Le bouton (même apparence que « Copier » ; c'est encore un `<button>` écrit dans `ToastItem`, pas un `Button` `secondary` `sm` de ton `inverse` : **à migrer**) vient après le message et la référence, avant la fermeture ;
son libellé arrive traduit et se coupe n'importe où. Activé, il retire le toast puis lance
`run` une fois (un second appui, ou un appui après l'expiration, ne fait rien) ; si `run`
lève, le toast part quand même et l'erreur remonte. `onclose(raison)` est appelé une seule
fois, après le départ du toast : `'action'`, `'dismissed'` (fermeture par l'utilisateur) ou
`'expired'` (durée écoulée) ; la pause au survol et au focus s'applique au bouton aussi
(WCAG 2.2.1). Après l'action, le focus suit la règle de la fermeture, sauf si `run` l'a déjà
placé sur un élément présent (l'annulation d'une suppression le place sur la ligne rétablie).
Le toast ne s'enregistre pas pour un départ de la page : un appelant qui engage quelque chose
à l'expiration (suppression différée) l'engage aussi au `pagehide`. Preuves :
`tests/unit/stores/notification.test.ts`, `tests/unit/components/Notification.test.ts` ;
pas encore d'E2E (aucun écran n'utilise l'action : le premier usage porte le test navigateur).

Règles complémentaires ([notification-system](https://designmotionhq.com/patterns/notification-system), [toast-notifications](https://designmotionhq.com/patterns/toast-notifications)) :

- Quatre surfaces selon la gravité : toast, bandeau, modale, badge ; chacune a sa
  persistance. Une info ne justifie jamais une modale ; jamais de modales
  superposées ; les toasts s'empilent.
- Un toast porte couleur, icône et bordure d'accent : fond par type (`TOAST_BACKGROUNDS`),
  icône de type, bord gauche de 4 px plus foncé que le fond (`TOAST_BORDERS`, jetons
  `*-edge`, 3:1 ou plus sur la page ; `tests/e2e/icons.test.ts`). Il ne
  s'affiche jamais au centre de l'écran. Les durées actuelles (3 s, 6 s) et la pile
  fixée en bas font autorité.
- **Plafond** : trois toasts visibles (`MAX_VISIBLE_TOASTS`), le surplus attend dans une file
  dans l'ordre d'arrivée (`notifications.shown` est ce qui est affiché, `items` tout ce qui
  n'est pas fermé). La file n'a pas de borne : elle est dédupliquée (une erreur persistante
  identique n'y entre qu'une fois). Les erreurs persistantes comptent dans les trois places et
  ne sont jamais évincées. Un toast qui porte une action (la fenêtre d'annulation de 6 s) n'attend
  jamais et ne compte pas dans les trois. Le minuteur d'un toast ne démarre que lorsqu'il est
  affiché, pour sa durée entière : un message n'expire pas sans avoir été vu. Un toast en file est
  annoncé quand il s'affiche, pas quand il arrive. Preuves : `tests/unit/stores/notification.test.ts`,
  `tests/unit/components/Notification.test.ts`, `tests/e2e/persistent-errors.test.ts`.
- La croix de fermeture (`IconButton`) garde 24 px à la souris et passe à 44 px sur pointeur
  grossier (`tests/e2e/icons.test.ts`, Chromium tactile : les autres moteurs n'émulent pas
  `pointer: coarse`).
- Une erreur 5xx ou réseau reste jusqu'à fermeture ; les autres erreurs durent 6 s
  (`tests/e2e/persistent-errors.test.ts`).

### ReferenceLine

Ligne « Référence : … » avec bouton « Copier » : la référence serveur
(`X-Request-Id`) est sélectionnable en entier (`select-all`) et se coupe n'importe
où. Le bouton « Copier » est un `Button` `secondary` `sm`, de ton `inverse` (toast) ou
`danger` (bandeau), comme « Réessayer » du bandeau. Nom accessible
« Copier la référence {référence} ». Preuve :
`tests/unit/components/NotificationReference.test.ts`.

### LanguageSwitcher

`Select` des quatre langues, option « EN - English » dans sa propre langue
(`lang` sur chaque option), en haut de chaque page. Le changement est annoncé dans la
nouvelle langue (« Langue modifiée : Français »), dans la région d'annonce (WCAG 4.1.3 : le
focus reste sur le sélecteur), sans toast : la page vient de changer sous les yeux et un toast
recouvrait les actions de la liste. Preuve : `tests/e2e/i18n.test.ts`,
`tests/unit/components/LanguageSwitcher.test.ts`.

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

Règles complémentaires ([form-validation-timing](https://designmotionhq.com/patterns/form-validation-timing)) : **Cible** : valider au départ du champ
(blur), revalider en direct une fois l'erreur affichée, confirmer un champ devenu
valide ; ni tout à la soumission, ni une erreur à chaque frappe. Aujourd'hui la
validation a lieu à la soumission.

### Toast, bandeau ou message en ligne

| Besoin                                                                                 | Moyen                             | Pourquoi                                                        |
| -------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| Erreur d'un champ                                                                      | message sous le champ             | relié par `aria-describedby`                                    |
| Erreur d'une requête (formulaire, liste)                                               | toast `error` seul                | une seule surface, avec référence, copie et persistance         |
| Refus du serveur rattachable à un champ (e-mail déjà pris, code `EMAIL_TAKEN`)         | message sous le champ, sans toast | le contrat ne désigne aucun autre champ : le reste est un toast |
| Information dont l'effet se voit déjà à l'écran (langue, tri, déplacement d'une ligne) | annonce `aria-live`, sans toast   | lue par les lecteurs d'écran, rien de visible à recouvrir       |
| Confirmation passagère (service rétabli, référence copiée)                             | toast `status`                    | annonce polie, disparaît seule                                  |
| Service indisponible, durable                                                          | bandeau `AvailabilityBanner`      | reste tant que l'incident dure, avec « Réessayer »              |

Un succès de création n'a pas de toast : le formulaire se vide et la liste change.

Règles complémentaires pour une erreur ([error-states](https://designmotionhq.com/patterns/error-states)) : son emplacement suit sa nature
(champ : sous le champ ; connexion : bandeau ou toast ; serveur ou permission : espace
visible) et sa surface suit la gravité (ligne, puis toast, puis modale ; jamais une
modale pour une petite validation). Le message est humain (quoi, pourquoi, que faire),
jamais « Error 500 » ou « OK » seul, et propose une issue (réessayer, copier la
référence). La prévention (validation en ligne) vaut mieux que le message.

### États vides et chargement

États vides en `text-subtle` (« Aucun utilisateur », « Aucune tâche »), suivis d'une ligne d'aide plus petite qui dit quoi faire (« Créez le premier avec le formulaire ci-dessus ») ; le panneau sans utilisateur choisi dit où choisir. Chargement :
l'état discriminé `RequestStatus` ; le texte du bouton change pendant l'envoi, la
page statistiques affiche « Chargement… ». Aucune requête de liste n'est lancée
tant que le service est indisponible (`runWhenAvailable`), pour éviter une cascade
d'erreurs.

**Inconnu n'est pas vide.** Un écran qui n'a pas ses données ne le présente jamais comme
« aucun » ni comme des zéros. La page statistiques a cinq états, dans cet ordre : chiffres ;
invitation « Rien à compter » avec lien vers l'accueil quand utilisateurs et tâches sont à
0 ; attente du service (« s'afficheront dès que le service sera rétabli », sans chargement ni
second « Réessayer », le bandeau l'a) ; chargement ; échec (« Impossible de charger… » et
« Réessayer », dont le clic met le focus sur `<main>` le temps du rechargement). Le toast
garde le détail technique et la référence. La liste des utilisateurs de
l'accueil suit la même règle avec `UserState.loadState` (`idle`, `loading`, `loaded`, `failed`) :
sans chargement réussi, ni compteur ni « No users yet » ; pendant une panne (bandeau) un texte
neutre sans bouton, hors panne un échec avec « Réessayer » ; les utilisateurs déjà affichés
restent affichés si un rechargement échoue. Preuve : `tests/unit/components/StatsPage.states.test.ts`,
`tests/unit/components/UserList.load-state.test.ts`, `tests/e2e/truthful-states.test.ts`,
`tests/e2e/user-list-states.test.ts`.

Règles complémentaires ([loading-states-system](https://designmotionhq.com/patterns/loading-states-system), [skeleton-loading](https://designmotionhq.com/patterns/skeleton-loading), [empty-states](https://designmotionhq.com/patterns/empty-states)) :

- Rien sous 300 ms. Un squelette fidèle à la mise en page finale quand la forme est
  connue ; un spinner pour une attente courte (moins de 3 s environ) de durée inconnue,
  jamais en pleine page ; une barre de progression au-delà quand le pourcentage est
  connu. Pas de squelette pour une action de l'utilisateur (voir « Réponse
  optimiste ») ; pas de mélange squelette et spinner. Un shimmer ne tourne que sous
  `prefers-reduced-motion: no-preference`.
- Un état vide a (**Cible** pour l'icône : seul l'état « aucun utilisateur choisi » l'a, `TaskForm.svelte` ; les listes vides d'utilisateurs et de tâches et la page statistiques vide n'en ont pas) une petite icône ou illustration, le ton de la marque et une action
  principale vers l'étape suivante. Quatre cas : premier lancement, aucun résultat,
  erreur, résultat filtré. Jamais « No data » nu ni un ton de journal technique.

### Message d'erreur du serveur

Une erreur serveur se lit comme une phrase pour une personne, pas comme une ligne de journal :
elle dit que le problème est de notre côté ou que le service est indisponible, et de
réessayer (« Un problème est survenu de notre côté. Réessayez dans un instant. »), sans
« Internal server error » ni « Database unavailable ». Elle ne promet pas que la saisie est
conservée, ce qui n'est pas vrai de toute action. Preuve : `tests/unit/i18n/failure-message.test.ts`.

### Changement d'utilisateur

Le formulaire de tâche appartient à l'utilisateur sélectionné : en changer le remet à zéro
(`{#key}` dans `routes/+page.svelte`) ; erreur de champ, brouillon et édition en cours ne
passent pas à l'autre utilisateur, sans quoi une tâche pourrait lui être attribuée. Le tri
est global et survit au changement ; le focus reste sur la ligne choisie. Une tâche dont la
création est en vol pendant le changement reste à l'utilisateur d'origine et n'entre pas dans
la liste de l'autre (`TaskState.add`). Preuve : `tests/unit/components/HomePage.userSwitch.test.ts`,
`tests/unit/stores/tasks-in-flight.test.ts`, `tests/e2e/truthful-states.test.ts`.

### Erreur avec référence

Une réponse 5xx porte `X-Request-Id` : le toast d'erreur et le bandeau affichent
la `ReferenceLine`, avec « Copier » ; si le presse-papiers est refusé, un toast
d'avertissement le dit et la référence reste sélectionnable.

### Action destructive

Supprimer une tâche n'ouvre aucune confirmation (`IconButton` rouge, nom
« Supprimer {titre} »). La ligne sort aussitôt de la liste et un toast « Tâche
supprimée : {titre} » offre « Annuler » pendant 6 s (pause au survol et au focus,
comme tout toast). L'élément focalisé disparaît : le focus va au bouton « Annuler » du
toast. Tant que le focus y reste, le minuteur est en pause : le clavier n'a pas de limite de
temps (WCAG 2.2.1). À la fermeture du toast (croix, expiration ou envoi), le focus revient au
titre de la liste (`tabindex="-1"`), sauf s'il est déjà ailleurs.

- **Annuler** remet la tâche à sa place, sans aucun appel réseau, et donne le focus à
  sa case à cocher (le focus posé par l'action n'est pas repris par le toast).
- La requête `DELETE` part quand le toast se ferme (fin du délai ou croix), quand un autre
  utilisateur est sélectionné, et quand la page devient masquée (`visibilitychange`
  hidden) ou est quittée (`pagehide`, filet) ; un seul envoi par tâche, avec `keepalive`.
  Le `DELETE` n'ajoute aucun en-tête (un en-tête personnalisé demanderait une autorisation
  CORS de plus).
- 404 `TASK_NOT_FOUND` à l'envoi : succès silencieux (la tâche est déjà partie). Tout autre
  échec : la ligne est remise à sa place et l'erreur habituelle s'affiche.
- Risque résiduel : le `DELETE` cross-origin est précédé d'un préflight (le backend ne pose pas
  `Access-Control-Max-Age`, et le cache de préflight est par URL, donc inutile pour un id neuf).
  Envoyé à `hidden`, la page est encore vivante et le préflight aboutit ; un onglet tué sans
  passer par `hidden` perd la suppression : la tâche réapparaît au rechargement, sans perte de
  données.

Preuves : `tests/unit/stores/task-undo.test.ts`, `tests/unit/components/TaskForm.a11y.test.ts`,
`tests/e2e/undo-delete.test.ts`, `tests/e2e/focus-and-errors.test.ts` (anneau du bouton),
`tests/e2e/accessibility.test.ts` (axe, 320 px).
Règles complémentaires ([destructive-actions](https://designmotionhq.com/patterns/destructive-actions), [undo-ux](https://designmotionhq.com/patterns/undo-ux)) : le bouton nomme l'action
(« Supprimer la tâche ») ; le rouge est réservé à la destruction ; une action
irréversible demande une friction forte (saisie du nom, maintien appuyé) et n'occupe
jamais la place habituelle du bouton de confirmation. La fenêtre d'annulation est de
6 s partout.

### Édition en ligne

Le bouton « Modifier » ouvre un formulaire dans la ligne : le focus va au champ
titre, Échap annule sans appeler l'API, enregistrer ou annuler rend le focus au
bouton « Modifier ». La case à cocher garde pour nom accessible le titre exact de la
tâche, quel que soit son état ; pendant l'édition elle et la suppression de la ligne sont désactivées. Le champ titre grandit avec son texte (`autoGrow`) et Entrée enregistre (hors composition IME et Maj+Entrée). Preuve : `tests/unit/components/TaskForm.a11y.test.ts`.

Règles complémentaires ([inline-editing](https://designmotionhq.com/patterns/inline-editing)) : la bascule ne décale rien (même police, même
taille, même marge) ; Entrée valide, Échap annule ; le départ du champ (blur) se
comporte pareil partout ; en cas d'échec, le brouillon est conservé. **Cible** : un
signal d'éditabilité au survol.

### Tri de la liste

`Select` « Trier par » (à partir de 2 tâches), trois ordres. Le choix est annoncé
une fois par changement (« Tâches triées par… », région d'annonce, sans toast), jamais au
chargement. Quand une modification déplace une ligne, le focus reste sur le même contrôle et
« titre : position N sur M » est annoncé de la même façon. Règles de tri et stockage : voir
[architecture.md](./architecture.md#tri-des-tâches). Preuve :
`tests/e2e/task-sorting.test.ts`, `tests/unit/components/TaskSorting.test.ts`.

### Réponse optimiste

Mettre l'interface à jour tout de suite, puis revenir en arrière proprement en cas
d'échec, vaut pour une action réversible et de faible enjeu (par exemple cocher une tâche). Jamais
pour un paiement ni avant une validation que seul le serveur peut donner. Le serveur
recalcule et l'interface s'aligne sur sa réponse ([optimistic-ui](https://designmotionhq.com/patterns/optimistic-ui), [behind-the-button](https://designmotionhq.com/patterns/behind-the-button) : validation côté client pour la vitesse, côté serveur pour la confiance).
Preuve : aucune ; règle à suivre.

### Survol et tactile

Le survol n'existe pas au toucher : aucune action principale n'est cachée derrière un
survol, et toute information donnée au survol a un équivalent tactile ou clavier. Les
styles de survol se déclarent sous `@media (hover: hover)` quand ils révèlent
quelque chose ([hover-trap](https://designmotionhq.com/patterns/hover-trap)). Preuve : aucune ; règle à suivre (les survols actuels ne
changent que la couleur ou l'ombre).

## 5. Contenu

- **Source et parité.** L'anglais est la langue source ; `fr`, `de` et `es` ont
  les mêmes clés et paramètres. Preuve : `tests/unit/i18n/messages.test.ts`.
- **Toute chaîne visible est un message** (`m.<clé>()`) : textes, noms accessibles,
  titres de page, notifications. Les données saisies (titres, noms) ne sont jamais
  traduites. Les icônes décoratives sont `aria-hidden` (voir [Icônes](#icônes)).
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
- **Microcopy** ([microcopy](https://designmotionhq.com/patterns/microcopy)). Un bouton dit ce que l'on obtient ; une erreur dit quoi
  faire (« Entrez une adresse e-mail valide »), jamais « Invalid input » ou
  « operation failed » ; un état vide propose la première action ; le libellé est
  permanent, jamais remplacé par le placeholder ; le ton est celui d'un collègue.

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
- [ ] Nom accessible stable ; pas d'`aria-label` qui change avec l'état. Exception assumée : le bouton « Afficher plus / moins » de `ClampedText` change de nom avec son état (« Afficher plus : {titre} » puis « Afficher moins : {titre} »), parce que son texte visible change (WCAG 2.5.3, le nom commence par le texte visible).
- [ ] Erreurs de champ reliées (`aria-describedby`, `aria-invalid`).
- [ ] Fonctionne à 320 px et à 200 % de zoom.
- [ ] Textes dans les quatre fichiers `messages/*.json`, libellés longs testés.
- [ ] Animation sous `prefers-reduced-motion: no-preference` seulement.
- [ ] Aucune action principale cachée derrière un survol ; zone de tap suffisante.
- [ ] Donnée saisie affichée en `wrap-anywhere` (et `min-w-0` sur le parent flex ou
      grille) ; fond de page sur `html`.
- [ ] Axe sans violation sur l'écran touché ; tests existants ni affaiblis ni
      modifiés pour passer.

## 7. Cible

Réalisé : `Icon` (voir [Icônes](#icônes)) accompagne les actions, les toasts et le bandeau, et
remplace les émojis décoratifs. Non réalisé : les icônes des états vides (liste des
utilisateurs, liste des tâches, statistiques sans données) ; l'unification des écarts listés en
section 2.

## 8. Motifs à venir

Aucun de ces composants n'existe encore dans l'application, qui va grossir : chaque règle
**s'applique dès qu'un composant de ce type est ajouté**. Ce sont des règles à suivre,
sans preuve dans le code. Elles se traduisent dans les jetons et l'échelle de 4 px du
projet ; une valeur qui manque est une **Cible : jeton à créer**, jamais un nombre en
dur. Le composant ajouté rejoint la section 3 et la checklist de la section 6. Les
fiches dont la règle est déjà dans les sections 1 à 4 n'y sont pas répétées (voir le
compte rendu).

### Formulaires avancés

- **Réglages** ([settings-system](https://designmotionhq.com/patterns/settings-system)) : bascule immédiate pour un réglage anodin, « Enregistrer » et « Annuler » sinon ; un réglage modifié se signale et se réinitialise ; zone dangereuse en bas, avec saisie du nom.
- **Enregistrement automatique** ([autosave-ux](https://designmotionhq.com/patterns/autosave-ux)) : attendre environ 800 ms après la dernière frappe ; statut à états (saisie, enregistrement, enregistré, hors ligne, erreur), jamais « Enregistré » avant le succès ; garde `beforeunload` tant que des changements ne sont pas partis.
- **Sélecteur de date** ([date-pickers](https://designmotionhq.com/patterns/date-pickers)) : préréglages d'abord ; plage avec aperçu au survol ; clavier complet, feuille plein écran sur mobile.
- **Masque de saisie** ([input-masking](https://designmotionhq.com/patterns/input-masking)) : blocs de 4 chiffres pour une carte ; curseur stable, nettoyage au collage ; valeur stockée brute, validée au départ du champ.
- **Curseur de plage** ([range-sliders](https://designmotionhq.com/patterns/range-sliders)) : piste remplie et cliquable, valeur affichée pendant le glissement ; deux poignées pour une plage ; flèches, Début et Fin au clavier.
- **Assistant en étapes** ([stepper-wizard](https://designmotionhq.com/patterns/stepper-wizard)) : étapes découpées par sens avec progression visible ; validation et erreurs dans l'étape ; état conservé en revenant en arrière.
- **Interrupteur** ([toggle-anatomy](https://designmotionhq.com/patterns/toggle-anatomy)) : transition d'environ 250 ms en `ease-out`, sous `prefers-reduced-motion: no-preference` ; Espace bascule, `aria-checked`, focus visible ; si asynchrone, optimiste avec retour arrière.
- **Dépôt de fichier** ([file-upload-ux](https://designmotionhq.com/patterns/file-upload-ux)) : zone de dépôt qui réagit ; pourcentage et temps restant, relance sur place ; aperçu (miniature, type, taille) et progression par fichier.
- **Mot de passe** ([password-field-ux](https://designmotionhq.com/patterns/password-field-ux)) : checklist et jauge en temps réel ; bouton pour afficher la valeur ; collage permis.
- **Code à usage unique** ([otp-input](https://designmotionhq.com/patterns/otp-input)) : le collage est le chemin principal (nettoyer, répartir) ; `inputmode="numeric"` et `autocomplete="one-time-code"` ; retour immédiat (erreur : vider et refocaliser).

### Navigation

- **Patterns de navigation** ([navigation-patterns](https://designmotionhq.com/patterns/navigation-patterns)) : onglets en bas sur mobile (3 à 5 destinations), barre latérale sur bureau à partir de 5 sections ; hamburger réservé au secondaire ; fil d'Ariane au-delà de 2 niveaux.
- **Onglets** ([tabs-system](https://designmotionhq.com/patterns/tabs-system)) : flèches, Début, Fin et Tab au clavier ; focus et onglet actif de couleurs différentes ; débordement en défilement horizontal avec fondus.
- **Pagination** ([pagination](https://designmotionhq.com/patterns/pagination)) : curseur plutôt que décalage quand les données bougent ; pages tronquées (première, dernière, courante, voisines) ; page dans l'URL et défilement restauré au retour.
- **Palette de commandes** ([command-palette](https://designmotionhq.com/patterns/command-palette)) : recherche floue, résultats groupés, tout au clavier ; jamais le seul accès à une action.

### Données et graphiques

- **Tableau de données** ([data-table](https://designmotionhq.com/patterns/data-table)) : tri à trois états (croissant, décroissant, ordre d'origine) ; nombres à droite en chiffres tabulaires ; en-tête figé et densité en jeton (**Cible : jeton à créer**).
- **Graphiques honnêtes** ([charts-that-lie](https://designmotionhq.com/patterns/charts-that-lie)) : axe des barres à zéro ; type suivant la question (secteurs jusqu'à 5 parts) ; étiquettes directes, sans quadrillage ni 3D, titre qui énonce la conclusion.
- **Pastilles de filtre** ([filter-chips](https://designmotionhq.com/patterns/filter-chips)) : trois états distincts (repos, actif avec coche, désactivé) ; « ou » dans un groupe, « et » entre groupes ; une seule remise à zéro.
- **Actions groupées** ([bulk-actions](https://designmotionhq.com/patterns/bulk-actions)) : case d'en-tête à trois états et compteur en direct ; sélection dans l'état de l'application ; annuler plutôt que confirmer (6 s).
- **Recherche** ([search-experience-system](https://designmotionhq.com/patterns/search-experience-system)) : placeholder descriptif en complément du libellé ; recherches récentes au focus ; zéro résultat avec suggestions.
- **Note en étoiles** ([star-rating](https://designmotionhq.com/patterns/star-rating)) : aperçu au survol distinct de la valeur enregistrée ; une moyenne fractionnaire ne s'arrondit pas à l'étoile entière.

### Surfaces et superpositions

- **Hiérarchie des superpositions** ([modal-hierarchy](https://designmotionhq.com/patterns/modal-hierarchy)) : première question : bloque-t-elle l'utilisateur ? La modale est réservée à une décision critique ; feuille du bas sur mobile ; un popover est petit, ancré, jamais bloquant.
- **Menu contextuel** ([context-menu](https://designmotionhq.com/patterns/context-menu)) : se retourner près du bord ; groupes par intention, destructif en bas et en rouge ; flèches et Échap d'un niveau au clavier, appui long sur mobile.
- **Infobulle** ([tooltip-design](https://designmotionhq.com/patterns/tooltip-design)) : délai d'environ 300 ms ; fermée au départ, par Échap, au blur et au clic extérieur ; une phrase, jamais seule source d'une information.
- **Feuille du bas** ([bottom-sheets](https://designmotionhq.com/patterns/bottom-sheets)) : actions à portée du pouce, page visible derrière ; fermeture par glissement ; voile et défilement verrouillé.
- **Accordéon** ([accordion-disclosure](https://designmotionhq.com/patterns/accordion-disclosure)) : en-tête en `<button>` avec `aria-expanded` et `aria-controls` ; hauteur animée via `grid-template-rows` de `0fr` à `1fr` ; la liste ne saute pas à l'ouverture.
- **Empilement** ([z-index-mastery](https://designmotionhq.com/patterns/z-index-mastery)) : `z-index` exige un positionnement ; `isolation: isolate` confine un composant ; petite échelle nommée plutôt que 9999 (**Cible : jeton à créer**).

### Interaction avancée

- **Glisser-déposer** ([drag-and-drop](https://designmotionhq.com/patterns/drag-and-drop)) : prise confirmée visuellement ; zones de dépôt visibles avant le relâchement ; annulation de 6 s.
- **Actions au glissement** ([swipe-actions](https://designmotionhq.com/patterns/swipe-actions)) : affordance signalée ; jamais l'unique accès à une action ; deux actions au plus par côté, friction ou annulation pour le destructif.
- **Curseurs partagés** ([live-cursors](https://designmotionhq.com/patterns/live-cursors)) : positions interpolées, couleur stable par utilisateur ; verrouillage d'un élément en cours d'édition.
- **Sélecteur de couleur** ([color-picker-ux](https://designmotionhq.com/patterns/color-picker-ux)) : formats lisibles (OKLCH et hex) ; couleurs récentes ; contraste affiché en direct.
- **Animations liées au défilement** ([scroll-driven-animations](https://designmotionhq.com/patterns/scroll-driven-animations)) : `animation-timeline: scroll()` ou `view()` en CSS natif, sans écouteur de défilement ni bibliothèque JS ; sous `prefers-reduced-motion: no-preference`.
- **Sélecteur `:has()`** ([css-has-selector](https://designmotionhq.com/patterns/css-has-selector)) : quand l'état est dans le DOM ; `:user-invalid` plutôt que `:invalid` ; `body:has(dialog[open])` pour verrouiller le défilement.

### Mode sombre et système visuel

- **Mode sombre** ([dark-mode](https://designmotionhq.com/patterns/dark-mode)) : un autre jeu de jetons, jamais une inversion ; fond gris très sombre (pas de noir pur), texte blanc cassé, accents désaturés ; les ratios de la section 2 se remesurent. **Cible : jeton à créer**.
- **Kit de design system** ([design-system-kit](https://designmotionhq.com/patterns/design-system-kit)) : jetons sémantiques plutôt que valeurs en dur ; échelle typographique fixe ; composants en variantes, tailles et états.
- **Grille** ([grid-system](https://designmotionhq.com/patterns/grid-system)) : 12 colonnes, gouttière prise dans l'échelle de 4 px ; 12, 6, 4 puis 1 colonne selon le point de rupture ; on rompt la grille seulement après l'avoir établie.
- **Lois de la Gestalt** ([gestalt-laws](https://designmotionhq.com/patterns/gestalt-laws)) : regrouper ce qui va ensemble (région commune, similarité, continuité sur un même axe) ; assombrir l'arrière-plan d'une modale.
- **Interface dense de type Linear** ([reverse-engineered-linear](https://designmotionhq.com/patterns/reverse-engineered-linear)) : profondeur par trois valeurs de fond et bordure fine plutôt que par des ombres ; statut par icône grise, pas par pastille colorée ; raccourci affiché à côté de l'action.
- **Dégradés** ([gradient-design](https://designmotionhq.com/patterns/gradient-design)) : teintes voisines, luminosité dans un seul sens ; jamais de texte courant sur la zone médiane ; contraste mesuré sur le fond le plus défavorable.

### Parcours et pages marketing

- **Temps fort et fin** ([peak-end-rule](https://designmotionhq.com/patterns/peak-end-rule)) : un moment fort voulu et une fin positive ; soigner la dernière interaction de chaque parcours.
- **Position dans la série** ([serial-position](https://designmotionhq.com/patterns/serial-position)) : le plus important au début et à la fin d'une séquence.
- **Boucle ouverte** ([zeigarnik-effect](https://designmotionhq.com/patterns/zeigarnik-effect)) : une boucle ouverte visible (jauge, case non cochée) ramène l'utilisateur, seulement pour un résultat qu'il veut ; jamais de progression fabriquée.
- **Squelette de page d'accueil** ([landing-page-skeleton](https://designmotionhq.com/patterns/landing-page-skeleton)) : cinq sections dans l'ordre (hero, preuve, problème, solution, appel à l'action) ; un seul appel à l'action, repris en bas ; pas de carrousel dans le hero.
- **Hero sobre** ([de-ai-landing-hero](https://designmotionhq.com/patterns/de-ai-landing-hero)) : titre = le résultat obtenu, sous-titre = le public visé ; un seul bouton principal, l'autre action en lien texte ; un vrai témoignage plutôt que trois cartes à icône.

## 9. Compte rendu de l'intégration des fiches

Les 76 fiches de [designmotionhq.com](https://designmotionhq.com/patterns) sont
intégrées : 33 comme « Règles complémentaires » dans les sections 1 à 6, 43 en
section 8. Les valeurs sans source claire n'ont pas été reprises (pourcentages
d'engagement ou de daltonisme, usages attribués à d'autres produits).

**Sections complétées** : Principes, Fondations (couleurs, typographie et espacements,
focus, mouvement, 320 px, écarts constatés), Composants (`Button`, `IconButton`, `Card`,
`TextField`, `Select`, `Notification`), Motifs (formulaires, erreurs, états vides et
chargement, action destructive, édition en ligne, réponse optimiste, survol et
tactile), Contenu, Gouvernance. Fiches : [design-tokens](https://designmotionhq.com/patterns/design-tokens), [color-accessibility](https://designmotionhq.com/patterns/color-accessibility), [visual-hierarchy](https://designmotionhq.com/patterns/visual-hierarchy), [proximity-rule](https://designmotionhq.com/patterns/proximity-rule), [border-radius](https://designmotionhq.com/patterns/border-radius), [icon-design-rules](https://designmotionhq.com/patterns/icon-design-rules), [animation-timing](https://designmotionhq.com/patterns/animation-timing), [easing-curves](https://designmotionhq.com/patterns/easing-curves), [error-states](https://designmotionhq.com/patterns/error-states), [loading-states-system](https://designmotionhq.com/patterns/loading-states-system), [notification-system](https://designmotionhq.com/patterns/notification-system), [toast-notifications](https://designmotionhq.com/patterns/toast-notifications), [optimistic-ui](https://designmotionhq.com/patterns/optimistic-ui), [doherty-threshold](https://designmotionhq.com/patterns/doherty-threshold), [undo-ux](https://designmotionhq.com/patterns/undo-ux), [form-field-states](https://designmotionhq.com/patterns/form-field-states), [form-validation-timing](https://designmotionhq.com/patterns/form-validation-timing), [disabled-buttons](https://designmotionhq.com/patterns/disabled-buttons), [inline-editing](https://designmotionhq.com/patterns/inline-editing), [destructive-actions](https://designmotionhq.com/patterns/destructive-actions), [dropdown-design](https://designmotionhq.com/patterns/dropdown-design), [hover-trap](https://designmotionhq.com/patterns/hover-trap), [focus-states](https://designmotionhq.com/patterns/focus-states), [empty-states](https://designmotionhq.com/patterns/empty-states), [microcopy](https://designmotionhq.com/patterns/microcopy), [von-restorff](https://designmotionhq.com/patterns/von-restorff), [skeleton-loading](https://designmotionhq.com/patterns/skeleton-loading), [behind-the-button](https://designmotionhq.com/patterns/behind-the-button), [shadow-elevation](https://designmotionhq.com/patterns/shadow-elevation), [depth-layers](https://designmotionhq.com/patterns/depth-layers), [golden-ratio](https://designmotionhq.com/patterns/golden-ratio), [perfect-card](https://designmotionhq.com/patterns/perfect-card), [card-hover-anatomy](https://designmotionhq.com/patterns/card-hover-anatomy).

**Section créée** : « 8. Motifs à venir » (43 fiches, 7 thèmes). La section « Cible »
est devenue la section 7.

**Écarts volontaires** :

- [golden-ratio](https://designmotionhq.com/patterns/golden-ratio) : l'échelle de 4 px de Tailwind et les jetons existants gardent
  l'autorité.
- [icon-design-rules](https://designmotionhq.com/patterns/icon-design-rules) : trait constant de 1,5 px d'écran à toutes les tailles
  (dessin d'Iconoir, `non-scaling-stroke`) au lieu de 2 px.
- [perfect-card](https://designmotionhq.com/patterns/perfect-card) et [card-hover-anatomy](https://designmotionhq.com/patterns/card-hover-anatomy) : jamais de `scale` sur la carte
  entière ; rayon de 24 px écarté au profit de `card`.
- [border-radius](https://designmotionhq.com/patterns/border-radius) : seuls `control` et `card` existent, l'échelle de la fiche n'est
  pas reprise.
- [doherty-threshold](https://designmotionhq.com/patterns/doherty-threshold) : seuils du projet (retour sous 100 ms, indicateur au-delà de
  300 ms) au lieu des seuils de 200 ms (doherty-threshold) et 400 ms (optimistic-ui) des
  fiches.
- [undo-ux](https://designmotionhq.com/patterns/undo-ux), [drag-and-drop](https://designmotionhq.com/patterns/drag-and-drop) et [bulk-actions](https://designmotionhq.com/patterns/bulk-actions) : fenêtre d'annulation
  unique de 6 s.
- [toast-notifications](https://designmotionhq.com/patterns/toast-notifications) : durées de 3 s et 6 s conservées ; 5xx et erreur réseau
  jusqu'à fermeture.
- [disabled-buttons](https://designmotionhq.com/patterns/disabled-buttons) : pas de `disabled` pour la validation ni pendant l'envoi (voir [Button](#button)).
- [easing-curves](https://designmotionhq.com/patterns/easing-curves), [shadow-elevation](https://designmotionhq.com/patterns/shadow-elevation) et [depth-layers](https://designmotionhq.com/patterns/depth-layers) : aucune valeur
  reprise, à définir (**Cible : jeton à créer**).
