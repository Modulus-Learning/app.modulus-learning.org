# Activity scopes — implementation plan

Date: 2026-08-04
Status: planning; Tasks 1–2 complete on `feat/activity-scopes`; no production
implementation has started
Related:

- `specs/2026-08-04-activity-scopes-analysis.md` — approved design analysis and
  source of the required invariants
- `docs/ARCHITECTURE.md` — the three-tier model and Tier 2 ↔ Tier 3 privacy
  boundary
- `docs/AUTHN-AUTHZ.md` — current learner and agent token model
- `docs/AGENT.md` — current browser authentication and activity-state flow
- `docs/DATA-MODEL.md` — current learner-state and Learning Tools
  Interoperability (LTI) tables
- `docs/LTI.md` — launch and deep-linking flows
- `docs/LTI-SCORE-SUBMISSION.md` — Assignment & Grade Services (AGS) score
  passback

## Outcome

Implement activity scopes as an opaque bucket label carried from a verified LTI
launch through the browser agent, authorization code, access token, learner
state, and AGS line item. The completed feature must let the same learner and
activity retain independent progress and page state in multiple academic terms
without changing the broad cohort semantics of activity codes.

The work is complete when:

1. a usable Canvas term id resolves to a platform-qualified scope;
2. a missing, null, empty, or unexpanded term id resolves to the global default
   scope;
3. all agent state and passback operations use one token-bound
   `(user_id, activity_id, scope_id)` tuple;
4. the verified LTI route carries scope through the first-party interstitial,
   while the non-LTI route sends the default sentinel explicitly;
5. browser tabs retain their own committed context while cold tabs inherit the
   most recently foregrounded context;
6. scope/line-item divergence and verified Canvas term reassignment are
   observable rather than silent;
7. instructor activity-code reports retain one row per enrollment, correct
   totals, and deterministic pagination without making enrollment scope-aware;
   and
8. the full repository verification gate and the defined browser matrix pass.

## Non-Negotiable Contracts

Every implementation task must preserve these contracts:

- `scope_id` is a label, not a capability or authorization entitlement. A
  learner may submit their own activity state under any structurally valid,
  existing scope id.
- The server continues deriving `user_id` and `activity_id` from authenticated
  context. Browser storage never selects either value.
- Only a verified LTI launch may create or resolve a new non-default scope.
- The LTI redirect carries only `scope_id` to the interstitial. The
  interstitial supplies it to `startActivity`, which returns canonical scope
  metadata before the activity launch.
- Scope travels in a recognized query parameter, not the URL fragment. Cleanup
  preserves unrelated query parameters and authored fragments.
- The non-LTI start-activity path explicitly sends the default sentinel and
  does not inherit a prior LTI scope.
- The default scope uses the fixed id
  `00000000-0000-0000-0000-000000000000`. Scoped foreign keys are non-null and
  use that sentinel when no usable term id exists.
- `Canvas.term.name`, `Canvas.term.startAt`, and `Canvas.term.endAt` are
  independently nullable. Missing, malformed, or unexpanded optional metadata
  never rejects a valid launch or erases previously known valid metadata.
- Optional metadata received without a usable term id never mutates the global
  default-scope row.
- A human-readable scope name may cross into the agent as display-only metadata.
  It never participates in identity, equality, storage selection, or passback.
- Term dates remain descriptive. This feature does not reject reads, writes, or
  passback before `starts_at` or after `ends_at`; any such policy requires a
  separate stakeholder decision.
- `enrollment`, `activity_code_member`, and activity-code cohort semantics remain
  unscoped.
- Line-item uniqueness remains `(user_id, activity_id, lineitem_url)`. A
  verified scope change for that identity rebinds and resets the existing row;
  it does not create a second row.
- Line-item reconciliation uses an insert-if-absent followed by a
  `SELECT ... FOR UPDATE` and explicit scope branch after conflict. Merely
  placing an unlocked read and update in one transaction is insufficient.
- A scoped progress update never crosses scopes to avoid a zero-row line-item
  update. One SQL statement returns both the scoped update count and mismatch
  classification; it neither runs a follow-up probe nor rewrites unmatched
  rows.
- Do not skip mismatch classification merely because the token uses the
  sentinel. Sentinel context does not establish that the deployment contains no
  non-default scopes.
- The existing progress advisory transaction lock remains keyed only by
  `user_id`. Do not add `scope_id` to the lock key.
- There are no live Modulus deployments. Do not add observe, compatibility, or
  required deployment modes, and do not stage the feature around old-agent
  adoption.

## Execution Rules

- Open one cumulative pull request from `feat/activity-scopes` to `develop`
  after Task 1. Do not merge it until all implementation and verification tasks
  are complete.
- Complete tasks in order unless a task explicitly says it can run in parallel.
  Do not begin the next task until the current task's acceptance criteria pass.
- Use one focused conventional commit per task. If review exposes an error in a
  completed task, add a focused corrective commit rather than mixing the fix
  into unrelated work.
- Each task must include its tests in the same commit as the behaviour it adds.
- Define the complete schema shape in Task 3, then generate, inspect, and commit
  one consolidated Drizzle migration and its metadata. Later tasks must not add
  incremental migrations for columns already included in that schema task.
- Preserve the unscoped activity-code data model throughout the branch.
- Do not deploy intermediate commits. Some tasks close a cross-layer invariant
  established by an earlier task; the final branch, not an intermediate commit,
  is the deployable unit.
- Update this plan when review changes a task boundary or an acceptance
  criterion. The plan is the execution checklist for the pull request.

## Dependency Map

| Phase | Task | Depends on | Primary boundary |
| --- | --- | --- | --- |
| 0 | 1. Record the plan | approved analysis | planning only |
| 0 | 2. Resolve remaining baseline contracts | Task 1 | stakeholder/review decisions |
| 1 | 3. Add complete scoped schema and migration | Task 2 | database foundation |
| 1 | 4. Resolve scope from verified LTI launches | Task 3 | Canvas → core |
| 1 | 5. Carry scope through first-party launch paths | Task 4 | core → gradebook → activity query |
| 2 | 6. Bind scope through agent OAuth and tokens | Tasks 3–5 | activity → token → `AgentAuth` |
| 2 | 7. Partition activity state and preserve reporting | Task 6 | progress/page state/events/reports |
| 2 | 8. Partition line items and score passback | Tasks 4, 6, and 7 | AGS lifecycle |
| 3 | 9. Add per-tab context and OAuth restoration | Tasks 5 and 6 | `sessionStorage` |
| 3 | 10. Add foreground context inheritance | Task 9 | `localStorage` and browser events |
| 4 | 11. Complete telemetry, release metadata, documentation, and verification | Tasks 3–10 | cross-system release gate |

## Phase 0 — Plan and Contract Freeze

### Task 1 — Record the Implementation Plan — Complete

Commit: `specs: added activity scopes implementation plan`

Files:

- add `specs/2026-08-04-activity-scopes-implementation-plan.md`; and
- leave `specs/2026-08-04-activity-scopes-analysis.md` unchanged unless plan
  review identifies a design inconsistency.

Work:

- translate every approved invariant into an implementation task;
- identify the affected schema, core modules, gradebook routes and components,
  browser-agent paths, tests, and documentation;
- define one reviewable commit boundary per task;
- define task-level automated acceptance criteria and verification commands;
  and
- record unresolved product decisions as Task 2 rather than silently choosing
  them during implementation.

Acceptance criteria:

- every state and passback predicate named in the analysis appears in a task;
- the plan keeps enrollment and activity-code membership unscoped;
- the plan keeps the advisory lock keyed only by `user_id`;
- no production implementation is included in this commit; and
- only the implementation plan is staged and committed.

### Task 2 — Resolve Remaining Baseline Contracts — Complete

Commit: `specs: resolved activity scopes implementation contracts`

Files:

- revise `specs/2026-08-04-activity-scopes-analysis.md`; and
- revise this plan so later tasks contain decisions rather than alternatives.

Resolved decisions:

1. **Scope/platform integrity check.** Agent authorization parses `scope_id` as
   a UUID and checks that the scope exists. It does not infer or enforce a
   platform association. Only a verified LTI launch creates non-default scopes,
   and the later label selection remains a partition choice rather than an
   entitlement check.
2. **Activity-code report projection.** Before joining `enrollment`, aggregate
   scoped progress by `(user_id, activity_id)` using maximum progress, earliest
   `created_at`, and latest `updated_at`. No progress yields null projected
   values. Null names, progress, and timestamps sort last in both directions,
   followed by ascending `(activity_id, user_id)` as the stable tie-breaker.
   Form the projection before totals and offset pagination;
   `getProgressForUser` uses the same projection and exposes no arbitrary scope
   row.
3. **Initial `scope_name` contract.** The first agent release returns canonical
   `scope_id` and nullable `scope_name` from the token endpoint and exposes both
   through authenticated `AuthStatus`. Only `scope_id` is a JWT identity claim;
   the name is refreshable display metadata.
4. **Line-item term reassignment.** A verified scope change rebinds the locked
   existing row, leaves historical activity state untouched, resets submitted
   progress and all dead/retry/error/lease fields, replaces submittable progress
   with the new scope's cutoff maximum, and makes the row eligible at `now()`.
   The transition and a later lease-fenced stale completion emit structured
   diagnostics containing only opaque record and scope ids.
5. **Supported browser matrix.** Task 11 covers the latest stable desktop Chrome,
   Edge, Firefox, and macOS Safari plus iOS/iPadOS Safari. Desktop modes are
   same-tab, `target="_blank"`, middle-click, context-menu new tab, separate
   window, reload, back/forward-cache restoration, and bookmark/typed URL.
   Mobile Safari covers same-tab, authored new tab, reload, back/forward, and
   bookmark navigation. The pull request records exact tested versions and
   operating systems.

The following decisions are already settled and must not be reopened in this
task without explicit stakeholder direction:

- missing usable Canvas term id means the default sentinel;
- optional Canvas term metadata is nullable and non-blocking;
- term dates do not gate activity access in this feature;
- enrollment and activity-code membership remain unscoped;
- the per-user advisory lock remains keyed only by `user_id`;
- there are no staged deployment modes;
- the verified first-party handoff and activity transport use query parameters,
  preserving authored fragments; and
- the non-LTI first-party path sends the default sentinel explicitly.

Acceptance criteria:

- all five open contracts above have one recorded baseline answer;
- the chosen report projection is deterministic for equal progress values,
  empty progress, and progress in multiple scopes;
- the activity-facing contract distinguishes `scope_id` identity from optional
  display metadata;
- report acceptance covers totals and deterministic offset pagination after
  multi-scope aggregation;
- the line-item reassignment decision states which submission, retry, and lease
  fields reset and how stale in-flight completion is diagnosed;
- the settled query transport accounts for URL cleanup, referrers, bookmarks,
  authored fragments, and OAuth redirects; and
- this remains a planning-only commit.

## Phase 1 — Scope Identity and LTI Handoff

### Task 3 — Define the Complete Scoped Schema and Generate One Migration

Proposed commit: `feat: added activity scope schema`

Files:

- add `packages/core/src/database/schema/source/scopes.ts`;
- export the table and relations from
  `packages/core/src/database/schema/index.ts`;
- add the shared default-scope id constant in the database/domain layer;
- revise `agent-auth-codes.ts`, `progress.ts`, `page-state.ts`,
  `progress-events.ts`, and `lti/lti-lineitems.ts`;
- revise `packages/core/src/database/schema/source/enrollment.ts` so its
  relations do not claim one progress row per enrollment;
- add exactly one generated Drizzle migration and its metadata under
  `packages/core/src/database/migrations`;
- update database fixtures and seeds needed by scoped foreign keys; and
- add scope constraint coverage beside the LTI repository in
  `packages/core/src/modules/app/lti/repository/index.itest.ts`.

Work:

- create `scopes` with:
  - internal UUID primary key;
  - nullable `platform_id` referencing `lti_platforms.id` with delete
    restriction;
  - nullable external term id stored as text;
  - nullable `name`, `starts_at`, and `ends_at` metadata;
  - nullable `last_verified_launch_at`; and
  - standard timestamps;
- enforce uniqueness of `(platform_id, external_id)` for non-default scopes
  and enforce that only the sentinel may omit both values;
- seed the sentinel in the migration that creates `scopes`;
- add non-null sentinel-defaulted `scope_id` foreign keys with delete
  restriction to `agent_auth_codes`, `progress`, `page_state`,
  `progress_events`, and `lti_lineitems`;
- rebuild `progress` and `page_state` composite primary keys with
  `scope_id`, and add scoped event indexes;
- retain line-item uniqueness on
  `(user_id, activity_id, lineitem_url)`; do not include `scope_id` in that
  key;
- remove or replace `enrollmentProgressRelations.progress`, which cannot
  represent a multi-scope relation;
- leave `enrollment`, `activity_code_member`, and the unused
  `agent_refresh_tokens` table unchanged;
- generate the migration only after all of the above schema definitions have
  settled, then inspect its SQL and journal/snapshot metadata; and
- verify both a fresh database and a temporary database populated with
  representative unscoped state before applying the migration.

Automated acceptance criteria:

- a fresh test database contains exactly one row with the fixed default id;
- the sentinel has null platform, external id, name, and date metadata;
- two different platforms may use the same external term id, while one platform
  cannot create duplicate external ids;
- a non-default scope cannot omit its platform or external id;
- all five scoped existing tables backfill to the sentinel without loss or
  duplication;
- progress and page-state keys accept independent rows in two scopes;
- line-item URL uniqueness still rejects a second row that differs only by
  `scope_id`;
- no one-to-one enrollment/progress relation remains;
- exactly one new migration SQL file and one coherent metadata update describe
  the complete feature schema; and
- schema generation, fresh/populated migration checks, and typechecking
  succeed.

Verification for this task:

```sh
pnpm -F @modulus-learning/core drizzle:generate
pnpm db:init:test
pnpm -F @modulus-learning/core test:integration:one \
  src/modules/app/lti/repository/index.itest.ts
pnpm -F @modulus-learning/core typecheck
```

### Task 4 — Resolve Scope from Verified LTI Launches

Proposed commit: `feat(lti): resolved activity scopes from Canvas terms`

Files:

- revise `packages/core/src/modules/app/lti/services/deep-link.ts`;
- revise `packages/core/src/modules/app/lti/services/launch.ts`;
- revise `packages/core/src/modules/app/lti/repository/index.ts`;
- revise `packages/core/src/modules/app/lti/schemas.ts` and the relevant launch
  types; and
- add focused LTI service and repository tests.

Work:

- request `Canvas.term.id`, `Canvas.term.name`, `Canvas.term.startAt`, and
  `Canvas.term.endAt` in deep-link custom fields;
- retain the verified platform record, or its id, after id-token validation so
  scope resolution uses authenticated platform context;
- normalize term inputs independently:
  - usable id → resolve or create the platform-qualified scope;
  - missing, null, empty, or literal `$Canvas.term.id` → default sentinel;
  - usable name/date with usable id → update that metadata;
  - absent, null, empty, unexpanded, or malformed optional metadata → keep
    previously known valid metadata; and
  - optional metadata without usable id → do not update the sentinel;
- update `last_verified_launch_at` for a successfully resolved non-default
  scope;
- make concurrent resolution of one platform/id pair idempotent;
- include `scope_id` and nullable `scope_name` in the verified
  `handleLaunch` response consumed by the gradebook route; and
- keep term dates descriptive: do not add a launch, read, write, or passback
  gate.

Automated acceptance criteria:

- an id-only launch creates a non-default scope and succeeds;
- later launches may fill in or update valid optional metadata;
- missing optional metadata never erases known values;
- malformed dates and unexpanded optional literals are ignored without failing
  the launch;
- missing, empty, null, and unexpanded term ids all return the default scope;
- metadata accompanying a missing id does not alter the sentinel;
- concurrent resolution returns one shared scope id; and
- raw Canvas term id and dates are absent from the activity launch response.

Verification for this task:

```sh
pnpm -F @modulus-learning/core test:one \
  src/modules/app/lti/services/launch.test.ts
pnpm -F @modulus-learning/core test:integration:one \
  src/modules/app/lti/repository/index.itest.ts
pnpm -F @modulus-learning/core typecheck
```

### Task 5 — Carry Scope Through Both First-Party Launch Paths

Proposed commit: `feat(lti): carried activity scope through launch`

Files:

- revise `apps/gradebook/src/app/routes/lti/launch/route.ts`;
- revise `apps/gradebook/src/app/lti/launch/[...go]/page.tsx`;
- revise `apps/gradebook/src/modules/lti/components/lti-launch-activity.tsx`;
- revise `packages/core/src/modules/app/activities/schemas.ts` and
  `services/start-activity.ts`;
- revise `apps/gradebook/src/modules/app/activity/start-activity.ts` and its
  types;
- revise the non-LTI
  `apps/gradebook/src/app/[lng]/(forms)/start-activity/[...go]/page.tsx` and
  `apps/gradebook/src/modules/app/activity/components/launch-activity.tsx`;
- revise gradebook launch types where needed; and
- add focused core, route, page, and component tests.

Work:

- redirect from the verified LTI handler to the interstitial with only the
  resolved `scope_id` in the first-party query string;
- parse and validate that UUID in the interstitial, then pass it into
  `startActivity`;
- extend `StartActivityRequest`, `StartActivityResponse`, and
  `StartActivityService` so core resolves the canonical scope record and
  returns its id and nullable name with the existing enrollment/activity
  result;
- never carry scope in the learner session cookie and never place
  `scope_name` in either launch URL;
- show the human-readable term name when supplied;
- show generic scoped-context wording for a non-default scope without a name;
- show generic default-context wording for the sentinel;
- append the encoded issuer and canonical `scope_id` as recognized query
  parameters when the learner launches or the countdown expires, preserving
  existing activity query parameters and fragments;
- make the non-LTI start-activity page pass the default sentinel to
  `startActivity` and make its launch component append that returned
  `scope_id` explicitly;
- treat the non-LTI sentinel as a normal fresh launch context even if shared
  browser storage contains an LTI scope;
- do not place raw Canvas term id, dates, or course identity in the activity
  URL; and
- preserve existing keyboard operation, countdown cancellation, and no-script
  error handling.

Automated acceptance criteria:

- named, unnamed, and default scopes render distinct truthful messages;
- the verified handler's 302 query is the only handoff into the interstitial,
  and `startActivity` returns canonical metadata for that id;
- manual launch and automatic launch produce the same destination URL;
- the destination contains one issuer and one opaque scope label;
- existing activity query parameters and authored fragments survive launch URL
  construction;
- the non-LTI path always sends the sentinel, regardless of previously stored
  browser context;
- term name is escaped as ordinary text and is not required for launch;
- invalid first-party scope parameters produce a launch error instead of a
  malformed activity redirect; and
- no learner PII, course identity, raw term id, or term dates are added to the
  activity URL.

Verification for this task:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=jsdom \
  src/modules/lti/components/lti-launch-activity.test.tsx
pnpm -F @modulus-learning/gradebook exec vitest run --mode=jsdom \
  src/modules/app/activity/components/launch-activity.test.tsx
pnpm -F @modulus-learning/gradebook exec vitest run --mode=node \
  src/app/routes/lti/launch/route.test.ts
pnpm -F @modulus-learning/core test:one \
  src/modules/app/activities/services/start-activity.test.ts
pnpm -F @modulus-learning/core typecheck
pnpm -F @modulus-learning/gradebook typecheck
```

## Phase 2 — Server-Side Scope Binding and Isolation

### Task 6 — Bind Scope Through Agent OAuth and Tokens

Proposed commit: `feat(agent): bound activity scope to agent tokens`

Files:

- revise `packages/core/src/lib/auth.ts`;
- revise `packages/core/src/modules/agent/auth` schemas, types, repository, and
  services;
- revise `apps/gradebook/src/app/routes/agent/authorize/route.ts`;
- revise `apps/gradebook/src/core-adapter.ts`;
- revise `apps/agent/src/core/auth.ts` only enough to send a fresh launch label;
  and
- add focused core, gradebook-route, and agent tests.

Work:

- use the Task 3 `agent_auth_codes.scope_id` column; do not generate another
  migration;
- add `scope_id` to `AgentAuth` and the signed agent access-token payload;
- parse the client-selected label at the authorize route and normalize a
  missing label to the default sentinel;
- parse `scope_id` as a UUID and confirm that the scope exists before creating
  the authorization code; do not enforce a platform association;
- store the selected label in the single-use authorization-code row;
- read the label only from the claimed code during token exchange;
- never accept a second `scope_id` at the token endpoint;
- return canonical `scope_id` and nullable `scope_name` as display metadata in
  the initial agent contract and expose them through authenticated
  `AuthStatus`;
- construct gradebook `AgentRequestContext` from the token's scope claim; and
- preserve the same `scope_id` during token renewal while rechecking the current
  user and activity as today; and
- leave the unused `agent_refresh_tokens` table unchanged.

Automated acceptance criteria:

- malformed and unknown scope ids fail at authorization as invalid input;
- any existing scope allowed by the Task 2 policy can be selected for the
  authenticated learner/activity;
- omitting `scope_id` at authorization selects the sentinel;
- an authorization code records exactly one scope id;
- the token endpoint cannot substitute another scope;
- token verification constructs
  `AgentAuth(user_id, activity_id, scope_id, renew_after)`;
- renewal preserves `scope_id` across term dates and does not infer a new scope;
- an invalidated user or activity still prevents renewal; and
- scope name is never used as a token identity claim.

Verification for this task:

```sh
pnpm -F @modulus-learning/core test:one \
  src/modules/agent/auth/services/agent-auth.test.ts
pnpm -F @modulus-learning/core test:one \
  src/modules/agent/auth/services/token-refresh.test.ts
pnpm -F @modulus-learning/gradebook exec vitest run --mode=node \
  src/app/routes/agent/authorize/route.test.ts
pnpm -F @modulus-learning/agent test
pnpm -F @modulus-learning/core typecheck
pnpm -F @modulus-learning/gradebook typecheck
```

### Task 7 — Partition Activity State and Preserve Reporting

Proposed commit: `feat(agent): partitioned activity state by scope`

Files:

- revise `packages/core/src/modules/agent/activity-state/repository/index.ts`;
- revise the progress and page-state services under
  `packages/core/src/modules/agent/activity-state/services`;
- revise `packages/core/src/modules/app/activities/repository/index.ts` for the
  cardinality-preserving activity-code report projection;
- verify `packages/core/src/database/schema/source/enrollment.ts` exposes no
  invalid one-to-one progress relation;
- update fixtures and seeds; and
- extend repository, service, and report integration tests.

Work:

- use the scoped state keys and indexes introduced in Task 3; do not generate
  another migration;
- include `scope_id` in every progress and page-state read, insert, update,
  conflict target, and event write;
- retain the source token's scope for every cumulative target read and write;
- keep lazy-created target activities global while their learner progress stays
  scoped;
- keep the advisory transaction lock keyed only by `user_id`;
- leave `enrollment` and `activity_code_member` schemas unchanged; and
- adapt both `getProgressForUser` and `getActivityCodeProgress` to maximum
  progress, earliest `created_at`, and latest `updated_at` per
  `(user_id, activity_id)`, with no projected `scope_id`;
- form that projection before joining enrollment and before calculating order,
  `count(*) over()`, `limit`, or `offset`;
- count enrollment rows rather than scoped progress rows, place null names,
  progress, and timestamps last in either direction, and use ascending
  `(activity_id, user_id)` after the selected primary sort; and
- remove any `findFirst` or Drizzle relation behaviour that can select an
  arbitrary scope row.

Automated acceptance criteria:

- the same learner/activity has independent progress high-water marks in two
  scopes;
- lower and repeated writes are no-ops only within the selected scope;
- the same learner/activity has independent page-state snapshots in two scopes;
- direct and cumulative progress events carry the token scope;
- cumulative reads and increments never cross scopes;
- a cumulative target at 1.0 in scope A may still advance independently in
  scope B;
- the per-user advisory lock serializes same-user progress transactions across
  scopes without adding `scope_id` to its hash input;
- an activity code reused across scopes still returns at most one row per
  enrollment with maximum all-time progress, earliest creation, and latest
  update timestamps; and
- report `total` counts enrollments and remains identical on every row in the
  result page;
- tied aggregate values produce deterministic order, and unchanged data has no
  duplicate or missing enrollments across adjacent offset pages;
- null full names, progress, and timestamps sort last in both directions without
  destabilising adjacent pages;
- `getProgressForUser` returns the same defined aggregate rather than an
  arbitrary scoped row;
- no Drizzle `one(progress)` relation remains; and
- existing rows migrate to the sentinel without duplication or loss.

Verification for this task:

```sh
pnpm db:init:test
pnpm -F @modulus-learning/core test:integration:one \
  src/modules/agent/activity-state/repository/index.itest.ts
pnpm -F @modulus-learning/core test:integration:one \
  src/modules/agent/activity-state/services/progress.itest.ts
pnpm -F @modulus-learning/core test:integration:one \
  src/modules/app/activities/repository/index.itest.ts
pnpm -F @modulus-learning/core typecheck
```

### Task 8 — Partition LTI Line Items and Score Passback

Proposed commit: `feat(lti): partitioned score passback by scope`

Files:

- revise `packages/core/src/modules/app/lti/services/launch.ts`;
- revise `packages/core/src/modules/app/lti/repository/index.ts`;
- revise `packages/core/src/modules/agent/activity-state/repository/index.ts`;
- revise the score-submission repository and affected service call sites under
  `packages/core/src/modules/app/lti/score-submission`;
- update fixtures and seeds; and
- extend LTI and score-submission integration tests.

Work:

- use the Task 3 `lti_lineitems.scope_id` column while retaining uniqueness on
  `(user_id, activity_id, lineitem_url)`; do not generate another migration;
- pass the verified launch scope into LTI progress initialization, cutoff
  calculation, and line-item reconciliation;
- replace the single conditional upsert with one repository operation that runs
  inside the existing launch transaction:
  1. attempt a fully initialized
     `INSERT ... ON CONFLICT DO NOTHING RETURNING`;
  2. return immediately when the insert succeeds;
  3. after a conflict, select the unique-key row `FOR UPDATE`;
  4. compare the incoming scope with the locked row; and
  5. execute one explicit same-scope update or one explicit rebind update;
- do not substitute an ordinary read inside `withTransaction`; the row lock is
  required so another launch or worker cannot change the branch inputs before
  the update;
- on the same-scope branch, keep
  `submittable_progress = GREATEST(existing, incoming)`, apply normal cutoff
  and revival fields, and preserve submitted progress, lease, and error state;
- include the bound agent scope when progress writes update live line items;
- add scope predicates to both `getProgressWithCutoff` and
  `getProgressAtCutoff`;
- implement `updateLineItems` as one statement with:
  1. a materialized candidate relation filtered by learner, activity, cutoff,
     and live status;
  2. an update that joins candidates but retains
     `lineitems.scope_id = scope_id` against the actual target row; and
  3. a final result containing `updated_count` and
     `scope_mismatch = updated_count = 0 AND other_scope_exists`;
- emit the structured mismatch diagnostic only from that returned outcome; do
  not issue a second query after a zero-row update;
- do not drop the scope predicate and use `CASE` to leave unmatched values
  unchanged, because matching those rows would still lock and rewrite them;
- do not skip the classification for sentinel scope unless a future,
  independently enforced deployment invariant proves that non-default scopes
  cannot exist;
- when a verified launch reconciles an existing line-item URL under a different
  scope, update that row's `scope_id`, set `submitted_progress` to zero, clear
  `submitted_at`, and replace `submittable_progress` with the new scope's
  cutoff maximum;
- on that rebind, clear stale dead, retry, eligibility, lease-expiry, and
  lease-token state before applying ordinary current-launch and revival fields;
- log the opaque old/new scope ids and line-item id, and diagnose any later
  completion fenced by the reset lease;
- do not relabel old-scope `progress`, `progress_events`, or `page_state`;
- ensure cumulative target progress touches only matching-scope line items;
- preserve scope through queue selection, lease claim, success, failure, retry,
  and dead-line-item transitions;
- keep worker fencing keyed by line-item id and lease token; and
- leave platform health and incident aggregation scoped to the platform, not to
  academic terms.

Automated acceptance criteria:

- one learner/activity/line-item URL cannot have two rows that differ only by
  scope;
- concurrent first launches for an absent line item produce one complete row
  without a unique-key error;
- an event in scope A cannot update, revive, claim, or submit a scope B line
  item;
- both cutoff methods consider only events in the line item's scope;
- a no-match update with an existing other-scope live line item emits a
  diagnostic from the same statement but does not lock or rewrite that row;
- the normal no-line-item outcome returns `updated_count = 0` and
  `scope_mismatch = false` without a follow-up statement;
- a matching line item returns a positive `updated_count` and no mismatch;
- a sentinel-scoped write reports a mismatch when its only eligible line item is
  in a non-default scope;
- removing the actual-row scope predicate causes the repository integration test
  to fail because the other-scope row's values, timestamps, and lease state must
  remain unchanged;
- a progress request that advances the current activity plus two cumulative
  targets executes exactly three line-item statements, not six, including when
  none has a line item;
- a verified launch in scope B for a URL previously bound to scope A reuses the
  row, binds it to B, resets submitted progress and stale queue/lease state, and
  calculates submittable progress only from B events;
- with existing scope A `submittable_progress = 0.8`, a same-scope incoming
  value of `0.5` preserves `0.8` and all submission/lease/error state;
- with existing scope A `submittable_progress = 0.8`, a scope B rebind stores
  exactly B's incoming `0.3`, not `0.8`;
- the same rebind with no scope B progress stores exactly zero, proving the
  rebind path does not apply `GREATEST`;
- a rebind fixture begins with non-zero `submitted_progress`, a submitted
  timestamp, retry/error state, and a lease, then verifies every designated
  reset field;
- controlled concurrent same-scope/rebind operations leave a row whose scope,
  submittable value, and queue state all come from one serialized branch rather
  than a mixture of both scopes;
- scope A learner state remains unchanged and does not become scope B progress;
- a launch in scope A initializes and revives only its own progress and line
  item;
- direct and cumulative progress update matching-scope line items only;
- lease fencing and retry behaviour remain unchanged within one row;
- ordinary submission success/failure never changes a line item's `scope_id`;
  only the verified-launch rebind path may do so;
- a stale worker completion after rebind fails lease fencing and is diagnosed;
  and
- migrated line items retain their current values in the sentinel scope.

Verification for this task:

```sh
pnpm db:init:test
pnpm -F @modulus-learning/core test:integration:one \
  src/modules/app/lti/repository/index.itest.ts
pnpm -F @modulus-learning/core test:integration:one \
  src/modules/app/lti/score-submission/repository.itest.ts
pnpm -F @modulus-learning/core test:integration:one \
  src/modules/app/lti/score-submission/submitter.itest.ts
pnpm -F @modulus-learning/core test:integration:one \
  src/modules/agent/activity-state/services/progress.itest.ts
pnpm -F @modulus-learning/core typecheck
```

## Phase 3 — Browser Context Transport

### Task 9 — Add Per-Tab Context and OAuth Restoration

Proposed commit: `feat(agent): added per-tab activity scope context`

Files:

- refactor `apps/agent/src/core/auth.ts`;
- add a focused context/storage helper under `apps/agent/src/core` if needed;
- add `apps/agent/src/core/auth.test.ts`;
- update public agent types so authenticated `AuthStatus` exposes canonical
  `scope_id` and nullable `scope_name`;
- update `apps/agent-demo/react` and `apps/agent-demo/vanilla` if their
  consumer code or visible diagnostics need the new public context contract; and
- add a Changesets entry for the published `@modulus-learning/agent` package.

Work:

- replace independent issuer storage with one validated, versioned context:

  ```ts
  type StoredActivityContext = {
    version: 1
    issuer: string
    scope_id: string
    scope_name?: string
  }
  ```

- parse the fresh-launch issuer and `scope_id` from recognized query
  parameters, then scrub only recognized parameters while preserving unrelated
  query parameters and the complete authored fragment;
- capture the authored query entries and fragment before the authorization
  redirect, preserving duplicate parameters and their order semantically;
- store that return location only in `sessionStorage` beside the PKCE state,
  never in the tab/shared activity-context record;
- commit a valid fresh launch to this tab's `sessionStorage` before beginning
  OAuth;
- keep the OAuth `client_id` and `redirect_uri` query-free and fragment-free;
- preserve the complete activity context, return location, and PKCE state across
  the authorization redirect;
- recover the saved context before token exchange without consulting shared
  storage;
- after both successful and error OAuth responses, scrub recognized response
  parameters and restore the saved authored query and fragment with
  `history.replaceState`;
- update optional `scope_name` from the verified token response without
  changing `scope_id`;
- use the tab record for reloads and same-tab multi-page navigation;
- normalize an otherwise valid Modulus context without a label to the default
  sentinel;
- clear malformed or unsupported-version records without throwing;
- remove the old issuer-only storage shape directly, because no live deployment
  needs a compatibility reader;
- record the agent's new launch-parameter and storage behaviour in a Changesets
  entry, using the release level selected during review; and
- build both demo consumers, updating them only where the public contract
  requires it.

Automated acceptance criteria:

- a fresh launch commits one atomic issuer/scope pair;
- OAuth response handling uses the exact pre-redirect pair;
- a scope change in other storage during OAuth cannot change the token request;
- the OAuth `client_id` and `redirect_uri` contain no query or fragment;
- successful and error OAuth round trips both restore the saved authored query
  entries and fragment while removing all recognized response parameters;
- duplicate authored query parameters retain their order and meaning after the
  round trip;
- reload and same-tab navigation retain the committed scope;
- missing label uses the sentinel;
- malformed JSON, invalid issuer, invalid UUID, and unsupported versions fail
  safely;
- `scope_name` may be absent or refreshed without changing identity;
- recognized launch and OAuth parameters are removed from the visible activity
  URL;
- unrelated query parameters and in-page anchors remain semantically unchanged
  after cleanup;
- no scope parsing or cleanup treats the fragment as agent-owned state;
- the repository contains a pending Changesets entry for
  `@modulus-learning/agent`; and
- both demo consumers build against the changed agent package.

Verification for this task:

```sh
pnpm -F @modulus-learning/agent exec vitest run --mode=jsdom \
  src/core/auth.test.ts
pnpm -F @modulus-learning/agent typecheck
pnpm -F @modulus-learning/agent build
pnpm -F @modulus-learning/agent-demo-react build
pnpm -F @modulus-learning/agent-demo-vanilla build
```

### Task 10 — Add Foreground Context Inheritance

Proposed commit: `feat(agent): added foreground activity scope inheritance`

Files:

- revise the agent context/storage helper and `auth.ts`;
- extend `apps/agent/src/core/auth.test.ts`; and
- add higher-level agent tests only where the authentication public surface
  changes.

Work:

- use `localStorage` for one complete, versioned issuer/scope context representing
  the most recently foregrounded tab;
- publish only when both conditions are true:

  ```ts
  document.visibilityState === 'visible' && document.hasFocus()
  ```

- route initialization, `visibilitychange`, and `focus` through one guarded
  publication function;
- never publish merely because authentication completed or a token renewed;
- replace unconditional failure-driven `clearStoredIssuer` behaviour with
  separate tab and shared clearing operations;
- make `access_denied`, session expiry, and other transient OAuth responses
  clear only the tab's OAuth/session state;
- allow definitively invalid shared context to be deleted only after comparing
  the current stored record and satisfying the same visible-and-focused
  ownership rule used for publication;
- preserve a fresh background launch in its own `sessionStorage` until that tab
  becomes foregrounded;
- resolve context in this order: fresh launch, OAuth response, committed tab,
  shared foreground record, then no Modulus context;
- seed a cold tab's `sessionStorage` from one complete shared record before
  requesting authorization;
- compare same-tab history before shared history when logging explicit launch
  switches;
- tolerate unavailable storage without breaking open/local activity behaviour;
  and
- ensure event listeners are installed once and do not leak duplicate handlers
  across agent initialization.

Automated acceptance criteria:

- a foreground fresh launch commits tab and shared context;
- a background fresh launch commits only tab context;
- foregrounding that background tab publishes its complete pair;
- two established tabs in different scopes remain stable across reload and
  token renewal;
- a cold user-opened tab adopts the current foreground context;
- a malformed shared record is ignored without corrupting the tab record;
- an unfocused background tab receiving `access_denied` cannot delete the
  foreground shared record;
- a shared delete cannot remove a different record published after the failing
  tab last read storage;
- a foreground tab may compare-and-delete its own definitively invalid shared
  record;
- issuer and scope from different records are never combined;
- `visibilitychange` alone does not publish an unfocused window;
- `focus` alone does not publish a hidden document; and
- bookmark and typed-URL behaviour matches the documented current-context
  semantic.

Verification for this task:

```sh
pnpm -F @modulus-learning/agent exec vitest run --mode=jsdom \
  src/core/auth.test.ts
pnpm -F @modulus-learning/agent test
pnpm -F @modulus-learning/agent typecheck
pnpm -F @modulus-learning/agent build
```

## Phase 4 — Operational Completion

### Task 11 — Complete Telemetry, Release Metadata, Documentation, and Verification

Proposed commit: `docs: documented activity scope implementation`

Implementation corrections found during this task belong in focused `fix:` or
`test:` commits before the documentation commit. Do not hide production fixes in
the documentation commit.

Files:

- revise `docs/DATA-MODEL.md`;
- revise `docs/AUTHN-AUTHZ.md`;
- revise `docs/LTI.md`;
- revise `docs/LTI-SCORE-SUBMISSION.md`;
- revise `docs/AGENT.md`;
- revise `docs/SECURITY-AND-PRIVACY.md` only if the activity-visible nullable
  term name needs clarification;
- verify the pending Changesets entry and both agent demos reflect the final
  public contract; and
- update this plan's status and implementation handoff.

Work:

- verify earlier tasks added structured server diagnostics for scope resolution,
  default fallback, malformed client labels, optional metadata quality,
  cross-scope line-item mismatch, and line-item scope reassignment;
- verify earlier tasks added client diagnostics for explicit tab scope changes,
  tab/shared divergence, cold-tab inheritance, storage failures, and guarded
  shared deletion;
- do not log OAuth codes, tokens, raw Canvas term ids, course identity, or
  learner identity;
- document the final schema, token tuple, LTI normalization, client resolution
  order, passback isolation, and unscoped analytics boundary;
- document that pre-initialisation referrers are owned by the activity host,
  recommend `Referrer-Policy: strict-origin` or a stricter policy, and record
  opaque scope-label exposure as an accepted non-secret residual;
- record any Task 2 decision that differs from the analysis's recommended
  baseline;
- run the complete local continuous-integration gate against a fresh test
  database; and
- manually exercise the browser matrix below.

Automated acceptance criteria:

- telemetry distinguishes non-default and default launches without relying on
  learner PII;
- mismatch and reassignment diagnostics use opaque identifiers and do not cross
  scope boundaries;
- all state and passback tests include at least two scopes;
- exactly one consolidated feature migration applies cleanly to a fresh
  database and to populated sentinel-bound fixtures;
- unit tests, integration tests, lint check, builds, and typechecks pass;
- a pending Changesets entry describes the published agent behaviour;
- both agent demos build against the final package;
- documentation describes the shipped implementation rather than the plan;
- documentation does not claim that agent cleanup suppresses activity requests
  or referrers sent before initialisation;
- activity-code documentation still describes broad, unscoped cohorts; and
- the working tree contains no generated or temporary source files intended to
  remain uncommitted.

Automated verification:

```sh
pnpm db:init:test
pnpm run ci
pnpm -F @modulus-learning/agent build
pnpm -F @modulus-learning/gradebook build
pnpm -F @modulus-learning/agent-demo-react build
pnpm -F @modulus-learning/agent-demo-vanilla build
git diff --check origin/develop...HEAD
```

Manual browser matrix:

Run the desktop scenarios on the latest stable Chrome, Edge, Firefox, and macOS
Safari available at verification time. Run the applicable touch and storage
scenarios on the latest stable iOS/iPadOS Safari. Record exact browser versions
and operating systems in the pull request. Include authored `target="_blank"`,
back/forward-cache restoration, and the link-opening modes named in Task 2 even
where they share the expected result below.

| Scenario | Expected result |
| --- | --- |
| Fresh named-term launch | Interstitial names the term; activity authenticates in its opaque scope |
| Fresh id-only term launch | Generic scoped wording; activity authenticates successfully |
| Launch without usable term id | Generic default wording; activity uses the sentinel |
| Non-LTI first-party launch | Activity receives the explicit default sentinel regardless of shared LTI context |
| Reload after another tab changes scope | Reloaded tab retains its committed scope |
| Ordinary same-tab activity link | Destination retains the current tab scope |
| Middle-click/context-menu new tab | Cold tab adopts the current foreground context |
| Separate windows in different scopes | Each window remains stable; focused window republishes itself |
| Background fresh LTI launch | Background tab does not replace shared context until focused |
| Bookmark or typed activity URL | Uses the documented current foreground context when available |
| Storage disabled or unavailable | Agent fails safely without corrupting activity-local operation |
| Two-scope progress and page state | Each scope restores only its own values |
| Two-scope AGS line items | Progress in one scope schedules and submits only its matching line item |
| Scope/line-item mismatch | Other-scope line item is unchanged and an operator diagnostic is emitted |
| Canvas course moved to a new term | Existing line-item row rebinds and resets; old-term activity state remains unchanged |
| Multi-scope instructor report | Total counts enrollments and tied rows paginate deterministically without duplicates |

The task succeeds when the pull request contains the automated results, manual
matrix results, migration review, and a concise list of any deferred policy
questions. Do not merge the pull request as part of this task.

## Pull Request Handoff

After Task 1 is committed:

- push `feat/activity-scopes` to `origin`;
- open one pull request against `develop` containing the analysis and this plan;
- explain that production implementation has not started;
- use the task headings as the pull request checklist; and
- begin Task 2 only after plan review.

As implementation proceeds, append each task commit and its verification result
to the pull request. Keep unresolved stakeholder policy visible rather than
turning it into an implementation assumption.

## Out of Scope

- accepting or rejecting work based on `starts_at` or `ends_at` before a
  separate stakeholder decision;
- adding `scope_id` to `enrollment` or `activity_code_member`;
- defining or shipping semester-specific instructor analytics;
- adding a learner term picker or scope selector;
- treating possession of `scope_id` as authorization;
- exposing raw Canvas term ids, course identity, term dates, or gradebook data
  to activity content;
- keying the advisory transaction lock by `(user_id, scope_id)`;
- href rewriting in the baseline;
- cross-origin multi-page context transport;
- iframe-specific focus transport;
- staged deployment modes or old-agent compatibility rollout;
- institutional data-retention policy; and
- merging the pull request.
