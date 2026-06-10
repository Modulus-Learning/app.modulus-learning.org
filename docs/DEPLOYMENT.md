---
title: "Deployment Modes"
path: "deployment"
summary: "How a single gradebook build is deployed in one of three runtime modes — all-in-one, frontend-only, or admin-only — via DEPLOYMENT_MODE: what each mode serves, the route surfaces and where they are gated, the background-jobs switch, and the rule that a frontend instance may never run jobs."
---

# Deployment Modes

Modulus is a [single-instance, in-process system](./ARCHITECTURE.md#3-single-instance-no-separate-api-server):
the `apps/gradebook` host calls `initCore` once and holds the result as a
singleton, serving the learner/LTI frontend, the admin backend, and the
background workers from one process and one Postgres database. For a
"right-size" installation that is the whole story — one container, `DEPLOYMENT_MODE`
left at its default, done.

The same build can also be split across separate instances when an operator
wants to isolate the public surface from the administrative one, or scale them
independently. A single environment variable, `DEPLOYMENT_MODE`, selects which
surfaces a given instance serves. **It does not change what is built** — every
instance ships the same code; the mode only gates, at runtime, which routes that
instance will answer.

## The three modes

| Mode | Frontend surface | Admin surface | Background jobs |
| --- | --- | --- | --- |
| **`all-in-one`** (default) | Served | Served | Per `JOB_QUEUE_ENABLED` |
| **`frontend`** | Served | **Blocked (404)** | **Forbidden** — must be off |
| **`admin`** | **Blocked (404)** | Served | Per `JOB_QUEUE_ENABLED` |

- **`all-in-one`** — the default, single-process deployment. Frontend, admin, and
  (if `JOB_QUEUE_ENABLED=true`) the background workers all run together. This is
  the recommended topology for most installations.
- **`frontend`** — serves only the public/learner and LTI surface. The admin
  surface returns 404, and background jobs are forbidden (see
  [The frontend / jobs rule](#the-frontend--jobs-rule)). Intended for
  internet-facing instances that should expose no administrative routes.
- **`admin`** — serves only the administrative surface. All frontend and LTI
  routes return 404. Background jobs run per `JOB_QUEUE_ENABLED`, so this is the
  instance that typically owns grade passback and other worker loops.

Blocked routes return a plain **404 Not Found**, so a single-surface instance
behaves as if the other surface's routes simply do not exist — an admin-only
instance reveals nothing about the learner/LTI surface, and vice versa.

## Configuration

Two environment variables, both read by the host config in
`apps/gradebook/src/config/index.ts`:

| Variable | Values | Default | Purpose |
| --- | --- | --- | --- |
| `DEPLOYMENT_MODE` | `all-in-one` \| `frontend` \| `admin` | `all-in-one` | Which surfaces this instance serves. |
| `JOB_QUEUE_ENABLED` | `true` \| `false` | `true` | Whether this instance starts the background workers. |

Example deployments:

```bash
# All-in-one (single process). Jobs follow JOB_QUEUE_ENABLED.
DEPLOYMENT_MODE=all-in-one
JOB_QUEUE_ENABLED=true

# Frontend-only, internet-facing. Jobs MUST be off.
DEPLOYMENT_MODE=frontend
JOB_QUEUE_ENABLED=false

# Admin-only, runs the workers.
DEPLOYMENT_MODE=admin
JOB_QUEUE_ENABLED=true
```

Configuration is validated at boot by the Zod schema in
`config/index.ts`; an invalid `DEPLOYMENT_MODE`, or an illegal frontend/jobs
combination, fails fast (the process does not start) rather than misbehaving
silently.

## Route surfaces and where they are gated

Every request path is classified into one of three surfaces by the pure,
edge-safe helper in `apps/gradebook/src/lib/deployment-mode.ts`
(`classifyRoute` / `isRouteAllowed`). The classifier strips any leading locale
segment first, so `/admin` and `/es/admin` classify identically.

| Surface | Page routes | API routes (`/routes/*`) |
| --- | --- | --- |
| **Admin** | `/admin/*` | `/routes/admin/*` |
| **Frontend** | the public/learner UI (`/`, `/dashboard`, `/account`, `/sign-in`, `/sign-up`, `/start-activity`, `/about`, `/docs`), and the LTI launch/deep-link pages under `/lti/*` | `/routes/{lti,auth,oauth,agent}/*` |
| **Neutral** | — | `/routes/keep-alive`, `/routes/elb-status` |

**Neutral** routes are health and load-balancer endpoints; they stay reachable
in every mode so that probes succeed regardless of which surface an instance
hosts.

Gating happens in two places, by design:

1. **The proxy (primary gate).** `withDeploymentMode`
   (`src/middleware/withDeploymentMode.ts`) is the first layer in the proxy chain
   (`src/proxy.ts`). It runs ahead of any session, CSP, or i18n work and returns
   404 for any route the current mode does not serve. Because it sits at the top
   level of the chain — above the `isNotApiRoute` filter that skips the UI layers
   for `/routes/*` — it covers **all matched page routes and every `/routes/*`
   API handler**.

2. **Layout guards (defense in depth).** The proxy `matcher` deliberately
   excludes `/lti/*` so the chromeless LTI pages keep their i18n-free handling.
   Those pages are therefore gated by `assertSurfaceServed('frontend')` in
   `src/app/lti/layout.tsx` instead. The admin layout
   (`src/app/[lng]/(admin)/layout.tsx`) carries the matching
   `assertSurfaceServed('admin')` as a backup, so the block stays authoritative
   even for requests (server actions, RSC) that do not traverse the matcher
   identically. The guard helper lives in `src/lib/deployment-mode-guard.ts`.

   Two details make this guard correct: it reads the mode via `getDeploymentMode()`
   (just the `DEPLOYMENT_MODE` env var, not the full secret-bearing config) so it is
   safe during static prerendering; and the `/lti` segment is marked
   `export const dynamic = 'force-dynamic'` so it renders per request — otherwise it
   could be prerendered as static HTML (mode `all-in-one`) and served on an
   admin-only instance, bypassing the gate.

> Note on the matcher: the API route handlers live under `/routes` (not `/api`),
> so they are **not** excluded from the proxy matcher — only `/lti` and static
> assets are. The proxy runs on `/routes/*`; the `isNotApiRoute` filter merely
> skips the *UI* layers for them, while top-level layers like `withDeploymentMode`
> still apply.

## Background jobs

Background work runs in-process. `initCore` returns a `startBackgroundJobs()`
handle (`packages/core/src/core.ts`) that the host invokes from
`apps/gradebook/src/instrumentation.ts` — today this drives the LTI
score-submission worker
(`packages/core/src/workers/score-submission.ts`).

The host only starts the workers when **both** conditions hold:

```ts
const backgroundJobsEnabled =
  config.jobQueue.enabled && config.deployment.mode !== 'frontend'
```

So `JOB_QUEUE_ENABLED` remains the operator's on/off switch, but a `frontend`
instance never starts the workers regardless of its value.

## The frontend / jobs rule

`frontend` mode and background jobs are **mutually exclusive**, and the
constraint is enforced at boot rather than left to convention. The server config
schema in `config/index.ts` carries a `superRefine` that rejects the
combination:

> `DEPLOYMENT_MODE=frontend` requires `JOB_QUEUE_ENABLED=false` (background jobs
> are only run by `admin` or `all-in-one` instances).

Because `JOB_QUEUE_ENABLED` defaults to `true`, a frontend instance must set
`JOB_QUEUE_ENABLED=false` explicitly; otherwise the process fails to start. This
is deliberate — it turns a silent misconfiguration (a public, internet-facing
instance quietly running workers, or an operator's `JOB_QUEUE_ENABLED=true`
being ignored) into an immediate, visible boot failure.

The two-layer treatment is intentional: the `superRefine` makes the bad config
impossible to run, and the derived `backgroundJobsEnabled` check in
`instrumentation.ts` documents and re-enforces the coupling at the call site.

## A note on framework dependency

The gating described here is implemented on **Next.js middleware**. The proxy
(`src/proxy.ts`) is the Next.js 16 global middleware — Next 16 renamed
`middleware.ts` to `proxy.ts` — and the primary deployment-mode gate
(`withDeploymentMode`) is a layer in that chain, with the matcher and its `/lti`
exclusion being Next-specific mechanics. The layout guards
(`assertSurfaceServed`) rely on the Next App Router's `notFound()`.

Core itself has no dependency on any of this: `DEPLOYMENT_MODE`, the route
classifier (`src/lib/deployment-mode.ts`), and the background-jobs coupling are
plain configuration and pure functions. It is only the *enforcement points* —
the middleware chain and the App Router layouts — that are Next-specific.

This matters because a migration to **TanStack Start** is under evaluation (see
[Architecture → Portability](./ARCHITECTURE.md#7-portability-framework-and-deployment)).
That migration would touch the host's request-handling layer — the equivalent of
the proxy chain and the surface guards — but not the mode model itself: the same
three modes, the same surface classification, and the same frontend/jobs rule
would carry over, re-expressed in whatever request lifecycle the new framework
provides. **This document will be updated as that work is considered**, to
describe the gating mechanism in framework-current terms.

---

## Where to go next

- [Architecture](./ARCHITECTURE.md) — the single-instance, in-process model these
  modes split, and the three actor domains (`app`, `admin`, `agent`) that map onto
  the frontend and admin surfaces.
- [Core Composition](./CORE-COMPOSITION.md) — how `initCore` assembles the graph
  and exposes `startBackgroundJobs()`.
- [LTI](./LTI.md) — the launch and score-passback flows that the frontend surface
  and the background workers serve.
