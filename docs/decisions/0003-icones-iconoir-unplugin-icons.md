# 0003 — Icônes Iconoir par `unplugin-icons`

## Statut

accepted

## Date

2026-10-08

## Décision

L'interface utilise le jeu d'icônes [Iconoir](https://iconoir.com), chargé par deux
`devDependencies` :

| Paquet                  | Version  | Licence | Rôle                                                                                                   |
| ----------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `unplugin-icons`        | `24.0.0` | MIT     | Plugin Vite : transforme l'import `~icons/iconoir/<nom>` en composant Svelte, à la compilation         |
| `@iconify-json/iconoir` | `1.2.12` | MIT     | Les dessins d'Iconoir 7.12.1 (environ 1 700 icônes) au format Iconify JSON, lus par le plugin au build |

- Configuration : `Icons({ compiler: 'svelte' })` après `sveltekit()` dans `vite.config.ts`, et
  dans `vitest.config.ts` (fichier distinct : sans lui, les tests unitaires et Stryker ne
  résolvent pas `~icons/…`). Types : `import 'unplugin-icons/types/svelte'` dans `src/app.d.ts`.
  `autoInstall` reste désactivé (valeur par défaut) : le plugin ne lance jamais de
  gestionnaire de paquets.
- Une icône ne s'utilise que par `src/lib/ui/Icon.svelte`, qui tient la liste fermée des
  icônes de l'interface (un `import` statique par icône). On n'importe jamais la collection
  entière (`@iconify-json/iconoir`) dans `src/`.
- Le trait est un trait unique de 1,5 px quelle que soit la taille (`vector-effect:
non-scaling-stroke`), voir [design-system.md](../design-system.md#icônes).

## Raisons

- **Pas de paquet Svelte officiel.** La page d'introduction d'Iconoir
  (<https://iconoir.com/docs/introduction>, consultée le 2026-10-08) liste ses bibliothèques :
  React, React Native, Vue, Flutter, Framer, CSS, Swift, et le paquet `iconoir` de fichiers
  SVG. Aucune pour Svelte. `unplugin-icons` est le chemin documenté pour Svelte et SvelteKit
  (<https://github.com/unplugin/unplugin-icons>, README de la version 24.0.0, section SvelteKit).
- **Seules les icônes importées sont embarquées** (« on-demand » dans le README du plugin) :
  chaque `~icons/iconoir/<nom>` est un module virtuel d'un seul dessin. Le test
  `tests/unit/components/icon-bundle.test.ts` le prouve par un vrai build en mémoire : il
  échoue si la collection entière entre dans le code livré.
- **Rendu côté serveur sans changement** : le composant généré est du Svelte ordinaire (rune
  `$props`), son `<svg>` est dans le HTML du serveur et s'hydrate sans désaccord
  (`Icon.server.test.ts`, `Icon.hydration.test.ts`).
- **`devDependencies` seulement** : tout se passe au build ; `adapter-node` embarque ce qui
  s'exécute et le `Dockerfile` ne copie que `build/`. Mesure du lot : aucun fichier de `build/`
  ne contient `unplugin` ni `@iconify`.
- **Licence** : Iconoir est sous licence MIT, « Copyright (c) 2021 Luca Burgio »
  (<https://github.com/iconoir-icons/iconoir/blob/main/LICENSE>) ; le paquet
  `@iconify-json/iconoir` ne livre pas ce fichier mais déclare MIT dans `package.json` et
  `info.json`. Les 14 paquets ajoutés au `bun.lock` sont tous MIT et n'ont aucun script
  d'installation (relu dans `node_modules/*/package.json`). Un fichier d'avis des licences
  tierces sera ajouté quand le frontend sera hébergé ; en attendant, cet ADR conserve l'avis
  de copyright.

## Alternatives écartées

- **Recopier des SVG à la main** (ou importer les fichiers du paquet `iconoir`) : pas de
  dépendance, mais un composant ou un fichier par icône à maintenir, aucun typage du nom, pas
  de mise à jour du jeu. Reste le repli si le plugin devient un problème.
- **Une autre bibliothèque ou un autre jeu d'icônes** : décision de l'utilisateur du
  2026-10-08 de prendre Iconoir ; changer de jeu changerait aussi tout le dessin de
  l'interface.
- **Un paquet Svelte communautaire pour Iconoir** : non officiel, sans garantie de suivi du
  jeu ni de Svelte 5 ; l'outil générique est plus largement utilisé et testé.
- **Composant d'exécution qui lit le JSON dans le navigateur** : embarquerait la collection
  (environ 700 Ko de JSON) ou irait la chercher sur le réseau, ce que la mesure de bundle
  interdit.

## Conséquences

- Ajouter une icône : l'importer dans `Icon.svelte` (`~icons/iconoir/<nom>`, nom cherché sur
  iconoir.com ; un nom inconnu fait échouer le build) et la nommer dans la liste, par ordre
  alphabétique ; voir [design-system.md](../design-system.md#icônes).
- Mettre à jour le jeu : `bun update @iconify-json/iconoir`, puis `bun run verify` (une
  icône supprimée ou renommée par Iconoir fait échouer le build) et un coup d'œil aux
  captures des écrans qui l'utilisent.
- Mettre à jour le plugin : relire le README de la version (compatibilité Vite et Svelte :
  la CI du plugin testait Vite 7 à la version 24.0.0 alors que ce projet est en Vite 8, le
  build, `vite dev`, les tests et les E2E du lot l'ont vérifié) et `bun audit
--audit-level=moderate`.
- Retirer le plugin : retirer `Icons()` des deux configurations, l'import des types, les deux
  dépendances, et remplacer les `import` d'`Icon.svelte` par des SVG locaux ; l'API du
  composant `Icon` ne change pas.
- Les overrides de l'[ADR 0002](./0002-overrides-dependances-vulnerables.md) sont inchangés.
