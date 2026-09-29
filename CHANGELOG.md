# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `bun run verify` as the single local validation gate.
- Vitest V8 coverage provider.
- Store, component and E2E test coverage for user and task management.

### Changed

- Reorganized `tasks` into its own feature alongside `users`, with
  `loading`/`error` state in a dedicated shared module.
- Standardized commands, CI and deployment on Bun.
- CI checks made blocking (format, lint, types, build, tests, E2E);
  dependency audit and coverage remain informational.
- Centralized and reorganized tests under `tests/` by domain, with explicit
  GIVEN/WHEN/THEN and happy/sad path naming.
- Modularized the `users` feature with a dedicated component and store.
- Documented frontend/backend coordination and the frontend architecture.

### Removed

- Dead code and non-functional tooling: unused `fetchUserTasks`, an empty
  `$lib` placeholder, the inert Husky/lint-staged setup, and an unused
  browser-mode Vitest config.
- Obsolete root files.

### Fixed

- The task checkbox no longer stays visually checked/unchecked after a
  rejected update (Q-01).

## [1.0.0] - 2026-09-17

### Added

- Stats page.

[Unreleased]: https://github.com/fdanielsin/infrontend/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/fdanielsin/infrontend/releases/tag/v1.0.0
