# inFrontend

SvelteKit (Svelte 5) web interface of the task manager, built with Bun. It
consumes the `inbackend` API and is available in English, French, German and
Spanish.

## Requirements

- [Bun](https://bun.sh) 1.3 (pinned in the `Dockerfile`)
- The `inbackend` API on `http://localhost:8080` (only for the end-to-end tests
  that use a real backend, see [`tests/README.md`](./tests/README.md))
- Docker (optional, to build the image)

## Quick start

```bash
bun install
cp .env.example .env.local   # then set PUBLIC_API_URL if the API is elsewhere
bun run dev                  # http://localhost:5173
```

The message module `src/lib/paraglide/` is generated and git-ignored: `dev` and
`build` produce it, `bun run i18n:compile` does it on demand.

## Environment variables

| Variable         | Used by                                | Required                          | Notes                                                                                                                       |
| ---------------- | -------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_API_URL` | `dev`, `build`, `verify`, Docker build | yes (not set in a fresh worktree) | Backend URL, read at build time and baked into the bundle: a running container cannot change it. Example in `.env.example`. |
| `OPENAPI_PATH`   | `api:generate`, `api:check`            | no                                | Path to the backend `openapi.yaml`. Default: `../inbackend/docs/specs/api/openapi.yaml`.                                    |

## Commands

| Command                                                                         | What it does                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `bun run dev`                                                                   | Dev server with hot reload                                                           |
| `bun run build` / `bun run preview`                                             | Production build / serve the build                                                   |
| `bun run verify`                                                                | Format, lint, types, tests with coverage thresholds, build (the CI runs the same)    |
| `bun run test`                                                                  | Unit and component tests                                                             |
| `bun run test:e2e -- --project=chromium`                                        | End-to-end tests (some need the backend, see [`tests/README.md`](./tests/README.md)) |
| `docker build --build-arg PUBLIC_API_URL=http://localhost:8080 -t infrontend .` | Build the image (fails without `PUBLIC_API_URL`)                                     |
| `docker run --rm -p 3000:3000 infrontend`                                       | Run the image on `http://localhost:3000`                                             |

In a fresh worktree, give the variable on the command line:
`PUBLIC_API_URL=http://localhost:8080 bun run verify`.

## Documentation

- [Frontend documentation](./docs/README.md): architecture, conventions, API
  contract, decisions
- [Writing tests](./tests/README.md)
- [Workspace documentation](../docs/README.md)
