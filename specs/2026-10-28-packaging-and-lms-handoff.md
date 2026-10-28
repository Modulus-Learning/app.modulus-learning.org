# Packaging and LMS Extraction: Handoff

Date: 2026-10-28

Status: Paused. Work is committed on `develop` at `0ceec0a`. This document is
the starting point for the next session.

Document type: Handoff record — where the work stands, where it stops, and what
comes next.

It covers two specifications designed together:
[Modulus Packaging and Distribution](./2026-10-28-modulus-packaging-and-distribution-spec.md)
and [Canvas and LTI Package Extraction](./2026-10-25-canvas-lti-package-extraction-spec.md).
Detailed records:
[LMS Extraction: Characterisation](./2026-10-28-lms-extraction-characterisation.md)
and [LTI Email Account Linking](./2026-10-28-lti-email-account-linking-analysis.md).

## Where We Are

### Packaging

| Increment (packaging spec) | State |
| --- | --- |
| Host spike | Done |
| Core readiness | Done in code: `modulus db init/upgrade/status/adopt`, the `modulus.schema_scripts` ledger with checksums and an advisory lock, the boot-time schema check, `modulus keys generate`. **Not done:** the production image does not apply migrations, and the reference production database has not been adopted (see Before Deploying) |
| Host package extraction | Done: `@modulus-learning/host-tanstack-start`; `apps/gradebook` routes are thin calls into packaged factories and handlers |
| Release machinery | Done: one Changesets `fixed` group at `0.11.0`, `publish-packages.sh`, `scripts/check-packages.sh` (publint, attw), `scripts/packed-install.sh` and its CI job |
| LMS extraction | Staged (below) |
| First prerelease | Not started |
| Stable release | Not started |

The lockstep set is now five packages, all at `0.11.0`, none published yet
except earlier agent versions: `agent`, `core`, `host-tanstack-start`, `lti`,
`lms-canvas`.

### LMS Extraction

| Increment (extraction spec) | State |
| --- | --- |
| Characterisation | Done: 72 tests pin launch, login, tokens, keystore, deep linking, registration and sign-in; nine gaps recorded |
| Boundary preparation | Done: the `LmsAdapter` contract; gaps 1, 2 and 5 fixed |
| Package extraction | **Staged.** `@modulus-learning/lti` (shared vocabulary and the contract) and `@modulus-learning/lms-canvas` (`canvasAdapter()`, AGS client, classifier, quota governor) exist. The host names its adapter: `createModulusFetch(render, { lms: canvasAdapter() })`. The gate's "Canvas passes full conformance" is **not met** — there is no conformance suite |
| Phase B | Not started: launch verification, OIDC request, token exchange and keystore are still in core |
| Installation binding | Not started |

### Review Fixes After Extraction

A review of `6914fa6` found three defects, fixed in `73b528e`..`fc24c5d`:
the production Docker image omitted the new packages (and `.dockerignore`
dropped core's schema scripts); email linking was not atomic; and cached tokens
and score processors survived registration changes. The platform JWKS cache
(gap 6) was fixed with them. Details are in the characterisation record's
Review Fixes section.

### Verification at `0ceec0a`

- `pnpm run ci` passes: lint, typecheck, unit tests (core 272, lms-canvas 67,
  host 459, agent 50, gradebook 6), core integration 122, session HTTP 58,
  package checks for all five tarballs.
- `scripts/packed-install.sh` passes with `FIXTURE_DATABASE_URL` set to a fresh
  `modulus_fixture_test` database, including real core startup.
- A local `docker build` of `_docker/gradebook/production/Dockerfile` succeeds;
  in the image `lti` and core resolve and the server starts. A local image
  `modulus-gradebook:extraction-check` was left behind and can be removed.
- **Not verified:** a Fly deployment, and any launch from a real Canvas
  instance since the extraction.

## Where We Stop

Deliberately left for later:

- The `0.12.0-next.0` prerelease (needs the owner's passkey; run `/release`).
- Phase B, the conformance package, and the installation binding.
- Characterisation gaps 3 (`lti_message_hint` sent as `"undefined"`), 4 (no
  `azp` check for multi-value audiences), 7, 8 and 9 — all assigned to shared
  LTI verification in Phase B.
- The email-linking policy questions in the
  [email linking analysis](./2026-10-28-lti-email-account-linking-analysis.md).
- The licence decision (AGPL-3.0 or MPL-2.0 for the server packages; the agent
  stays MIT), with the project owners.

## Before Deploying `develop`

**Do not deploy `develop` to Fly until the production database is adopted.**
In production the schema check defaults to `enforce`
(`packages/core/src/public/env.ts`), and core initialises at boot in every
deployment mode, so an instance against a database without the ledger exits
and `/routes/elb-status` never reports healthy.

The procedure is in `docs/DEPLOYMENT.md` under Adopting an Existing Database.
The owner's preferred rehearsal: restore a production backup locally, run
`modulus db adopt --through <last applied script>` and `modulus db status`
against it, then repeat on production. The reference production installation
has no real users, so a failed rehearsal is recoverable. Decide at the same
time whether the image or the Fly release command should run
`modulus db upgrade` (the packaging spec's core-readiness gate expects the image
to apply migrations).

## Next Steps, in Order

1. **Adopt the production database** and decide where `db upgrade` runs (above).
   Then deploy `develop` and check a real Canvas launch and a score passback.
2. **Admin unlink for LTI identities** — the first item in the email linking
   analysis; small, and the refused-learner page currently has no remedy behind
   it.
3. **Prerelease `0.12.0-next.0`** of the five packages with `/release`
   (`RELEASE-INSTRUCTIONS.md` is authoritative). The packaging spec's gate is a
   downstream staging installation that boots, migrates and passes real-Canvas
   acceptance.
4. **Conformance package** (`packages/lms-conformance`, private): the behavioural
   suites the extraction spec describes, run against `canvasAdapter()` and the
   synthetic adapter in `packages/core/src/test-support/lms.ts`. This closes
   the package-extraction gate.
5. **Phase B**: move launch verification, the OIDC request, token exchange and
   the keystore behind `@modulus-learning/lti`, fixing gaps 3 and 4 there.
6. **Installation binding**: persist the adapter id and integration-schema
   version, check them at boot, and gate email relinking on them.

## Things the Next Session Should Know

- **Read before acting:** `CLAUDE.md`, then this record, then the
  characterisation record. Byline (`bylinecms.dev`, a sibling repository) is the
  blueprint for packaging and release mechanics.
- **Owner decisions in force:** lockstep releases including the agent; Drizzle
  for development, reviewed SQL scripts in `packages/core/src/database/sql` for
  releases; no Playwright (the Claude in Chrome extension is available for
  browser checks); the published `nitro@3.0.260903-beta`, not the nightly;
  `fixtures/host-minimal` stays; breaking changes are acceptable before the
  first prerelease; scoped email linking.
- **Workflow:** work on `develop`; commit locally with conventional commits and
  no trailers; the owner pushes. Publishing to npm and changing Fly
  configuration need the owner's go-ahead.
- **Build gotcha:** a stale `NODE_ENV=test` in the shell breaks `vite build`;
  run builds with `env -u NODE_ENV`.
- **Testing gotcha:** core and the two LMS packages use `node:test` through
  `tsx`, not vitest. Integration tests need `packages/core/.env.test` and the
  local Postgres (`postgres/postgres.sh up`).
- **Adapter wiring:** the host package depends on `lti` for types only and never
  on `lms-canvas`; core has `lms-canvas` only as a dev dependency, and
  `packages/core/src/lms/boundary.test.ts` fails on a runtime import of it.

## Where to go next

- [LMS Extraction: Characterisation](./2026-10-28-lms-extraction-characterisation.md)
  has the pinned behaviour, gap table, review fixes and remaining scope.
- [LTI Email Account Linking](./2026-10-28-lti-email-account-linking-analysis.md)
  describes the linking policy, what is fixed, and the open decisions.
- [Modulus Packaging and Distribution](./2026-10-28-modulus-packaging-and-distribution-spec.md)
  and [Canvas and LTI Package Extraction](./2026-10-25-canvas-lti-package-extraction-spec.md)
  are the governing specifications.
