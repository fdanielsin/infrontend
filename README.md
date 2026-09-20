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

## Project Structure

```
src/
├── routes/       # File-based routing and screen composition
├── lib/          # API, features, stores, UI and validation
└── app.html      # HTML shell
```

## Documentation

- [Global workspace context](../docs/README.md)
- [Frontend documentation](./docs/README.md)
