---
title: "Cumulative ('Umbrella') Progress Reporting"
path: "cumulative-progress"
summary: "Design for activities that report a calculation of their own progress against other activities. Defines the new URL-based, list-shaped agent ↔ gradebook contract and the single RPC activity-state endpoint. Phase 1 (the contract) is specified here; Phase 2 (transactional multi-activity storage and accumulation) is deferred. STATUS: IN PROGRESS."
---

# Cumulative ('Umbrella') Progress Reporting

> **Status: IN PROGRESS — Phase 1 committed; Phase 2 underway.** This document
> specifies **Phase 1** — the new agent ↔ gradebook API contract — and the
> **Phase 2** backend (transactional multi-activity storage and sum-based
> accumulation). Phase 1 is committed; Phase 2 sections below reflect the locked
> design and are being implemented.
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
{ progress: number, others?: [{ url: string, progress: number }], new_token?: string }
```

`getProgress` takes an **optional list of URLs** rather than `void`:

```ts
// input
{ urls?: string[] }                       // additional activities; self always included
// output
{ progress: number, others?: [{ url: string, progress: number }], new_token?: string }
```

**Responses keep self distinct from others.** `progress` is the self
(token-bound) activity's value — the field the agent already tracks as its
high-water mark, so its internal progress logic is unchanged. `others` carries
the per-URL list for the reported-against activities. This small asymmetry is
deliberate: the token makes self the authenticated subject, and the agent tracks
it specially, so the wire format reflects that rather than forcing the agent to
locate "self" inside a uniform array. `others` is **optional and unpopulated in
Phase 1** — it lights up with the Phase 2 multi-activity work.

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

- A new `useReportsAgainst({ url, maxContribution })` hook
  (`ui/components/use-reports-against.ts`) registers a target with the agent on
  mount and removes it on unmount.
- The three existing `calculus-1` lessons (`lesson-01/02/03.tsx`) each call
  `useReportsAgainst({ url: '/calculus-1', maxContribution: 1 / 12 })`, so working
  through a lesson now submits both its own progress and its computed contribution
  to the course index over the new contract.
- `calculus-1/index.tsx` **stays on its mock progress array for Phase 1.** Turning
  it into a live (problem-free) activity that reads its own progress plus the
  reporting activities depends on the multi-URL `getProgress` read, which is Phase
  2 — wiring it now would only display empty data.

### Phase 1 boundary

Route handlers validate/accept the new shapes and hand them to command signatures
updated to the new types. **Deferred to Phase 2:** multi-activity transactional
writes, contribution accumulation, multi-URL reads, and `progress_events`-aware
storage. Phase 1 may preserve self-only behaviour in the command stubs so the
system compiles and round-trips end-to-end.

## Phase 2 — backend, storage, and accumulation _(Phase 2)_

Locked decisions for the initial Phase 2 cut:

- **Sum, not high-water.** A cumulative activity's progress is the **sum of the
  current contributions from its sources**, maintained transactionally.
- **Strict resolution.** A target URL is honored only if it is already a recorded
  activity that **shares an activity code** with the source. Unknown / out-of-code
  targets are skipped (see below). Lazy-creating missing targets is a later
  **Phase 2b**.
- **Skip + warn on a bad target.** The learner's own (self) progress is **always**
  persisted; an invalid umbrella target is logged and skipped rather than failing
  the whole submission. `result.others` contains only the valid targets.
- **Activity code derived at request time — no token change.** Scope is checked
  with an `activity_activity_code` self-join (does source share a code with
  target?), so the Phase 1 token (`activity_id` only) is left untouched. This is a
  refinement of the earlier sketch, which proposed carrying the code in the token;
  the join makes that unnecessary. (`activity_codes.url_prefix` is optional and,
  in practice, often empty — membership via `activity_activity_code` is the
  authoritative scope.)

### Why a dedicated `progress_contributions` table

This table is the crux of Phase 2, so the reasoning is worth recording.

A normal activity's progress is a **high-water mark**: one learner, one activity,
one number that only goes up — the existing `progress` table, keyed by
`(activity_id, user_id)` and updated with `GREATEST(new, old)`.

A **cumulative** activity (the `calculus-1` index) is different. Its progress is
not one thing the learner did; it is the **sum of many contributions** flowing in
from its children, where each child contributes `ownProgress × maxContribution`:

```
index progress = contribution(lesson-01) + contribution(lesson-02) + … + contribution(lesson-12)
```

A high-water mark **cannot** express this. If `progress[index]` were a single
number that each child wrote to:

- lesson-01 finishes → wants index = `0.083`
- lesson-02 finishes → wants index = `0.083`

`GREATEST(0.083, 0.083)` is still `0.083` — the second contribution is **lost**. A
single number has no memory of *who* contributed what, so it cannot add them up.
To sum, you must remember **each source's current contribution separately**. That
is exactly what `progress_contributions` holds:

```
progress_contributions(
  target_activity_id,   -- the cumulative activity receiving the contribution (the index)
  source_activity_id,   -- the child activity providing it (lesson-01)
  user_id,              -- whose progress this is
  contribution,         -- the current value from THIS source: ownProgress × maxContribution
  …timestamps
)
PRIMARY KEY (target_activity_id, source_activity_id, user_id)
```

The **primary key is the triple** because there is exactly one current
contribution per *(who, from-which-child, to-which-parent)*. That uniqueness makes
a write an idempotent **upsert** rather than an append: a child re-submitting at a
higher value updates its own row in place (GREATEST); a different child writes a
different row. After two lessons finish you have two rows you can add:

| target | source    | user | contribution |
| ------ | --------- | ---- | ------------ |
| index  | lesson-01 | u    | 0.0833       |
| index  | lesson-02 | u    | 0.0556       |

### Write path (`set-progress`, one transaction)

1. **Self** → high-water `progress` update + a self `progress_events` row
   (`source_activity_id = null`), exactly as Phase 1.
2. **Per umbrella target:**
   1. resolve the activity by URL; verify it shares a code with self (else skip + warn);
   2. upsert this source's contribution row (`GREATEST`, so it is monotonic);
   3. recompute the target total: `SELECT sum(contribution) … WHERE target = ? AND user = ?`;
   4. write that sum to `progress[target]` (so reads and LTI passback see one number);
   5. record a contribution `progress_events` row (`source_activity_id = source`).
3. Return `{ progress: self, others: [{ url, progress: sum }] }`.

So `progress_contributions` is the normalized **breakdown** (the addends) and
`progress[target]` is the maintained **total** (their sum). The breakdown is what
lets the total actually *be* a sum.

### Read path (`get-progress`)

`progress[target]` already holds the maintained total, so a cumulative page load is
a plain lookup — no recompute. `get-progress({ urls })` returns self plus, for each
requested URL that shares a code with self, a `{ url, progress }` entry in `others`.

### `progress_events` and history

`progress_events` gains a nullable `source_activity_id`: `null` for direct/self
submissions, set for contribution events. The dedicated `progress_contributions`
table is the **current state** (cheap sum, source of truth for the total);
`progress_events` is the **audit/history** (replayable, "how did we get here"). We
could instead derive a target's total from the events ("sum the latest event per
source"), but that is an expensive, fragile query on an ever-growing log; a table
with one current row per source keeps the sum a trivial aggregate.

**Trade-off worth naming:** the total is denormalized into `progress[target]`.
`progress_contributions` is authoritative; the `progress` row is a maintained cache
of their sum. Consistency is preserved by always recomputing the sum inside the
**same transaction** as the contribution upsert, so a reader (or LTI passback)
never sees a stale or partial total.

### Activity existence (resolve vs. create)

A target URL may or may not yet be a recorded activity. The contract carries the
raw URL precisely so this policy lives entirely in the backend:

- **Strict (this cut).** A target is honored only if it is already a recorded
  activity that shares a code with the source. Unknown / out-of-code targets are
  skipped + warned. Reuses `findActivityByUrl()` plus the `activity_codes` /
  `activity_activity_code` tables.
- **Lazy-create (Phase 2b).** When a target URL isn't yet an activity, create the
  activity row (linked to the source's activity code) inside the same transaction
  before recording progress — so children can report into a cumulative page that
  hasn't been visited/created yet.

## Names as built

Settled during Phase 1 implementation (open to revision in review):

- `op` values: `get-progress` / `set-progress` / `get-page-state` /
  `set-page-state`.
- Request fields: `updates` (set-progress), `urls` (get-progress).
- Response fields: `progress` (self) + optional `others`.
- Agent API: `ModulusAgent.addReportTarget(target): () => void`, with the
  `ReportTarget = { url, maxContribution }` type.
- Demo hook: `useReportsAgainst({ url, maxContribution })`.
