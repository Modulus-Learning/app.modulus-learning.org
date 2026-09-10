---
title: "Activity URL Canonicalization Implementation Plan"
path: "activity-url-canonicalization-implementation-plan"
summary: "Ordered implementation tasks for canonical activity URL registration and lookup, instructor input validation, OAuth binding, cumulative progress, deep linking, fixtures, documentation, and verification, while retaining the deferred direct-launch transport limitation."
---

# Activity URL Canonicalization Implementation Plan

Date: 2026-09-10
Status: planned; implementation and data changes have not been performed

This plan turns the [approved analysis](./2026-09-07-activity-url-canonicalization-analysis.md)
into implementation tasks for the developers changing core and the gradebook
host. Each task identifies its dependencies, affected files, implementation
steps, and evidence required for completion.

The maintainer confirmed on 2026-09-10 that **zero enabled allowlist rules allow
all new activities subject to admission syntax and canonical storage length**.
The stale acceptance criterion in the analysis has been corrected. With one or
more enabled rules, an unseen activity must match an enabled rule; existing
activities remain grandfathered. A failed policy read is still an error.

## Scope And Terms

An **activity** is a row in `activities`; its UUID identifies progress, saved
page state, and grading relationships. An **activity code** groups activities
for instructional use. A **canonical activity URL** is the activity's stored
URL spelling: parse with the platform `URL` constructor without a base, remove
query and fragment, and serialise `href`. **Grandfathering** means that resolving
an existing activity does not re-evaluate its admission under current rules.
The [data model](../docs/DATA-MODEL.md) describes these records.

Core owns registration and identity resolution. Host code calls the commands
facade, the typed `app` / `admin` / `agent` entry points described in
[Core Composition](../docs/CORE-COMPOSITION.md), and may import pure URL helpers
for form feedback. Host code must not import repositories or services.

Implement the canonical writer and all corresponding readers in one coordinated
change. The task boundaries support review and testing; they are not independent
deployment stages.

The following work is explicitly outside this plan:

- Database backfills, URL rewrites, collision merges, aliases, raw-lookup
  fallbacks, staging cleanup, and reset/reseed procedures. The analysis records
  the maintainer's staging audit; this plan does not repeat or verify that audit.
- New database columns, indexes, migrations, or dependency-injection services.
  Keep `activities.url` as a unique `varchar(255)` and retain SQL equality.
- A replacement direct-launch route. Generated direct links still lose non-root
  trailing slashes and repeated slashes before lookup; neither an ID route nor
  a query-parameter route has been selected.
- Instructor-configured launch parameters, near-match suggestions, redirect
  discovery, DNS or content inspection, and extra percent-escape equivalences.
- OAuth callback redesign, open-redirect remediation, emergency blocking,
  changes to progress calculations, or changes to academic-scope isolation.
- Publishing the agent or deploying the host. The browser agent already removes
  query and fragment from its OAuth callback; this feature requires regression
  coverage of that behaviour, not a planned client protocol change.

## Implementation Contracts

| Concern | Required Contract |
| --- | --- |
| Identity | One pure normaliser; exclude query and fragment, then use WHATWG serialization without additional path rewriting. |
| Admission | Resolve the canonical key first. Only unseen activities face canonical length, syntactic admission, and enabled-rule matching. Never strip credentials to admit a URL. |
| Instructor input | Reject query or fragment presence before clearing components, including empty `?` and `#`; retain entered text and show a field warning. |
| OAuth binding | Save and compare the original `client_id` and `redirect_uri` values exactly. Canonicalise only the separate activity lookup key. |
| Cumulative writes | Canonical duplicates invalidate the entire request in the existing schema refinement before the command handler runs. Self-reference remains a per-target, resolved-ID check. |
| Additional reads | Parse and look up without registration or policy access. Preserve each resolved input occurrence, its spelling, and its order. |
| Instructor batches | Preserve input mappings; normalise, deduplicate, and sort canonical keys before registration. Commit all code, activity, and association changes together or none. |
| Per-code prefix | Reject query/fragment, normalise candidate and prefix, then retain ordinary string `startsWith()` semantics and authored non-root trailing slashes. |
| Deep-link output | Store the resolved canonical URL in `modulus_activity_url`; use `modulus-${activity_code}-${activity.id}` as the window target. |
| Launch destination | Resolve incoming spelling variants, then use the stored activity URL. Incoming query and fragment are not forwarded as launch options. |
| Diagnostics | Preserve the existing restricted diagnostic fields. Do not add submitted URLs, query/fragment values, credentials, or OAuth values to logs. |

Learning Tools Interoperability (LTI) deep linking publishes a content item to the
learning management system (LMS). A later resource-link launch resolves that
item and its Assignment & Grade Services (AGS) line item. OAuth and Proof Key
for Code Exchange (PKCE) bind the browser agent to the resolved activity. See
[LTI](../docs/LTI.md) and [Authentication & Authorization](../docs/AUTHN-AUTHZ.md)
for the existing flows that these tasks preserve.

## Execution Rules

- Work on a feature branch named according to the repository's
  `<type>/<short-slug>` convention. Keep the coordinated implementation in one
  pull request against `develop`, opened or updated at Task 12. Do not merge,
  deploy, or publish as part of this plan.
- Complete tasks in numbered order. After each task, present its diff, actual
  verification results, and any outstanding evidence, then **pause for
  independent review before starting the next task**. Address review findings
  and wait for the independent reviewer to accept the task before continuing.
  The implementer's own checks do not replace this review. Task 12 also ends
  with an independent review pause.
- Follow the repository's `git-commit`, `git-push`, and `github-pr` skills when
  performing those workflows. Use focused conventional commits with lowercase,
  past-tense messages and no trailers. Include relevant behaviour tests with
  the production changes they cover. Commit boundaries may group tightly
  coupled tasks; they need not match the numbered tasks, but grouping commits
  must not skip or postpone a task's review pause. Present an uncommitted task
  diff for review when its commit group is not yet complete.
- Run each task's focused checks before its review. The intermediate tree is
  not a deployment candidate: registration changes precede some reader and
  fixture updates. Record any resulting verification gaps or failures, their
  cause, and the later task responsible for resolving them; do not report them
  as passing or mark missing completion evidence complete. Resolve unrelated
  regressions within the current task. All required evidence and the complete
  validation gate must pass before final acceptance at Task 12.

## Task Order

All task checkboxes begin unchecked because this document plans future work.

| Task | Deliverable | Depends On |
| --- | --- | --- |
| 1 | Pure identity, instructor-input, and prefix utilities | None |
| 2 | Canonical registration and concurrency coverage | 1 |
| 3 | Core instructor command validation and canonical batches | 1, 2 |
| 4 | Canonical deep-link prefix check and signed output | 1, 2, 3 |
| 5 | Canonical OAuth lookup with exact protocol binding | 1, 2 |
| 6 | Canonical cumulative reads, writes, and duplicate validation | 1, 2 |
| 7 | Canonical LTI and direct-start readers | 1, 2 |
| 8 | Instructor form feedback and input preservation | 1, 3, 4 |
| 9 | Canonical stored fixtures and cross-flow integration coverage | 2–8 |
| 10 | Browser authentication and launch verification | 5–9 |
| 11 | Published documentation and final source audit | 1–10 |
| 12 | Complete validation and review handoff | 1–11 |

## Task 1 — Add Pure Activity URL Utilities

- [ ] Add `packages/core/src/modules/activity-registration/activity-url.ts` and
  `activity-url.test.ts`.
- [ ] Export the host-safe helpers from `packages/core/src/index.ts`, following
  the existing `isUsableRedirectUri` export. Keep this module free of logger,
  database, service, registry, and framework imports.

Use the following proposed API. These declarations describe new implementation
work; they are not existing exports:

```ts
// Proposed: packages/core/src/modules/activity-registration/activity-url.ts
export function normalizeActivityUrl(value: string): string | null

export type InstructorActivityUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'malformed_url' | 'unsupported_url_components' }

export function validateInstructorActivityUrl(value: string): InstructorActivityUrlResult
export function matchesActivityUrlPrefix(value: string, prefix: string): boolean
```

1. `normalizeActivityUrl()` constructs a fresh `URL(value)` without a base,
   returns `null` on parser failure, clears `search` and `hash`, and returns
   `href`. It imposes no scheme, credential, length, allowlist, or user checks.
   Never return or retain a mutable shared `URL` object.
2. `validateInstructorActivityUrl()` parses using the same platform contract and
   detects query and fragment presence in the serialised URL **before** clearing
   them. Literal delimiters in that serialization detect empty components too;
   `%3F` and `%23` remain encoded path characters. Return a canonical string only
   when the component check passes. This is parse/component validation, not an
   admission decision; scheme and credential restrictions on unseen activities
   remain in `parseAdmissibleUrl()`.
3. `matchesActivityUrlPrefix()` validates both non-empty inputs with the
   instructor helper and compares their canonical strings with `startsWith()`.
   Invalid inputs return `false`; callers validate separately to choose a
   specific field error. Callers handle the optional empty-prefix case as no
   constraint. Do not reuse `normalizeRuleBaseUrl()`.
4. Keep the helpers non-mutating with respect to submitted values. Calling code
   holds the original string for errors and response correlation.

**Completion evidence:** table-driven Node unit tests cover every transformation
and preserved distinction in the analysis, idempotence, parser failures, and
component detection. Include uppercase scheme/host, default and non-default
ports, root completion, literal and encoded dot segments, Unicode host/path,
query/fragment removal, empty components, `%3F`, `%23`, path case, trailing and
repeated slashes, `/index.html`, schemes, host aliases/trailing dots, `%2F`, and
the distinct `/%7euser`, `/%7Euser`, `/~user` spellings. Include parser repairs
such as `https:content.test/lesson`, backslashes, numeric loopback spelling, and
preserved malformed percent escapes. Tests must demonstrate that parsing a
credentialed or otherwise inadmissible URL does not itself grant admission.

For prefixes, test origin-only completion, default-port/case normalisation,
preserved trailing slash, and `/course` matching `/coursework` under the retained
string-prefix contract. `/course/` must not match `/coursework`.

## Task 2 — Canonicalise Shared Registration

**Files:** `packages/core/src/modules/activity-registration/services/activity-registration.ts`,
its `.test.ts` and `.itest.ts` companions, and the registration repository's
method comments in `packages/core/src/modules/activity-registration/repository/index.ts`.

- [ ] Replace the raw-storage/deferred-canonicalisation comment with the new
  contract.
- [ ] Implement this order in `ActivityRegistrationService.register()`:
  1. Parse and derive a canonical key; return `malformed_url` on failure.
  2. Look up that key and immediately return an existing record.
  3. For an unseen key, check its length against 255.
  4. Obtain the supplied policy snapshot, including the existing lazy-loader
     option, and evaluate that same canonical key.
  5. Insert the canonical key and conflict-re-read exactly that key.
- [ ] Preserve `RegistrationOutcome` and all three denial reasons. Every denial
  still carries the submitted `url`, even though lookup, length, evaluation,
  and insertion use the canonical string.
- [ ] Leave repository SQL equality, the unique constraint, and
  `onConflictDoNothing()` intact. Document that URL repository arguments are
  canonical keys supplied by services.
- [ ] Preserve lazy policy loading for cumulative submissions and one snapshot
  per admission operation. A known row bypasses evaluation; this does not
  require removing eager snapshot reads already performed by other callers.
- [ ] Audit the touched failure paths for URL disclosure. In particular, the
  existing impossible insert/re-read failure includes `details: { url }` and
  calls `.log()`; replace URL-bearing details there with a fixed diagnostic or
  the already permitted safe fields. Keep denial logs limited to reason and
  safely parsed origin/path.

**Completion evidence:** unit tests assert the actual keys passed to lookup,
policy, insert, and conflict re-read, with a fake that does not return an activity
for every input. Cover malformed input, policy denial, policy-read failure,
canonical 255/256 boundaries, long inputs shrinking below the bound, and Unicode
expansion beyond it. Query length must not count towards activity storage length.

PostgreSQL tests concurrently register different equivalent spellings and assert
both successes return the same ID and exactly one row exists. Keep zero-rule
and all-disabled-rule allow-all cases. Add a nonmatching enabled rule to test
denial of unseen URLs, then verify equivalent spellings of an existing activity
still succeed without evaluation. A directly seeded canonical, parseable but
currently inadmissible URL must resolve without a new syntax gate; its unseen
counterpart must still fail admission. These are synthetic fixtures, not a
production data compatibility mechanism.

## Task 3 — Validate Instructor Commands And Canonicalise Batches

**Files:** `packages/core/src/modules/app/activities/schemas.ts`,
`services/activity.ts`, `services/activity.test.ts`, `services/activity.itest.ts`,
and `packages/core/src/modules/app/lti/schemas.ts`. Add focused schema/command
tests beside these modules where existing suites do not cover their boundaries.

- [ ] Reuse the instructor helper in `createActivityCodeRequestSchema`,
  `updateActivityCodeRequestSchema`, and `deepLinkRequestSchema`. Use refinements
  that retain submitted strings for `urls[]` and deep-link `activity_url`; do
  not transform those activity URL fields into canonical values at the command
  boundary. `url_prefix` is the explicit exception, transformed by the shared
  prefix schema described below.
- [ ] Reject unsupported components at paths `urls[index]`, `url_prefix`, or
  `activity_url` as appropriate. Use `ERR_VALIDATION` through the existing
  command wrapper. This is not `ERR_ACTIVITY_URL_NOT_ALLOWED` and adds no
  registration-denial reason.
- [ ] Use this field warning for activity URLs, with a prefix-specific version
  for `url_prefix`: “Activity URLs cannot include query strings or fragments.
  Supply the activity URL without these components; Modulus does not currently
  support custom launch parameters.” Keep messages free of submitted values.
- [ ] Define one shared `url_prefix` schema in the app activities schema module
  and use it for both create and update. Treat `url_prefix: ''` as no constraint
  and return `null` before URL parsing, canonicalisation, or length validation.
  Keep explicit `null` and omitted values accepted. For non-empty strings, use
  `validateInstructorActivityUrl()` to
  reject parser failures and query/fragment presence, then use a schema
  `.transform()` to return the helper's canonical string. Apply the
  255-character maximum to that transformed output, for example through a
  following `.pipe(z.string().max(255, ...))` within the non-empty string branch.
  Do not pipe the empty/null/omitted branches through a string schema. Remove
  both raw `.max(255)`
  checks; do not apply a storage-length check before canonicalisation.
- [ ] Report prefix parsing, component, and canonical-length failures as
  `ERR_VALIDATION` issues at `url_prefix` before the command handler runs. Use
  a specific length warning such as “The canonical URL prefix must be 255
  characters or fewer.” Services receive and store the schema's validated
  canonical prefix without a second normalisation step. Host forms retain the
  original entered prefix on failure; transforming command input must not
  replace the displayed field value.
- [ ] In `registerActivityUrls()`, build canonical-key-to-submitted-input
  mappings, then deduplicate and sort canonical keys before the first
  registration. Use those mappings to expand a denied key back to its submitted
  spelling(s), so host actions can identify all corresponding lines.
- [ ] Keep parse-failure handling explicit if a service is called directly:
  collect a malformed denial without placing `null` in the canonical-key set.
  Public instructor commands reject invalid syntax/components before their
  handlers; registration remains the authority for runtime admission outcomes.
- [ ] Associate each resolved activity ID once. Retain the existing create and
  update transaction boundaries, including code creation, creator membership,
  new activities, description/prefix changes, and association replacement.
- [ ] Keep prefix enforcement for activity-code batches in the host, as agreed.
  Core still validates prefix syntax/components and stores its canonical form;
  this task does not add a new batch curriculum-enforcement gate.

**Completion evidence:** schema/command tests reject query/fragment URLs and
prefixes, including empty components, before the handler runs, even when the
query-free activity exists. Test encoded delimiters and uppercase schemes as
accepted parser inputs. Batch tests record canonical registration order for
oppositely ordered overlapping submissions, one association per resolved ID,
and raw denial correlation for several spellings of a denied canonical key.
Direct schema tests for both create and update must cover `''` producing `null`,
explicit `null`, and omitted `url_prefix`. Bypass host actions in these tests
so their existing empty-to-null conversion cannot hide a schema regression.
For both create and update, test raw prefixes within 255 characters that exceed
the bound after punycode or path percent-encoding, raw prefixes exceeding 255
that canonicalise within the bound, and canonical lengths exactly 255 and 256.
Assert that component validation happens before removal, oversized canonical
prefixes produce an issue at `url_prefix` without invoking the service handler,
and successful schema output contains the canonical prefix while `urls[]`
retains submitted spellings. Host tests must verify the prefix field warning
and preservation of the original entered value.

Database tests verify successful create/edit stores canonical activities and
prefixes; a rejected batch leaves no new code/member/activity/association and
leaves an existing code's description, prefix, and associations unchanged.
Keep empty URL lists and removal/reassociation of grandfathered activities
working under their existing contracts.

## Task 4 — Canonicalise Deep-Link Selection And Durable Output

**Files:** `packages/core/src/modules/app/lti/services/deep-link.ts`,
`deep-link.test.ts`, `deep-link.itest.ts`, and
`packages/core/src/modules/app/lti/errors.ts`.

- [ ] Retain pending-launch ownership, expiry, platform resolution, and activity
  code membership checks.
- [ ] Use the shared instructor validation before registration, association, or
  signing. Command-schema validation from Task 3 covers the public input; any
  service-level defensive validation must use the same helper and safe warning.
- [ ] Validate a non-empty stored prefix before comparing it. Normalise both
  prefix and candidate and apply the shared string-prefix comparison. A prefix
  containing unsupported components must produce an actionable field error
  directing correction of the code's prefix, never silent removal of its
  constraint.
- [ ] Add two distinct warn-level core error types in the LTI errors module:
  `ERR_DEEP_LINK_PREFIX_MISMATCH` for a valid configured prefix that the candidate
  does not match, and `ERR_DEEP_LINK_PREFIX_INVALID` for a stored prefix that
  fails validation. Use those codes instead of `ERR_DEEP_LINKING` for these two
  cases; retain the existing codes for unrelated deep-link failures.
- [ ] Give both prefix errors fixed, URL-free messages and safe diagnostics.
  Remove the current mismatch message's interpolation of the stored prefix.
  Do not include the submitted URL or stored prefix in error details or log
  extras; fixing host logging alone would leave the core warning exposing the
  prefix. Task 8 maps the codes to actionable field guidance.
- [ ] Keep the prefix check before registration, including for grandfathered
  activities. Preserve current registration and association behaviour.
- [ ] Set `custom.modulus_activity_url` to `outcome.activity.url`.
- [ ] Set `window.targetName` to
  `modulus-${activityCodeRecord.code}-${outcome.activity.id}`. Use the resolved
  public code, not its private code, submitted URL, or internal code-row ID.
- [ ] Retain `urlBuilder.ltiLaunchUrl` as the content item's top-level URL and
  leave all other LTI response fields and signing behaviour intact.

**Completion evidence:** inspect the actual signed-message payload supplied to
the signer in unit tests. Equivalent inputs must produce the same custom URL
and target name; another code or activity must produce a distinct target name.
Prefix tests cover canonical spelling variants, origin-only and trailing-slash
prefixes, string-prefix semantics, and rejected components. Validation and
prefix failures must call neither registration/association nor signing.
Assert the distinct error code for each prefix failure and capture its core
warning to verify fixed messages with no submitted URL or stored prefix,
including an invalid prefix containing synthetic query/fragment values.
Integration coverage must verify concurrent equivalent deep links resolve one
activity and idempotent associations. Preserve existing ownership and expiry
regressions.

## Task 5 — Separate OAuth Activity Lookup From Protocol Values

**Files:** `packages/core/src/modules/agent/auth/services/agent-auth.ts`,
`agent-auth.test.ts`, the auth repository's URL-argument documentation, and
`apps/gradebook/src/app/routes/agent/authorize/route.test.node.ts`.

- [ ] Let `createAuthCode()` register the received redirect URI through Task 2.
  Continue saving the original `client_id` and `redirect_uri` unchanged in
  `agent_auth_codes`; do not add schema transforms to either protocol field.
- [ ] In `claimAuthCode()`, retain both exact comparisons and PKCE verification.
  Derive the canonical redirect key only for `findActivityByUrl()` after those
  checks. Map parse failure to the existing unknown-activity/unauthorised
  outcome without a repository lookup.
- [ ] Keep token exchange free of registration and allowlist reads/evaluation.
  Preserve code consumption, expiry, enabled-user checks, scope checks, and
  token issuance from the resolved activity record.
- [ ] Retain the authorisation route's exact `client_id === redirect_uri`
  comparison and `isUsableRedirectUri` safety gate. Do not use the instructor
  component restriction for OAuth callbacks.

**Completion evidence:** an authorisation using an explicit default port followed
by an exchange repeating exactly those original values succeeds and issues a
token for the canonical row. Exchanging an equivalent spelling with the port
removed fails, independently for each exact field comparison. Include
query-bearing protocol values in core binding tests: exact replay remains
acceptable and resolves the component-free activity; this does not test or
redesign browser callback transport. Repository fakes must assert the canonical
lookup argument. Policy and registration spies must remain unused during
exchange, including after an admission-rule change. Route tests keep rejecting
equivalent-but-unequal client/redirect pairs and unsafe redirect syntax.

## Task 6 — Canonicalise Cumulative Targets And Preserve Correlation

**Files:** `packages/core/src/modules/agent/activity-state/schemas.ts`,
`commands.ts`, `services/progress.ts`, `services/progress.itest.ts`, and the
activity-state repository's URL-argument documentation. Add `schemas.test.ts`
and `commands.test.ts` in this module, plus
`apps/gradebook/src/app/routes/agent/activity/route.test.node.ts` for the HTTP
validation contract.

- [ ] Extend the existing `increments_for_other_pages` field refinement. First
  reject repeated raw strings, including malformed strings. Then compare
  canonical keys for successfully parsed inputs; skip parse failures in this
  second set so distinct malformed inputs do not collide on `null`.
- [ ] Preserve submitted strings, factor handling, the issue path
  `increments_for_other_pages`, and the exact message
  `increments_for_other_pages contains duplicate target URLs`. Do not add
  duplicate detection to the service or aggregate/choose factors.
- [ ] Clarify the `rejected_targets` schema comment: per-target admission and
  self-reference rejections preserve valid progress, but request-validation
  failures occur before the handler and reject the entire submission, including
  self progress. Canonical duplicate targets retain this explicit exception.
- [ ] Verify existing warning diagnostics for duplicate validation rather than
  adding or enriching a log event. `CoreUtils.zodParse()` already logs the
  validation issue at `warn`, including its path and specific duplicate-target
  message; the activity route also logs HTTP 400 failures at `warn`. Keep
  duplicate detection in the schema and preserve the existing HTTP response.
- [ ] In `readScopedProgress()`, normalise before repository lookup. Return
  `null` immediately on parser failure; continue omitting unknown activities.
  Query progress with the resolved ID and existing user/scope tuple.
- [ ] Preserve `getProgress()` input occurrence order, including identical and
  canonically equivalent read URLs. Do not deduplicate its input or response.
- [ ] Keep writes routed through registration and compare the resolved target
  ID to `auth.activity_id`. Preserve raw `url` values in both successful
  `others` and `rejected_targets` entries.
- [ ] Retain the request-local lazy policy promise, self high-water mark,
  transaction, user lock, contribution calculation, event creation, and
  line-item updates. Preserve existing no-increase/no-op behaviour.

**Completion evidence:** schema tests cover raw duplicates, default-port/case/dot
variants, query/fragment variants, differing factors, identical malformed URLs,
and distinct malformed URLs. Use the real command wrapper with service and
token-refresh spies to prove canonical duplicates return `ERR_VALIDATION`
before either collaborator runs. The route test must assert HTTP 400 and exactly
`{ "status": "error", "code": "ERR_VALIDATION" }`, rather than relying only on
a schema test to prove the wire response.
Capture the existing core warning for a canonical duplicate request and assert
the duplicate-target issue path and exact message. Assert the route's existing
warning records the failed `set-progress` operation and `ERR_VALIDATION`. Use
synthetic query/fragment variants and verify neither warning contains submitted
URLs, component values, target objects, or the request body. These tests verify
the existing diagnostics; they require no new reason/count fields or extra
warnings.

Integration tests verify one entry per resolved read occurrence in order, raw
response spelling, omission of malformed/unknown inputs, and zero read-side
registration/policy work. Write tests verify canonical self-reference creates no
additional activity or contribution event/line-item update while valid self
progress and other accepted targets commit. Cover canonical target resolution,
per-target malformed/length/policy denials, one lazy policy read for several
unseen targets, and zero reads for known-only targets. Existing progress and
scope-isolation tests must continue to pass.

## Task 7 — Update Both Launch Readers

**Files:** `packages/core/src/modules/app/lti/services/launch.ts` and
`launch.test.ts`; `packages/core/src/modules/app/activities/services/start-activity.ts`
and `start-activity.test.ts`; `packages/core/src/modules/app/activities/schemas.ts`;
and the app activities repository's URL-argument documentation.

- [ ] Normalise the LTI `modulus_activity_url` claim and direct-start
  `activity_url` argument before `ActivityQueries.findActivityByURL()`.
- [ ] Map parser failure to each flow's existing invalid-launch or
  activity-not-found result. Do not insert, consult policy, or try a raw or
  similar URL when lookup fails.
- [ ] Replace the direct-start schema's raw `.max(256)` URL gate, which otherwise
  blocks long spelling variants that resolve to a storable key. Validate with
  the shared parsing contract while preserving the input value. Keep the
  255-character limit in registration as a storage rule; do not introduce a new
  request-size policy in this feature.
- [ ] Continue deriving destinations from `activity.url`. Keep the LTI activity
  ID, line-item reconciliation, enrollment semantics, and academic-scope
  resolution based on the resolved record.
- [ ] Update comments/tests claiming the incoming claim must exactly equal the
  stored URL. Do not change direct-link generation, route extraction,
  middleware, locale redirects, or sign-in transport.

**Completion evidence:** both services must look up the exact canonical key for
case/default-port/dot/root and query/fragment variants received intact. Verify
the returned destination excludes incoming query/fragment and identifies the
resolved activity. Keep missing-activity outcomes and enrollment/scope
regressions. Add a command-schema case with raw input longer than 256 whose
canonical key fits storage. Service tests may verify preserved non-root and
repeated slashes when provided intact, but must not claim this fixes generated
direct links.

## Task 8 — Align Instructor Forms And Server Actions

**Files:** under `apps/gradebook/src/modules/app/activities/`, update
`@types/validate-urls.ts`, `create-activity-code.ts`, `update-activity-code.ts`,
`rejected-urls.ts`, and the create/update form components. Under
`apps/gradebook/src/modules/lti/`, update `actions/deep-linking-action.ts` and
`components/deep-linking-form.tsx`.

- [ ] Replace regular-expression URL identity checks, lowercase-scheme checks,
  and raw prefix comparisons with the exported pure helpers. Remove the scheme
  substring-count heuristic where it conflicts with the platform parser.
  Keep per-line form structure and existing empty-list behaviour.
- [ ] Use parser/component validation for local feedback and let core determine
  admission of unseen activities. Do not add `isUsableRedirectUri()` as a
  blocking instructor-form gate: it would also reject parseable grandfathered
  activities that fail today's admission syntax. Scheme and credential denials
  for unseen activities receive accurate field feedback after submission to
  core. Keep the existing OAuth redirect safety gate unchanged.
- [ ] Validate the original textarea lines before filtering blank lines. Keep a
  mapping from the command array's indexes and submitted spellings back to
  physical line numbers; server-side errors must identify the same lines the
  instructor sees, including blank lines and duplicate spellings.
- [ ] Change `readRejectedUrls()` to preserve each submitted `url` and its
  validated registration `reason`, rather than returning only strings. Narrow
  the unknown error payload defensively. For an otherwise usable entry with a
  missing or unrecognised reason, retain its URL for field correlation and use
  a neutral fallback; do not guess an admission reason. Unusable payloads also
  receive a neutral failure without logging URL-bearing error details.
- [ ] Make `rejectedUrlsMessage()` and its callers in create, update, and deep
  linking choose guidance by reason using the table below. Mixed-reason batches
  must identify the appropriate correction for each affected line; an
  administrator-access instruction applies only to `activity_url_not_allowed`.
  Keep query/fragment rejection on its separate `ERR_VALIDATION` path.
- [ ] Update the denial-order comment in `rejected-urls.ts` and its tests. The
  decoder preserves core's payload order, but canonical sorting followed by
  expansion to submitted spellings does not guarantee raw lexicographic order.
  Use the host's line mapping to present batch errors in physical input order,
  including every occurrence corresponding to a denied canonical key.
- [ ] Preserve typed textarea, prefix, and autocomplete values on rejection.
  Normalised values are used for comparisons and successful persistence; do not
  replace the entered value on blur or on an unsuccessful submission.
- [ ] Map `ERR_VALIDATION` issues to `urls`, `url_prefix`, or `activity_url`
  before generic error logging. Map component warnings separately from
  allowlist-denial copy. Do not send the instructor to request allowlist access
  for unsupported launch parameters.
- [ ] In `deep-linking-action.ts`, handle both prefix error codes from Task 4
  before generic `log.error`, using fixed field messages. Map
  `ERR_DEEP_LINK_PREFIX_MISMATCH` to `errors.activity_url`: “Supply an activity
  URL matching the configured prefix.” Map `ERR_DEEP_LINK_PREFIX_INVALID` to
  `errors.activity_code_id`: “Correct this activity code's URL prefix before
  creating the link.” The form already supports both fields; an invalid stored
  prefix must not be presented as a problem with the entered activity URL.
- [ ] Remove the prefix-message regex and the comment deferring code-based
  handling. Keep unrelated deep-link errors on their existing fallback path.
  Preserve entered URL and code selection on either prefix failure, and clear
  stale code-field errors when the selection changes. Use the same field
  attribution if selection/submit validation detects an invalid loaded prefix.
- [ ] In the deep-link form, remove the early submission-validation return for
  an empty prefix: the activity URL still needs validation. Validate the activity
  URL on committed autocomplete selection and submit, using instructor input
  validation first and the shared canonical prefix comparison when a non-empty
  prefix applies. Use the existing `onValueChange` callback with
  `details.reason === 'item-press'` for selection validation, passing its `value`
  directly rather than reading state immediately after a setter. Always validate
  the current value on submit before invoking the action, including manually
  typed values submitted via Enter without a preceding selection.
- [ ] Use the supported selection callback without adding blur handling.
  UIKit 6.8.2 does not forward an `onBlur` prop to its autocomplete input; this
  plan requires no wrapper focus tracking, portal filtering, or UIKit API
  change. Moving focus away from a manually typed value does not validate it;
  that value is validated on submit. Highlighting a suggestion is not a
  committed selection and must not trigger validation.
- [ ] Replace the deep-link form's live raw-prefix predicate with required-prefix
  help text while the instructor types. Do not report validation errors for
  partial input on each keystroke. When the value changes, clear or suppress
  stale errors for that field from both local validation and the previous
  server response; retaining old action state must not resurrect an error for
  the previous value or prevent resubmission. Preserve pending/no-code button
  guards, and ensure selection errors cannot prevent correction and revalidation.
- [ ] Compare canonical keys when determining whether a deep-link selection
  already exists in the loaded activity list. This is exact canonical identity
  comparison, not a new global search or near-match suggestion feature.
- [ ] After a successful save, existing list/edit reads must display the
  canonical stored activities and prefix. Keep existing success redirects and
  the signed deep-link return form.

| Outcome | Field Guidance |
| --- | --- |
| `activity_url_not_allowed` | Explain that the site does not admit this new activity URL and direct the instructor to an administrator to request access. |
| `malformed_url` | Ask the instructor to correct the URL; explain that new activities require HTTPS, or HTTP for `localhost`/`127.0.0.1`, and cannot contain credentials. |
| `url_too_long` | Explain that the canonical activity URL exceeds the 255-character storage limit and ask for a shorter activity URL. |
| Unsupported query/fragment (`ERR_VALIDATION`) | Use the component-specific warning from Task 3 and preserve the entered value for correction. |
| Missing/unrecognised reason or unusable denial payload | Give a neutral failure message without claiming that administrator approval will resolve it. |

**Completion evidence:** extend `create-activity-code.test.node.ts`,
`components/update-activity-code-form.test.tsx`, and
`actions/deep-linking-action.test.node.ts`; add focused validator, update-action,
create-form, and deep-link-form tests where missing. Exercise client feedback
and server enforcement independently. Cover query/fragment and empty suffixes,
encoded path delimiters, no prefix, canonical prefix variants, multiline error
positions, input retention, known activity variants, and safe error logging.
Replace the existing expectation that malformed denials receive the same copy
as policy denials. Cover every denial reason through all three server actions,
mixed-reason batches, missing/unrecognised reasons, malformed payloads, and
canonical-order versus physical-line-order differences. Assert that syntax,
length, component, and fallback errors do not instruct the instructor to request
access. Include parseable scheme/credential inputs reaching core: unseen inputs
are rejected with syntax guidance, while an existing canonical activity remains
usable without a new client-side admission gate.
Deep-link interaction tests must cover typing and deleting partial URLs without
premature errors; accepting uppercase-scheme/default-port prefix equivalents on
selection and submit; reporting actual prefix mismatches and unsupported
components at those boundaries; correcting both local and server errors and
successfully resubmitting; and submitting a manually typed value via Enter
without first selecting an item. Verify pointer and keyboard selection with
the real UIKit component, and assert validation uses the newly selected value,
not stale state. Merely highlighting a suggestion or moving focus away from
typed input must not validate it. Assert that an invalid submission never
invokes the action, including when no prefix applies.
Action and rendering tests must verify both prefix error codes map to their
intended fields, preserve entered input and code selection, and never call the
generic error logger. Replace the existing test expectation that a prefix
mismatch is logged at error level. Keep an unrelated `ERR_DEEP_LINKING` case
to prove the generic fallback still works. Together with Task 4's tests, verify
neither prefix failure can register or associate an activity or sign a content
item, and neither diagnostic exposes the submitted URL or stored prefix.
Rendering tests must assert the field warning and preserved value, not just a
disabled submit button. Build core before testing consumers of its new exports.

## Task 9 — Align Stored Fixtures And Prove Cross-Flow Identity

**Files:** `packages/core/src/database/seeds/10_activities.ts`,
`packages/core/src/test-support/fixtures.ts`, affected test-local activity
builders, and `packages/core/src/test-support/pg.ts` only if narrow composition
support is needed. Add a focused integration test such as
`packages/core/src/modules/activity-registration/services/activity-identity.itest.ts`.

- [ ] Audit direct inserts into `activities` outside registration. Stored seed
  and fixture values must be canonical; raw spelling variants belong in request
  inputs. Preserve deliberately distinct canonical paths.
- [ ] Keep normal fixture defaults explicit. Do not silently normalise expected
  test values in a way that can hide a broken runtime writer. If a fixture
  accepts arbitrary overrides, reject noncanonical stored overrides or update
  its callers to supply explicit canonical values.
- [ ] Add a PostgreSQL scenario connecting deep-link registration, subsequent
  LTI lookup, agent authorisation/exchange, progress, and page-state access to
  one canonical activity. Use real repositories and services for identity;
  replace LMS, signer/token inspection, and other outbound effects with narrow
  deterministic fakes as appropriate.
- [ ] Assert the deep-link custom URL, resolved launch activity, AGS line item's
  `activity_id`, issued agent token's activity, progress rows, and page-state
  record all agree. Repeat browser-location variants in the same learner/scope
  context, then verify another scope or learner retains independent state.
- [ ] Keep concurrency tests inside individual integration cases; integration
  files sharing the truncating harness must continue running serially.

**Completion evidence:** the cross-flow test would fail if any one reader still
used the submitted raw spelling. Database assertions show one canonical
activity, the intended associations/line item, and shared progress/page state
only within the same learner and academic scope. The fixture audit introduces
no data migration, staging operation, or new production writer.

## Task 10 — Verify Browser Location And Supported Launch Flows

**Files:** `apps/agent/src/core/auth.test.ts`, existing gradebook
`launch-destination.test.node.ts` and `components/lti-launch-activity.test.tsx`,
plus a recorded manual verification result for the implementation review.

- [ ] Extend agent OAuth tests to begin at a location with query and fragment,
  confirm component-free `client_id`/`redirect_uri` on authorisation and token
  exchange, and confirm restoration of the learner's location after the round
  trip. Preserve existing removal of Modulus/OAuth transport parameters and
  existing state/scope checks.
- [ ] Verify immediate LTI navigation and the launch interstitial both derive
  their destination from the stored canonical URL and add Modulus's own
  `modulus` and `scope_id` transport parameters. They must not forward components
  from an incoming URL claim.
- [ ] Perform one end-to-end browser check using a synthetic instrumented
  activity and an authorised test LTI environment: deep link an accepted
  spelling variant, launch it, authenticate the agent, write/read progress and
  page state, and verify the activity is the one tied to the LMS line item.
  Repeat in the same learner/scope context after changing query and fragment.
- [ ] Include an LTI trailing-slash activity to verify its canonical path remains
  intact. Check a supported generated direct link through actual routing, locale
  handling, and sign-in. Record the known non-root trailing/repeated-slash
  limitation for direct links as deferred; do not collapse those identities to
  make the check pass.

**Completion evidence:** agent and destination tests pass, and the implementation
review records the browser scenarios and observed identity/state agreement.
`history.replaceState()` restoration must not be reported as proof of a network
reload, query-dependent content rendering, or fragment scrolling. If the test
LTI environment is unavailable, record the browser check as outstanding rather
than claiming unit tests satisfy it. This plan does not require installing a
new browser-test framework.

## Task 11 — Update Documentation And Audit All URL Paths

- [ ] Update `docs/DATA-MODEL.md` to define canonical `activities.url` identity,
  the unique-key/length contract, and preserved path distinctions.
- [ ] Update `docs/AUTHN-AUTHZ.md` to distinguish canonical activity resolution
  from original OAuth protocol values and unchanged redirect safety checks.
- [ ] Update `docs/CUMMULATIVE-PROGRESS.md` for canonical target resolution,
  whole-request duplicate validation, raw response correlation, read
  multiplicity/order, and resolved-ID self-reference.
- [ ] Update `docs/AGENT.md` with the authoring contract: query/fragment variants
  must share compatible progress and page state; separately graded activities
  require distinct paths. Explain browser-location preservation and unchanged
  learner/scope isolation.
- [ ] Document duplicate contribution targets in `docs/AGENT.md`, with a concrete
  example such as `https://content.test/total?exercise=17` and
  `https://content.test/total?exercise=18` resolving to one canonical target.
  Explain that the entire `set-progress` submission fails, including its self
  progress update, with HTTP 400 and
  `{ "status": "error", "code": "ERR_VALIDATION" }`. The agent emits a
  non-retriable `request-rejected` error; applications must handle that event
  to make it visible to authors or learners. Repeating the unchanged target
  list keeps failing; previously saved progress remains intact and separate
  page-state requests are unaffected.
- [ ] Give authors the correction: submit each canonical contribution target
  once and choose its intended factor explicitly. The server does not combine
  factors or select a target on the author's behalf. Independently graded
  activities require distinct paths. Distinguish this whole-request failure
  from `rejected_targets`, and describe the existing server warnings available
  for diagnosis without promising a URL-bearing diagnostic or author-facing
  warning in the HTTP response.
- [ ] Update `docs/LTI.md` for instructor validation, canonical custom fields,
  stable window targets, and stored launch destinations. Document the known
  direct-link limitation alongside any generated-link instructions.
- [ ] Update `docs/SECURITY-AND-PRIVACY.md` for lookup-before-admission,
  instructor validation versus grandfathering, no network equivalence checks,
  and restricted diagnostics. Preserve the current zero-rule allow-all policy.
- [ ] Review `docs/DYNAMIC-ACTIVITIES.md` for statements that need a link to the
  implemented identity contract. Keep historical proposals labelled as history.
- [ ] Review `docs/DOCUMENTATION-PLAN.md` descriptions for the revised published
  documents. Do not mark the broader planned “Activities & Progress” document
  available unless it is actually written. This implementation plan and its
  analysis remain under `specs/`, outside the published documentation index.
- [ ] Search the full source tree for activity URL equality lookups and direct
  activity inserts. Confirm the four repositories remain exact-key stores and
  every production caller supplies a canonical key: registration, agent auth,
  agent activity state, and app activities (shared by both launch readers).
- [ ] Audit touched schemas for raw length limits or transformations that could
  bypass the new contract. Audit URL-bearing error details and test logger
  captures; no rejected component values may be added to diagnostics.
- [ ] Confirm no alias lookup, allowlist subtree normalisation reuse, path
  lowercasing, full-URL decoding, redirect following, new launch-parameter
  forwarding, or staging cleanup slipped into the implementation.

**Completion evidence:** documentation describes implemented behaviour with the
house front matter and links, explains the residual percent-encoding and
direct-link limits, and makes no claim of merging all standards-equivalent
URLs. The source audit accounts for all four admitting paths and all four URL
repositories. The analysis stays a design record; record implementation status
and verification in this plan when the work is actually complete.

## Task 12 — Run Final Validation And Prepare The Review Handoff

- [ ] Follow the repository test, typecheck, and lint-fix skills when performing
  those workflows. Run the focused tests from each task during implementation,
  then run the complete local gate once the coordinated change is ready.
- [ ] Build core so gradebook consumers resolve the new public helpers from
  `dist`; perform a gradebook production build to catch client-import or export
  packaging errors that service tests cannot detect.
- [ ] Use the dedicated PostgreSQL 18 `_test` database for integration tests,
  following [Testing Strategy](../docs/TESTING.md). Do not reset or reseed
  staging, and do not treat test-database setup as a feature data migration.
- [ ] Run `git diff --check` and verify documentation links/anchors. Keep the
  review diff limited to implementation, meaningful tests, and related docs.
- [ ] Record actual command results, the browser verification outcome, remaining
  deferred limitations, and the acceptance matrix below in the review handoff.
  Do not mark a task complete solely because its code has been written.
- [ ] Following the repository's commit, push, and PR skills, open or update the
  single implementation pull request against `develop`. Describe the canonical
  identity contract, instructor validation, preserved OAuth binding, recorded
  verification, and deferred direct-launch limitation. Pause for independent
  review, address findings, and leave the pull request unmerged.

The current package scripts support these commands from the repository root.
The focused example paths are new files planned above and become runnable after
their tasks are implemented:

```sh
pnpm -F @modulus-learning/core build
pnpm -F @modulus-learning/core test:one src/modules/activity-registration/activity-url.test.ts
pnpm -F @modulus-learning/core test:integration:one src/modules/activity-registration/services/activity-identity.itest.ts
pnpm -F @modulus-learning/gradebook exec vitest run --mode=node src/modules/app/activities/create-activity-code.test.node.ts
pnpm -F @modulus-learning/gradebook exec vitest run --mode=jsdom src/modules/app/activities/components/update-activity-code-form.test.tsx
pnpm -F @modulus-learning/agent exec vitest run --mode=jsdom src/core/auth.test.ts
pnpm -F @modulus-learning/gradebook build
pnpm run ci
git diff --check
```

`pnpm run ci` includes read-only lint, typechecking, all package unit modes, and
the serial database integration suite. `pnpm test` alone omits integration
tests. The current root manifest specifies pnpm 11.10.0 and Node
`^22.18.0 || ^24.11.0 || >=26.0.0`; use the checked-out executable manifests
when preparing the implementation environment.

**Completion evidence:** focused tests, core/host builds, and the full gate pass;
the required end-to-end check has a recorded result; the diff and links are
clean. Keep the new writer and readers together in review and deployment. No
database migration, cleanup, agent release, or deployment action is part of
completing this planning document.

## Acceptance Traceability

| Analysis Requirement | Tasks | Required Evidence |
| --- | --- | --- |
| Shared equivalence profile, idempotence, and preserved distinctions | 1, 2, 7, 9 | Utility tables and exact-key assertions across runtime callers |
| Same activity/progress/page state across query/fragment variants | 5, 6, 9, 10 | Database identity/state assertions and browser round trip |
| Explicit instructor component rejection with no committed partial work | 3, 4, 8 | Command validation, rollback, field-warning and input-retention tests |
| Grandfathering and confirmed zero-rule allow-all behaviour | 2, 3, 5, 6, 8 | Known-row evaluation bypass, empty/non-empty policy cases, and no new blocking instructor syntax gate |
| Concurrent equivalent registration; canonical batch lock order | 2, 3, 4 | PostgreSQL race tests and canonical registration-order assertions |
| Canonical 255-character storage bound | 2, 3, 7, 8 | Activity/prefix shrink/expand and 255/256 cases; prefix schema transformation before length checking with field feedback; removal of raw reader gate |
| Denial reasons and submitted-input correlation | 3, 8 | Reason-specific guidance across all three actions, neutral fallbacks, and mixed-denial errors in physical line order |
| Exact OAuth request binding with canonical lookup | 5 | Exact replay success and equivalent-but-different field failures |
| Side-effect-free additional reads with occurrence order and raw spelling | 6 | Duplicate read and unknown/malformed omission tests |
| Canonical self-reference and whole-request duplicate-write validation | 6 | ID rejection, untouched contribution state, no handler/refresh calls, HTTP 400 |
| Canonical prefixes with retained string-prefix semantics | 1, 3, 4, 8 | Shared prefix cases through core and forms; deep-link selection/submit validation, partial typing, and correction/resubmission tests |
| Actionable deep-link prefix failures | 4, 8 | Distinct mismatch/invalid-prefix codes, correct field attribution, safe core warnings, and no generic host error log or registration/signing effects |
| Canonical deep-link custom field and resolved-code/ID window target | 4, 9 | Signed-payload assertions and cross-flow activity agreement |
| Canonical launch readers and accepted direct-link transport limitation | 7, 10, 11 | Intact-input lookup tests, supported browser flow, documented unsupported paths |
| Browser-location preservation and no instructor launch-parameter forwarding | 5, 7, 10, 11 | OAuth/destination tests and authoring documentation |
| No near-match identity aliases or network discovery | 1, 11 | Distinction tests and source audit |
| Canonical seeds/fixtures; no staging rewrite/merge work | 9, 11 | Direct-insert audit and bounded diff |
| Duplicate-write failure visibility and author guidance | 6, 11 | Existing core/route warning assertions, clarified schema comment, and documented whole-request failure and correction |
| Restricted diagnostics | 2, 3, 4, 6, 8, 11 | Safe messages, logger assertions, and error-detail audit |

## Honest Notes & Open Questions

The zero-rule contradiction was resolved by the maintainer before this plan was
written. No additional product decision is required for the tasks above.

The direct-launch transport format remains a separately deferred decision. The
current generated route can fail for a valid trailing/repeated-slash activity
or select a different registered activity after slash loss. Canonicalisation
does not repair information lost before lookup, and this plan does not select
either replacement format. The analysis explicitly permits implementation with
that limitation.

The staging audit remains maintainer-reported. No database inspection or test
execution is represented by this planning document. All completion evidence
above is required future work.

## Where to go next

- The [canonicalisation analysis](./2026-09-07-activity-url-canonicalization-analysis.md)
  defines the approved identity profile, instructor contract, and deferred work.
- The [allowlist implementation plan](./2026-09-02-activity-url-allowlist-implementation-plan.md)
  records the existing registration architecture and zero-rule policy amendment.
- [Core Composition](../docs/CORE-COMPOSITION.md) explains service and command
  boundaries that the implementation preserves.
- [Testing Strategy](../docs/TESTING.md) explains the unit/integration runners,
  database harness, and complete validation gate.
