# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- A call that gets no answer within 10 seconds fails with a translated message instead of
  waiting forever.
- Interface in English, French, German and Spanish: the browser language decides
  on the first visit, then a selector in the header (kept in a cookie set only
  on that choice). API errors are translated from their `error_code`, numbers
  follow the language.
- Translations for the 11 error codes of the contract (types regenerated).
- `bun run verify` as the single local validation gate.
- Vitest V8 coverage provider.
- Store, component and E2E test coverage for user and task management.
- `.dockerignore`, and a CI job that builds the Docker image.
- API types generated from the backend contract (openapi-typescript), a
  `contract` CI job that fails on drift, and `bun run mutate` (Stryker).

### Changed

- Every API response is checked against the contract: a response that does not match
  is reported as an invalid server response instead of being used.
- The statistics page follows the interface language instead of being fixed in
  French.
- Notifications: errors and other messages sit in two persistent live regions
  (alert and status), pause on hover and focus, and have a close button
  (WCAG 2.2.1, 4.1.3). The entry animation respects reduced motion.
- Colors: notifications and the "Add Task" button use darker shades to reach a
  4.5:1 contrast ratio (WCAG 1.4.3).
- Task checkboxes are named by the visible task title instead of a label that
  changed with the checked state.
- E2E tests are never retried in the CI: an unstable test fails and gets fixed.
- Unit tests run in random order (`sequence.shuffle`), locally and in the CI.
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

- Keyboard and screen reader use: focus moves to the edit field, back to the
  task's Edit button when the edit closes, to the task list heading after a
  deletion and to the first invalid field after a failed validation; Escape
  cancels an edit; edit errors are linked to their fields; icon buttons have a
  24 px target; the pages have a `main` landmark, a title and the right
  language (WCAG 2.4.3, 3.1.2, 3.3.1, 2.5.8).
- `bun run verify` works from a fresh checkout: it generates the SvelteKit types
  (with `PUBLIC_API_URL`) before linting.
- Deleting, ticking or editing a task that no longer exists on the server removes
  it from the list with an info notification instead of an error.
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
