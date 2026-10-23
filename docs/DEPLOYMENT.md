---
title: "Deployment Modes"
path: "deployment"
summary: "How a single gradebook build is deployed in one of three runtime modes — all-in-one, frontend-only, or admin-only — via DEPLOYMENT_MODE: what each mode serves, the route surfaces and the two points where they are gated, the background-jobs switch, graceful shutdown and the deadline chain around it, the LTI launch-interstitial switch, and the rule that a frontend instance may never run jobs."
---

# Deployment Modes

Modulus is a [single-instance, in-process system](./ARCHITECTURE.md#3-single-instance-no-separate-api-server):
the `apps/gradebook` host — a [TanStack Start](https://tanstack.com/start)
application served by Nitro's Node server — calls `initCore` once and holds the
result as a runtime service registry serving the learner/LTI frontend, the admin
backend, and the background workers from one process and one Postgres database.
For a "right-size" installation that is the whole story — one container,
`DEPLOYMENT_MODE` left at its default, done.

The same build can also be split across separate instances when an operator
wants to isolate the public surface from the administrative one, or scale them
independently. A single environment variable, `DEPLOYMENT_MODE`, selects which
surfaces a given instance serves. **It does not change what is built** — every
instance ships the same code; the mode only gates, at runtime, which routes that
instance will answer.

## The Three Modes

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

Three environment variables, all read by the host config in
`apps/gradebook/src/config/index.ts`:

| Variable | Values | Default | Purpose |
| --- | --- | --- | --- |
| `DEPLOYMENT_MODE` | `all-in-one` \| `frontend` \| `admin` | `all-in-one` | Which surfaces this instance serves. |
| `JOB_QUEUE_ENABLED` | `true` \| `false` | `true` | Whether this instance starts the background workers. |
| `LTI_LAUNCH_INTERSTITIAL` | `never` \| `always` | `never` | Whether a verified LTI launch shows the interstitial before the activity. |
| `SHUTDOWN_DRAIN_SECONDS` | integer | `70` | Hard deadline for the shutdown drain on an instance that runs jobs (see [Graceful Shutdown](#graceful-shutdown)). |

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
`config/index.ts`; an invalid `DEPLOYMENT_MODE`, an invalid
`LTI_LAUNCH_INTERSTITIAL`, or an illegal frontend/jobs combination, fails fast
(the process exits) rather than misbehaving silently.

The schema is also **mode-aware**: settings that only one surface uses — the
learner and admin cookie names, the API and reCAPTCHA settings, OAuth, the LTI
host settings — are required only on an instance that serves that surface. On
any other instance they are not validated, and reading one throws, naming the
setting and the mode. `apps/gradebook/src/config/fixtures/mode-env.ts` is the
single statement of the environment each mode needs; the Fly tomls follow it.

### Boot

Nitro loads the application lazily, on its first request. So that configuration
is validated and background jobs start when the process starts — not when the
first visitor arrives — a Nitro runtime plugin
(`apps/gradebook/src/nitro/eager-boot.ts`) sends one internal request through the
app at startup. In production a failed boot exits the process, so the supervisor
restarts it instead of serving errors. The boot logs one line naming the
instance:

```json
{"mode":"admin","jobs":true,"surfaces":["admin"],"msg":"gradebook starting"}
```

`GET /routes/elb-status` reports the same facts to a load balancer or an
operator: `{"status":"okay","mode":"admin","jobs":true}`.

## Launch Interstitial

`LTI_LAUNCH_INTERSTITIAL` decides what a learner sees between clicking an
assignment link in the LMS and arriving at the activity. It affects only the LTI
resource-link launch path; the direct `/start-activity` path is unaffected.

| Value | What the learner gets |
| --- | --- |
| `never` (default) | The browser goes straight from the launch to the activity, in one redirect. |
| `always` | The browser stops at a Modulus page naming the activity and the learning context, with a ten-second countdown and a launch link, then continues to the same activity URL. |

Both values reach the same activity URL with the same query parameters, and the
learner's session is established before either redirect. The full mechanics are in
[LTI → Where The Learner Lands](./LTI.md#where-the-learner-lands).

Choosing `never` gives up three things, all of which `always` provides:

- **A visible destination.** The interstitial shows the activity URL the learner
  is about to open, and the learning context it will be recorded under. Under
  `never` the learner sees the activity's own page and nothing from Modulus.
- **A place to put launch-time information.** Any future message aimed at the
  learner at launch — a scope warning, a "you are viewing as an instructor"
  badge — needs a Modulus-owned page to appear on.
- **A visible seam when something is slow or wrong.** Under `never` a launch that
  fails after the redirect fails on the activity's side, where Modulus has no
  surface.

What `never` buys is the hop itself: one redirect instead of two, and no page a
learner has to read or wait through to reach their work.

The setting is an enum rather than a boolean so that a narrower mode — showing
the interstitial only on a learner's first launch of an activity, for example —
can be added later without a breaking configuration change. Only `never` and
`always` are implemented today.

## Route Surfaces and Where They Are Gated

Every request path is classified into one of three surfaces by the pure helper
in `apps/gradebook/src/lib/deployment-mode.ts` (`classifyRoute` /
`isRouteAllowed`). The classifier strips any leading locale segment first, so
`/admin` and `/es/admin` classify identically.

| Surface | Page routes | Server routes (`/routes/*`) |
| --- | --- | --- |
| **Admin** | `/admin/*` (including the admin renewal page `/admin/renew`) | `/routes/admin/*` |
| **Frontend** | the public/learner UI (`/`, `/dashboard`, `/account`, `/sign-in`, `/sign-up`, `/start-activity`, `/about`, `/docs`), the learner renewal page `/auth/renew`, and the chromeless LTI and agent pages under `/lti/*` and `/agent/*` | `/routes/{lti,auth,oauth,agent}/*` |
| **Neutral** | — | `/routes/keep-alive`, `/routes/elb-status`, plus the server-function endpoint `/_serverFn/*` and static assets (`/_build`, `/fonts`, `/modules`) |

**Neutral** paths stay reachable in every mode: health probes must succeed
whichever surface an instance hosts, and assets carry no surface of their own.
Server functions are the exception that needs a second gate, described below.

Gating happens in two places, each covering what the other cannot see:

1. **The server entry (paths).** `apps/gradebook/src/server.ts` wraps TanStack
   Start's handler in the request pipeline of `apps/gradebook/src/lib/entry.ts`,
   the lowest point in the app that sees every request — before the router,
   before any session, CSP or locale work. A path the mode does not serve gets a
   plain 404 there:

   ```ts
   // apps/gradebook/src/lib/entry.ts
   // An admin instance has no learner home page; send the apex to sign-in.
   if (mode === 'admin' && pathWithoutLocale(url.pathname) === '/') {
     return Response.redirect(new URL('/admin/sign-in', url), 307)
   }

   // The gate reads only the URL, so a blocked request's body is never read.
   if (!isRouteAllowed(mode, url.pathname)) {
     return notFound()
   }
   ```

   This covers every page and every `/routes/*` handler, including the
   chromeless LTI pages.

2. **Server functions (surface middleware).** Pages call the server through
   server functions — `createServerFn(...)` handlers that Start serves at opaque
   `/_serverFn/<id>` URLs. A path cannot say which surface such a call belongs
   to, so the gate travels with the function: the first middleware of every
   server function names its surface, and refuses with a 404 on an instance that
   does not serve it.

   | Middleware | Surface | Session | Renewal boundary |
   | --- | --- | --- | --- |
   | `frontendSurfaceMiddleware` | frontend | none required | no |
   | `adminSurfaceMiddleware` | admin | none required | no |
   | `appSessionMiddleware` | frontend | valid learner session | yes |
   | `adminSessionMiddleware` | admin | valid admin session | yes |
   | `neutralMiddleware` | any | none required | no |

   The middleware lives in `apps/gradebook/src/lib/server-fn.ts`. A convention
   test (`server-fn-convention.test.node.ts`) fails the build if any server
   function's first middleware is not one of these, and limits
   `neutralMiddleware` to an allowlist. The session columns are described in
   [Authentication & Authorization](./AUTHN-AUTHZ.md).

Both gates read the mode from the validated configuration, so an instance
cannot serve a surface its configuration does not describe.

## Background Jobs

Background work runs in-process. `initCore` returns a `startBackgroundJobs()`
handle (`packages/core/src/core.ts`) that drives the LTI score-submission worker
(`packages/core/src/workers/score-submission.ts`) and the housekeeping worker.
The server entry starts it, once per process, only when **both** conditions hold:

```ts
// apps/gradebook/src/lib/deployment-mode.ts
export const backgroundJobsEnabled = (config: {
  jobQueue: { enabled: boolean }
  deployment: { mode: DeploymentMode }
}): boolean => config.jobQueue.enabled && config.deployment.mode !== 'frontend'
```

So `JOB_QUEUE_ENABLED` remains the operator's on/off switch, but a `frontend`
instance never starts the workers regardless of its value. Jobs start without
blocking the server: HTTP comes up while core initialises, and a failed start is
logged.

## The Frontend / Jobs Rule

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
impossible to run, and `backgroundJobsEnabled` re-enforces the coupling at the
call site in `server.ts`.

## Graceful Shutdown

A rolling deploy stops an instance while it may be in the middle of a score
submission, which can legitimately take up to its request timeout
(`LTI_SCORE_SUBMISSION_REQUEST_TIMEOUT_SECONDS`, 60 seconds by default). An
instance that runs jobs therefore owns its own exit. On `SIGTERM` or `SIGINT`
(`apps/gradebook/src/lib/shutdown.ts`):

1. the workers stop claiming new line items, and the core stop handle is awaited
   until in-flight submissions finish;
2. the process waits for requests it is still answering — a request counts as
   in flight until its HTTP response has been fully written to the socket (or the
   client has disconnected), so a response is never cut off, even when the
   client reads slowly;
3. the process exits 0 — or, if the drain is still running at
   `SHUTDOWN_DRAIN_SECONDS`, logs the unfinished work and exits 1.

Nitro closes the HTTP server in parallel, giving open connections
`SERVER_SHUTDOWN_TIMEOUT` seconds (25 on the image). An instance that runs no jobs
leaves shutdown entirely to Nitro.

Each layer around the process outlasts the one inside it, so the guarantee holds
end to end:

| Layer | Setting | Value |
| --- | --- | --- |
| Score submission | request timeout | 60 s |
| App | `SHUTDOWN_DRAIN_SECONDS` | 70 s |
| supervisord | node `stopwaitsecs` | 80 s |
| Fly | `kill_timeout` (admin / frontend) | 90 s / 30 s |

**The guarantee:** a rolling deploy lets an in-flight submission finish within
its request timeout. If the hard deadline is ever reached, the unfinished line
item stays leased and another worker reclaims it once the lease expires; the
re-sent score carries a newer AGS `timestamp` and the same value, so the platform
treats it as an update rather than a duplicate. Boot logs a warning when
`SHUTDOWN_DRAIN_SECONDS` leaves less than ten seconds beyond the request timeout.

## Instance Naming on Fly

The repository runs two Fly apps from one image: `fly-gradebook-frontend.toml`
(`DEPLOYMENT_MODE=frontend`) and `fly-gradebook-admin.toml`
(`DEPLOYMENT_MODE=admin`, jobs on, a single machine). The admin instance's Fly app
keeps its original name, `modulus-gradebook-backend`, because Fly app names cannot
be changed in place; everywhere the repository controls the name it is the
*admin* instance. Each toml lists only the variables its mode needs. The deploy
scripts are `scripts/fly-deploy-gradebook-frontend.sh`,
`scripts/fly-deploy-gradebook-admin.sh`, and `scripts/fly-deploy-gradebook.sh`
(both, building the image once).

---

## Where to go next

- [Architecture](./ARCHITECTURE.md) — the single-instance, in-process model these
  modes split, and the three actor domains (`app`, `admin`, `agent`) that map onto
  the frontend and admin surfaces.
- [Core Composition](./CORE-COMPOSITION.md) — how `initCore` assembles the graph
  and exposes `startBackgroundJobs()`.
- [Authentication & Authorization](./AUTHN-AUTHZ.md) — the sessions and the
  renewal boundary behind the session middleware in the server-function gate.
- [LTI](./LTI.md) — the launch and score-passback flows that the frontend surface
  and the background workers serve.
