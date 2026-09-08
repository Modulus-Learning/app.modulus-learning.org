---
title: "Cumulative ('Umbrella') Progress Reporting"
path: "cumulative-progress"
summary: "Design for activities that report a calculation of their own progress against other activities: the URL-based, list-shaped agent ↔ gradebook contract, the single RPC activity-state endpoint, the increment-from-high-water-mark accumulation model, and the per-target `rejected_targets` outcome that reports a refused cumulative target without failing the submission carrying it."
---

# Cumulative ('Umbrella') Progress Reporting

> **Status: IN PROGRESS — Phase 1 committed; Phase 2 implemented.** This document
> specifies **Phase 1** — the new agent ↔ gradebook API contract — and the
> **Phase 2** backend (transactional multi-activity writes with idempotent,
> increment-based accumulation, plus multi-URL reads) and the live demo index
> roll-up. Both phases are implemented.
>
> **Update — the activity-code scope gate has been removed.** Earlier cuts of
> Phase 2 (described below) gated umbrella contributions and reads on the source
> and target **sharing an activity code**, and deferred creation of unknown
> targets to a "Phase 2b." That gate contradicted the core model — the author is
> authoritative about which pages a lesson reports into, and Modulus stores no
> page→page relationship — and, worse, was incompatible with creating targets on
> demand (a freshly created row shares no code with anyone). **As built in that
> cut:** a `set-progress` submission accepted every target URL unconditionally and
> **created** the activity row when the URL was unseen — the unconditional part is
> itself superseded by the update below — and there is **no** activity-code scope
> check on either the write or read path. Activity codes are
> orthogonal to umbrella reporting. The passages below that describe the
> `sharesActivityCode` gate are retained for history; read them through this
> update.
>
> **Update — the sitewide activity URL allowlist has shipped.** Creating a
> target on demand is no longer unconditional. A target URL Modulus has not seen
> before is admitted only if an enabled allowlist rule matches it, and with no
> enabled rules nothing new is admitted at all. A refused target is reported
> per-target in `rejected_targets` and **never fails the submission carrying
> it** — see [Refused targets](#refused-targets). The allowlist is an
> **admission** policy: a target that already exists as an `activities` row is
> resolved without the policy being consulted, so a rule change cannot stop an
> existing cumulative page from being reported into.

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
{
  progress: number,                                   // self high-water mark
  others?: [{ url: string, progress: number }],       // each applied target
  rejected_targets?: [{ url: string, reason: RejectedTargetReason }],  // each refused target
  new_token?: string,
}
```

`rejected_targets` is omitted rather than empty when every target was accepted,
matching how `others` is already handled. See [Refused targets](#refused-targets).

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
  anything). Each target is applied on its own — created if unseen and admitted by
  the allowlist, refused on its own if not; there is no per-target activity-code
  scope check (superseded — see the status note).
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
- **Allowlist-gated resolution + create-on-demand.** ~~A target URL is honored
  only if it is already a recorded activity that shares an activity code with the
  source.~~ **(Superseded.)** There is **no** activity-code scope check — codes
  are orthogonal to umbrella reporting. A target that is already a recorded
  activity is honored outright. A target Modulus has **not** seen before is
  admitted only if the sitewide activity URL allowlist has an enabled rule
  matching it, and its row is then created in the same transaction. Every target
  requiring admission in one submission is decided against a **single policy
  snapshot**, loaded when the first unseen target needs evaluation. Self-only
  writes and contributions to known activities do not read policy.
- **Refuse authoring errors per target; clamp value glitches.** The learner's own
  (self) progress is **always** persisted. A *structural* authoring error in a
  target — a self-reference, a URL over the 255-character column limit, a URL
  that is not an admissible absolute URL, or one no allowlist rule admits —
  refuses **that target alone** and is reported in `rejected_targets`; the
  submission still succeeds. The one structural error that still rejects the
  whole request is a **duplicate target URL**, which the input schema refuses
  before any work is done. *Value* glitches — a `progress`/`factor` outside
  `[0,1]` — are **clamped**, never rejected, so a transient glitch can't discard
  real progress. `result.others` lists each applied target.
- **No token change.** Resolution is purely by URL
  (`findActivityByUrl` / lazy-create), so the Phase 1 token (`activity_id` only)
  is left untouched. The `activity_activity_code` self-join that formerly scoped
  contributions is gone.

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

0. **Serialize per learner** — take a transaction-scoped advisory lock keyed by
   `user_id` (`pg_advisory_xact_lock`), so two concurrent submissions for the same
   user can't deadlock on overlapping target row locks acquired in differing order.
1. **Self** → high-water `progress` update (submitted value clamped to `[0,1]`;
   returns `Δself`, the real advance) + a self `progress_events` row
   (`source_activity_id = null`), as Phase 1.
2. **Per target** — only when `Δself > 0` (a retry/no-op skips this entirely).
   The registration service loads the allowlist snapshot only when an unseen
   target needs evaluation, and reuses it for the rest of the submission. No
   policy is read when all targets already exist. For each target:
   1. resolve the activity by URL through the shared registration service, which
      **creates the row** when the URL is unseen *and* an enabled allowlist rule
      admits it (no code check). A refusal — including a self-reference, which
      this caller detects because it is the only one that knows which activity is
      reporting — collects a `{ url, reason }` entry and moves to the next
      target, creating nothing;
   2. `progress[target] = LEAST(1.0, GREATEST(0, progress[target] + Δself × factor))`
      (upsert), which also reports whether the high-water mark actually advanced;
   3. **only if it advanced**, record a contribution `progress_events` row
      (`source_activity_id = source`) and nudge line items — a clamped no-op writes
      nothing.
3. Return `{ progress: self, others: [{ url, progress }], rejected_targets: [{ url, reason }] }`,
   with `others` and `rejected_targets` omitted when empty.

### Read path (`get-progress`)

`progress[target]` already holds the accumulated total, so a cumulative page load
is a plain lookup — no recompute. `get-progress({ urls })` returns self plus, for
each requested URL that resolves to a known activity, a `{ url, progress }` entry
in `others` (resolved in parallel; there is no activity-code scope check).
Reads are **side-effect-free**: an unknown URL is simply omitted (the agent
renders a missing entry as `0`) — the read path never lazy-creates.

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
raw URL precisely so this policy lives entirely in the backend. **As built:**

- **Create on demand, gated by the sitewide allowlist.** When a target URL isn't
  yet an activity, its row is created inside the same transaction (a bare
  `activities` row — `id` + `url`, **no** activity-code association) before the
  contribution is applied, **provided an enabled allowlist rule admits the URL**.
  There is no scope check, so a child can report into a cumulative page that has
  never been visited — but only within an admitted origin and path. Resolution,
  the policy evaluation, the insert and the create race all live in one shared
  service, `ActivityRegistrationService`
  (`packages/core/src/modules/activity-registration/services/activity-registration.ts`),
  which is the only writer of `activities` rows outside seeds and fixtures. It
  resolves an existing row first, inserts with `ON CONFLICT (url) DO NOTHING`, and
  re-reads the winning row when its insert returns nothing, so two concurrent
  registrations of the same URL both succeed and land on one row.
- **Resolve before evaluate, which is what grandfathering means here.** The
  lookup happens *before* the policy is consulted, so a target that is already a
  recorded activity is honored whether or not any current rule matches it.
  Editing, disabling or deleting a rule therefore cannot stop an existing
  cumulative page from being reported into. The allowlist governs admission, never
  use.
- **Deny-by-default.** With no enabled rules, no previously unseen target is
  created. A freshly seeded database is in exactly that state — seeds create no
  rules — so cumulative targets naming new URLs come back in `rejected_targets`
  until an administrator adds the first rule at `/admin/activities`.

### Refused Targets

A refused target is reported, not thrown. `set-progress` answers `200` with the
accepted work done and lists what it would not take:

```ts
// packages/core/src/modules/agent/activity-state/schemas.ts
export const rejectedTargetReasonSchema = z.enum([
  // No enabled allowlist rule matches this previously unseen URL.
  'activity_url_not_allowed',
  // Not parseable as an admissible absolute URL.
  'malformed_url',
  // Longer than the 255-character `activities.url` column.
  'url_too_long',
  // The target is the reporting activity itself.
  'self_reference',
])
```

The first three are the shared registration service's own denial vocabulary,
named here rather than redefined, so the two cannot drift. Only `self_reference`
is added by this path, because deciding it needs the reporting activity's id and
is therefore this caller's check rather than the service's.

**A rejected target never fails the submission carrying it.** The target list
comes from the page's authored markup, so the same bad URL recurs in every
submission that page makes: failing the request would not cost one update, it
would permanently stop all progress from that page — including the learner's own
valid self high-water mark, which has already committed. This is a repair, not
only an addition: a self-referencing target and an over-long target URL each used
to roll the whole transaction back, and both are now per-target outcomes.

A refused target creates nothing: no activity row, no progress row, no
`progress_events` entry, and no line-item update. Self progress and every allowed
target in the same submission commit normally.

On the client, `ModulusAgent` logs the list and does nothing else — it does not
mark the progress unsubmitted, retry, or raise:

```ts
// apps/agent/src/core/agent.ts (excerpt)
#logRejectedTargets(rejected: RejectedTarget[] | undefined): void {
  if (rejected == null || rejected.length === 0) {
    return
  }
  void this.#logger?.log('Cumulative contribution targets rejected by the server', rejected)
}
```

Be clear about what that diagnostic is worth: the agent's default logger is
`createSilentLogger()`, deliberately, because it runs in learners' browsers on
third-party pages. The message reaches an author who passed `createConsoleLogger()`
or `createDebugLogger()` and nobody else. The server log is the reliable record of
a refused target.

What that server line contains is worth stating exactly. The denial warn adds the
refusal `reason` plus the candidate's normalized `origin` and `path` — the URL is
split so its query string and fragment are dropped. On top of that sits the
context every core log line carries by design: `request_id`, `command`, and, in
`agent` auth mode, `user_id`, all spread in from the `AsyncLocalStorage` context
`prepareLogContext` establishes at the command boundary
(`packages/core/src/lib/utils.ts`). That `user_id` is Modulus's own opaque
identifier, which is exactly the identifier the
[data-isolation boundary](./DATA-MODEL.md#the-data-isolation-boundary-in-schema-terms)
is built around. What never reaches the line is a token, an auth code, a PKCE
value, or the rejected URL's query string or fragment.

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

---

## Where to go next

- [AGENT](./AGENT.md) — the client library that expands one `setProgress` call
  into this submission, and the server-side ingestion that receives it.
- [DATA-MODEL](./DATA-MODEL.md) — the `progress`, `progress_events` and
  `activity_url_allowlist_rules` tables this design writes and reads.
- [AUTHN-AUTHZ](./AUTHN-AUTHZ.md) — how the token-bound
  `(user, activity, scope)` tuple that identifies the reporting activity is
  issued, and how the same allowlist gates the OAuth path.
- [Dynamic Activities](./DYNAMIC-ACTIVITIES.md) — why a created activity carries
  no activity-code association, and what the earlier allowlist proposal got
  wrong.
