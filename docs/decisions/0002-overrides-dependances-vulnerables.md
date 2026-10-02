# 0002 — Overrides pour trois dépendances transitives vulnérables

## Statut

accepted

## Date

2026-10-02

## Décision

`package.json` fixe trois sous-dépendances par `overrides` (lues par `bun install`
et enregistrées dans `bun.lock`), pour que `bun audit --audit-level=moderate`,
commande du job CI « Dependency audit », reste à zéro avis :

| Paquet    | Version fixée | Avis                                                                                                                     | Parent bloquant                                                                                                                                                | Condition de retrait                                                                                                        |
| --------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `devalue` | `5.9.3`       | GHSA-j22f-vq7h-c4qm, GHSA-mcm9-63f2-9j32, GHSA-x5rw-q4pp-hg5g, GHSA-hx4r-w6wj-j8fg, GHSA-4q55-j62x-fr9h (5.9.2 et avant) | `@sveltejs/kit` 2.70.3 et `svelte` 5.57.0, qui acceptent `5.9.3` (`^5.8.1`) mais que le lockfile laissait sur `5.9.2` ; aucun kit 2.x plus récent              | Retirer quand le lockfile résout `devalue` >= 5.9.3 sans override (après une mise à jour de `svelte` ou de `@sveltejs/kit`) |
| `js-yaml` | `4.3.2`       | GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh (4.0.0 à 4.2.x)                                            | `@hey-api/json-schema-ref-parser` 1.4.4 (via `@hey-api/openapi-ts` 0.99.0, tous deux déjà `latest`) épingle `4.2.0` exactement                                 | Retirer quand `@hey-api/json-schema-ref-parser` dépend de `js-yaml` >= 4.3.0                                                |
| `qs`      | `6.16.0`      | GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g, GHSA-q8mj-m7cp-5q26 (6.14.2 à 6.15.3)                                          | `typed-rest-client` 2.3.1 épingle `6.15.1` ; `@stryker-mutator/core` 10.0.0 (`latest`) exige `typed-rest-client` `~2.3.0`, et la 3.x qui corrige est un majeur | Retirer quand `@stryker-mutator/core` embarque un `typed-rest-client` avec `qs` >= 6.16.0                                   |

## Raisons

- Les trois parents ne portent pas encore le correctif, ou ne le résolvent pas
  sans changement de version majeure.
- Un override borné à la plus petite version corrigée garde le changement
  minimal ; `js-yaml` `4.3.2` était déjà résolu pour `openapi-typescript`, il
  n'ajoute donc aucune version.
- `devalue` s'exécute côté serveur et navigateur (sérialisation de SvelteKit et
  de Svelte) ; les deux autres paquets n'interviennent qu'en développement
  (génération de types, tests de mutation).

## Conséquences

- Revérifier la liste à chaque mise à jour de `svelte`, `@sveltejs/kit`,
  `@hey-api/openapi-ts` ou `@stryker-mutator/core` : `bun why <paquet>`, puis
  retirer l'override devenu inutile et sa ligne du tableau.
- Un override qui force une version hors du range d'un parent peut casser ce
  parent : `bun run verify` et `bun run api:check` doivent rester verts.
