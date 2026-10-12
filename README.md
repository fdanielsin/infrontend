# inFrontend

SvelteKit (Svelte 5) web interface of the task manager, built with Bun. It
consumes the `inbackend` API and is available in English, French, German and
Spanish.

## Requirements

- [Bun](https://bun.sh) 1.3 (pinned in the `Dockerfile`)
- The `inbackend` API of `develop` on `http://localhost:8081`, which serves the contract that
  `api:generate` and `api:check` read; the end-to-end tests that use a real backend need a test
  backend of their own (see [`tests/README.md`](./tests/README.md)). Never the API on `:8080`, which
  belongs to the user.
- Docker (optional, to build the image)

## Quick start

```bash
bun install
cp .env.example .env.local   # then set PUBLIC_API_URL if the API is elsewhere
bun run dev -- --port <port of your worktree>   # see docs/workflow.md "Ports" of the workspace
```

The message module `src/lib/paraglide/` is generated and git-ignored: `dev` and
`build` produce it, `bun run i18n:compile` does it on demand.

## Git hooks

The repository versions one hook, `.githooks/pre-push`: it refuses any push to `main` unless
`RELEASE_TAG` names a tag on the pushed commit. `bun install` enables it (its `prepare` script runs
`git config core.hooksPath .githooks`, and does nothing where `git` or the repository is absent,
such as in the Docker build); to enable it by hand, run that command. `git push --no-verify` skips
it: the hook is a local guard, not a protection of `main`.

Release: open a pull request `develop` to `main` (a merge on GitHub does not go through the hook);
once the CI is green and QA accepts, tag the head commit of that pull request locally, push that
commit to `main` with its full refname, then push the tag.

```bash
git tag v1.1.0 <sha>
RELEASE_TAG=v1.1.0 git push origin <sha>:refs/heads/main
git push origin v1.1.0
```

## Environment variables

| Variable         | Used by                                                    | Required                          | Notes                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_API_URL` | `dev`, `build`, `verify`, `test:e2e:backend`, Docker build | yes (not set in a fresh worktree) | Backend URL, read at build time and baked into the bundle: a running container cannot change it. Its origin is also the only external address the Content-Security-Policy allows (`connect-src`), so the build fails if it is missing or not an http(s) URL. `test:e2e:backend` builds the app too, and takes the URL of the test backend. Example in `.env.example`. |
| `OPENAPI_URL`    | `api:generate`, `api:check`                                | yes                               | URL of the backend contract, for instance `http://localhost:8081/openapi.yaml`. No default: the scripts refuse to run without it, and refuse `:8080` and `:5173`.                                                                                                                                                                                                     |

## Commands

| Command                                                                          | What it does                                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bun run dev`                                                                    | Dev server with hot reload                                                                                        |
| `bun run build` / `bun run preview`                                              | Production build / serve the build                                                                                |
| `bun run verify`                                                                 | Format, lint, types, tests with coverage thresholds, build (the CI runs the same)                                 |
| `bun run test`                                                                   | Unit and component tests                                                                                          |
| `bun run test:e2e:mocked -- --project=chromium`                                  | End-to-end tests with a mocked API, no backend needed (what the CI runs)                                          |
| `PUBLIC_API_URL=http://localhost:<test port> bun run test:e2e:backend`           | End-to-end tests with a real test backend, never `:8080` nor `:8081` (see [`tests/README.md`](./tests/README.md)) |
| `docker build --build-arg PUBLIC_API_URL=http://localhost:59999 -t infrontend .` | Build the image (fails without `PUBLIC_API_URL`)                                                                  |
| `docker run --rm -p 3000:3000 infrontend`                                        | Run the image on `http://localhost:3000`                                                                          |

In a fresh worktree, give the variable on the command line:
`PUBLIC_API_URL=http://localhost:59999 bun run verify`. Without a call to a real backend
(`verify`, `test`, `test:e2e:mocked`), any URL works;
the lint fails when the variable is unset.

## Documentation

- [Frontend documentation](./docs/README.md): architecture, conventions, API
  contract, decisions
- [Writing tests](./tests/README.md)
- Workspace docs, outside this repository: `../docs/README.md`
