# Unit and integration testing strategy + CI baseline — analysis

Date: 2026-08-03
Status: baseline implemented and verified in the working tree; follow-up phases proposed
Related:
- `docs/TESTING.md` — operational guide for the adopted baseline
- `packages/core/src/test-support` — current core integration harness and fixtures
- Byline reference: `packages/db-postgres/src/database`, package Vitest configs,
  test database helpers, and `.github/workflows/ci.yml`

## Question

Which parts of Byline’s unit-test, integration-test, test-database, and CI setup
should Modulus adopt now, given that Modulus is likely to be substantially
refactored, and which parts should remain deliberately lightweight until the new
architecture stabilizes?

The immediate outcome must support the same minimum gate locally, on pushes to
GitHub, and in the new pull-request workflow. It must also make destructive
database operations difficult to aim at development or production data.

## Executive recommendation

Adopt Byline’s **test lifecycle invariants**, but do not copy its runner topology
mechanically.

The durable baseline is:

1. unit tests are database-free and run through `pnpm test`;
2. integration tests use a dedicated database whose name must end in `_test`;
3. the database lives on an already-running PostgreSQL 18 server, either the
   existing local Docker Compose server or a GitHub Actions service container;
4. committed migrations create/advance the test schema;
5. every test starts from empty user tables, discovered dynamically and
   truncated with foreign-key and identity reset;
6. database test files execute serially while sharing one database;
7. app Vitest suites run explicitly in `jsdom` and `node` modes;
8. `pnpm run ci` is the single aggregate command used by developers and GitHub
   Actions.

Keep core on `node:test` for this phase. A Vitest migration would add file churn
without improving the database lifecycle, fixture design, or CI contract. Revisit
runner convergence only after the core refactor defines stable package and domain
boundaries.

## Current-state findings

### Test execution was incomplete at the root

The original root `pnpm test` fanned out only package-level `test` tasks. Core’s
`*.itest.ts` files were intentionally excluded, but there was no root
`test:integration` command. Gradebook’s default `vitest --mode=jsdom` command was
watch-oriented and did not run its `*.test.node.ts` files. Agent always selected
`jsdom` through configuration, with no explicit runtime-mode convention.

Consequences:

- a local “all tests” command did not cover all unit-test environments;
- no single local command matched a future hosted CI gate;
- server-only tests could be misplaced into `jsdom` without a naming signal;
- database integration tests were easy to omit from pre-PR verification.

The explicit modes immediately found one such classification issue: the
gradebook JOSE encryption test failed in `jsdom` because its `Uint8Array` came
from a different realm than the Node/WebCrypto implementation. Both encryption
tests are server tests and now use the `.test.node.ts` convention.

### The existing core harness was capable but expensive and permissive

`packages/core/src/test-support/pg.ts` already provided useful domain-level
composition:

- real Drizzle repositories and transactions;
- service composition over the real database;
- narrow AGS fakes for outbound LMS behavior;
- fixture builders for valid platform, deployment, user, activity, progress,
  and line-item state;
- deterministic async coordination helpers for lock and lease tests.

Those are good foundations. The lifecycle around them had three weaknesses:

1. without `TEST_POSTGRES_CONNECTION_STRING`, every test file started its own
   Testcontainers PostgreSQL instance;
2. every file used `pushSchema` from the live schema instead of applying
   committed migrations, so tests could pass while migration history was stale;
3. truncation used a maintained list of tables, so a new table could leak state
   until somebody remembered to update the harness.

Starting a container and pushing a schema per file made a small serialized suite
more expensive than necessary. It also exercised a different provisioning path
from local development and CI.

### Database scripts only described development

The original `common.sh` sourced `.env`, extracted separate variables, and
hard-coded `modulus_dev`. `db_init.sh` could therefore reset development, but
could not serve as the common implementation for an on-demand `modulus_test`
database. There was no `_test` suffix guard and no `.env.test` wrapper.

The existing Docker Compose file used `postgres:latest`, although current core
queries rely on PostgreSQL 18 `OLD` / `NEW` references in `RETURNING`. An
unbounded image tag could silently raise the local minimum later.

### There was no pull-request gate

The repository contained release and scheduled cleanup workflows, but no CI
workflow for pull requests or pushes to the integration branches. The existing
`pnpm lint` tasks also write changes with Biome, which makes them unsuitable as
a read-only CI assertion.

A root-wide read-only Biome check currently reports unrelated baseline debt in
legacy SVG, HTML, and CSS assets, including missing SVG titles and malformed demo
HTML. Making all of that a prerequisite would produce a red CI baseline unrelated
to the testing work. The initial gate therefore covers TypeScript sources and
records expansion to other assets as follow-up work.

## Byline comparison

| Concern | Original Modulus | Byline reference | Modulus baseline decision |
|---|---|---|---|
| Core runner | `node:test` via `tsx` | Vitest in package-specific modes | Keep `node:test`; copy lifecycle invariants, not runner syntax |
| App environments | Gradebook mostly `jsdom`; agent implicitly `jsdom` | Explicit `node`, `jsdom`, and `integration` modes | Run both app unit modes explicitly and use filename conventions |
| PostgreSQL provider | Testcontainer per integration file unless an override is set | One already-running `_test` database | Use the existing local/CI server and one on-demand `modulus_test` database |
| Schema setup | `pushSchema` from current TypeScript schema | Idempotent committed migrations | Apply committed migrations so CI validates deployable history |
| Cleanup | Hand-maintained table list | Discover every user table and truncate with cascade | Adopt dynamic discovery and `RESTART IDENTITY CASCADE` |
| File concurrency | Node test files serial by command | Vitest files serial with one worker and no isolation | Keep root/package concurrency at one for the shared database |
| Environment | Core `.env` or optional test override | Package `.env.test` | Standardize on package `.env.test`; retain CI/legacy environment override |
| Shell safety | Development DB hard-coded | URL-derived `_dev` / `_test` target with suffix guard | Parse one connection URL and enforce the suffix before destructive work |
| CI | None for PRs | Push + PR workflow with service databases | Add a PostgreSQL 18 workflow calling the same `pnpm run ci` used locally |
| Fixture composition | One broad core harness with useful domain builders | Package-local setup plus focused fixtures | Keep current composition temporarily; split by domain as boundaries stabilize |

## Database-provider decision

### Option A — Testcontainers as the default

Benefits:

- each test process owns an isolated server and database;
- no prior local database initialization is required;
- tests can select an exact image independently of the development stack.

Costs in the current Modulus suite:

- container startup and schema push happen once per integration file;
- Docker socket behavior becomes part of every local and CI test run;
- the path differs from the long-running PostgreSQL instance used by the app;
- a fresh schema push bypasses committed migration history;
- parallel isolation is not being used because the suite is already serial.

### Option B — one dedicated database on an existing server

Benefits:

- low startup cost after the server is running;
- the same connection model works locally and in GitHub Actions;
- Docker Compose and CI pin the actual supported PostgreSQL floor;
- migration history is exercised on every integration invocation;
- creating or resetting `modulus_test` is explicit and inspectable.

Costs:

- developers must start PostgreSQL and initialize the test database once;
- concurrent test runs cannot safely share the same database;
- stale state must be cleaned deterministically after interrupted runs;
- worktrees may eventually need distinct test database names.

### Decision

Use Option B as the baseline. It matches the stated preference, is simpler for
the current serialized suite, and makes local and hosted execution equivalent.
Dynamic truncation handles stale rows from interrupted runs. Testcontainers can
return later as an opt-in isolation mode if parallel worktrees or adapter
conformance testing justify the additional lifecycle.

## Adopted design

### Database safety and lifecycle

`packages/core/.env.test.example` defines the local contract. New configuration
uses `POSTGRES_CONNECTION_STRING`; `TEST_POSTGRES_CONNECTION_STRING` remains a
compatibility override for the TypeScript harness.

`common.sh` now:

- accepts an explicit environment file;
- parses the PostgreSQL connection URL as the source of truth;
- percent-decodes credentials;
- validates role and database identifiers before SQL substitution;
- refuses any database not ending in `_dev` or `_test`.

`db_init_test.sh` is a narrow wrapper over the same guarded `db_init.sh`, using
`.env.test`. `pnpm db:init:test` is intentionally destructive only to the named
test database. Ordinary test runs do not recreate the database; they migrate and
truncate it.

The TypeScript harness independently parses the URL and requires a PostgreSQL
database name ending in `_test`. This second guard is load-bearing: bypassing the
shell wrapper or setting an environment variable directly still cannot point
integration tests at `modulus_dev`.

### Migration and cleanup semantics

Each Node test file is a separate test process. Its `before` hook:

1. loads `.env.test` without overriding an already-defined CI value;
2. checks the `_test` database invariant;
3. opens the file’s pool;
4. applies committed Drizzle migrations idempotently;
5. composes the real repositories and services needed by that file.

Each `beforeEach` truncates all base tables in `public`, excluding the Drizzle
migration ledger, with one `TRUNCATE ... RESTART IDENTITY CASCADE`. The test
file’s `after` hook truncates once more and closes its pool, leaving no final-file
fixture behind. Files remain serial through both the core command and root Turbo
command.

This differs slightly from Byline’s Vitest `globalSetup` / per-file `setupFiles`
mechanics because `node:test` starts separate processes. The observable
invariants are the same: migrate before use, clean state per test boundary, and
no concurrent truncation of shared fixtures.

### Test naming and environments

| Pattern | Meaning |
|---|---|
| `packages/core/**/*.test.ts` | dependency-free Node unit test |
| `packages/core/**/*.itest.ts` | real PostgreSQL integration test |
| `apps/**/*.test.ts(x)` | browser-oriented Vitest test in `jsdom` |
| `apps/**/*.test.node.ts(x)` | server-oriented Vitest test in `node` |

Core unit tests no longer load `.env`; configuration needed by a unit test is an
explicit fixture value. This is a useful boundary to preserve through the
refactor.

### Fixture policy

The current `test-support` folder should evolve by responsibility rather than
grow into a second application composition root:

- keep database lifecycle and safety in one harness module;
- keep record builders small, valid by default, and override-driven;
- keep outbound fakes narrow and call-recording;
- keep assertions in test files;
- prefer file-local helpers until at least two consumers need them;
- split repository/service composition by stable domain when the core refactor
  establishes those domains.

Do not create a universal fixture graph matching every production dependency.
That would maximize refactor churn and make unrelated tests fail when composition
changes.

## CI contract

The root command is:

```sh
pnpm run ci
```

It runs:

1. read-only TypeScript lint (`pnpm lint:check`);
2. workspace typechecking (`pnpm typecheck`);
3. all unit environments (`pnpm test`);
4. serialized PostgreSQL integration tests (`pnpm test:integration`).

`.github/workflows/ci.yml` runs the same command for:

- every pull request;
- pushes to `develop`;
- pushes to `main`.

The job provisions `postgres:18`, creates `modulus_test`, waits for a health
check, installs with the frozen lockfile, and exposes the same connection variable
used by local runs. Workflow concurrency cancels an older in-flight run for the
same ref.

The existing staged-file hook remains fast. Full integration testing on every
local commit would make commits depend on an available database and encourage
developers to bypass the hook. `pnpm run ci` is the pre-push/pre-PR command; hosted
CI is the required merge gate.

## Acceptance criteria and verification

| Criterion | Result |
|---|---|
| One documented local command matches hosted CI | Met: `pnpm run ci` |
| Pull requests and integration-branch pushes are gated | Met: new CI workflow |
| Unit tests cover both Vitest environments | Met: explicit `jsdom` then `node` runs |
| Unit tests do not require PostgreSQL | Met: core unit command no longer loads `.env` |
| Integration tests refuse development-shaped database names | Met and covered by unit tests |
| Local and CI PostgreSQL versions are deterministic | Met: both pin PostgreSQL 18 |
| Test DB can be created on demand on the existing server | Met: `pnpm db:init:test` |
| Committed migrations can build the current test schema | Verified against local PostgreSQL 18 |
| Existing integration behavior remains green | Verified: all 45 integration tests pass |
| Existing unit behavior remains green in correct environments | Verified after reclassifying encryption tests |
| Workspace typechecking remains green | Verified |
| Read-only minimum lint gate is green | Verified for TypeScript sources |

## Risks and mitigations

### Shared database concurrency

A second local integration command can truncate the first run’s fixtures. The
baseline serializes files and root tasks, but cannot coordinate two independent
shells. Document this constraint now. If parallel worktrees become common, add a
derived database name per worktree or a database lease before enabling parallel
runs.

### Migration/schema drift

Switching from `pushSchema` to committed migrations may expose future drift that
the old harness hid. That is intentional. A failing fresh migration should block
CI. Add a separate schema-drift contract only if diagnosing those failures becomes
ambiguous.

### Destructive test reset

`db:init:test` drops the configured database. The shell and TypeScript suffix
guards substantially reduce risk, but a `_test` database may still contain data
someone values. Keep reset explicit and never invoke it automatically from
`pnpm test:integration` or application startup.

### Lint baseline scope

The first CI lint gate excludes non-TypeScript legacy assets with existing
findings. Track those findings as cleanup work, then expand the gate to JSON,
CSS, HTML, and SVG once the baseline is green. Do not silently weaken individual
rules to make the whole repository pass.

### Harness coupling

The current harness constructs several repositories and services even when a
file needs only one. This is acceptable for the baseline but will become costly
if composition changes significantly. The mitigation is phased domain harnesses,
not premature abstraction before the refactor direction is known.

## Follow-up phases

### Phase 1 — broaden test coverage along stable seams

- Add unit tests for fixture builders and outbound fakes where behavior is more
  than simple object construction.
- Add repository integration tests for high-risk authentication, authorization,
  LTI launch, and enrollment mutations as those modules are touched.
- Add regression tests with every production bug fix.
- Keep tests near the implementation until a cross-package contract becomes
  stable enough for a conformance suite.

### Phase 2 — split the core harness after domain boundaries settle

- Extract database lifecycle from repository/service composition.
- Provide small activity-progress, score-submission, auth, and LTI launch
  harnesses only where repeated setup warrants them.
- Keep schema-independent fake builders in separate modules.
- Decide whether `packages/core` is still the correct owner after refactoring.

### Phase 3 — improve parallelism only when measured runtime demands it

- Derive per-worktree or per-process `_test` database names.
- Add a lease/lock if independent processes may share a server.
- Consider a once-per-run migration phase and per-schema isolation.
- Re-evaluate an opt-in Testcontainers mode for adapter or version matrices.

### Phase 4 — add higher-level workflow testing

- Add HTTP integration tests when public transport contracts stabilize.
- Add browser end-to-end tests for a small number of critical LTI/gradebook
  workflows after the host-framework decision is made.
- Keep external LMS calls behind deterministic fakes; reserve live-platform
  smoke tests for a separate, credentialed workflow.

### Phase 5 — coverage and quality reporting

- Add coverage collection only after representative suites exist across the
  major domains.
- Begin with reporting and changed-file visibility before enforcing a global
  percentage.
- Expand the read-only lint gate to legacy web assets after their existing
  findings are fixed.

## Out of scope for this baseline

- migrating core from `node:test` to Vitest;
- coverage thresholds;
- Playwright or full LTI browser automation;
- a live Canvas test environment;
- parallel integration files against one database;
- automatically dropping the test database after each run;
- redesigning the core dependency registry or repository boundaries;
- fixing all pre-existing non-TypeScript lint findings.

## Final recommendation

Treat this work as the test **platform floor**, not the finished test programme.
The database safety invariant, migration-backed setup, deterministic cleanup,
runtime-specific filenames, and shared local/hosted CI command should remain
stable. Grow behavioral coverage around code as it is refactored, and defer
runner consolidation, coverage policy, and broad end-to-end automation until the
new architecture presents stable seams worth protecting.
