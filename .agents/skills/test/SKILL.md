---
name: test
description: Use when asked to run or verify tests in this repository. Run one test when a file path is supplied, or the package test suites when no path is supplied.
---

Run tests via Turbo or per-package.

Every package uses **Vitest**, but in different modes — check which package
the path belongs to, and its file name, before choosing a command.

Read the owning `package.json` and test configuration before choosing a command;
they are authoritative if the table changes.

| Package | Runner | Test files |
|---|---|---|
| `packages/core` | vitest `--mode=node` (unit), `--mode=integration` (database) | `*.test.node.ts`; integration tests in `src/**/tests/*.test.ts` |
| `packages/lms-canvas` | vitest `--mode=node` | `*.test.node.ts` |
| `packages/lti` | none | no tests |
| `packages/host-tanstack-start`, `apps/gradebook`, `apps/agent` | vitest (jsdom and node) | `*.test.ts(x)` for jsdom; `*.test.node.ts(x)` for node |

## Single file

If the request includes a file path, run just that file from the owning package:

- `packages/core` — `pnpm -F @modulus-learning/core test:one <path>`
  for a `*.test.node.ts` file; `test:integration:one <path>` for a file under
  `src/**/tests/`.
- `packages/lms-canvas` —
  `pnpm -F @modulus-learning/lms-canvas exec vitest run --mode=node <path>`.
- Host, gradebook, or agent —
  `pnpm -F <package-name> exec vitest run --mode=jsdom <path>`.
  Use `--mode=node` for a `*.test.node.ts(x)` file.

Paths are relative to the owning package. Unit runs do not load `.env`. Core's
integration mode loads `.env.test` in its global and per-file setup, preserves
CI-provided environment variables, and refuses databases without the `_test`
suffix.

Always use `vitest run` for a one-shot run — a bare `vitest` starts watch mode.

## Everything

If no file path is supplied, run `pnpm test` from the root (`turbo run test`).

All workspace Vitest `test` scripts use `vitest run`. Packages with browser
code execute both the `jsdom` and `node` modes; core and the Canvas adapter run
`node` only.
`pnpm test` does **not** cover core integration tests, gradebook HTTP suites,
or packed installations:

- `pnpm test:integration` needs PostgreSQL 18 and `packages/core/.env.test`
  (copy `.env.test.example` and initialise the test database as in `docs/22-testing.md`).
- `pnpm test:session` builds the gradebook and runs its session HTTP suite
  against the `_test` database.
- `pnpm -F @modulus-learning/gradebook test:contract` tests a server you start;
  configure `CONTRACT_BASE_URL` and `CONTRACT_MODE`.
- `pnpm run ci` runs the main CI job, including integration, session, and
  package checks. GitHub also runs `pnpm test:packed` with
  `FIXTURE_DATABASE_URL` set to a fresh, empty `*_test` database. Run both to
  reproduce all hosted CI coverage.
- `pnpm test:release` (also part of `pnpm run ci`) checks publishing guards and
  SQL immutability in temporary repositories with mocked npm/pnpm commands;
  it never publishes to npm or contacts GitHub.

Report results clearly: pass/fail counts and any failure details.
