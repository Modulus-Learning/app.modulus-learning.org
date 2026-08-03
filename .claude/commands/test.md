---
name: test
description: Run tests. Pass a file path to run a single test, or no arguments to run all tests.
allowed-tools: Bash
argument-hint: [path/to/file.test.ts]
---

Run tests via Turbo or per-package.

The three packages use **two different test runners** — check which package the
path belongs to before choosing a command.

The test suite is due to be refactored, so treat the table and commands below as
the current state, not a contract: if a `test*` script named here is missing or
has changed, read the owning `package.json` and follow what it actually says.

| Package | Runner | Test files |
|---|---|---|
| `packages/core` | `node:test` via `tsx` (not vitest) | `*.test.ts`, plus `*.itest.ts` integration tests |
| `apps/gradebook` | vitest (jsdom by default, node mode available) | `*.test.ts(x)` |
| `apps/agent` | vitest (node) | `*.test.ts` |

## Single file

If `$ARGUMENTS` includes a file path, run just that file from the owning package:

- `packages/core` — `pnpm -F @modulus-learning/core test:one <path>`
  (wraps `tsx --env-file=.env --test`; core's tests load `packages/core/.env`).
- `apps/gradebook` — `pnpm -F @modulus-learning/gradebook exec vitest run --mode=jsdom <path>`.
  Use `--mode=node` instead for a server-side test.
- `apps/agent` — `pnpm -F @modulus-learning/agent exec vitest run <path>`.

Always use `vitest run` for a one-shot run — a bare `vitest` starts watch mode.

## Everything

If `$ARGUMENTS` is empty, run `pnpm test` from the root (`turbo run test`).

Two cautions:

- `apps/gradebook`'s `test` script is `vitest --mode=jsdom` without `run`, so it
  can drop into watch mode when a TTY is attached. If the run appears to hang,
  fall back to the per-package commands above.
- `pnpm test` does **not** cover `packages/core`'s integration tests. Those are
  `*.itest.ts`, run separately with
  `pnpm -F @modulus-learning/core test:integration`, and they need a running
  Postgres (`postgres/postgres.sh up`) plus `packages/core/.env`.

Report results clearly: pass/fail counts and any failure details.
