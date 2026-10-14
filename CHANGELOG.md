# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

**À vérifier avant de mettre à jour (de 1.3.0 vers 1.4.0)**

- Le build échoue si `PUBLIC_API_URL` manque ou n'est pas une URL http(s) (image Docker comprise :
  l'argument `PUBLIC_API_URL` est obligatoire).
- La nouvelle Content-Security-Policy n'autorise des appels qu'à l'origine de l'API
  (`PUBLIC_API_URL`) : toute autre adresse appelée par la page est bloquée.
- `E2E_PORT` et `OPENAPI_URL` sont obligatoires pour les scripts (`api:generate`, `api:check`,
  `test:e2e:mocked`, `test:e2e:backend`) : il n'y a plus de backend par défaut, et `test:e2e` est
  remplacé par `test:e2e:mocked` et `test:e2e:backend`.
- Le front 1.4.0 exige un backend 1.3.0 ou plus (suppression et renommage d'un utilisateur,
  `DELETE /users/{id}` et `PUT /users/{id}`) : mettre à jour le backend d'abord.

### Added

- A user can be deleted with all their tasks, behind a 6-second "Undo" that pauses while the page
  is hidden, and renamed in place (the e-mail stays fixed); a failed deletion puts the user back
  with "We couldn't delete the user." (infrontend#87).
- The task list can be filtered to the tasks to do or the done ones, in the browser; the choice is
  remembered, the count in the title stays right, and an empty filter says so (infrontend#77).
- The site sends a Content-Security-Policy (scripts and styles from itself only, calls only to the
  API origin, no framing), `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`;
  the build now fails when `PUBLIC_API_URL` is missing or not an http(s) URL (infrontend#81).
- The lint refuses imports that break the direction of the dependencies (ui, features, state,
  api and routes), and contract types or `$env` read outside their place.
- A "Skip to main content" link is the first stop of every page for keyboard users, in the four
  languages (infrontend#70).
- The task list title says what is left ("4 to do of 12", "All done") instead of the total
  (visual review).
- Fields are checked when they are left: an error shows at blur and follows each keystroke until
  it is fixed, a valid field shows a green check, and a field only tabbed through stays neutral
  (infrontend#76).
- A design system guide documents the tokens, components, patterns and content rules of the
  interface (`docs/design-system.md`) (infrontend#45).
- The design system guide now holds the rules of all 76 reference pattern sheets: rules for
  today's interface, target rules marked as such, and a section of patterns to apply when a
  new component type is added (`docs/design-system.md`) (infrontend#46).
- Icons come from Iconoir through one `Icon` component: sizes of 16, 20 and 24 px, a single
  1.5 px stroke, always hidden from assistive technology (infrontend#53).
- A toast can carry an action button and a close callback (pressed, dismissed or expired), for
  an "Undo" on a deletion; no visible change yet (infrontend#54).
- Deleting a task is now undoable: the row leaves at once, a toast offers "Undo" for 6 seconds,
  and the deletion is sent when it ends, when another user is selected or when the page is left
  (infrontend#58).

### Changed

- The generated API types follow the contract's new user update (`PUT /users/{id}`) and delete
  (`DELETE /users/{id}`) operations; no change at run time (infrontend#86).
- `test:e2e` is removed: `test:e2e:mocked` (mocked API) and the new `test:e2e:backend` (real test
  backend) replace it. `E2E_PORT` and `OPENAPI_URL` are now required (no default backend for
  `api:generate` and `api:check`), and the scripts refuse `:8080` and `:5173`, plus `:8081` for the
  real E2E tests, which write data.
- The generated API types follow the contract's new `GET /` and `HEAD /` summary
  (`ApiSummaryResponse`); no change at run time (infrontend#83).
- The generated API types follow the contract's new 400 answer of the task update (invalid body,
  validation error or invalid id); no change at run time (infrontend#80).
- At most three toasts are shown at once, the others wait their turn (an undo window never
  waits); each toast type has its own left edge, and the close cross is a 44 px target on touch
  screens (infrontend#70).
- The empty lists of users and tasks and the empty statistics page get an icon; a task row under
  the pointer gets a stronger fill and an underlined "Edit"; the statistics tiles no longer lift
  on hover, since they cannot be clicked (visual review).
- Emoji are replaced by Iconoir icons; buttons and links get an icon beside their text, toasts
  one per type, field errors an icon with the message, and the description field says it is
  optional (infrontend#63).
- The cross of the close and delete buttons is an Iconoir icon with a 1.5 px stroke
  (infrontend#53).
- The user list is a card of its own; a whole row is clickable, shows a chevron, and the selected
  user is marked by a fill, a bar and a check instead of a ring that looked like the keyboard
  focus (infrontend#51).
- A task description is cut at three lines with a "Show more" button; while a task is edited,
  its checkbox and delete button are disabled and the title field grows with its text; row
  actions are 44 px on touch screens (infrontend#51).
- Choosing a user on a narrow screen scrolls to the task list; empty lists say what to do next
  (infrontend#51).
- An error toast for a server error (5xx), a network failure or a malformed answer now stays
  until it is closed, so that its reference can be copied; the same error is shown once; other
  errors still leave after 6 s (infrontend#57).
- One accent color: "Add Task" and "Save" are blue like "Create User"; secondary actions
  ("Cancel", "Retry", "Copy") share one outlined style; the information toast is neutral grey
  (infrontend#61).
- The statistics page uses the layout of the home page (left-aligned title, same language
  switcher and link row), the totals of the summary are gone and the average is a third
  tile (infrontend#61).
- A deletion that finds the task already gone on the server no longer shows "Task already
  deleted" (the task is out of the list, as the user asked) (infrontend#58).

### Fixed

- A deletion pending when the page closes now reaches the server on Firefox, for tasks too: it is
  sent as a plain `fetch` with `keepalive`, which Firefox dropped from a copied request
  (infrontend#87).
- A task created while the same user is selected again is no longer listed twice when the
  answer to its creation arrives after the reload of the list (infrontend#78).
- The e-mail check applies the server's rule: an international address such as
  `ivan@пример.рф` is accepted, and an address the server refuses (a hyphen at the end of a
  label, a part longer than allowed) is refused before the request is sent (infrontend#74).
- Without a selected user, the task panel is an empty state (icon, title, instruction); the
  statistics tiles use the width of the page content; a task checkbox has a 44 px touch target on
  touch screens (visual review 5, 13, 30) (infrontend#66).
- The Create User, Add Task and Save buttons are no longer disabled while a request runs: they
  stay focused and marked busy, a second press is ignored, and a list loading no longer greys
  them out. An empty required field now shows the interface's message in the chosen language
  instead of the browser's own bubble (infrontend#65).
- A long name, e-mail, title or description without spaces no longer widens the page or
  overlaps the panels; the page background covers the whole page; on a narrow screen the task
  actions move under the text and the page margins shrink (infrontend#47).
- The statistics page no longer shows "Loading…" forever during an outage: it says it waits for
  the service, offers "Retry" after a failure and invites to create a user when there is
  nothing to count (infrontend#50).
- A "Title is required" error, a draft or a task being edited no longer follows to another
  selected user (infrontend#50).
- Server errors are worded for people ("Something went wrong on our side. Please try again in a
  moment.") instead of "Internal server error" and "Database unavailable" (infrontend#50).
- Changing the sort order, moving a task row or changing the language no longer shows a toast
  that covers the list actions; screen readers still get the news, in a hidden live region, and
  the language announcement is written in the new language (visual review 28, 42) (infrontend#52).
- A failed request is shown once, as a toast with its reference, no longer also in a red box in
  the form; an e-mail already in use is shown under the e-mail field (visual review 23) (infrontend#62).
- During an outage the user list no longer claims "Users (0) / No users yet": it says it waits
  for the service, or offers "Retry" after a failure (visual review 25) (infrontend#62).
- Error messages are worded for people in the four languages instead of "Failed to fetch users"
  or "Unknown error"; the creation errors say the entries are kept (visual review 24) (infrontend#62).

## [1.3.0] - 2026-10-08

### Added

- A banner tells the user when the service is unavailable, retries by itself (5 s up to 60 s)
  and has a "Retry" button; lists load only once the service is ready and reload when it is
  back (infrontend#40).
- The page footer shows the API version (infrontend#40).
- An error toast shows the server reference (`X-Request-Id`) of a 5xx answer with a "Copy"
  button (infrontend#40).
- The task list can be sorted by creation order, title (A to Z, numbers and accents handled
  in the language of the page) or status; the choice is remembered in the browser and
  announced to screen readers (infrontend#41).

### Fixed

- A long title without spaces no longer makes the task list wider than a narrow screen
  (infrontend#41).

### Security

- `cookie` is pinned to 0.7.0, which fixes GHSA-pxg6-pf52-xh8x (out-of-bounds characters in cookie
  attributes, low) (infrontend#42).

## [1.2.0] - 2026-10-06

### Changed

- The CI runs the mocked E2E on Chromium, Firefox and WebKit (infrontend#34).
- Mutation testing runs again; a separate CI workflow runs it on changes to tested code and fails
  below an 85 % score (infrontend#33).
- Keyboard E2E pass on Firefox and on WebKit for macOS (Option+Tab, end of page, scrolling stack)
  (infrontend#34).
- The keyboard E2E catch a focus trap that returns the focus after Tab (Chromium, WebKit), and no
  longer fail at random on Firefox because of its late native scroll (infrontend#35).

### Fixed

- The notification stack is a landmark only while it shows a notification (infrontend#35).
- A close button focused with Tab is scrolled fully into the notification stack (Firefox on Linux
  clipped it); the stack is a named region (`Notifications`, translated in the four languages)
  (infrontend#34).

### Security

- `source-map-js` is pinned to 1.2.2, which fixes GHSA-68fv-2mgg-jv7q (denial of service, high);
  the dependency audit is green again (infrontend#36).

## [1.1.0] - 2026-10-04

### Added

- A versioned pre-push hook refuses any push to `main` unless `RELEASE_TAG` names a tag on the
  pushed commit; `bun install` enables it.
- Form fields refuse text longer than the server accepts (name 100, email 254, title 200,
  description 2000 characters, counted like the server) with a translated message, and
  trim their value before sending.
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

- The API contract is read over HTTP (`OPENAPI_URL`, default `http://localhost:8080/openapi.yaml`) by
  `api:generate` and `api:check`. The CI no longer contacts the backend: its E2E job runs only the
  tests that mock the API (`bun run test:e2e:mocked`); the contract check and the E2E that need a
  backend (`tests/e2e/backend/`) run locally before each merge. Workflow actions moved to their
  latest major version (#29).
- One visible focus outline (2 px, 3:1 or more) on every control, and one error color (4.5:1 or more), through design tokens; an invalid field also gets a red border. Toasts sit at the bottom and the page reserves their room, so that they never cover the focused control (WCAG 2.4.7, 2.4.11, 1.4.3, 1.4.11). The statistics error uses the same banner as the forms.
- Translations proofread as a native speaker would (fr-FR, de-DE, es-ES): no-break space before ":" in French, "…" for ellipses, shorter and clearer error messages ("Invalid request", "Resource not found").
- A name of one character is accepted, as the contract allows (the form required two).
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

- `OPENAPI_PATH` (replaced by `OPENAPI_URL`), the CI backend clone and its SSH deploy key, and the CI contract job.
- The duplicated CI component-tests and coverage jobs, now covered by `bun run verify`.
- The runtime `PUBLIC_API_URL` variable of the Docker image, which had no effect.
- Dead code and non-functional tooling: unused `fetchUserTasks`, an empty
  `$lib` placeholder, the inert Husky/lint-staged setup, and an unused
  browser-mode Vitest config.
- Obsolete root files.

### Fixed

- The mocked E2E run against a production build and no longer fail when the dev server reloads the
  page (#30).
- Text fields, text areas and the language selector have a visible border (3:1 or more
  against their surroundings and their fill, WCAG 1.4.11) (#27).
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

### Security

- Dependencies patched against 11 advisories (6 high, 5 moderate) in `devalue`, `js-yaml`
  and `qs`, pinned by `overrides` until their parents follow
  (`docs/decisions/0002-overrides-dependances-vulnerables.md`) (#28).

## [1.0.0] - 2026-09-17

### Added

- Stats page.

[Unreleased]: https://github.com/fdanielsin/infrontend/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/fdanielsin/infrontend/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/fdanielsin/infrontend/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/fdanielsin/infrontend/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/fdanielsin/infrontend/releases/tag/v1.0.0
