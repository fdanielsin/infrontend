# inFrontend - Svelte + SvelteKit + Bun

Modern, full-stack frontend framework with TypeScript, Tailwind CSS, and testing.

## Stack

- **Framework**: SvelteKit (modern, reactive)
- **Language**: TypeScript with strict mode
- **Runtime**: Bun (ultra-fast)
- **Styling**: Tailwind CSS
- **Testing**: Vitest (unit + component tests)
- **Linting**: ESLint + Prettier
- **Dev Server**: Vite (instant HMR)

## Quick Start

```bash
# Install dependencies
bun install

# Run dev server
bun run dev
```

Server runs on `http://localhost:5173`

## Build

```bash
bun run build
bun run preview
```

## Test

```bash
bun run test
```

Les tests de bout en bout nécessitent un backend `inbackend` disponible sur
`http://localhost:8080` :

```bash
bun run test:e2e -- --project=chromium
```

## Vérification complète

```bash
bun run verify
```

Cette commande vérifie le formatage, le lint, le typage, les tests et le build.
La CI ajoute les contrôles de sécurité, E2E et couverture.

## Project Structure

```
src/
├── routes/       # File-based routing and screen composition
├── lib/          # API, features, stores, UI and validation
│   ├── api/      # Shared HTTP client
│   ├── features/ # Feature-specific components and stores
│   └── stores/   # Shared cross-feature state
└── app.html      # HTML shell
```

## Documentation

- [Global workspace context](../docs/README.md)
- [Frontend documentation](./docs/README.md)
