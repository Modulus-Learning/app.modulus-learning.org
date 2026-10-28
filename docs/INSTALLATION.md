---
title: "Installing Modulus in a TanStack Start Host"
path: "installation"
summary: "How to run your own Modulus installation from the published packages inside a TanStack Start application: the packages and the native dependencies your application must declare, the Vite and Nitro configuration, the three entry files, the route files that call packaged route factories, environment variables and keys, creating the database with the modulus command, building and running, and upgrading to a later release."
---

# Installing Modulus in a TanStack Start Host

This guide is for an institution or developer who wants to run their own
Modulus installation — with its own database, LMS registration, keys, and
public pages — rather than use this repository's. Modulus ships as npm packages
that you add to a [TanStack Start](https://tanstack.com/start) application;
your application supplies configuration, branding, and infrastructure, and
upgrades by changing one version number.

This repository's own installation, `apps/gradebook`, is built exactly this
way, and `fixtures/host-minimal` is the smallest host that works. Every example
below is copied from one of them.

## Assumptions

- Node `^22.18.0 || ^24.11.0 || >=26.0.0` and pnpm.
- PostgreSQL 18, with an empty database you can connect to.
- A TanStack Start application. Modulus is tested with the versions the
  reference host pins: `@tanstack/react-start` 1.169.4, `@tanstack/react-router`
  1.170.46, React 19.3.1, Vite 8.3.5, Nitro `3.0.260903-beta`, and Tailwind CSS
  4.3.3.
- You have read [Deployment](./DEPLOYMENT.md), which explains the three
  deployment modes (`DEPLOYMENT_MODE`) that every installation uses.

## The Packages

Modulus publishes one lockstep set: every package carries the same version, and
an installation uses one version for all of them.

| Package | What your application uses it for |
| --- | --- |
| `@modulus-learning/core` | Business logic and data access, behind the `CoreCommands` facade described in [Core Composition](./CORE-COMPOSITION.md). Also provides the `modulus` command for the database, administrators, and keys. |
| `@modulus-learning/host-tanstack-start` | The TanStack Start layer: route factories, server functions, the admin and learner UI, entry helpers, the Vite preset, and styles. |
| `@modulus-learning/agent` | Not used by your application. Activity pages embed it to report progress; see [Agent](./AGENT.md). |

## Recipe

### 1. Install the Packages

Add core and the host package at the same version, the TanStack Start versions
above, and the native packages listed below:

```json
// fixtures/host-minimal/package.json (dependencies, excerpt)
"@google-cloud/recaptcha-enterprise": "^7.3.0",
"@tanstack/react-router": "1.170.46",
"@tanstack/react-start": "1.169.4",
"argon2": "^0.45.1",
"bcrypt": "^6.0.0",
"googleapis": "^188.0.0",
"nitro": "3.0.260903-beta",
"pg": "^8.23.1",
"pino": "^10.4.0",
"react": "19.3.1",
"react-dom": "19.3.1"
```

**Declare the native packages yourself.** The built server keeps `argon2`,
`bcrypt`, `pg`, `pino`, `googleapis`, and `@google-cloud/recaptcha-enterprise`
external and loads them from your application's `node_modules` at runtime; Nitro
does not copy them into `.output`. The host package lists them as peer
dependencies, but pnpm installs peers for the package, not for your application,
so they must appear in your application's own `dependencies`. A missing one
fails at runtime with `Cannot find package`, not at build time.

**Allow their build scripts.** pnpm runs package build scripts only when
allowed. In `pnpm-workspace.yaml`:

```yaml
# fixtures/host-minimal/pnpm-workspace.yaml (excerpt)
allowBuilds:
  esbuild: true
  '@parcel/watcher': true
  '@tailwindcss/oxide': true
  argon2: true
  bcrypt: true
  protobufjs: true
```

`protobufjs` arrives through the Google reCAPTCHA client; without it, the
install stops with `ERR_PNPM_IGNORED_BUILDS`.

### 2. Configure Vite

The host package exports a Vite plugin and a Nitro options helper:

```ts
// fixtures/host-minimal/vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import { modulus, modulusNitroOptions } from '@modulus-learning/host-tanstack-start/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    modulus(),
    nitro(modulusNitroOptions({ preset: 'node' })),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
```

- `modulus()` passes `@modulus-learning/*` through Vite's server-side build, so
  TanStack Start's compiler processes the packaged server functions, and keeps
  the native packages external.
- `modulusNitroOptions()` adds Modulus's eager-boot Nitro plugin, which starts
  the application when the process starts rather than on the first request, and
  keeps React and the native packages external. Pass your own Nitro options
  through it.

You do not import a stylesheet: the packaged root route imports Modulus's
styles, including Tailwind, and the stylesheet tells Tailwind to scan the
packaged components.

### 3. Add the Entry Files

TanStack Start's compiler requires its entry calls to appear literally in your
application, so each entry file is a single call that takes Modulus's options:

```ts
// apps/gradebook/src/server.ts
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { createModulusFetch } from '@modulus-learning/host-tanstack-start/server/entry'

// The lowest app-owned request chokepoint. `createModulusFetch` validates the
// server configuration, starts background jobs where the deployment mode
// allows, installs graceful shutdown, and gates every request by mode.
export default createServerEntry({
  fetch: createModulusFetch((request) => handler.fetch(request)),
})
```

```ts
// apps/gradebook/src/start.ts
import { createStart } from '@tanstack/react-start'

import { modulusStartOptions } from '@modulus-learning/host-tanstack-start/server/start'

// Start's compiler requires a literal `createStart` here; the request
// middleware (CSRF, request kind, flash, CSP) is Modulus's.
export const startInstance = createStart(() => modulusStartOptions())
```

```tsx
// apps/gradebook/src/router.tsx
import { createRouter } from '@tanstack/react-router'

import { modulusRouterOptions } from '@modulus-learning/host-tanstack-start/server/router-options'

import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({ routeTree, ...modulusRouterOptions() })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

`modulusRouterOptions()` supplies the locale rewrite, which keeps English URLs
free of an `/en` prefix, and the per-request Content Security Policy nonce.

### 4. Add the Route Files

TanStack Router builds its route tree from files in `src/routes`, so your
application keeps one file per route. Each file calls a packaged factory with
its own path; the factory supplies the loader, guards, head, and a page
component that loads on demand.

The root route takes the choices that belong to your installation:

```tsx
// apps/gradebook/src/routes/__root.tsx
import { createModulusRootRoute } from '@modulus-learning/host-tanstack-start/routes/__root.route'

// This installation's document choices; the document itself is Modulus's.
export const Route = createModulusRootRoute({
  appTitle: 'Modulus',
  analytics: {
    domain: 'modulus-learning.org',
    src: '/modules/js/script.js',
    api: '/modules/api/event',
  },
})
```

`createModulusRootRoute` also accepts `icons`, the icon `<link>`s; the default
expects `favicon-96x96.png`, `favicon.svg`, `favicon.ico`, and
`apple-touch-icon.png` in your `public/` directory. Omit `analytics` to render no
analytics script.

Every page route follows one pattern — the factory module path mirrors the
route file's path:

```tsx
// apps/gradebook/src/routes/$lng/_admin/admin/_authed/users/index.tsx
import { createRoute } from '@modulus-learning/host-tanstack-start/routes/$lng/_admin/admin/_authed/users/index.route'

export const Route = createRoute('/$lng/_admin/admin/_authed/users/')
```

Server routes — the LTI, agent, OAuth, session, and health endpoints under
`/routes/*` — keep a literal `createFileRoute` and import packaged handlers.
This is required, not a style choice: TanStack Start removes server handlers
from the browser bundle only when they appear in a route file's own
`createFileRoute` call.

```ts
// fixtures/host-minimal/src/routes/routes/elb-status.ts
import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/elb-status'

// A literal createFileRoute with packaged handlers, so Start strips the
// handlers from the client build. The eager-boot plugin requests this route.
export const Route = createFileRoute('/routes/elb-status')({
  server: { handlers },
})
```

The full set of route files is `apps/gradebook/src/routes`. Copy it, then
replace the public pages under `$lng/_public/` — the home, about, and
documentation pages — with your own. Everything else is Modulus's product UI and
should stay as a factory call.

:::warning[Paths Under /routes Are Fixed]
LMS registrations store the LTI URLs (`/routes/lti/login`, `/routes/lti/launch`,
`/routes/lti/jwks`, …), and activity pages call the agent URLs under
`/routes/agent/`. Keep every route file under `src/routes/routes/` at the path the
reference host uses; moving one breaks every LMS registration or agent that
points at it.
:::

### 5. Configure the Environment

`packages/host-tanstack-start/.env.example` lists every variable the host
configuration and core read. Public `VITE_*` values are compiled into the
browser bundle at build time; put them in a committed `.env`. Put everything
secret in your deployment's secret store or a gitignored `.env.local`.

Generate the installation's keys with the `modulus` command from core:

```sh
pnpm exec modulus keys generate > keys.env
```

It prints `API_JWT_PRIVATE_KEY`, `API_JWT_PUBLIC_KEY`, `LTI_JWKS_KEY_ID`,
`LTI_JWKS_PRIVATE_KEY`, `LTI_JWKS_PUBLIC_KEY`, and `SESSION_SECRET` in the
encodings the configuration expects, and writes nothing else. Generate keys once
per installation and keep them stable: LMS registrations hold the LTI key ID and
public key, so a new LTI key breaks them.

Which variables an instance needs depends on its `DEPLOYMENT_MODE`;
`packages/host-tanstack-start/src/config/fixtures/mode-env.ts` is the complete
statement for each mode, and the configuration fails at boot, naming the
setting, when one is missing.

### 6. Create the Database

Point `POSTGRES_CONNECTION_STRING` at the empty database, then:

```sh
pnpm exec modulus db init
pnpm exec modulus admin create --email admin@example.org --given-name Ada
```

`db init` creates the schema from the release baseline, records the shipped
release scripts as applied, and creates the reference roles. `admin create`
prompts for a password without echoing it (or reads one from standard input with
`--password-stdin`) and creates an administrator with the Manager role. Both
commands accept `--database-url` and `--env-file`. The schema commands and what
the boot-time check requires are described in
[Deployment](./DEPLOYMENT.md#database-schema-at-release).

### 7. Build and Run

```sh
pnpm build
node --env-file-if-exists=.env --env-file-if-exists=.env.local .output/server/index.mjs
```

On start, the instance logs one line naming its mode, and
`GET /routes/elb-status` answers `{"status":"okay","mode":"all-in-one","jobs":true}`.
Sign in at `/admin/sign-in` with the administrator from step 6, then register
your LMS as described in [LTI](./LTI.md).

## Upgrading

1. Change every `@modulus-learning/*` dependency to the new version, together.
2. Read the release notes for **Breaking Changes** and **Migrations**.
3. Run `modulus db upgrade` before the new build serves traffic — on Fly, as the
   admin app's `release_command`, described in
   [Deployment](./DEPLOYMENT.md#applying-scripts-on-deploy).
4. Rebuild and deploy.

An enforcing build refuses to start against a database that is missing a release
script it ships, so skipping step 3 fails safely rather than running against the
wrong schema.

## Variations

- **Separate frontend and admin instances.** Build once and run two instances
  with different `DEPLOYMENT_MODE` values; run `db upgrade` and the background
  jobs only on the admin instance. See [Deployment](./DEPLOYMENT.md).
- **An existing database from before the ledger.** Adopt it once with
  `modulus db adopt --through <script>`; see
  [Deployment](./DEPLOYMENT.md#adopting-an-existing-database).
- **A monorepo.** The packages install into a workspace application the same
  way. Keep the `allowBuilds` entries in the workspace's `pnpm-workspace.yaml`.

## Honest Notes & Open Questions

- **Not yet on npm.** `@modulus-learning/core` and
  `@modulus-learning/host-tanstack-start` have not been published; the first
  release will be a prerelease under the `next` dist-tag. Until then,
  `scripts/packed-install.sh` shows the same installation from packed tarballs.
- **No route manifest or doctor yet.** The route set is "copy
  `apps/gradebook/src/routes`". A packaged manifest and a check that reports
  missing or moved route files are planned in
  `specs/2026-10-28-modulus-packaging-and-distribution-spec.md`.
- **Branding is minimal.** The root route takes a title, icons, and analytics.
  The admin and learner chrome still shows the Modulus logo, and colour tokens
  are not yet a documented contract.
- **The LMS adapter will change the composition.** Canvas support currently
  lives inside core. Extracting it into `@modulus-learning/lms-canvas` will make
  the adapter an explicit part of your server configuration — a planned breaking
  change, described in `specs/2026-10-25-canvas-lti-package-extraction-spec.md`.
- **Licensing is under review.** The server packages are AGPL-3.0-only today;
  the project owners are considering MPL-2.0. The agent is MIT. Each
  institution should take its own view on how the licence applies to its
  installation.

## Where to go next

- [Deployment](./DEPLOYMENT.md) explains the deployment modes, the background
  jobs, and how the schema is applied and checked at each release.
- [LTI](./LTI.md) covers registering your LMS and the launch and grade flows your
  installation serves.
- [Agent](./AGENT.md) describes the library activity pages embed to report
  progress to your installation.
- [Security & Privacy](./SECURITY-AND-PRIVACY.md) sets out what your installation
  stores and the privacy boundary between Modulus and activities.
- [Architecture](./ARCHITECTURE.md) explains the design the packages implement.
