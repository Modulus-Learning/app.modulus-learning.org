---
title: "Cumulative ('Umbrella') Progress Reporting"
path: "cumulative-progress"
summary: "Design for activities that report a calculation of their own progress against other activities. Defines the new URL-based, list-shaped agent ↔ gradebook contract and the single RPC activity-state endpoint. Phase 1 (the contract) is specified here; Phase 2 (transactional multi-activity storage and accumulation) is deferred. STATUS: IN PROGRESS."
---

# Cumulative ('Umbrella') Progress Reporting

> **Status: IN PROGRESS — Phase 1 committed; Phase 2 implemented.** This document
> specifies **Phase 1** — the new agent ↔ gradebook API contract — and the
> **Phase 2** backend (transactional multi-activity writes with idempotent,
> increment-based accumulation, plus multi-URL reads) and the live demo index
> roll-up. Both phases are implemented; the remaining work is **Phase 2b**
> (lazy-create of missing targets).
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
2. **Author config via a per-route hook.** A lesson route calls a hook
   (`useContributesTo({ url, factor })`) that registers the target with the agent
   on mount and clears it on unmount. The agent then **auto-expands**
   each `setProgress(selfValue)` into the multi-target submission, so the
   instrumentation components (`BooleanQuestion`, `MultipleChoice`) stay unchanged.

### The unified endpoint

```
POST /routes/agent/activity        // route.ts (App Router handler)
  { op: 'get-progress',   urls?: string[] }
  { op: 'set-progress',   progress_for_current_page: number,
                          increments_for_other_pages: [{ url: string, factor: number }] }
  { op: 'get-page-state' }
  { op: 'set-page-state', page_state: unknown }
```

The `activity/progress/route.ts` and `activity/page-state/route.ts` sub-routes are
removed in favour of the single `activity/route.ts` handler; `ApiClient`'s four
methods all target this single URL.

### Schemas (`packages/core/.../activity-state/schemas.ts`)

`setProgress` carries the self activity's progress plus zero or more cumulative
contribution targets. (The original Phase 1 cut used a uniform `updates` list with
absolute values; Phase 2 revised it to the self-progress + `factor` shape below,
so the server can derive each increment from the idempotent self change — see
[Why increments](#why-increments-and-no-progress_contributions-table).)

```ts
// input
{
  progress_for_current_page: number,                  // self high-water mark
  increments_for_other_pages: [{ url: string, factor: number }],  // server applies Δself × factor
}
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
- The implicit source identifies *whose* high-water change drives each target
  increment, and scopes the write (source and target must share an activity
  code). Phase 2 anchors the increment to the source's idempotent self change —
  see [Why increments](#why-increments-and-no-progress_contributions-table).

### Agent SDK changes (`apps/agent`)

- `ApiClient`: `getProgress` / `putProgress` carry the new list shapes and route
  to the unified endpoint.
- `ModulusAgent`: stores author-supplied contribution config as a **list** of
  targets (`addContributionTarget` appends and returns a remover). On each
  submission it forwards the self progress plus one `{ url, factor }` entry per
  registered target (Phase 2 shape; the original Phase 1 cut sent absolute
  pre-multiplied `selfValue × factor` values). `getProgress` gains the multi-URL form so
  a cumulative page can read itself **plus** the activities reporting into it.

### Demo wiring (`apps/agent-demo`)

- A `useContributesTo({ url, factor })` hook
  (`ui/components/use-contributes-to.ts`) registers a target with the agent on
  mount and removes it on unmount.
- The three existing `calculus-1` lessons (`lesson-01/02/03.tsx`) each call
  `useContributesTo({ url: '/calculus-1', factor: 1 / 12 })`, so working through a
  lesson now submits both its own progress and its computed contribution to the
  course index over the new contract.
- **A leaf can report to more than one accumulator.** Registration is additive at
  every layer — the agent keeps a *list* of targets, `increments_for_other_pages`
  is an array, and the server applies each target independently. So a lesson that
  counts toward both a course index and a wider track simply registers twice:

  ```tsx
  // a lesson that contributes to two different accumulators
  useContributesTo({ url: '/calculus-1',        factor: 1 / 12 })
  useContributesTo({ url: '/calculus-bootcamp', factor: 1 / 30 })
  ```

  Each registration cleans up on unmount and is accumulated separately:
  `Δself × 1/12` flows to the course index and `Δself × 1/30` to the bootcamp on
  the same submission. Factors are independent (no constraint that they sum to
  anything), and scope is checked **per target** — a parent that shares no activity
  code with the leaf is skipped + warned while the others (and self) still apply.
- `calculus-1/index.tsx` is a **live cumulative activity** (Phase 2). It shows its
  own accumulated total via `modulus.progress()` (the index is itself an activity,
  with no problems of its own) and a per-child roll-up fetched with
  `modulus.getProgressFor([childUrls])` — the agent's public wrapper over the
  multi-URL `get-progress` read. Child paths are resolved to absolute activity
  URLs before the read; unknown / out-of-scope children come back omitted and
  render as 0. Navigating back to the index after working a lesson remounts the
  agent and re-fetches, so the roll-up reflects the latest contributions.

### Phase 1 boundary

Route handlers validate/accept the new shapes and hand them to command signatures
updated to the new types. **Deferred to Phase 2:** multi-activity transactional
writes, contribution accumulation, multi-URL reads, and `progress_events`-aware
storage. Phase 1 may preserve self-only behaviour in the command stubs so the
system compiles and round-trips end-to-end.

## Phase 2 — backend, storage, and accumulation

**Implemented.** Locked decisions for this cut:

- **Increment, derived from the self high-water change.** A cumulative activity's
  progress is *accumulated* — each contribution is **added** to it — and the
  amount added is computed **server-side** from the observed advance of the
  source's idempotent high-water mark (`Δself × factor`). No per-source breakdown
  table is needed.
- **Strict resolution.** A target URL is honored only if it is already a recorded
  activity that **shares an activity code** with the source. Unknown / out-of-code
  targets are skipped (see below). Lazy-creating missing targets is a later
  **Phase 2b**.
- **Skip + warn on a bad target.** The learner's own (self) progress is **always**
  persisted; an invalid umbrella target is logged and skipped rather than failing
  the whole submission. `result.others` contains only the valid targets.
- **Activity code derived at request time — no token change.** Scope is checked
  with an `activity_activity_code` self-join (does source share a code with
  target?), so the Phase 1 token (`activity_id` only) is left untouched.
  (`activity_codes.url_prefix` is optional and, in practice, often empty —
  membership via `activity_activity_code` is the authoritative scope.)

### Why increments, and no `progress_contributions` table

A cumulative activity (the `calculus-1` index) accumulates progress from its
children, each contributing `ownProgress × factor` (e.g. `factor = 1/12`). The
naïve worry is that a plain accumulator can't be made safe: the agent submits on
every interaction and **retries on failure**, so blindly adding a client-sent
increment would double-count if a submission commits but its response is lost.

The fix is to never let the client decide the increment. Self progress is an
**idempotent high-water mark** (`GREATEST(new, old)`). The server observes the
*actual advance* of that mark inside the write transaction and applies it,
scaled, to each target:

```
Δself   = GREATEST(submitted, stored) − stored      -- the real advance, in SQL
target += Δself × factor                            -- clamped to ≤ 1.0
```

Because `Δself` is read from the **persisted** mark (not anything the client
tracks), a retry sees self already at its mark and yields `Δself = 0`:

```
First delivery:  stored self 0.50, submit 0.75 → Δ = 0.25 → target += 0.25 × 1/12
Lost response, retry: stored 0.75, submit 0.75 → Δ = 0    → target += 0          ✓
Out-of-order/lower:   stored 0.75, submit 0.50 → Δ = 0    → target += 0          ✓
```

The cumulative update **inherits self's idempotency**. Totals stay correct
because across a lesson `Σ Δself = 1.0`, so the target receives `factor × 1.0 =
1/12`. It is concurrency-safe too: two children hitting the same target each do an
atomic `SET progress = progress + Δ` under a row lock, so no lost updates. This is
why the wire value for a target is a **`factor`, not a precomputed increment** —
the server derives the increment so it can anchor it to the idempotent mark.

This is a deliberate change from an earlier sketch that maintained a dedicated
`progress_contributions(target, source, user, contribution)` table and stored the
**sum** of per-source contributions. That table also achieves idempotency (re-applying
an absolute contribution is a no-op) and additionally makes a target's value
**reconstructable** from its parts — but at the cost of an extra table, a sum
recompute on every write, and more joins. The increment approach trades
reconstructability for a far smaller surface; see the trade-offs below.

### Write path (`set-progress`, one transaction)

1. **Self** → high-water `progress` update (returns `Δself`, the real advance) +
   a self `progress_events` row (`source_activity_id = null`), as Phase 1.
2. **Per target** — only when `Δself > 0` (a retry/no-op skips this entirely):
   1. resolve the activity by URL; verify it shares a code with self (else skip + warn);
   2. `progress[target] = LEAST(1.0, progress[target] + Δself × factor)` (upsert);
   3. record a contribution `progress_events` row (`source_activity_id = source`).
3. Return `{ progress: self, others: [{ url, progress }] }`.

### Read path (`get-progress`)

`progress[target]` already holds the accumulated total, so a cumulative page load
is a plain lookup — no recompute. `get-progress({ urls })` returns self plus, for
each requested URL that **shares a code** with self, a `{ url, progress }` entry in
`others` (resolved in parallel; unknown / out-of-scope URLs are skipped).

### `progress_events` and history

`progress_events` gains a nullable `source_activity_id`: `null` for direct/self
submissions, set to the source for a contribution event (where `activity_id` is
the cumulative target). Each event's `progress` is the activity's **resulting
value** at that moment — a consistent snapshot semantics for both self and target
events; the `source_activity_id` says which source triggered a target snapshot.

**Trade-offs worth naming:**

- **Not reconstructable from current state.** Without the per-source breakdown a
  target's value cannot be rebuilt from scratch — only by replaying events. This
  is the property the `progress_contributions` table would have preserved. The
  event log gives an audit trail; full rebuild would mean replaying it.
- **Reset must clear target + sources together** (so children re-advance and
  re-contribute). The dev helper `postgres/reset-demo-progress.sh` does, via URL
  prefix.
- **Float drift** across a handful of additions is negligible and bounded above by
  the `LEAST(1.0, …)` clamp.

### Activity existence (resolve vs. create)

A target URL may or may not yet be a recorded activity. The contract carries the
raw URL precisely so this policy lives entirely in the backend:

- **Strict (this cut).** A target is honored only if it is already a recorded
  activity that shares a code with the source. Unknown / out-of-code targets are
  skipped + warned. Reuses `findActivityByUrl()` plus the `activity_codes` /
  `activity_activity_code` tables.
- **Lazy-create (Phase 2b).** When a target URL isn't yet an activity, create the
  activity row inside the same transaction before recording progress — so children
  can report into a cumulative page that hasn't been visited/created yet. This is
  now specified in its own subsystem doc,
  [Dynamic Activities (Lazy Create)](./DYNAMIC-ACTIVITIES.md), which gates lazy
  creation behind a site-wide admin allowlist and records the decision to create
  the row **without** an activity-code association (so an instructor must manually
  add the URL to their activity code for it to appear in code-scoped roll-ups).

## Names as built

Settled during Phase 1 implementation (open to revision in review):

- `op` values: `get-progress` / `set-progress` / `get-page-state` /
  `set-page-state`.
- Request fields: `progress_for_current_page` + `increments_for_other_pages:
  [{ url, factor }]` (set-progress); `urls` (get-progress).
- Response fields: `progress` (self) + optional `others: [{ url, progress }]`.
- Agent API: `ModulusAgent.addContributionTarget(target): () => void`, with the
  `ContributionTarget = { url, factor }` type.
- Demo hook: `useContributesTo({ url, factor })`.
