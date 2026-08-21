# Activity-code enrollment — analysis

Date: 2026-08-20
Status: proposed; awaiting review; no implementation has started
Related:

- `docs/DATA-MODEL.md` — current activity, code, enrollment, scope, and learner-signal tables
- `docs/CUMMULATIVE-PROGRESS.md` — shipped multi-activity progress behaviour
- `docs/DYNAMIC-ACTIVITIES.md` — lazy-created activities without code associations
- `docs/LTI.md` — deep-link and resource-link launch flows
- `packages/core/src/database/schema/source/enrollment.ts` — current enrollment schema
- `packages/core/src/modules/app/activities` — current enrollment and reporting behaviour

This document specifies a proposed change to how Modulus records learner
enrollment. An *activity code* is an instructor-managed grouping of activities;
under this proposal, an *enrollment* means that a learner belongs to that code,
independent of which individual activity caused the enrollment.

## Question

Should Modulus replace activity-specific learner enrollment with enrollment in
an activity code, independent of activity, so authored navigation and cumulative
progress never have to infer or propagate enrollment between activities?

The answer must keep the placeholder learners/progress view functional, keep
activity codes out of the Tier 2 ↔ Tier 3 agent contract, and remain compatible
with the project's pre-production Drizzle workflow. A production-grade reporting
model and preservation of disposable staging data are not requirements for this
change.

This document analyses the current implementation and recommends a domain model.
It does not authorise schema or application changes. Once reviewed and approved,
it should be followed by a separate, detailed implementation plan.

## Executive Recommendation

An enrollment should answer one question only:

> Which activity codes is this learner enrolled under?

The proposed graph is:

```text
activity_codes ──< activity_activity_code >── activities
      │
      ├──< activity_code_member >──────────── instructors
      │
      └──< enrollment >────────────────────── learners
```

`activity_code_member` remains instructor ownership and collaboration.
`enrollment` becomes learner membership. The two relations have different actor
semantics even though both connect `activity_codes` to `users`.

The proposed `enrollment` table has the following shape:

```ts
// proposed packages/core/src/database/schema/source/enrollment.ts
export const enrollment = pgTable(
  'enrollment',
  {
    activity_code_id: uuid('activity_code_id')
      .notNull()
      .references(() => activityCodes.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { precision: 6, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.activity_code_id, table.user_id] }),
  ]
)
```

`created_at` records when Modulus first enrolled the learner under the code. It
is immutable provenance, not lifecycle state: an idempotent conflict does not
update it, and it does not imply that an enrollment is active.

The primary key preserves idempotent insertion behaviour. A verified LTI
resource-link launch enrolls at the earliest authoritative point;
`startActivity` applies the same operation for direct launches and as recovery
after an LTI redirect. Starting a second activity under the same code does not
create or update another enrollment row.

## Current-State Findings

The current `enrollment` table records a three-way relationship:

```ts
// packages/core/src/database/schema/source/enrollment.ts
primaryKey({
  columns: [table.activity_code_id, table.activity_id, table.user_id],
})
```

The live defect is that the table also controls which progress an instructor can
see. `getActivityCodeProgress()` requires `enrollment.activity_id` to equal
`progress.activity_id`, so it silently omits progress for any associated activity
the learner reached without passing through that activity's interstitial. This
includes ordinary authored navigation, cumulative targets, and a second activity
under the same code. The progress exists, and the activity may belong to the
code, but the code report does not show it.

The row currently means that a learner started one activity in the context of
one activity code. `StartActivityService.startActivity()` is its only writer and
creates it while preparing the first-party launch interstitial:

```ts
// packages/core/src/modules/app/activities/services/start-activity.ts
await this.mutations.enrollInActivity(user.id, activityCode.id, activity.id)
```

This model makes the activity that happened to initiate a launch part of the
learner's enrollment identity. That distinction has little independent value:
progress and page state already identify the activity directly, while the
enrollment row is primarily used to establish the cohort for instructor reports.

Attempting to repair the reporting omission with more activity-level enrollments
would create an ambiguity for cumulative progress. An activity may report a
calculation of its own progress against another activity, identified by URL;
Modulus deliberately stores no formal parent/child relationship between those
pages. If a learner starts activity X under code C and later reaches related
activity Y, Modulus cannot infer the correct code when X is associated with both
C and D. Propagating both codes would turn content navigation into an implicit
mutation of the enrollment graph. [Cumulative Progress](../docs/CUMMULATIVE-PROGRESS.md)
explains why activity codes are otherwise orthogonal to page-to-page reporting.

The current enrollment tuple has a second integrity defect. Neither
`StartActivityService` nor the LTI launch service verifies that the resolved
activity belongs to the resolved code. An enrollment can therefore name an
activity outside the code, and the current report can display that activity
because it joins through `enrollment.activity_id` rather than
`activity_activity_code`.

## Enrollment Lifecycle

Enrollment remains lazy, but it has two idempotent triggers that share one core
operation:

1. **Verified LTI resource-link launch.** After signature validation and learner
   resolution, `LtiLaunchService.handleActivityLaunch()` has the trusted learner,
   resolved activity, and public activity-code string from the signed launch. It
   resolves the canonical activity-code record and attempts enrollment before
   returning the redirect response, regardless of whether the launch has an AGS
   line-item endpoint.
2. **`startActivity`.** The existing service attempts the same enrollment for
   direct, non-LTI launches and as recovery after an LTI redirect. Repeating the
   write after the LTI handler is harmless because the code/learner primary key
   makes it idempotent.

Both triggers resolve the canonical code and activity and insert
`(activity_code_id, user_id)` only when the activity is still associated with the
code. The LTI enrollment write is unconditional with respect to AGS and occurs
outside the transaction used to prepare progress and reconcile a line item. An
AGS failure must not roll back enrollment, and AGS and non-AGS launches must have
the same enrollment semantics.

The launch handler does not resolve the activity-code string today. Supporting
this trigger requires wiring the activity module's enrollment mutation (or the
shared enrollment service that owns it) into `LtiLaunchService`, in addition to
the activity queries it already receives, and calling
`findActivityCodeByPublicCode()` before the association check.

If that public code does not resolve, the LTI handler logs the condition, skips
enrollment, and continues returning the existing launch response. It must not
convert an unknown code into `ERR_INVALID_LAUNCH`; the later `startActivity`
request retains its current `ERR_ACTIVITY_CODE_NOT_FOUND` behaviour. This keeps
the LTI boundary backward-compatible without inventing an activity-code id for
enrollment.

This means an accepted LTI launch may enroll a learner even if the subsequent
redirect or interstitial render fails. That is deliberate: enrollment records
membership in the code's cohort, not proof that the learner viewed or completed
the activity. Progress and `progress_events` remain the evidence of
participation. Enrolling during the verified launch also prevents the current
state in which Modulus has created progress and line-item records for a learner
who remains absent from the code report.

Conceptually, the repository contract changes from:

```ts
enrollInActivity(user_id, activity_code_id, activity_id)
```

to:

```ts
enrollInActivityCode(user_id, activity_code_id)
```

No enrollment is created by cumulative-progress writes, multi-activity reads,
agent OAuth, or navigation between authored pages. Those paths do not carry
enough trusted information to choose a learner's institutional grouping, and
they no longer need to do so.

Enrollment remains independent of academic scope. A scope is the opaque,
platform-qualified bucket that partitions progress, page state, and Assignment
and Grade Services (AGS) passback. Code-level enrollment continues to represent
a broad cohort across those buckets; this proposal does not add `scope_id` to
`enrollment`.

## How the Model Resolves Multi-Code Navigation

The model does not derive enrollment from page relationships. Instead, it
combines two explicit facts when a code-scoped report needs them:

1. the learner is enrolled under a code; and
2. an activity is associated with that code.

Suppose learner A is enrolled under C and D, activity X belongs to C and D, and
related activity Y belongs only to C. Learner A's progress in Y is reportable
under C because both facts exist there. It is not reportable under D because Y
does not belong to D. Navigation from X to Y changes neither fact.

The same rule covers every combination without choosing a code during
navigation:

| Learner Enrollment | Activity Association | Included In Code Report? |
| --- | --- | --- |
| C | C | Yes, under C |
| C and D | C | Yes, under C only |
| C and D | C and D | Yes, under both |
| C | none | No |
| none | C | No |

Lazy-created cumulative targets initially have no activity-code association, as
described in [Dynamic Activities](../docs/DYNAMIC-ACTIVITIES.md). Their progress is
therefore not included in any code-scoped instructor report until an instructor
explicitly associates the activity with a code. Enrollment itself does not need
to change when that association is added or removed.

## Reporting Semantics

The current report starts from one `enrollment` row per learner/activity/code and
left-joins aggregated progress. After this change, a per-activity report must
derive its rows from the intersection of code enrollment and code activity
membership:

```text
enrollment
  JOIN activity_activity_code USING (activity_code_id)
  JOIN activities
  JOIN users
  LEFT JOIN progress for this code's learners and activities,
            aggregated by (user_id, activity_id)
```

For a selected code, this can produce one row for every enrolled learner ×
associated activity pair. A null progress value means no progress has been
recorded for that learner and activity across any scope. Adding or removing an
activity changes the temporary report surface without changing enrollment or
stored progress.

The learners/progress view is currently a placeholder for a future reporting and
analytics design. This feature does not establish its long-term row model,
search semantics, pagination contract, performance target, or null-progress
presentation. The implementation requirement is only to adapt
`getActivityProgress` and its backing query to the two-column enrollment schema
so the existing view compiles, runs, and returns a valid response.

The simplest compatible query may retain the current per-activity shape by
joining code enrollment to `activity_activity_code` and then to aggregated
progress. It must not reintroduce activity-specific enrollment or display an
activity outside the selected code, but query optimisation, complete search,
large-cohort analysis, and UI refinement are deferred to the reporting work.

## Enrollment Eligibility And Stale Links

Dropping `activity_id` from the stored enrollment does not make the activity URL
irrelevant to the launch. `startActivity` still needs the activity record to
build the activity-bound response used by the agent.

The current service verifies that the learner, public code, activity, and scope
each exist, but it does not verify that the activity is associated with the
code. Both the start-activity service and the Learning Tools Interoperability
(LTI) launch service contain TODOs for that missing check.

The code/activity association determines whether either trigger creates the
code-level enrollment. Otherwise, possession of a public code plus any globally
known activity URL would be sufficient to add the learner to that code's
complete reporting cohort. The check must use the canonical activity and code
records resolved by core, not trust a client-supplied relationship.

An absent association does not invalidate the LMS link. If an instructor removes
the activity from the code after creating the link, the LTI handler honours the
link and skips enrollment; the later `startActivity` recovery attempt does the
same. The learner can therefore reach the activity without being added to that
code's reporting cohort.

Skipping enrollment must be observable. For a missing association, each trigger
emits a warn-level structured log containing the activity-code id and activity
id. For an unresolvable LTI code, the warning contains the public code string and
activity id because no code id exists. Neither form includes learner personally
identifiable information (PII). The first implementation need not add an
instructor-facing warning. A follow-up should let an instructor identify that an
LMS link refers to a missing code or an activity removed from its code and
therefore does not enroll learners; until then, the structured warning is the
operational signal.

One alternative remains flagged for further consideration: the shared
enrollment operation could restore the activity/code association and then enroll
the learner. That would make the durable LMS link authoritative over the
instructor's later code edit, so it is not the adopted behaviour without a
separate decision.

## Database Change Scope

Modulus is not in production. The only deployed database is staging data used
for deployment and acceptance testing, and its activities, progress, and
enrollments may be deleted or rewritten without preserving real learner work.

This feature therefore requires only the Drizzle schema change from the
three-column to the two-column enrollment relation, plus the ordinary local
development migration generated from that schema. It does not require an
in-repository deduplication strategy, reversible data migration, pre-migration
export, or production rollout procedure.

Staging migrations are prepared manually from the Drizzle-generated change and
may include destructive or corrective statements appropriate to the staging
database's disposable data. Designing or applying that staging migration is out
of scope for this analysis and the subsequent implementation plan.

## Implementation Consequences

A future implementation plan should organise these consequences into reviewable
tasks and verification steps:

- change the Drizzle `enrollment` schema to the
  `(activity_code_id, user_id)` primary key, add immutable `created_at`, and
  remove `activity_id`; staging migration preparation is out of scope;
- rename the repository mutation to `enrollInActivityCode` and remove its
  `activity_id` argument;
- extract one idempotent enrollment operation and call it from both the verified
  LTI resource-link handler and `StartActivityService`;
- extend the LTI service composition beyond its current activity-query-only
  dependency so the handler can resolve the public code and invoke the shared
  enrollment mutation/service;
- ensure the LTI trigger runs for launches with and without an AGS endpoint and
  performs its enrollment write outside the conditional AGS transaction;
- preserve the existing LTI response when the public code does not resolve,
  while logging and skipping enrollment;
- add an authoritative code/activity association query, use it to decide
  enrollment eligibility, and continue the launch without enrollment when the
  association is absent, with a PII-free warn-level log;
- make the minimum query and test changes required for
  `getActivityProgress` and the learners/progress view to compile and run against
  code-level enrollment; long-term reporting semantics and optimisation are out
  of scope;
- update enrollment seeds and add enough `activity_activity_code` seed data for
  the placeholder report to return a useful non-empty result in development;
- revise all three affected parts of `DATA-MODEL.md` (the activity graph, the
  `enrollment` definition, and the reporting paragraph), plus `LTI.md`,
  `AGENT.md`, and relevant source comments.

No agent API, access-token claim, cumulative-progress payload, or page-state
contract needs to change.

## Alternatives Considered

### Propagate the Source Activity's Codes

When activity X reports to or navigates to activity Y, Modulus could copy X's
activity-code associations into new enrollment rows for Y. This makes authored
content traffic mutate an institutional reporting graph and enrolls Y under both
C and D when X belongs to both, even if Y was intended for only one. It also
cannot handle a lazy-created target with no code association without inventing
one.

### Carry a Code Through Agent Navigation

The launch could place one activity code in agent context and preserve it across
navigation. This forces a single choice when the launch activity belongs to more
than one code, couples the Tier 2 ↔ Tier 3 agent surface to instructor grouping,
and risks exposing institutional context to authored activities. The current
opaque scope and activity-bound token are sufficient; code identity should stay
inside Modulus.

### Enroll In Every Code Shared By Source And Target

Modulus could intersect the codes associated with X and Y and create
activity-level enrollment rows for each result. The result depends on mutable
activity associations at navigation time, silently changes when instructors edit
codes, and still treats navigation as enrollment. It preserves the complexity
without preserving a useful domain fact.

### Retain Activity-Level Enrollment As Visit History

The current table could remain as a record of which activities a learner has
started. Its rows are created before the learner reaches the activity and carry
no timestamp, scope, or completion state, so they are a weak visit history.
`progress` and `progress_events` are better sources for activity participation;
if product requirements need an explicit launch audit later, that should be a
separate event with its own time and context rather than an overloaded
enrollment relation.

## Trade-Offs

The proposal gains a stable domain meaning for enrollment, removes enrollment
mutation from page-to-page navigation, resolves the multi-code ambiguity through
existing explicit relations, and makes a code-level learner roster directly
queryable.

It also broadens the data available to reporting. Once a learner enters a code,
reports may associate that learner with activities the learner never launched.
How a future reporting surface distinguishes configuration membership from
participation is intentionally deferred.

Code reuse also becomes more visible. Because enrollment remains unscoped and
has no active/inactive lifecycle state, a learner enrolled under a reused code
remains in that code's cohort indefinitely. `created_at` records when the
membership was first observed but does not change that rule. This is consistent
with the current broad, scope-agnostic model, but the proposed schema makes code
reuse across courses or semesters more consequential. If enrollments need term,
active/inactive, or roster-source semantics, those requirements should be
designed explicitly rather than inferred from `activity_id`.

## Acceptance Criteria

The change is complete when all of the following are true:

- `enrollment` has the primary key `(activity_code_id, user_id)` and no
  `activity_id` column;
- each enrollment has an immutable `created_at` set on first insertion;
- starting any valid activity under a code creates at most one enrollment for
  that learner and code;
- revisiting the same activity or starting another activity under the code is
  idempotent;
- navigating or reporting progress between related activities creates no
  enrollment rows;
- `getActivityProgress` compiles and returns a valid response using the
  two-column enrollment relation;
- no activity outside the selected code can appear in that code's placeholder
  report;
- the verified LTI resource-link handler attempts enrollment before redirect,
  including when the launch has no AGS endpoint;
- LTI enrollment occurs outside the AGS progress/line-item transaction, so an
  AGS failure does not roll it back;
- an unresolvable public code does not make the LTI launch invalid; the handler
  warns, skips enrollment, and preserves the existing launch response;
- `startActivity` applies the same idempotent operation for direct launches and
  recovery;
- a start-activity request for an activity not associated with its code honours
  the link but does not enroll the learner;
- skipped enrollment emits a PII-free warn-level diagnostic containing the
  available code identifier and activity id;
- the learners/progress view renders without error using seeded development
  data;
- no staging or production data-migration procedure is included in the
  implementation scope.

## Resolved Decisions

- **Enrollment triggers.** A verified LTI resource-link launch enrolls at the
  earliest authoritative point. `startActivity` performs the same idempotent
  operation for direct launches and recovery.
- **Enrollment provenance.** `created_at` records the first successful
  code-level enrollment and is not updated by repeated launches.
- **Old LMS links.** When an activity is no longer associated with the code in
  its link, Modulus honours the link and skips enrollment.
- **Unknown LTI code.** An unresolvable public code does not invalidate the LTI
  launch response; the handler warns and skips enrollment, while the later
  `startActivity` request keeps its current not-found behaviour.
- **Scope independence.** Enrollment in an activity code is intentionally
  independent of academic scope.
- **Interim report shape.** The existing per-activity learners/progress view is
  kept functional with the minimum compatible query change. Its long-term
  semantics and implementation belong to future reporting and analytics work.

## Open Questions

- **Enrollment lifecycle.** There is no unenrollment, active flag, or LMS roster
  synchronisation. `created_at` supplies provenance but not lifecycle state;
  code-level enrollment may make a separate lifecycle feature more important.
- **Restoring removed associations.** The adopted behaviour honours an old LMS
  link and skips enrollment when its activity/code association is absent.
  Re-adding the activity to the code and then enrolling the learner remains an
  alternative for further consideration.
- **Terminology.** `activity_code_member` means instructor access while
  `enrollment` means learner membership. A future rename such as
  `activity_code_instructor` could remove that asymmetry, but it is outside this
  feature unless review brings it into scope.

## Implementation-Planning Handoff

Do not begin implementation from this analysis alone. After review resolves the
open questions and approves the recommendation, create a separate
`specs/2026-08-20-activity-code-enrollment-implementation-plan.md` that maps the
agreed contracts to ordered schema, repository, service, reporting, test, seed,
and shipped-documentation tasks with explicit verification after each task.
