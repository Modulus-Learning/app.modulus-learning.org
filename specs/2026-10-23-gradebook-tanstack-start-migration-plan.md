# Gradebook Next.js → TanStack Start migration — specification and implementation plan

Date: 2026-10-23
Status: draft, revised 2026-10-23 after review (config/core boundary, factory layering, replay safety, legacy endpoints, transition rules, shutdown deadlines, logging coverage, iframe storage); implementation not started
Branch: `feat/tanstack` (off `develop`)
Related:

- `docs/ARCHITECTURE.md` §7 — framework portability; core has no Next dependency
- `docs/DEPLOYMENT.md` — the three deployment modes, the two gating points, and the frontend/jobs rule this plan re-expresses
- `docs/AUTHN-AUTHZ.md` — user, admin and agent sessions, token refresh
- `docs/LTI.md`, `docs/LTI-SCORE-SUBMISSION.md` — the launch, deep-link and passback flows whose URLs must not move
- `docs/TESTING.md` — the gradebook's vitest jsdom/node split
- `apps/gradebook/src/proxy.ts` and `apps/gradebook/src/middleware/*` — the Next proxy chain being replaced
- `apps/gradebook/src/lib/deployment-mode.ts`, `deployment-mode-guard.ts` — the surface classifier (kept) and the layout guard (replaced)
- `apps/gradebook/src/config/index.ts` — the server/public config being made mode-aware
- `apps/gradebook/src/core-adapter.ts`, `src/instrumentation.ts` — the core singleton and background-job start
- `_docker/gradebook/**`, `fly-gradebook-{frontend,backend}.toml` (backend → admin), `scripts/fly-*.sh` — the image and deploy path
- Reference apps (canonical TanStack Start patterns):
  - `www.forru.org/apps/webapp` — `src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `src/i18n/locale-rewrite.ts`, `vite.config.ts`, `_docker/web/production/Dockerfile`, `_docker/start-node.sh`
  - `bylinecms.app/apps/webapp` — the same skeleton; confirms the patterns are shared, not FORRU-specific
- Reference auth design (patterns only — Byline is not a dependency of this app):
  - `bylinecms.dev/packages/auth/src/session-provider.ts` — the `SessionProvider` contract (`sessionId`, rotation, replay, revocation)
  - `bylinecms.dev/packages/client/src/server/{admin-context,request-scope,session-cookies}.ts` — verification-only, once-per-request context
  - `bylinecms.dev/packages/host-tanstack-start/src/integrations/{session-middleware,session-coordination,session-renewal,session-request-kind,admin-session-recovery}.ts` — explicit renewal and browser-side coordination
  - `bylinecms.dev/packages/host-tanstack-start/src/server-fns/auth/{renew,sign-in,sign-out}.ts`
  - `bylinecms.dev/docs/07-auth-and-security/01-authn-authz.md` — "Sessions", "Explicit renewal and session changes", "Password sign-in protection"

## Outcome

`apps/gradebook` runs on TanStack Start (Vite + Nitro, `preset: 'node'`) instead
of Next.js 16, with:

1. **Every externally visible URL unchanged.** LTI login/launch/JWKS/deep-link
   endpoints, OAuth return URLs, agent endpoints, health probes, and every page
   path (including the `/es/...` locale prefix) answer at the same path with the
   same method and the same response contract.
2. **The same three deployment modes**, with a gating model that has **one
   request chokepoint plus one server-function guard** instead of a proxy plus
   per-layout fallbacks, a config schema that only demands what the selected
   mode actually serves, and no build-time-baked origin.
3. **A rebuilt image** that ships the Nitro `.output/` tree instead of Next's
   standalone output, with the same nginx + supervisord topology and the same
   build-once / deploy-twice Fly flow.
4. `packages/core` changed only as listed in
   [Permitted Core Changes](#permitted-core-changes).

### Permitted Core Changes

- **Mode-aware core configuration.** `initCore()` loads its own schema
  (`packages/core/src/config.ts`), and that schema requires `oauth.google.*`,
  `oauth.github.user_url` and other learner-facing settings in every mode. So
  splitting the gradebook schema alone cannot let an `admin` instance boot
  without OAuth credentials. The permitted change: core's `oauth` section becomes
  optional at load. The Google/GitHub sign-in services check for it when invoked
  and fail with a configuration error if it is absent. The host's `frontend`
  schema still requires it, so a frontend instance missing OAuth still fails at
  boot. The exact keys each mode needs are established by Task 2's boot test, not
  assumed. Other sections, such as email, stay required where that test shows a
  mode uses them.

No other core change is authorised. `startBackgroundJobs()` already returns an
async `StopHandle`, and the score-submission manager already drains its
processors, so graceful shutdown needs no core work. Login identity for replay
safety uses the user id already present in access tokens (see Authentication And
Sessions), so it needs no new token claim either.

Out of scope: visual redesign, swapping `react-hook-form` for TanStack Form,
swapping `@infonomic/uikit`, changing the data model, the remote connector, and
any change to `apps/agent` (it only sees URLs, which do not move).

## What Exists Today

| Area | Size / shape |
|---|---|
| Pages (`app/**/page.tsx`) | ~60 RSC pages across `[lng]/(admin)`, `(auth)`, `(forms)`, `(public)`, plus chromeless `/lti/*` and `/agent/error` |
| Route handlers (`app/routes/**/route.ts`) | 14 handlers: `lti/{login,launch,jwks,deep-link/activities}`, `agent/{authorize,token,activity}`, `auth/{refresh,session}`, `admin/refresh`, `oauth/{github,google}`, `keep-alive`, `elb-status`, plus `lti/register` page |
| Server actions | 45 `'use server'` modules, ~100 `useActionState` call sites |
| Client components | 112 `'use client'` files |
| Next API imports | `next/navigation` 91, `next/headers` 36, `next/server` 36, `next/image` 10, `next/link` 9 |
| Proxy chain | `withRequestId → withDeploymentMode → [non-/routes: withCurrentPath, withFlash, withNonce, withCSP, withPrefersColorScheme, (admin: withAdminSession, withAdminAuth) \| (user: withUserSession, withUserAuth), withActivity, withI18n]` |
| Tests | 29 gradebook test files; several `page.test.node.tsx` / `route.test.node.ts` mock `next/headers` |
| Runtime fs reads | `src/content/docs/*.md` (docs registry via `process.cwd()`), `email-templates/` |
| Native / CJS deps | `argon2`, `bcrypt`, `pg`, `pino`, `@google-cloud/recaptcha-enterprise` (google-gax), `googleapis`, `@aws-sdk/client-s3`, `newrelic` |

## Non-Negotiable Contracts

1. **URL stability.** Every path under `/routes/*` keeps its path, methods, status
   codes, headers (including the agent CORS headers), cookie names/attributes and
   body shapes. Canvas registrations, OAuth apps and published agent builds point
   at them. A route-contract test suite (Task 3) is written against the Next app
   first and must pass unchanged against the new app. The only exceptions are the
   three deliberate changes in
   [Legacy Session Endpoints](#legacy-session-endpoints), which have no caller
   outside the gradebook itself.
2. **No PII crosses into activities.** Nothing in the port changes what an
   activity or the agent receives.
3. **Cookie semantics.** Session/refresh/flash/LTI-state cookie names, `SameSite`,
   `Secure`, `HttpOnly`, `Path` and expiry rules are preserved byte-for-byte —
   including `SameSite=None; Secure` for the learner cookies used inside the
   Canvas iframe, and the `state-<state>` cookie scoped to `/routes/lti/launch`.
4. **Deployment-mode behaviour.** A blocked surface returns a plain 404 in every
   request shape (page, `/routes/*`, server function, data/loader request). An
   `admin` instance redirects the apex to `/admin/sign-in`. A `frontend` instance
   can never start background jobs.
5. **Locale URLs.** Default locale (`en`) is unprefixed; non-default locales are
   prefixed; every existing localized path resolves. Negotiation is improved
   deliberately, in two ways. An explicit prefix is never redirected away
   because of the cookie, and an external `/en/…` 301s to the clean form. See
   [Internationalisation](#internationalisation).
6. **Core is consumed only through `CoreCommands`.** The host stays thin: route
   handlers and server functions resolve a context and call a command.

## Target Architecture

### Request lifecycle mapping

TanStack Start gives four hook points. Each Next proxy layer moves to exactly one:

| Hook point | Runs on | Gradebook responsibilities |
|---|---|---|
| **Server entry** `src/server.ts` (`createServerEntry({ fetch })`) | every request, un-rewritten, before the router | request id + AsyncLocalStorage scope and the access-log wrapper (`withRequestId`; covers early responses), deployment-mode gate (`withDeploymentMode`), admin apex redirect, `withActivity` (`/https://…` → `/start-activity/…`), locale negotiation redirect (`withI18n` redirect half) |
| **Global request middleware** `src/start.ts` (`createStart({ requestMiddleware })`) | every request the router/server-fn layer handles | CSRF for server fns, request-kind classification and access-log enrichment, CSP nonce + header (`withNonce`/`withCSP`), flash cookie read-and-clear (`withFlash`). **No session refresh** (`withUserSession`/`withAdminSession` are replaced by verification-only context — see Authentication And Sessions) |
| **Router** `src/router.tsx` (`rewrite.input/output`) | server parse and client navigation | locale prefix rewrite (`withI18n` rewrite half), FORRU pattern |
| **Route `beforeLoad`** on pathless layouts | page/loader requests | auth redirects (`withUserAuth`/`withAdminAuth`), surface guard as defence in depth |

`withCurrentPath` and `withPrefersColorScheme` are deleted — `useLocation()` and
the existing early theme detector replace them.

### Route tree

File-based routing under `src/routes`, mirroring FORRU's required-locale-segment
pattern:

```text
src/routes/
  __root.tsx                       # single document; chrome chosen by staticData
  $lng/
    _public/  (route.tsx + index, about, docs, docs/$slug, $ catch-all)
    _forms/   (sign-in, sign-up, start-activity/$)
    _auth/    (beforeLoad: user auth)  dashboard/**, account
    _admin/   (beforeLoad: surface + admin auth)
      admin/sign-in.tsx
      admin/_authed/ (route.tsx + every admin page)
  lti/       (staticData: chromeless) deep-link, error, launch/$activity_id
  agent/     (staticData: chromeless) error
  routes/    (server.handlers, plus the one existing page at /routes/lti/register)
    lti/login.ts, lti/launch.ts, lti/jwks.ts, lti/deep-link/activities.ts, lti/register.tsx
    agent/authorize.ts, agent/token.ts, agent/activity.ts
    auth/session.ts                 # verification-only; auth/refresh and admin/refresh retired
    oauth/github.ts, oauth/google.ts, keep-alive.ts, elb-status.ts
```

- Next route groups become pathless layouts (`_public`, `_forms`, `_auth`,
  `_admin`). Each Next group currently renders its own `<html>` via
  `DocumentRoot` with a `themeContext`; TanStack has one root document, so each
  layout sets `staticData: { themeContext, chrome }` and `__root.tsx` reads the
  deepest match (the FORRU `data-theme-context` approach, derived during render so
  it ships in SSR markup).
- `NON_LOCALIZED_SEGMENTS` for the rewrite: `lti`, `agent`, `routes`,
  `_serverFn`, `_build`, `assets`, `fonts`, `modules` (plausible proxy), and static
  files by extension. `/admin` stays **inside** `$lng` because it is localized
  today (`/es/admin/...`).
- `src/routeTree.gen.ts` is generated and committed (FORRU convention); Biome
  ignores it.

### Data and mutations

- **RSC pages → route `loader`s calling server functions.** Each async server
  component's data fetch becomes a `createServerFn({ method: 'GET' })` in the
  module (`modules/<area>/<thing>.ts` stays the home), called from the route
  loader; the component reads `Route.useLoaderData()`. Server-only modules keep
  a `.server.ts` suffix where they must never reach the client graph.
- **Server actions → `createServerFn({ method: 'POST' })`** taking `FormData`
  through an `inputValidator`, returning the same `*FormState` shapes so the
  ~100 `useActionState` call sites keep their state machine; only the action
  reference changes. `redirect()` from `next/navigation` becomes a thrown
  `redirect()` from `@tanstack/react-router`; `revalidatePath` becomes
  `router.invalidate()` on the client after success.
- **Surface-tagged server function factories.** Server functions are invoked at
  opaque `/_serverFn/<id>` URLs, so the entry gate cannot classify them by path.
  Surface gating and authentication are separate layers, so server functions are
  built from four factories in `src/lib/server-fn.ts`:

  | Factory | Surface gate | Session | Renewal/replay boundary | Used for |
  |---|---|---|---|---|
  | `frontendSurfaceFn` | frontend | none required | no | public reads, learner sign-in/sign-up, learner renewal and sign-out |
  | `adminSurfaceFn` | admin | none required | no | admin sign-in, admin renewal and sign-out |
  | `appFn` | frontend (via `frontendSurfaceFn`) | valid user context required | yes | learner/instructor business operations |
  | `adminFn` | admin (via `adminSurfaceFn`) | valid admin context required | yes | admin business operations |

  The surface gate 404s when the instance does not serve that surface. Renewal,
  sign-in and sign-out are surface-only: an expired session reaches them
  unchallenged, and they never pass through the renewal boundary, so renewal
  cannot recurse. A node convention test asserts three things. No server function
  is built with bare `createServerFn`. `modules/admin/**` uses only admin
  factories, and `modules/{app,lti}/**` only frontend ones. `adminSurfaceFn`
  appears only in an allowlist of session files
  (`modules/admin/session/{sign-in,renew,sign-out}.ts`). "Forgot the guard"
  becomes a failing test rather than a review catch.
- **Request-scoped, verification-only session.** React `cache()` on
  `getUserSession` / `getAdminSession` is replaced by a verification-only context
  memoized once per request (see Authentication And Sessions). The Start
  adapter builds `UserAuth`/`AdminAuth` from it and reads cookies via
  `@tanstack/react-start/server`. During the transition the core wiring is
  split three ways so both apps keep running:
  - `src/lib/core/instance.ts` (shared, framework-neutral): the `initCore`
    singleton, `getCoreCommands`, token verifiers, and pure builders —
    session payload + request id → `UserRequestContext` / `AdminRequestContext`;
    `Authorization` header value → `AgentRequestContext`.
  - `src/core-adapter.ts` (Next): keeps its current exports and behaviour —
    `next/headers`, Next session storage, `getRequestId`, `NextRequest` — but
    delegates initialisation and context building to `instance.ts`. Every
    existing `@/core-adapter` import keeps working unchanged.
  - `src/lib/core/start-adapter.ts` (Start): the same context accessors, built
    on the verification-only session context and the AsyncLocalStorage request
    id.

  Task 18 deletes `core-adapter.ts`. Whether `start-adapter.ts` is then renamed
  is a Task 18 call.

### Next API replacement table

| Next | TanStack Start |
|---|---|
| `cookies()` / `headers()` | `getCookie` / `setCookie` / `deleteCookie` / `getRequestHeader` / `setResponseHeader` (`@tanstack/react-start/server`) |
| `NextRequest` / `NextResponse` in handlers | standard `Request` / `Response` in `server.handlers` |
| `redirect()` / `notFound()` | `throw redirect({...})` / `throw notFound()` |
| `useRouter` / `usePathname` / `useSearchParams` / `useParams` | `useRouter`/`useNavigate` / `useLocation` / `Route.useSearch` (zod `validateSearch`) / `Route.useParams` |
| `next/link` (+ `LangLink`) | `@tanstack/react-router` `Link`; `LangLink` rebuilt on it |
| `next/image` | plain `<img>` with explicit width/height (no image optimizer is needed for ~10 logo/hero uses) |
| `generateMetadata` / `generateViewport` | route `head()`; `lib/meta.ts` returns `{ meta, links }` (FORRU `getMeta`) |
| `not-found.tsx` / `[...notfound]` | `notFoundComponent` on layouts + `$` splat routes |
| `instrumentation.ts` | background-job start in `src/server.ts` behind a `globalThis` guard (FORRU scheduler pattern) |
| `export const dynamic = 'force-dynamic'` | not needed — Start renders per request; no static prerender is configured |
| `NEXT_PUBLIC_*` | `VITE_*` (`import.meta.env` on the client, `process.env` on the server); the public server URL reaches the client via the root loader — see Deployment Modes item 3 |

## Internationalisation

The gradebook's i18n is the Next-era ancestor of the strategy FORRU and
bylinecms.app now run on TanStack Start: same `lng` cookie, the same
`en`/`es` JSON-per-locale files with namespaces, `intl-messageformat` for ICU,
and a `TranslationsProvider` + `useTranslations(namespace)` client API. The
migration adopts the reference implementation (`www.forru.org/apps/webapp/src/i18n`)
along with its improvements. It leaves out FORRU's **content-locale** layer
(`contentLocales`, `toContentLocale`, `useInterfaceLocale`), which exists for
Byline's multilingual content; Modulus has interface locales only, so
`routableLocales` equals `i18nConfig.locales`.

### What changes

| Concern | Gradebook today (Next) | Target (FORRU pattern) |
|---|---|---|
| Locale in the route tree | `[lng]` segment, filled by a middleware `NextResponse.rewrite` for the default locale | **required `$lng` segment**, filled by an isomorphic router rewrite: `rewrite.input` prepends `en` to bare localizable paths, and `rewrite.output` strips **only** the default locale (`src/i18n/locale-rewrite.ts`) |
| Negotiation | `withI18n` on every non-`/routes` request, any method | `negotiateLocaleRedirect` in `src/server.ts`, **GET only**, bare localizable paths only, on the un-rewritten request |
| A prefixed URL vs the cookie | the cookie wins: `/es/dashboard` with `lng=en` **redirects to `/dashboard`** | **the URL wins**: an explicit non-default prefix is canonical and is never redirected away. A shared `/es/…` link renders in Spanish for everyone |
| Externally typed `/en/…` | redirected only when it mismatches the cookie | always **301** to the clean form (canonicalisation) |
| Unknown prefix (`/xx/…`) | treated as a path under the detected locale | `$lng` `params.parse` throws `notFound()` at the matcher |
| Detection | `middleware/withI18n/get-locale.ts` (`NextRequest`-bound) | pure `detectLocale({ cookie, pathLocale, acceptLanguage })` (`src/i18n/detect-locale.ts`); negotiation errors fall back to the default instead of risking a 500 |
| Where translations load | every Next route-group layout calls `getTranslations` | once, in the `$lng` layout route `loader`, providing `TranslationsProvider` to all descendants |
| Loader | `import('../translations/en.json')` behind `'server-only'` | `?raw` JSON imports parsed at module init (this avoids the Nitro dev 404 on `.json?import`); each non-default locale is **merged over English per namespace**, so a missing key falls back to English text rather than the raw key; `Translations` is typed from `en.json` |
| Server-side `t` | `useTranslations(lng, ns)` — a non-hook named like a hook, server-only | framework-agnostic `createTranslator(lng, ns)`, usable in loaders, `head()` and server functions |
| Rich text | none; `en.json` has i18next-style `<1>…</1>` tags and `{{date}}` that ICU does not interpret | `useTranslations(ns).rich(key, { link: (chunks) => <a>{chunks}</a> })`; messages audited to ICU (`{date}`, named tags) |
| Persisting a choice | `setLanguageAction` server action plus `react-cookie` on the client; cookie `maxAge: 1704085200` (seconds — about 54 years, silently clamped by browsers to 400 days; the comment says 365 days) | `setLanguageFn` server fn with a validator; cookie `maxAge` 365 days; `useLanguageSwitcher` + `useLocaleNavigation` on TanStack `navigate`; `react-cookie` removed |
| Links | `LangLink` over `next/link`, adding the prefix by hand | `LangLink` over TanStack `Link`, injecting the `lng` param; the clean default-locale href comes from `rewrite.output` |
| `<html lang>` | set per route-group `DocumentRoot` | derived in `__root.tsx` from the URL's first segment, during render, so it ships in SSR markup |

### What does not change

- URLs: `en` unprefixed, `es` prefixed, `/admin` localizable (`/es/admin/…`
  keeps working; unlike FORRU's locale-less Byline admin, the Modulus admin tree
  sits under `$lng`).
- Non-localized segments: `lti`, `agent`, `routes`, `_serverFn`, `_build`,
  `assets`, `fonts`, `modules`, and anything with a file extension. The
  chromeless LTI and agent pages stay `lang="en"`.
- The `lng` cookie's name, `SameSite=Lax`, and non-`HttpOnly` flag.
- Translation file layout (`src/i18n/translations/{en,es}.json`, namespaced).
  Translation *coverage* is out of scope. Today 21 files use translations, the
  language menu is not mounted anywhere, and much UI text is literal English;
  the migration keeps that as it is.

### Behaviour changes, recorded

The URL-wins rule and the `/en/…` 301 deliberately change negotiation, so
Non-Negotiable Contract 5 is amended to match. The Task 3 contract suite
asserts the new behaviour for three cases: an explicit `/es/…` request
carrying a `lng=en` cookie, an external `/en/…`, and an unknown prefix. Each
assertion carries a comment pointing here.

### Coexistence until Task 18

Following the execution rules:

- **Shared and upgraded in place:** `i18n-config.ts`, `utils.ts`,
  `language-map.ts`, `translations/*.json` (the ICU audit benefits both apps),
  `client/translations-provider.tsx` (gains `rich()` and types against
  `en.json` rather than `server/index`; its `'use client'` directive is inert
  under Start), and the new pure `detect-locale.ts`, which the Next
  `get-locale.ts` also delegates to.
- **New, Start-only, no name collision:** `translations/index.ts`,
  `locale-rewrite.ts`, `server-locale-redirect.ts`, `set-language-fn.ts`,
  `hooks/use-locale-navigation.ts`, `hooks/use-language-switcher.ts` (which also
  fixes the `use-languag-switcher` typo).
- **New, Start-only, colliding with a Next file:** `components/lang-link`,
  `language-menu` and `available-languages` are written as `*.start.tsx` and
  renamed in Task 18, when the Next versions are deleted together with
  `server/`, `set-language-action.ts`, `hooks/use-lang-navigation.ts`,
  `hooks/use-languag-switcher.ts` and `middleware/withI18n/`.

## Deployment Modes — Improvements

The mode model (`all-in-one` | `frontend` | `admin`, the surface classifier, the
frontend/jobs rule) carries over. What changes is how it is enforced and
configured. Current weaknesses, each with its fix:

1. **Two enforcement points that must be kept in sync.** Today the proxy gates
   most routes, but `/lti/*` and `/agent/*` are matcher-excluded and rely on
   `assertSurfaceServed` in their layouts, with `force-dynamic` to stop the
   layout being prerendered on the wrong mode. **Fix:** the server entry sees
   every request with no matcher, so it is the single path-based gate
   (`isRouteAllowed(mode, pathname)` reused verbatim, `/_serverFn/*` and asset
   paths classified neutral). Server functions are gated by the surface-tagged
   factories above. Layout `beforeLoad` guards remain only as defence in depth.
2. **Config demands every surface's secrets in every mode.** A `frontend`
   instance must still set admin cookie config; an `admin` instance must still set
   GitHub/Google OAuth, reCAPTCHA and learner cookie config. **Fix:** split the
   server schema into `common` + `frontend` + `admin` sections and validate with
   a mode-discriminated schema — `frontend` requires `common + frontend`,
   `admin` requires `common + admin`, `all-in-one` requires all three. The
   frontend/jobs `superRefine` stays. Fly tomls drop the variables their mode no
   longer reads. **This is not host-only:** core's own schema also requires OAuth
   and other frontend settings, so it needs the small change in
   [Permitted Core Changes](#permitted-core-changes). Task 2 proves the result by
   booting `initCore()` with only each mode's permitted environment.
3. **Origin baked in at build.** `NEXT_PUBLIC_PUBLIC_SERVER_URL` is inlined into
   the client bundle, so a shared image always carries the frontend origin, and
   the backend toml carries a long comment explaining why that is "harmless".
   **Fix:** every `NEXT_PUBLIC_*` variable is renamed to its `VITE_*` equivalent
   (FORRU convention, no fallback to the old names). Values that are genuinely
   build-constant — site name, description, CSP flag, reCAPTCHA enabled /
   mandatory / site key — are read on the client from `import.meta.env.VITE_*`.
   `VITE_PUBLIC_SERVER_URL` is the exception. The server reads it from
   `process.env` at runtime (as FORRU's server config does for all `VITE_*` keys).
   Client code **never** reads it from `import.meta.env`; instead it is delivered
   through the root route loader (`staleTime: Infinity`) into
   `PublicConfigProvider`. So one image still carries the correct origin per
   instance. At boot, the server warns if any client-inlined `VITE_*` value
   differs from its runtime `process.env` value, which catches an operator
   editing a baked value in a Fly toml and expecting the browser to see it.
4. **HTTP self-fetch for token refresh.** `withUserSession` / `withAdminSession`
   refresh by `fetch(`${publicServerUrl}/routes/{auth,admin}/refresh`)` — a
   network hop to itself that breaks if `publicServerUrl` points at the other
   instance (the reason the backend toml overrides it). **Fix:** request handling
   stops refreshing altogether. Renewal becomes an explicit, CSRF-protected server
   function that calls the core refresh command in-process — see
   [Authentication And Sessions](#authentication-and-sessions). The legacy refresh
   endpoints are retired; see [Legacy Session Endpoints](#legacy-session-endpoints).
5. **No graceful shutdown of background jobs** (`TODO` in `instrumentation.ts`).
   Core already returns an async `StopHandle`, and the score-submission manager
   drains its processors. The gap is the deadline chain around the process:

   | Layer | Today | Problem |
   |---|---|---|
   | Score submission | `request_timeout_seconds` 60, `lease_duration_seconds` 120 | a draining submission may legitimately take up to 60 s |
   | supervisord | `stopwaitsecs=10` | SIGKILLs Node after 10 s |
   | Fly | `kill_timeout` unset → default 5 s | kills the machine before supervisord's own window ends |

   A signal handler alone cannot guarantee anything here. **Fix:** coordinate
   the deadlines so each outer layer outlasts the one inside it:
   - **App:** on `SIGTERM`/`SIGINT`, stop accepting new job work, await
     `StopHandle`, then let Nitro close. A hard deadline
     (`SHUTDOWN_DRAIN_SECONDS`, default 70) logs and exits if the drain hangs.
     Boot validation warns when `request_timeout_seconds` + margin exceeds the
     drain deadline.
   - **supervisord:** node `stopwaitsecs` 80 on the image. A frontend instance has
     no jobs and finishes well inside that window.
   - **Fly:** `kill_timeout = 90` in the admin toml and `30` in the frontend toml.
     `kill_signal` stays at its default; supervisord forwards `TERM` to Node.
   - **Nitro (Task 1 finding):** the node preset delegates to srvx's
     `gracefulShutdownPlugin`. On `SIGINT`/`SIGTERM` it closes the HTTP server and
     waits up to `SERVER_SHUTDOWN_TIMEOUT` seconds (default **5**), then force-closes
     connections. It does **not** call `process.exit`. So our own signal handler
     runs alongside it: HTTP stops accepting work while the job drain proceeds,
     and our handler owns process exit, after `StopHandle` resolves or at the hard
     deadline. Set `SERVER_SHUTDOWN_TIMEOUT=25` on the image so in-flight HTTP
     requests get a fair close well inside the job drain window.

   The stated guarantee becomes: **a rolling deploy lets an in-flight submission
   finish within its request timeout; if the hard deadline is ever hit, the
   unfinished line item stays leased and is reclaimed by the next worker once
   the lease expires.** Task 19 proves this by sending `SIGTERM` to the
   container during an active submission against a slow mock platform.
6. **Mode is invisible at runtime.** **Fix:** log one boot line
   (`mode`, `jobs`, served surfaces), and have `/routes/elb-status` include
   `mode` and `jobs` in its body so an operator can tell instances apart.

7. **No request logging in the app.** Today only nginx logs requests; `pino-http`
   is installed but unused. **Fix:** see [Request Logging](#request-logging).

**Mode naming (decided).** The values stay `all-in-one | frontend | admin`, with
no `backend` alias. The admin-plus-workers instance is called **admin**
everywhere the repo controls the name:
`fly-gradebook-backend.toml` → `fly-gradebook-admin.toml`,
`scripts/fly-deploy-gradebook-backend.sh` → `fly-deploy-gradebook-admin.sh`,
and docs/comments say "admin instance". The Fly app itself keeps its existing
name (`modulus-gradebook-backend`), because Fly app names cannot be changed in
place. The toml header records that mapping.

**Builds (decided).** Every build contains both surfaces; there is no per-surface
build flag. `DEPLOYMENT_MODE` remains purely a runtime switch on one image.

## Request Logging

Recommendation: **one structured pino line per request, emitted by the server
entry wrapper in `src/server.ts` and enriched by request middleware in
`src/start.ts`**. nginx keeps its access log as the edge view, with its log
format tightened to match the same policy.

- **Where:** `src/server.ts` opens the AsyncLocalStorage scope (request id plus
  a mutable log record) around the whole entry `fetch`. It runs the mode gate,
  redirects and `handler.fetch` inside that scope, and logs once the response
  exists — or on a thrown `Response`/error — at `info` (`warn` ≥ 400,
  `error` ≥ 500). So early responses produced in `server.ts` are covered too:
  mode-rejection 404s, the admin apex redirect, the activity and locale
  redirects. Request middleware in `start.ts` only *annotates* the record
  (handler type, matched route id, server-fn name). Core's log lines share the
  `request_id`.
- **Fields:** `request_id`, `method`, `route` (the matched route id when the
  router handled the request, otherwise the pathname capped at 256 characters,
  never the query), `status`, `duration_ms`, `handler_type`
  (`entry` / `ssr` / `serverFn` / `handler`), `mode`. Server functions log their
  function name, not the opaque `/_serverFn/<id>`.
- **Coverage tests:** a node test drives the entry with a blocked-surface path,
  the admin apex, an activity redirect, a locale redirect, an SSR page, a
  `/routes/*` handler and a server function. It asserts exactly one access line
  per request with the expected `handler_type`, and no query string or body in
  any line.
- **nginx:** both `log_format`s (`main`, `main_timed`) currently log `$request`
  (full URI with query) and `$http_referer`, so query-string credentials such
  as agent `authorize` `code`/`state` would still land in edge logs. Replace
  `$request` with `$request_method $uri $server_protocol`, and drop
  `$http_referer`. A referer from Canvas or an activity can carry its own
  query, and nginx cannot strip it reliably. Switch the `map $request
  $loggable` health-check filter to `$uri`.
- **Never logged:** query strings (agent `authorize` carries `code`, `state`
  and `redirect_uri`), request bodies (the LTI `id_token`), cookies,
  `Authorization`, user ids or emails. This keeps the PII boundary in
  `docs/SECURITY-AND-PRIVACY.md` intact.
- **Skipped:** `/routes/elb-status`, `/routes/keep-alive`, static assets
  (served before the router anyway).
- **Not `pino-http`.** It adapts Node's `IncomingMessage`/`ServerResponse`, while
  Start middleware deals in Fetch `Request`/`Response`. Remove the dependency.
- Production output stays JSON to stdout (supervisord → Fly logs);
  `LOG_PRETTY` keeps local pretty output.

## Authentication And Sessions

Modulus and Byline share the same shape — short-lived JWT access token plus
longer-lived refresh token in http-only cookies, actor classes
(`UserAuth`/`AdminAuth`) carrying abilities, and a `RequestContext` handed to the
service layer. Byline has since hardened both the token lifecycle and the host
integration. Its host integration is already TanStack Start, so the migration is
the natural point to adopt the host half of that design.

### Where the two systems differ today

| Concern | Modulus (`core/modules/{app,admin}/session`, gradebook proxy) | Byline |
|---|---|---|
| Refresh token | Stateless JWT `{ user_id }`; nothing stored | Opaque random string; hash stored per login (`sid`) |
| Rotation / replay | New pair minted; the old refresh JWT stays valid until `exp` | Rotated on every refresh; reusing a rotated token revokes the whole login |
| Sign-out | Clears cookies only; a copied refresh token still works until `exp` | Revokes the login server-side; idempotent |
| Password change / disable | Disable takes effect at next refresh (refresh re-reads the user); no revoke-all | `session_version` bump revokes every session |
| When refresh happens | **Implicitly**, in the proxy, on any request whose access token is within 10 s of expiry; refresh by HTTP self-fetch | **Explicitly**: request context is verification-only; a dedicated renewal server fn rotates |
| Concurrency | Parallel requests near expiry each mint a pair (harmless only because nothing is stored) | Same-tab single-flight, cross-tab Web Locks queue, BroadcastChannel change notice |
| Login identity | None | `sessionId` returned with tokens; mutations carry the page's expected id so a tab cannot act as a different login |
| Per-request memo | React `cache()` | `oncePerRequest` WeakMap keyed on the `Request` |
| Sign-in protection | Throttling is a `TODO` (`AUTHN-AUTHZ.md` Honest Notes) | Body-size/shape check before RPC deserialization, client-IP admission |
| CSRF | Next server-action origin check | `createCsrfMiddleware` on server fns, ordered before session middleware |

The pivotal row is **when refresh happens**. Implicit refresh-on-any-request is
only safe because Modulus refresh tokens are stateless. The moment refresh
tokens rotate with replay detection, which is the obvious core hardening, two
concurrent requests near expiry would present the same refresh token and the
second would revoke the login. So the host must move to explicit, coordinated
renewal before core can harden. Porting the implicit model into Start request
middleware now would mean writing the session layer twice.

### Decision: adopt Byline's host model in the migration; harden core separately

**In this migration (host only — no auth change in core):**

1. **Verification-only request context.** Global request middleware and the
   server-fn factories only *verify* the access cookie, memoized once per
   request (`oncePerRequest` keyed on the Start `Request`, replacing React
   `cache()`). Nothing in a request path rotates credentials. Expired access with
   a refresh cookie present yields a distinct `renewable` outcome, not "anonymous".
2. **Explicit renewal server functions** `renewUserSession` / `renewAdminSession`
   (POST, CSRF-protected, `Cache-Control: no-store`). They call
   `core.app.session.refreshTokens` / `core.admin.session.refreshTokens`
   in-process, set the cookie pair with the unchanged attributes, and no-op if
   access is still valid, so a late duplicate never re-rotates. They are built on
   the **surface-only** factories (`frontendSurfaceFn` / `adminSurfaceFn`), so the
   mode gate covers them, an expired session can reach them, and they never pass
   through the renewal boundary. Sign-in and sign-out use the same factories.
   Each returns the renewed principal (`{ domain, userId }`) for the replay check
   below.
3. **Browser coordination**, ported from Byline's `session-coordination.ts`:
   same-tab single-flight, a Web Locks queue (`modulus.auth`) around every
   cookie-mutating auth action, a BroadcastChannel notice on sign-in/sign-out.
   No credential is ever exposed to JavaScript.
4. **Function middleware renewal signal and replay rules.** The server half of
   `appFn`/`adminFn` verifies the session **before** calling `next()`. When
   verification fails as expired-but-renewable, it sets
   `x-modulus-auth-boundary: renew` and returns without running the handler. The
   client half replays **only** when all of the following hold:
   - the response carries `renew` (which proves the handler did not execute);
   - one coordinated renewal succeeded;
   - the renewed principal equals the call's expected principal (item 7);
   - the body is re-sendable (`FormData`, JSON);
   - no replay has happened yet for this call.

   It **never** replays on any other outcome: a handler error or any response
   where the boundary reached `next()`, a 4xx/5xx without the signal, a network
   error, timeout or abort (the outcome is unknown, so a retry could
   double-submit), or a missing header. Those surface to the form as ordinary
   errors. A non-re-sendable body that hits `renew` surfaces a "session renewed,
   please retry" error instead of replaying. The boundary owns two reserved
   values: `renew` (expired but renewable) and `changed` (the verified principal
   differs from the expected one — item 7). Both are set only by the boundary,
   before the handler runs, and both are preserved on the way out. On every
   outcome where the handler ran, the boundary strips any
   `x-modulus-auth-boundary` value, so a handler cannot forge either signal.
5. **Navigation-time recovery.** On client navigation, the `_auth`/`_admin`
   `beforeLoad` renews in place and retries once. On a server render it cannot
   renew, because the browser coordination queue lives client-side. It redirects
   instead to a tiny chromeless bootstrap route (`/auth/renew?return=` and
   `/admin/renew?return=`), which renews in the browser and navigates back. This
   is Byline's sign-in-bootstrap pattern without the form. Public pages mount a
   `SessionRecovery` component (Byline's `AdminSessionRecovery`) so the app bar
   reflects a renewed session. The bootstrap's outcomes are bounded:
   - **Success:** navigate to `return` with a `_renewed=1` marker. A server-render
     guard that sees an expired session **and** the marker sends the user to
     sign-in rather than back to the bootstrap. That allows one bootstrap per
     navigation, enforced in the URL so it holds without storage.
   - **Terminal auth failure** (no refresh cookie, invalid/expired refresh token,
     disabled account): **leave the cookies alone.** Go to
     `/sign-in?callbackUrl=…` or `/admin/sign-in?callbackUrl=…`. Inside the
     Canvas iframe, show the chromeless "session unavailable — relaunch from
     Canvas" state instead, because LTI-provisioned learners have no password to
     sign in with.
   - **Transient failure** (network, 5xx): show a bounded error state with a
     manual retry button. There is no automatic retry loop.
   - **No path clears cookies except coordinated sign-out (item 6).** That
     includes renewal failure, the bootstrap, verification and the
     renewal-boundary middleware. A delayed failure response could otherwise
     erase cookies just installed by a concurrent successful sign-in in another
     tab, and that race cannot be ruled out when Web Locks are unavailable.
     Stale cookies are harmless: the next verification reports them as invalid
     or renewable, and sign-in overwrites them.
6. **Sign-out** goes through a coordinated server fn that clears cookies and
   broadcasts. Server-side revocation arrives with the core follow-on.
7. **Expected login identity is required in v1: the principal.** Core does not
   issue a per-login `sid` yet, but every access token already carries the user
   id. The expected identity is therefore the principal `{ domain, userId }`,
   where domain is `user` or `admin`, and it comes from the page's own loader
   data, held in memory — not from storage. Every `appFn`/`adminFn` call sends it
   as `sendContext`. The server half answers `changed` (before running the
   handler) if the verified principal differs. Renewal returns the renewed
   principal, and the client refuses to replay on a mismatch, flagging a
   session-changed interstitial ("you are now signed in as a different account —
   reload"). This closes the case where a form opens under account A, another
   tab signs in as B, and A's submission replays as B. The residual case — the
   same account under a different login — replays as the same user, which is
   acceptable. When core adds `sid`, the identity narrows to the login without
   host restructuring.

**Constraints specific to Modulus:**

- **The Canvas iframe.** Learner cookies are `SameSite=None; Secure` and the LTI
  launch sets them inside a third-party frame. Browser policy may partition or
  deny storage and cookies there (Safari ITP, Chrome third-party-cookie
  restrictions, storage-access denial), so none of the coordination APIs is
  assumed to exist:
  - The coordination module feature-detects each API, and wraps every access in
    `try/catch`. If Web Locks are missing or throw, it falls back to the in-tab
    queue only. If BroadcastChannel is missing, there is no cross-tab notice. If
    sessionStorage is denied, it keeps the value in memory; the expected
    principal comes from page data anyway, so the replay guard does not weaken.
  - **Blocked cookies.** If the launch cannot set the learner cookies, or
    renewal comes back unauthenticated inside the frame, the client makes at most
    one renewal attempt. After that it shows the chromeless "session unavailable"
    state with an "open in new tab" link (`target="_blank"`, same URL) — never a
    redirect loop, and never a top-frame navigation.
  - The iframe prototype ran in the Task 1 spike under headless Chrome
    (see Spike Findings). **Safari was not tested** — there is no Safari
    automation here, and no Canvas instance; the Canvas run happens on another
    installation (Task 21). Task 21 also reruns the committed harness
    (`apps/gradebook/spike-harness/` on `spike/tanstack`, to be moved into the
    branch as a test fixture in Task 7) against the finished app.
- **The agent is out of scope.** Agent bearer tokens, PKCE and `renew_after`
  are a separate flow (`getCoreAgentRequestContext`) and stay as they are.

### Legacy Session Endpoints

The only callers of `/routes/auth/session`, `/routes/auth/refresh` and
`/routes/admin/refresh` are inside the gradebook: `client-provider.tsx` and the
`withUserSession`/`withAdminSession` self-fetch. The agent and agent-demo do not
call them. Keeping their current behaviour would leave uncoordinated rotation
paths behind for the core hardening work to trip over, so this plan changes them
deliberately:

| Endpoint | Today | After |
|---|---|---|
| `GET /routes/auth/session` | returns the session, **refreshing and writing cookies** if access has expired | verification-only: returns the session payload or `null`, plus `renewable: boolean`; never writes cookies |
| `POST /routes/auth/refresh` | rotates a refresh token sent in the JSON body | **retired (404)** — its only caller was the self-fetch |
| `POST /routes/admin/refresh` | same, for admins | **retired (404)** |

These are the only edits the Task 3 contract suite receives. Each is written as
an expected-new-behaviour assertion with a comment pointing here.
`docs/AUTHN-AUTHZ.md` records the change (Task 20).

**Not taking a package dependency.** `@byline/auth` is a dependency-free leaf,
but its actor classes and `RequestContext` overlap with Modulus core's own, and
Byline is not yet part of this application. The coordination module
(~100 lines) and the middleware shape are ported as Modulus code. Infonomic
holds copyright on both codebases, so moving code from Byline (MPL-2.0) into
Modulus (AGPL-3.0) raises no licensing issue.

**Follow-on spec (not part of this plan): core session hardening.** DB-backed,
hashed refresh tokens per login (`user_refresh_tokens`, `admin_refresh_tokens`
with `sid`, `rotated_to_id`, `revoked_at`); rotation with replay revocation;
`sessionId` on issued tokens; server-side revocation on sign-out;
`session_version` revoke-all on password change/reset/disable; sign-in
throttling and timing equalization (closing the Honest Notes `TODO`s). Model it
on Byline's `SessionProvider` contract. This plan leaves the host ready for it.

## `_docker` And Deploy Changes

| File | Change |
|---|---|
| `_docker/gradebook/production/Dockerfile` | `build` stage runs `pnpm run build` (turbo: core `tsc` then `vite build`) and keeps `apps/gradebook/.output`. Final stage copies `.output/`, `package.json`, `email-templates/`, production `node_modules` (root + gradebook, for externals), `packages/core/{dist,package.json}` + its prod `node_modules`. Remove `.next/standalone`, `.next/static`, `src/content` copy (docs become bundled), `NEXT_TELEMETRY_DISABLED`, and the `IMAGE_VOLUME` (`.next/cache/images`) volume + arg. Reassess the 6 GB build heap. |
| `_docker/gradebook/production/Dockerfile-ubuntu` | Same edits, or delete if unused — decide in Task 19. |
| `_docker/gradebook/start-node.sh` | `exec node --max-old-space-size=… .output/server/index.mjs` from `/app/apps/gradebook`; drop the Fly/prisma boilerplate comments, `NEW_RELIC_APP_NAME` and the `-r newrelic` line. Dockerfile drops its `NEW_RELIC_*` `ENV` lines. |
| `_docker/gradebook/nginx/nginx.conf` | Update the long-cache static location from `^/(build/\|fonts/)` to `^/(_build/\|fonts/)`; optionally serve `.output/public` directly from nginx. Log formats: `$request` → `$request_method $uri $server_protocol`, drop `$http_referer`, `$loggable` map keyed on `$uri` (see Request Logging). `/elb-status`, plausible proxy and `@nodejs` are unchanged. |
| `_docker/gradebook/supervisord.conf` | node `stopwaitsecs` 10 → 80 (shutdown deadline chain, Deployment Modes item 5). |
| `_docker/gradebook/production/docker-compose.yml`, `build-prod.sh` | Env file and image name check; no structural change expected. |
| `.dockerignore` | Replace `apps/gradebook/.next` with `.output`, `.nitro`, `.tanstack`. |
| `fly-gradebook-frontend.toml`, `fly-gradebook-backend.toml` → `fly-gradebook-admin.toml` | Rename the admin toml (Fly app name unchanged). Add `kill_timeout` (admin 90, frontend 30). Drop `IMAGE_VOLUME` build arg; `NEXT_PUBLIC_*` → `VITE_*`; drop `NEW_RELIC_*`; remove variables the mode no longer requires; rewrite the header comments (the per-instance origin is now runtime-correct). |
| `scripts/fly-deploy-gradebook-backend.sh` → `fly-deploy-gradebook-admin.sh`, `fly-deploy-gradebook.sh`, `fly-gradebook-image.sh` | Rename and update toml references; verify build args. |

## Decisions This Plan Makes

- **In-place port on `feat/tanstack`**, not a sibling `apps/gradebook-start`.
  The package name, turbo wiring, Docker paths and Fly config stay pointed at
  one directory. Use a `develop` worktree as the running Next reference during
  the port.
- **Follow FORRU's skeleton** (`server.ts` / `start.ts` / `router.tsx` /
  `client.tsx`, Vite 8 + `nitro/vite` `preset: 'node'`, `resolve.tsconfigPaths`,
  `rolldownConfig.external` for `react`, `react-dom`, `pino`, native and
  `__dirname`-dependent packages). FORRU learned the react-singleton and
  google-gax `__dirname` failures in production. Adopt those fixes up front.
- **Env files follow the TanStack Start / FORRU convention.** The committed
  `apps/gradebook/.env` holds only public, commit-safe values (the `VITE_*` keys
  and non-secret defaults). The gitignored `apps/gradebook/.env.local` holds
  every secret. `.env.public` is folded into `.env` and deleted. Vite loads both
  natively. Next also reads `.env` and `.env.local` natively during the
  transition, so the manual `dotenv` loading in `next.config.ts` goes away. The
  production `start` script runs `node --env-file=.env.local …` locally; Fly
  supplies env in deployment. One divergence from FORRU stays: the public server
  URL reaches the client at runtime, because Modulus deploys one image under two
  origins.
- **`@infonomic/uikit` stays.** It is the 1:1 sibling of `@byline/ui`, so no UI
  kit change is part of this migration.
- **New Relic is dropped.** Remove the `newrelic` dependency, the
  `NEW_RELIC_*` `ENV` lines in the Dockerfile, the `NEW_RELIC_*` vars in both Fly
  tomls, and the commented `-r newrelic` line in `start-node.sh`.
- **Keep `react-hook-form` and `useActionState`.** The migration changes the
  framework, not the form library.
- **Bundle the docs content** with `import.meta.glob('…/*.md', { query: '?raw' })`
  so the image no longer depends on `src/content` at a cwd-relative path.
- **Vite asset dir collision:** `public/assets/` already exists and Vite emits to
  `/assets/` by default. Set `build.assetsDir` to `_build` (and add it to
  `NON_LOCALIZED_SEGMENTS`) instead of moving public files.
- **Dev port stays 3000** so OAuth return URLs and `.env` examples hold.
  `devlti` becomes `vite dev` with `server.https` reading
  `certs/local.{key,crt}` and `server.host = 'modulus.infonomic.local'`.

## Execution Rules

- **Two runnable apps during the transition.** `next` stays installed, and Next
  remains the default `dev`/`build`/`start`, until Task 18 switches the scripts
  and removes it. The Start app is runnable from Task 4 via `dev:start`,
  `devlti:start`, `build:start` and `start:start`.
- **Ported code goes in new files.** Next-only files (anything importing
  `next/*`, `app/**`, `middleware/**`, `'use server'` action modules) are not
  edited to suit Start; their Start replacements are written alongside them, and
  Task 18 deletes the Next set in one step. Framework-neutral modules — pure
  utilities, validation, `config`, `src/lib/core/instance.ts`, the
  deployment-mode classifier — are shared and edited in place, and must keep
  working for both apps. `src/core-adapter.ts` is the Next adapter; it only
  changes to delegate to `instance.ts`.
- **Green after every task:** `pnpm -F @modulus-learning/gradebook typecheck`,
  `pnpm lint:check`, both vitest modes, and — from Task 4 until Task 18 —
  **both** `next build` and `build:start`. Commit per task, conventional
  commits, no trailers.
- The route-contract suite (Task 3) takes its base URL from env, so it runs
  against either server. Until Task 8 it gates the Next app; from Task 8 on it
  gates the Start app. It is never edited to make the port pass. The three
  [Legacy Session Endpoints](#legacy-session-endpoints) changes are its only
  sanctioned edits. Any other diff is either a bug in the port or a decision to
  document here first.
- No Next import may remain at the end of Phase 5; Task 18 enforces that with a
  Biome `noRestrictedImports` rule for `next/*`.

## Dependency Map

```text
T1 spike ─► T2 config ─► T4 scaffold ─► T5 entry+middleware ─► T6 server-fn factories ─► T7 session renewal
                │                              │                                                 │
T3 contract suite (vs Next) ──────────────────►T8 route handlers ◄───────────────────────────────┘
                                               │
                     T9 root/i18n/theme ─► T10 public ─► T11 forms ─► T12 auth area ─► T13 LTI/agent pages
                                                                         │
                                                                    T14–T15 admin
                                                                         │
                                        T16 tests ─► T17 jobs/shutdown ─► T18 cleanup ─► T19 docker/fly ─► T20 docs ─► T21 verify
```

## Phase 0 — Groundwork

### Task 1 — Spike: confirm framework capabilities

**Done 2026-10-23** — see [Spike Findings](#spike-findings). Original scope:

Throwaway branch work, findings recorded at the end of this spec:

- CSP nonce: confirm the current Start API for nonce-ing hydration/inline scripts
  (router `ssr.nonce` or equivalent) and that `EarlyThemeDetector` can receive it.
  CSP is off in production today (`NEXT_PUBLIC_CSP_ENABLED=false`), so a gap here
  lowers priority but must be written down.
- Server entry sees `/_serverFn/*` and handler routes before the router (FORRU
  relies on this for uploads; confirm for POST bodies — the LTI launch body must
  not be consumed by the gate).
- `server.handlers` returning a `Response` with multiple `Set-Cookie` headers and
  a 303 (LTI launch `ltiSeeOther`).
- `argon2`/`bcrypt` load as Nitro externals in a built `.output`.
- **Next and Start coexisting in one package:** `next build` and `vite build`
  both succeed with `vite.config.ts`, `next.config.ts`, `postcss.config.js` and
  `@tailwindcss/vite` all present, and Next's `env` option can forward `VITE_*`
  values to its client.
- **Nitro shutdown:** does the node preset install `SIGTERM`/`SIGINT` handlers or
  a shutdown timeout of its own? How do we run the job drain before it, or
  through it?
- **Canvas iframe renewal prototype:** a minimal Start page inside a Canvas (or
  local LTI-harness) iframe, run under Chrome and Safari default and strict
  third-party settings. Record whether the learner cookies are set and sent, and
  whether Web Locks, BroadcastChannel and sessionStorage are available or throw.
  Confirm that the blocked-cookie path reaches the bounded "session unavailable"
  state.

### Task 2 — Mode-aware config (host and core)

`src/config/index.ts`: split into `common`/`frontend`/`admin` schemas, compose by
`DEPLOYMENT_MODE`, keep the jobs `superRefine`. Extend
`config/index.test.node.ts` with a matrix: each mode × missing-section →
fails / passes. Apply the core change in
[Permitted Core Changes](#permitted-core-changes): `oauth` becomes optional at
core load and is checked when Google/GitHub sign-in is invoked, with core unit
tests for both paths. Add a node **boot test** for each mode: build an env
containing only that mode's permitted variables (from a fixture per mode, which
also becomes the source for `.env.example` sections and the Fly tomls), then
assert that the host config parses **and** `initCore()` initialises. If the test
shows core needs anything else per mode, either keep that variable in the mode's
permitted set or come back here before widening the core change. This task is
framework-neutral and can be cherry-picked to `develop` independently. The `NEXT_PUBLIC_*` → `VITE_*` rename happens in Task 4
alongside the Vite config, because Next cannot read `VITE_*` values on the client.
It covers `config/index.ts`, `.env.public`, `.env.example`, both Fly tomls, and
the core `.env` examples if any reference them.

### Task 3 — Route-contract test suite

A node-mode vitest suite that drives every `/routes/*` handler and the gated page
paths through `fetch` against a running server (base URL from env), asserting
status, `Location`, `Set-Cookie` attributes, CORS headers and JSON shapes, plus
mode behaviour (run per `DEPLOYMENT_MODE`: blocked → 404, admin apex → redirect,
neutral → 200). Run it against the Next app on `develop` first. Record any
existing behaviour that looks wrong rather than fixing it here.

## Phase 1 — Skeleton

### Task 4 — Scaffold TanStack Start in place

- Dependencies: **add** `@tanstack/react-start`, `@tanstack/react-router`,
  `@tanstack/react-router-devtools`, `vite`, `nitro`, `@tailwindcss/vite`, pinned
  to the versions FORRU runs. **Remove** only what neither app uses: `newrelic`,
  `pino-http`. `next`, `@next/env`, `@tailwindcss/postcss`, `postcss.config.js`,
  `autoprefixer` and `cssnano` stay until Task 18.
- Env rename `NEXT_PUBLIC_*` → `VITE_*` across `config/index.ts`, `.env.example`
  and both Fly tomls. `next.config.ts` drops its manual `dotenv` loading and
  forwards the client-visible `VITE_*` values through its `env` option, so the
  Next app keeps working until Task 18. Add the boot-time baked-vs-runtime
  `VITE_*` drift warning.
- **Env file split** — in this order, because the current `apps/gradebook/.env`
  holds secrets and is about to stop being ignored:
  1. Copy the developer's `apps/gradebook/.env` to `.env.local`, which is
     already ignored by `.env*.local`. Confirm with
     `git check-ignore apps/gradebook/.env.local`.
  2. Rewrite `apps/gradebook/.env` with only public values: the `.env.public`
     keys renamed to `VITE_*`, plus non-secret defaults. Delete `.env.public`.
  3. Guard check: `.env` contains no key matching
     `SECRET|PRIVATE|PASSWORD|TOKEN|CONNECTION_STRING|CLIENT_SECRET|SMTP_USER|ACCESS_KEY`.
     A node test enforces the same rule, so a future secret cannot slip into
     the committed file.
  4. Only then un-ignore it: `!.env` in `apps/gradebook/.gitignore` (which
     overrides the root `.env` rule). Update `.dockerignore` so
     `apps/gradebook/.env` enters the build context and `.env.local` never does.
  5. `.env.example` becomes the template for `.env.local` (secrets only).
     `CLAUDE.md` and the README setup steps say "copy `.env.example` to
     `.env.local`".

  `packages/core/.env` is untouched; core is not a Vite app.
- `.gitignore`: add `/.output/`, `/.nitro/`, `/.tanstack/` (the spike's first
  commit attempt staged `.output/`). `biome.jsonc`: ignore `routeTree.gen.ts`
  and the build output directories.
- `vite.config.ts` carries the spike's proven settings: `css.postcss.plugins: []`
  (Next keeps `postcss.config.js` until Task 18; Vite uses `@tailwindcss/vite`),
  `build.assetsDir: '_build'`, native modules in `ssr.external` and in Nitro's
  `rolldownConfig.external`, and React externalised by **pattern**
  (`/^react(-dom)?(\/.*)?$/`), not by name.
- Add `vite.config.ts` (FORRU shape, minus Byline specifics), `src/server.ts`,
  `src/start.ts`, `src/router.tsx`, `src/client.tsx`, minimal `__root.tsx`.
- `tsconfig.json`: keep the `next` plugin and `.next` includes; add
  `vite/client` types. `package.json` adds the `*:start` scripts beside the Next
  ones; `typecheck` stays `next typegen && tsc --noEmit` until Task 18.
  `biome.jsonc`: ignore `routeTree.gen.ts`.
- `vitest.config.ts`: `resolve.tsconfigPaths` instead of `vite-tsconfig-paths`.
- `next.config.ts` changes only to add the `env` forwarding above.
  `next-env.d.ts`, `proxy.ts`, `instrumentation.ts` and `app/**` are untouched.
  All of them are deleted in Task 18.

### Task 5 — Server entry and global request middleware

- `src/server.ts`: AsyncLocalStorage scope (request id + log record; a Start-side
  `lib/request-id` alongside the Next one) and the access-log wrapper around the
  entire entry `fetch`. Inside it: the deployment-mode gate using `isRouteAllowed`
  (extend `classifyRoute`'s neutral set with `/_serverFn`, the asset dir,
  `/fonts`, `/modules`), the admin apex redirect, the `withActivity` redirect, and
  an ordered slot for the locale negotiation redirect (implemented in Task 9).
- `src/start.ts`: CSRF (`createCsrfMiddleware`, filtered to server fns), then a
  request-kind classifier (Byline's `sessionRequestMiddleware`: SSR vs server
  fn, recorded server-side so no header can claim SSR) that also annotates the
  log record, then flash read-and-clear and the CSP nonce/header. **No session
  refresh here** — see Authentication And Sessions.
- The logging coverage test from Request Logging.
- `src/lib/session/context.ts`: verification-only `getUserSessionContext()` /
  `getAdminSessionContext()` memoized with `oncePerRequest`, returning
  `valid | renewable | anonymous`. Replaces `getUserSession`/`getAdminSession`
  and their React `cache()`. `withUserSession`/`withAdminSession` and the
  HTTP self-fetch are deleted with the proxy in Task 18.
- Port `proxy-matcher.test.node.ts` to a server-entry classification test.
  Keep `deployment-mode` tests unchanged — the classifier is reused verbatim.

### Task 6 — Server-function factories and core adapter

- `src/lib/server-fn.ts`: `frontendSurfaceFn`, `adminSurfaceFn` (surface gate
  only), `appFn`, `adminFn` (surface + required context + expected-principal
  check; the renewal boundary is added in Task 7).
- Core wiring split per Target Architecture: extract `src/lib/core/instance.ts`
  from `core-adapter.ts`, and make `core-adapter.ts` delegate to it with
  unchanged exports (move `core-adapter.test.node.ts` coverage to `instance.ts`
  and keep a thin Next-adapter test). Add `src/lib/core/start-adapter.ts`.
  Both `next build` and `build:start` stay green.
- The convention test described in Target Architecture.

### Task 7 — Explicit session renewal and browser coordination

- `src/lib/session/coordination.ts`: port Byline's `session-coordination.ts`
  (single-flight, Web Locks queue `modulus.auth`, BroadcastChannel
  `modulus.session`, session-changed flag). Track the expected principal from
  page data, and feature-detect every browser API with in-memory fallbacks (see
  the Canvas iframe constraint). Use separate keys for the learner and admin
  domains, because they are independent sessions that may coexist in one
  browser.
- `modules/app/session/renew.ts` (`frontendSurfaceFn`) and
  `modules/admin/session/renew.ts` (`adminSurfaceFn`): POST renewal server fns
  over the core refresh commands. They no-op on valid access, keep the cookie
  attributes unchanged, set `Cache-Control: no-store`, and return the renewed
  principal. They are never wrapped by the renewal boundary.
- Renewal boundary in `appFn`/`adminFn`, following the replay rules in
  Authentication And Sessions item 4.
- Bootstrap routes `/auth/renew` and `/admin/renew` (chromeless; `return`
  validated with `lib/safe-redirect.ts`; `_renewed=1` loop guard; terminal and
  transient outcomes as specified) for server-render recovery, and a
  `SessionRecovery` component for public layouts.
- Sign-in and sign-out server fns (surface-only factories) run inside the
  coordination queue and broadcast on success.
- Tests (node):
  - renewal no-ops when access is still valid;
  - renewable → renew → replay, exactly once;
  - **handler errors never trigger replay** (the boundary reached `next()`);
  - **network error, timeout and abort never trigger replay**, nor do 5xx
    without the signal or a missing header;
  - a principal mismatch after renewal blocks replay and flags the change;
  - a pre-handler `changed` response for a mismatched principal never runs the
    handler;
  - a non-re-sendable body surfaces the retry error;
  - concurrent calls renew once;
  - calling the renewal fn never re-enters the boundary (no recursion);
  - the coordination fallbacks work with Web Locks, BroadcastChannel and
    sessionStorage each absent or throwing;
  - successful renewal writes exactly the new access/refresh pair, with the
    unchanged attributes;
  - **failed renewal (terminal or transient), the bootstrap route,
    verification and the renewal boundary write or delete no cookie**; a failed
    renewal racing a concurrent sign-in leaves the new cookies intact;
  - `changed` survives the boundary, and a handler-set `x-modulus-auth-boundary`
    is stripped;
  - the bootstrap loop guard holds; terminal failure → sign-in (or the iframe
    state); transient failure → bounded error with no auto-retry;
  - `return` open redirects are rejected.

  Port the applicable cases from Byline's `session-coordination.test.node.ts`
  and `session-middleware.test.node.ts`.

## Phase 2 — Route Handlers

### Task 8 — Port all `/routes/*` handlers

One file per handler under `src/routes/routes/**` using `server.handlers`. Port
order follows risk: `elb-status`, `keep-alive` → `lti/jwks` → `lti/login` →
`lti/launch` → `lti/deep-link/activities` → `agent/*` → `auth/session`
(verification-only) → `oauth/*`. `auth/refresh` and `admin/refresh` are not
ported (retired — see Legacy Session Endpoints). Copy the existing
`route.test.node.ts` files alongside the new handlers, swapping the
`next/headers` mocks for the Start server helpers. The Task 3 suite must be green
for each handler before the next starts. At the end of this phase the new app can
serve a full Canvas launch → agent token → progress flow with stub pages.

## Phase 3 — Shell And Frontend Surface

### Task 9 — Root document, i18n, theme, providers

`__root.tsx` with `head()`, `HeadContent`/`Scripts`, `staticData`-driven
`themeContext`/chrome (public, protected, chromeless LTI), analytics script,
`EarlyThemeDetector`, `<html lang>` from the URL, and a root loader delivering
public config. `lib/meta.ts` moves to the `head()` shape (`createTranslator`
for localized titles).

i18n migration to the reference strategy, as specified in
[Internationalisation](#internationalisation):
- `$lng/route.tsx` with `params.parse` (`notFound()` for a non-routable
  locale), `beforeLoad` → `context.locale`, and a loader that provides
  `TranslationsProvider`.
- `router.tsx` `rewrite.input`/`output` using `locale-rewrite.ts`, with the
  Modulus `NON_LOCALIZED_SEGMENTS`. `negotiateLocaleRedirect` is wired into
  `src/server.ts`; Task 5 left a placeholder for it.
- `translations/index.ts` (`?raw`, English fallback merge, `createTranslator`),
  `detect-locale.ts`, `set-language-fn.ts`, `use-locale-navigation`,
  `use-language-switcher`, and the `*.start.tsx` `LangLink` / `LanguageMenu` /
  `AvailableLanguages`.
- Upgrade the shared `translations-provider.tsx` (`rich()`), and audit
  `en.json`/`es.json` to ICU: `{{date}}` → `{date}`, and numbered tags → named
  tags rendered with `rich()`.
- Tests, ported from FORRU and adapted to interface-only locales:
  `locale-rewrite.test.ts` (input prefixing, output de-defaulting only,
  non-localized and asset paths untouched, query/hash preserved, input∘output
  round-trip for every public path in the route tree);
  `translations/index.test.ts` (namespace lookup, English fallback for a
  missing `es` key, ICU interpolation, plural and date); and
  `detect-locale.test.node.ts` (cookie > path > Accept-Language > default,
  tampered cookie, malformed header). Add a
  `server-locale-redirect.test.node.ts` covering: GET-only; bare path with an
  `es` cookie → 302 `/es/…`; `/en/…` → 301 clean; `/es/…` with an `en` cookie →
  no redirect; non-localized paths untouched.

### Task 10 — Public pages

`_public` layout + home, about, docs index, `docs/$slug` (bundled markdown),
not-found splat. Replace `next/image` uses here.

### Task 11 — Forms pages

`_forms` layout + sign-in, sign-up (registration stepper, reCAPTCHA), and
`start-activity/$` (port `page.test.node.tsx` to a loader/server-fn test).
Sign-in/registration → `frontendSurfaceFn`; password and other signed-in actions → `appFn`.

### Task 12 — Authenticated learner/instructor area

`_auth` layout with `beforeLoad` ability checks (replaces `withUserAuth`'s
regex table, preserving `callbackUrl` and the locale-aware redirects) +
`UserSessionProvider` from context. Dashboard, activity-code pages (activities,
edit, completion, learners), create-activity-code, account (OAuth link buttons).
All `modules/app/**` actions → `appFn`; `revalidatePath` → `router.invalidate()`.

### Task 13 — LTI and agent chromeless pages

`/lti/deep-link`, `/lti/error`, `/lti/launch/$activity_id`, `/agent/error`, and
the dynamic-registration page at its existing URL **`/routes/lti/register`**
(`src/routes/routes/lti/register.tsx` — not moved to `/lti/register`), all
with the chromeless document variant. The Task 3 contract suite covers the
registration URL. Port their
`page.test.node.tsx` files. The `beforeLoad` defence-in-depth guard is a new
TanStack `notFound()` variant, because the server entry now covers these paths.
`deployment-mode-guard.ts` stays for the Next layouts and is deleted in Task 18.

## Phase 4 — Admin Surface

### Task 14 — Admin shell and sign-in

`$lng/_admin` layout (surface guard + admin session provider), `admin/sign-in`,
`admin/_authed` with `withAdminAuth` semantics in `beforeLoad`, app bar, menu
drawer, admin not-found.

### Task 15 — Admin pages

Dashboard (charts — confirm Recharts SSR), account, users, roles, admin-users,
admin-roles (including drag-sort `order` actions), LTI platforms (+ Canvas config
generator), activities / URL allowlist (impact preview, review flows). All
`modules/admin/**` actions → `adminFn`. Port the allowlist component tests.

## Phase 5 — Runtime, Tests, Cleanup

### Task 16 — Test suite parity

All 29 test files pass in both vitest modes; no test mocks a `next/*` module.
Add a smoke test that renders `__root` for each `themeContext`.

### Task 17 — Background jobs and graceful shutdown

Start jobs from `src/server.ts` (`globalThis` guard against HMR double-start)
when `jobQueue.enabled && mode !== 'frontend'`. Add the shutdown sequence from
Deployment Modes item 5: stop claiming work, await `StopHandle`, close Nitro in
the order the Task 1 finding requires, and enforce the `SHUTDOWN_DRAIN_SECONDS`
hard deadline. Boot validation warns when the drain deadline is shorter than the
request timeout. Also add the boot log line and `mode`/`jobs` in `elb-status`.
Unit-test the sequence with a fake `StopHandle` (completes, hangs past the
deadline, throws).

### Task 18 — Remove Next

Delete `next.config.ts`, `next-env.d.ts`, `proxy.ts`, `middleware/` (Next proxy
layers), `instrumentation.ts`, `app/`, every `'use server'` action module and
other Next-only file superseded by a Start replacement, `core-adapter.ts` (the
Next adapter), `utils/utils.framework.ts`
if Next-only, the `session-old.ts` / `.bak` leftovers, and the Next i18n set listed in
Internationalisation → Coexistence (renaming the `*.start.tsx` i18n components
into place). Remove `react-cookie`. Remove the `next`,
`@next/env`, `@tailwindcss/postcss`, `autoprefixer` and `cssnano` dependencies
and `postcss.config.js`. Switch `dev`/`devlti`/`build`/`start` to Start, drop
the `*:start` aliases, set `typecheck` to `tsc --noEmit`, and remove the `next`
tsconfig plugin. Add a Biome `noRestrictedImports` rule for `next` and `next/*`.
`pnpm build` must produce `.output/` with no warnings about unresolved externals.

## Phase 6 — Packaging, Docs, Verification

### Task 19 — `_docker` and Fly

Apply the `_docker And Deploy Changes` table. Build locally with
`DOCKER_PLATFORM=linux/arm64`, run `docker-compose.yml` against local Postgres in
each mode, and run the Task 3 suite against the container. Two additional checks:
- **Termination test:** in `admin` mode with a slow mock LTI platform, start a
  score submission and `docker stop` (default `TERM`) mid-request with a stop
  timeout matching the Fly `kill_timeout`. Assert from the logs that the
  submission completes and the process exits cleanly. Then re-run with a
  platform slower than the drain deadline: the process exits at the deadline,
  and another worker reclaims the line item once its lease expires. Check how a
  re-sent score is handled under AGS timestamp semantics.
- **Edge log check:** request an agent `authorize` URL with a query string, and
  assert that neither the nginx access log nor the pino line contains the query.

Deploy to Fly only with explicit approval.

### Task 20 — Documentation

Rewrite `docs/DEPLOYMENT.md` ("Route surfaces and where they are gated", "A note
on framework dependency") in TanStack terms. Update `docs/ARCHITECTURE.md` §7,
`docs/TESTING.md`, `docs/AUTHN-AUTHZ.md` (refresh path), `CLAUDE.md` (repo map,
`devlti`, commands), `.env.example` (renamed vars, per-mode sections). Follow the
`writing-docs` skill.

### Task 21 — End-to-end verification

- `pnpm run ci` green.
- Manual LTI 1.3 launch from Canvas via `devlti` (resource link, deep link,
  interstitial `always` and `never`), score passback observed through the worker.
- Agent demo (`apps/agent-demo`) completes authorize → token → progress against
  the new app.
- Split topology: two containers (`frontend` + `admin`) share one DB. Confirm
  cross-surface 404s, admin explicit renewal (no self-fetch), and that jobs run
  only on `admin`.
- Lighthouse/a11y spot check against `docs/ACCESSIBILITY-AUDIT.md` baselines.

## Risks

| Risk | Mitigation |
|---|---|
| A server function ships without a surface guard | factory-only convention + convention test (Task 6) |
| Cookie attribute drift breaks the Canvas iframe session | contract suite asserts raw `Set-Cookie`; manual Canvas launch in Task 21 |
| SSR externals (react singleton, google-gax `__dirname`, native hashes) only fail in built output | adopt FORRU externals up front; Task 1 builds `.output` early; Task 19 runs the container |
| Locale rewrite swallows a non-localized path | explicit `NON_LOCALIZED_SEGMENTS` + rewrite unit tests (FORRU pattern) |
| The URL-wins negotiation change surprises returning users | recorded as a deliberate contract change; the cookie still drives bare-path negotiation; Task 3 asserts the three changed cases |
| `/assets` collision between `public/assets` and Vite output | `build.assetsDir = '_build'` |
| Large surface (60 pages, 45 action modules) stalls mid-port | handlers first so the critical path works early; each phase leaves a bootable app |
| A replayed mutation runs as the wrong account or runs twice | replay only on the pre-handler `renew` signal with a matching principal; never on handler, network or ambiguous outcomes (Task 7 tests) |
| Renewal loops or dead-ends inside the Canvas iframe | `_renewed=1` URL guard, terminal/transient outcomes, feature-detected storage with in-memory fallback; spike confirmed the blocked-cookie path is real in Chrome (Spike Findings 9, Open Question A) |
| An admin instance cannot boot without learner-side credentials | per-mode boot test of host config **and** `initCore()` (Task 2) |
| A deploy kills a passback mid-flight | deadline chain app < supervisord < Fly; termination test (Task 19) |
| Credentials leak into edge logs | nginx logs `$uri` without the query, no referer; edge log check (Task 19) |
| Running two frameworks in one package breaks either build | Next and Start coexistence checked in the Task 1 spike; both builds gate every task until Task 18 |

## Open Questions

Outstanding (need the human; work proceeds around them):

A. **Partitioned (CHIPS) learner cookies.** The spike showed that with
   third-party cookies blocked, Chrome drops the `SameSite=None` learner cookie
   inside the cross-site frame, so the LTI learner session cannot work today
   under that setting. A `Partitioned` cookie survives. Adding `Partitioned` to
   the learner session/refresh cookies (and the LTI state cookie) would make
   Canvas launches work under third-party-cookie blocking. It also changes the
   cookie attributes Non-Negotiable Contract 3 freezes, and it scopes the
   session to the Canvas top-level site, which is the desired behaviour for LTI
   but must be confirmed for direct visits. Until decided, attributes stay
   byte-for-byte, and the bounded "session unavailable" state is the designed
   outcome. Recommendation: adopt `Partitioned` for the learner cookies as a
   separate, small follow-up after Task 8, tested on the Canvas installation.
B. **Safari behaviour** is untested (no Safari automation, no Canvas here).

Resolved 2026-10-23:

1. **Mode naming** — keep `admin`, no `backend` alias; repo files renamed to
   `admin`, Fly app name unchanged (Deployment Modes).
2. **Per-surface builds** — no; every build contains both surfaces.
3. **New Relic** — dropped.
4. **Request logging** — one pino line per request from the server-entry
   wrapper in `src/server.ts`, which covers early responses; request middleware
   only annotates it; nginx formats drop the query and referer; `pino-http`
   removed (Request Logging).
5. **Public env names** — `NEXT_PUBLIC_*` → `VITE_*`, no fallback window; the
   public server URL is delivered at runtime.

## Implementation Notes (Tasks 3–19, 2026-10-23)

Recorded while the checkpoint 1 review was pending; the work sits on
`wip/tanstack-next`, stacked on `feat/tanstack` and rebased if review asks for
changes.

- **Task 3:** the contract suite (`apps/gradebook/src/contract/`, `pnpm test:contract`)
  passes against the Next app in all three modes without a database (44 / 45 / 18
  checks). It records three existing behaviours as `todo` rather than contract:
  `/routes/keep-alive` pings `VERCEL_URL`; the GitHub OAuth callback redirects
  to an unvalidated absolute `source` (an open redirect); `/es/admin/sign-in`
  appears to redirect to itself. The Start target for `/routes/auth/session`
  conveys `renewable` in the `x-modulus-session-renewable` header, keeping the
  body (`session | null`) unchanged.
- **Task 4:** `vite-tsconfig-paths` stays in `vitest.config.ts` (the Vite 8
  `resolve.tsconfigPaths` option is not available to vitest 4 here). `start:start`
  uses `node --env-file-if-exists=.env.local`. The developer's local `.env` →
  `.env.local` move happened in the worktree only; the main checkout's untracked
  `.env` still holds secrets and must be moved before `feat/tanstack` advances to
  this point (git will refuse to overwrite it, which is the safe failure).
- **Task 5:** server-fn names: see Spike Findings 12.
- **Task 6:** the verification-only session context (`src/lib/session/context.ts`,
  originally a Task 5 bullet) landed here with the core adapter split.
- **Task 7:** the expected-principal check (originally listed under Task 6)
  landed with the boundary in Task 7. Factories became gate middleware (Spike
  Findings 11). Sign-in and sign-out server functions are not written yet: the
  coordination helpers they use exist (`coordinateAuthAction`,
  `notifySessionAction`), and the functions arrive with the sign-in forms in
  Tasks 11 and 14. An end-to-end run in headless Chrome against the built server
  confirmed the renew page → RPC → terminal → sign-in flow, a 404 for the
  learner renewal RPC on an admin instance, CSRF 403 for a foreign origin, and
  found (and fixed) a double renewal caused by an unstable default prop. The
  iframe harness was not moved into the branch: its probe routes are spike-only
  and must not ship; Task 21 reruns it from `spike/tanstack`.

- **Task 8:** each `/routes/*` handler is a `server.handlers` file route whose
  body dynamic-imports a `*.server.ts` half, so no server-only module enters the
  client graph. `/routes/lti/register` renders its failure on the page instead
  of returning a bare 500.
- **Task 9:** `getRootConfigFn` returns `{ publicConfig, analyticsEnabled, flash }`
  once per page load. The ICU syntax in `en.json` / `es.json` was corrected where
  the new formatter rejected it.
- **Framework adapter (between Tasks 9 and 10):** components shared by both hosts
  import `Link`, `Image`, `useRouter`, `usePathname` and friends from
  `@/framework`. TypeScript resolves it to the Next implementation
  (`framework/index.ts`); the Start Vite config aliases it to
  `framework/start.tsx`. A parity test keeps the two export lists equal. This
  replaced per-component `*.start.tsx` copies; `lang-link.start.tsx` was removed.
  Task 18 collapses the adapter into plain TanStack imports or keeps it as a thin
  seam, whichever reads better then.
- **Host overrides (Task 11):** a `x.start.ts` sibling replaces `x.ts` in the Start
  build (Vite plugin `hostOverrides`); `import … from './x.ts?original'` reaches
  the original. A convention test requires each override to export the same
  names. Used for registration, the OAuth starts and the bridged actions below.
- **Action bridge (Task 12, transitional):** the Next server actions under
  `modules/app/**` and `modules/admin/**` run unchanged on the Start server.
  Vite aliases `next/headers` and `next/navigation` to shims over the Start
  request (`lib/next-shims/`), `core-adapter.start.ts` maps the Next core adapter
  onto `lib/core/start-adapter`, and each action module has a generated
  `.start.ts` stub that calls a generic server function (`invokeAppAction` /
  `invokeAdminAction`, each behind its surface and session middleware). The
  server looks the action up in `ACTION_REGISTRY` by key; anything not listed is
  rejected. A `redirect()` thrown by an action comes back as a URL the stub loads with a full-page navigation. Task 18
  converts these to native server functions and deletes the bridge.
- **Task 13:** the LTI and agent error pages accept only known error codes; an
  unknown `code` 307s to the page without it, where Next rendered a generic
  message. The deep-linking logic moved to `deep-linking.logic.ts`, shared by the
  Next action and the Start server function.
- **Tasks 14–15:** admin sign-in sits outside the `_authed` layout, which fixes
  the Next `/es/admin/sign-in` self-redirect (now a Start-only contract check).
  The admin `callbackUrl` passes through `safeCallbackPath`, closing the Next
  open redirect. Loaders that 404 on a missing record return the narrowed record,
  so a missing `data` is a 404 where Next would have thrown during render.
- **Task 16:** the `__root` smoke test became a contract check
  (`shell.contract.ts`): `lang` and `data-theme-context` for public, forms and
  admin pages, passing on both hosts. Rendering `__root` in jsdom would have
  needed stubs for every piece it exists to test. Tests that still mock `next/*`
  belong to files Task 18 deletes, plus `create-activity-code.test.node.ts`,
  whose action converts in Task 18.
- **Task 17:** `src/lib/shutdown.ts` holds the sequence; `src/server.ts` wires it.
  Jobs start without blocking the entry module, so HTTP comes up while core
  initialises. Only an instance that runs jobs installs signal handlers; a
  frontend instance keeps Nitro's own close (it exited about 1 s after `TERM`).
  The drain waits for the job `StopHandle` and then for requests the entry
  pipeline still holds; a streamed body's tail is left to Nitro's
  `SERVER_SHUTDOWN_TIMEOUT`. `SHUTDOWN_DRAIN_SECONDS` (default 70) and a mirror of
  core's `LTI_SCORE_SUBMISSION_REQUEST_TIMEOUT_SECONDS` feed the boot warning.
  `/routes/elb-status` returns `{ status, mode, jobs }`.

- **Redirects behind the proxy (found in Task 19):** Start builds an absolute
  `Location` from `request.url`, which behind nginx is `http://` plus the
  proxied Host. Locally that dropped the port; on Fly it would name `http://`
  behind the TLS edge. The entry pipeline now rewrites a same-origin `Location`
  to a relative one (`relativeSameOriginRedirect` in `src/lib/entry.ts`), which
  covers handler, router and entry redirects alike. Server functions are not
  affected: Start's CSRF check reads `Sec-Fetch-Site` before it falls back to
  comparing `Origin` with `request.url`. A browser that sends no
  `Sec-Fetch-Site` would hit that fallback; passing `origin` to
  `createCsrfMiddleware` would close the gap and is left for Task 18.
- **Task 19 (ahead of Task 18):** the Dockerfile builds core and runs
  `build:start` explicitly (marked `TODO(Task 18)`: it becomes `pnpm run build`).
  `Dockerfile-ubuntu` was unreferenced and is deleted. The build heap dropped
  from 6 GB to 3 GB (a local `vite build` peaks near 2.1 GB resident). The image
  sets `SERVER_SHUTDOWN_TIMEOUT=25`; supervisord `stopwaitsecs` is 80; Fly
  `kill_timeout` is 90 (admin) and 30 (frontend). Each toml lists only what its
  mode needs (per `config/fixtures/mode-env.ts`). Compose reads `.env` and an
  optional `.env.local`. nginx serves nothing from `.output/public`: `/_build`
  and `/fonts` get a one-year cache header and fall through to Node. Verified
  on a local arm64 image: the contract suite passes through nginx in all three
  modes, `docker stop` drains and exits 0, and an agent `authorize` query string
  reaches neither the nginx nor the pino log. **Not run:** the termination test
  against a slow mock LTI platform. It needs a working database, and the local
  `modulus` credentials currently fail (port 5432 is held by another project's
  container).

## Spike Findings

Recorded 2026-10-23. Spike branch `spike/tanstack` (`4c50a7b`), off
`feat/tanstack` at `b6f93c7`. The spike code is throwaway, except the iframe
harness, which Task 7 reuses.

| # | Question | Finding | Spec consequence |
|---|---|---|---|
| 1 | Next and Start in one package | `next build`, `vite build`, `typecheck` (`next typegen && tsc`) and both vitest modes all green with `vite.config.ts`, `src/{server,start,router,client}.tsx`, `src/routes/**` and `routeTree.gen.ts` present. Two traps: Vite picks up Next's `postcss.config.js` (fixed with `css.postcss.plugins: []`), and Next fails on stale `.next/dev/types` from an old dev run (cleared by deleting `.next`; not a Start issue). `next build` also needs a fresh `packages/core/dist` — turbo's `^build` handles it, but a filtered build does not. | Task 4 bullets on `vite.config.ts`, `.gitignore`, `biome.jsonc`; run `pnpm -F @modulus-learning/core build` before a filtered gradebook build |
| 2 | React instances in SSR | Externalising `'react'`/`'react-dom'` by name left `react-dom/server` bundled, so SSR crashed with `dispatcher.getOwner is not a function` (two Reacts). A pattern `/^react(-dom)?(\/.*)?$/` fixes it. | Task 4 `vite.config.ts` |
| 3 | Server entry vs POST bodies | The gate in `createServerEntry.fetch` reads only the URL; an LTI-style form POST reached the handler with its body intact, and in `DEPLOYMENT_MODE=admin` the same POST returned 404 without the body being read. | Confirms Deployment Modes item 1 |
| 4 | Multiple `Set-Cookie` + 303 | A `server.handlers.POST` returning `new Response(null, { status: 303, headers })` with three appended `Set-Cookie` headers (`SameSite=None; Secure; HttpOnly`, and one `Path=/routes/lti/launch; Max-Age=0`) is emitted verbatim. | Confirms Task 8 approach for `lti/launch` |
| 5 | Native modules from `.output` | `argon2` and `bcrypt` hash and verify from the built server when listed in `ssr.external` and Nitro `rolldownConfig.external`. | Task 4 externals list |
| 6 | Build output layout | `build.assetsDir: '_build'` puts hashed assets at `/_build/…`, leaving `public/assets/` intact in `.output/public/assets/`. Tailwind v4 + uikit CSS compiles via `@tailwindcss/vite` (165 KB, utilities present). | Confirms the `_build` decision; nginx long-cache location is `/_build/` |
| 7 | Nitro shutdown | srvx `gracefulShutdownPlugin`: closes HTTP on `SIGINT`/`SIGTERM`, `SERVER_SHUTDOWN_TIMEOUT` default 5 s, never calls `process.exit`. A built server exited about 1 s after `TERM` when idle. | Deployment Modes item 5 updated |
| 8 | CSP nonce | Router option `ssr: { nonce }` is consumed by `HeadContent`, `Scripts` and `ScriptOnce`; the client reads the nonce from `<meta property="csp-nonce">`. Per-request: `getRouter()` runs per request on the server, so it can read the nonce from the AsyncLocalStorage request scope; `EarlyThemeDetector` should render through `ScriptOnce`. | Task 5 CSP item is implementable; no gap |
| 9 | Cross-site iframe (headless Chrome 155) | Parent on `127.0.0.1:3200`, tool on `localhost:3100`. **Default:** Web Locks, BroadcastChannel and sessionStorage all `ok`; `SameSite=None; Secure; HttpOnly` cookie set and returned. **Third-party cookies blocked** (`--test-third-party-cookie-phaseout`): all three APIs still `ok` (partitioned), but the `SameSite=None` cookie is **not** returned. A `Partitioned` cookie **is** returned. Headless `--virtual-time-budget` cut async probes short, so the harness reports via `sendBeacon` to the server instead. | Open Question A; the coordination fallbacks remain required (other browsers and policies may deny storage); the blocked-cookie bounded state is a real path |
| 10 | Unanswered | Safari (all settings); a real Canvas launch. | Open Question B; Task 21 on the Canvas installation |
| 11 | Server-fn wrapper factories (found in Task 7) | Start's compiler swaps a handler for a client RPC stub only on a literal `createServerFn(...).handler(...)`. Behind a wrapper (`appFn(...).handler(...)`) the handler body and its server imports stay in the client bundle; Start's import protection rejected `*.server.ts` imports reached that way. | "Surface-tagged factories" became **gate middleware**: every server fn is a literal `createServerFn(...)` whose first middleware is `frontendSurfaceMiddleware`, `adminSurfaceMiddleware`, `appSessionMiddleware` or `adminSessionMiddleware` (`@/lib/server-fn`). The convention test enforces the first-middleware rule. Server halves load via dynamic `import()` from `*.server.ts` (FORRU pattern). |
| 12 | `serverFnMeta.name` in production (found in Task 5/7) | In the production build the request middleware's `serverFnMeta.name` was undefined, so access lines for server fns carry the opaque `/_serverFn/<id>` route and no `server_fn` field. | Request Logging's "log the function name" is not met in production; the id is logged instead (still no query/body). Revisit if Start exposes the name. |
