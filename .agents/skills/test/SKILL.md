---
name: test
description: Use when asked to run or verify tests in this repository. Run one test when a file path is supplied, or the package test suites when no path is supplied.
---

Run tests via Turbo or per-package.

The workspace uses **two different test runners** — check which package the
path belongs to before choosing a command.

Read the owning `package.json` and test configuration before choosing a command;
they are authoritative if the table changes.

| Package | Runner | Test files |
|---|---|---|
| `packages/core` | `node:test` via `tsx` (not vitest) | `*.test.ts`, plus `*.itest.ts` integration tests |
| `packages/lti`, `packages/lms-canvas` | `node:test` via `tsx` | `*.test.ts` |
| `packages/host-tanstack-start`, `apps/gradebook`, `apps/agent` | vitest (jsdom and node) | `*.test.ts(x)` for jsdom; `*.test.node.ts(x)` for node |

## Single file

If the request includes a file path, run just that file from the owning package:

- `packages/core` — `pnpm -F @modulus-learning/core test:one <path>`
  for unit tests; `test:integration:one <path>` for `*.itest.ts` files.
- `packages/lti` or `packages/lms-canvas` —
  `pnpm -F <package-name> exec tsx --test <path>`.
- Host, gradebook, or agent —
  `pnpm -F <package-name> exec vitest run --mode=jsdom <path>`.
  Use `--mode=node` for a `*.test.node.ts(x)` file.

Paths are relative to the owning package. The `tsx` unit scripts do not load
`.env`. Core integration support loads `.env.test` and preserves CI-provided
environment variables; it refuses databases without the `_test` suffix.

Always use `vitest run` for a one-shot run — a bare `vitest` starts watch mode.

## Everything

If no file path is supplied, run `pnpm test` from the root (`turbo run test`).

All workspace Vitest `test` scripts use `vitest run` and execute both modes.
`pnpm test` does **not** cover core integration tests, gradebook HTTP suites,
or packed installations:

- `pnpm test:integration` needs PostgreSQL 18 and `packages/core/.env.test`
  (copy `.env.test.example` and initialise the test database as in `docs/TESTING.md`).
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
