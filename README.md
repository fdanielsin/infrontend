# inFrontend

SvelteKit (Svelte 5) web interface of the task manager, built with Bun. It
consumes the `inbackend` API and is available in English, French, German and
Spanish.

## Requirements

- [Bun](https://bun.sh) 1.3 (pinned in the `Dockerfile`)
- The `inbackend` API on `http://localhost:8080`, started with `API_DOCS_ENABLED=true` (needed by
  `api:generate` and `api:check`, which read its contract, and by the end-to-end tests that use a
  real backend, see [`tests/README.md`](./tests/README.md))
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
| `OPENAPI_URL`    | `api:generate`, `api:check`            | no                                | URL of the backend contract. Default: `http://localhost:8080/openapi.yaml`.                                                 |

## Commands

| Command                                                                         | What it does                                                                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `bun run dev`                                                                   | Dev server with hot reload                                                                                      |
| `bun run build` / `bun run preview`                                             | Production build / serve the build                                                                              |
| `bun run verify`                                                                | Format, lint, types, tests with coverage thresholds, build (the CI runs the same)                               |
| `bun run test`                                                                  | Unit and component tests                                                                                        |
| `bun run test:e2e:mocked -- --project=chromium`                                 | End-to-end tests with a mocked API, no backend needed (what the CI runs)                                        |
| `bun run test:e2e -- --project=chromium`                                        | All end-to-end tests; needs the backend on `http://localhost:8080` (see [`tests/README.md`](./tests/README.md)) |
| `docker build --build-arg PUBLIC_API_URL=http://localhost:8080 -t infrontend .` | Build the image (fails without `PUBLIC_API_URL`)                                                                |
| `docker run --rm -p 3000:3000 infrontend`                                       | Run the image on `http://localhost:3000`                                                                        |

In a fresh worktree, give the variable on the command line:
`PUBLIC_API_URL=http://localhost:8080 bun run verify`.

## Documentation

- [Frontend documentation](./docs/README.md): architecture, conventions, API
  contract, decisions
- [Writing tests](./tests/README.md)
- Workspace docs, outside this repository: `../docs/README.md`
