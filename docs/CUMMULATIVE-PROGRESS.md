---
title: "Cumulative ('Umbrella') Progress Reporting"
path: "cumulative-progress"
summary: "Design for activities that report a calculation of their own progress against other activities. Defines the new URL-based, list-shaped agent ↔ gradebook contract and the single RPC activity-state endpoint. Phase 1 (the contract) is specified here; Phase 2 (transactional multi-activity storage and accumulation) is deferred. STATUS: IN PROGRESS."
---

# Cumulative ('Umbrella') Progress Reporting

> **Status: IN PROGRESS.** This document specifies **Phase 1** — the new agent ↔
> gradebook API contract — and sketches **Phase 2** (backend commands, queries,
> and storage). Phase 1 is the deliverable currently being built; Phase 2 is
> described here only well enough to keep the Phase 1 contract forward-compatible.
> Sections marked _(Phase 2)_ are not yet implemented.

This is the design for **cumulative** (informally "umbrella") progress: letting an
activity report a *calculation of its own progress* against one or more **other**
activities, so a course/unit landing page can show an aggregate roll-up of the
activities that report into it.

It builds directly on [The Modulus Agent](./AGENT.md) (the client library and the
server-side activity-state ingestion) and touches the
[data model](./DATA-MODEL.md) for progress.

## The mental model: everything is an activity

The Modulus model is **pure: everything is an activity.** There is no formal
parent/child relationship and no "container" entity. A cumulative page (e.g. a
`calculus-1` course index listing twelve lessons) is just an **ordinary activity
that happens to have no problems of its own** — its progress is *computed by other
activities reporting a calculation against it*.

So the feature is not "parents and children." It is simply:

> An activity may, on each progress submission, **also** submit a progress value
> for one or more **other** activities, addressed **by URL**, where that value is
> a calculation of the reporting activity's own progress.

The author of a lesson declares, on that lesson, _which_ other activity it reports
against and _how much_ it may contribute (a normalized `0..1` value). For example,
each of the twelve `calculus-1` lessons contributes up to `1/12` of the index
page's total; a lesson at own-progress `0.5` reports `0.5 × 1/12` toward the index.
The author supplies the contribution weight — nothing is inferred or calculated by
the platform.

## Today's behaviour (baseline)

For the full picture see [AGENT.md](./AGENT.md); the parts this work changes:

- **Transport.** `apps/agent`'s `ApiClient` hits **two** endpoints —
  `/routes/agent/activity/progress` and `/routes/agent/activity/page-state` —
  each `GET`/`PUT`, Bearer-authed, with a rolling `new_token` on every response.
- **Auth scope.** The OAuth 2.0 + PKCE `redirect_uri` _is_ the activity URL; the
  gradebook resolves it via `findActivityByUrl()` and bakes a **single**
  `activity_id` into the JWT (`token-issuer.ts`). The access token is therefore
  bound to exactly one activity — which is why `modulus-provider.tsx` currently
  discards the agent and re-authenticates on every SPA route change.
- **Progress API.** `modulus.setProgress(number)` is a scalar high-water mark.
  `getProgress()` takes no input and returns a single `progress` number.
- **Storage.** The `progress` table is a per-`(activity_id, user_id)` high-water
  mark (`GREATEST` on upsert); `progress_events` is an append-only log of every
  accepted submission. **No parent/child column exists anywhere** — and, per the
  model above, none should.
- **Demo.** `BooleanQuestion` / `MultipleChoice` call
  `modulus.setProgress(score / totalPoints)`; the `calculus-1/index.tsx` page is
  static mock progress; lessons carry no contribution metadata.

## Phase 1 — the new API contract

Phase 1 ends at the point where the gradebook **receives** the new data over a new
contract. The route handlers validate and accept the new shapes and pass them to
the command layer; the real multi-activity behaviour is Phase 2.

### Decisions (locked)

1. **Single RPC endpoint.** Collapse the two routes into one
   `POST /routes/agent/activity` — the App Router handler at
   `apps/gradebook/src/app/routes/agent/activity/route.ts` — dispatching on an
   `op` discriminator. This is the cleanest "route according to the incoming
   request," and leaves room to batch progress + page-state in one call later.
2. **Author config via a per-route hook.** A lesson route calls a hook (working
   name `useReportsAgainst({ url, maxContribution })`) that registers the target
   with the agent on mount and clears it on unmount. The agent then **auto-expands**
   each `setProgress(selfValue)` into the multi-target submission, so the
   instrumentation components (`BooleanQuestion`, `MultipleChoice`) stay unchanged.

### The unified endpoint

```
POST /routes/agent/activity        // route.ts (App Router handler)
  { op: 'get-progress',   urls?: string[] }
  { op: 'set-progress',   updates: [{ url?: string, progress: number }] }
  { op: 'get-page-state' }
  { op: 'set-page-state', page_state: unknown }
```

The `activity/progress/route.ts` and `activity/page-state/route.ts` sub-routes are
removed in favour of the single `activity/route.ts` handler; `ApiClient`'s four
methods all target this single URL.

### Schemas (`packages/core/.../activity-state/schemas.ts`)

`setProgress` becomes a **list of targets** rather than a scalar:

```ts
// input
{ updates: [
    { url?: string, progress: number },  // url omitted ⇒ the token-bound "self" activity
    // …zero or more other activities this one reports a calculation against
] }
// output
{ results: [{ url: string, progress: number }], new_token?: string }
```

`getProgress` takes an **optional list of URLs** rather than `void`:

```ts
// input
{ urls?: string[] }                       // additional activities; self always included
// output
{ results: [{ url: string, progress: number }], new_token?: string }
```

`page-state` schemas are unchanged in shape — they simply move under the unified
endpoint and are not part of the cumulative work.

**Why URL-based, and why the source is implicit.** Every non-self update names a
**target URL**; the **source** is the implicit token-bound activity. Two things
follow:

- Keeping targets as **URLs (not pre-resolved `activity_id`s)** defers the
  resolve-or-create decision entirely to Phase 2 — the wire format never has to
  change when we tighten or relax that rule (see _Activity existence_ below).
- The implicit source gives Phase 2 the `(source, target, user)` key it needs to
  **sum** contributions across reporting activities. A naïve `GREATEST`
  high-water mark on the target would only ever reflect the single largest
  contributor, not the aggregate — so the source identity is load-bearing.

### Agent SDK changes (`apps/agent`)

- `ApiClient`: `getProgress` / `putProgress` carry the new list shapes and route
  to the unified endpoint.
- `ModulusAgent`: stores author-supplied "reports-against" config. On each
  `setProgress(selfValue)` it builds
  `updates = [self, { url, progress: selfValue * maxContribution }]`. `getProgress`
  gains the multi-URL form so a cumulative page can read itself **plus** the
  activities reporting into it.

### Demo wiring (`apps/agent-demo`)

- A lesson (e.g. `calculus-1/lesson-01.tsx`) declares its target + contribution
  via `useReportsAgainst(...)`; the value reaches the agent.
- `calculus-1/index.tsx` becomes a real (problem-free) activity that fetches its
  own progress plus the child URLs via the multi-URL `getProgress`, replacing the
  mock array.

### Phase 1 boundary

Route handlers validate/accept the new shapes and hand them to command signatures
updated to the new types. **Deferred to Phase 2:** multi-activity transactional
writes, contribution accumulation, multi-URL reads, and `progress_events`-aware
storage. Phase 1 may preserve self-only behaviour in the command stubs so the
system compiles and round-trips end-to-end.

## Phase 2 — backend, storage, and accumulation _(Phase 2)_

Sketched here only to keep the Phase 1 contract honest; not yet implemented.

- **Multi-activity write in one transaction.** `set-progress` updates the self
  activity (high-water mark, as today) and records each target contribution keyed
  by `(source, target, user)`, then derives the target's aggregate. Accumulation
  is a **sum of per-source contributions**, _not_ a high-water mark.
- **Multi-URL read.** `get-progress` resolves and returns progress for the
  requested set of URLs.
- **`progress_events`.** All agent submissions are now recorded as events, not
  only the high-water value in `progress` — the event log must capture the
  per-target contributions so the aggregate can be (re)computed/audited.
- **Authorization scope.** The token currently carries only `activity_id`
  (`token-issuer.ts`). Phase 2 needs the source's **activity code** in the request
  context (`AgentAuth`) so target URLs can be validated/created **within that
  code's scope** — a token should only be able to report against activities in its
  own activity code. The Phase 1 wire format is intentionally unaffected by this
  change.

### Activity existence (resolve vs. create) _(Phase 2)_

A target URL may or may not yet be a recorded activity. The contract carries the
raw URL precisely so this policy lives entirely in Phase 2:

- **Strict first.** A target URL is honored only if it is already a recorded
  activity URL **for the source's activity code**. Unknown / out-of-code targets
  are rejected. Reuses `findActivityByUrl()` plus the `activity_codes` /
  `activity-activity-code` tables.
- **Relaxed later.** When a target URL isn't yet an activity, **lazily create the
  activity row** (within the source's activity code) inside the same transaction
  before recording progress against it — so children can report into a cumulative
  page that hasn't been visited/created yet.

## Open naming questions

Not blocking; to settle during Phase 1 implementation:

- `op` values (`get-progress` / `set-progress` / …).
- The hook name `useReportsAgainst`.
- Field names `updates` / `results` and `maxContribution`.
