# Documentation frontend

Cette documentation décrit l'architecture et les règles propres à
`infrontend`, l'application SvelteKit du workspace.

## Documents

- [Architecture](./architecture.md)
- [Conventions](./conventions.md)
- [Roadmap](./roadmap.md)
- [Handoff](./handoff.md)
- [Décisions](./decisions/)

## Périmètre actuel

Le frontend est une application SvelteKit unique. Il n'y a pas encore de
monorepo frontend ni de packages partagés entre plusieurs applications.

Le backend reste propriétaire du contrat et des règles métier. Cette
documentation ne remplace pas les contrats partagés dans
[`../../docs/contracts/`](../../docs/contracts/).

## Commandes

Le runtime et le gestionnaire de dépendances du projet sont Bun.

```bash
bun install
bun run verify
bun run check
bun run test
bun run build
```

`bun run verify` est la porte locale complète : formatage, lint, typage, tests
et build. La CI frontend ajoute les contrôles de sécurité, E2E et couverture.
