---
title: "Dynamic Activities (Lazy Create)"
path: "dynamic-activities"
summary: "Why Modulus materializes an activity row on demand ('lazy create') from agent traffic, and why a lazy-created activity carries no activity-code association — the decision, its analytics consequence for instructors, and the alternatives considered. The site-wide allowlist proposed here was superseded by the shipped sitewide activity URL allowlist; this document records the earlier proposal as history and points at the documents that describe what was built."
---

# Dynamic Activities (Lazy Create)

> **Status: PARTIALLY SUPERSEDED.** Two things in this document have been
> overtaken by shipped work, and one has not.
>
> **Still current:** the reason lazy creation exists, and the decision that a
> lazy-created activity gets **no activity-code association** (Option C below).
> Both agent entry points still materialize an `activities` row on first
> contact — an activity's own URL during authorization, and a cumulative target
> during `set-progress` — and neither writes an `activity_activity_code` link.
> The **activity-code scope gate (`sharesActivityCode`) has been removed
> entirely**, so the "coded vs un-coded" authorization model this document once
> built its central decision around no longer exists: no activity is
> scope-checked for umbrella reporting, and activity codes matter only for
> code-scoped analytics.
>
> **Superseded:** the site-wide policy sketched here — the
> `activity_create_policy` table, the `isLazyCreateAllowed` matcher, the
> single `site-config:manage` ability, and the
> implementation map and verification plan built on them. A sitewide activity
> URL allowlist has since shipped, and it differs from this proposal on every
> one of those points. The sections below are retained as history; read them
> only for the reasoning, never as a description of the system. What was built
> is described in
> [DATA-MODEL → Activities & Grouping](./DATA-MODEL.md#3-activities--grouping)
> (the `activity_url_allowlist_rules` table),
> [AUTHN-AUTHZ → The Agent Flow](./AUTHN-AUTHZ.md#the-agent-flow-oauth-20--pkce)
> (admission on the OAuth path),
> [Cumulative Progress](./CUMMULATIVE-PROGRESS.md) (admission on the umbrella-target
> path), and
> [SECURITY-AND-PRIVACY → Agent / activity trust](./SECURITY-AND-PRIVACY.md#agent--activity-trust-tier-2--tier-3)
> (what admission does and does not control).
>
> **One further change since this document was written:** an activity is now
> identified by a **canonical activity URL** — the `URL` serialization with
> query and fragment removed — so equivalent spellings of a page resolve to one
> `activities` row on every path, lazy creation included. Wherever the sections
> below describe a URL being matched, looked up, or created, read that as
> happening on the canonical key rather than on the submitted string. The
> identity contract, including the distinctions it deliberately preserves, is
> defined in
> [DATA-MODEL → Activities & Grouping](./DATA-MODEL.md#3-activities--grouping).

This document describes **lazy activity creation** — letting Modulus materialize
an `activities` row on demand when an agent reports against a URL that is not yet
recorded — and the **site-wide admin policy** originally proposed to govern when
that is allowed. Lazy creation is current; the policy proposal is not.

It builds directly on [The Modulus Agent](./AGENT.md) (OAuth + activity-state
ingestion), [Cumulative Progress](./CUMMULATIVE-PROGRESS.md) (the umbrella-target
path this relaxes — its deferred "Phase 2b"), and the
[Data Model](./DATA-MODEL.md) (`activities`, `activity_codes`,
`activity_activity_code`). It also touches [AUTHN-AUTHZ](./AUTHN-AUTHZ.md) for the
admin abilities.

## How the Shipped Allowlist Differs

The shipped policy retains an allow-all default, with these differences:

| This proposal | What shipped |
| --- | --- |
| Zero rules means **allow-all** | Zero **enabled** rules means **allow-all**, including when all stored rules are disabled. URL validation still applies. |
| Match on `host` plus `pathname.startsWith(path_prefix)` | Match on an exact normalized **origin** plus a **path-segment-bounded** subtree, so `https://example.edu` cannot admit `https://example.edu.attacker.example` and `/course/calculus` cannot admit `/course/calculus-2`. HTTPS is required, except for exactly `localhost` and `127.0.0.1` over HTTP. |
| `created_by` references `users` | `created_by` and `updated_by` reference `admin_users`, so the rules table holds no learner or instructor data. |
| Governs agent lazy creation only | Governs **every** path that can add an `activities` row: instructor activity-code creation and editing, LTI deep linking, agent authorization, and cumulative targets. |

## Why This Exists

The original system was strict: agent traffic was accepted only for an activity
that already existed as a recorded row. That strictness lived at two independent
enforcement sites and blocked real authoring workflows:

1. **Self, at OAuth time.** The agent's OAuth `redirect_uri` *is* the activity
   URL. `AgentAuthService.createAuthCode` /`claimAuthCode`
   (`modules/agent/auth/services/agent-auth.ts`) call `findActivityByUrl()` and
   threw `ERR_UNAUTHORIZED('Unknown activity')` when it missed, so a brand-new
   page was rejected before a token could be issued. `createAuthCode` now creates
   a bare row on a miss and continues issuing the code.
2. **Umbrella targets, at set-progress time.** `ActivityProgressService.applyContribution`
   (`modules/agent/activity-state/services/progress.ts`) resolves the target URL
   formerly skipped an unknown target. It now creates the bare row and applies
   the contribution without an activity-code scope check.

New activities come into being on first contact from authored content. That much
still holds. What has changed since this was written is the gate: creation is no
longer unconditional. Every path that can add an `activities` row — including
these two — now goes through one registration service that consults the sitewide
allowlist first. With enabled rules, a URL matching none of them creates nothing;
with no enabled rules, every valid URL is admitted. The two agent
paths differ only in how the refusal surfaces: authorization returns the learner
to their page with `error=unauthorized_client`, while a refused cumulative target
is reported in the response's `rejected_targets` and does not fail the submission.

## The policy model

> **Superseded.** The table, the matcher and the default below are the earlier
> proposal, not the shipped design. What shipped is
> `activity_url_allowlist_rules` — a normalized `origin` plus `path_prefix`,
> `is_enabled`, `admin_users` provenance, and a `unique (origin, path_prefix)`
> constraint — with segment-bounded path matching and allow-all when no rules
> are enabled. See
> [DATA-MODEL → Activities & Grouping](./DATA-MODEL.md#3-activities--grouping).

A single table of allowlist rules drives the decision.

```
activity_create_policy {
  id          uuid pk
  host        varchar(255)  notNull      -- e.g. "ximera.osu.edu"
  path_prefix varchar(1024)              -- nullable; null/'' = the whole host
  description varchar(1024)
  enabled     boolean notNull default true
  created_by  uuid -> users.id (set null)
  ...timestamps
}
```

Activity URLs are stored **absolute** (e.g.
`https://ximera.osu.edu/mooculus/calculus1/whatIsALimit/breakGround`, per
`seeds/10_activities.ts`), so a rule matches on parsed `host` + `pathname`.

**Evaluation (`isLazyCreateAllowed(url, rules)` — a pure, unit-testable helper):**

- `rules.length === 0` → **allow** (allow-all default; see below);
- otherwise **allow iff** some enabled rule satisfies:
  `host === rule.host` (case-insensitive) **and**
  (`!rule.path_prefix` **or** `pathname.startsWith(rule.path_prefix)`).

### Default = allow-all

> **Current default.** Zero enabled rules allow every valid new activity URL
> on every admission path, including when all stored rules are disabled. Seeds
> create no rules. Adding or enabling the first rule restricts new registrations;
> disabling or deleting the last enabled rule restores allow-all.

With **zero rules configured, every URL may be lazy-created.** Adding the first
rule flips the policy into a strict allowlist (allow only what matches). This was
a deliberate choice: it keeps dev/demo and initial rollout frictionless, and lets
an institution tighten the policy when it is ready rather than being blocked from
the start. (The stricter alternative — deny-all until rules exist — remains an
easy future toggle if the institutional/FERPA posture later calls for it.)

## The central decision: activity-code association

This is the design decision worth recording carefully, because it has a direct
consequence for instructors and analytics.

In the Modulus model, **`activity_activity_code` membership is what makes an
activity visible to a code's analytics and to cumulative ("umbrella") roll-ups**
— `sharesActivityCode()` is the authoritative scope check
(`activity-state/repository/index.ts`). A bare `activities` row with **no** code
membership exists, can record its own progress, but is **invisible** to any
code-scoped reporting.

So when we lazy-create an activity, the question is: *which activity code, if any,
should it be linked to?* We considered three options.

### Option A — Rules carry an activity code (least preferred)

Each policy rule would also name an `activity_code`; a matched lazy-create would
insert the activity **and** its `activity_activity_code` link in one step.

- **Pro:** new activities land fully scoped — immediately visible to analytics and
  roll-ups, no manual follow-up.
- **Con:** it overloads a **site-wide, security-flavoured allowlist** (an admin's
  "which domains may create activities") with a **curriculum/enrollment concern**
  ("which course code owns this content"). Those are different responsibilities,
  owned by different people. A single host (e.g. `ximera.osu.edu`) serves content
  for *many* codes, so a one-rule-to-one-code mapping is wrong in the common case,
  and per-path rules would multiply rules just to express ownership. We rejected
  this as a conflation of concerns.

### Option B — Inherit the reporting child's activity code

For an **umbrella target**, the lazy-created parent would join whatever
activity code(s) the **reporting child (the source)** belongs to — inferring the
parent's scope from the child that reports into it.

- **Pro:** the cumulative parent automatically shares a code with its children, so
  the roll-up "just works."
- **Con (functional):** it only answers the **target** path. The **self / OAuth**
  path has *no source* to inherit from, so this leaves half the feature
  unspecified.
- **Con (semantic):** it lets **child content silently mutate the code membership
  of a parent** — a write into the enrollment/scope graph driven by learner
  traffic rather than by an instructor's intent. A misconfigured `useContributesTo`
  could attach a course index to an unrelated code. We judged this too implicit
  and too powerful a side effect for progress reporting to carry.

### Option C — No code association (our choice, for now)

A lazy-created activity is a **bare `activities` row** — `id`, `url`, optional
`name`, **no `activity_activity_code` link.**

- **Pro:** smallest, safest write. Lazy creation does exactly one thing
  (materialize the activity) and never touches the scope/enrollment graph. It
  works uniformly for **both** the self and target paths. Scope/ownership stays an
  explicit, instructor-driven act — consistent with how codes are managed today.
- **Cost (accepted):** the new activity is **outside all code-scoped reporting**
  until someone links it. **An instructor who wants to report on or analyze data
  for a lazy-created activity must manually add that activity's URL to their
  activity code afterward.** Until they do, the activity records progress for
  individual learners but does not appear in that code's analytics or in
  code-scoped cumulative roll-ups.

We chose Option C because it keeps a **site-wide infrastructure policy** cleanly
separate from **curriculum scope**, avoids learner traffic writing into the
enrollment graph, and is the only option that covers both enforcement sites with
one rule. The manual linking step is a known, acceptable follow-up — and a natural
future enhancement is an admin/instructor affordance to surface "un-coded"
activities and link them to a code (see [Future work](#future-work)).

## Authorization model (coded vs un-coded)

> **Superseded.** This section is retained as history. It reconciles a
> `sharesActivityCode` gate that **no longer exists** — the gate was removed
> wholesale, so there is no coded/un-coded distinction and no bifurcation. Every
> activity is treated identically for umbrella reporting; code membership governs
> only code-scoped analytics. The future lazy-create gate is a single URL
> allow/deny check (the site policy above), not the scheme below.

Because Option C produces activities with **no** code membership, the existing
`sharesActivityCode` gate would exclude them from cumulative contributions and
reads. We therefore **bifurcate** authorization rather than weaken the existing
rule:

- **Activity has code membership** → behaviour is **unchanged**:
  `sharesActivityCode` governs whether a contribution applies and whether progress
  is readable across activities. Existing strict semantics are preserved exactly.
- **Activity has no code membership** (a lazy-created row) → governed by the
  **site policy**: the policy already authorized the row's existence, so
  contributions to it and reads of it are permitted **without** a shared code.

In short: **coded activities use code scope; un-coded (lazy) activities use the
site policy.** This is the minimal coherent reconciliation of "allow-all default +
no code link + relax both paths."

### Self path (OAuth)

In `createAuthCode` / `claimAuthCode`: when `findActivityByUrl(redirect_uri)`
misses, consult the policy. **Allowed** → create the bare activity row and proceed
to issue the token; **denied** → throw `ERR_UNAUTHORIZED` exactly as today.

### Target path (set-progress)

In `applyContribution`: when `findActivityByUrl(url)` misses, consult the policy.
**Allowed** → create the bare row; **denied** → skip + warn (as today). Then apply
the contribution under the bifurcated rule above (coded → require shared code;
un-coded → allow). The read path (`readScopedProgress`) applies the same
bifurcation so a lazy-created cumulative page can be read back.

The learner's own (self) high-water progress is, as always, persisted
independently — a bad umbrella target never costs a learner their own progress.

## Admin surface and permission

> **Superseded.** One coarse `site-config:manage` ability was not what shipped.
> The allowlist is gated by two abilities — `activity-url-allowlist:list` and
> `activity-url-allowlist:manage` — both granted to the seeded Manager role, and
> `/admin/activities` is now the built rules surface rather than a placeholder.
> Why two rather than five per-verb abilities is explained in
> `packages/core/src/modules/admin/activity-url-allowlist/schemas.ts`: a base URL
> that normalizes onto an existing disabled rule resolves into an *edit*, so an
> administrator holding `create` without `edit` would hit a dead end on an
> ordinary submission.

- **Permission.** A single coarse ability **`site-config:manage`** gates all
  policy CRUD, granted to the Manager admin role in
  `seeds/03_admin_permissions.ts`. It is declared on each policy command
  (`abilities: ['site-config:manage']`) and enforced by `assertAdminAbilities`
  (`lib/utils.ts`), the same mechanism the `lti-platforms:*` commands use. (We
  chose one coarse ability over a per-verb `activities:*` set in anticipation of
  other site-wide settings landing under the same gate.)
- **UI.** The existing placeholder route
  `apps/gradebook/src/app/[lng]/(admin)/admin/(auth)/activities/page.tsx` becomes
  the policy manager (list + create/edit/delete rules). The `/admin/activities`
  nav entry already exists (`ui/components/admin/menu-drawer.tsx`).

## Implementation map

> **Superseded.** This map describes a single `modules/admin/activity-policy/`
> module carrying both the admin CRUD and an internal `isAllowed(url)`. What
> shipped splits those: `packages/core/src/modules/activity-registration/` holds
> the pure URL parser and matcher, the policy service, the rule repository and
> the one registration service every admitting path calls, while
> `packages/core/src/modules/admin/activity-url-allowlist/` holds the
> administrator-facing commands. Read the file paths below as history.

Mirrors the existing `lti-platforms` admin module end to end.

**Core**
- New schema `database/schema/source/activity-create-policy.ts` (+ migration);
  export from `database/schema/index.ts`. Optional seed mirroring
  `seeds/09_activity_codes.ts`.
- New module `modules/admin/activity-policy/` (`commands.ts`, `services/`,
  `repository.ts`, `schemas.ts`, `utils.ts`, `errors.ts`): admin CRUD
  (`site-config:manage`) plus an internal, **un-gated** `isAllowed(url)` (calls
  `listRules()` + the `isLazyCreateAllowed` matcher) for agent-mode use.
- `activity-state/repository/index.ts`: add a `createActivity({ url, name? })`
  mutation (`uuidv7()` id) and a `hasActivityCode(id)` query to distinguish
  coded vs un-coded targets.
- Wire the policy service into `AgentAuthService` and `ActivityProgressService`;
  update `agent-auth.ts` (self) and `progress.ts` (`applyContribution` +
  `readScopedProgress`) per the authorization model above.
- `seeds/03_admin_permissions.ts`: grant `site-config:manage` (Manager role).

**Gradebook**
- New `modules/admin/activity-policy/` (server actions `list/create/update/delete`,
  `@types/`, `components/`), templated on `modules/admin/lti-platforms/`
  (`create.ts` shows the flash-cookie + redirect pattern).
- Fill in `(admin)/admin/(auth)/activities/page.tsx` to render the list + form.

**Docs**
- Save this file; add a pointer in `docs/DOCUMENTATION-PLAN.md`; add a short
  cross-reference from `docs/CUMMULATIVE-PROGRESS.md`'s "Activity existence"
  section (Phase 2b is now specified here).

## Verification

> **Historical verification plan.** The allow-all default is current, but the
> helper and table names below belong to the earlier proposal. The shipped feature's own
> tests live beside the code in `packages/core/src/modules/activity-registration/`
> and `packages/core/src/modules/admin/activity-url-allowlist/`.

1. **Unit** — `isLazyCreateAllowed`: zero-rules allow-all; host match; host+path
   match/mismatch; disabled rules ignored; non-matching host denied.
2. **Migration/seed** — run migration + reseed; confirm table exists and
   `site-config:manage` is granted.
3. **Allow-all (no rules)** — point the agent demo at a **new** URL absent from
   `seeds/10_activities.ts`: OAuth now issues a token and self-progress persists
   (a bare row appears). Register `useContributesTo` against a **new** umbrella
   URL: the target row is created and the contribution applies.
4. **Restrict** — add a single `ximera.osu.edu` rule: a URL on another host is now
   rejected at OAuth and skipped as a target, while `ximera.osu.edu` URLs work.
5. **Regression** — existing **coded** activities still obey `sharesActivityCode`
   (an out-of-code existing target is still skipped);
   `postgres/reset-demo-progress.sh` still cleans up.
6. **Analytics consequence** — confirm a lazy-created activity is **absent** from
   its intended code's reporting until its URL is manually added to the
   `activity_code`, then present afterward.
7. **Permission** — an admin without `site-config:manage` cannot load/mutate the
   policy; Manager can.

## Future work

- An admin/instructor affordance to list **un-coded** activities and link them to
  an `activity_code` in one click — turning the "manual follow-up" cost of
  Option C into a guided action. **Still open.**
- Optional **deny-all** default toggle for institutions that want lazy creation
  off until explicitly enabled. **Not implemented:** zero enabled rules allow
  every valid new activity URL.
- Possible `host` **wildcard / subdomain** matching if rule volume grows.
  **Still open**, and deliberately so: the shipped matcher compares origins for
  equality, which is what stops `https://example.edu` admitting
  `https://example.edu.attacker.example`. Any wildcard scheme has to answer that
  first.
- **Emergency blocking** — withdrawing access to an activity Modulus has already
  accepted — is a separate, deferred feature. The allowlist governs admission
  only; see
  [SECURITY-AND-PRIVACY → Open Questions](./SECURITY-AND-PRIVACY.md#open-questions--needs-institutional-policy).

## Appendix — code reference map (session hand-off)

> **Historical.** These touchpoints were gathered before the allowlist was built
> and several no longer exist — there is no `activity_create_policy` table, no
> `modules/admin/activity-policy/`, and no `hasActivityCode` query. The
> composition root the last item asks the next session to find is
> `packages/core/src/core.ts`, which now composes the registration module ahead
> of `app`, `admin` and `agent` so its context flows down to all three.

Concrete touchpoints gathered during exploration, so the next session can resume
without re-deriving them. Line numbers are as-of this writing — confirm before
editing.

### Sites to change (the two strict rejections)
- `packages/core/src/modules/agent/auth/services/agent-auth.ts`
  - `createAuthCode` — `findActivityByUrl(redirect_uri)` then `ERR_UNAUTHORIZED('Unknown activity')` (~:41).
  - `claimAuthCode` — same check (~:108); token minted at `tokenIssuer.createAccessToken({ user, activity })` (~:118).
  - **Change:** on miss, call policy `isAllowed(redirect_uri)` → `createActivity` (allow) or throw (deny). Inject policy service into `AgentAuthService` constructor.
- `packages/core/src/modules/agent/activity-state/services/progress.ts`
  - `applyContribution` (~:102) — target resolve + skip/warn on unknown/out-of-code.
  - `readScopedProgress` (~:49) — read-side `sharesActivityCode` gate.
  - `setProgress` (~:62) — the enclosing transaction (`tx.withTransaction`).
  - **Change:** lazy-create on miss (policy-gated); apply coded-vs-un-coded bifurcation on both contribution and read. Inject policy service into `ActivityProgressService`.

### Repository (activity-state)
- `packages/core/src/modules/agent/activity-state/repository/index.ts`
  - `findActivityByUrl` (~:65); `sharesActivityCode` self-join (~:76); `updateProgress` high-water (~:104); `incrementProgress` (~:144); `recordProgressEvent` (~:175).
  - **Add:** `createActivity({ url, name? })` (uuidv7 id); `hasActivityCode(id): boolean` (to distinguish coded vs un-coded targets).

### Data model / schema
- `activities`: `database/schema/source/activities.ts` (id, url unique, name).
- `activity_codes`: `database/schema/source/activity-codes.ts` (code, private_code, optional `url_prefix`).
- junction: `database/schema/source/activity-activity-code.ts`.
- barrel: `database/schema/index.ts` — **export the new policy table here.**
- **New:** `database/schema/source/activity-create-policy.ts` (+ generated migration).

### Seeds
- `seeds/03_admin_permissions.ts` — Manager grant block (~:24); **add `site-config:manage`.**
- `seeds/09_activity_codes.ts` — seed pattern to mirror for an optional policy seed.
- `seeds/10_activities.ts` (~:13) — confirms stored URLs are **absolute** (`https://ximera.osu.edu/...`), which the host/path matcher depends on.
- `seeds/index.ts` — seed orchestration (register any new seed).

### Permission machinery
- `lib/utils.ts` — `createCommand` enforces declared abilities via `assertAdminAbilities` (~:158–167).
- `lib/auth.ts` — `hasAbility` (~:9) / assert (~:14).
- `modules/admin/lti-platforms/commands.ts` — `abilities: ['lti-platforms:create']` declaration pattern (~:42).
- `apps/gradebook/src/middleware/withAdminAuth.ts` — `access_admin` route gate (~:22).

### Admin module template (mirror `lti-platforms`)
- Core: `modules/admin/lti-platforms/{services/lti-platforms.ts, commands.ts, repository.ts, schemas.ts, utils.ts, errors.ts}`.
- Mapping helper pattern: `modules/admin/admin-roles/utils.ts` (`toAdminRole` / `toAdminPermission`).
- **New core module:** `modules/admin/activity-policy/` (CRUD gated by `site-config:manage`; internal **un-gated** `isAllowed(url)` + pure `isLazyCreateAllowed` matcher in `utils.ts`).

### Gradebook UI
- Placeholder to fill: `apps/gradebook/src/app/[lng]/(admin)/admin/(auth)/activities/page.tsx`.
- Admin auth layout: `apps/gradebook/src/app/[lng]/(admin)/admin/(auth)/layout.tsx`.
- Server-action template: `apps/gradebook/src/modules/admin/lti-platforms/` (`list.ts`, `create.ts` shows flash-cookie + `redirect`, `get.ts`, `@types/`, `components/`).
- Nav item already present: `apps/gradebook/src/ui/components/admin/menu-drawer.tsx` (~:66, `/admin/activities`).

### Agent transport / DI wiring
- Unified RPC route: `apps/gradebook/src/app/routes/agent/activity/route.ts` (dispatch on `op`).
- Adapter helpers: `apps/gradebook/src/core-adapter` — `getCoreAgentRequestContext`, `getCoreAdminRequestContext`, `getCoreCommands`.
- Token issuer: `modules/agent/auth/services/token-issuer.ts` — `createAccessToken({ user, activity })` bakes a single `activity_id` into the JWT.
- Contract schemas: `modules/agent/activity-state/schemas.ts`.
- Agent client (for end-to-end testing): `apps/agent/src/core/auth.ts`, `apps/agent/src/core/api-client.ts` (redirect_uri = activity URL).
- **TODO (locate next session):** the core composition/container file where `AgentAuthService` and `ActivityProgressService` are constructed — needed to inject the policy service. See `docs/CORE-COMPOSITION.md` for where DI lives.

### Dev helper
- `postgres/reset-demo-progress.sh` — resets demo progress (clears target + sources by URL prefix); use during verification.

---

## Where to go next

- [DATA-MODEL](./DATA-MODEL.md) — the `activity_url_allowlist_rules` table that
  shipped in place of the policy table proposed here.
- [AUTHN-AUTHZ](./AUTHN-AUTHZ.md) — how an activity URL is admitted during agent
  authorization, and the two abilities that govern the rules.
- [Cumulative Progress](./CUMMULATIVE-PROGRESS.md) — the umbrella-target path
  this document relaxes, and what happens now when a target is refused.
- [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) — what admission does and
  does not control, and why removing a rule is not revocation.
