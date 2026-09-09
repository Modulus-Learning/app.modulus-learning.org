# Sitewide activity URL allowlist — implementation plan

Date: 2026-09-02
Status: implemented on `feat/activity-url-allowlist`; final-review fixes validated
Related:

- `specs/2026-09-02-activity-url-allowlist-analysis.md` — the approved analysis and the source of every contract below
- `docs/DYNAMIC-ACTIVITIES.md` — the earlier allow-all proposal this feature supersedes
- `docs/CUMMULATIVE-PROGRESS.md` — the cumulative-target contract the rejected-target outcome extends
- `docs/AUTHN-AUTHZ.md` — the agent OAuth + PKCE flow whose authorization branch is reordered
- `docs/DATA-MODEL.md` — where the new rules table is documented
- `docs/SECURITY-AND-PRIVACY.md` — the activity trust claims this feature changes
- `docs/CORE-COMPOSITION.md` — the registry rules the new root-composed module must follow
- `packages/core/src/core.ts` — the composition root that gains the policy and registration module
- `packages/core/src/database/schema/source/activities.ts` — `activities.url` is `varchar(255)`, the bound the whole feature inherits
- `packages/core/src/modules/app/activities/services/activity.ts` — `createActivityCode` / `updateActivityCode`
- `packages/core/src/modules/app/activities/repository/index.ts` — `ensureActivitiesExist`, `createActivity`, `findActivityByURL`
- `packages/core/src/modules/app/lti/services/deep-link.ts` — `handleDeepLink`, the per-code prefix check, the non-idempotent create
- `packages/core/src/modules/agent/auth/services/agent-auth.ts` — `createAuthCode` / `claimAuthCode`
- `packages/core/src/modules/agent/activity-state/services/progress.ts` — `setProgress`, `applyContribution`, `resolveTarget`
- `packages/core/src/test-support/pg.ts` — the integration harness that hand-wires the services under test
- `apps/gradebook/src/app/routes/agent/authorize/route.ts` — the OAuth authorization branch ordering
- `apps/gradebook/src/app/lti/error/page.tsx` and `apps/gradebook/src/modules/lti/error-slug.ts` — the house pattern `/agent/error` follows
- `apps/gradebook/src/proxy.ts` — the matcher exclusion a new chromeless route group needs
- `apps/agent/src/core/api-client.ts` and `apps/agent/src/core/agent.ts` — the progress response type and diagnostic logger

This plan turns the approved analysis into ordered tasks: a rules table and a
root-composed policy service, one shared registration entry point that becomes
the only writer of `activities` rows, the four admitting paths moved onto it, an
admin management surface, the narrowed OAuth authorization branch and its
Modulus-owned error page, the per-target cumulative rejection outcome and its
agent release, and finally documentation. It authorises nothing else. In
particular it does not authorise blocking, revoking, deleting, or re-validating
any existing activity, and it does not authorise closing the authorization
route's remaining open redirect.

## Default Policy Amendment — 2026-09-08

This amendment supersedes the deny-all default in the original plan and analysis
below. With **zero enabled rules**, allow every activity URL that passes the
existing syntax and length checks. This applies both when no rules are stored
and when all stored rules are disabled. With one or more enabled rules, a new URL
must match one of them. Adding or enabling the first rule restricts admission;
disabling or deleting the last enabled rule restores allow-all.

The shared policy evaluator applies this behaviour on every admission path.
The admin impact preview uses the same empty-policy semantics, and its empty
state and change notice explain the default and the transition. A failed policy
read remains an error. Existing activities retain their grandfathering behaviour.
Seeds still create no rules, so a freshly seeded database permits valid new URLs.
The original task sequence below is retained as implementation history.

Validation on 2026-09-09: lint and typechecking passed; 491 unit tests passed
with one existing skip, and all 118 database integration tests passed.

## Final Review — 2026-09-08

The final review found three implementation gaps in the agreed behaviour.
The analysis and the original task sequence below remain unchanged; activity URL
canonicalization remains separate, planned work.

- [x] Preview the policy after disabling or deleting the selected rule, including
  an explicitly empty prospective policy when removing the last enabled rule.
  The host preview action reads the current rules and excludes the selected ID
  and disabled rules. `actions.test.node.ts` and `components/review-flows.test.tsx`
  in `apps/gradebook/src/modules/admin/activity-url-allowlist/` cover both
  confirmation flows, overlapping rules, empty policies and read failures.
- [x] Keep self-only progress writes and contributions to known activities free
  of policy reads. Load one snapshot lazily when a submission first needs to
  evaluate an unseen target, and reuse it for subsequent targets. The shared
  registration service accepts a lazy loader; the progress caller memoizes it
  per submission. Registration unit tests and `progress.itest.ts` verify no
  reads for known targets, one read for unseen targets, and a fresh policy on
  the next submission.
- [x] Distinguish rule-list failures from a successfully loaded empty list.
  Permission and database failures must display an error without claiming the
  site has no rules or denies all new registrations. The host list response now
  distinguishes success and failure; the action and rendering tests above cover
  permission errors, database errors and a successfully loaded empty list.

Validation on 2026-09-08: `pnpm run ci` passed — read-only lint, typechecking,
487 unit tests passed with one existing skip, and 117 database integration tests
passed. Biome formatted the changed code; `git diff --check` passed. The two
affected passages in `docs/CUMMULATIVE-PROGRESS.md` and
`docs/SECURITY-AND-PRIVACY.md` now describe lazy policy loading and the prospective
preview respectively.

## Outcome

The sitewide allowlist is an **admission policy**. A rule admits new activity
URLs; it never governs the use of an activity Modulus has already accepted. One
internal registration entry point owns the syntactic check, the policy
evaluation, the insert, and the create race, and every path that can add an
`activities` row calls it. Administrators manage the rules from
`/admin/activities`; instructors and learners never see them. A fresh install,
having no rules, admits nothing.

The work is complete when:

1. `activity_url_allowlist_rules` exists in PostgreSQL with `origin`,
   `path_prefix`, `description`, `is_enabled`, `created_by`, `updated_by`,
   timestamps, and a `unique (origin, path_prefix)` constraint, and holds no
   learner or instructor data;
2. seeds create no allowlist rules, so a seeded database denies every runtime
   registration until an administrator adds the first rule;
3. zero enabled rules — whether because none exist or because all are disabled —
   denies every new registration on all four admitting paths;
4. a candidate matches a rule only on an exact normalized origin plus either
   `/` or a path-segment-bounded subtree, with HTTPS required except for exactly
   `localhost` and `127.0.0.1` over HTTP;
5. a rule whose derived base URL exceeds 255 characters is rejected at creation;
6. re-submitting a base URL that normalizes onto an existing rule reports the
   existing rule rather than a unique-constraint error, and a disabled match can
   be re-enabled with its description and provenance intact;
7. only administrators holding `activity-url-allowlist:list` /
   `activity-url-allowlist:manage` can read or mutate rules, and the seeded
   Manager role holds both;
8. `ActivityRegistrationService` is the only writer of `activities` rows outside
   seeds and test fixtures, and the four superseded repository writers are
   deleted;
9. activity-code creation and editing resolve every submitted URL first,
   evaluate only those with no `activities` row, and change nothing at all when
   any prospective registration is denied;
10. a known activity — including one no current rule matches — may be associated
    with an activity code, restored after removal, and deep-linked, subject only
    to the code's own `url_prefix`;
11. two concurrent deep links registering the same allowed unseen URL both
    succeed and resolve to one winning `activities` row;
12. agent authorization creates an activity and an auth code only for an allowed
    unseen URL, and a denial returns the learner to their page with
    `error=unauthorized_client`;
13. no OAuth branch uses a `redirect_uri` as a destination unless it passes
    core's exported pure syntactic check; one that fails lands on `/agent/error`,
    which answers `200`, picks its copy from a closed slug union, and reflects no
    caller-supplied value into the DOM;
14. `claimAuthCode()` re-checks no policy;
15. a disallowed, malformed, over-long, or self-referencing cumulative target
    creates no activity, progress row, event, or line-item update, does not fail
    the submission, and is reported in `rejected_targets`;
16. self progress and allowed targets in that same submission commit;
17. `get-progress` and known cumulative targets query no policy;
18. every URL in one admission operation is evaluated against a single policy
    snapshot, and no admission path takes a lock against allowlist mutation;
19. `/admin/activities` lists, creates, edits, enables/disables and deletes
    rules, explains the deny-all empty state, and previews the count of existing
    activities that would sit outside the prospective policy, calling them
    grandfathered; and
20. `apps/agent` ships the `rejected_targets` response member with a changeset,
    and the five documents named in the analysis's handoff are updated.

## Non-Negotiable Contracts

Carried from the analysis. No task may weaken these.

- **Registration is an insert into `activities`, and nothing else.** Adding a
  row to `activity_activity_code` is categorization, not admission, and is never
  gated by the sitewide policy. Breaking this makes a routine description edit
  fail for an instructor whose code contains a grandfathered URL, and gives
  `activity_activity_code` a second meaning as a trust decision.
- **Grandfathering is global and unconditional.** Editing, disabling or deleting
  a rule must not delete an activity, drop an association, reject a token, block
  a read or write, or prevent a later association or deep link. Breaking this
  turns a configuration edit into a data-retention and live-access change with
  learner-support consequences the feature has no semantics for.
- **The policy is deny-by-default.** Zero enabled rules deny everything new.
  This deliberately supersedes `docs/DYNAMIC-ACTIVITIES.md`. Breaking this leaves
  a new installation accepting arbitrary redirect targets until someone happens
  to add a rule.
- **One writer.** `ActivityRegistrationService` is the only code path that
  inserts an `activities` row outside seeds and fixtures. Breaking this is how
  the four current writers drifted — three use `onConflictDoNothing` and one does
  not, one bounds the URL at 255 characters and one does not — and it is the only
  thing that makes "no bypasses" structural rather than per-review.
- **The registration service returns denials; it does not throw them.** The four
  callers need different outcomes from one decision. A service that threw would
  force the progress path into catch-and-continue, which is the exact shape that
  made its existing failures wrong.
- **No learner PII crosses the boundary, and diagnostics introduce none.** The
  warn-level denial log carries the normalized origin and path only — never
  learner identity, LMS context, tokens, auth codes, or PKCE values. The rules
  table holds no learner or instructor data.
- **`/agent/error` reflects nothing.** The value that reached that page is by
  definition one that failed validation. It must not be rendered, linked, or put
  in a query parameter. The diagnosis belongs in the server log.
- **`unauthorized_client`, never `access_denied`, for a denied registration.**
  The agent maps `access_denied` to `status: 'expired'` and prompts a re-launch,
  which for an unapproved activity loops the learner indefinitely.
  `unauthorized_client` is in the agent's accepted set and terminates.
- **A rejected target never fails the submission carrying it.** The target list
  comes from the page's authored markup, so failing the request would stop that
  page reporting progress permanently — including the learner's own valid self
  high-water mark. This is the defect being repaired for the two existing
  `ERR_VALIDATION` throws as well as the new denial.
- **The per-code `url_prefix` is an independent, additional constraint.** It
  stays where it is — the gradebook server actions and `handleDeepLink()`. It
  cannot broaden the sitewide policy, and the sitewide policy does not replace
  it.
- **This feature does not close the open redirect.** It removes the
  credentialed-host disguise, `javascript:`/`data:` destinations, and the current
  unhandled `500`. A bounce to an arbitrary https origin is knowingly retained.
  No task, commit message, PR description or doc edit may describe it as closed.
- **No backward compatibility is owed.** Modulus has no live deployments. No
  task may add a shim, fallback route, dual-write migration, policy backfill, or
  deprecation window.

## Decisions This Plan Makes

Resolved while planning, so the implementer does not reopen them. Items marked
**[review]** are not derived from the analysis and should be confirmed in review
of the first task that depends on them.

- **The new module is `packages/core/src/modules/activity-registration/`**, a
  sibling of `app`, `admin` and `agent`, composed in `core.ts` immediately before
  them so its context flows down to all three. `app/registration` already exists
  and is user sign-up, so the name must not be `registration`. **[review]**
- **The registration service takes the policy snapshot as an argument.**
  `loadPolicy()` reads the enabled rule set once; `register(url, policy)` is
  pure with respect to policy. This makes the single-snapshot rule a signature
  rather than a convention a caller can forget, and it is what lets a five-URL
  activity-code submission be evaluated coherently. **[review]**
- **`url_too_long` is the registration service's check, not the parser's.** The
  255-character bound belongs to `activities.url`, so it lives with the writer.
  The pure parser returns only `malformed_url`. **[review]**
- **The exported pure helper is named `isUsableRedirectUri`**, exported from
  `packages/core/src/index.ts` alongside `DEFAULT_SCOPE_ID`. The analysis fixes
  that it must be pure and core-owned; the name is this plan's. **[review]**
- **The admin create command returns a structured outcome rather than silently
  re-enabling.** `{ status: 'created' | 'already_enabled' | 'disabled_match', rule }`.
  The analysis requires that a normalizing collision "offer to re-enable"; an
  offer implies the administrator confirms, so the command reports the disabled
  match and the UI presents an explicit re-enable action that calls the update
  command. Silently re-enabling would be a mutation the administrator did not
  ask for. **[review]**
- **A malformed authorization request at step 2 bounces with
  `error=invalid_request`.** The analysis fixes that step 2 stops returning raw
  `400` JSON and bounces back with `state` and an error, and fixes the mapping
  for step 4 only. `invalid_request` is the RFC 6749 code for this condition and
  is already in the agent's `OAUTH_ERRORS` set. **[review]**
- **`apps/gradebook/src/modules/app/activities/@types/validate-urls.ts` is kept,
  not deleted.** It still performs the per-code `url_prefix` check, which the
  analysis explicitly leaves in the host, and it still gives the form immediate
  client-side feedback. Core's check is the enforcement boundary regardless.
- **`/agent` must be added to the proxy matcher exclusion in
  `apps/gradebook/src/proxy.ts`.** `/agent/error` is a chromeless page outside
  `[lng]`, exactly like `/lti/error`. Without the exclusion `withI18n` rewrites
  it to `/[lng]/agent/error` and it 404s. Excluding it also removes
  `withDeploymentMode`, so `app/agent/layout.tsx` must carry
  `assertSurfaceServed('frontend')`, as `app/lti/layout.tsx` does. The API
  handlers at `/routes/agent/*` are unaffected — they do not start with `/agent`.
  **[review]**
- **The changeset ships in this plan; the npm publish does not.** The analysis
  requires the agent change to ship "with a changeset, and follows
  `RELEASE-INSTRUCTIONS.md` rather than CI". Publishing is a local, manual,
  maintainer-authenticated operation and is not something a pull request
  performs. Task 14 adds the changeset; the release is a separate act. **[review]**
- **Documentation is one task in the final phase**, per the analysis's own
  "updating shipped documentation before the feature is implemented and accepted"
  exclusion. No earlier task edits `docs/`.

### Where the analysis and the code disagree

Stated here rather than silently resolved in either direction.

- **The analysis cites `route.ts:66` for the `client_id !== redirect_uri`
  check; it is at `apps/gradebook/src/app/routes/agent/authorize/route.ts:69`.**
  The behaviour described is exactly what the code does. Take the code's line
  number, the analysis's contract.
- **The analysis says the deep-link form's per-code prefix mapping is
  "unchanged"; the mechanism it describes is not the one in the code.**
  `apps/gradebook/src/modules/lti/actions/deep-linking-action.ts` maps the prefix
  violation to `errors.activity_url` by matching the error *message* with
  `/activity url must start with/i`, not by reading `result.error.code ===
  'ERR_DEEP_LINKING'`. Task 9 adds the `ERR_ACTIVITY_URL_NOT_ALLOWED` branch as a
  code check and leaves the existing regex branch alone. Converting the prefix
  branch to a code check is a reasonable cleanup, but it is not required by the
  analysis and is not authorised here.
- **`packages/core/src/modules/agent/activity-state/services/progress.itest.ts`
  asserts the behaviour this feature reverses.** Its `atomic rejection` describe
  block — "rolls the whole transaction back when an umbrella target is
  self-referential" and "rolls back when an umbrella target URL exceeds the
  length limit" — encodes the two durable authoring errors as whole-request
  failures. The analysis calls these a defect to repair. Task 13 rewrites both
  cases; they are not preserved as guards.

## Execution Rules

- Work on the existing `feat/activity-url-allowlist` branch, which already
  carries the analysis. Open one pull request against `develop` at Task 17. Do
  not merge as part of this plan.
- Complete tasks in order. After each task is committed, stop for independent
  review before starting the next.
- One focused conventional commit per task — lowercase, past tense, no trailers,
  no `-s`. Corrective commits for review findings belong to the task whose
  acceptance they repair.
- **Every task must leave the tree compiling, linted, and green.** No task may
  depend on a later one to restore the build. This is why the registration entry
  point is introduced with no callers (Phase 1), the callers are moved one at a
  time (Phase 3), and the superseded writers are deleted only after the last
  caller has moved (Phase 4).
- Behaviour tests ship in the same commit as the production change they cover.
- `pnpm lint` rewrites files. Use `pnpm lint:check` as the gate and let the
  `lint-staged` pre-commit hook format staged files.
- Test runners differ per package and are not interchangeable:
  - `packages/core` — `node:test` via `tsx`. `pnpm -F @modulus-learning/core test`
    (`*.test.ts`), `test:one <path>` for one file. Integration is separate:
    `pnpm -F @modulus-learning/core test:integration` (`*.itest.ts`) needs
    `modulus_test`; `pnpm test` does not run it.
  - `apps/gradebook` — vitest, `--mode=jsdom` for `*.test.ts(x)` and
    `--mode=node` for `*.test.node.ts(x)`.
  - `apps/agent` — vitest, same two modes.
- After a Drizzle schema change run
  `pnpm -F @modulus-learning/core drizzle:generate`, commit the generated SQL
  and `meta/` journal with the schema, and apply it locally with
  `drizzle:migrate`. The integration harness applies committed migrations, so an
  uncommitted migration fails `test:integration`, not just a manual step.

## Dependency Map

| Phase | Task | Depends on | Primary boundary |
| --- | --- | --- | --- |
| 1 | 1. Add the allowlist table and rule repository | approved analysis | database schema, migration, core repository |
| 1 | 2. Add the pure URL parser and matcher | — | core pure module |
| 1 | 3. Add the allowlist policy service and denial error | 1, 2 | core service, errors |
| 1 | 4. Add the shared registration entry point | 1, 2, 3 | core service, composition root |
| 2 | 5. Add admin allowlist abilities and commands | 3 | core admin module, seeds |
| 2 | 6. Build the `/admin/activities` rules surface | 5 | host server actions, admin UI |
| 3 | 7. Register activity-code URLs through the entry point | 4 | core activities service |
| 3 | 8. Surface denied URLs in the activity-code forms | 7 | host server actions, forms |
| 3 | 9. Register deep-link URLs through the entry point | 4 | core LTI service, host deep-link action |
| 3 | 10. Register OAuth redirect URIs through the entry point | 4 | core agent auth service |
| 3 | 11. Add the `/agent/error` page and route group | 2 | host page, layout, proxy matcher |
| 3 | 12. Reorder the authorization route and map OAuth errors | 2, 10, 11 | host route |
| 3 | 13. Reject cumulative targets per target | 4 | core progress service, schemas |
| 3 | 14. Report rejected targets in the agent library | 13 | agent package, changeset |
| 4 | 15. Delete the superseded activity writers | 7, 9, 10, 13 | core repositories |
| 5 | 16. Update shipped documentation | 1–15 | docs |
| 5 | 17. Full verification and pull request | 1–16 | acceptance |

Tasks 1 and 2 are mutually independent. Task 11 depends only on Task 2 and may
be done at any point after it. Tasks 5–6 (the admin surface) are independent of
all of Phase 3, and Tasks 9, 10 and 13 are mutually independent once Task 4
lands; the numbering is for review convenience.

---

## Phase 1 — Policy Storage And The Shared Seam

### Task 1 — Add The Allowlist Table And Rule Repository

Proposed commit: `feat(core): added the activity url allowlist rules table and repository`

The durable home for the policy. Nothing reads it yet; Task 3 does. Deliberately
leaves normalization and matching to Task 2 — this task stores an
already-normalized pair and does not decide what normalized means.

Files:

- add `packages/core/src/database/schema/source/activity-url-allowlist-rules.ts`;
- revise `packages/core/src/database/schema/index.ts`;
- add `packages/core/src/database/migrations/00NN_<generated>.sql` and the
  generated `meta/` journal entries;
- add `packages/core/src/modules/activity-registration/repository/index.ts`;
- add `packages/core/src/modules/activity-registration/repository/index.itest.ts`; and
- revise `packages/core/src/test-support/pg.ts`.

#### Schema

New table, following `activity-codes.ts` for the `created_by` reference shape
and `lti-lineitems.ts` for the named composite unique constraint:

```ts
export const activityUrlAllowlistRules = pgTable(
  'activity_url_allowlist_rules',
  {
    id: uuid('id').primaryKey().notNull(),
    origin: varchar('origin', { length: 255 }).notNull(),
    path_prefix: varchar('path_prefix', { length: 255 }).notNull().default('/'),
    description: varchar('description', { length: 1024 }),
    is_enabled: boolean('is_enabled').notNull().default(true),
    created_by: uuid('created_by').references(() => adminUsers.id, { onDelete: 'set null' }),
    updated_by: uuid('updated_by').references(() => adminUsers.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    unique('activity_url_allowlist_rules_origin_path_prefix_idx').on(
      table.origin,
      table.path_prefix
    ),
  ]
)
```

`created_by`/`updated_by` reference `admin_users`, **not** `users`. This is the
first correction to `docs/DYNAMIC-ACTIVITIES.md`'s proposal, and it is what makes
the table hold no learner or instructor data at all. `on delete set null` keeps a
rule alive when an administrator account is removed — a rule outliving its author
is correct; losing the rule is not.

`path_prefix` defaults to `'/'` rather than being nullable, so the uniqueness
constraint needs no `NULLS NOT DISTINCT` reasoning.

Export from `schema/index.ts` in alphabetical position beside
`activity-codes.js`.

**No seed file accompanies this table, and none is added later.** Its absence
from this task's `Files:` list is deliberate, not an omission: a seeded database
must start denying, so the first rule is added by an administrator through the UI
— which is also the shortest path to exercising that UI. Neither the Ximera
origins in `seeds/10_activities.ts` nor the loopback origins used by the
repository demos become rules. Nor may any migration infer trust by converting
historical activity origins into rules: existing rows are grandfathered already,
and auto-approving their origins would also approve unseen paths under them and
hide the administrator's decision.

#### Repository

`ActivityUrlAllowlistQueries` and `ActivityUrlAllowlistMutations`, both extending
`BaseService` with `super(deps.logger, 'core', 'activity-registration')`, in the
established `{ logger, utils, db }` constructor shape, every method `@method`
decorated and every Drizzle call `.catch(this.utils.wrapDbErrorNew())`.

Queries:

- `listRules(): Promise<AllowlistRuleRecord[]>` — every rule, enabled or not,
  ordered by `origin` then `path_prefix`, for the admin list;
- `listEnabledRules(): Promise<AllowlistRuleRecord[]>` — the policy snapshot;
- `findRuleById(id)`;
- `findRuleByBase(origin, path_prefix)` — the normalizing-collision lookup;
- `countActivitiesOutside(rules)` is **not** here. The grandfathering preview is
  computed in Task 5 from `listRules()` plus the existing activity catalog,
  because the match test is the pure matcher, not SQL. Putting it in SQL would be
  a second implementation of the matching contract.

Mutations: `createRule`, `updateRule` (description, `is_enabled`, `updated_by`),
`deleteRule`.

Add both classes to `TestRepos` in `test-support/pg.ts` and construct them in
`setupTestHarness()` alongside the existing repositories, so the integration
suite can exercise them.

#### Tests

`repository/index.itest.ts` (core, `node:test` via `tsx`, needs `modulus_test`):

- `createRule` stores an enabled rule and returns it with both provenance
  columns — proves the insert and the `admin_users` reference resolve;
- a second `createRule` for the same `(origin, path_prefix)` raises a unique
  violation — proves the constraint is live, which is the precondition for the
  collision handling in Task 5;
- `listEnabledRules` omits a disabled rule while `listRules` returns it — proves
  the two reads are genuinely different, since deny-all depends on the enabled
  read;
- `updateRule` flips `is_enabled` and sets `updated_by` without touching
  `description` or `created_by` — proves re-enable preserves provenance, which
  the analysis requires;
- deleting the referenced `admin_users` row leaves the rule with a null
  `created_by` — proves `on delete set null`, so removing an administrator cannot
  silently drop site policy.

Verification:

```sh
pnpm -F @modulus-learning/core drizzle:generate
pnpm -F @modulus-learning/core drizzle:migrate
pnpm -F @modulus-learning/core test:integration:one src/modules/activity-registration/repository/index.itest.ts
pnpm -F @modulus-learning/core test && pnpm -F @modulus-learning/core test:integration
pnpm typecheck && pnpm lint:check
```

---

### Task 2 — Add The Pure URL Parser And Matcher

Proposed commit: `feat(core): added the pure activity url matcher and redirect check`

The whole matching contract in one dependency-free module, so it can be tested
exhaustively without a database and called from the OAuth route without a second
core call. Deliberately knows nothing about rules in the database, the
255-character column bound, or activity codes.

Files:

- add `packages/core/src/modules/activity-registration/url-policy.ts`;
- add `packages/core/src/modules/activity-registration/url-policy.test.ts`; and
- revise `packages/core/src/index.ts`.

#### The Module

No imports from `@/lib/*`, no `BaseService`, no logger, no ctx. It is a set of
functions over strings and `URL`.

```ts
/** The stored form of one rule: a normalized origin and a normalized subtree root. */
export type NormalizedBaseUrl = { origin: string; path_prefix: string }

/**
 * Parses a candidate activity URL under the admission syntax: an absolute URL,
 * no username or password, https -- or http for exactly `localhost` and
 * `127.0.0.1`. Returns null for anything else, including `javascript:` and
 * `data:`, which `new URL()` and Zod's `z.url()` both accept.
 */
export const parseAdmissibleUrl = (value: string): URL | null

/**
 * The syntactic half of the matching contract, as a boolean. Consults no policy
 * and performs no I/O, so the authorization route can call it directly instead
 * of growing a second definition of the same rule.
 */
export const isUsableRedirectUri = (value: string): boolean

/** Normalizes an administrator's base-URL input to the stored pair. */
export const normalizeRuleBaseUrl = (
  value: string
): { ok: true; rule: NormalizedBaseUrl } | { ok: false; reason: 'malformed_url' }

/** The human-readable base URL derived from a stored pair, for API and UI responses. */
export const toBaseUrl = (rule: NormalizedBaseUrl): string

/** Pure candidate-to-rule match. Both sides already parsed/normalized. */
export const matchesRule = (candidate: URL, rule: NormalizedBaseUrl): boolean
```

`[::1]` is deliberately excluded from the loopback allowance. The gradebook's
existing form validator accepts only `localhost` and `127.0.0.1`, so admitting a
third value in core would create a URL a form rejects before core ever sees it.
Say so in a comment.

`matchesRule` is the one place the "deceptive prefix" defence lives. It must
compare `candidate.origin === rule.origin` — never `startsWith` on the origin,
which accepts `https://trusted.example.evil/` — and must require the path to
equal the rule path or continue at a segment boundary, never
`pathname.startsWith(path_prefix)`, which accepts `/course/calculus-2` under
`/course/calculus`. Normalize a rule's stored `path_prefix` so a trailing slash
does not change the answer, and drop query and fragment before comparing.

`normalizeRuleBaseUrl` returns the origin with no trailing slash, and a
`path_prefix` that always begins with `/`, so `https://example.edu` and
`https://example.edu/` produce the same pair — which is precisely why the
collision handling in Task 5 is needed.

Export `isUsableRedirectUri` from `packages/core/src/index.ts`. It is the only
member of this module that leaves core; the rest are internal.

#### Tests

`url-policy.test.ts` (core, `node:test` via `tsx`):

`parseAdmissibleUrl` / `isUsableRedirectUri`:

- accepts an ordinary `https://` URL with a path, query and fragment;
- accepts `http://localhost:3000/x` and `http://127.0.0.1/x`;
- rejects `http://content.example/x` — insecure remote HTTP;
- rejects `https://modulus.example@evil.example/` — proves the userinfo
  disguise is caught, which is the half of the open redirect this feature
  actually closes;
- rejects `https://user:pass@evil.example/`;
- rejects `javascript:alert(1)` and `data:text/html,x` — both parse cleanly under
  `new URL()` and pass `z.url()`, so this is the real filter;
- rejects `/relative/path` and `not-a-url`;
- rejects `http://[::1]/x` — a characterization guard, not a defect: it records
  the deliberate exclusion of IPv6 loopback so a later reader does not "fix" it
  into a mismatch with the host form validator. Name it accordingly.

`matchesRule`:

- a `/` rule admits every path on its origin;
- a subtree rule admits its own path and a descendant;
- a subtree rule rejects a sibling: `/course/calculus` does not admit
  `/course/calculus-2` — the path-boundary defect;
- a rule rejects a host that merely begins with the rule host:
  `https://trusted.example` does not admit `https://trusted.example.evil/` — the
  origin-prefix defect;
- a rule rejects an implicit subdomain: `https://example.edu` does not admit
  `https://www.example.edu`;
- a rule rejects a different scheme and a different explicit port;
- host comparison is case-insensitive, path comparison is case-sensitive;
- query string and fragment do not affect the result;
- dot segments normalize: `/course/calculus/../calculus-2` is not admitted by a
  `/course/calculus` rule.

`normalizeRuleBaseUrl` / `toBaseUrl`:

- `https://example.edu`, `https://example.edu/`, and
  `https://example.edu:443/` all normalize to the same pair;
- `https://example.edu/course/calculus` and the trailing-slash form normalize to
  the same pair — the round trip that makes collisions ordinary;
- `toBaseUrl` of a `/` rule is the bare origin.

Verification:

```sh
pnpm -F @modulus-learning/core test:one src/modules/activity-registration/url-policy.test.ts
pnpm -F @modulus-learning/core test
pnpm typecheck && pnpm lint:check
```

---

### Task 3 — Add The Allowlist Policy Service And Denial Error

Proposed commit: `feat(core): added the activity url allowlist policy service`

Puts the database rules and the pure matcher together behind one snapshot-plus-
evaluate interface, and declares the denial error the three failing callers will
raise. Still has no callers.

Files:

- add `packages/core/src/modules/activity-registration/errors.ts`;
- add `packages/core/src/modules/activity-registration/schemas.ts`;
- add `packages/core/src/modules/activity-registration/services/allowlist-policy.ts`; and
- add `packages/core/src/modules/activity-registration/services/allowlist-policy.test.ts`.

#### Errors

Following the form of `packages/core/src/modules/app/activities/errors.ts`, at
`warn` level — it is caused by user input, like every other `warn`-level domain
error in core:

```ts
export const ErrorCodes = {
  ACTIVITY_URL_NOT_ALLOWED: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
} as const

export const ERR_ACTIVITY_URL_NOT_ALLOWED = createCoreErrorType(
  ErrorCodes.ACTIVITY_URL_NOT_ALLOWED,
  'warn'
)
```

It lives here, not in `app/activities`, `app/lti` or `agent/auth`, because all
three raise it and none owns the concept.

Its `details` carry every rejected URL with its reason — a message string cannot
meet the requirement that a rejected submission name every offending URL:

```ts
details: { rejected: Array<{ url: string; reason: RegistrationDenialReason }> }
```

#### Schemas

```ts
export type RegistrationDenialReason =
  | 'activity_url_not_allowed' // no enabled rule matches an unseen URL
  | 'malformed_url' // not parseable as an admissible absolute URL
  | 'url_too_long' // exceeds the 255-character `activities.url` column

export type PolicySnapshot = { rules: NormalizedBaseUrl[] }
```

`PolicySnapshot` is a value, not a service handle. That is what lets a caller
hold one snapshot across five URLs.

#### Service

`AllowlistPolicyService extends BaseService`, constructor
`{ logger, queries: ActivityUrlAllowlistQueries }`:

- `loadPolicy(): Promise<PolicySnapshot>` — one `listEnabledRules()` read,
  normalizing each stored pair into the matcher's shape. Reads on every
  admission; **no process-local cache**, deliberately, so multi-instance edits
  are immediately coherent. Registration is rare relative to progress traffic,
  and existing targets never reach here. A cache would need an explicit
  cross-instance invalidation scheme it does not have.
- `evaluate(url: string, policy: PolicySnapshot): { ok: true; url: URL } | { ok: false; reason: 'malformed_url' | 'activity_url_not_allowed' }`
  — parse with `parseAdmissibleUrl`, then match against the snapshot.

An empty `policy.rules` denies. That must be the natural consequence of "no rule
matched", not a special case, and there must be no branch that treats the empty
set as permissive.

The `url_too_long` reason is not produced here; it belongs to the writer in
Task 4.

#### Tests

`allowlist-policy.test.ts` (core, `node:test` via `tsx`), with a hand-rolled
fake `queries` object as `agent-auth.test.ts` does:

- `loadPolicy` returns only enabled rules, normalized;
- `evaluate` denies every candidate when the snapshot is empty — deny-by-default,
  the contract that supersedes `docs/DYNAMIC-ACTIVITIES.md`;
- `evaluate` denies when rules exist but the snapshot came back empty because all
  are disabled;
- `evaluate` allows a candidate under a whole-origin rule and one under a subtree
  rule;
- `evaluate` returns `activity_url_not_allowed` for a sibling path and a
  deceptive host prefix — thin integration over Task 2's exhaustive cases,
  proving the service actually calls the matcher rather than its own comparison;
- `evaluate` returns `malformed_url` for `javascript:` and for a bare string;
- `loadPolicy` is called once per operation and `evaluate` performs no further
  reads — assert the fake's call count, which is what makes the single-snapshot
  rule testable at all.

Verification:

```sh
pnpm -F @modulus-learning/core test:one src/modules/activity-registration/services/allowlist-policy.test.ts
pnpm -F @modulus-learning/core test
pnpm typecheck && pnpm lint:check
```

---

### Task 4 — Add The Shared Registration Entry Point

Proposed commit: `feat(core): added the shared activity registration entry point`

The seam the whole feature hangs on: one place that resolves a URL, evaluates it
if unseen, inserts it, and survives the create race. Composed at the root so all
three actor domains can reach it. Still called by nobody — Phase 3 moves the four
paths onto it, and Phase 4 deletes what they used before.

Files:

- revise `packages/core/src/modules/activity-registration/repository/index.ts`;
- add `packages/core/src/modules/activity-registration/services/activity-registration.ts`;
- add `packages/core/src/modules/activity-registration/services/activity-registration.test.ts`;
- add `packages/core/src/modules/activity-registration/services/activity-registration.itest.ts`;
- add `packages/core/src/modules/activity-registration/index.ts`;
- revise `packages/core/src/core.ts`; and
- revise `packages/core/src/test-support/pg.ts`.

#### Repository

Add the activity reads and the one write to
`ActivityUrlAllowlistQueries`/`Mutations` — or, if the implementer prefers,
a second pair in the same file. Either way the write must be:

```ts
@method
async insertActivity(url: string): Promise<ActivityRecord | undefined> {
  const [activity] = await this.db
    .get()
    .insert(activities)
    .values({ id: uuidv7(), url })
    .onConflictDoNothing({ target: activities.url })
    .returning()
    .catch(this.utils.wrapDbErrorNew())

  return activity
}
```

`onConflictDoNothing` is not optional. Two instructors deep linking the same new
URL at the same moment is ordinary behaviour; the current
`ActivityMutations.createActivity()` surfaces it as a unique-constraint error.
Handling it once here is the point of the seam.

Also add `findActivityByUrl(url)`, so this service resolves without borrowing
another module's repository.

#### Service

`ActivityRegistrationService extends BaseService`, constructor
`{ logger, queries, mutations, policy: AllowlistPolicyService }`.

```ts
export type RegistrationOutcome =
  | { ok: true; activity: ActivityRecord }
  | { ok: false; url: string; reason: RegistrationDenialReason }

@method
async loadPolicy(): Promise<PolicySnapshot>

@method
async register(url: string, policy: PolicySnapshot): Promise<RegistrationOutcome>
```

`register` in order:

1. `findActivityByUrl(url)` — a hit returns `{ ok: true }` immediately, with **no
   policy evaluation**. This is grandfathering, and it is why the service resolves
   before it evaluates rather than the other way round;
2. `url.length > 255` → `{ ok: false, reason: 'url_too_long' }`. The bound is
   `activities.url`'s column width; a longer URL cannot be stored, and today
   `createAuthCode` lets it fail as a database error instead;
3. `policy.evaluate(url, policy)` → on failure, return its reason;
4. `insertActivity(url)` → on a returned row, `{ ok: true }`;
5. the insert returned nothing, so a concurrent create won: re-read by URL and
   return the winning row. If the re-read also misses, that is genuinely
   unhandled — raise `ERR_UNHANDLED`, as `resolveTarget()` does today.

**It returns denials; it does not throw them.** Only step 5's impossible state
throws. Each caller decides what a denial means for its own surface.

On a denial in step 3, log one `warn`-level line carrying the normalized origin
and path only. No learner identity, LMS context, token, auth code, or PKCE value
may appear in it. Say so in a comment beside the call.

`register` deliberately does **not** own: activity-code association (only two
callers need it, and the analysis defines it as not registration); the per-code
`url_prefix` check (instructor-only, and explicitly out of scope for core); or
the self-reference check (progress-only, since it needs the reporting activity's
id — the progress caller applies it before calling).

#### Composition

`modules/activity-registration/index.ts`:

```ts
export const createActivityRegistrationRegistry = () =>
  new Registry()
    .addClass('queries', ActivityUrlAllowlistQueries)
    .addClass('mutations', ActivityUrlAllowlistMutations)
    .addClass('policy', AllowlistPolicyService)
    .addClass('service', ActivityRegistrationService)
```

In `core.ts`, add
`.addNested('activityRegistration', createActivityRegistrationRegistry())`
**after** `.addFactory('mailer', createMailer)` and **before**
`.addNested('app', createAppRegistry())`. Ordering is load-bearing and
compile-checked: `compose()` walks providers in insertion order and each sees
only what came before, so a registry nested after `app` could not be injected
into an app service. Getting it wrong is a `typecheck` failure at the `addNested`
call site, not a runtime one.

It is **not** projected into `CoreCommands`. It is internal domain logic, not an
actor-facing command surface; the admin commands in Task 5 are the only public
door to any of it.

Add the service to `TestServices` in `test-support/pg.ts` and construct it in
`setupTestHarness()`, so Phase 3's integration tests can drive it.

#### Tests

`activity-registration.test.ts` (core, `node:test` via `tsx`), fake queries and
mutations:

- a known URL returns `ok` without consulting the policy — assert the policy fake
  was never called. This is the grandfathering contract, and asserting the
  *absence* of the call is the only way to prove it;
- an unseen allowed URL inserts once and returns the new row;
- an unseen disallowed URL returns `activity_url_not_allowed` and performs **no
  insert** — assert the mutation fake's call count is zero;
- a 256-character URL returns `url_too_long` before any policy evaluation or
  insert;
- a `javascript:` URL returns `malformed_url` with no insert;
- an empty snapshot denies an unseen URL;
- the denial log line contains the origin and path and contains neither a user id
  nor a token — a PII guard on the diagnostic, which is a boundary the analysis
  names explicitly.

`activity-registration.itest.ts` (core integration, needs `modulus_test`):

- registering the same unseen allowed URL from two concurrent calls yields one
  `activities` row and two successful outcomes — the create race, over real
  PostgreSQL, since the winning-row re-read cannot be proved against a fake;
- a rule disabled between `loadPolicy()` and `register()` still admits the URL —
  the accepted registration race, recorded as intended behaviour so a later
  reader does not add serialization. Name it as a characterization guard.

Verification:

```sh
pnpm -F @modulus-learning/core test:one src/modules/activity-registration/services/activity-registration.test.ts
pnpm -F @modulus-learning/core test:integration:one src/modules/activity-registration/services/activity-registration.itest.ts
pnpm -F @modulus-learning/core test && pnpm -F @modulus-learning/core test:integration
pnpm typecheck && pnpm lint:check
```

---

## Phase 2 — The Administrator Surface

### Task 5 — Add Admin Allowlist Abilities And Commands

Proposed commit: `feat(admin): added activity url allowlist rule commands`

Gives administrators — and only administrators — a way to read and change site
trust policy. Deliberately leaves the UI to Task 6 and touches no admitting path.

Files:

- add `packages/core/src/modules/admin/activity-url-allowlist/schemas.ts`;
- add `packages/core/src/modules/admin/activity-url-allowlist/services/activity-url-allowlist.ts`;
- add `packages/core/src/modules/admin/activity-url-allowlist/services/activity-url-allowlist.test.ts`;
- add `packages/core/src/modules/admin/activity-url-allowlist/commands.ts`;
- revise `packages/core/src/modules/admin/index.ts`;
- revise `packages/core/src/modules/activity-registration/repository/index.ts`; and
- revise `packages/core/src/database/seeds/03_admin_permissions.ts`.

#### Abilities

Two, not five:

- `activity-url-allowlist:list`
- `activity-url-allowlist:manage` — create, edit, enable/disable, delete

This departs from the per-verb convention of `lti-platforms:list` /
`admin-roles:create|edit|delete`, and the reason is specific to this resource:
because a submitted base URL that normalizes onto an existing disabled rule
resolves into an edit, an administrator holding `create` without `edit` would hit
a dead end on an ordinary submission with no way to express what they asked for.
Mutating the allowlist is one capability here, so it is one ability. Record that
in a comment above the ability constants.

Grant both to the seeded Manager role in `03_admin_permissions.ts`, beside its
existing `lti-platforms:*` grants. Do **not** grant them to the User or Guest
roles. Note in the commit body — not in code — that an existing database gains
these only by re-seeding; the data migration for a live database is explicitly
out of scope.

#### Service And Commands

`AdminActivityUrlAllowlistService`, constructor
`{ logger, queries, mutations, policy }` where the last three come from the
root-composed `activityRegistration` context. Commands use `mode: 'admin'` and
`assertAdminAbilities`, so an instructor access token cannot reach them even if
an ability string were duplicated across actor domains.

- `listAllowlistRules` (`:list`) — every rule with its derived base URL from
  `toBaseUrl`, its enabled state, description, provenance and timestamps.
- `previewAllowlistImpact` (`:list`) — given a prospective rule set, the count of
  existing `activities` rows matching no enabled rule, plus a bounded sample.
  Computed in the service using `matchesRule`, not in SQL: a SQL reimplementation
  would be a second definition of the matching contract and would drift from
  Task 2 exactly as the host's own URL validator already has.
- `createAllowlistRule` (`:manage`) — see the outcome contract below.
- `updateAllowlistRule` (`:manage`) — description and `is_enabled`, setting
  `updated_by`. Never rewrites `origin`/`path_prefix`: changing the base URL is a
  different rule, so it is a delete plus a create.
- `deleteAllowlistRule` (`:manage`).

`createAllowlistRule` input is one absolute base URL plus an optional
description. It must:

1. `normalizeRuleBaseUrl(input)` — a failure is `ERR_VALIDATION`;
2. reject a derived base URL over 255 characters with `ERR_VALIDATION`,
   **independently of the per-column widths**. `activities.url` is
   `varchar(255)`, so a longer rule could never match a storable activity URL: it
   would be accepted, listed, and permanently inert. Neither column width can
   express this, since either can be within its own bound while the pair is not;
3. `findRuleByBase(origin, path_prefix)` and branch on what it finds.

The outcome, rather than an insert-or-explode:

```ts
type CreateAllowlistRuleResult =
  | { status: 'created'; rule: AllowlistRule }
  | { status: 'already_enabled'; rule: AllowlistRule }
  | { status: 'disabled_match'; rule: AllowlistRule }
```

Raising `ERR_UNIQUE_CONSTRAINT` at an administrator is the wrong answer — they
asked for a state, not for an insert. `already_enabled` means the requested state
already holds and nothing changes. `disabled_match` reports the existing row so
the UI can offer to re-enable it through `updateAllowlistRule`, which preserves
its description and provenance rather than discarding them.

The commands must **never** mutate `activities` or `activity_activity_code`. A
rule change is a policy change and nothing else; that is the grandfathering
contract.

#### Registry

In `admin/index.ts`, add `createActivityUrlAllowlistRegistry()` with
`.addClass('service', ...)` and `.addClass('commands', ...)` — no repository of
its own, since it consumes the root-composed one — nest it as
`activityUrlAllowlist`, and project it into `getAdminCommands`.

#### Tests

`activity-url-allowlist.test.ts` (core, `node:test` via `tsx`), fake queries and
mutations:

- creating a new base URL returns `created` and inserts one normalized pair;
- creating `https://example.edu/course/calculus/` when
  `https://example.edu/course/calculus` is already enabled returns
  `already_enabled` and performs **no** write — the normalizing collision, which
  is the whole reason the ability is not split;
- the same against a disabled rule returns `disabled_match`, still with no write,
  and the returned rule carries the original description and `created_by`;
- a 260-character derived base URL is rejected with `ERR_VALIDATION` while both
  columns are individually within bounds — the pair-length rule the column widths
  cannot express;
- `javascript:evil` and a relative path are rejected with `ERR_VALIDATION`;
- `updateAllowlistRule` disabling a rule sets `updated_by` and leaves
  `description` and `created_by` untouched;
- `previewAllowlistImpact` counts an activity whose URL matches no enabled rule
  and excludes one that matches — the grandfathering preview;
- **no mutation of `activities` or `activity_activity_code` occurs on create,
  update or delete.** A characterization guard, not coverage of a defect: the
  service has no such dependency, so the assertion is that it never gains one.
  Name it that way.

Command authorization is enforced by `createCommand`'s shared pipeline, which is
already covered; do not re-test the framework. What this task must not do is omit
the abilities from the command declarations — `typecheck` will not catch that.

Verification:

```sh
pnpm -F @modulus-learning/core test:one src/modules/admin/activity-url-allowlist/services/activity-url-allowlist.test.ts
pnpm -F @modulus-learning/core test && pnpm -F @modulus-learning/core test:integration
pnpm typecheck && pnpm lint:check
```

---

### Task 6 — Build The `/admin/activities` Rules Surface

Proposed commit: `feat(admin): built the activity url allowlist admin surface`

Turns the existing `/admin/activities` placeholder into the rule manager. The
analysis requires the surface to explain deny-all and grandfathering; that copy
is the feature, not decoration, because the whole risk of this design is an
administrator mistaking rule removal for revocation.

Files:

- add `apps/gradebook/src/modules/admin/activity-url-allowlist/@types/index.ts`;
- add `apps/gradebook/src/modules/admin/activity-url-allowlist/list.ts`;
- add `apps/gradebook/src/modules/admin/activity-url-allowlist/create.ts`;
- add `apps/gradebook/src/modules/admin/activity-url-allowlist/edit.ts`;
- add `apps/gradebook/src/modules/admin/activity-url-allowlist/delete.ts`;
- add `apps/gradebook/src/modules/admin/activity-url-allowlist/components/list-view.tsx`;
- add `apps/gradebook/src/modules/admin/activity-url-allowlist/components/create-form.tsx`;
- add `apps/gradebook/src/modules/admin/activity-url-allowlist/components/edit-form.tsx`;
- add `apps/gradebook/src/modules/admin/activity-url-allowlist/components/create-form.test.tsx`;
- revise `apps/gradebook/src/app/[lng]/(admin)/admin/(auth)/activities/page.tsx`;
- add `apps/gradebook/src/app/[lng]/(admin)/admin/(auth)/activities/add/page.tsx`; and
- add `apps/gradebook/src/app/[lng]/(admin)/admin/(auth)/activities/[id]/edit/page.tsx`.

Follow `apps/gradebook/src/modules/admin/admin-roles/` exactly: one server-action
file per verb, each resolving `getCoreAdminRequestContext()` and calling a single
command, with the flash cookie and `redirect()` on success. No domain logic in
the pages or the actions — they resolve a context and call a command, and the
`/admin/activities` route group is already covered by the admin session and
deployment-mode middleware.

Required copy, stated because it is a contract rather than a design preference:

- **Empty state.** State prominently that no rules exist and that Modulus is
  therefore refusing to register any new activity URL, and that a developer or
  operator adds the first rule here. A seeded database starts in this state
  deliberately — seeds add no rules, not even the Ximera origins in
  `seeds/10_activities.ts` or the loopback origins used by the repository demos.
- **Delete and disable confirmation.** Use the analysis's language, not "block"
  or "disable activity":

  > This change stops previously unseen URLs under this base URL from being
  > registered. Existing activities will continue to work and may still be added
  > to activity codes or used in new deep links.

  Show the `previewAllowlistImpact` count beside it, and call those activities
  **grandfathered** — never invalid, disabled, or noncompliant.
- **Collision handling.** On `already_enabled`, say a rule for this base URL
  already exists and change nothing. On `disabled_match`, show the existing rule
  with its description and offer an explicit re-enable action that calls
  `updateAllowlistRule`. Neither is an error state.

The form takes one absolute base URL. It may describe the whole-origin form as a
domain rule, but it must submit an absolute URL — core always receives one.

#### Tests

`create-form.test.tsx` (gradebook, vitest `--mode=jsdom`):

- renders the deny-all empty-state explanation when the rule list is empty —
  the mitigation for "deny-all surprises a new operator", so its absence is a
  defect, not a cosmetic gap;
- renders the grandfathering sentence on the delete confirmation, and does not
  render the words "block" or "disabled activity";
- renders the `already_enabled` and `disabled_match` outcomes as informational,
  not as errors.

Client-side URL feedback in this form is convenience only. Core is the
enforcement boundary and re-validates everything; nothing here may be the final
decision.

Verification:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=jsdom src/modules/admin/activity-url-allowlist/components/create-form.test.tsx
pnpm -F @modulus-learning/gradebook test
pnpm typecheck && pnpm lint:check
```

---

## Phase 3 — Move The Admitting Paths Onto The Entry Point

### Task 7 — Register Activity-Code URLs Through The Entry Point

Proposed commit: `feat(core): enforced the activity url allowlist on activity code writes`

`createActivityCode` and `updateActivityCode` become resolve-then-evaluate, and
atomic on denial. The naive implementation is wrong in a specific way: requiring
the whole submitted set to match current rules would make a harmless description
edit fail until the instructor also deleted every grandfathered URL from their
own code.

Files:

- revise `packages/core/src/modules/app/activities/services/activity.ts`;
- revise `packages/core/src/modules/app/index.ts`;
- add `packages/core/src/modules/app/activities/services/activity.test.ts`; and
- add `packages/core/src/modules/app/activities/services/activity.itest.ts`.

#### Service

Inject the registration service into `ActivityService`'s constructor as
`activityRegistration: { service: ActivityRegistrationService }`, mirroring how
`LtiDeepLinkingService` already receives `activities: { queries, mutations }`
across module boundaries. Add it to `createActivityRegistry()` in
`app/index.ts` — the registry is compile-time checked, so a missing or misordered
entry fails `typecheck`.

Replace `this.mutations.ensureActivitiesExist(urls)` in both methods with, inside
the existing `withTransaction`:

1. `const policy = await this.registration.loadPolicy()` — **once**, before the
   loop. Five unseen URLs must not be evaluated under two different policies; the
   result would be a partial admission, or a rejection naming an arbitrary
   subset, that the instructor cannot act on;
2. `register(url, policy)` for each submitted URL, collecting outcomes;
3. if any outcome is a denial, throw `ERR_ACTIVITY_URL_NOT_ALLOWED` with
   `details.rejected` listing **every** rejected URL and its reason, before any
   write. The transaction rolls back, so neither the code, its first member, the
   unseen activities, nor any association is created. No partial registration is
   useful here: a code saved with only the approved subset would differ silently
   from the instructor's form;
4. otherwise use the returned activity rows for
   `assignActivitiesToActivityCode`, replacing the current
   `findActivitiesByURL(urls)` round trip.

`updateActivityCode` keeps its existing remove-all-then-recreate association
behaviour. No association-delta calculation is needed: a known activity is
associated without any sitewide check, whether the association is retained, new,
or being restored after removal, so the delta has no bearing on the policy.
Removals are always allowed.

Leave the `// TODO: Validate urls, here and in createActivityCode` comment's
subject alone — the host's per-code prefix check stays in the host by explicit
decision — but delete the commented-out `validateUrls` block it wraps, which
this task supersedes.

#### Tests

`activity.test.ts` (core, `node:test` via `tsx`) — this service has no test file
today, so keep the new one narrow and about this change:

- `createActivityCode` with all-known URLs succeeds when the policy is empty —
  grandfathered URLs need no evaluation, the mitigation for "an instructor cannot
  save an unrelated edit";
- `createActivityCode` with one unseen allowed URL creates the activity and the
  association;
- `createActivityCode` with two unseen disallowed URLs throws
  `ERR_ACTIVITY_URL_NOT_ALLOWED` whose `details.rejected` names **both**, not the
  first — the requirement that a rejected submission identify every offending
  URL;
- `updateActivityCode` on a code containing a grandfathered URL succeeds when
  only the description changed and the policy now matches nothing — the exact
  regression the resolve-first ordering exists to prevent;
- `updateActivityCode` restoring a previously removed known activity succeeds
  with an empty policy;
- `loadPolicy` is called exactly once for a submission carrying five URLs.

`activity.itest.ts` (core integration):

- a denied `createActivityCode` leaves no `activity_codes`, no
  `activity_code_member`, no `activities` and no `activity_activity_code` row —
  atomicity over a real transaction, which a fake cannot demonstrate.

Verification:

```sh
pnpm -F @modulus-learning/core test:one src/modules/app/activities/services/activity.test.ts
pnpm -F @modulus-learning/core test:integration:one src/modules/app/activities/services/activity.itest.ts
pnpm -F @modulus-learning/core test && pnpm -F @modulus-learning/core test:integration
pnpm typecheck && pnpm lint:check
```

---

### Task 8 — Surface Denied URLs In The Activity-Code Forms

Proposed commit: `feat(activities): showed denied activity urls on the activity code forms`

Core now rejects; the instructor currently sees "There was an error submitting
your activity code." `ActivityCodeFormState.errors.urls` already exists as
`string[]` and is never populated or rendered — this task closes both halves.

Files:

- revise `apps/gradebook/src/modules/app/activities/create-activity-code.ts`;
- revise `apps/gradebook/src/modules/app/activities/update-activity-code.ts`;
- revise `apps/gradebook/src/modules/app/activities/components/create-activity-code-form.tsx`;
- revise `apps/gradebook/src/modules/app/activities/components/update-activity-code-form.tsx`;
- add `apps/gradebook/src/modules/app/activities/create-activity-code.test.node.ts`; and
- add `apps/gradebook/src/modules/app/activities/components/update-activity-code-form.test.tsx`.

#### Server Actions

Both actions already log `result.error` and return a generic message. Add, before
that fallback:

```ts
if (result.error.code === 'ERR_ACTIVITY_URL_NOT_ALLOWED') {
  const rejected = /* read result.error.details.rejected */
  return {
    errors: { urls: [`This Modulus site does not allow these activity URLs: ${…}. Contact a Modulus administrator to request access.`] },
    message: 'Some activity URLs are not allowed.',
    status: 'failed',
  }
}
```

No host reads `result.error.details` anywhere today, so this is the first such
read; type the access defensively rather than asserting the shape.

The message may echo the URLs the instructor submitted. It must **not** disclose
the allowlist, the currently approved base URLs, administrator identity, or any
unrelated rule. That is a resolved decision, not a UI preference.

#### Forms

Both forms already render `formState.message` in an `ErrorText` but drop
`formState.errors`. Feed `formState.errors?.urls` into the `TextArea`'s existing
`error` / `errorText` props alongside the client-side `urlError` state, so the
denial appears beside the URL field rather than only in the banner. Keep the
client-side `validateUrls` feedback: it still enforces the per-code prefix and it
is not the enforcement boundary either way.

#### Tests

`create-activity-code.test.node.ts` (gradebook, vitest `--mode=node`), mocking
`@/core-adapter` as `routes/agent/authorize/route.test.node.ts` does:

- an `ERR_ACTIVITY_URL_NOT_ALLOWED` result populates `errors.urls` with every
  rejected URL from `details.rejected`;
- that message names no rule and no base URL other than the ones submitted — a
  disclosure guard on the instructor-visibility decision;
- any other error code still returns the generic failure, unchanged.

`update-activity-code-form.test.tsx` (gradebook, vitest `--mode=jsdom`):

- a form state carrying `errors.urls` renders it against the URL field.

Verification:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=node src/modules/app/activities/create-activity-code.test.node.ts
pnpm -F @modulus-learning/gradebook test
pnpm typecheck && pnpm lint:check
```

---

### Task 9 — Register Deep-Link URLs Through The Entry Point

Proposed commit: `feat(lti): enforced the activity url allowlist on deep linking`

Deep linking is the same admission as the activity-code edit page, and must use
the same policy — otherwise an instructor bypasses the creation gate by typing an
unseen disallowed URL into Canvas. Moving it onto the entry point also fixes its
create race, which is the one writer today that does not use
`onConflictDoNothing`.

Files:

- revise `packages/core/src/modules/app/lti/services/deep-link.ts`;
- revise `packages/core/src/modules/app/index.ts`;
- revise `packages/core/src/modules/app/lti/services/deep-link.test.ts`;
- add `packages/core/src/modules/app/lti/services/deep-link.itest.ts`; and
- revise `apps/gradebook/src/modules/lti/actions/deep-linking-action.ts`.

#### Service

Inject the registration service into `LtiDeepLinkingService` and add it to
`createLtiRegistry()`. Replace:

```ts
let activity = await this.activityQueries.findActivityByURL(activity_url)
if (activity == null) {
  activity = await this.activityMutations.createActivity({ id: uuidv7(), url: activity_url })
}
```

with a single `register(activity_url, await loadPolicy())`, throwing
`ERR_ACTIVITY_URL_NOT_ALLOWED` with `details.rejected` on a denial — before the
content item is built, so no signed content item is returned to Canvas.

**Ordering matters and must not be rearranged.** The per-code `url_prefix` check
stays exactly where it is, ahead of registration:

```text
sitewide allowlist AND activity-code url_prefix
```

Both apply to an unseen URL. A *known* grandfathered activity skips the sitewide
check but still must satisfy the prefix — the prefix is an independent,
instructor-managed curriculum constraint, and moving it into core is explicitly
out of scope.

`assignActivitiesToActivityCode` stays where it is and stays unguarded. Linking a
grandfathered activity into a new Canvas context is a deliberate consequence of
activity-level admission, not an oversight.

#### Route Wiring

In `deep-linking-action.ts`, add a branch on `result.error.code ===
'ERR_ACTIVITY_URL_NOT_ALLOWED'` mapping to `errors.activity_url`, with the same
"contact a Modulus administrator" wording as Task 8. The form must map **two**
codes to that field; missing the second renders a policy denial as a generic
"An error occurred."

Note what this action actually does today: it maps the per-code prefix violation
by matching the error *message* with `/activity url must start with/i`, not by
reading its code. Leave that branch alone. Converting it to a code check is
reasonable but is not required by the analysis and is not authorised here.

#### Tests

`deep-link.test.ts` (core, `node:test` via `tsx`) — extend the existing file:

- an unseen allowed URL creates the activity, associates it, and returns a
  content item;
- an unseen disallowed URL throws `ERR_ACTIVITY_URL_NOT_ALLOWED` and returns
  **no** content item — assert the keystore signer was never called, since "did
  not return a content item" is otherwise indistinguishable from a thrown error;
- a known grandfathered URL under an empty policy is associated and linked
  successfully;
- a known grandfathered URL that violates the code's `url_prefix` still throws
  `ERR_DEEP_LINKING` — the prefix survives grandfathering;
- an unseen URL that satisfies the allowlist but violates the prefix throws
  `ERR_DEEP_LINKING` and creates no activity — proves the two rules are ANDed and
  that the prefix check runs first.

`deep-link.itest.ts` (core integration):

- two concurrent `handleDeepLink` calls for the same unseen allowed URL both
  succeed and leave exactly one `activities` row. This is the race that surfaces
  a unique-constraint error today; it needs real PostgreSQL.

Verification:

```sh
pnpm -F @modulus-learning/core test:one src/modules/app/lti/services/deep-link.test.ts
pnpm -F @modulus-learning/core test:integration:one src/modules/app/lti/services/deep-link.itest.ts
pnpm -F @modulus-learning/core test && pnpm -F @modulus-learning/core test:integration
pnpm -F @modulus-learning/gradebook test
pnpm typecheck && pnpm lint:check
```

---

### Task 10 — Register OAuth Redirect URIs Through The Entry Point

Proposed commit: `feat(agent): enforced the activity url allowlist on oauth authorization`

`createAuthCode()` currently calls `createActivity()` unconditionally on a miss,
so any redirect URI a learner's page supplies becomes a registered activity. This
task gates that. The route half is Task 12; this task changes core only, and the
route's existing generic failure handling keeps the tree green in between.

Files:

- revise `packages/core/src/modules/agent/auth/services/agent-auth.ts`;
- revise `packages/core/src/modules/agent/index.ts`; and
- revise `packages/core/src/modules/agent/auth/services/agent-auth.test.ts`.

#### Service

Inject the registration service into `AgentAuthService` and add it to
`createAuthRegistry()`. Replace:

```ts
const activity = await this.queries.findActivityByUrl(redirect_uri)
if (!activity) {
  await this.mutations.createActivity(redirect_uri)
}
```

with `register(redirect_uri, await this.registration.loadPolicy())`, throwing
`ERR_ACTIVITY_URL_NOT_ALLOWED` on a denial so that **neither an activity nor an
authorization code is created**.

Order is load-bearing and stated in the analysis: evaluate, create the activity,
then create the auth code. No transaction is required — the activity is committed
before the code that names it, so no interleaving yields a code the agent cannot
exchange, and a failure after the insert leaves only a bare activity row, a state
this design already tolerates. A concurrent create of the same allowed URL
resolves to the winning row inside `register` and remains successful.

The activity is **not** associated with any activity code. The allowlist
expresses site trust, not curriculum ownership.

`claimAuthCode()` is unchanged and must stay unchanged. The activity exists by
the time it runs, and a rule removed between authorization and token exchange
does not revoke the admission. Its single-use code, client id, redirect URI,
PKCE, enabled-user, activity and scope validations all remain.

The unbounded `redirect_uri: z.string()` in `auth/schemas.ts` stays as it is —
`register` now bounds it at 255 characters and returns `url_too_long` rather than
letting it fail as a database error.

#### Tests

`agent-auth.test.ts` (core, `node:test` via `tsx`) — extend the existing file:

- revise `'creates an unknown activity before issuing an authorization code'` so
  the policy admits the URL; it keeps asserting the ordering;
- revise `'issues an authorization code when another request wins the activity
  create race'` to drive the race through the registration fake; the assertion is
  unchanged;
- new: a disallowed unseen `redirect_uri` throws `ERR_ACTIVITY_URL_NOT_ALLOWED`
  and creates **no** auth code — assert the auth-code mutation fake was never
  called, because "no activity" and "no auth code" are two separate obligations;
- new: a known grandfathered `redirect_uri` under an empty policy issues a code —
  ordinary use of an admitted activity is never re-checked;
- new: a 256-character `redirect_uri` is rejected with
  `ERR_ACTIVITY_URL_NOT_ALLOWED` carrying `url_too_long`, rather than reaching
  the database;
- new: `claimAuthCode` succeeds for an activity no current rule matches — a
  characterization guard on "token exchange does not re-check a successfully
  admitted activity". Name it that way: it proves nothing about today, and exists
  to fail loudly if someone later adds a policy call there.

Verification:

```sh
pnpm -F @modulus-learning/core test:one src/modules/agent/auth/services/agent-auth.test.ts
pnpm -F @modulus-learning/core test && pnpm -F @modulus-learning/core test:integration
pnpm typecheck && pnpm lint:check
```

---

### Task 11 — Add The `/agent/error` Page And Route Group

Proposed commit: `feat(agent): added the modulus-owned agent error page`

The dead end for a `redirect_uri` with no safe interpretation. Added before the
route that redirects to it, so no commit leaves the route pointing at a page that
does not exist.

Files:

- add `apps/gradebook/src/app/agent/layout.tsx`;
- add `apps/gradebook/src/app/agent/error/page.tsx`;
- add `apps/gradebook/src/app/agent/error/page.test.node.tsx`;
- add `apps/gradebook/src/modules/agent/error-slug.ts`; and
- revise `apps/gradebook/src/proxy.ts`.

#### Proxy And Layout

`/agent` is a new top-level route group and must be added to the matcher
exclusion in `proxy.ts` — `…|images|lti|_next/static|…` becomes
`…|images|lti|agent|_next/static|…`. Without it `withI18n` rewrites
`/agent/error` to `/[lng]/agent/error`, which does not exist, and the learner
gets a 404 instead of the error page. The API handlers under `/routes/agent/*`
are unaffected: they do not start with `/agent`.

The exclusion also removes `withDeploymentMode` from this path, so
`app/agent/layout.tsx` must carry `assertSurfaceServed('frontend')` and
`export const dynamic = 'force-dynamic'` — exactly the arrangement, and for
exactly the reason, documented in `app/lti/layout.tsx`. Copy that layout's
chromeless shell and its comment.

#### The Page

Modelled on `apps/gradebook/src/app/lti/error/page.tsx` — the pattern, not the
page. `/lti/error`'s slug union is the closed set of *launch* failures and its own
comment requires every future code to be classified there deliberately, so this
gets its own union rather than extending that one:

```ts
export type AgentErrorSlug = 'invalid_request' | 'server_error'
```

`invalid_request` is the unusable `redirect_uri`. `server_error` is the default
for an unknown or absent slug, following `/lti/error`'s reasoning that an outage
must never blame the learner's course link.

Learner-facing copy for `invalid_request`, in the register the existing page
uses:

> **Launch Error** — This activity could not be connected to Modulus. Your work
> on this page will not be recorded. Please contact your instructor.

Three properties carry over and must be preserved:

1. **The page answers `200`.** It is an App Router page reached by a redirect,
   not an error response. Do not reach for `ltiSeeOther`/`ltiErrorRedirect`:
   those use `303` for a reason specific to the LTI routes — they are POST
   handlers, and `303` stops the browser re-POSTing an `id_token` — and
   `/routes/agent/authorize` is a GET handler, so the authorization route keeps
   its existing `307`.
2. **The slug, not the failure, chooses the copy.**
3. **No caller-supplied value is reflected into the page.** Do not render the
   rejected URI and do not put it in a link. The value that reached this page is,
   by definition, one that failed validation. The diagnosis belongs in the server
   log.

#### Tests

`page.test.node.tsx` (gradebook, vitest `--mode=node`), following
`apps/gradebook/src/app/lti/error/page.test.node.tsx`:

- renders the `invalid_request` copy for that slug;
- falls back to `server_error` for an unknown slug, an absent slug, and a
  repeated slug array;
- never reflects the raw query value into the DOM — render
  `<script>alert(1)</script>` and assert neither `alert(1)` nor `script` appears;
- render a plausible rejected URI as the slug and assert the host does not appear
  in the markup — the non-reflection contract stated in the terms the page
  actually exists for;
- no message carries `ERR_` or `Error:`.

Verification:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=node src/app/agent/error/page.test.node.tsx
pnpm -F @modulus-learning/gradebook test
pnpm typecheck && pnpm lint:check
```

---

### Task 12 — Reorder The Authorization Route And Map OAuth Errors

Proposed commit: `fix(agent): validated the oauth redirect uri before using it as a destination`

The route parses `redirect_uri` with `new URL()` before anything has checked it,
so a malformed value throws there and the learner gets an unhandled `500`; and it
follows a credentialed-host disguise such as `https://modulus.example@evil.example/`
as-is. This task fixes the first and narrows the second.

Files:

- revise `apps/gradebook/src/app/routes/agent/authorize/route.ts`; and
- revise `apps/gradebook/src/app/routes/agent/authorize/route.test.node.ts`.

#### Route Wiring

Four branches, in this order, with at most one core call:

```text
1. redirect_uri fails isUsableRedirectUri -> /agent/error?code=invalid_request; never redirect
2. request otherwise malformed            -> back with state + error=invalid_request
3. no Modulus session                     -> back with state + error=access_denied
4. otherwise, createAuthCode()
     success                              -> back with state + code
     ERR_ACTIVITY_URL_NOT_ALLOWED         -> back with state + error=unauthorized_client
     any other failure                    -> back with state + error=server_error
```

Step 1 is the only gate on the destination, and it must be stricter than
`new URL()`, which accepts `javascript:` and `data:` and treats
`https://modulus.example@evil.example/` as a perfectly good URL. **Import
`isUsableRedirectUri` from `@modulus-learning/core`; do not reimplement it.** A
second definition in the host would drift from core's rules exactly as the host's
own `@types/validate-urls.ts` already has. Failing step 1 means there is no safe
destination and no link worth offering, so the learner gets the dead-end page.

Step 2 is the route's **existing** protocol validation, which must be preserved
in full while it is reordered around: `response_type !== 'code'`, `client_id !==
redirect_uri` (`route.ts:69` — the analysis cites line 66; take the code's line
number and the analysis's contract), `code_challenge_method !== 'S256'`, a
missing `client_id`, `state` or `code_challenge`, or a `scope_id` that does not
parse as a UUID. What changes is only the response: those failures currently
return raw `400` JSON, which no learner should ever see. When the request is
malformed *because* `state` is missing there is no state to echo; the agent reads
that as `oauth_state_mismatch` and fails, which is acceptable — a request without
state came from a broken client, not a learner condition.

Steps 2 and 3 consult no policy at all, which is what keeps this to one core call
per request. `createAuthCode()` is reached only on step 4, where a session
exists, and it remains the single authoritative check-and-create.

Map errors in the shape `errorSlugFor()` already uses for LTI. The mapping to
`unauthorized_client` is not a style choice: `access_denied` maps in the agent to
`status: 'expired'` and prompts a re-launch from the LMS, which for an unapproved
activity sends the learner round the same loop indefinitely.
`unauthorized_client` is in the agent's accepted `OAUTH_ERRORS` set, terminates
at `status: 'failed'`, and is the correct RFC 6749 code here given that
`client_id` is the activity URL.

Keep the existing `307` on every redirect. Keep the existing `logger.info`
scope-selection line and the `logger.warn` for a malformed scope label.

**This does not close the open redirect.** Steps 2, 3 and 4 still redirect to a
syntactically valid `redirect_uri` without asking the allowlist, so the endpoint
can still bounce a browser to any https origin an attacker chooses. That is
retained knowingly and deferred: replacing the bounce with a Modulus page and a
return link is a learner-visible change needing stakeholder input, because
session expiry is the common path and today it resolves with no learner action at
all. Record this in a comment on the route so the next reader does not assume the
gate is broader than it is, and do not describe it as closed in the commit
message.

#### Tests

`route.test.node.ts` (gradebook, vitest `--mode=node`) — the existing
`'agent authorization route scope selection'` block keeps passing unchanged; add:

- `javascript:alert(1)` as `redirect_uri` redirects to `/agent/error?code=invalid_request`
  and **never** to the supplied value — assert the `Location` header;
- `data:text/html,x` likewise;
- `https://modulus.example@evil.example/` likewise — the credentialed-host
  disguise, the specific thing this feature does remove;
- a value that today throws inside `new URL()` returns the error-page redirect
  instead of a `500` — the crash being fixed;
- none of the four reaches `createAuthCode` — assert the mock's call count is
  zero, since "at most one core call, on the authenticated branch only" is a
  distinct obligation from "does not redirect";
- a malformed request with a valid `redirect_uri` bounces back with `state` and
  `error=invalid_request` rather than `400` JSON;
- `client_id !== redirect_uri` still fails, now as a bounce — a guard that the
  reorder did not quietly drop the existing check;
- no session bounces back with `state` and `error=access_denied`;
- an `ERR_ACTIVITY_URL_NOT_ALLOWED` result bounces with
  `error=unauthorized_client`, and the assertion explicitly includes
  `not access_denied`;
- any other core failure bounces with `error=server_error`;
- a successful call bounces with `state` and `code`.

Verification:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=node src/app/routes/agent/authorize/route.test.node.ts
pnpm -F @modulus-learning/gradebook test
pnpm typecheck && pnpm lint:check
```

---

### Task 13 — Reject Cumulative Targets Per Target

Proposed commit: `feat(agent): reported disallowed cumulative targets without failing the submission`

The last admitting path, and the one where the naive implementation does real
harm. The target list comes from the page's authored markup, so the same bad URL
recurs in every submission that page makes: failing the request would not cost
one update, it would permanently stop all progress from that page, including the
learner's own valid self high-water mark. This task also converts the two
existing whole-request failures to the same per-target outcome.

Files:

- revise `packages/core/src/modules/agent/activity-state/services/progress.ts`;
- revise `packages/core/src/modules/agent/activity-state/schemas.ts`;
- revise `packages/core/src/modules/agent/index.ts`;
- revise `packages/core/src/test-support/pg.ts`; and
- revise `packages/core/src/modules/agent/activity-state/services/progress.itest.ts`.

#### Schemas

```ts
export type RejectedTargetReason =
  | 'activity_url_not_allowed' // no enabled rule matches an unseen URL
  | 'malformed_url' // not parseable as an absolute URL
  | 'url_too_long' // exceeds the 255-character `activities.url` column
  | 'self_reference' // the target is the reporting activity itself
```

The first three are `RegistrationDenialReason` verbatim — this path names the
shared service's own denial vocabulary rather than defining a parallel one. Only
`self_reference` is added here, because it needs the reporting activity's id and
is therefore checked by this caller before the service is called.

Add to `setProgressSchemas.output` only:

```ts
rejected_targets: z.array(
  z.object({ url: z.string(), reason: z.enum([...]) })
).optional()
```

`rejected_targets` is omitted when empty, matching how `others` is already
handled. `getProgressSchemas` gains nothing: reads never register, and
`get-progress({ urls })` must keep returning a known grandfathered target without
consulting or mutating the policy.

#### Service

Inject the registration service into `ActivityProgressService` and add it to
`createActivityStateRegistry()`.

`setProgress` keeps its transaction, its `acquireUserLock`, and its self-first
ordering. Rewrite the target loop:

- load the policy **once**, outside the loop, before the first target;
- keep the existing `if (self.increase > 0)` guard. Target evaluation stays
  conditional on self having advanced: a submission with nothing to contribute
  applies nothing to any target, so it has nothing to report about them.
  Rejection reporting therefore follows contribution application, and a page with
  a bad target learns about it on the next advance;
- for each target: check self-reference first (it needs `auth.activity_id`), then
  `register(url, policy)`;
- on any denial, push `{ url, reason }` onto `rejected_targets` and `continue`.
  Create no activity, no progress row, no event, and no line-item update for it;
- on success, apply the contribution exactly as `applyContribution` does today.

Delete both `ERR_VALIDATION` throws in `resolveTarget()`. The over-long URL
becomes `url_too_long` from the registration service; the self-reference becomes
`self_reference` from this caller's own check. `resolveTarget()` itself is
subsumed by `register()` and should go with them — its lazy create, its race
re-read and its length bound now live in one place.

Self progress, its event, its line-item update, and every allowed target in the
same submission still commit. This is a per-target outcome, not all-or-nothing
request validation.

Update `test-support/pg.ts`: `TestServices.activityProgress` is hand-wired with
`{ logger, tx, queries, mutations }` and will not compile once the service takes
a registration dependency. Construct the registration service there and pass it.

#### Tests

`progress.itest.ts` (core integration, `node:test` via `tsx`, needs
`modulus_test`) — this service's coverage is integration-first, and the
behaviours here are transactional, so they belong there rather than in a unit
suite:

- **Rewrite** `'rolls the whole transaction back when an umbrella target is
  self-referential'`: self progress now commits and the target is reported as
  `self_reference`. The old assertion is the defect being repaired, not a guard;
- **Rewrite** `'rolls back when an umbrella target URL exceeds the length limit'`
  the same way, reporting `url_too_long`;
- new: a disallowed unseen target commits self progress and returns
  `rejected_targets: [{ reason: 'activity_url_not_allowed' }]`, with **no**
  `activities`, `progress`, `progress_events` or `lti_lineitems` row for it —
  assert each of the four, since "creates no data" is the contract and one
  missing check would not catch a partial write;
- new: a submission with one allowed and one disallowed target commits the
  allowed contribution and reports only the disallowed one;
- new: an existing target no current rule matches receives its contribution
  normally — grandfathered targets are use, not registration;
- new: `rejected_targets` is absent, not an empty array, when every target is
  accepted;
- new: a submission where self did not advance returns no `rejected_targets`
  even though a disallowed target is present — the conditional-evaluation rule
  that keeps a no-op retry silent;
- new: `getProgress({ urls })` returns a known grandfathered target's progress
  and queries no policy — assert the policy read count is zero;
- the existing `'lazily creates a target activity on first contact with an unseen
  URL'` case gains an enabled rule for the URL and otherwise keeps its
  assertions;
- the existing `'serializes a concurrent create of the same unseen target'` case
  likewise.

Verification:

```sh
pnpm -F @modulus-learning/core test:integration:one src/modules/agent/activity-state/services/progress.itest.ts
pnpm -F @modulus-learning/core test && pnpm -F @modulus-learning/core test:integration
pnpm typecheck && pnpm lint:check
```

---

### Task 14 — Report Rejected Targets In The Agent Library

Proposed commit: `feat(agent): surfaced rejected cumulative targets in the agent diagnostics`

The server now returns a durable per-target outcome; the published agent throws
it away. Because `apps/agent` is the one released artefact, this reaches content
authors only through a release.

Files:

- revise `apps/agent/src/core/api-client.ts`;
- revise `apps/agent/src/core/agent.ts`;
- revise `apps/agent/src/core/agent.test.ts`; and
- add `.changeset/<generated-name>.md`.

#### API Client

Extend the response type additively:

```ts
export type RejectedTarget = {
  url: string
  reason: 'activity_url_not_allowed' | 'malformed_url' | 'url_too_long' | 'self_reference'
}
type ProgressResponse = {
  progress: number
  others?: ProgressResult[]
  rejected_targets?: RejectedTarget[]
}
```

The transport needs no other change: `#request` already spreads the JSON body
minus `new_token` into `data`, and `apps/gradebook/src/app/routes/agent/activity/route.ts`
passes the command's response through untouched.

#### Agent

In `#submitProgressInner`'s `onSuccess`, send any `rejected_targets` through the
existing `this.#logger?.log(...)` and otherwise **treat the submission as
completed**: it must not mark the progress unsubmitted, must not retry, and must
not emit an error event. A non-2xx would instead stop that page reporting
anything at all, which is the whole reason the server returns 200.

Be honest in the comment about what this diagnostic is worth. The agent's default
logger is `createSilentLogger()`, deliberately — it runs inside learners' browsers
on third-party pages, so console output is opt-in. Rejected targets are therefore
visible to an author who passed `createConsoleLogger()` or
`createDebugLogger()`, and to nobody else. That is the right default and this
feature does not change it; the server log is the reliable record.

Do not add a public event, a UI affordance, or a new export. The analysis puts
redesigning progress retry and backoff beyond recognising this outcome out of
scope.

#### Changeset

Add a changeset for `@modulus-learning/agent` describing the additive
`rejected_targets` member. Publishing is **not** part of this task or this pull
request: `RELEASE-INSTRUCTIONS.md`'s manual flow (`pnpm changeset` →
`pnpm version-packages` → `./publish-packages.sh`) is a local, maintainer-
authenticated operation, and the auto-publish GitHub Action is disabled.

#### Tests

`agent.test.ts` (agent, vitest `--mode=jsdom`) — extend the existing
`'ModulusAgent authenticated request state machine'` block:

- a success carrying `rejected_targets` still emits `progress-submitted` and
  updates `#submittedProgress` — the submission completed, which is the whole
  point of the server returning 200;
- that same response logs the rejected targets through an injected logger;
- it triggers no retry and no `connection-lost` state — the guard against
  treating a durable authoring error as a transient failure;
- a response with no `rejected_targets` behaves exactly as before.

Verification:

```sh
pnpm -F @modulus-learning/agent exec vitest run --mode=jsdom src/core/agent.test.ts
pnpm -F @modulus-learning/agent test
pnpm typecheck && pnpm lint:check
```

---

## Phase 4 — Remove The Superseded Writers

### Task 15 — Delete The Superseded Activity Writers

Proposed commit: `refactor(core): removed the superseded activity insert paths`

Every admitting path now goes through `ActivityRegistrationService`. Deleting the
old writers is what turns "one writer" from a claim into a property the compiler
enforces — and it is why this task is last among the code changes rather than
folded into any of the four moves.

Files:

- revise `packages/core/src/modules/app/activities/repository/index.ts` — delete
  `ActivityMutations.createActivity` and `ActivityMutations.ensureActivitiesExist`;
- revise `packages/core/src/modules/agent/auth/repository/index.ts` — delete
  `AgentAuthMutations.createActivity`;
- revise `packages/core/src/modules/agent/activity-state/repository/index.ts` —
  delete `ActivityStateMutations.createActivity`;
- revise `packages/core/src/modules/app/lti/services/deep-link.ts` — drop the now
  unused `activityMutations` dependency if nothing else uses it; and
- revise any `index.itest.ts` that referenced a deleted method.

Do **not** delete: `findActivityByURL` / `findActivityByUrl` on any repository
(reads, still used), `assignActivitiesToActivityCode`,
`removeActivitiesFromActivityCode`, `enrollInActivityCode`, or anything under
`packages/core/src/database/seeds/` and `packages/core/src/test-support/fixtures.ts`.
Seeds and fixtures insert into `activities` directly with the Drizzle handle,
never through a repository; they are an explicit trusted bootstrap operation and
are outside runtime policy by design.

If a deletion turns out to leave a live call site, that is a defect in Tasks 7,
9, 10 or 13 — fix it there in a corrective commit rather than keeping the writer.

#### Tests

No new tests. This task's proof is negative and is delivered by `typecheck` plus
the existing suites: with the writers gone, any surviving bypass fails to
compile. Confirm by grepping that `insert(activities)` appears in exactly three
places — the registration repository, `seeds/10_activities.ts`, and
`test-support/fixtures.ts`.

Verification:

```sh
grep -rn "insert(activities)" packages/core/src --include=*.ts
pnpm -F @modulus-learning/core test && pnpm -F @modulus-learning/core test:integration
pnpm -F @modulus-learning/gradebook test && pnpm -F @modulus-learning/agent test
pnpm typecheck && pnpm lint:check
```

---

## Phase 5 — Documentation And Acceptance

### Task 16 — Update Shipped Documentation

Proposed commit: `docs: documented the sitewide activity url allowlist`

The analysis defers documentation until the feature is implemented and accepted,
which is why it is one task here and appears in no earlier one. Follow
`.claude/skills/writing-docs/` — front matter, Title Case headings, and a closing
`## Where to go next`.

Files:

- revise `docs/DYNAMIC-ACTIVITIES.md`;
- revise `docs/CUMMULATIVE-PROGRESS.md`;
- revise `docs/AUTHN-AUTHZ.md`;
- revise `docs/DATA-MODEL.md`;
- revise `docs/SECURITY-AND-PRIVACY.md`; and
- revise `specs/2026-09-02-activity-url-allowlist-analysis.md`.

- **`docs/DYNAMIC-ACTIVITIES.md`** — its unimplemented allowlist sections are
  superseded on all four points: deny-all replaces allow-all when there are zero
  rules; parsed origin plus path-segment matching replaces host plus raw
  `pathname.startsWith`; `created_by` references `admin_users`, not learner/
  instructor `users`; and enforcement covers instructor registration, not only
  agent lazy creation. Mark those sections superseded and point at the shipped
  behaviour rather than deleting the history — the "why lazy create exists"
  rationale and the activity-code-association decision remain current.
- **`docs/CUMMULATIVE-PROGRESS.md`** — document `rejected_targets`: its closed
  reason union, that it is omitted when empty, that it accompanies a successful
  response, that a rejected target never fails the submission carrying it, and
  that the two errors which previously failed the whole request now take this
  route. Say plainly why: the target is authored into the page, so failing would
  stop that page reporting permanently.
- **`docs/AUTHN-AUTHZ.md`** — the agent OAuth section gains the four-branch
  authorization ordering, the syntactic `redirect_uri` gate, `/agent/error`, the
  `unauthorized_client` mapping and why it is not `access_denied`, and the two
  new admin abilities in the abilities section. State that the remaining open
  redirect is narrowed, not closed, and that closing it is deferred.
- **`docs/DATA-MODEL.md`** — add `activity_url_allowlist_rules` to the entity
  groups with its columns, its `unique (origin, path_prefix)` constraint, its
  `admin_users` provenance, and a note that it holds no learner data. Add to
  Migrations & Seeds that seeds deliberately create no rules.
- **`docs/SECURITY-AND-PRIVACY.md`** — the activity trust claims change: URL
  admission is now an administrator decision, admission is recorded by the
  `activities` row, and grandfathering means rule removal is not revocation.
  Record the deferred emergency-block capability as deferred and the narrowed
  open redirect as accepted, in the terms the analysis uses. Do not overstate
  either.
- **`specs/2026-09-02-activity-url-allowlist-analysis.md`** — set the status line
  to `implemented on feat/activity-url-allowlist`.

No release notes: there are no deployments to notify. The agent's changeset from
Task 14 is the only release artefact.

Verification:

```sh
pnpm typecheck && pnpm lint:check
```

Then re-read each changed section against the code, not against this plan.

---

### Task 17 — Full Verification And Pull Request

Proposed commit: none, unless review findings require one.

Files: none. This task changes no file; it verifies the tree and opens the pull
request. Any file it turns out to need belongs to the task whose acceptance it
repairs.

Run the complete gate:

```sh
pnpm run ci
```

Then walk the traceability table below and confirm each row against the tree, not
against memory. Pay particular attention to the four rows that are absences
rather than behaviours — no policy read on the use paths, no `activities` writer
outside the entry point, no mutation of `activities` from an admin rule change,
and no core call before the authenticated branch — since a passing suite does not
by itself demonstrate any of them.

Open one pull request from `feat/activity-url-allowlist` against `develop`. The
description should cover: the admission-only model and what grandfathering means
for administrators; the deny-all empty state and that a seeded database now
refuses registration until the first rule is added; the two defects repaired in
the authorization route (the unhandled `500` and the credentialed-host disguise)
together with the explicit statement that the open redirect is **narrowed, not
closed**; the change from whole-request failure to per-target rejection in
cumulative progress; and the agent changeset, which is not published by this PR.

Verification:

```sh
pnpm run ci
pnpm typecheck && pnpm lint:check
```

---

## Acceptance-Criteria Traceability

Every criterion in the analysis's Acceptance Criteria section, mapped to the
task that satisfies it.

| Criterion | Task |
| --- | --- |
| Only authenticated administrators with the declared abilities can list or mutate rules | 5 |
| Zero enabled rules deny every new runtime registration | 3, 4, 7, 9, 10, 13 |
| A rule matches one exact origin (HTTPS, or HTTP for the permitted loopback hosts) and either all paths or one path-segment-bounded subtree | 2 |
| Deceptive host prefixes, sibling path prefixes, userinfo, insecure remote HTTP, malformed URLs, and implicit subdomains do not match | 2 |
| A rule whose derived base URL exceeds 255 characters is rejected at creation | 5 |
| A normalizing collision never surfaces a constraint error: enabled reports the existing rule, disabled offers re-enable with description and provenance intact | 5, 6 |
| Seeding creates no allowlist rules, so a fresh install denies every registration | 1, 6 |
| Activity-code creation and editing resolve every URL, evaluate only unseen URLs, and are atomic when any prospective registration is denied | 7 |
| Any known grandfathered activity may be newly associated with a code or restored after removal, subject to the code's prefix rule | 7 |
| LTI deep linking cannot create an unseen disallowed activity; a denial is an activity URL field error with no content item | 9 |
| A known grandfathered activity may be associated and used in a new LTI deep link without matching the current policy | 9 |
| The existing per-code prefix remains an additional constraint | 9 |
| Two concurrent deep links registering the same allowed unseen URL both succeed, resolving to one winning `activities` row | 4, 9 |
| Agent authorization lazy-creates only an allowed unseen activity | 10 |
| No OAuth branch uses a `redirect_uri` failing the syntactic check as a destination — `javascript:`, `data:`, userinfo, and the value that throws today | 12 |
| That syntactic check is core's, called as a pure helper, not a second implementation in the route | 2, 12 |
| A failing `redirect_uri` lands on `/agent/error`, which answers `200`, selects copy from a closed slug union, and reflects no caller-supplied value | 11 |
| A disallowed OAuth request creates neither activity nor auth code and returns `error=unauthorized_client`, never `access_denied` | 10, 12 |
| The authorization route makes at most one core call per request, on the authenticated branch only | 12 |
| Token exchange does not re-check a successfully admitted activity | 10 |
| A disallowed unseen cumulative target creates no activity, progress, event, or line-item record | 13 |
| Self progress and allowed targets in that submission still commit | 13 |
| The response identifies rejected targets as durable per-target outcomes the agent logs, and a rejected target never fails the submission | 13, 14 |
| An over-long or self-referencing target is reported the same way rather than failing the whole submission | 13 |
| Known cumulative targets and side-effect-free reads do not query the policy | 13 |
| Disabling, editing, or deleting rules never deletes or blocks existing activities, associations, tokens, state, launches, reports, passback, new associations, or new deep links | 5, 6, 9, 10, 13 |
| The admin UI explains deny-all and grandfathering and previews the activities left outside the prospective policy | 5, 6 |
| Every URL in one admission operation is evaluated against a single policy snapshot | 4, 7 |
| No admission path serializes against allowlist mutation | 4 |
| Every path that admits a URL registers through the one shared entry point, the only writer of `activities` rows outside seeds and fixtures | 4, 7, 9, 10, 13, 15 |
| The allowlist lives in a dedicated PostgreSQL table with administrator provenance and no learner PII | 1 |

## Out Of Scope

Carried from the analysis. No task may drift into these, and none of them is a
"while we're here" addition during review.

- Deleting, disabling, quarantining, or revalidating any existing activity.
- An emergency activity/origin blocklist or kill switch. It is deferred with its
  own launch, token, state and passback semantics, and must not be smuggled in as
  a side effect of an allowlist rule edit.
- Closing the authorization route's remaining open redirect. This feature narrows
  it to syntactically valid https destinations and records the rest as accepted.
  Replacing the OAuth error bounce with a Modulus page and a return link is a
  separate, learner-visible change needing stakeholder input.
- Wildcard domains, public-suffix reasoning, or automatic subdomain inclusion.
- Proving control of a domain through DNS or HTTP challenges.
- URL canonicalization that merges existing `activities` rows.
- Changing activity-code ownership, enrollment, reporting, or academic scopes.
- Automatically associating agent-created activities with an activity code.
- Redesigning progress retry or backoff beyond recognizing the new durable
  rejected-target outcome.
- Moving per-code `url_prefix` enforcement into core. It stays in the gradebook
  server actions and in `handleDeepLink()`. "Centralize the decision inside core"
  governs the sitewide allowlist, not the per-code prefix.
- Granting the new admin abilities to any existing database. That is a separate
  data migration, and this plan seeds them only.
- A process-local policy cache. Deliberately absent in the first implementation;
  adding one needs an explicit cross-instance invalidation or revision scheme.
- An immutable audit-event or mutation-history table for rule changes. The
  provenance columns and timestamps are sufficient for this feature.
- Any compatibility shim, fallback route, dual-write migration, policy backfill,
  or deprecation window.
