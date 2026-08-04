---
title: "Testing Strategy"
path: "testing-strategy"
summary: "The baseline Modulus testing strategy — suite boundaries, runtime modes, database isolation, local commands, fixture responsibilities, and the minimum continuous-integration gate."
---

# Testing Strategy

Modulus separates fast, dependency-free unit tests from integration tests that
exercise real PostgreSQL behavior. This is a baseline for the current codebase,
not a promise that today’s package boundaries or test runners will survive the
planned refactor. The durable parts are the suite boundaries, database safety
rules, deterministic fixtures, and the requirement that local and hosted CI run
the same commands.

## Test suites

| Suite | File convention | Runtime | External dependencies |
|---|---|---|---|
| Core unit | `*.test.ts` | Node.js `node:test` through `tsx` | None |
| Core integration | `*.itest.ts` | Node.js `node:test` through `tsx` | PostgreSQL 18 `_test` database |
| App browser unit | `*.test.ts` / `*.test.tsx` | Vitest `jsdom` mode | None |
| App server unit | `*.test.node.ts` / `*.test.node.tsx` | Vitest `node` mode | None |

Core remains on `node:test` during this baseline phase. Moving it to Vitest
would change mechanics without improving the isolation model and would create
avoidable churn before the core refactor. App packages run Vitest explicitly in
both `jsdom` and `node` modes so a server-only test cannot silently execute with
browser globals, and browser tests do not inherit Node-only assumptions.

`pnpm test` runs every unit mode and never starts or modifies a database.
`pnpm test:integration` runs database-backed tests separately and serially.

## Test database lifecycle

Integration tests use a dedicated database on an already-running PostgreSQL 18
server. Locally that server can be the same Docker Compose service used for
development; CI provides an equivalent service container. The database name
must end in `_test`. Both the destructive shell scripts and the TypeScript test
harness enforce that suffix before doing any work.

Set up the local database once:

```sh
cd postgres
./postgres.sh up -d
cd ..

cp packages/core/.env.test.example packages/core/.env.test
pnpm db:init:test
```

`pnpm db:init:test` drops and recreates the configured `_test` database and may
prompt for the PostgreSQL administrator password. It is an explicit reset tool,
not a prerequisite for every run. The ordinary integration command applies all
committed Drizzle migrations idempotently before tests begin.

Each integration test file opens its own pool, applies migrations, and closes
the pool during teardown. Before every test case, the harness discovers and
truncates every user table in `public` with `RESTART IDENTITY CASCADE`; teardown
truncates once more so a completed run does not leave its final fixture behind.
This is self-maintaining as tables are added. Integration files execute serially
because they share one database and a concurrent truncate could erase another
test’s fixtures.

Run the database suite with:

```sh
pnpm test:integration
```

To run one core integration file:

```sh
pnpm --filter @modulus-learning/core test:integration:one \
  src/modules/agent/activity-state/repository/index.itest.ts
```

The compatibility variable `TEST_POSTGRES_CONNECTION_STRING` overrides
`POSTGRES_CONNECTION_STRING` when present, but new local and CI configuration
should use `POSTGRES_CONNECTION_STRING` in `.env.test`.

## Fixtures and test-support code

Shared test code belongs in `packages/core/src/test-support` only when it
represents a stable testing capability used by multiple files:

- database setup, safety checks, truncation, and composed repositories belong
  in the harness;
- small domain builders insert the minimum valid records and return identifiers
  that tests actually use;
- external-service fakes record calls and expose scripted outcomes without
  performing network requests;
- timing and concurrency helpers make ordering explicit rather than relying on
  arbitrary sleeps.

A fixture should describe valid domain state, accept focused overrides, and
avoid assertions. Assertions remain in the test so the behavior under test is
visible. Prefer a local helper when only one file needs it. Do not add a broad
“world” fixture that mirrors the production dependency graph; that would make
tests fragile during the upcoming refactor.

Database integration tests should use real repositories and SQL for the behavior
being verified, while replacing outbound systems such as an LMS or email
provider with narrow fakes. Unit tests should construct explicit configuration
values rather than loading application environment files.

## Local and hosted CI

The complete local gate is:

```sh
pnpm run ci
```

It runs, in order:

1. `pnpm lint:check` — read-only Biome validation of TypeScript sources;
2. `pnpm typecheck`;
3. `pnpm test` — all unit modes;
4. `pnpm test:integration` — serialized PostgreSQL integration tests.

The GitHub Actions workflow calls this same aggregate command on every pull
request and on pushes to `develop` and `main`. Runs for the same ref cancel older
in-flight runs. CI provisions PostgreSQL 18 with a `modulus_test` database and
passes its connection string through the same variable used locally.

The pre-commit hook remains intentionally fast and only formats/checks staged
files. Run `pnpm run ci` before pushing; the hosted workflow is the required merge
gate.

## Baseline limits and next phases

This phase does not introduce coverage thresholds, end-to-end browser tests,
per-test database schemas, or a common runner across every package. Those should
follow observed gaps and the emerging post-refactor architecture.

The initial read-only lint gate covers TypeScript sources. Legacy SVG, HTML, and
CSS assets contain existing Biome findings and remain outside this minimum gate;
they should be corrected and added deliberately rather than making the new CI
workflow fail on unrelated baseline debt.

The next useful improvements are:

1. add unit coverage around the database-name guard and fixture builders;
2. split the test harness’s repository/service composition into smaller domain
   harnesses as core boundaries stabilize;
3. add migration boot and schema-drift checks if committed migrations diverge
   from the Drizzle schema source;
4. introduce HTTP or browser-level tests only for stable public workflows;
5. add coverage reporting after the suite is broad enough that a threshold
   measures regressions rather than initial test-writing progress.

## Where to go next

- [Architecture](./ARCHITECTURE.md) explains the boundaries tests should
  protect without coupling to host-framework details.
- [Core Composition](./CORE-COMPOSITION.md) describes the registry and
  dependency assembly that future domain harnesses may target.
- [Data Model](./DATA-MODEL.md) documents the PostgreSQL entities used by the
  integration fixtures.
