# Activity scope client persistence simplification — implementation plan

Date: 2026-08-11
Status: Task 1 complete with review corrections; production implementation has
not started
Related:

- `specs/2026-08-11-activity-scope-client-persistence-analysis.md` — approved
  client-persistence design and source of the required invariants
- `specs/2026-08-04-activity-scopes-analysis.md` — original activity-scope
  analysis, partially superseded for browser context selection
- `specs/2026-08-04-activity-scopes-implementation-plan.md` — completed
  implementation plan for the broader activity-scope feature
- `docs/AGENT.md` — shipped browser-agent authentication and storage behaviour
- `docs/AUTHN-AUTHZ.md` — authorization-code, token, and renewal contracts that
  remain unchanged
- `apps/agent/src/core/activity-context.ts` — current context records and
  foreground publication helpers
- `apps/agent/src/core/auth.ts` — current context resolution and OAuth with Proof
  Key for Code Exchange (PKCE)

## Outcome

Replace foreground-event activity-context publication with a deterministic
last-successful-authentication default while preserving OAuth transaction
binding and established-tab stability.

The work is complete when:

1. an explicit launch context always wins for the receiving tab;
2. an OAuth response uses only the exact context, state, verifier, and return
   location saved before its redirect;
3. a successful verified token response writes one canonical issuer/scope/name
   record to both this tab's `sessionStorage` and origin-wide `localStorage`;
4. an established tab uses its own record before a different local default;
5. a tab without a record selects the most recently authenticated local context
   for OAuth and commits it to the tab only after verified success;
6. no production agent code observes visibility or focus for context
   persistence;
7. OAuth failures do not replace the last successful local default;
8. the published agent changeset and reference documentation describe
   last-successful, last-completion-wins behaviour rather than foreground
   ownership; and
9. the existing activity-scope pull request records the supersession, task
   status, automated verification, accepted failure modes, and deferred manual
   acceptance work.

## Non-Negotiable Contracts

Every implementation task must preserve these contracts:

- `scope_id` remains an opaque partition label, not a capability or entitlement.
- The server continues deriving `user_id` and `activity_id` from authenticated
  context. Browser storage selects neither value.
- A fresh first-party launch supplies an issuer and scope label. The non-LTI
  first-party path supplies the default sentinel explicitly.
- The default sentinel remains
  `00000000-0000-0000-0000-000000000000`.
- The authorization route parses `scope_id` as a UUID and confirms that the
  referenced scope exists without inferring a platform entitlement.
- The selected `scope_id` remains bound into the single-use authorization code
  and resulting access token.
- The token request accepts no replacement `scope_id` from the browser.
- A successful token response must name the same normalized scope as the saved
  OAuth transaction before either context cache is updated.
- The OAuth transaction remains one atomic `sessionStorage` record containing
  state, PKCE verifier, activity context, and exact authored return query and
  fragment.
- A saved OAuth transaction without an OAuth response returns sticky
  `missing_redirect` before either context cache is resolved. This plan does not
  clear, expire, or recover that transaction.
- Recognized launch and OAuth query parameters are removed while unrelated
  query parameters, duplicate names and ordering, and the authored fragment are
  restored.
- `scope_name` remains optional display metadata. It does not participate in
  context identity, selection, authorization, state predicates, or passback.
- Browser storage contains no access token, authorization code, learner id,
  learner name, Canvas term id, course identity, assignment identity, or grade
  data.
- An access token stays in memory. Failure to update a context cache after a
  verified token response does not invalidate that response.
- A local default selected by a tab with no established context is committed to
  the tab only after verified OAuth success. The OAuth transaction, not the tab
  cache, preserves the pre-redirect selection.
- All server-side schema, scoped learner-state predicates, line-item
  reconciliation, score passback, and activity-code reporting behaviour remains
  unchanged.
- The accepted local-default race is last successful OAuth completion wins. Do
  not add browser-event ownership, polling, link rewriting, opener inference,
  cross-tab election, or reconciliation to narrow that race in this plan.

## Execution Rules

- Continue using the existing cumulative pull request from
  `feat/activity-scopes` to `develop`. Do not open a second pull request and do
  not merge it as part of this plan.
- Keep this plan independent from the completed 11-task implementation plan.
  Add supersession notices to the old analysis and plan, but do not rewrite
  their completed task history or append a Task 12.
- Complete tasks in order. After each task is committed, stop for independent
  review and stakeholder feedback before pushing or starting the next task.
- Use one focused conventional commit per task. If review finds a production
  defect in a completed task, add a focused corrective commit before proceeding.
- Include behaviour tests in the same commit as the production changes they
  cover.
- Do not mix the existing activity-launch URL corrective commit or unrelated
  acceptance findings into these task commits.
- Treat the OAuth transaction as the consistency boundary. Storage resolution
  before redirect and cache writes after exchange must not change the context
  used by an in-flight transaction.
- A context-cache write may be best-effort only after token verification. The
  OAuth transaction write remains mandatory before navigation.
- Update the existing Changesets entry rather than adding a second entry for the
  same unreleased agent feature.
- Update the pull request after each reviewed task is pushed. Use a separate
  “Client persistence simplification” checklist matching this plan rather than
  adding task numbers to the old checklist.
- Keep the manual browser work as a final pull-request acceptance gate. Record
  what was exercised without representing automated tests as a substitute.

## Dependency Map

| Phase | Task | Depends on | Primary Boundary |
| --- | --- | --- | --- |
| 0 | 1. Record the revised client-persistence decision | approved analysis | planning and traceability |
| 1 | 2. Replace foreground publication with successful-authentication persistence | Task 1 | browser storage and OAuth callback |
| 2 | 3. Update release documentation and verify the pull request | Task 2 | published contract and acceptance |

## Phase 0 — Decision Record

### Task 1 — Record the Revised Client-Persistence Decision — Complete

Proposed commit: `specs: simplified activity scope client persistence`

Files:

- add `specs/2026-08-11-activity-scope-client-persistence-analysis.md`;
- add `specs/2026-08-11-activity-scope-client-persistence-implementation-plan.md`;
- add a concise partial-supersession notice near the top of
  `specs/2026-08-04-activity-scopes-analysis.md`; and
- add a concise partial-supersession notice near the top of
  `specs/2026-08-04-activity-scopes-implementation-plan.md`.

Work:

- preserve the original documents as the history of the foreground-context
  decision and its completed implementation;
- link both original documents to the new analysis and plan before a reader
  reaches their foreground-specific contracts;
- state that only browser context selection and persistence are superseded;
- keep server scope identity, token binding, state partitioning, passback, and
  reporting contracts under the original analysis;
- define the local record as the most recently completed successful OAuth
  context, not the foreground, current, or opener context;
- resolve the choice to retain a per-tab context in `sessionStorage`; and
- translate every approved client invariant and accepted failure mode into a
  later task and executable acceptance criterion.

Acceptance criteria:

- the new analysis and this plan share the same subject, date, terminology, and
  supersession boundary;
- the new analysis explicitly accepts last-completion-wins local persistence;
- the plan does not reopen any server-side activity-scope contract;
- the original documents remain readable as historical decisions but warn that
  their foreground model will not ship;
- task boundaries require review pauses and focused commits;
- the existing pull request, branch, and pending Changesets entry are named as
  the delivery path; and
- no production code, tests, release metadata, or shipped documentation changes
  are included in this task.

Verification for this task:

```sh
git diff --check
git status --short
```

After independent review signs off:

- push the planning commit;
- update the existing pull request with links to both new specifications;
- add an unchecked three-item “Client persistence simplification” checklist;
- state that the original foreground implementation is superseded before
  merge; and
- leave the pull request explicitly not ready for final acceptance.

## Phase 1 — Agent Behaviour

### Task 2 — Replace Foreground Publication With Successful-Authentication Persistence

Proposed commit: `refactor(agent): simplified activity context persistence`

Files:

- revise `apps/agent/src/core/activity-context.ts`;
- revise `apps/agent/src/core/auth.ts`; and
- revise `apps/agent/src/core/auth.test.ts`.

#### Storage Helpers

- retain one `StoredActivityContext` schema containing `version`, `issuer`,
  `scope_id`, and optional `scope_name`;
- use `modulus_activity_context` as the key in both storage namespaces;
  `sessionStorage` and `localStorage` remain separate stores with separate
  precedence despite sharing a record name;
- replace tab/shared constants with one activity-context key and retain the
  separate `modulus_oauth_session` transaction key;
- retain `readTabContext`, `writeTabContext`, and `clearTabContext` over
  `sessionStorage`;
- add corresponding local-default read, write, and clear helpers over
  `localStorage`;
- make each read parse and normalize the complete record, remove malformed or
  unsupported data from only the storage area read, and never combine fields
  from two records;
- retain complete-context identity comparison for explicit switch diagnostics;
- retain removal of the published agent's legacy issuer-only
  `modulus_base_url` record and also remove the inert acceptance-build
  `modulus_foreground_activity_context` record without reading either one;
- stop reading or writing `modulus_foreground_activity_context` as a context
  source; activity-scope persistence has not shipped, so no compatibility read
  or migration is needed; and
- remove `SharedContextSnapshot`, foreground ownership checks, publication and
  guarded-deletion helpers, module-level listener/logger state, and
  `visibilitychange` and `focus` registration.

#### Resolution and OAuth

- preserve resolution precedence as explicit launch, OAuth response, incomplete
  OAuth transaction, tab context, local default, then no Modulus context;
- on a valid explicit launch, compare against the prior tab context first and
  local default second for an opaque switch diagnostic, replace the tab context,
  and begin OAuth without writing the local default;
- continue requiring the OAuth transaction to be written before navigation;
- preserve the current sticky `missing_redirect` branch: a pending transaction
  without response parameters returns failure before tab/local resolution and
  remains stored for the `sessionStorage` lifetime;
- when no explicit launch, OAuth response, or incomplete transaction exists,
  validate and use a tab context without consulting a different local default;
- when no tab context exists, read and validate the local default and request
  authorization for that exact context without writing the tab record first;
- treat a malformed local record as absent after removing it;
- when registry validation definitively rejects a stored issuer, re-read and
  remove every current tab or local record that still names that issuer, then
  return the existing failure rather than selecting another context during the
  same authentication attempt; do not clear unrelated stored context after an
  invalid explicit query issuer;
- keep storage-unavailable behaviour honest: a fresh context cannot begin OAuth
  if its required tab or OAuth transaction cannot be saved, and a locally
  selected context cannot begin if its OAuth transaction cannot be saved; an
  unavailable local store does not break an explicit or tab-backed flow;
- make OAuth response handling consult only `StoredOAuthSession`, including
  after either context cache changes during the redirect;
- after state, PKCE exchange, response-shape, and normalized scope-match checks
  succeed, write the canonical context to both the tab cache and local default
  without checking focus or visibility;
- log cache-write failures independently and still return the authenticated
  token result;
- make no OAuth-callback cache writes on state mismatch, OAuth error, missing
  code, token request failure, malformed token response, or scope mismatch,
  except that the pending OAuth transaction is still consumed; an explicit
  launch's already selected tab context remains, while a locally restored
  context remains uncommitted;
- allow every successful callback, including one in a background tab, to
  replace the complete local default; and
- use “tab”, “local default”, “selected”, “adopted”, and “persisted” terminology
  in diagnostics. Do not retain logs that imply foreground ownership or treat
  ordinary session/local disagreement as an error.

#### Automated Acceptance Criteria

- a fresh launch writes the explicit context to this tab and its OAuth
  transaction but leaves a different local default unchanged before redirect;
- a verified OAuth callback writes the returned canonical `scope_id` and
  optional `scope_name` to both caches;
- token scope comparison normalizes equivalent UUID case before persistence;
- a token response naming another scope writes neither cache;
- OAuth error, state mismatch, missing code, and token failure do not overwrite
  the prior local default or commit a locally restored context to the tab;
- a tab context takes precedence over a different local default across reload
  and reauthorization;
- a cold tab selects one complete local record, leaves its tab cache empty, and
  binds the selected record into the OAuth transaction;
- verified success commits that selected context to both caches, while failure
  leaves the tab uncommitted so a reload may select a newer local default;
- a pending OAuth transaction without response parameters returns sticky
  `missing_redirect` without falling through to tab or local context;
- changing local storage during OAuth cannot change the issuer or scope used by
  the callback;
- sequential successful callbacks for different scopes leave the last
  completed callback in local storage while each simulated tab record remains
  independent;
- malformed tab and local records are removed independently;
- an invalid stored issuer clears every current tab and local record still
  naming that issuer and does not silently fall through to another context in
  the same call;
- unavailable `localStorage` does not prevent a fresh or tab-backed OAuth flow;
- unavailable `sessionStorage` prevents OAuth navigation because the transaction
  cannot be preserved;
- tab or local cache failure after a verified token response is diagnosed but
  still returns `status: 'authenticated'`;
- the legacy `modulus_base_url` and inert
  `modulus_foreground_activity_context` keys are removed without being read;
- OAuth return-location restoration, duplicate authored parameters, fragments,
  reserved-parameter cleanup, credential redaction, and the exact saved-context
  exchange remain covered;
- production context persistence contains no visibility/focus reads or browser
  event-listener registration; and
- tests contain no synthetic focus/visibility state, event dispatch, listener
  counting, foreground deletion, or shared-snapshot assertions.

Verification for this task:

```sh
pnpm -F @modulus-learning/agent exec vitest run --mode=jsdom \
  src/core/auth.test.ts
pnpm -F @modulus-learning/agent test
pnpm -F @modulus-learning/agent typecheck
pnpm -F @modulus-learning/agent build
pnpm typecheck
git diff --check
```

After the task commit, stop for independent review. Do not update documentation,
the Changesets entry, or the pull-request checklist until review signs off on
the production behaviour and tests. Correct review findings in focused commits
before beginning Task 3.

## Phase 2 — Release Contract and Acceptance

### Task 3 — Update Release Documentation and Verify the Pull Request

Proposed commit: `docs(agent): documented activity context persistence`

Files:

- revise `docs/AGENT.md`;
- revise `.changeset/tidy-tabs-remember.md`;
- revise this plan with task status and verification results; and
- revise `docs/AUTHN-AUTHZ.md` or `docs/SECURITY-AND-PRIVACY.md` only if final
  implementation review identifies an inaccurate browser-storage or trust
  statement. Their server-side token and privacy contracts are expected to
  remain unchanged.

Implementation corrections found during this task belong in focused `fix:`,
`refactor:`, or `test:` commits before the documentation commit. Do not hide a
production correction in documentation or release metadata.

Work:

- update the `docs/AGENT.md` front-matter summary and “Connecting to Modulus”
  resolution order to describe explicit launch, OAuth response, incomplete
  transaction, tab context, local default, and no-context resolution;
- define `sessionStorage` as established-tab context and `localStorage` as the
  last successfully authenticated default for tabs without context;
- state plainly that a background OAuth callback can replace the local default,
  concurrent callbacks use last-completion-wins semantics, and the agent makes
  no foreground or opener-lineage guarantee;
- document that successful OAuth refreshes both caches with canonical scope
  metadata while errors leave the local default unchanged and do not commit a
  locally restored context to the tab;
- document that `missing_redirect` remains sticky and blocks context-cache
  fallback when a saved OAuth transaction has no response parameters;
- retain the registry-validation, PKCE, query-cleanup, reserved-parameter,
  token-bound tuple, open-content, and privacy descriptions;
- remove foreground ownership, guarded deletion, and event-listener claims;
- update the pending minor Changesets entry so it covers per-tab stability,
  last-successful local restoration, OAuth scope binding, cold-tab adoption,
  and canonical `AuthStatus` metadata without promising foreground inheritance;
- verify no shipped documentation outside the superseded historical
  specifications still describes foreground context publication;
- run the complete local continuous-integration gate and sequential production
  builds; and
- update the existing pull request description after independent review signs
  off and the task is pushed.

Automated acceptance criteria:

- `docs/AGENT.md` describes the implemented resolution and persistence order
  without presenting an accepted race as a guarantee;
- documentation still distinguishes the OAuth transaction from both context
  caches;
- documentation states that `scope_id` is a label and the access token is the
  consistency boundary;
- the Changesets entry describes the final public behaviour across both the
  original activity-scope work and this simplification;
- no source or test file contains foreground context functions, event listener
  installation, shared snapshots, or foreground-only diagnostics;
- no shipped documentation claims that local storage represents the focused,
  visible, current, or opener tab;
- lint check, typechecking, unit tests, database integration tests, and all four
  production builds pass;
- the React and vanilla demos compile against the final published-agent surface;
- Git whitespace validation passes against `origin/develop`; and
- the plan and pull request identify manual browser acceptance as pending until
  the stakeholder records the exercised environments and outcomes.

Automated verification:

```sh
pnpm run ci
pnpm -F @modulus-learning/agent build
pnpm -F @modulus-learning/gradebook build
pnpm -F @modulus-learning/agent-demo-react build
pnpm -F @modulus-learning/agent-demo-vanilla build
git diff --check origin/develop...HEAD
```

Run the production builds sequentially. If the integration database is missing
or stale, stop and ask the stakeholder to run `pnpm db:init:test`; do not replace
the full gate with a partial result.

Manual pull-request acceptance:

| Scenario | Expected Result |
| --- | --- |
| Fresh named-term LTI launch | Interstitial names the term; successful callback stores canonical context in tab and local storage |
| Fresh default-scope launch | Successful callback stores the explicit sentinel context |
| Successful callback in an unfocused or background tab | Local default changes without waiting for a browser event |
| Existing tab while another scope becomes the local default | Existing tab retains its session context until an explicit launch changes it |
| Cold tab, bookmark, or typed URL | With no tab context, authenticates the local default and commits it to the tab only after success |
| Two successful OAuth flows in different scopes | Each tab remains stable; whichever callback completes last becomes the local default |
| OAuth error or rejected token response | Prior local default remains unchanged; a locally restored context remains uncommitted |
| Reload and ordinary same-tab navigation | Tab context remains stable; successful reauthorization rewrites the local default even from an old-term background tab |
| Storage unavailable | Open activity remains usable; OAuth fails safely if its transaction cannot be preserved |

Record browser and operating-system versions for the cases actually exercised.
The reduced matrix validates ordinary Web Storage and OAuth behaviour; it no
longer attempts to prove foreground detection, window ownership, or link-opening
lineage.

After independent review signs off:

- push all remaining commits;
- mark all three new-plan checklist items complete in the pull request;
- replace foreground-inheritance claims in the pull request summary with the
  last-successful local-default contract;
- record the final agent test counts, full `pnpm run ci` result, production build
  results, and whitespace check;
- identify the manual browser scenarios still pending final stakeholder
  acceptance;
- retain unrelated acknowledged PR loose ends rather than accidentally removing
  them while editing the description; and
- leave merge and final acceptance to the stakeholder.

## Pull Request Handoff

The existing pull request remains the complete activity-scopes review unit. Its
description should preserve the checked original Tasks 1–11 as implementation
history and add this separate section:

```md
### Client persistence simplification

- [ ] Record the revised analysis and implementation plan
- [ ] Replace foreground publication with successful-authentication persistence
- [ ] Update release documentation and complete verification
```

The pull request summary should state that the original foreground implementation
was completed and reviewed but superseded during acceptance testing before merge.
It should link both new specification files, explain the retained per-tab record
and last-successful local default, and name the accepted background/last-writer
race without framing `scope_id` as an authorization capability.

Update the checklist only after the corresponding task has passed independent
review. A pushed corrective commit belongs under the task whose acceptance it
repairs rather than becoming an unplanned fourth task.

## Out of Scope

- any schema or migration change;
- core authorization, token, learner-state, reporting, line-item, or score-worker
  changes;
- a new agent public API or `AuthStatus` shape;
- a second Changesets entry or a different release level;
- context propagation by rewriting authored links;
- foreground, focus, visibility, page-lifecycle, pointer, keyboard, timer, or
  polling detection;
- `BroadcastChannel`, `storage`-event coordination, opener messaging, tab
  election, or compare-and-swap ownership;
- storing user identity, access tokens, authorization codes, PKCE values, Canvas
  term ids, course ids, or gradebook data in the context caches;
- platform-entitlement checks for agent-selected scope labels;
- compatibility reads or migration for the unshipped
  `modulus_foreground_activity_context` key beyond deleting the inert record;
- changing the existing query-parameter transport or reserved parameter set;
- changing the stakeholder decision to keep the target activity URL readable in
  the LTI interstitial route; and
- merging or accepting the cumulative activity-scopes pull request.
