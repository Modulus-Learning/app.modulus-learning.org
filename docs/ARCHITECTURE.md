---
title: "Key Architectural Decisions"
path: "architecture"
summary: "The load-bearing design decisions behind Modulus: a contract-based core resolved through a typed DI registry, a commands facade as the only public surface, single-instance in-process deployment, and three separate actor domains."
---

# Key Architectural Decisions

These are the load-bearing design decisions behind Modulus. Each is summarised
here and described in more depth in the matching reference document under
[`docs/`](.).

Modulus is a pnpm + Turborepo monorepo. Almost everything that matters lives in
one package, `packages/core`, which holds all business logic, data access, and
services behind class contracts. The applications around it —
[`apps/gradebook`](#3-single-instance-no-separate-api-server) (the Next.js host)
and [`apps/agent`](./AGENT.md) (the browser instrumentation client) — are
deliberately thin. If you understand how core is composed and how applications
talk to it, you understand the shape of the whole system.

## System Context: Three Tiers

Before the internal decisions, it helps to see where Modulus sits. Modulus exists
to give Ximera — OSU's open interactive-textbook platform — a modern, standards-
based connection to an institutional LMS. It replaces Ximera's legacy LTI link to
OSU Canvas ("Carmen") with **LTI 1.3**, a change requested by the OSU Canvas team
and made more pressing by Ohio accessibility legislation (Senate Bill 29, WCAG
2.1/2.2 AA). The deliberate choice was to build this as a separate, loosely
coupled service rather than grow Ximera's codebase, so that Ximera stays focused
on delivering open content — every activity page remains accessible without a
login — while Modulus owns the specialised concerns of LMS connectivity,
authenticated grade processing, and analytics.

The result is a three-tier system:

```
  TIER 1                 TIER 2                      TIER 3
  Institutional LMS      Modulus                     Ximera activities
  (Canvas / Carmen)      (this project)              (instrumented content)
  ─────────────────      ──────────────────────      ──────────────────────
  • Course / assignment  • OIDC login, JWKS/JWT       • Open-access activity
    setup                  validation                   pages (no login)
  • LTI 1.3 Deep          • Deep Linking service      • @modulus-learning/agent
    Linking              • Resource-link launch         embedded JS library
  • Resource-link        • Auto-register / session   • OAuth 2.0 + PKCE auth
    launch                 management                   to Modulus
  • AGS gradebook        • Activity codes,           • Progress reporting
    line items             enrollment                   (normalized 0–1.0)
                         • AGS score passback        • Page-state persistence
                         • Gradebook analytics       • Registry validation
                         • Postgres (Drizzle)          of the Modulus server
```

Two integration surfaces connect the tiers, and each has its own reference doc:

- **Tier 1 ↔ Tier 2 is LTI 1.3** — OIDC login, deep linking (instructors pick
  activities from inside Canvas), resource-link launch (learners open an
  assignment), and Assignment & Grade Services (AGS) score passback. See
  [LTI](./LTI.md).
- **Tier 2 ↔ Tier 3 is the agent** — a Ximera page instrumented with
  `@modulus-learning/agent` authenticates to Modulus over OAuth 2.0 with PKCE and
  reports normalized progress and page state. See [AGENT](./AGENT.md).

A defining constraint runs along the Tier 2 ↔ Tier 3 boundary: **no learner PII
crosses it.** Activities receive only an opaque user UUID, a display name, the
activity context, and normalized scores — never an email address, institutional
student ID, course identity, or LMS gradebook data. This data-isolation rule is
what keeps the design FERPA-compatible, and it shapes both the schema and the
agent token payloads. See [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md).

A further constraint shapes the internals: at OSU scale, **several thousand
learners may submit progress at nearly the same time**, and no scores may be
lost. That requirement is why grade passback is a queued, worker-driven subsystem
(decision 3) rather than an inline call during a request.

## 1. A Contract-Based Core, Resolved Through a Typed DI Registry

Core exposes its functionality through class contracts that are wired together
by a small dependency-injection registry (`packages/core/src/lib/registry.ts`).
Nothing in core reaches out to construct its own collaborators; every service
receives its dependencies through its constructor, and the registry is
responsible for assembling the graph.

There are two registry flavours. `Registry` composes synchronously; the
`AsyncRegistry` used at the top level allows factories and classes whose
construction is asynchronous (a database pool, the LTI keystore). Providers are
added by kind — `addClass`, `addAsyncClass`, `addFactory`, `addValue`, and
`addNested` for sub-registries — and the whole graph is instantiated by a single
`compose()` call.

```ts
// packages/core/src/core.ts — the top-level graph (excerpt)
const createCoreRegistry = (urlBuilder: UrlBuilder, config: Config) => {
  return new AsyncRegistry()
    .addValue('config', config)
    .addValue('urlBuilder', urlBuilder)
    .addFactory('logger', createCoreLogger)
    .addFactory('jwtSign', createJwtSigner)
    .addFactory('jwtVerify', createJwtVerifier)
    .addAsyncClass('ltiKeyStore', LtiKeyStore)
    .addFactory('dbPool', createDBPool)
    .addClass('db', DBManagerImpl)
    .addClass('tx', TXManagerImpl)
    .addFactory('mailer', createMailer)

    .addNested('app', createAppRegistry())
    .addNested('admin', createAdminRegistry())
    .addNested('agent', createAgentRegistry())
}
```

The unusual part is that the registry is **type-checked at compile time**. The
`ValidateDeps` machinery in `registry.ts` inspects each provider's constructor
dependencies against what has already been provided and what is still required,
and turns mismatches — a name collision, a duplicate provider, a dependency
whose type doesn't line up — into TypeScript errors rather than runtime
surprises. Wiring the graph incorrectly does not compile.

The payoff is that core's collaborators are all swappable by construction. The
same property is what makes the planned [remote connector](#7-portability-framework-and-deployment)
feasible: a proxy implementation of a contract can be registered in place of the
in-process one without any consumer noticing.

For the full treatment — the registry types, the `compose()` lifecycle, and how
each module assembles its own sub-registry — see [CORE-COMPOSITION](./CORE-COMPOSITION.md).

## 2. A Commands Facade Is the Only Public Surface

Consuming applications never see the registry, the services, or the
repositories. After `compose()`, core hands back a single facade — `commands` —
organised into three branches, one per actor domain:

```ts
// packages/core/src/core.ts
export type CoreCommands = {
  app: ReturnType<typeof getAppCommands>
  admin: ReturnType<typeof getAdminCommands>
  agent: ReturnType<typeof getAgentCommands>
}
```

Each branch is built from its module registry by a `get*Commands` function that
projects only the `commands` object out of each module — the services and
repositories behind them stay private:

```ts
// packages/core/src/modules/app/index.ts (excerpt)
export const getAppCommands = (services: RegisteredServices<AppRegistry>) => {
  return {
    account: services.account.commands,
    activities: services.activities.commands,
    session: services.session.commands,
    registration: services.registration.commands,
    lti: services.lti.commands,
  }
}
```

A *command* is more than a method. Defined through `CoreUtils.createCommand`
(`packages/core/src/lib/utils.ts`), each command is a callable annotated with a
method name, an auth mode, and Zod input/output schemas. The wrapper validates
input and output, establishes a logging context, and returns a `Result` rather
than throwing. Its first argument is always a `RequestContext` whose shape is
determined by the auth mode:

```ts
type AuthMode = 'none' | 'user' | 'admin' | 'agent'

// the call signature a command exposes to consumers
(ctx: RequestContextType[Mode], input: z.input<InSchema>)
  => Promise<Result<z.output<OutSchema>>>
```

This means the boundary between an application and core is small, explicit, and
self-describing: a fixed set of validated, typed, auth-aware calls. It is the
seam everything else in this document is organised around.

## 3. Single-Instance, No Separate API Server

Core is a library, not a service. The host application calls `initCore` once,
in-process, and holds the result as a singleton. The Next.js gradebook does
exactly this:

```ts
// apps/gradebook/src/core-adapter.ts (excerpt)
export const getCoreInstance = (): Promise<CoreInstance> => {
  if (coreInstancePromise == null) {
    coreInstancePromise = initCore({
      pinoLogger: getLogger(),
      urlBuilder: { /* baseUrl, ltiLaunchUrl, dashboardUrl, … */ },
    })
  }
  return coreInstancePromise
}

export const getCoreCommands = async (): Promise<CoreCommands> =>
  (await getCoreInstance()).commands
```

There is **no separate API server**. Route handlers in `apps/gradebook` are thin:
they resolve a `RequestContext` for the current actor, call a command, and map the
`Result` to an HTTP response. The application leans on the host framework's own
routing rather than introducing a second network hop.

This is the project's distinguishing deployment property. For a "right-size"
installation, the web app and all backend logic run in a single process against a
single Postgres database — easy to host, easy to reason about. Larger or
distributed deployments are addressed by the [remote connector](#7-portability-framework-and-deployment)
rather than by forcing every installation to run a separate backend.

Background work runs in the same process. `initCore` returns a
`startBackgroundJobs()` handle that the host calls to start worker loops — today,
the LTI score-submission worker (`packages/core/src/workers/score-submission.ts`)
— and a corresponding stop handle for graceful shutdown.

## 4. Three Separate Actor Domains

Modulus serves three kinds of caller, and the codebase keeps them apart all the
way down. They appear as the three branches of the commands facade
(`app`, `admin`, `agent`), as three module trees under
`packages/core/src/modules/`, and as three distinct authentication paths:

- **`app`** — the public/learner surface: LTI launch and login, activities and
  progress, registration, account, and user sessions.
- **`admin`** — the administrative surface: admin users, roles and permissions,
  reports, and LTI platform configuration.
- **`agent`** — the instrumentation surface: the browser agent's OAuth-style
  authorization and the ingestion of activity state (page-state snapshots and
  progress).

Each domain has its own token verifier, composed separately so that verification
can be done without spinning up the full core graph:

```ts
// packages/core/src/public/tokens.ts (excerpt)
new Registry()
  .addClass('user', UserTokenVerifier)
  .addClass('admin', AdminTokenVerifier)
  .addClass('agent', AgentTokenVerifier)
```

The host constructs the matching `RequestContext` for whichever actor a request
belongs to — `UserRequestContext`, `AdminRequestContext`, or
`AgentRequestContext` — each carrying a typed auth object (`UserAuth`,
`AdminAuth`, `AgentAuth`). Commands declare which one they require, so it is a
type error to call an admin command with a user context. The full token model,
session lifecycle, and RBAC story is in [AUTHN-AUTHZ](./AUTHN-AUTHZ.md).

## 5. A Uniform Module Shape: Repository · Service · Commands

Every module under `modules/` follows the same internal layout, which makes the
codebase predictable to navigate:

- **`repository/`** — `*Queries` and `*Mutations` classes, the only code that
  issues SQL (via Drizzle and the `db`/`tx` managers).
- **`services/`** — business logic, composed from repositories and other
  services.
- **`commands.ts`** — the public commands for the module, wrapping services.
- **`schemas.ts`** — the Zod input/output contracts for those commands.

A module exposes itself as a sub-registry, and the read/write split is visible
right in the wiring:

```ts
// packages/core/src/modules/agent/index.ts (excerpt)
const createActivityStateRegistry = () =>
  new Registry()
    .addClass('queries', ActivityStateQueries)
    .addClass('mutations', ActivityStateMutations)
    .addClass('progressService', ActivityProgressService)
    .addClass('pageStateService', ActivityPageStateService)
    .addClass('commands', ActivityStateCommands)
```

Because the shape never varies, the question "where does this behaviour live?"
always has the same answer: SQL in the repository, logic in a service, the
contract in `commands.ts` and `schemas.ts`.

## 6. Errors as Values, Not Exceptions

Commands return a `Result` (`packages/core/src/lib/errors.ts`) rather than
throwing across the core boundary. Expected failure conditions are modelled as
typed `CoreError` values and handed back to the caller, which keeps control flow
at the application boundary explicit: a route handler inspects the `Result` and
chooses a status code, instead of relying on a thrown exception propagating
through framework middleware. The command wrapper in `lib/utils.ts` also pins a
consistent logging context (request id, command name, actor id) around every
invocation, so a single request can be traced through the logs regardless of how
deep the call goes.

## 7. Portability: Framework and Deployment

Two future moves are explicitly enabled by the contract boundary above, and both
are worth keeping in mind when reading any subsystem doc.

**Framework portability.** The gradebook runs on Next.js 16 today, but core has
no dependency on Next — it is a plain library driven through `initCore` and the
commands facade. A migration to TanStack Start (under evaluation) would touch the
host app's route handlers and `core-adapter.ts`, not core itself.

**The remote connector (planned).** For larger or distributed deployments, the
plan is to let core talk to an external API instead of running everything
in-process. This consists of a thin HTTP wrapper around core's service layer and
**proxy implementations of the class contracts** that forward calls over HTTP.
Because applications depend only on the contracts — resolved through the registry
in decision 1 — the in-process and remote implementations are interchangeable
without any change to application code. The design is not yet finalised; see
[REMOTE-CONNECTOR](./REMOTE-CONNECTOR.md) for current thinking and open
questions.

---

## Where to go next

- [CORE-COMPOSITION](./CORE-COMPOSITION.md) — the registry, `compose()`, and how
  modules are assembled.
- [DATA-MODEL](./DATA-MODEL.md) — the Drizzle schema and the entities the
  subsystems share.
- [AUTHN-AUTHZ](./AUTHN-AUTHZ.md) — the three actor domains, tokens, sessions,
  and RBAC.
- [LTI](./LTI.md) and [AGENT](./AGENT.md) — the two integration surfaces.
