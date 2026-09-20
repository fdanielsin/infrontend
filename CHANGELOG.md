# Changelog

## Unreleased

- Workspace documentation now defines how frontend work will be coordinated
  with the backend.
- Standardized frontend commands, CI and deployment configuration on Bun.
- Added the `bun run verify` validation gate.
- Restored format, lint, type, build, test, security, E2E and coverage checks
  in the frontend CI.
- Modularized the users feature with a dedicated component and store.
- Added the Vitest V8 coverage provider.
- Cleaned up obsolete root files and documented the frontend architecture.
- Centralized unit and component tests under the root `tests/` directory.
- Organized tests by domain under `tests/unit/api/` and `tests/unit/stores/`.
- Separated Vitest unit discovery from Playwright E2E discovery.
- Added behavioral store tests for users, tasks and notifications.
- Added a real Playwright happy-path and sad-path flow against `inbackend`.
- Made the CI E2E job start PostgreSQL and `inbackend` before running Chromium.
- Updated GitHub Actions to Checkout v5 on Ubuntu 24.04 to avoid deprecated
  runner warnings.
- Aligned frontend tests with explicit Given/When/Then and happy/sad path
  naming conventions.

## 1.0.0

- Added the stats page.
