---
title: "Documentation Plan"
path: "documentation-plan"
summary: "A staged plan for Modulus system and subsystem documentation — what to write, in what order, and which docs can be sketched now from the codebase versus stubbed pending maintainer input."
---

# Documentation Plan

This is a proposed map for the Modulus `docs/` set, modelled on the approach used
in the Byline project: start from a small number of analysis/overview documents,
then promote the durable parts into per-subsystem reference docs that each own one
area of the system. Every doc carries the same frontmatter contract already in use
(`title`, `path`, `summary`) so it can be imported into the CMS.

The plan is organised in three tiers:

- **Tier 1 — System docs.** Orientation and the load-bearing architecture. A
  reader should be able to understand *what Modulus is* and *how it is shaped*
  from these alone.
- **Tier 2 — Subsystem reference.** One document per subsystem, each the canonical
  reference for that area, cross-linked from the architecture doc.
- **Tier 3 — Operational & process.** Deployment, security/privacy, testing,
  contribution, roadmap.

Each entry is tagged with a confidence estimate:

- **Sketch now** — enough exists in the codebase that a useful first draft can be
  written from the source, then corrected by you.
- **Partial** — the mechanics are in the code, but some framing or intent needs a
  short conversation before it reads correctly.
- **Stub** — depends on decisions or information not yet in the repo (policy,
  governance, unfinished design). Create a short placeholder with the intended
  outline and open questions, fill in later.

---

## Tier 1 — System documents

### INTRODUCTION.md  *(exists)*
The orientation doc. Already written. As the set grows, add a closing "Where to go
next" section linking into the architecture and subsystem docs.

### ARCHITECTURE.md — **Sketch now**
The Byline `ARCHITECTURE.md` is the model here: a numbered list of the load-bearing
decisions, each with a paragraph and a link to the deep-dive doc. For Modulus those
decisions are clearly visible in the code:

1. **Contract-based core via DI registry.** All business logic lives in
   `packages/core` behind class contracts resolved through `AsyncRegistry`
   (`lib/registry.ts`, composed in `core.ts`). The registry is compile-time
   type-checked — dependency mismatches are type errors.
2. **Commands facade.** Consumers never touch the registry; they call
   `instance.commands.{app,admin,agent}.*` (`core.ts`, `CoreCommands`).
3. **Single-instance, no separate API server.** Core runs in-process inside the
   host framework (Next.js today); route handlers are thin delegations. This is
   the project's distinguishing deployment property.
4. **Three actor domains.** `app` (learners/public), `admin`, and `agent`
   (instrumentation) are separate module trees with separate auth and token
   verifiers (`public/tokens.ts`).
5. **Repository/service split.** Every module is `…/repository` + `…/services` +
   `commands.ts` + `schemas.ts`.
6. **Framework portability as a goal.** The contract boundary is what makes the
   mooted move from Next.js to TanStack Start cheap; worth stating explicitly.

Links out to CORE-COMPOSITION, DATA-MODEL, AUTHN-AUTHZ, LTI, and AGENT.

### CORE-COMPOSITION.md — **Sketch now**
The deep dive behind decisions 1–2 and 5. Covers the `Registry`/`AsyncRegistry`
types, `addClass`/`addAsyncClass`/`addFactory`/`addValue`/`addNested`, the
`compose()` lifecycle, how `createCoreRegistry` wires everything in `core.ts`, the
commands/metadata pattern in `lib/utils.ts`, `RequestContext` threading, and how a
module registry is assembled (`modules/*/index.ts`). This is the analogue of
Byline's `CORE-COMPOSITION.md` and is one of the highest-value docs because the
registry is unusual and currently undocumented.

### MISSION.md — **Partial**
Short, like Byline's. Most of the substance is already in INTRODUCTION's "Why it
exists" / "Design principles". Needs a sentence or two on intended audience
(OSU-internal vs. the wider Ximera community) and the relationship to OSU — your
call on tone and commitments.

---

## Tier 2 — Subsystem reference

### DATA-MODEL.md — **Sketch now**
Canonical reference for the Drizzle schema (`packages/core/src/database/schema/`).
Cover the entity groups and how they relate: identity (`users`, `roles`,
`permissions`, `role_user`; the parallel `admin_*` set), enrollment/membership
(`enrollment`, `activity_codes`, `activity_code_member`,
`activity_activity_code`), the activity-tracking core (`activities`, `progress`,
`page_state`), LTI tables (`lti/*`), and agent auth (`agent_auth_codes`,
`agent_refresh_tokens`). Explain the two recorded signal shapes —
**time-series progress** (`progress`) and the **latest page-state snapshot**
(`page_state`, keyed `(user_id, activity_id)`) — since that distinction is the
heart of INTRODUCTION. Document the migration story (`database/migrations/` vs the
historical `database/sql/modulus-deploy-*.sql` dumps) and the seed ordering
(`database/seeds/01..12`). Flag open design questions already marked in the code
(e.g. the `page_state.state` `text` vs `jsonb` TODO).

### AUTHN-AUTHZ.md — **Sketch now**
Byline's `AUTHN-AUTHZ.md` is the template. Modulus has a rich, codeable story:
three actor types with distinct token verifiers (`public/tokens.ts`,
`modules/*/session|auth`), `JWTSigner`/`JWTVerifier` (`lib/jwt`,
`lib/lti-keystore.ts`), the `RequestContext` variants exported from `index.ts`
(`UserRequestContext`, `AdminRequestContext`, `AgentRequestContext`), session
issue/refresh/verify flows, and the RBAC tables (roles/permissions, admin roles).
Worth worked examples of each actor's login → token → authorized call path. Some
authorization-policy intent (what admin roles *should* gate) may need a short
check with you — mark those spots.

### LTI.md — **Sketch now**
Modulus is an LTI 1.3 tool; the implementation is substantial and well-structured
under `modules/app/lti/` plus `modules/admin/lti-platforms/`. Cover the OIDC login
initiation, resource-link launch, deep-linking request/response
(`services/deep-link.ts`, the `types/messages/*` message models), the platform/
deployment/nonce/lineitem tables, the keystore, and **Assignment & Grade Services
score passback** (`services/score-passback.ts`, `score-submission.ts`) which feeds
the background worker. Document the host wiring in `apps/gradebook/src/app/lti/`
and `app/routes/`. This is one of the most valuable docs for any institution
integrating Modulus.

### AGENT.md — **Sketch now**
The instrumentation story, spanning both the published client (`apps/agent`,
`@modulus-learning/agent` — `src/core/agent.ts`, `auth.ts`, `api-client.ts`, the
vanilla + React demos in `apps/agent-demo`) and the server side
(`modules/agent/`). Cover: how a Ximera page is instrumented, the agent's
OAuth-style authorization (`agent_auth_codes` → `agent_refresh_tokens`,
`services/agent-auth.ts`, `token-issuer/refresh/verifier`, the
`app/routes/agent/{authorize,token}` handlers), and the ingestion endpoints that
write `activity-state` (`services/pagestate.ts`, `services/progress.ts`). This is
the natural companion to LTI — together they are the two integration surfaces.

### ACTIVITIES-AND-PROGRESS.md — **Partial**
The domain doc that ties the data model to behaviour: what an *activity* is,
activity codes and membership, enrollment, how progress is computed and recorded,
how page-state snapshots are stored and retrieved, and how scoring flows from
agent ingestion through to LTI passback. The mechanics are in
`modules/app/activities/` and `modules/agent/activity-state/`; the *intended
semantics* (what "progress" means pedagogically, how codes are meant to be used by
instructors) would benefit from a short conversation.

### GRADEBOOK.md — **Partial**
The Next.js 16 host app (`apps/gradebook`): app-router layout, the `modules/`
(admin, app, lti, docs) mirroring of core domains, how route handlers delegate to
`initCore`, the in-repo docs renderer (`modules/docs/` + `content/docs/`), i18n
middleware, and the UI/theme layer. Mechanics are sketchable; the product intent
of the instructor-facing gradebook/reporting views needs your steer.

### I18N.md — **Sketch now**
Smaller than Byline's, but the setup is real: `apps/gradebook/src/i18n/`
(client/server/components/hooks/translations) and the `withI18n` middleware.
Document the locale strategy, the `[lng]` route segment, and how translations are
authored.

### EMAIL.md — **Sketch now**
`lib/email/` — `EmailTemplates` (Handlebars, `email-templates/`), `NodeMailer` vs
`DebugMailer`, and the flows that send mail (registration, email-change requests,
account). Short but useful for operators.

### REPORTS.md — **Partial**
`modules/admin/reports/` and `admin-reports-mau` (monthly-active-users). Document
what reports exist and how they're computed; the set of reports instructors/admins
actually want is a roadmap question for you.

---

## Tier 3 — Operational & process

### GETTING-STARTED.md — **Partial**
Mirror Byline's: clone, `pnpm install`, `pnpm build`, Postgres via `_docker`/
`postgres/`, env setup from `apps/gradebook/.env.example`, Drizzle
generate/migrate, seeds, `pnpm dev`. The blocker is secrets — the README notes
`.env` values come from maintainers; the doc should describe each variable's
purpose without leaking values. Sketchable to ~80%, final pass needs you.

### DEPLOYMENT.md — **Stub → Partial**
Docker images to Fly.io (`fly-gradebook.toml`, `_docker/`, `scripts/`), the
single-instance model, health endpoints (`app/routes/elb-status`, `keep-alive`),
and background-worker startup (`startBackgroundJobs` in `core.ts`). The
single-instance architecture is documentable now; the production topology,
secrets management, and scaling story are partly decisions you hold — stub those
sections with open questions.

### REMOTE-CONNECTOR.md — **Stub**
The planned HTTP proxy layer described in the README and in the project memo: a
thin HTTP wrapper over core's service layer plus proxy implementations of the
class contracts, swappable with the in-process implementations via the same DI
registry. Design is not finalized, so write the intent, the contract-swap
mechanism, and the open questions now; flesh out as it lands. (See the
`project_remote_connector` note.)

### SECURITY-AND-PRIVACY.md — **Stub**
High-value for an education product and largely policy-driven: the "store as
little as possible" principle from INTRODUCTION, LTI identity abstraction, what
PII is and isn't retained, data-retention windows, FERPA posture, and the threat
model. The technical inputs (token model, LTI nonce handling, keystore) are
codeable; the policy commitments are yours. Stub with the outline.

### ACCESSIBILITY.md — **Exists (content/docs)**
A VPAT already lives at `apps/gradebook/src/content/docs/02-accessibility.md`.
Decide whether the canonical copy belongs in root `docs/` (promoted) or stays in
the app content set, and link it from INTRODUCTION's "Be deployable" principle.

### TESTING.md — **Partial**
Node test runner in core (`pnpm test` over `*.test.ts`), Vitest in gradebook
(`vitest.config.ts`). Document the layout and how to run each; coverage
expectations and CI gating need your input.

### CONTRIBUTING / GOVERNANCE / LICENSE — **Stub**
`CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` exist at the root; the README flags
governance and license as **not yet settled**. Keep these as stubs that point at
the open decision rather than asserting a policy.

### ROADMAP.md (or TODO.md) — **Stub**
Byline keeps a living `TODO.md`. Seed one from the in-code TODOs (e.g.
`page_state` storage type, the multi-worker `Promise.allSettled` note in
`core.ts`) plus the remote connector and framework-migration tracks, then you
prioritise.

---

## Suggested writing order

1. **ARCHITECTURE.md** + **CORE-COMPOSITION.md** — establish the spine; everything
   else links back to these.
2. **DATA-MODEL.md** — the shared vocabulary the subsystem docs reuse.
3. **AUTHN-AUTHZ.md**, **LTI.md**, **AGENT.md** — the three load-bearing
   subsystems, all highly codeable.
4. **ACTIVITIES-AND-PROGRESS.md**, **GRADEBOOK.md** — the domain/product layer
   (needs a short sync with you).
5. **GETTING-STARTED.md**, **I18N.md**, **EMAIL.md**, **REPORTS.md** — supporting
   reference.
6. **Stubs**: REMOTE-CONNECTOR, DEPLOYMENT, SECURITY-AND-PRIVACY, ROADMAP,
   GOVERNANCE — placeholders with outlines and open questions, filled as decisions
   land.

## What I'd need from you to move stubs forward

- **Privacy/FERPA & retention policy** — to write SECURITY-AND-PRIVACY and finish
  DATA-MODEL's retention notes.
- **Deployment topology & secrets handling** — to finish DEPLOYMENT and
  GETTING-STARTED.
- **Product intent for the gradebook/reports** — what instructors should see and
  do — for GRADEBOOK, REPORTS, ACTIVITIES-AND-PROGRESS.
- **Governance/license direction** — even "undecided, here's the timeline" is
  enough to write the stub honestly.
- **Remote connector design** — current thinking on the HTTP contract and proxy
  boundary.
