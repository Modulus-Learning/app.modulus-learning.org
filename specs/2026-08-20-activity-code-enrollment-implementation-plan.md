# Activity-code enrollment — implementation plan

Date: 2026-08-20
Status: implemented on `feat/activity-code-enrollment`; Tasks 1-6 complete and reviewed
Related:

- `specs/2026-08-20-activity-code-enrollment-analysis.md` — approved analysis and
  the source of every invariant below
- `docs/DATA-MODEL.md` — activity graph, `enrollment` definition, and the
  reporting paragraph that this change revises
- `docs/LTI.md` — Flow 2 resource-link launch, which gains an enrollment step
- `docs/AGENT.md` — the honest note describing the enrollment cohort
- `docs/CUMMULATIVE-PROGRESS.md`, `docs/DYNAMIC-ACTIVITIES.md` — why navigation
  and lazy activity creation must not write enrollment
- `packages/core/src/database/schema/source/enrollment.ts`
- `packages/core/src/modules/app/activities/repository/index.ts`
- `packages/core/src/modules/app/activities/services/start-activity.ts`
- `packages/core/src/modules/app/lti/services/launch.ts`

This plan maps the approved analysis to ordered schema, repository, service,
reporting, test, seed, and documentation tasks with explicit verification after
each one. It does not authorise work beyond those tasks.

## Outcome

Replace activity-specific enrollment with enrollment in an activity code,
written by one idempotent operation that both the verified LTI resource-link
launch and `startActivity` call. The relation remains the learner-reporting
cohort, but current policy also enrolls instructors who perform a resource-link
launch; changing that role policy is not part of this feature.

The work is complete when:

1. `enrollment` is the two-column relation `(activity_code_id, user_id)` with an
   immutable `created_at` and no `activity_id`;
2. one shared, idempotent enrollment operation exists and is the only writer;
3. a verified LTI resource-link launch attempts enrollment before returning its
   redirect response, for launches with and without an AGS endpoint, outside the
   AGS progress/line-item transaction;
4. `startActivity` applies the same operation for direct launches and as
   recovery after an LTI redirect;
5. enrollment happens only when core's own records show the activity is
   associated with the code, and a missing association honours the launch while
   skipping enrollment with a privacy-safe warning;
6. an unresolvable public activity code leaves the LTI launch response unchanged
   and leaves `startActivity`'s `ERR_ACTIVITY_CODE_NOT_FOUND` behaviour intact;
7. `getActivityCodeProgress` derives its rows from code enrollment intersected
   with `activity_activity_code`, and can never show an activity outside the
   selected code;
8. development seeds produce a non-empty learners/progress view under the new
   model; and
9. `DATA-MODEL.md`, `LTI.md`, `AGENT.md`, `ARCHITECTURE.md`, and the affected
   source comments describe code-level enrollment rather than the three-way
   relation.

## Non-Negotiable Contracts

Every task must preserve these contracts, taken from the approved analysis:

- An enrollment answers exactly one question: which activity codes a learner is
  enrolled under. It carries no activity, no scope, no lifecycle flag, and no
  roster source.
- `created_at` is immutable provenance. An idempotent conflict must not update
  it, and it does not mean an enrollment is active.
- The primary key `(activity_code_id, user_id)` is what makes repeated launches
  idempotent. Do not add a surrogate key or a unique index that would permit a
  second row for the same pair.
- Enrollment eligibility is decided from the canonical activity and activity-code
  records resolved by core, never from a client-supplied relationship.
- A missing activity/code association honours the LMS link and skips enrollment.
  It must not restore the association, invent one, or fail the launch.
- An unresolvable public activity code must not become `ERR_INVALID_LAUNCH`.
  `startActivity` keeps `ERR_ACTIVITY_CODE_NOT_FOUND` for its own request path.
- The LTI enrollment write runs outside the conditional AGS transaction, and runs
  whether or not the launch carries a line-item endpoint. An AGS failure must not
  roll back enrollment.
- No enrollment is created by cumulative-progress writes, multi-activity reads,
  agent OAuth, activity auto-creation, or navigation between authored pages.
- Skipped enrollment is observable: a warn-level structured log carrying the
  available code identifier (`activity_code_id`, or the public `activity_code`
  string when no id exists) and `activity_id`. It must contain no learner PII —
  no name, email, LTI `sub`, institutional id, or raw Canvas term identity. The
  opaque `users.id` already present in the ambient log context is acceptable;
  do not add learner fields to the payload.
- The Tier 2 ↔ Tier 3 agent contract does not change: no agent API, access-token
  claim, cumulative-progress payload, or page-state shape is touched, and
  activity codes stay inside Modulus.
- Instructor reports remain scope-agnostic. Progress is aggregated across scopes
  before it is joined to the enrollment cohort, and no `scope_id` is exposed.
- Current policy treats instructors who perform a verified resource-link launch
  as participants in the same code cohort. Do not add an instructor-role guard:
  both instructor and learner resource-link launches use the enrollment trigger.
  Changing that policy requires stakeholder review and is out of scope.
- The interim report must not reintroduce activity-specific enrollment and must
  not display an activity outside the selected code.
- No staging or production data-migration procedure, deduplication strategy,
  pre-migration export, or rollout runbook belongs in this repository.

## Decisions This Plan Makes

The analysis leaves these to the plan; they are settled here and should be
confirmed at review before Task 2 begins.

1. **The shared operation is a service, not a bare mutation.** It lives at
   `packages/core/src/modules/app/activities/services/enrollment.ts` as
   `EnrollmentService` and is registered in the activities registry as
   `enrollmentService`. Both callers need the same three steps — resolve, check
   association, insert — plus identical diagnostics, and only the LTI caller
   starts from a public code string. A repository mutation cannot own the
   association check and the warn-level logging without duplicating them.
2. **Two entry points share one private core.** `enrollByActivityCodeId` for
   `startActivity`, which has already resolved the canonical code record and
   owns the not-found error; `enrollByPublicActivityCode` for the LTI handler,
   which must tolerate an unresolvable code.
3. **The operation returns a discriminated outcome** so tests assert behaviour
   directly rather than scraping logs. Callers ignore the value today.
4. **Unexpected database failures propagate.** Only the two defined eligibility
   conditions — unknown code, missing association — skip quietly with a warning.
   A failed insert is a real fault and is surfaced like every other launch write
   (nonce claim, deployment upsert, sign-in). Reviewers who prefer a swallowed
   enrollment failure on the LTI path should say so at Task 2, because
   `startActivity` recovery would re-attempt the write.
5. **Placement in `handleActivityLaunch` is immediately after `signInLti` and
   before the `if (lineitem_url != null)` block.** That is the earliest point
   with a trusted learner id, and it satisfies "before redirect", "with and
   without AGS", and "outside the AGS transaction" at once.
6. **Activity/code associations are seeded from `10_activities.ts`,** which
   receives the activity-code ids that `index.ts` already holds. Adding a new
   numbered seed file between `10` and `11` would renumber the chain documented
   in `DATA-MODEL.md` for no behavioural gain.
7. **The report query keeps aggregate-before-join** by filtering the progress
   aggregate with two `EXISTS` predicates — one for code enrollment, one for
   `activity_activity_code` — instead of joining enrollment into the aggregate.

## Execution Rules

- Work on the existing `feat/activity-code-enrollment` branch and open one pull
  request against `develop` at Task 6. Do not merge as part of this plan.
- Complete tasks in order. After each task is committed, stop for independent
  review before starting the next.
- One focused conventional commit per task, lowercase and past tense, with no
  trailers. Corrective commits for review findings belong to the task whose
  acceptance they repair, not to a new task.
- Behaviour tests ship in the same commit as the production change they cover.
- `pnpm lint` rewrites files; use `pnpm lint:check` as the gate and let the
  pre-commit hook format staged files.
- Task 1 is the only task that may leave the repository temporarily without the
  new enrollment behaviour; it must still leave the tree compiling, linted, and
  green on both test runners.

## Local Database Note

The generated migration adds a primary key over `(activity_code_id, user_id)`.
A development database seeded under the old model can hold several rows per
pair, and the migration will fail on them. Before running `drizzle:migrate`
locally, clear the table (`delete from enrollment;`) or re-run the seeds after
migrating. The integration harness applies committed migrations to a freshly
truncated `_test` database, so CI is unaffected. Preparing the staging migration
is out of scope, as the analysis states.

## Dependency Map

| Phase | Task | Depends on | Primary boundary |
| --- | --- | --- | --- |
| 1 | 1. Reshape the enrollment relation | approved analysis | schema, migration, repository, reporting |
| 2 | 2. Add the shared operation and route `startActivity` through it | Task 1 | core service, DI registry, first-party launch |
| 2 | 3. Enroll on verified LTI launch | Task 2 | LTI resource-link handler |
| 3 | 4. Seed associations and code enrollment | Task 1 | development data |
| 3 | 5. Update shipped documentation | Tasks 1–4 | docs and source comments |
| 3 | 6. Full verification and pull request | Tasks 1–5 | acceptance |

## Phase 1 — Data Model And Reporting

### Task 1 — Reshape The Enrollment Relation

Proposed commit: `feat: replaced activity level enrollment with activity code enrollment`

The schema change breaks four call sites at once — the repository mutation, the
report query, the seeds, and the tests — so they move together in one atomic
commit. Behavioural work (the shared operation, eligibility, the LTI trigger)
does not belong here.

Files:

- revise `packages/core/src/database/schema/source/enrollment.ts`;
- revise `packages/core/src/database/schema/source/activities.ts`;
- add the generated migration under
  `packages/core/src/database/migrations/` and its `meta/` journal entry;
- revise `packages/core/src/modules/app/activities/repository/index.ts`;
- revise `packages/core/src/modules/app/activities/repository/index.itest.ts`;
- revise `packages/core/src/modules/app/activities/services/start-activity.ts`
  (call-site only);
- revise `packages/core/src/modules/app/activities/services/start-activity.test.ts`
  (fake only); and
- revise `packages/core/src/database/seeds/11_enrollment.ts` (compile only —
  seed data is Task 4).

#### Schema

- drop `activity_id` and its foreign key;
- add `created_at: timestamp('created_at', { precision: 6, withTimezone: true }).notNull().defaultNow()`,
  matching `activity_code_member` exactly;
- set `primaryKey({ columns: [table.activity_code_id, table.user_id] })`;
- keep `onDelete: 'cascade'` on both remaining foreign keys;
- remove the `activity` relation from `enrollmentRelations`, keeping
  `activityCode` and `user`; and
- remove `enrollment: many(enrollment)` from `activitiesRelations` and its now
  unused import. `activityCodesRelations` keeps its `enrollment: many(...)`.

Generate the migration with `pnpm -F @modulus-learning/core drizzle:generate`
(it compiles to `dist/` first, as the drizzle config reads the built schema).
Commit exactly what the generator produces; do not hand-edit it.

#### Repository

- rename `enrollInActivity(user_id, activity_code_id, activity_id)` to
  `enrollInActivityCode(user_id, activity_code_id)`, keeping
  `.onConflictDoNothing()` so a repeat launch neither inserts nor updates
  `created_at`;
- add an authoritative association query on `ActivityQueries`:

  ```ts
  @method
  async isActivityInActivityCode(
    activity_code_id: string,
    activity_id: string
  ): Promise<boolean> {
    const rows = await this.db
      .get()
      .select({ marker: sql`1` })
      .from(activityActivityCode)
      .where(
        and(
          eq(activityActivityCode.activity_code_id, activity_code_id),
          eq(activityActivityCode.activity_id, activity_id)
        )
      )
      .limit(1)
      .catch(this.utils.wrapDbErrorNew())

    return rows.length > 0
  }
  ```

- rewrite `getActivityCodeProgress` so its rows come from the intersection of
  code enrollment and code activity membership. The aggregate keeps its current
  shape and is still computed before any enrollment join; only its predicate
  changes from a three-column enrollment match to two independent `EXISTS`
  checks:

  ```ts
  const enrolledInActivityCode = this.db
    .get()
    .select({ marker: sql`1` })
    .from(enrollment)
    .where(
      and(
        eq(enrollment.activity_code_id, activity_code_id),
        eq(enrollment.user_id, progress.user_id)
      )
    )

  const activityInActivityCode = this.db
    .get()
    .select({ marker: sql`1` })
    .from(activityActivityCode)
    .where(
      and(
        eq(activityActivityCode.activity_code_id, activity_code_id),
        eq(activityActivityCode.activity_id, progress.activity_id)
      )
    )

  const progressByEnrollment = this.db
    .get()
    .select({ /* unchanged projection */ })
    .from(progress)
    .where(and(exists(enrolledInActivityCode), exists(activityInActivityCode)))
    .groupBy(progress.user_id, progress.activity_id)
    .as('progress_by_enrollment')
  ```

  and the outer query becomes:

  ```text
  enrollment (activity_code_id = :id)
    INNER JOIN users                  ON users.id = enrollment.user_id
    INNER JOIN activity_activity_code ON aac.activity_code_id = enrollment.activity_code_id
    INNER JOIN activities             ON activities.id = aac.activity_id
    INNER JOIN activity_codes         ON activity_codes.id = enrollment.activity_code_id
    LEFT  JOIN progress_by_enrollment ON (user_id, activity_id)
  ```

- keep the selected columns, the `count(*) over()` total, the nulls-last primary
  order, and the `asc(activities.id), asc(users.id)` tie-breakers exactly as they
  are, so `ActivityService.getProgress`, `progressItemSchema`, and the
  learners/progress view need no change;
- leave `options.query` unimplemented, as it is today.

#### Call Sites

- in `start-activity.ts`, change the call to
  `await this.mutations.enrollInActivityCode(user.id, activityCode.id)` and keep
  the existing association TODO comment in place; eligibility arrives in Task 2;
- in `11_enrollment.ts`, remove `activity_id` from the initial and bulk rows and
  drop the now-unused `activityIds` parameter usage minimally, leaving the seed
  callable from `index.ts`. Real seed data is Task 4.

#### Tests

Rewrite `repository/index.itest.ts` around the new model. Its `seedEnrollment`
helper becomes a helper that inserts a user, an activity, an
`activity_activity_code` row, and an `enrollment` row, with switches for the
exclusion cases. Cover:

- one row per enrolled learner × associated activity, with progress aggregated
  across scopes before the join (adapt the existing first test, which already
  asserts maximum progress, earliest creation, and latest update);
- a learner enrolled in the code with no progress for an associated activity
  yields a row whose `progress`, `created_at`, and `updated_at` are null;
- an activity associated with a *different* code never appears in the selected
  code's rows, even when the learner has progress for it;
- progress for a learner who is not enrolled in the selected code never appears;
- an associated activity with no enrolled learners produces no rows;
- nulls-last ordering in both directions for `full_name`, `progress`, and
  `updated_at` (existing test, adapted);
- stable ascending `(activity, user)` keys across adjacent pages when aggregates
  tie, with `total` consistent on every page (existing test, adapted).
- database-level idempotency: call `enrollInActivityCode` twice for the same
  learner/code pair, with the second attempt occurring after the first
  `created_at` can be observed; assert that exactly one row exists and that its
  original `created_at` is byte-for-byte unchanged;
- a second insertion attempt caused by another activity associated with the same
  code has the same one-row, unchanged-`created_at` result.

In `start-activity.test.ts`, replace the `enrollInActivity` fake with
`enrollInActivityCode` and assert the recorded call is
`[userId, activityCodeId]`. Keep the unknown-scope test asserting no enrollment.

Acceptance criteria:

- `enrollment` has the primary key `(activity_code_id, user_id)`, a not-null
  `created_at` defaulting to now, and no `activity_id` column;
- the committed migration is the unmodified generator output and applies cleanly
  to an empty database;
- `enrollInActivityCode` is the only enrollment writer and remains
  conflict-tolerant;
- `isActivityInActivityCode` answers from `activity_activity_code` alone;
- the report returns rows for enrolled learners × associated activities only,
  and no activity outside the selected code can appear;
- `ActivityService.getProgress` and `progressItemSchema` are unchanged;
- integration tests pass against a migrated `modulus_test` database.

Verification:

```sh
pnpm -F @modulus-learning/core drizzle:generate
pnpm -F @modulus-learning/core drizzle:migrate
pnpm -F @modulus-learning/core typecheck
pnpm -F @modulus-learning/core test
pnpm -F @modulus-learning/core test:integration
pnpm typecheck
pnpm lint:check
git diff --check
```

## Phase 2 — The Shared Enrollment Operation And Its Triggers

### Task 2 — Add The Shared Enrollment Operation And Route `startActivity`

Proposed commit: `feat: added shared activity code enrollment service`

Files:

- add `packages/core/src/modules/app/activities/services/enrollment.ts`;
- add `packages/core/src/modules/app/activities/services/enrollment.test.ts`; and
- revise `packages/core/src/modules/app/index.ts`;
- revise `packages/core/src/modules/app/activities/services/start-activity.ts`;
- revise `packages/core/src/modules/app/activities/services/start-activity.test.ts`.

Work:

- define the service and its outcome type:

  ```ts
  export type EnrollmentOutcome =
    | { status: 'enrolled'; activity_code_id: string }
    | {
        status: 'skipped'
        reason: 'unknown_activity_code' | 'activity_not_in_activity_code'
      }

  export class EnrollmentService extends BaseService {
    constructor(deps: {
      logger: CoreLogger
      queries: ActivityQueries
      mutations: ActivityMutations
    })

    @method
    async enrollByActivityCodeId(params: {
      user_id: string
      activity_code_id: string
      activity_id: string
    }): Promise<EnrollmentOutcome>

    @method
    async enrollByPublicActivityCode(params: {
      user_id: string
      activity_code: string
      activity_id: string
    }): Promise<EnrollmentOutcome>
  }
  ```

- `enrollByActivityCodeId` checks `isActivityInActivityCode` and, on success,
  calls `enrollInActivityCode`; on failure it warns and returns the skip
  outcome without writing;
- `enrollByPublicActivityCode` resolves the code with
  `findActivityCodeByPublicCode`, warns and returns
  `unknown_activity_code` when it does not resolve, and otherwise delegates to
  the id-based method so both triggers share one association check and one
  insert;
- log exactly two warn-level messages, both PII-free:
  - `this.logger.warn({ activity_code_id, activity_id }, 'enrollment skipped: activity not associated with activity code')`
  - `this.logger.warn({ activity_code, activity_id }, 'enrollment skipped: activity code not found')`
- do not catch database errors; `wrapDbErrorNew` in the repository already
  classifies them and they propagate to the caller;
- register the service in `createActivityRegistry` after `mutations` and before
  `startService`, so both `StartActivityService` and the LTI registry can
  resolve it:

  ```ts
  new Registry()
    .addClass('queries', ActivityQueries)
    .addClass('mutations', ActivityMutations)
    .addClass('enrollmentService', EnrollmentService)
    .addClass('service', ActivityService)
    .addClass('startService', StartActivityService)
    .addClass('commands', ActivityCommands)
  ```

  The parent registry already composes `activities` before `lti`, so no
  reordering of `createAppRegistry` is needed.

- in the same commit, replace `StartActivityService`'s
  `mutations: ActivityMutations` dependency with
  `enrollmentService: EnrollmentService`; the service keeps `queries` for the
  learner, code, activity, and scope lookups;
- keep the existing resolution order and error semantics unchanged —
  `ERR_LEARNER_NOT_FOUND`, `ERR_ACTIVITY_CODE_NOT_FOUND`,
  `ERR_ACTIVITY_NOT_FOUND`, and `ERR_ACTIVITY_SCOPE_NOT_FOUND`;
- after the scope check, call
  `enrollByActivityCodeId({ user_id: user.id, activity_code_id: activityCode.id, activity_id: activity.id })`
  and ignore the outcome;
- treat `activity_id` as eligibility context passed to the shared service, not
  as stored enrollment identity; the service passes only `(user_id,
  activity_code_id)` to `enrollInActivityCode`;
- delete the association TODO comment; and
- return the unchanged `StartActivityResponse` when enrollment is skipped.

Tests (`enrollment.test.ts`, `node:test` with fake queries/mutations and a
capturing logger):

- an associated activity enrolls once and returns `enrolled`;
- a repeated call performs a second conflict-tolerant insert and still returns
  `enrolled`, with no attempt to update `created_at`;
- a missing association returns `activity_not_in_activity_code`, performs no
  insert, and emits one warn containing `activity_code_id` and `activity_id`;
- an unresolvable public code returns `unknown_activity_code`, performs no
  association lookup and no insert, and emits one warn containing the public
  `activity_code` string and `activity_id`;
- a resolvable public code with an associated activity enrolls using the
  canonical code id, not the supplied string;
- neither warn payload contains a learner name, email, LTI subject, or any
  Canvas term value — assert over the serialized payload;
- a repository error from the association check or the insert propagates rather
  than being converted into a skip outcome.

`start-activity.test.ts` additionally covers:

- the canonical-scope path passes learner, canonical code, and canonical
  activity ids to `EnrollmentService`;
- the shared service's mutation fake records only `[userId, activityCodeId]`,
  proving that `activity_id` is not stored identity;
- an unassociated outcome from the enrollment-service fake still returns the
  complete response; the service unit test separately proves that this outcome
  performs no mutation and emits exactly one warning;
- an unknown public code still rejects with `ERR_ACTIVITY_CODE_NOT_FOUND` and
  never reaches the enrollment operation; and
- an unknown scope still rejects without enrolling.

The repository integration coverage added in Task 1, rather than a fake, proves
that repeated insertion attempts and a second associated activity leave exactly
one row and do not change its original `created_at`.

Acceptance criteria:

- one code path performs the association check and the insert for both triggers;
- the service is the only place that decides enrollment eligibility;
- `StartActivityService` no longer holds `ActivityMutations` and does not bypass
  the shared eligibility operation;
- skip outcomes are observable both by return value and by a single warn log;
- the DI registry compiles with the new service and no other module gains a
  dependency on `ActivityMutations`.

Verification:

```sh
pnpm -F @modulus-learning/core typecheck
pnpm -F @modulus-learning/core test:one \
  src/modules/app/activities/services/enrollment.test.ts
pnpm -F @modulus-learning/core test:one \
  src/modules/app/activities/services/start-activity.test.ts
pnpm -F @modulus-learning/core test:integration:one \
  src/modules/app/activities/repository/index.itest.ts
pnpm -F @modulus-learning/core test
pnpm -F @modulus-learning/core test:integration
pnpm typecheck
pnpm lint:check
```

### Task 3 — Enroll On A Verified LTI Resource-Link Launch

Proposed commit: `feat(lti): enrolled learners on verified resource link launch`

Files:

- revise `packages/core/src/modules/app/lti/services/launch.ts`; and
- revise `packages/core/src/modules/app/lti/services/launch.test.ts`.

Work:

- extend the constructor dependency from
  `activities: { queries: ActivityQueries }` to
  `activities: { queries: ActivityQueries; enrollmentService: EnrollmentService }`
  and store it; no change to `createLtiRegistry` is required because the
  activities registry already provides the service to the composed context;
- in `handleActivityLaunch`, immediately after `signInLti` returns and before the
  `if (lineitem_url != null)` block, call:

  ```ts
  await this.enrollmentService.enrollByPublicActivityCode({
    user_id: signIn.user.id,
    activity_code,
    activity_id: activity.id,
  })
  ```

- keep the call outside `this.tx.withTransaction`, so an AGS reconciliation
  failure cannot roll enrollment back, and keep it unconditional with respect to
  the AGS endpoint;
- ignore the outcome and return the existing `LaunchResponse` unchanged in all
  three cases (enrolled, unknown code, missing association);
- replace the two TODO comments — the "How to handle this case?" block above
  `findActivityByURL` and the "double-check that activity_code exists" comment —
  with a short note stating the adopted behaviour: an unresolvable code or a
  removed association honours the link, skips enrollment, and warns. Keep the
  existing `ERR_INVALID_LAUNCH` for an activity URL that resolves to no
  `activities` row, which is unchanged by this feature;
- leave the deep-link handler, dashboard handler, scope resolution, sign-in,
  line-item reconciliation, and token issuance untouched.

Tests (extend the existing `LtiLaunchService.handleLaunch` suite; every
constructed service now needs an `enrollmentService` fake):

- an AGS launch enrolls with the learner id, the launch's public activity code,
  and the resolved activity id, and still reconciles the line item;
- an instructor resource-link launch follows current policy and performs the
  same enrollment attempt as a learner launch; do not add an instructor-role
  exclusion;
- a launch with no `CLAIM_AGS_ENDPOINT` still enrolls and returns the
  `start-activity` response, performing no transaction;
- ordering: the enrollment call is recorded before `withTransaction` runs;
- a `withTransaction` that rejects leaves the already-recorded enrollment call in
  place — the enrollment write is not inside the rolled-back unit of work;
- an unresolvable public code (fake returns `unknown_activity_code`) still yields
  a `start-activity` response with the resolved scope and tokens, and never
  raises `ERR_INVALID_LAUNCH`;
- a missing association (fake returns `activity_not_in_activity_code`) yields the
  same unchanged response;
- the existing privacy assertion is extended: the serialized response and the
  captured enrollment arguments contain no raw Canvas term id or dates.

Acceptance criteria:

- the verified resource-link handler attempts enrollment before returning its
  redirect response, with and without an AGS endpoint;
- LTI enrollment occurs outside the AGS progress/line-item transaction;
- an unresolvable public code does not invalidate the launch;
- no deep-link or dashboard launch performs an enrollment write.

Verification:

```sh
pnpm -F @modulus-learning/core typecheck
pnpm -F @modulus-learning/core test:one \
  src/modules/app/lti/services/launch.test.ts
pnpm -F @modulus-learning/core test
pnpm typecheck
pnpm lint:check
```

## Phase 3 — Development Data, Documentation, And Acceptance

### Task 4 — Seed Associations And Code-Level Enrollment

Proposed commit: `chore: seeded activity code associations and code level enrollment`

Under the new model the report is the intersection of enrollment and
association, and the repository currently seeds **no** `activity_activity_code`
rows at all — so without this task the learners/progress view is correctly
empty. The seeds also enroll `userIds[3]` while seeding progress for
`userIds[1]`, which would leave every visible cell null.

Files:

- revise `packages/core/src/database/seeds/10_activities.ts`;
- revise `packages/core/src/database/seeds/11_enrollment.ts`; and
- revise `packages/core/src/database/seeds/index.ts`.

Work:

- have `seedActivities` accept the activity-code ids `index.ts` already holds and
  insert `activity_activity_code` rows after the activities: activities `0`–`2`
  under codes `0`–`2` respectively (mirroring the existing initial enrollment
  intent), and activity `1` under code `3` so the 5,000-learner bulk cohort keeps
  a reportable activity. Associate a second activity with code `0` so the
  learner × activity fan-out is exercised in development;
- in `seedEnrollment`, drop `activity_id`, keep the bulk cohort on code `3`, and
  add enrollments for `userIds[1]` — the learner `12_progress.ts` seeds progress
  for — under codes `0`, `1`, and `2`, retaining `userIds[3]` so a
  learner-with-no-progress row is also visible;
- in `index.ts`, pass the activity-code ids into `seedActivities`, and add an
  explicit `db.delete(activityActivityCode)` before the `activities` delete
  rather than relying on the cascade from `activities`;
- make the seed entry point propagate failures by setting a non-zero exit status
  (or rethrowing after logging) instead of printing an error and allowing
  `drizzle:seed` to succeed; and
- keep the numbered seed chain and its documented ordering intact.

Acceptance criteria:

- `pnpm -F @modulus-learning/core drizzle:seed` completes on a migrated
  development database and exits nonzero if any seed stage fails;
- the learners/progress view for a seeded code renders without error and shows a
  non-empty mix of populated and null progress;
- the 5,000-row bulk cohort still paginates;
- every code that receives seeded enrollment has at least one seeded activity
  association, so the reportable cohort is intentional and non-empty.

Verification:

```sh
pnpm -F @modulus-learning/core typecheck
pnpm -F @modulus-learning/core drizzle:seed
pnpm -F @modulus-learning/gradebook dev   # visit /dashboard/activity-code/<id>/learners
pnpm lint:check
```

### Task 5 — Update Shipped Documentation

Proposed commit: `docs: documented activity code enrollment`

Files:

- revise `docs/DATA-MODEL.md`;
- revise `docs/LTI.md`;
- revise `docs/AGENT.md`;
- revise `docs/ARCHITECTURE.md`; and
- revise the affected source comments if any survive Tasks 2–3.

Work:

- `DATA-MODEL.md` §3 — redraw the activity graph so `enrollment` connects
  `activity_codes` to `users` only, and drop the `(code, activity, user)`
  caption; rewrite the `enrollment` bullet as the two-column learner membership
  relation with immutable `created_at`, contrasting it with
  `activity_code_member` as instructor access; note that scope independence is
  deliberate;
- `DATA-MODEL.md` §8 — rewrite the reporting paragraph: progress is aggregated
  across scopes to one row per `(user_id, activity_id)`, then intersected with
  code enrollment and `activity_activity_code`; totals and pagination operate on
  learner × associated-activity pairs; a null means no progress in any scope;
  state plainly that the view is a placeholder whose long-term semantics are
  deferred;
- `DATA-MODEL.md` "Migrations & Seeds" — update the migration range and note
  that associations are seeded alongside activities at step `10`;
- `LTI.md` Flow 2 — add the enrollment step to `handleActivityLaunch`: after
  sign-in and before any AGS work, Modulus resolves the public code and enrolls
  the learner in it when the activity is still associated with that code; an
  unresolvable code or a removed association warns, skips, and leaves the launch
  response unchanged; an AGS failure cannot undo it;
- `LTI.md` Flow 3 — note that deep linking is what creates the association the
  later launch checks;
- `AGENT.md` — revise the "Latest state is scoped" honest note so the cohort is
  the code-level enrollment relation, and state that activity codes never cross
  the Tier 2 ↔ Tier 3 boundary;
- `ARCHITECTURE.md` — no structural change; confirm the Tier 2 bullet
  "Activity codes, enrollment" still reads correctly and adjust only if it
  implies an activity-level relation;
- follow `.agents/skills/writing-docs/SKILL.md`: front matter, Title Case
  headings, definition before use, and the closing `## Where to go next`;
- document that current policy enrolls instructors who perform a verified
  resource-link launch alongside learners, without presenting that policy as a
  new role or agent contract; and
- confirm `docs/DOCUMENTATION-PLAN.md` needs no status change because this task
  revises existing published documents rather than adding one.

Acceptance criteria:

- no shipped document describes a three-way enrollment relation;
- the documented LTI flow matches the implemented call order and skip conditions;
- the documented report shape matches the implemented query;
- no OSU/Canvas identifier, key, or unannounced institutional plan is added.

Verification:

```sh
pnpm lint:check
git diff --check
```

### Task 6 — Full Verification And Pull Request

Proposed commit: none, beyond a status update to this plan if review requires it.

Work:

- run the complete local gate;
- push `feat/activity-code-enrollment` and open one pull request against
  `develop` linking the analysis and this plan;
- record in the description: the schema change and its migration id, the shared
  operation and its two triggers, the eligibility rule and its warn diagnostics,
  the interim report shape, the seed changes, and the deferred items;
- state explicitly that no staging migration is included and that the staging
  database must be prepared separately before deployment;
- state that no Changesets entry is required, because
  `@modulus-learning/agent` is the only published package and it is untouched.

Pull-request checklist:

```md
### Activity-code enrollment

- [ ] Reshape the enrollment relation, migration, and reporting query
- [ ] Add the shared idempotent enrollment operation
- [ ] Route startActivity through the shared operation
- [ ] Enroll on a verified LTI resource-link launch
- [ ] Seed activity associations and code-level enrollment
- [ ] Update DATA-MODEL, LTI, AGENT, and ARCHITECTURE
- [ ] Full verification
```

Verification:

```sh
pnpm run ci
pnpm build
git diff --check
git status --short
```

## Acceptance-Criteria Traceability

Each criterion from the analysis maps to the task that discharges it.

| Analysis acceptance criterion | Task |
| --- | --- |
| Primary key `(activity_code_id, user_id)`, no `activity_id` | 1 |
| Immutable `created_at` set on first insertion | 1, 2 |
| At most one enrollment per learner and code | 1, 2 |
| Revisits and second activities are idempotent | 1, 2, 3 |
| Navigation and cumulative reporting create no enrollment | 2 (no new writer), 6 (verified by full suite) |
| `getActivityProgress` compiles and returns a valid response | 1 |
| No activity outside the selected code appears in the report | 1 |
| LTI handler attempts enrollment before redirect, AGS or not | 3 |
| LTI enrollment outside the AGS transaction | 3 |
| Unresolvable public code preserves the launch response | 3 |
| `startActivity` applies the same idempotent operation | 2 |
| Missing association honours the link without enrolling | 2, 3 |
| PII-free warn diagnostic with the available code id and activity id | 2 |
| Instructor resource-link launches enroll under current policy | 3, 5 |
| Learners/progress view renders with seeded data | 4 |
| No staging or production data-migration procedure in scope | 1, 6 |

## Out Of Scope

- any staging or production migration, deduplication, export, or rollout
  procedure;
- unenrollment, an active flag, term semantics, or LMS roster synchronisation;
- changing the current policy that instructor resource-link launches enroll the
  instructor alongside learners;
- restoring a removed activity/code association during a launch;
- renaming `activity_code_member` to `activity_code_instructor`;
- the long-term reporting and analytics model — row shape, search
  (`options.query` remains unimplemented), pagination contract, performance
  targets, null-progress presentation, and large-cohort optimisation;
- distinguishing configuration membership from participation in reports;
- an instructor-facing warning for an LMS link whose code or association is
  missing; the structured warn log is the interim signal;
- adding `scope_id` to `enrollment` or making reports scope-aware;
- any agent API, access-token claim, cumulative-progress payload, or page-state
  change;
- a Changesets entry or an agent release;
- carrying an activity code into agent context or across authored navigation.
