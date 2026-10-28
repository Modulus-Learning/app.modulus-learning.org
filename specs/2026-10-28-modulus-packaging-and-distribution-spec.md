# Modulus Packaging and Distribution

Date: 2026-10-28

Status: Direction approved with amendments; implementation starting on
`chore/packaging` with the host spike.

Revision: 2026-10-28, incorporating architectural review. The agent joins the
lockstep set and every package starts at `0.11.0`; the host spike moves first;
migration compatibility, migration locking, and bootstrap behaviour are now
explicit contracts; the packed-install gate is strengthened; host diagnostics
stay out of core; the Nitro alias is a support concern, not a publication
blocker; and licensing records the owners' pending decision.

Document type: Explanation and architectural specification.

Companion: [Canvas and LTI Package Extraction](./2026-10-25-canvas-lti-package-extraction-spec.md).
The two specifications are designed together. This one decides how Modulus is
packaged, versioned, released, and installed; the companion decides where the
LMS boundary sits inside that package set.

This specification proposes packaging the Modulus server, its TanStack Start
host layer, and the selected LMS adapter as published npm packages. A
downstream installation can then add those packages to its own TanStack Start
application, supply its own configuration, branding, and infrastructure, and
operate an independent Modulus instance with its own database and LMS
registration.

Today only `@modulus-learning/agent` is published. Everything else exists only
as the `apps/gradebook` application in this repository, so the only way to run a
second installation is to fork the repository. That does not scale to more than
one installation and makes upgrades a merge exercise rather than a dependency
bump.

## Strategic Outcome

A downstream team should be able to:

1. Create or adopt a TanStack Start application.
2. Install a small, fixed set of `@modulus-learning/*` packages at one version.
3. Add a server configuration file, a Vite preset, a stylesheet import, and a set
   of thin route files that re-export Modulus route factories.
4. Run the published migration command against its own PostgreSQL database.
5. Deploy that application with its own infrastructure, keys, LMS registration,
   and branding.
6. Upgrade by changing one version number and following a published upgrade
   note, without merging upstream source.

The recommended approach is to:

- Follow Byline's proven split: framework-neutral packages (core, shared LTI,
  the LMS adapter) plus one framework-coupled host package,
  `@modulus-learning/host-tanstack-start`, that owns route factories, server
  functions, the admin and learner UI, and server-entry helpers.
- Keep `apps/gradebook` as the private **reference host**: the installation this
  repository deploys, rebuilt to consume the packages only through their public
  exports. It proves the downstream path on every commit.
- Release every published package — the server set and the agent — in
  lockstep through one Changesets `fixed` group, starting at `0.11.0`. Guard
  embedded content with an explicit agent-protocol version, so a server release
  never strands an agent already in activity pages.
- Ship database migrations inside `@modulus-learning/core` with a programmatic
  migrator and a small command-line tool. Migration is an explicit release step,
  never a side effect of serving traffic.
- Publish to the public npm registry under the existing scope, as the agent
  already is. The server licence is an open decision for the project owners;
  the agent stays MIT. Keep every institution-specific artefact in the
  downstream repository, never in this one.
- Defer an interactive installer. Provide a documented starter, a `doctor`
  check, and the reference host as the template.
- Prove the risky host mechanisms first, in a throwaway host installed from
  tarballs, before moving substantial code.
- Be pragmatic about verification. There are no downstream installations yet,
  so breaking changes are acceptable before the first prerelease, and a
  short manual end-to-end checklist may stand in for automation where that is
  cheaper.

Names below are proposals, not existing APIs, unless they cite a current path.

## Current State

The following inventory is based on source at `develop` (`e7a8c24`).

| Area | Today | Obstacle to Downstream Installation |
| --- | --- | --- |
| `@modulus-learning/agent` | Public, published by `./publish-packages.sh`, version `0.11.0`, MIT | None. It is consumed by activity pages, not by hosts |
| `@modulus-learning/core` | `private: true`, version `0.9.1`, builds `dist/` with `tsc` and `tsc-alias`, exports `.` and `./tokens` | Not published. `initCore` defaults `config` to `loadConfig()`, which reads `process.env` directly; `public/tokens.ts` also reads `API_JWT_*` from the environment. Migrations under `src/database/migrations/` are not in `files`. Seeds mix production bootstrap (admin roles and permissions) with development fixtures (users, activities, progress) |
| `apps/gradebook` | `private: true`, ~555 TypeScript files, 73 route files, the only host | All host behaviour — server-function gates, session handling, deployment-mode gate, CSP, LTI and agent HTTP routes, admin and learner UI, translations — is application source, not a dependency |
| Public pages and content | `modules/app/home/*`, `routes/$lng/_public/*`, `content/docs/*` | Mix Modulus product pages (Ximera hero, about, docs) with what a downstream installation would brand itself |
| Styling | Tailwind v4 utility classes in components (no CSS modules), `@infonomic/uikit` | A packaged component tree needs the downstream Tailwind build to scan it, or must ship compiled CSS |
| Vite and Nitro configuration | `apps/gradebook/vite.config.ts` lists native externals, `ssr.noExternal`, a Nitro eager-boot plugin, React externalisation | Every downstream would have to copy and keep this in sync |
| Dependencies | Exact pins for React (`19.3.1`) and TanStack (`1.170.46`/`1.169.4`); Nitro as an `npm:nitro-nightly@…` alias; `argon2`, `bcrypt`, and `bcryptjs` together; `engines` `^18.20.2 \|\| >=20.9.0` against a root of `^22.18.0` | Library packages need peer ranges, not exact application pins. npm aliases are valid in published manifests, but a nightly is a support and stability concern; each release must name a tested Nitro version |
| Database | Drizzle Kit migrations `0000`–`0016` with journal; applied manually via `pnpm drizzle:migrate`; the production image has no migration step | A downstream has no supported way to apply or verify migrations |
| Release | `.changeset/config.json` has an empty `fixed` group; `publish-packages.sh` hard-codes the single agent package | Cannot release a coherent multi-package set |
| Seeds | `src/database/seeds/index.ts` deletes progress, enrollment, activities, activity codes, permissions, and role assignments before rebuilding fixtures | Cannot be run against a live installation; a bootstrap must be a different, non-destructive operation |
| Licence | Root, core, and gradebook are AGPL-3.0; agent is MIT | Packages must declare licence metadata; the owners are considering MPL-2.0 for the server packages |

Two existing constraints shape the host package directly:

- **Server functions must be literal.** Start's compiler only recognises a
  literal `createServerFn(...).handler(...)`, and every server function's first
  middleware is its deployment-mode gate (`apps/gradebook/src/lib/server-fn.ts`,
  enforced by `server-fn-convention.test.node.ts`). Server functions moved into a
  package must still reach that compiler unbundled.
- **Registered URLs are external contracts.** Canvas developer keys and resource
  links store `/routes/lti/*` URLs. Route paths therefore cannot be a downstream
  styling choice.

## Lessons From Byline

The reference is the public [Byline repository](https://github.com/Byline-CMS/bylinecms.dev),
examined at the same pinned revision as the companion specification. These are
precedents, not dependencies.

| Byline Source | Pattern Applied Here |
| --- | --- |
| [`@byline/host-tanstack-start`](https://github.com/Byline-CMS/bylinecms.dev/tree/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/host-tanstack-start) and its [README](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/host-tanstack-start/README.md) | One framework-coupled package holds server functions, request-context resolution, integration glue, the admin shell, route factories, and Vite plugins. Framework-neutral packages stay host-independent |
| [Route re-export files in the webapp](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/apps/webapp/src/routes/_byline/admin/index.tsx) | Each host route file is a two-line re-export of a factory such as `createAdminDashboardRoute('/_byline/admin/')` |
| [`rslib.config.ts`](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/host-tanstack-start/rslib.config.ts) with `bundle: false`, and the webapp's `ssr.noExternal: [/^@byline\//]` | Unbundled ESM keeps literal `createServerFn` calls in `dist/`; the host inlines the scope through Vite so Start's compiler transforms them |
| [Server configuration](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/apps/webapp/byline/server.config.ts) and [server entry](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/apps/webapp/src/server.ts) | The host owns one composition file that imports the chosen adapters and initialises core; the host owns worker lifetime in its server entry |
| [`.changeset/config.json`](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/.changeset/config.json) | Every public package in one `fixed` group; the webapp and conformance packages in `ignore` |
| [`publish-packages.sh`](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/publish-packages.sh) | Read the publish set from `fixed[0]`, `pnpm pack`, refuse a `workspace:` leak, `npm publish` the tarball under passkey 2FA, tag per package, idempotent re-run |
| [`@byline/cli`](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/cli/README.md) | `init`, `setup`, and `doctor`; exact pinning of the database package to the schema baseline; refusal to touch divergent user-owned files |
| [Numbered upgrade SQL](https://github.com/Byline-CMS/bylinecms.dev/tree/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/db-postgres/sql) and the [upgrade guides](https://github.com/Byline-CMS/bylinecms.dev/tree/eeb97629b5c2abdfb27f72e2a301a78c846ada35/docs/01-getting-started) | Each major release has a written upgrade path; schema changes are an explicit operator step |
| [`check-public-exports.mjs`](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/scripts/check-public-exports.mjs) | A reviewed baseline of the public export surface; a new unconsumed export fails the check |

Two Byline choices are deliberately **not** adopted at first:

- **The interactive installer.** Byline's CLI supports many databases, storage
  providers, and scaffold upgrades. Modulus has one database, one host
  framework, and a small number of expected installations. A starter, a
  `doctor` command, and written instructions cost far less and can grow into an
  installer if the number of installations justifies it.
- **Many UI packages.** Byline splits `ui`, `admin`, `i18n`, and the host.
  Modulus has one host framework and a much smaller UI. One host package is
  enough until a second host framework or an independent UI consumer exists.

## Package Set

| Package | Path | Published | Responsibility | Depends On |
| --- | --- | --- | --- | --- |
| `@modulus-learning/core` | `packages/core` | Yes, lockstep | Business logic, data access, `CoreCommands`, migrations, migrator, production bootstrap, and the `modulus` binary for database, administrator, and key commands | `@modulus-learning/lti` for contract types (see companion) |
| `@modulus-learning/lti` | `packages/lti` | Yes, lockstep | Shared LTI protocol mechanics and the LTI-based adapter contract (companion specification) | None internal |
| `@modulus-learning/lms-canvas` | `packages/lms-canvas` | Yes, lockstep | The Canvas adapter (companion specification) | `@modulus-learning/lti` |
| `@modulus-learning/host-tanstack-start` | `packages/host-tanstack-start` | Yes, lockstep | Route factories, server functions and gates, request and session handling, admin and learner UI, server-entry helpers, configuration loader, Vite preset, styles, and host diagnostics | `core` as a dependency; React, TanStack Router/Start, Vite, and Nitro as peers |
| `@modulus-learning/agent` | `apps/agent` | Yes, lockstep | Browser instrumentation for activity pages | None internal |
| `@modulus-learning/lms-conformance` | `packages/lms-conformance` | No | Adapter conformance suites (companion specification) | Private |
| `@modulus-learning/gradebook` | `apps/gradebook` | No | Reference host; this repository's own installation | All published server packages via public exports |

The downstream install is therefore four direct dependencies:
`core`, `host-tanstack-start`, `lms-canvas`, and transitively `lti`. A later
Moodle installation would replace `lms-canvas` with its adapter and change one
import in its server configuration.

### Why the Host Package Is Separate From Core

Core must stay framework-neutral so that the HTTP proxy layer planned in
`docs/DOCUMENTATION-PLAN.md` and any later host can reuse it. Everything that
imports `@tanstack/react-start`, React, or Vite belongs in the host package. The
dependency rule is the one Byline enforces: the host package may import core;
core never imports the host package.

### Why the LMS Adapter Is Not Bundled Into Core or the Host

One installation selects one LMS (companion specification). Bundling Canvas into
core or the host would ship it to a Moodle installation and invite vendor
branches. The adapter is a separate dependency the downstream chooses by
importing it.

## The Host Package

### What Moves Into It

Moved from `apps/gradebook/src`, preserving behaviour and tests:

| Current Source | Package Area |
| --- | --- |
| `lib/server-fn.ts`, `lib/server-fn.server.ts`, `lib/server-fn-guards.ts`, `lib/session/*`, `lib/request-scope.ts`, `lib/deployment-mode.ts`, `lib/csp-policy.ts`, `lib/access-log.ts`, `lib/shutdown.ts`, `lib/entry.ts`, `lib/env-drift.ts` | `integrations/*` and `server/*` |
| `lib/core/instance.ts`, `lib/core/start-adapter.ts`, `core-adapter.ts` | `server/core` — the request-scoped core accessors |
| `config/index.ts` and its tests | `config` — the environment loader (see Configuration Contract) |
| `nitro/eager-boot.ts` | `nitro/eager-boot` — a Nitro plugin the host references by package path |
| `modules/{admin,app,agent,lti}/*` | `modules/*` — page containers, actions, server halves |
| `routes/**` except public marketing pages | `routes/*` — route factories |
| `i18n/*` and `i18n/translations/*` | `i18n` |
| `ui/*` | `ui` |
| `session-http/*` and `contract/*` harnesses | Stay with the reference host as end-to-end suites; the host package keeps unit tests |

Remaining in the reference host, because a downstream replaces them: the home,
about, and documentation pages, `content/docs/*`, Ximera-specific promotional
components, favicons and Open Graph images, email template copy, and the
`.env` values.

The boundary between "Modulus product UI" and "installation branding" must be
explicit. The proposal is that the host package owns every authenticated,
LTI, agent, and form surface, and exposes a small branding contract (site
title, logo component, footer links, colour tokens, default locale) to the
layout. Public marketing pages are entirely the installation's.

### Route Factories

Each host route file becomes a re-export, as in Byline. If the host spike shows
that factories do not work for some route kinds, the fallback is a thin local
`createFileRoute(...)` declaration that imports a packaged handler, loader, or
component. That keeps nearly all of the architecture and costs a few more lines
per file.

```ts
// downstream: src/routes/routes/lti/launch.ts
import { createLtiLaunchRoute } from '@modulus-learning/host-tanstack-start/routes/lti'

export const Route = createLtiLaunchRoute('/routes/lti/launch')
```

The factory owns the handler, middleware, loader, and component. The path
argument exists because TanStack Router's generator requires each file to name
its route. Factories for externally registered paths — `/routes/lti/*`,
`/routes/agent/*`, `/routes/oauth/*`, `/routes/elb-status`, `/routes/keep-alive` —
must validate the supplied path against the fixed path they implement and fail
at build or boot on a mismatch. A downstream cannot accidentally move the LTI
launch URL.

The reference host's 73 route files make the list concrete. A route manifest
exported by the host package (`@modulus-learning/host-tanstack-start/routes/manifest`)
lists every required file, its path, and its factory. The host package's
diagnostic compares the downstream's `src/routes` against it and reports missing
or divergent files. This replaces Byline's installer for the route-sync problem
at a fraction of the cost.

Diagnostics follow the package boundary. Core's `modulus` binary owns database,
administrator, and key commands and has no knowledge of TanStack. Route-file,
Vite, and stylesheet checks belong to the host package, exposed as its own
command (for example `modulus-host doctor`). Core's `modulus doctor` may run a
host diagnostic only when one is supplied explicitly; core never depends on the
host package.

Before committing to factories for server-only routes (`server.handlers`
routes under `/routes/*`), verify that Start's route generator and compiler
accept a factory-returned route in that position. Byline's factories cover page
routes; Modulus's server routes are a new case.

### Server Functions Inside a Package

The host package is built as unbundled ESM — `tsc` with `tsc-alias`, matching
core, or `rslib` with `bundle: false`, matching Byline — so each
`createServerFn(...)` call survives unchanged in `dist/`. The downstream's Vite
configuration inlines `/^@modulus-learning\//` through SSR (`ssr.noExternal`)
so Start's compiler sees and transforms them, exactly as Byline's webapp does
for `@byline/*`.

This mechanism is plausible but unproven here. `ssr.noExternal` controls SSR
externalisation; it does not by itself establish that Start's client-side
transformation replaces packaged handlers with RPC stubs. The host spike must
invoke a packaged server function from the browser and inspect the client
output for server code before any substantial move.

The convention test that every server function's first middleware is a gate
moves into the host package and scans the package's own source. The reference
host keeps a test that scans its remaining server functions. `*.server.ts`
modules loaded by dynamic `import()` keep working because the output is not
bundled.

### Vite Preset

The host package exports one plugin that applies the configuration every
installation needs:

```ts
// downstream: vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

import { modulus, modulusNitroOptions } from '@modulus-learning/host-tanstack-start/vite'

export default defineConfig({
  plugins: [
    modulus(), // ssr.noExternal for the scope, native externals, optimizeDeps exclusions
    nitro(modulusNitroOptions({ preset: 'node' })), // eager-boot plugin, React and native externals
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
```

`modulus()` owns the native-externals list currently in
`apps/gradebook/vite.config.ts`. `modulusNitroOptions` merges the downstream's
Nitro options with the eager-boot plugin path and the React externalisation that
prevents two React instances during SSR.

### Styles

Components use Tailwind v4 utilities. The host package ships a stylesheet entry
that declares its own sources, so the downstream adds one import:

```css
/* downstream: src/ui/styles/app.css */
@import 'tailwindcss';
@import '@modulus-learning/host-tanstack-start/styles.css';
```

The package stylesheet uses `@source` relative to itself to scan the package's
`dist/`, and imports the `@infonomic/uikit` styles it depends on. Theme tokens
are CSS custom properties the downstream may override. Shipping precompiled CSS
is the alternative if `@source` across `node_modules` proves unreliable in
production builds; decide during the host-package spike.

## What a Downstream Installation Owns

```text
downstream-modulus/
  package.json            @modulus-learning/{core,host-tanstack-start,lms-canvas} at one version
  modulus/
    server.config.ts      composition: configuration, LMS adapter, branding
  src/
    server.ts             createModulusServerEntry(...) from the host package
    start.ts              createModulusStart(...) from the host package
    router.tsx
    routes/               thin re-exports of Modulus route factories, plus own public pages
    ui/styles/app.css     Tailwind entry importing the Modulus stylesheet
  public/                 favicons, logo, robots.txt
  email-templates/        installation copy for the three transactional emails
  vite.config.ts
  Dockerfile, fly.toml    or the institution's own deployment target
```

The composition file is the one place the installation chooses behaviour:

```ts
// downstream: modulus/server.config.ts
import { defineModulusServer } from '@modulus-learning/host-tanstack-start/server'
import { loadModulusConfigFromEnv } from '@modulus-learning/host-tanstack-start/config'
import { canvasAdapter } from '@modulus-learning/lms-canvas'

export default defineModulusServer({
  config: loadModulusConfigFromEnv(),
  lms: canvasAdapter(),
  branding: { siteTitle: 'Modulus', defaultLocale: 'en' },
})
```

`defineModulusServer` calls `initCore` once per process with an explicit
configuration and the injected adapter, and registers the instance for the
request accessors. The server entry decides whether background jobs run, using
the existing `DEPLOYMENT_MODE` rules; a `frontend` instance still refuses
`JOB_QUEUE_ENABLED=true`.

The reference host in this repository is written exactly this way. Its source
may import only public `@modulus-learning/*` exports — never `@/` paths into
another package or a `dist/` file — and a lint rule enforces it.

## Configuration Contract

Published library code receives configuration as arguments. It does not read
`process.env`.

- `initCore` requires `config`. The current default of `loadConfig()` moves out
  of core's main entry. Core keeps `configSchema` and exports a typed
  `Config`.
- `public/tokens.ts` takes its verifier configuration as an argument instead of
  reading `API_JWT_*`.
- The host package exports `loadModulusConfigFromEnv()`, the single
  environment-to-configuration mapping, built from today's
  `apps/gradebook/src/config/index.ts`. A downstream that prefers a secrets
  manager can construct the object itself.
- Environment variable names read by that loader are a published contract.
  Renaming or removing one is a breaking change that needs a compatibility
  alias for at least one minor release and an upgrade note.
- Public (`VITE_*`) values stay in the downstream's committed `.env`; secrets
  stay in deployment secrets, as `CLAUDE.md` already requires for this
  repository.
- `email.templateDirectory` resolves relative to the downstream application.
  The host package ships default templates; the downstream may override them
  file by file.

## Database and Migrations

Core remains the only owner of the schema, as the companion specification
requires. Packaging adds distribution and operation of that schema.

### Shipping Migrations

Add `src/database/migrations/**` (SQL files and the `meta/` journal) to core's
published `files`, resolved at runtime relative to `import.meta.url`. Core
exports a migrator built on Drizzle's runtime migrator, so a downstream needs
`drizzle-orm` (already a dependency) but not `drizzle-kit`:

```ts
import { migrate } from '@modulus-learning/core/migrate'

await migrate({ connectionString: process.env.POSTGRES_CONNECTION_STRING })
```

The `modulus` binary exposes the same operation for release pipelines:

```sh
pnpm exec modulus db migrate     # apply pending migrations
pnpm exec modulus db status      # applied, pending, and unknown migrations
```

### Operating Migrations

- Migration is an explicit release step, run once per deployment before the new
  build serves traffic — for example a Fly `release_command` on the admin
  application. It is never run implicitly by a frontend instance on boot.
- The migrator takes a PostgreSQL advisory lock for its whole run, so two
  release steps or two instances cannot apply migrations concurrently.
- Applied migrations are immutable. The migrator and the boot check compare the
  hash of every migration the build ships with the hash recorded in the
  database, and refuse on any difference.
- An upgrade is rehearsed from the previous release before publication: restore
  a database migrated by the previous release with representative data, apply
  the new migrations, boot, and check that the data survives.

### Migration Compatibility Contract

An older build cannot read migration files that exist only in a newer package,
so compatibility metadata must live in the database, written by the newer
migrator, in a form the older build already understands.

- Each build carries an integer **schema epoch** and the ordered list of
  migration hashes it ships.
- Core owns a small `modulus_schema_state` table holding the current epoch and a
  **reader floor**: the lowest epoch that may still serve against this database.
- A migration that older builds can safely run against declares that in core
  source; the migrator then raises the epoch and leaves the reader floor
  unchanged. Any other migration raises both, to the new epoch.
- At boot, core checks:

| Database State | Result |
| --- | --- |
| Every applied migration is known to the build and their hashes match; none pending | Start |
| Migrations pending | Refuse; run `modulus db migrate` |
| Unknown applied migrations, and the build's epoch is at least the reader floor | Start; this is the rollback window |
| Unknown applied migrations, and the build's epoch is below the reader floor | Refuse |
| Known migration with a different hash, missing state table, or unreadable state | Refuse |

  Unknown states are always rejected.
- This is the database-level counterpart of the companion specification's
  integration-schema version check. Each release note records both, with the
  Drizzle migrations they cover.
- Migrations are additive within a major version. A migration that drops,
  renames, or rewrites data the previous minor release reads is a major-version
  change with an upgrade note.
- Downstream installations do not add tables to core's schema or core's journal.
  Installation-specific persistence, if ever needed, uses a separate schema and
  its own journal; that is out of scope here.

### Bootstrap Versus Fixtures

Split `src/database/seeds/` into production bootstrap (admin roles,
permissions, and a first administrator created from explicit input) and
development fixtures (sample users, activity codes, activities, enrollment,
progress). The split must change behaviour, not just move files. The current
entry point deletes data before rebuilding fixtures. The bootstrap must be
repeatable and non-destructive: it inserts missing roles and permissions,
leaves existing rows untouched, and refuses to create an administrator that
already exists. Only the bootstrap ships:

```sh
pnpm exec modulus admin create --email <address>   # prompts for a password
```

The development fixtures stay in the repository for the reference host and
tests.

### Keys

`apps/gradebook/make-keys.txt` records how keys are generated today. Replace it
with `modulus keys generate`, which prints the JWT signing pair, the LTI JWKS
pair with a new key ID, and the session secret in the encodings the
configuration loader expects. Keys are generated per installation; none ship.

## Versioning and Compatibility

### Lockstep Server Packages

Put `core`, `lti`, `lms-canvas`, `host-tanstack-start`, and `agent` in one
Changesets `fixed` group. Ignore `gradebook`, `lms-conformance`, and the agent
demos. Every package starts at `0.11.0`, the agent's current version, and the
root `VERSION` file used for image tags follows the same number. A downstream
installs one version number, and every package at that version was built and
tested together.

Inside the group, use `workspace:*` so `pnpm pack` writes exact versions. The
host package's dependency on core is therefore exact, and the downstream cannot
assemble an untested pair through ordinary installs. Core additionally checks
at boot that the injected adapter reports a compatible LMS contract version and
fails clearly if it does not; this catches a hand-pinned mismatch or a
duplicated package in a monorepo.

### The Agent in the Lockstep Set

Lockstep includes the agent. One version number across everything is simpler
to release, document, and reason about, and Byline makes the same choice for its
analytics agent. The cost is that the agent's version moves on server-only
releases. Content authors who pin the agent see version bumps with no agent
change. The changelog says so, and the agent-protocol version below tells them
whether an update is needed.

The agent is embedded in activity pages released on Ximera's schedule, so the
package version cannot be the compatibility signal. Add an explicit
**agent-protocol version** to the server's agent endpoints:

- Existing agents send no protocol marker. The server treats them as an
  explicit legacy version and keeps accepting them; adding negotiation must not
  strand embedded content.
- Each release states which protocol versions it accepts. Dropping one is a
  breaking change.

Because Changesets prerelease mode applies to the whole repository, a stable
agent fix cannot be published while the server packages are in prerelease. In
lockstep that is acceptable: an urgent agent fix during a prerelease cycle is
published from a short-lived branch cut from the last stable release tag, which
exits prerelease mode on that branch only. The publisher takes the dist-tag
explicitly (`latest` or `next`), never inferring it.

### Peer Ranges

The host package declares React, React DOM, TanStack Router, TanStack Start,
Vite, and Nitro as peers with tested ranges, and records the exact versions the
reference host runs as the tested combination in each release note. The
reference host keeps its exact pins. The `nitro-nightly` alias is valid in a
published manifest, but each release must name the Nitro version it was tested
with. Prefer a published Nitro release as soon as one supports the features
in use.

### What Counts as Breaking

| Surface | Breaking Change |
| --- | --- |
| `CoreCommands` and core's public exports | Removed or changed command, changed result shape |
| Host package exports | Removed factory, changed factory signature, changed branding contract |
| Externally registered paths | Any change to `/routes/lti/*`, `/routes/agent/*`, `/routes/oauth/*`; these break registered LMS and OAuth configurations |
| Configuration | Removed or renamed environment variable without an alias |
| Database | A migration that is not backward compatible with the previous minor release |
| Cookies and sessions | Renamed cookies or changed token formats that sign out every user |
| Agent protocol | Server stops accepting an agent version it previously accepted |
| Integration-schema version | Any change requiring a stop-and-drain rollout (companion specification) |

Before 1.0, minor releases may break; each such release carries an upgrade
note. Until the first downstream installation exists, breaking changes need no
compatibility aliases. After 1.0, these are major-version changes. Each major has an upgrade
guide in `docs/`, following Byline's `docs/01-getting-started/` pattern.

### Pre-Release Channel

Use Changesets prerelease mode (`pnpm changeset pre enter next`) to publish
prereleases of the whole lockstep set under the `next` dist-tag. A first
downstream installation should run a prerelease in staging, and the stable
release should be promoted only after that installation's LMS acceptance
passes.

## Release Process

### Changesets

```json
{
  "fixed": [
    [
      "@modulus-learning/core",
      "@modulus-learning/lti",
      "@modulus-learning/lms-canvas",
      "@modulus-learning/host-tanstack-start",
      "@modulus-learning/agent"
    ]
  ],
  "ignore": ["@modulus-learning/gradebook", "@modulus-learning/lms-conformance"]
}
```

The existing `baseBranch: "main"` and `access: "public"` remain. Core and
gradebook are `0.9.1` and the agent is `0.11.0`; the first lockstep release
moves every published package to `0.11.0`.

### Publish Script

Generalise `publish-packages.sh` from Byline's multi-package script, which this
repository's single-package script was adapted from:

- Read the lockstep set from `fixed[0]`, mapping names across both `packages/*`
  and `apps/*`.
- Keep the existing guarantees: build, `pnpm pack`, refuse a `workspace:` leak,
  `npm publish <tarball>` for passkey 2FA, per-package tags, idempotent re-run,
  `--dry-run`, `--no-build`, and `--yes`.
- Require the dist-tag explicitly (`--tag latest` or `--tag next`) and refuse a
  prerelease version under `latest`.
- Publish in dependency order — `agent`, `lti`, `lms-canvas`, `core`, then
  `host-tanstack-start` — so a partially completed run never leaves a published
  package whose dependency is missing.
- Create an umbrella `v<version>` tag for the set, as Byline does.

Update `RELEASE-INSTRUCTIONS.md` and the `/release` skill to match. Publishing
remains local until an npm automation token or trusted publishing is
configured; that also means npm provenance attestations are unavailable for
now, which is worth recording in the release notes.

### Package Hygiene

Every published manifest needs `license` (the owners' decision for the server
set; `MIT` for the agent), `repository.directory`, `files`, `publishConfig.access`,
`engines` aligned with the root (`^22.18.0 || ^24.11.0 || >=26.0.0`), accurate
`sideEffects` (the host package's CSS is a side effect), and an explicit
`exports` map with `types` first. `tsc-alias` must rewrite `@/` aliases in
`.d.ts` files as well as JavaScript, or downstream type checking fails on
unresolvable paths.

### CI Gates

Add to `pnpm run ci`:

| Gate | Purpose |
| --- | --- |
| `publint` and `@arethetypeswrong/cli` on each packed tarball | Exports map, types resolution, and `files` are correct for consumers |
| Public-export baseline, adapted from Byline's `check-public-exports.mjs` | New public surface is a reviewed decision |
| Reference-host import rule | The reference host imports only public package exports |
| **Packed-install smoke test** | Pack every published package, install the tarballs into a clean minimal host fixture outside the workspace, build it, and run the checks below |

The smoke test must prove:

- Fresh installation: migrations apply to an empty `modulus_test`, the
  bootstrap runs twice without error or data change, and the host boots in
  `all-in-one`, `frontend`, and `admin` modes.
- Upgrade: a database migrated and populated by the previous release upgrades,
  boots, and retains its data.
- Deployment-mode gates: routes and server functions outside a mode's surfaces
  are denied in each mode, and a `frontend` instance never starts workers.
- Client isolation: built browser assets contain no server configuration,
  keys, core implementation, or adapter code.
- Canvas: the packed `lms-canvas` adapter handles a launch, deep link, and score
  publication against controlled protocol fixtures. A synthetic adapter alone
  leaves the packaged Canvas code untested.
- Basic flows: sign-in, an LTI launch, and an agent token exchange succeed.

Real Canvas acceptance stays a separate, installation-level check. Where a
check is expensive to automate early — upgrade-from-previous-release before
there is a previous published release, for example — a short manual checklist
recorded in the pull request is acceptable until automation is worth its
cost.

The packed-install test is the gate that matters most. Workspace linking hides
missing `files` entries, undeclared dependencies, and alias leaks; only an
install from tarballs proves what a downstream will receive. Extend root
`lint:check`, which enumerates source directories explicitly, to cover each new
package.

## Distribution Channel and Licensing

Publish to the public npm registry under `@modulus-learning`, as the agent
already is. The repository is public, so a private registry adds operational
cost — tokens in every downstream pipeline — without concealing anything.

The server packages are AGPL-3.0 today. The maintainers prefer MPL-2.0 and will
take that to the project owners; the agent stays MIT either way. The licence is
an adoption decision for each installation's institution, and packaging does
not resolve it. Under AGPL, an operator who modifies the packages and offers
the result over a network must offer those users the modified source; MPL-2.0
would limit source obligations to modified package files. Whatever the outcome,
keep downstream changes to configuration, branding, and content where possible,
and upstream functional changes instead of patching packages locally. Set each
manifest's `license` field once the decision is made.

Each downstream installation lives in its own repository, which may be private.
Institution-specific hostnames, LMS client and deployment IDs, keys, branding
assets that are not public, and deployment plans belong there, never in this
repository, its issues, or its release notes.

## Relationship to the LMS Extraction

Packaging changes the extraction in specific ways, recorded as revisions in the
companion specification: the new packages are published rather than private;
the downstream's composition file is where the adapter is selected; core's
dependency on the shared LTI package is declared for consumers; LTI HTTP
handling moves into the host package; and adapter compatibility is checked at
boot as well as the integration-schema version.

The two efforts conflict in one place. If the first downstream release ships
before the extraction, core's composition API will change again when the
adapter becomes a required `initCore` input, and Canvas behaviour now inside
core will become part of core's published surface.

**Sequence:**

1. The host spike, proving the risky host mechanisms from installed tarballs.
2. Packaging foundations that do not depend on the LMS boundary: explicit
   configuration, shipped migrations with locking and the compatibility
   contract, the non-destructive bootstrap, host package extraction, the
   reference host on public exports, and the packed-install smoke test. Nothing
   is published as stable.
3. The LMS extraction from the companion specification, producing `lti` and
   `lms-canvas`.
4. A prerelease of the complete lockstep set under the `next` dist-tag,
   installed by the first downstream installation in staging.
5. A stable release after that installation's real-Canvas acceptance.

Stable publication waits for the extraction.

## Delivery Increments and Review Gates

These are reviewable increments, not an approved task breakdown.

| Increment | Deliverable | Gate Before Proceeding |
| --- | --- | --- |
| Host spike | In a throwaway host installed from tarballs, prove a packaged literal server function invoked from the browser, a packaged server-only route under `/routes/*`, a packaged page route factory, the Tailwind `@source` stylesheet, and the Nitro eager-boot plugin | Each works in `vite dev` and a production build; the client output contains no packaged server code; or a fallback (local `createFileRoute` with packaged handlers, compiled CSS) is chosen |
| Core readiness | Explicit `initCore` configuration; tokens without `process.env`; migrations in `files`; locked, checksummed migrator and `modulus db` commands; schema epoch and reader floor; non-destructive bootstrap; `modulus keys generate` | Core's tests and integration suite pass; the production image applies migrations through the new command |
| Host package extraction | Move host code; reference host rewritten as re-exports and a composition file; route manifest and host diagnostic | Session and contract suites pass unchanged against the reference host; convention tests pass in both places |
| Release machinery | One `fixed` group at `0.11.0` including the agent, generalised publish script, hygiene fields, CI gates including the packed-install smoke test | Dry-run publish of the full set is clean; smoke test passes |
| LMS extraction | Companion specification increments | Companion gates, plus the smoke test exercising packed `lms-canvas` against protocol fixtures |
| First prerelease | `next` dist-tag; starter documentation; upgrade-note template | A downstream staging installation boots, migrates, and passes real-Canvas acceptance |
| Stable release | Promote the prerelease | The downstream's acceptance and the reference host's production deployment both run the same version |

## Completion Criteria

Packaging is complete when:

- The lockstep set, including the agent, can be published by one documented
  local procedure, and a dry run verifies every tarball.
- A host outside this repository, installed only from published tarballs,
  builds, migrates, boots in `all-in-one`, `frontend`, and `admin` modes, and
  passes the smoke test in CI.
- The reference host imports only public exports and runs this repository's
  production deployment.
- No published package reads environment variables except through the host
  package's explicit loader, and no published package contains keys,
  institution data, or development fixtures.
- Registered LTI, agent, and OAuth paths cannot be relocated by a downstream.
- The starter documentation, configuration reference, and upgrade-note template
  exist in `docs/`.

## Trade-Offs and Alternatives

**Fork the repository per installation.** No packaging work, but every upgrade
is a merge, institution changes drift from upstream, and the public repository
risks receiving institution data. Rejected for more than one installation.

**Distribute a container image instead of packages.** The reference host could
be published as an image configured entirely by environment variables. That is
simpler for an installation that wants no customisation, and it remains a
reasonable later artefact built from the reference host. It does not let an
installation own its public pages, branding, authentication providers, or
deployment pipeline without forking, which is the requirement here.

**One package containing everything.** Fewer manifests, but it would force
Canvas onto every installation and couple core to TanStack Start, undoing the
framework-neutral core that `docs/ARCHITECTURE.md` describes.

**TanStack virtual file routes instead of re-export files.** A package could
contribute route configuration programmatically, removing the 73 small files.
It ties the downstream to Modulus's route tree for its own routes too and is
less transparent than files the downstream can read. Byline chose re-export
files; follow it, and revisit if route-file maintenance becomes a real cost.

**Port Byline's installer now.** Valuable at scale, expensive to build and
maintain. A route manifest and `doctor` cover the drift problem for a handful
of installations.

**Private registry.** Hides nothing in a public AGPL repository and adds token
management to every downstream pipeline.

## Honest Notes & Open Questions

- **Resolved: first version.** Every published package, including the agent,
  starts at `0.11.0` in lockstep; `VERSION` follows.
- **Resolved: sequence.** Host spike, packaging foundations, LMS extraction,
  complete prerelease, then stable.
- **Branding contract.** Start with title, logo, colour tokens, footer and
  support links, locale, and email-template overrides; refine as the host
  extraction shows what the layout actually needs. Public pages stay
  downstream-owned.
- **Public pages.** Decide whether the host package ships optional factories for
  a minimal home and documentation page, or whether these are always the
  installation's.
- **Optional authentication features.** Google and GitHub sign-in and reCAPTCHA
  become optional host features. A disabled feature requires no credentials and
  exposes no working entry point. Social sign-in is distinct from the agent's
  OAuth-style token flow, which is always present.
- **Licence.** Owners to decide between AGPL-3.0 and MPL-2.0 for the server
  packages; the agent stays MIT.
- **Password hashing dependencies.** `argon2`, `bcrypt`, and `bcryptjs` all appear
  in the gradebook. Establish which are needed for existing hashes before
  declaring native dependencies a downstream must build.
- **Server-route factories.** Unverified until the host spike; see Route
  Factories for the fallback.
- **Agent-protocol versioning.** Choose the version carrier (a header, a token
  claim, or the agent endpoint path) and the support window; unmarked agents
  are the legacy version.
- **Documentation.** `docs/DEPLOYMENT.md` describes this repository's Fly.io
  deployment. A downstream needs an installation guide, a configuration
  reference, and upgrade notes; plan these with the writing-docs standard.

No package creation, publication, or runtime change is authorised by the
existence of this draft alone.

## Where to go next

- [Canvas and LTI Package Extraction](./2026-10-25-canvas-lti-package-extraction-spec.md)
  defines the LMS boundary inside this package set.
- [Architecture](../docs/ARCHITECTURE.md) explains the framework-neutral core
  boundary the host package depends on.
- [Core Composition](../docs/CORE-COMPOSITION.md) describes `initCore`, the typed
  registry, and the commands facade that downstream composition calls.
- [Deployment](../docs/DEPLOYMENT.md) describes deployment modes and the
  frontend/admin split each installation inherits.
- [Data Model](../docs/DATA-MODEL.md) describes the schema and migrations that
  core ships.
- [Testing Strategy](../docs/TESTING.md) describes the suites the packed-install
  smoke test builds on.
- [Release Instructions](../RELEASE-INSTRUCTIONS.md) describes the current
  single-package release that this specification generalises.
