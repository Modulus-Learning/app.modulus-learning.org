---
title: "LTI Score Submission"
path: "lti-score-submission"
summary: "How Modulus passes scores back to the LMS: a level-triggered work queue over line items, exposed as a partial index, drained by lease-fenced workers that can run many-at-once, with throttled per-line-item submission, cutoff-aware high-water marks, and a per-platform circuit breaker that paces on quota, pauses on trouble, and records incidents."
---

# LTI Score Submission

This is the reference for how Modulus reports learner progress back to the LMS
gradebook over LTI Assignment & Grade Services (AGS). It is the Tier 1 ↔ Tier 2
"score passback" surface introduced in [ARCHITECTURE](./ARCHITECTURE.md) (decision
3) and [LTI](./LTI.md): a **queued, worker-driven subsystem**, deliberately *not*
an inline call during a request, because at OSU scale several thousand learners
may report progress at nearly the same moment and **no score may be lost**.

If you only read one thing: score submission is a **level-triggered queue**. A
line item is "work to do" exactly when `submittable_progress > submitted_progress`,
and that comparison of two durable columns — not a flag that someone sets and
clears — is the single source of truth for the whole system. Almost every design
choice below falls out of keeping that comparison authoritative and making it
safe for many workers to drain concurrently.

The code lives under `packages/core/src/modules/app/lti/score-submission/`
(the worker, the queue repository) and
`packages/core/src/modules/agent/activity-state/` (the progress-ingestion side
that feeds the queue). The schema is in
`packages/core/src/database/schema/source/lti/lti-lineitems.ts`.

## The model

Progress originates in [the agent](./AGENT.md) as a normalized value in `[0, 1]`
and flows through four tables:

```
  agent → setProgress ──► progress         (high-water mark per user×activity×scope)
                      └──► progress_events  (append-only log of every advance)
                              │
                              ▼
                          lti_lineitems     (scoped work queue; stable row per user×activity×LMS line item)
                              │
              worker claims ──┘
                              ▼
                          Canvas AGS  POST .../scores
```

- **`progress`** holds the current high-water mark (HWM) for a
  `(user, activity, scope)` tuple. Writes are monotonic (`GREATEST`) within that
  tuple, so one term cannot advance another.
- **`progress_events`** is the append-only history: one row each time the HWM
  advances in the same scope, stamped with the database `NOW()` at write time. See
  [DATA-MODEL](./DATA-MODEL.md). Its timestamp being server-assigned is
  load-bearing (see [Cutoffs](#cutoffs-and-high-water-marks)).
- **`lti_lineitems`** is the unit of submission and the work queue. One row binds
  a `(user, activity, scope)` to a specific LMS line item (`lineitem_url`,
  `lti_user_id`, `platform_issuer`, `deployment_id`) and carries all submission
  state. Database uniqueness remains `(user_id, activity_id, lineitem_url)`, so
  scope reassignment reuses this stable row rather than duplicating it.

A line item is created/refreshed on LTI launch (when Canvas hands us the line-item
URL), and updated continuously by progress ingestion. Workers drain it.

## Line-item state

The columns that drive submission, grouped by role:

| Group | Columns | Meaning |
| --- | --- | --- |
| Identity | `user_id`, `activity_id`, `scope_id`, `platform_issuer`, `deployment_id`, `lineitem_url`, `lti_user_id` | what/where to submit |
| Value | `submittable_progress`, `submitted_progress` | the **target** vs. what Canvas already has |
| Last success | `submitted_at` | when we last successfully passed a score back |
| Schedule | `submission_eligible_at` | earliest time this is due (throttle / backoff / priority key) |
| Lease | `submission_lease_expires_at`, `submission_lease_token` | the in-flight claim + its fencing token |
| Terminal | `dead_at` | non-null ⇒ permanently out of the queue (reversible) |
| Diagnostics | `submission_error_count`, `submission_error_category`, `submission_error_message` | failure tracking |
| Cutoff | `cutoff_at` | LMS deadline beyond which student work no longer counts |

Two pairings are worth internalizing:

- **`submittable_progress` vs. `submitted_progress`** is the value axis — "what we
  *may* submit" vs. "what we *have* submitted." Their inequality is eligibility.
- **`submission_eligible_at` vs. `submission_lease_expires_at`** are two distinct
  time gates that look alike but must never be merged — see [The two timestamps](#the-two-timestamps).

## The queue is a partial index

There is no separate queue table. The set of submittable line items *is* a partial
index:

```sql
CREATE INDEX lti_lineitems_eligible_idx
  ON lti_lineitems (platform_issuer, submission_eligible_at)
  WHERE dead_at IS NULL
    AND submittable_progress > submitted_progress;
```

Postgres maintains it automatically, it can never drift from the source of truth,
and its live size tracks the *pending* set rather than the whole table. Selecting
the next item to work is then a cheap indexed range scan, ordered by the schedule:

```sql
SELECT … FROM lti_lineitems
WHERE platform_issuer = $1
  AND dead_at IS NULL
  AND submittable_progress > submitted_progress
  AND submission_eligible_at <= NOW()
  AND (submission_lease_expires_at IS NULL OR submission_lease_expires_at < NOW())
ORDER BY submission_eligible_at
LIMIT 1 FOR UPDATE SKIP LOCKED;
```

Because eligibility is the comparison of two durable columns, the queue is
**self-correcting**: if a new progress event raises `submittable_progress` while a
worker is mid-submission, the item simply remains (or becomes) eligible after the
worker writes its lower `submitted_progress`. No worker ever has to reason about
"did newer data arrive while I was working."

## Claiming, leases, and fencing

The subsystem is built to run **many workers in parallel per platform**. Three
mechanisms cooperate to make that safe.

**1. `SELECT … FOR UPDATE SKIP LOCKED`** lets concurrent workers select *distinct*
rows without blocking each other.

**2. A persisted lease** (`submission_lease_expires_at`) survives the worker's HTTP
call to Canvas and the transaction boundary, so a claimed item is hidden from other
workers until the lease expires. Claiming is a single atomic statement that selects,
locks, stamps the lease, and returns the row:

```sql
WITH next AS (
  SELECT id FROM lti_lineitems
  WHERE … ORDER BY submission_eligible_at LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE lti_lineitems l
SET submission_lease_expires_at = NOW() + make_interval(secs => $lease_duration),
    submission_lease_token      = gen_random_uuid()
FROM next WHERE l.id = next.id
RETURNING l.*;
```

**3. A fencing token** (`submission_lease_token`) makes the lease *verifiable*. The
worker carries the token returned at claim time and, when it records the result,
conditions every write on the token still matching:

```sql
UPDATE lti_lineitems
SET …
WHERE id = $id AND submission_lease_token = $token_I_hold;
```

If a worker's lease expired and another worker re-claimed the item (minting a new
token), the original worker's result write affects **zero rows** — it detects this
(`rowCount = 0`), discards its result, and writes nothing further (no line-item
update, no health update, no event). This is what keeps the database consistent
under preemption.

What the token protects, and what it doesn't:

- ✅ It protects the **database row** from a stale overwrite by a preempted worker.
- ❌ It does **not** prevent a duplicate POST to Canvas — by the time a worker
  learns it was preempted, it has already sent the request. We rely on two things
  for that: the **request timeout is strictly shorter than the lease**
  (`request_timeout_seconds` 60s < `lease_duration_seconds` 120s), so a live-but-slow
  worker aborts before its lease can be stolen; and Canvas's own stale-timestamp
  handling, which we classify as `superseded` and treat as success, absorbs the rare
  genuine race harmlessly.

A claim crash needs no special handling: the lease simply expires and another
worker re-claims. Because the failed worker never wrote a result, the line item
keeps its place in the queue.

## The two timestamps

`submission_eligible_at` and `submission_lease_expires_at` are both "don't touch
before time T" gates sitting in the selection `WHERE`, but they are different
concepts, and **keeping them separate is load-bearing for correctness**:

- **`submission_eligible_at` — the schedule.** "When is this due?" Driven by the
  item's own lifecycle (throttle after success, backoff after failure, and a
  conditional re-stamp when new progress makes it submittable). It is also the
  **ordering / priority key**. Written by *both* the progress-ingestion producer
  and the worker.
- **`submission_lease_expires_at` — the lease.** "Is this owned right now?"
  Concurrency control, paired with the fencing token. Written *only* by the worker.

They cannot be merged: the high-frequency producer legitimately rewrites the
schedule, and if the lease lived on the same column a progress event could shorten
an in-flight lease and let a second worker re-claim a submitting item. The lease
must live on a column the producer never touches.

## Scheduling: throttle, not debounce

Submissions against a single line item are **throttled**: there is no initial delay
(the first progress submits immediately), but successive submissions are at least
`throttle_seconds` apart. The gap is applied by the worker, which on a successful
submission sets `submission_eligible_at = NOW() + throttle_seconds`.

The subtle part is on the ingestion side. `submission_eligible_at` behaves as a
"waiting since" timestamp: it is stamped once when a line item *enters* the
submittable state and left untouched while it stays submittable, so that a
continuously-progressing learner's item keeps its place in line instead of being
perpetually reset to "newest" (which would starve it behind a backlog). Defining
`submittable := submittable_progress > submitted_progress`, each progress event
runs a single atomic update:

```sql
UPDATE lti_lineitems
SET submittable_progress   = GREATEST(submittable_progress, $progress),   -- monotonic
    submission_eligible_at = CASE
      WHEN submittable_progress > submitted_progress     -- OLD submittable: already queued
        THEN COALESCE(submission_eligible_at, now())      --   → keep its priority
      ELSE GREATEST(submission_eligible_at, now())        -- OLD not submittable: (re)enter
    END,
    updated_at = now()
WHERE user_id = $user AND activity_id = $activity
  AND scope_id = $scope
  AND dead_at IS NULL
  AND (cutoff_at IS NULL OR cutoff_at >= $event_time);
```

Every column reference on the right of `SET` reads the *old* row value, so the
`CASE` tests pre-update `submittable` even as the same statement overwrites
`submittable_progress`. This yields: no initial delay; ≥ `throttle_seconds` between
submissions; throttle and backoff windows are never shortened by incoming progress;
and an already-waiting item keeps its FIFO priority.

The implementation performs this in one statement with a materialised candidate
set. If a live candidate exists only in another scope, it returns
`scope_mismatch = true`; the other-scope row is not locked or updated. The
service emits an opaque diagnostic instead of probing or crossing scopes.

## Cutoffs and high-water marks

`submittable_progress` is the **cutoff-aware** high-water mark: the greatest progress
the learner reached *at or before* `cutoff_at` (the LMS deadline for student work).
After the cutoff passes, ingestion stops advancing `submittable_progress` (the
`cutoff_at >= $event_time` guard above), so it freezes at the last pre-cutoff value;
the worker submits that, `submitted_progress` catches up, and the item falls out of
the queue.

This is correct *because progress-event timestamps are the server's `NOW()` at
write time* — i.e. the processing order. "Pre-cutoff" therefore literally means
"processed before the cutoff instant," so when any pre-cutoff event runs, no
post-cutoff event has been processed yet and the high-water mark cannot have been
inflated by post-cutoff progress. Combined with the "only advance on a real HWM
increase" rule, `submittable_progress` can only ever accumulate pre-cutoff values.
**This guarantee depends on `progress_events.submitted_at` remaining server-assigned**;
if events ever carry a client/event time, that reasoning breaks.

Canvas always accepts AGS passback regardless of the assignment's due/lock date
(the cutoff governs *student work*, not instructor-driven grading that may happen
later). That means **Modulus is the sole authority on cutoff enforcement** — there
is no LMS-side backstop — which is why getting `submittable_progress` strictly
cutoff-aware matters.

## Launch initialization

A line item is created or reconciled during a verified LTI resource-link launch,
when Canvas provides the AGS line-item endpoint and the launch has already
resolved an academic scope. Launch first seeds `submittable_progress` from the
cutoff-aware HWM in that scope. Reconciliation then follows one locked shape:

1. `INSERT … ON CONFLICT DO NOTHING RETURNING` on the stable unique identity
   `(user_id, activity_id, lineitem_url)`.
2. Return immediately if the insert won.
3. After a conflict, select the existing row `FOR UPDATE` on that identity.
4. Compare the locked row's scope with the verified launch scope.
5. Run exactly one same-scope refresh or one scope-rebind update.

The **same-scope branch** refreshes current verified platform/deployment/user
identity and `cutoff_at`, revives the item, preserves lease/error/submission
state, and raises `submittable_progress` with `GREATEST`. Its scheduling `CASE`
keeps an existing throttle/backoff window and FIFO priority.

The **scope-rebind branch** treats Canvas's verified term reassignment as a new
submission lifecycle on the same stable row. It sets the new `scope_id`, replaces
`submittable_progress` with the new scope's exact cutoff-aware HWM, resets
submitted timestamps/value, lease, error, dead, and retry fields, and makes the
row eligible now. Old-scope `progress` and `progress_events` are untouched. The
transition emits a structured diagnostic with only the line-item id and opaque
old/new scope ids. A worker holding the old lease is fenced when it later tries
to record its result.

Within one scope, launch never lowers a score. A verified rebind is the deliberate
exception: it must not carry the prior scope's high-water mark into the new term.

## Death and revival

`dead_at` is a reversible latch, not an enum. A line item is marked dead — dropped
from the partial index — when a submission fails in a way that won't succeed on retry
(`lineitem_dead`: course concluded, assignment unpublished, user no longer enrolled,
resource gone, etc., as classified from the Canvas response). It can be revived by
setting `dead_at = NULL`, which today happens on launch (e.g. an instructor extends a
deadline and the learner relaunches). There is deliberately no separate
`complete`/`done` state: a caught-up item (`submittable_progress = submitted_progress`)
leaves the queue automatically via the index predicate.

## Submitting a score

The worker POSTs to `{lineitem_url}/scores` with an AGS score payload: `userId`,
`scoreGiven = submittable_progress`, `scoreMaximum = 1`, `gradingProgress =
FullyGraded`, `activityProgress = Completed` (at 1.0) or `Submitted` (below 1.0),
and a fresh `timestamp`. The response status and body are run through a Canvas-specific
classifier (`error-classifier.ts`) that maps them to one of a small set of categories:

| Category | Meaning | Disposition |
| --- | --- | --- |
| success / `superseded` | accepted, or Canvas already has a newer score | record `submitted_progress`, throttle — **clean round-trip** (resets the breaker) |
| `lineitem_dead` | this line item/course/user/assignment is the problem | mark `dead_at` — **clean round-trip** (we reached Canvas) |
| `rate_limit` | 403 / bucket exhausted | **directive**: trip the breaker immediately, reset the governor |
| `platform_token` | the dev key / token is broken | invalidate cached token; per-item backoff; counts toward the trip |
| `transient` / `platform_config` / `unknown` | other Canvas-side failures | per-item backoff; counts toward the trip |
| `malformed` | our request was shaped wrong (a Modulus bug, not one item) | per-item backoff; counts toward the trip; **never** marks the item dead |
| *(internal exception)* | we couldn't complete the attempt at all | per-item backoff; counts toward the trip |

Only the first two rows are "clean round-trips" that reset the breaker's failure
counter; every other row increments it. The next section explains how that counter
drives platform-level behavior.

> **Known issue — `timestamp` is POST-time, not earned-time.** The `timestamp` we send
> is `new Date().toISOString()` (submission time), whereas AGS defines it as "when the
> score was *modified in the tool*" — i.e. when the learner reached the high-water mark,
> which is the `submitted_at` of the progress event that established `submittable_progress`.
> Canvas also uses `timestamp` for ordering (it rejects a stamp older than the last one it
> recorded — the `superseded` path above), so this is not purely cosmetic. Sending
> earned-time would be more spec-faithful and give cleaner idempotency, and it is now
> *safe* because `submittable_progress` is monotonic (a higher HWM always comes from a
> later event, so per-item stamps stay monotonically increasing). It is not yet done
> because the submitter only has the HWM *value*, not the establishing event's time — that
> would need a persisted `submittable_progress_at` column fed by the ingestion and launch
> paths. Tracked in [SCORE-SUBMISSION-TODO](./SCORE-SUBMISSION-TODO.md). We also do not
> send the optional `submission.submittedAt`; deliberately, as it buys little for our model.

## Error handling, in three tiers

Failures are handled at three levels, each more conservative — more reluctant to
act — than the last:

- **Tier 1 — per-line-item backoff (always).** Any failure that isn't a clean
  round-trip backs *that item* off (`submission_eligible_at = NOW() + backoff`,
  exponential with jitter, capped) and leaves it in the queue; other items are
  unaffected. This is the stateless worker's only failure responsibility.
- **Tier 2 — the platform incident.** When failures stop looking like one bad item
  and start looking platform-wide, a circuit breaker pauses the whole platform and an
  incident is recorded. This is most of what follows.
- **Tier 3 — retiring a chronically-failing item.** Telling a genuinely-broken item
  the classifier missed apart from an innocent item caught in an outage is subtle and
  high-stakes (it stops reporting a learner's score). Deferred: for now such an item
  retries forever at capped backoff and revives on relaunch. See [Open
  work](#status-and-open-work).

The signal that separates Tier 1 from Tier 2 is **consecutive failures with
reset-on-success**: a single bad item among healthy traffic never escalates, because
other items' successes keep resetting the count. Only a run of failures with *no*
clean round-trip in between is read as a platform problem.

## The circuit breaker

Each platform's pacing is governed by an in-memory circuit breaker with three states:

- **closed** — normal; the worker pool runs at the governor's concurrency target.
  Every clean round-trip resets a consecutive-failure counter; every non-clean failure
  increments it. At `incident_trip_threshold` (K) the breaker **trips**.
- **open** — paused. No submissions; the breaker waits out an exponential backoff and
  lets in-flight work drain (ignoring those outcomes for state).
- **half_open** — a single probe. One success **closes** (resume normal pacing); one
  failure re-opens with escalated backoff.

A **clean round-trip** — what resets the counter — is `success`, `superseded`, or
`lineitem_dead`: in all three we reached Canvas and acted on its response. Everything
else increments, **including an internal exception that prevented the attempt
entirely**. The *cause* (Canvas-side, our bug, the network) is recorded but never
changes whether a failure counts — that judgment is for investigation, not detection.

Two deliberate asymmetries:

- `rate_limit` is a **directive**, not a symptom — it trips immediately (K = 1) and
  resets the governor, because continuing only deepens the quota debt.
- There is **no staleness reset** on the counter. Five failures with zero successes
  between them — however far apart in time — is meaningful precisely *because* failures
  are expected to be rare; if anything it is a problem worth surfacing before the
  system gets busy again.

The breaker decides *whether and when* to send; the governor decides *how many*. After
a clear the breaker steps aside and the governor's cold-started ramp provides the
conservative re-entry — which is why closing on a single success is safe. The breaker
is **in-memory and single-process**; its durable shadow is `lti_platform_health`,
written on transitions to seed a restarting process and for observability.

## Concurrency and rate limiting

Within `closed` / `half_open`, the number of in-flight submissions is set by a
`QuotaGovernor` reading Canvas's `X-Rate-Limit-Remaining` and `X-Request-Cost` response
headers. It cold-starts at concurrency 1, raises the target by at most +1 per
`quota_ramp_interval` as ample quota is observed (aggregating conservatively over a
recent window — worst `remaining`, priciest `cost`), drops to the computed target
immediately when quota tightens, and **resets to cold-start on any breaker trip**. The
quota bucket is shared per developer key, so reacting to `remaining` implicitly yields
to other load on the same key.

## Incidents

An **incident** is the durable record of a platform-level episode. There is no separate
detector: **an incident opens exactly when the breaker trips.** Whether an incident is
worth a human is decided later, by the notifier — never by suppressing the record.

An incident is a **hysteretic envelope** around the breaker's fast flapping; it does
*not* resolve on the single success that closes the breaker:

- **Opens** on the K-th consecutive failure, with `opened_at` backdated to the *first*
  failure of the triggering run — so a run spread over days is dated from its start,
  and the notifier's active-span test sees its true extent.
- **Stays open** across any number of breaker open/close cycles. A re-trip extends the
  *same* incident and accumulates into its aggregates rather than opening a new one.
- **Resolves** only on **sustained recovery**: no failures for `recovery_quiet_window`
  *and* at least `recovery_min_successes` clean round-trips — or, as an idle-platform
  escape, the breaker simply staying closed for `recovery_hard_cap`. The hard cap keeps
  a low-traffic platform (which may never accrue the success count) from staying open
  forever, and stops a stale-open incident from absorbing a much-later, unrelated
  episode.

**Detection is inline, in the driver.** While a failure run builds (pre-trip) the
breaker holds a small buffer (≤ K) of `{failure_row_id, lineitem_id}`, cleared on any
success. On the K-th failure it **declares**: insert the incident, seed its aggregates
from the buffer (`opened_at`, `failure_count`, the set of distinct affected line items,
the categories seen, the severity), and **backfill `incident_id`** onto the buffered
failure rows so the log and the counters agree. Failures after declaration attribute
directly to the open incident.

**The driver alone closes incidents.** On startup it reconciles any open incident for
its platform: if `last_failure_at` is already older than `recovery_hard_cap` it closes
it immediately; otherwise it adopts it and resumes recovery tracking. (This also clears
the one-open-per-platform constraint, which would otherwise block a restarted process
from ever opening a new incident.) Closing lives in exactly one place on purpose — the
notifier never closes.

### The three tables

| Table | Role | Lifecycle |
| --- | --- | --- |
| `lti_platform_health` | current-state mirror, one row per platform: `status`, `last_success_at`, `last_failure_at`, `consecutive_failures`, `open_incident_id` | updated on breaker transitions; seeds a restarting process |
| `lti_platform_incidents` | one row per episode: `opened_at`, `last_failure_at`, `resolved_at`, `severity`, `trigger_category`, `categories_seen`, `failure_count`, `distinct_affected_lineitems`, `notified_at`, `resolved_notified_at` | opened on trip; aggregates flushed on transitions; closed by the driver |
| `lti_submission_failures` | append-only failure log: `category`, `http_status`, `detail`, `lineitem_id`, `incident_id` | one row per failure |

`lti_submission_failures` (which replaces the former `lti_submission_events`) is
failure-only — a recovery is now `incidents.resolved_at`, not an event row. Its
`incident_id IS NULL` rows are the **isolated** failures, those that happened while the
platform was healthy; that is exactly the population a future Tier-3 death-gate would
audit. It is the only unbounded table here and the one that will eventually need a
retention / partition policy.

Incident aggregates are kept in driver memory and flushed on transitions, so a crash
leaves the last-flushed values — acceptable for observability and consistent with the
single-process model. `distinct_affected_lineitems` is the size of an in-memory id-set
seeded from the opening buffer.

## Notification

A single global background **sweep** — not part of any per-platform driver, working
purely off the tables so it survives restarts, and never on the hot path — turns
incidents into admin alerts.

It **pages** when an incident is `high` severity, unpaged, and has an **active span**
(`last_failure_at − opened_at`) of at least `notify_persist_threshold`. Gating on
active span rather than open duration is essential: since every incident now stays open
for at least `recovery_quiet_window`, a plain duration test would page on every blip;
active span instead measures how long it was *actually* failing, so a brief burst never
pages while a sustained or flapping problem does. `rate_limit`-only incidents are `low`
severity and never page. `failure_count` and `distinct_affected_lineitems` ride along as
context in the page, not as gates — the breaker already did the platform-vs-item
filtering.

Page and all-clear are each claimed with an idempotent fenced update
(`SET notified_at = now() WHERE … AND notified_at IS NULL RETURNING …`), so concurrent
or future multi-process sweeps fire exactly once. The two-latch lifecycle —
`notified_at`, then `resolved_notified_at` — guarantees that an admin paged about an
incident gets exactly one all-clear when the driver resolves it.

Delivery is behind a pluggable `IncidentSink`: the sweep decides *when* to page and
all-clear (and owns the idempotent latches), while the sink decides *how*. The default
`LoggingIncidentSink` emits a structured log — an `error`-level page, a `warn`-level
all-clear — and an email / Slack / PagerDuty sink drops in without touching the sweep.

## Worker lifecycle

`LtiScoreSubmissionManager` runs one `LtiScoreSubmissionProcessor` (the *driver*) per
platform, each paired with a stateless `LtiScoreSubmitter` that does the per-item work.
The driver owns all platform-level state — the bounded concurrency pool, the governor,
and the circuit breaker — and reconciles a desired-vs-actual run state so `start()` /
`stop()` are clean (stop drains in-flight work before resolving). The pool collapses to
a single poller when the queue is empty (idling `idle_interval_ms`) and to a single
probe in `half_open`. Per-item work is coordinated entirely through the database (leases
+ `SKIP LOCKED` + fencing), so horizontal scale across processes stays *safe* at the
item level, even though breaker / incident state is single-process for now.

The manager applies the *same* desired-vs-actual idea one level up: a **reconcile loop**
(`platform_reconcile_interval_seconds`, default 60s) diffs the `platforms` table against
its running processors — starting a driver for a newly-registered platform and
stopping+dropping one whose platform is gone — so onboarding needs no redeploy. The loop
is the sole discovery path (registration requests may land on an instance that isn't
running the workers, so an in-process call can't reach the manager). It is self-healing:
a missed registration is picked up on the next tick, and startup reconciles everything.
Because the loop only needs eventual convergence, a periodic poll suffices;
`LISTEN/NOTIFY` would only trade up-to-one-interval latency for immediacy and, being
best-effort, would still need this reconcile as its correctness backstop — so it is left
as a possible future fast-path layered on top, not a replacement. If several instances
ever run the loop, each reconciles independently; per-item work stays safe via lease
fencing (shared breaker / governor state is the separate multi-process concern).

## Invariants

The properties the whole design preserves:

1. **Eligibility is `submittable_progress > submitted_progress`** — a comparison of
   durable columns, never a hand-maintained flag.
2. **`submittable_progress` only climbs within a scope** (monotonic `GREATEST` in
   ingestion and same-scope launch). A verified scope rebind replaces it with the
   new scope's exact cutoff-aware HWM and resets submission state.
3. **`submitted_progress` reflects what we believe Canvas has** and is written only by
   a lease-fenced worker.
4. **A result is recorded only by the worker still holding the lease** (fencing token),
   so the row can never be corrupted by a preempted worker.
5. **The producer never writes the lease columns**; the schedule and the lease stay on
   separate columns.
6. **`progress_events.submitted_at` is server-assigned**, which makes processing order
   equal time order and keeps cutoff math correct.
7. **At-least-once submission.** If a result transaction fails after Canvas accepted the
   POST, the lease expires, the item is re-claimed, and the (idempotent, timestamp-ordered)
   score is re-sent.
8. **An incident opens iff the breaker trips**, spans the breaker's flapping as a single
   envelope, and is closed only by the driver.
9. **Notifications are idempotent** — fenced latches yield at most one page and one
   all-clear per incident.
10. **Progress schedules only its matching scope.** A mismatch returns an
    observable classification without locking or rewriting the other-scope row.

## Configuration

Under `lti.score_submission` ([config.ts](../packages/core/src/config.ts)):

| Key | Default | Purpose |
| --- | --- | --- |
| `idle_interval_ms` | 5000 | poll delay when the queue is empty |
| `throttle_seconds` | 10 | minimum gap between submissions per line item |
| `request_timeout_seconds` | 60 | per-POST timeout; **must stay < `lease_duration_seconds`** |
| `lease_duration_seconds` | 120 | how long a claim hides an item from other workers |
| `backoff_base_seconds` | 5 | base of the exponential backoff (per-item and breaker) |
| `backoff_error_cap` | 5 | exponent cap on the backoff |
| `max_concurrent_submissions` | 20 | upper bound on the per-platform concurrency pool |
| `quota_reserve_requests` | 4 | quota headroom the governor keeps in reserve |
| `quota_window_ms` | 10000 | window over which the governor aggregates quota readings |
| `quota_ramp_interval_ms` | 10000 | minimum interval between +1 governor ramp-ups |

Incident / notification knobs (values are starting points to tune post-launch):

| Key | Starting point | Purpose |
| --- | --- | --- |
| `incident_trip_threshold` | 5 | consecutive non-clean failures that trip the breaker / open an incident |
| `recovery_quiet_window_seconds` | 3600 | required failure-free span before an incident may resolve |
| `recovery_min_successes` | 50 | clean round-trips required before an incident may resolve |
| `recovery_hard_cap_seconds` | 86400 | breaker-closed duration after which an incident resolves regardless |
| `notify_persist_threshold_seconds` | 1800 | active span before a high-severity incident pages |
| `notify_poll_interval_seconds` | 300 | sweep cadence (keep below the persist threshold) |
| `platform_reconcile_interval_seconds` | 60 | manager cadence for reconciling processors against the `platforms` table |

`error_interval_ms` is retired: an internal exception now counts as an ordinary failure
and uses the breaker's exponential backoff rather than a fixed pause.

## Status and open work

The **queue core** — the level-triggered partial-index queue, lease/fencing claims,
throttled scheduling, cutoff-aware high-water marks, and launch initialization — is
implemented and settled. The **driver, concurrency pool, and quota governor** are
implemented. The **incident model** described above — the `lti_platform_incidents`
table, the recovery envelope, in-memory declaration / backfill, the
`lti_submission_events → lti_submission_failures` rename, the new `lti_platform_health`
columns, and the global notification sweep (behind a pluggable `IncidentSink`, today a
structured log) — is **implemented**. Unit tests cover the quota governor and the
breaker / incident state machine.

Deferred by decision: the **Tier-3 death-gate** (retiring a chronically-failing item);
**multi-process** coordination of breaker / governor / incident state (single-process
for now — adopted only if it proves cheap, for resiliency), which also subsumes
durable cross-process enforcement of `paused_until`; **retention / partitioning** of
`lti_submission_failures`. Honouring a **downward `cutoff_at`** change within the same
scope (clawing a score back) is **decided against**: same-scope launch reconciliation
uses monotonic `GREATEST`. A verified scope rebind is different and deliberately seeds
the new scope's exact high-water mark. Smaller open items and known issues are
tracked in [SCORE-SUBMISSION-TODO](./SCORE-SUBMISSION-TODO.md); this document should be
updated as these land.

---

## Where to go next

- [LTI](./LTI.md) — verified launch scope resolution and AGS platform trust.
- [AGENT](./AGENT.md) — the scoped progress producer that feeds this queue.
- [DATA-MODEL](./DATA-MODEL.md) — scope, progress-event, and line-item schema.
