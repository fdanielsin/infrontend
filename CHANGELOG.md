# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `bun run verify` as the single local validation gate.
- Vitest V8 coverage provider.
- Store, component and E2E test coverage for user and task management.
- `.dockerignore`, and a CI job that builds the Docker image.
- API types generated from the backend contract (openapi-typescript), a
  `contract` CI job that fails on drift, and `bun run mutate` (Stryker).

### Changed

- Reorganized `tasks` into its own feature alongside `users`, with
  `loading`/`error` state in a dedicated shared module.
- Standardized commands, CI and deployment on Bun.
- CI checks made blocking (format, lint with no warnings, types, build, tests
  with coverage thresholds, E2E, Docker build, dependency audit from moderate
  severity).
- The CI runs `bun run verify` once instead of repeating the tests in three
  jobs, and the E2E job uses the backend's Go version.
- The API client calls the backend through openapi-fetch: paths, methods and
  payloads are checked against the contract at compile time.
- A task description is optional, as in the API contract: it can be empty when
  creating a task and can be cleared when editing one.
- Stricter TypeScript (indexed access, exact optional properties, implicit
  returns and overrides, switch fallthrough) and type-aware ESLint on `src` and `tests`.
- The Docker image takes the backend URL as the required `PUBLIC_API_URL`
  build argument and runs as a non-root user.
- Unit tests: tautologies replaced, limits, boundaries and exceptions covered
  (Q-07).
- Centralized and reorganized tests under `tests/` by domain, with explicit
  GIVEN/WHEN/THEN and happy/sad path naming.
- Modularized the `users` feature with a dedicated component and store.
- Documented frontend/backend coordination and the frontend architecture.

### Removed

- The duplicated CI component-tests and coverage jobs, now covered by `bun run verify`.
- The runtime `PUBLIC_API_URL` variable of the Docker image, which had no effect.
- Dead code and non-functional tooling: unused `fetchUserTasks`, an empty
  `$lib` placeholder, the inert Husky/lint-staged setup, and an unused
  browser-mode Vitest config.
- Obsolete root files.

### Fixed

- API errors now show the message sent by the backend instead of `HTTP <code>` (F-01).
- A failure in the users form no longer appears in the tasks form, and the
  reverse (F-02).
- A malformed JSON response is reported as an invalid server response (QM-01).
- Errors are also shown as a temporary notification (QM-02).
- Selecting a user no longer leaves the previous user's tasks editable, and a failed selection leaves no user selected (QM-04, QM-05).
- An error disappears when the next action starts (QM-03).
- The task checkbox no longer stays visually checked/unchecked after a
  rejected update (Q-01).

## [1.0.0] - 2026-09-17

### Added

- Stats page.

[Unreleased]: https://github.com/fdanielsin/infrontend/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/fdanielsin/infrontend/releases/tag/v1.0.0
