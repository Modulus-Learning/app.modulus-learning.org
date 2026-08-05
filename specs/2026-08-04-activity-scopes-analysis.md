# Activity scopes: term partitioning, token binding, and client transport — analysis

Date: 2026-08-04
Status: planning recommendation; no implementation has started
Related:
- `docs/ARCHITECTURE.md` — three-tier model and the Tier 2 ↔ Tier 3 privacy boundary
- `docs/AUTHN-AUTHZ.md` — current learner, administrator, and agent token model
- `docs/AGENT.md` — current four-path browser authentication flow
- `docs/DATA-MODEL.md` — current learner-state and LTI tables
- `docs/LTI-SCORE-SUBMISSION.md` — score-passback queue and line-item lifecycle
- `apps/agent/src/core/auth.ts` — current issuer transport and OAuth + PKCE client
- `packages/core/src/modules/agent/auth` — current agent authorization-code and token services
- `packages/core/src/modules/agent/activity-state` — current progress and page-state predicates
- `packages/core/src/modules/app/lti` — current launch validation, term inputs, and line-item writes
- [Canvas LTI variable substitutions](https://canvas.instructure.com/doc/api/file.tools_variable_substitutions.html) — official source for `Canvas.term.*` availability and fallback behaviour

## Question

How should Modulus isolate activity state and Assignment & Grade Services (AGS)
score passback by academic term while preserving reloads, ordinary multi-page
navigation, and concurrent work in more than one term?

The design must preserve the defining Tier 2 ↔ Tier 3 privacy rule: activities
must not receive learner personally identifiable information (PII), Canvas
course identity, or LMS gradebook data. They may receive an opaque scope label
and, when available, its human-readable term name. A scope is not an
authorization boundary. It is a partition key that determines which term bucket
receives and returns the learner's work; the name is display-only metadata.

## Why Date Cutoffs Are Insufficient

The original Modulus design planned to separate semesters at read time with
instructor- or administrator-selected cutoff dates. If a spring term began on
20 January, a spring report could count progress received on or after that date,
while a fall report counted progress received before it.

That model cannot represent the required semantics:

- a learner completing an incomplete after the semester ends would submit after
  the next term's cutoff even though the work still belongs to the old term;
- a receipt timestamp describes when Modulus observed a write, not the academic
  context in which the learner did the work;
- page state is a latest-value snapshot, so a date filter cannot recover the
  correct term-specific value after it has been replaced;
- normalized progress is a monotonic high-water mark, and cumulative progress
  can update several activities in one transaction, so retroactively assigning
  values by date is ambiguous;
- learners may work in concurrent terms, and term dates or individual extensions
  may overlap.

Activity scopes move the distinction to write time. Every progress value,
progress event, page-state snapshot, and line item carries the label of the term
context in which it belongs. State restoration and passback then select matching
labels instead of reinterpreting timestamps.

This rejection of date cutoffs is specific to operational attribution. Activity
codes serve a different purpose: they let instructors and course coordinators
observe activity usage across large cohorts that may span Canvas courses,
sections, and semesters. For those aggregate statistical questions, a coarse
date window may be entirely appropriate, especially because late incomplete work
is expected to be rare. Activity-scope design must not silently redefine those
analytics semantics.

## Executive Recommendation

Adopt activity scopes, with the following design decisions:

1. Model a scope as a platform-qualified academic term, with one global default
   sentinel for launches that do not provide a usable term id.
2. Derive term identity only from a verified Learning Tools Interoperability
   (LTI) launch, then send the resulting opaque `scope_id` to the activity as a
   label. A learner may request any existing scope; choosing the wrong one
   misroutes that learner's work but does not grant access to another learner or
   activity.
3. Bind the client-selected `scope_id` into the authorization code and agent
   access token. This makes one token internally consistent across reads,
   writes, cumulative progress, and passback; it is not an entitlement check.
4. Extend `AgentAuth` from `(user, activity)` to `(user, activity, scope)` and
   make that tuple govern every progress, page-state, cumulative-progress,
   line-item, and passback predicate.
5. Keep the proposed two-store client model: `sessionStorage` is this tab's
   committed context; `localStorage` is the most recently foregrounded context
   for cold tabs.
6. Publish or delete shared context only under rules that prevent an unfocused
   background tab from replacing or erasing the foreground record. Use both
   `visibilitychange` and `focus` because neither event covers all foreground
   transitions by itself.
7. Treat foreground inheritance as a product semantic and a best-effort routing
   heuristic. It does not need to be a security guarantee, but a routing mistake
   can silently prevent the learner's progress from matching the Canvas line
   item and therefore from reaching the gradebook.
8. Use a non-null default-scope sentinel in scoped tables. This keeps composite
   keys and query predicates uniform and prevents SQL `NULL` uniqueness traps.
9. Leave `enrollment`, `activity_code_member`, and activity-code cohort semantics
   unscoped pending stakeholder discussion. Update the existing instructor
   progress join only enough to preserve one result per enrollment after
   `progress` gains multiple scope rows.
10. Show verified term context on the first-party Modulus launch interstitial
    when a name is available. Permit the nullable, human-readable name to be
    exposed to the agent for understandable student confirmation; never use it
    to select a bucket.
11. Treat a missing, empty, null, or unexpanded Canvas term id as the default
    scope. Term name and start/end dates are independently nullable and never
    block an otherwise valid launch.
12. Carry `scope_id` from the verified launch to the interstitial in the
    first-party redirect query, resolve its canonical metadata through
    `startActivity`, and then place it in the activity query string. Do not
    store it in the learner session cookie or use the fragment.
13. Make the non-LTI launch path send the default sentinel explicitly. This
    path does not infer or inherit a prior LTI term and otherwise participates
    in the same per-tab/shared-context model as every fresh scoped launch.
14. Keep one line-item row for the existing learner/activity/line-item URL
    identity. If a later verified launch reports a different scope for that
    identity, rebind the row to the new scope, reset its submission state, and
    log the transition. This baseline requires stakeholder confirmation before
    implementation.

The design combines the two-store transport with a strict foreground-write rule,
scope-complete operational state and passback predicates, and an explicit account
of the residual client ambiguity.

## Design Assessment

### Sound Design Decisions

The following decisions are load-bearing:

- **Term, not section, is the isolation boundary.** Work should survive a
  section transfer within one term and remain separate across terms.
- **The agent token is the consistency point.** `scope_id` belongs beside
  `user_id` and `activity_id` in `AgentAuth`; once the token is minted, every
  operation under it uses the same tuple.
- **`sessionStorage` alone is insufficient.** A new top-level browsing context
  cannot be assumed to inherit the opener's per-tab state.
- **A shared recent-scopes map cannot infer lineage.** A map of possible scopes
  says what exists, not which source tab caused a navigation.
- **Both foreground signals are needed.** `visibilitychange` covers tab changes
  inside a focused window; `focus` covers window and application transitions.
- **Link interception should not be the baseline.** Avoiding DOM rewriting and
  activation interception keeps the first version smaller and removes a broad
  accessibility and author-content compatibility surface.
- **A non-null sentinel is the cleanest default representation.** It makes
  latest-value composite keys and all token-driven filters one uniform shape.
- **Wrong-bucket failures are not leaks, but they can affect grades.** A
  transport mistake does not cross the token's learner or activity boundary.
  It can still leave progress in a scope that has no matching line item, causing
  the work to be omitted from Canvas without an existing learner- or
  instructor-visible signal.

### Scope Selection and Security

A signed or opaque scope capability would be over-engineering. The learner
already controls self-reported progress for the authenticated activity, and
`scope_id` only chooses which of that learner's buckets the work uses. Selecting
another valid scope neither changes `user_id`/`activity_id` nor exposes another
learner's state.

The server should perform structural checks: parse the UUID, confirm the scope
exists, and decide whether a platform association should be checked to catch an
accidental issuer/scope mismatch. Those checks protect referential and product
integrity; they do not establish an entitlement.

The requested `scope_id` should still be copied into the single-use
authorization code and then into the agent token. That prevents a token exchange
or individual activity request from changing buckets midway through one agent
session. The binding is a consistency invariant, not a security control.

### Required Refinements

#### A Fresh Background Launch Must Not Overwrite the Foreground Record

Allowing every fresh launch and every foreground transition to write
`localStorage` creates a race:

1. term A is open and remains foregrounded;
2. an LTI link for term B opens in a background tab;
3. the background tab processes its fresh launch and writes B to
   `localStorage`;
4. A receives no new `focus` or `visibilitychange` event because it never left
   the foreground;
5. a link opened from A now incorrectly inherits B.

A fresh launch must always commit to its own `sessionStorage`, but it may publish
to shared `localStorage` only through the same foreground predicate as every
other writer:

```ts
document.visibilityState === 'visible' && document.hasFocus()
```

The agent should call one `publishIfForeground()` function at initialization and
from both event listeners. This makes “foregrounded context” the actual write
rule instead of merely the intended meaning of the shared value.

#### Foreground Inheritance Is a Routing Heuristic

Focus publication is a strong operational heuristic for user-opened tabs, but it
does not establish a reliable happens-before relationship across browsers,
back-forward cache restores, window managers, and all link-opening modes.

The product contract should instead say:

- a tab with committed `sessionStorage` never silently changes scope;
- a cold tab adopts the latest foreground context available for that activity
  origin;
- a fresh verified LTI launch is the only operation that introduces a new
  non-default scope into client storage;
- the server rejects only malformed or unknown labels, not labels the learner is
  supposedly unauthorized to use.

A bookmark or typed URL has no opener lineage at all. Under the proposed
“current term” model, it deliberately adopts the last foreground context. That
is a product semantic, not evidence that the bookmarked URL intrinsically
belongs to that term.

#### Telemetry Cannot Observe the Silent Residual Directly

A truly cold child has no independent expected scope. If it inherits the wrong
foreground value, it has nothing authoritative to compare against, so it cannot
emit a definitive “would-be wrong bucket” event.

Modulus can observe useful proxies—concurrent tab divergence, cold inheritance,
unknown scope labels, and explicit LTI term switches—but not the silent lineage
error itself. Reconsidering href propagation should therefore be driven by those
proxy rates, support reports, and reproducible failures, not by a metric
described as direct detection.

#### Verified Term Context Should Be Human-Readable

The existing LTI flow already renders a Modulus-owned launch interstitial before
redirecting to the activity. When Canvas supplies a term name, that page can
display a normal, accessible sentence such as “This launch records work in
Autumn 2026; progress from other terms remains separate.” When no name is
available, the launch should continue with generic wording rather than fabricate
a student-facing label or expose the raw Canvas term id.

The interstitial is the baseline confirmation surface because:

- the message can be server-rendered as ordinary text and does not need a live
  region unless it changes dynamically;
- every fresh LTI launch gets the context, regardless of which agent UI bundle
  the activity embeds;
- the notice describes the verified incoming launch rather than inferring a
  term switch from shared browser state.

The term name is not PII, a credential, or a bucket identifier, so it does not
need to be hidden from the activity. The agent contract may expose the nullable
name later so activity UI can give the same understandable confirmation. Such a
field is display-only: `scope_id`, not the name, remains the partition key.

#### The First-Party Scope Handoff Must Be Explicit

The verified LTI launch currently ends with a redirect to a fresh first-party
GET. The interstitial then calls `startActivity(activityCode, destinationURL)`,
which performs a separate enrollment and activity lookup and does not see the
verified launch response. Scope therefore needs an explicit handoff across both
steps.

Use a query parameter for that handoff:

1. the verified LTI launch redirects to the interstitial with the resolved
   `scope_id`;
2. the interstitial validates the UUID and supplies it to an extended
   `startActivity` request;
3. core resolves the canonical scope record and returns its id and nullable
   display name with the existing activity result; and
4. the interstitial appends the issuer and canonical `scope_id` to the activity
   query string.

The redirect does not need to carry `scope_name`, and the learner session
cookie remains unscoped. The query representation fits the existing recognized
parameter cleanup and preserves authored URL fragments. A fragment transport is
rejected because Ximera activities may use fragments for in-page navigation and
OAuth redirect construction deliberately drops them.

#### The Non-LTI Launch Path Uses the Default Scope Explicitly

The separate `/[lng]/start-activity/<code>/<url>` path has no verified LTI
launch and therefore no platform term. It is currently effectively unused and
is expected to become deployment-configurable. Deployments that accept LTI
launches will generally disable it, while non-LTI deployments may enable it.

When enabled, this path must append `scope_id` with the fixed default sentinel
to the activity URL. The agent treats that incoming value as a normal fresh
scope context: it commits the default scope to the current tab and publishes it
only under the foreground rule. It does not infer a scope from earlier LTI use or
from shared storage. This lets the path coexist predictably with other scoped
tabs if a deployment enables both despite the expected deployment split.

#### Scope Divergence Can Silently Omit a Grade

Once `updateLineItems` includes `scope_id`, a progress event and its Canvas
line item can legitimately share the same learner and activity but fail to
match. The event is still accepted into the learner-selected bucket, while no
line item becomes eligible for submission. A zero-row update alone is not an
error because many activities have no line item; the suspicious case is a
zero-row scoped update when a live line item exists for the same learner and
activity in another scope.

The implementation should emit a structured server diagnostic for that
condition without updating the other scope. This feature must record the
academic consequence as an operational risk. Whether the signal also appears to
the learner or instructor requires stakeholder and UX discussion, but silent
cross-scope divergence should remain observable to operators.

Do not implement that diagnostic as a second query after a zero-row update.
Having no line item is the normal case, and `updateLineItems` runs once for the
current activity plus once for every cumulative target whose high-water mark
advances, all inside the per-user advisory-lock transaction. A follow-up probe
would therefore add a round trip on the hottest and most common path.

Return the update result and mismatch classification from one SQL statement:

1. materialize eligible line-item candidates for the learner/activity, including
   live and cutoff predicates;
2. update only candidates whose actual row `scope_id` matches the token;
3. return `updated_count`; and
4. return `scope_mismatch = true` only when no row was updated and an eligible
   candidate exists in another scope.

The actual `UPDATE` must retain `lineitems.scope_id = token.scope_id`. Do not
broaden the update to other scopes and use `CASE` merely to preserve their
values: PostgreSQL would still lock and create new row versions for those
line items, weakening isolation and interfering with passback workers. A
sentinel token also does not prove the deployment is single-bucket. Mixed-scope
deployments can produce sentinel context through a missing term substitution,
the non-LTI path, or a transport error, so an unconditional sentinel shortcut
would suppress a real mismatch.

#### A Canvas Term Reassignment Rebinds the Existing Line Item

A Canvas administrator or instructor may move a course to a different term.
The same course-scoped line-item URL can then arrive in a verified launch with a
different resolved `scope_id`. This is an exceptional reassignment, not a
routine reason for two independent rows with the same line-item URL.

Keep the existing unique identity `(user_id, activity_id, lineitem_url)`. Do not
encode same-scope and rebind behaviour as a long conditional
`INSERT ... ON CONFLICT DO UPDATE`: the same-scope branch must retain the
existing high-water mark, while the rebind branch must replace it exactly and
reset several fields only in that branch. Repeating the scope comparison across
multiple SQL `CASE` expressions would make the academic boundary difficult to
review and maintain.

Use one lock-aware reconciliation operation inside the existing launch
transaction:

1. attempt a fully initialized `INSERT ... ON CONFLICT DO NOTHING RETURNING`;
2. if the insert succeeds, reconciliation is complete;
3. after a conflict, select the existing unique-key row `FOR UPDATE`;
4. compare the incoming scope with the now-locked row; and
5. issue one explicit same-scope update or one explicit rebind update.

The transaction boundary alone is insufficient: an ordinary read does not stop
another launch or score worker from changing the row before the branch writes.
The conflict-tolerant insert handles the case where no row yet exists, which a
`FOR UPDATE` read cannot lock, while the locked read serializes decisions for an
existing row.

The same-scope branch applies ordinary upsert behaviour, including
`GREATEST(existing, incoming)` for `submittable_progress`, without resetting
submitted progress, leases, or error state. The rebind branch updates the
existing row to the newly verified scope and resets its submission state:

- set `scope_id` to the new scope;
- set `submitted_progress` to zero and clear `submitted_at`;
- replace `submittable_progress` with the maximum calculated from events in
  the new scope, rather than carrying forward the old high-water mark;
- clear stale dead, retry, and lease state so a queued submission from the old
  scope cannot remain authoritative; and
- apply the ordinary current-launch fields and revival behaviour.

Do not update historical `progress`, `progress_events`, or `page_state`
rows. Work recorded in the old term remains in the old scope and does not become
submittable after the course moves. Log the reassignment with opaque record and
scope ids. An already in-flight external Canvas request cannot be recalled, so
the transition and any fenced stale completion also need diagnostics.

This is the recommended baseline, but stakeholders must confirm the academic
semantics before the line-item task begins.

#### Activity-Code Analytics Are a Separate Decision

Adding `scope_id` to `progress` changes its key from `(activity_id, user_id)` to
`(activity_id, user_id, scope_id)`. The current instructor report joins
`enrollment` to `progress` on only the first two columns. After the key change,
that join can return one row per historical scope for a single enrollment.

That cardinality problem needs a compatibility fix, but it does not imply that
`enrollment`, `activity_code_member`, or the report itself should become scoped.
Activity codes intentionally support statistics over broad cohorts: several
Canvas sections in one semester, or even courses across several semesters, may
share one code. Adding `scope_id` to the enrolment graph would change that model
rather than merely adapt it to the new progress key.

The baseline should leave the enrolment graph unchanged and make the existing
join return one compatibility row per `(user, activity)`—for example, by joining
a derived aggregate over scoped progress. An all-time maximum is the closest
equivalent to today's monotonic high-water mark, but even that projection should
be documented as compatibility behaviour rather than the final analytics
contract.

Semester-specific activity-code statistics should be postponed for stakeholder
discussion. Possible future designs include coarse date windows over
`progress_events`, optional scope filters, or a separate cohort model. The right
choice depends on which statistical questions instructors and course
coordinators need to answer; this feature should not choose unilaterally.

## Current-State Findings

Activity scopes do not exist in the current implementation.

### Agent Authentication Today

`apps/agent/src/core/auth.ts` chooses among four paths:

1. handle an OAuth response in the URL;
2. accept a fresh `?modulus=<issuer>` launch;
3. re-authorize with an issuer cached in `localStorage`;
4. operate locally when no issuer exists.

The agent stores PKCE state in `sessionStorage`, strips recognized launch and
OAuth parameters with `history.replaceState`, and uses the query-free,
fragment-free activity URL as both `client_id` and `redirect_uri`.

The server's `createAuthCode` stores `user_id`, `client_id`, `redirect_uri`, and
the PKCE challenge. `claimAuthCode` verifies those values, resolves the activity
from the redirect URL, and mints a token containing `{ user, activity_id,
renew_after }`. No launch context survives from the verified LTI request into
this later agent flow.

There are also two first-party activity launch paths. The LTI route redirects
from the verified launch handler to an interstitial GET, which independently
calls `startActivity`; neither that request nor `StartActivityResponse` carries
the verified launch result today. The separate non-LTI start-activity page calls
the same core command and appends only the issuer to the activity URL.

`agent_refresh_tokens` exists in the Drizzle schema and migration history but
has no runtime readers or writers. Agent renewal currently reissues from a
verified access token. Activity scoping therefore changes
`agent_auth_codes` and token renewal, but deliberately leaves the unused
`agent_refresh_tokens` table unchanged.

### Learner State and Passback Today

The current keys and predicates are unscoped:

| Surface | Current identity |
| --- | --- |
| `progress` | primary key `(activity_id, user_id)` |
| `page_state` | primary key `(user_id, activity_id)` |
| `progress_events` | filters and indexes by user/activity/time |
| `lti_lineitems` | unique `(user_id, activity_id, lineitem_url)` |
| agent token / `AgentAuth` | `(user_id, activity_id)` |
| cumulative progress | source and target writes use the token's user, but no term |
| instructor progress report | joins `enrollment` to `progress` on user/activity |

`ActivityProgressService.setProgress` also updates all live line items for the
same user/activity. Without a scope predicate, progress reported in a later term
can make an earlier term's line item eligible for submission.

### Canvas Term Inputs Are Not Configured Yet

Canvas documents `Canvas.term.id`, `Canvas.term.name`, `Canvas.term.startAt`, and
`Canvas.term.endAt` as LTI variable substitutions. An unsupported or unavailable
substitution can arrive as the literal variable name rather than as a resolved
value, and Modulus must not assume that the optional name or dates accompany a
valid term id.

Modulus's current deep-link custom-field map requests course and assignment
variables but not `Canvas.term.*`. The feature needs configuration changes plus
defensive normalization: a usable term id selects a non-default scope; a missing,
empty, null, or unexpanded id selects the default sentinel. The name and dates
are independently nullable. Missing, malformed, or unexpanded optional metadata
is ignored and may be logged diagnostically, but does not reject the launch.

## Required Invariants

The implementation plan should be rejected if it cannot preserve all of these:

1. **Scope creation.** Only a verified LTI launch creates or resolves a new
   non-default scope from Canvas term identity. The client may later select any
   structurally valid existing `scope_id`.
2. **Tuple consistency.** Agent state is addressed by `(user_id, activity_id,
   scope_id)`. The authenticated learner and activity come from server context;
   the scope label is selected by the client and fixed in the token.
3. **Passback isolation.** An event in scope A can update only line items in A.
4. **Cumulative isolation.** Contributions to other activities retain the source
   token's `scope_id`; the request cannot name a different one.
5. **Tab stability.** Once a tab commits a scope, reload and token renewal do not
   replace it because another tab foregrounds a different term.
6. **Controlled introduction.** Shared storage may propagate an existing scope
   label, but only a fresh verified launch may introduce a newly resolved
   non-default scope into browser storage.
7. **Privacy-safe activity context.** The activity may receive the opaque
   internal scope UUID and an optional human-readable term name, but not Canvas
   course identity, learner PII, or LMS gradebook data. The name is never used as
   identity.
8. **Deterministic default policy.** A missing, empty, null, or unexpanded Canvas
   term id selects the default sentinel. Missing or invalid optional term
   metadata does not stop an otherwise valid launch.
9. **Explicit LTI handoff.** The verified launch sends `scope_id` through the
   first-party interstitial query, and `startActivity` resolves the canonical
   scope record before the activity receives it.
10. **Explicit non-LTI default.** A non-LTI activity launch sends the sentinel as
    a fresh scope context rather than inheriting a previous LTI term.
11. **Historical integrity.** Passing a term boundary does not invalidate its
   label or delete, merge, or relabel stored state. Whether Modulus accepts new
   work before `starts_at` or after `ends_at` is a separate stakeholder policy
   decision.
12. **Stable line-item identity.** The existing learner/activity/line-item URL
    remains unique. A verified scope change rebinds that row and resets
    submission state without relabelling historical learner activity state.
13. **Observable passback divergence.** A scoped progress update that finds no
    matching line item while another-scope line item exists emits a structured
    diagnostic and never updates the other scope.
14. **Accessible context.** When a human-readable term name is available, a
    learner can determine the verified term on the Modulus launch interstitial
    without operating a modal or answering a term disambiguation question.

## Proposed Domain Model

### Scope Identity

A term scope should have an internal UUID and a platform-qualified external key.
Canvas's numerical term id is not globally unique and should be stored as text so
the model does not make Canvas's current representation a cross-platform schema
contract.

Conceptually, `scopes` needs:

| Column | Purpose |
| --- | --- |
| `id` | internal UUID used by tokens and foreign keys |
| `platform_id` | nullable only for the global default sentinel |
| `external_id` | platform-supplied term id; nullable only for default |
| `name` | nullable, human-readable display metadata; may be exposed to the agent |
| `starts_at` / `ends_at` | optional descriptive term metadata |
| `last_verified_launch_at` | latest accepted LTI launch; useful for operations, not authorization |
| timestamps | audit and maintenance support |

Non-default scopes are unique on `(platform_id, external_id)`. Add checks or
equivalent service invariants so only the sentinel may omit the platform and
external id.

Term metadata is mutable and independently nullable. A verified later launch may
update a valid name or date, but a missing, malformed, or unexpanded optional
value should neither reject the launch nor erase a previously known value. Date
parsing should accept only explicitly supported formats. The external term id is
the only Canvas-supplied value that determines the bucket.

### Default Scope Sentinel

Use `00000000-0000-0000-0000-000000000000` as the one global default scope and
materialize it in the migration that introduces `scopes`.

All scoped foreign keys should be `NOT NULL` and default to the sentinel during
the migration. This is preferable to nullable scope ids because:

- Postgres primary-key columns cannot be null;
- ordinary unique constraints consider null values distinct;
- every repository predicate can use `scope_id = $1`;
- `ON DELETE RESTRICT` prevents term work from being collapsed into a default
  bucket;
- existing rows have one deterministic backfill destination.

The sentinel is the canonical bucket for launches without a usable Canvas term
id, including missing, empty, null, and unexpanded values. This fallback does not
require a deployment mode. It preserves a valid launch even when Canvas cannot
report a term, while keeping all repository predicates non-null and uniform.

### Canvas Launch Normalization

Normalize each Canvas field independently, with the term id as the only field
that selects or creates a bucket:

| Canvas input | Normalized result |
| --- | --- |
| usable `Canvas.term.id` | resolve or create `(platform_id, external_id)` scope |
| missing, null, empty, or unexpanded `Canvas.term.id` | select the default sentinel |
| usable `Canvas.term.name` with a usable id | update nullable display metadata; optionally expose it as `scope_name` |
| usable `Canvas.term.startAt` / `endAt` with a usable id | parse and update the corresponding nullable bound |
| missing, null, empty, unexpanded, or malformed optional metadata | leave previously known valid metadata unchanged and continue the launch |
| optional metadata without a usable id | do not mutate the global default-scope row; use generic default-context wording |

This prevents partial substitutions from turning into false identity. In
particular, a name or date must never become a substitute key when the id is
absent, and metadata from one default-scope launch must not label every other
default-scope launch.

## Scope Label Semantics

The internal scope UUID is deliberately safe to expose to the activity. It is an
opaque label, not a secret and not a capability. Possessing it does not change
the authenticated learner or activity, and the learner is allowed to select any
existing scope for their own work.

The server needs only structural validation at the agent authorize step:

- the value is a valid UUID;
- the referenced scope exists;
- the requested activity URL still resolves under the existing agent rules;
- optionally, the scope/platform pairing is coherent if the product chooses to
  reject accidental cross-installation labels.

The last check is an open integrity decision, not an authorization requirement.
If Modulus accepts a valid label from another platform, the practical result is
normally an isolated bucket with no matching line item.

## End-to-End Token-Binding Flow

The proposed flow keeps the existing OAuth Authorization Code + PKCE handshake
and fixes the client-selected label for the duration of that handshake and the
resulting token:

```text
verified Canvas id_token
        │
        ▼
derive/upsert term scope, or choose default sentinel
        │
        ▼
redirect to Modulus interstitial with ?scope_id=<uuid>
        │
        ▼
startActivity resolves canonical scope metadata
        │
        ▼
Modulus launch interstitial ── show term name when available
        │
        ▼
activity query receives issuer + opaque scope_id
        │
        ▼
/routes/agent/authorize
  • requires learner session
  • validates redirect/activity
  • validates that scope_id is structurally usable
  • writes requested scope_id into single-use auth code
        │
        ▼
/routes/agent/token
  • verifies PKCE and existing code bindings
  • reads scope_id only from claimed auth-code row
  • mints { user, activity_id, scope_id, renew_after }
  • may return nullable scope_name as display metadata
        │
        ▼
agent commands filter every read/write by the bound token tuple
```

The token endpoint should not accept a second `scope_id` that can differ from the
one stored with the authorization code. This is not because the learner lacks
permission to choose another scope; it keeps one OAuth exchange internally
consistent and avoids an accidental bucket change between its two steps.

`TokenRefreshService` must copy `scope_id` from verified `AgentAuth`, re-check
the user and activity as it does today, and leave the scope unchanged. Renewal
may extend a token lifetime; it may not reinterpret the tab's context. Date-based
acceptance policy, if stakeholders adopt one, must be evaluated independently of
the token's stable scope binding.

## Client Context Transport

### Stored Record

Store one versioned record atomically rather than independent issuer and scope
keys:

```ts
type StoredActivityContext = {
  version: 1
  issuer: string
  scope_id: string
  scope_name?: string
}
```

This prevents an issuer from one launch being combined accidentally with a scope
from another stored record. Validate the parsed shape and clear malformed or
unsupported records. `scope_name` is optional display metadata populated only
when available from a verified launch or server response. It may be absent or
stale without affecting bucket selection. Never include the Canvas term id,
course id, user id, or token in this record.

There are no live Modulus deployments, so the agent does not need a staged
compatibility path for the existing `modulus_base_url` key. The implementation
may replace the old storage shape directly. Any context constructed without an
explicit scope label uses the default sentinel.

### Resolution Rules

Use the following order:

1. **Fresh launch context present.** Validate the issuer through the existing
   registry path, commit the incoming record to this tab's `sessionStorage`, and
   publish it to `localStorage` only if `publishIfForeground()` succeeds. LTI
   supplies the verified resolved scope; the non-LTI launch path supplies the
   default sentinel explicitly.
2. **OAuth response present.** Recover the exact context saved in
   `sessionStorage` before the redirect; do not consult shared storage during the
   response exchange.
3. **Committed tab context present.** Use `sessionStorage`. A reload or normal
   navigation in this tab stays in its term even if another tab has since
   published a different context.
4. **Cold tab with shared context present.** Adopt the complete `localStorage`
   record and seed `sessionStorage` before requesting an auth code.
5. **No context.** Operate locally for an unlaunched activity. A legacy or
   manually constructed Modulus launch context that has an issuer but no scope
   label normalizes to the default sentinel rather than requiring a relaunch; it
   does not inherit a previous LTI scope.

For switch diagnostics, compare a fresh incoming `scope_id` with the prior tab
record first and the shared record second. Then replace the committed tab record.
Do not compare only with `localStorage`; the tab record is the more accurate
history for a same-tab LTI relaunch.

### Foreground Publication

Install both listeners and route all shared writes through one guarded function:

```ts
const publishIfForeground = () => {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return
  // write this tab's complete, validated context record to localStorage
}

document.addEventListener('visibilitychange', publishIfForeground)
window.addEventListener('focus', publishIfForeground)
```

This function is conceptual, not implementation-ready code. The implementation
also needs listener cleanup, storage-error handling, record validation, and
tests with controllable focus/visibility state.

Do not write shared context merely because authentication completed or a token
was renewed. Those events can occur in a background tab and do not mean that tab
became the product's current term.

Shared deletion follows the same ownership rule. A transient OAuth response such
as `access_denied` clears only the tab's OAuth/session state. It must not erase
the origin-wide record. Code may delete a definitively invalid shared issuer only
after comparing the record being deleted and satisfying the foreground rule; an
unfocused background tab cannot clear a valid foreground context.

### Behaviour Matrix

| Scenario | Expected source | Result |
| --- | --- | --- |
| fresh LTI launch in foreground | incoming `scope_id` | commit tab + publish shared |
| fresh LTI launch in background | incoming `scope_id` | commit tab only; publish when foregrounded |
| non-LTI first-party launch | explicit default sentinel | commit default as a fresh tab context; publish only if foregrounded |
| reload | tab record | same scope |
| same-tab multi-page navigation | tab record | same scope |
| user-opened link in a cold tab | foreground shared record | normally inherits source/current term |
| bookmark or typed URL | foreground shared record | adopts the product's current term; no intrinsic bookmark term |
| two existing tabs in different terms | each tab record | each remains stable; foreground tab republishes itself |
| background script opens a tab | foreground shared record | may differ from script's background source tab |
| valid launch with no usable Canvas term id | default sentinel | continue in the default bucket |

The background-script row is the known lineage residual. Browser chrome
navigations are not classified as lineage failures because the chosen product
model deliberately defines them as “continue in the current foreground term.”
That semantic must be reflected in support documentation and UX copy.

## Visible Term Context and Accessibility

When Canvas supplies a term name, the Modulus interstitial should show it on
every verified scoped LTI launch, not only when client storage appears to change.
This makes the context truthful under concurrent tabs and avoids asking the
learner to identify a term from an opaque id. A launch with a valid id but no
name should use generic scoped-context wording; a default-scope launch should
use clear default-context wording.

Use ordinary visible text associated with the launch heading. If the content is
server-rendered and present on load, an `aria-live` region is unnecessary. Keep
the existing launch button keyboard-operable, ensure countdown changes do not
steal focus, and do not use a blocking term-picker dialog.

The activity receives the opaque internal `scope_id` and may also receive the
nullable `scope_name`. If the agent's bundled UI later exposes context status,
it may say “Working in Autumn 2026” when a name is available and use generic
scope wording otherwise. The name must never be used for equality, storage
selection, authorization, or passback predicates.

## Schema and Repository Impact

### Required Table Changes

| Table | Planned change |
| --- | --- |
| `scopes` | add term identity, metadata, and the default sentinel |
| `agent_auth_codes` | add non-null `scope_id` so one OAuth exchange keeps one label |
| `progress` | add `scope_id`; primary key becomes `(activity_id, user_id, scope_id)` |
| `page_state` | add `scope_id`; primary key becomes `(user_id, activity_id, scope_id)` |
| `progress_events` | add indexed `scope_id`; retain append-only/keyless design |
| `lti_lineitems` | add `scope_id`; retain existing URL-based uniqueness, add scoped update predicates, and rebind/reset on a verified term change |

`enrollment` and `activity_code_member` are deliberately absent from this table.
The baseline does not change their schema or broad cohort semantics.

All state-bearing scope foreign keys should use `ON DELETE RESTRICT`. Removing a
scope must not cascade historical work or turn it into default work.

### Required Predicate Audit

Adding columns without changing these call paths would leave isolation
incomplete:

- `ActivityStateQueries.getProgress` and `getPageState`;
- `ActivityStateMutations.updateProgress`, `incrementProgress`, and
  `setPageState`, including conflict targets;
- all direct and cumulative `recordProgressEvent` calls;
- cumulative reads and target writes for other activity URLs;
- `updateLineItems`, including cutoff and live-line-item conditions, its
  one-statement update/mismatch outcome, and the actual-row scope predicate;
- LTI `getProgressWithCutoff` and `upsertProgress` during launch;
- score-submission `getProgressAtCutoff`;
- LTI line-item reconciliation identity, locking, scope-rebinding reset, and
  revival behaviour;
- score-submission repository selections, claims, and result recording;
- instructor `getProgressForUser` and `getActivityCodeProgress`, which need a
  cardinality-safe compatibility projection over multiple scope rows rather
  than a new scope filter;
- `enrollmentProgressRelations.progress` and any other joins or Drizzle
  relations that currently assume one progress row per `(user, activity)`;
- fixtures, seeds, cleanup helpers, and integration assertions.

Keep the existing advisory transaction lock keyed only by `user_id`. Concurrent
progress or page-state requests for one learner are expected to be rare, whether
they target one scope or several, so the additional per-user serialization is
acceptable. Do not add `scope_id` to the lock key.

### Analytics Boundary

Activity codes are not LTI course or term identifiers. They are broad cohort
groupings used by instructors and course coordinators to observe how activities
are used. One code may span several Canvas course sections in one semester or
courses across several semesters.

The baseline therefore preserves these contracts:

- `enrollment` and `activity_code_member` remain unscoped;
- an activity code remains reusable across courses, sections, and semesters;
- the existing instructor query continues to return one row per existing
  enrollment rather than one row per scope;
- no new scope selector or term-specific report semantics ship with this
  feature.

Because `progress` becomes one row per `(user, activity, scope)`, the existing
direct join is no longer cardinality-safe. Replace it with a derived relation
that produces at most one compatibility progress row per `(user, activity)`.
Using `MAX(progress)` across scopes most closely preserves the current all-time
high-water view. The associated timestamp needs an explicit, deterministic rule
instead of relying on an arbitrary row.

The derived projection must be complete before it joins to `enrollment` and
before ordering, `count(*) over()`, `limit`, or `offset` are applied.
Otherwise multi-scope fan-out corrupts the reported total and paginates scope
rows instead of enrollments. For unchanged data, every sort must use a stable
secondary enrollment key so equal aggregate values produce deterministic page
boundaries. `getProgressForUser` must use the same explicit aggregate rather
than `findFirst`, and the Drizzle `one(progress)` enrollment relation must be
removed or replaced because it no longer describes the schema.

This compatibility projection is not the final statistical design. Stakeholder
discussion should first identify whether reports need an all-time high-water
mark, activity observed within a date window, optional scope filtering, or a
separate cohort/event model. A coarse cutoff over `progress_events.submitted_at`
remains a valid candidate for semester-level statistics even though it is
unsuitable for operational state restoration and AGS passback.

## Scope Lifetime, Date Bounds, and Retention

A term boundary does not invalidate its `scope_id`, and passing a date must never
delete, merge, or relabel existing work. Token renewal preserves the label. This
identity/lifetime rule does not decide whether Modulus should accept new work
before `starts_at` or after `ends_at` when those values are known.

That acceptance policy requires stakeholder consultation. Canvas `ends_at` may
represent the final date after which late or incomplete work is no longer
accepted, rather than merely the end of ordinary instruction. The eventual
policy may also distinguish reading historical state, recording progress,
updating page state, and submitting grades. Until those semantics are confirmed,
the dates remain nullable descriptive metadata and must not be introduced as an
implicit gate. A null bound means Modulus has no platform-supplied bound to
evaluate.

Do not use “scope eviction” to mean deleting a scope row or its learner data.
Separate three concepts:

- **scope validity** — the row exists and may be selected as a label;
- **scope recency** — useful for ordering or hiding inactive scopes in
  first-party administrative and reporting interfaces;
- **institutional data retention** — a future policy for deleting historical
  state.

If the product needs an active/inactive classification for first-party UI, it
must define that classification separately from the still-open acceptance
policy. “Eviction” may remove a scope from a recent-scopes list or cache; it may
not move, merge, or silently delete the associated work.

## Telemetry and Operational Signals

Record only opaque ids or counters and follow the repository's public/no-PII
rule. Useful events include:

- fresh scoped launch, default launch, and missing/unexpanded term id;
- absent, unexpanded, or malformed optional term name/date metadata;
- explicit context change in one tab (`old_scope_id != new_scope_id`);
- tab/shared divergence observed immediately before foreground publication;
- cold-tab adoption from shared storage;
- malformed stored record or storage access failure;
- missing, malformed, or unknown scope label;
- optional scope/platform mismatch if that integrity check is adopted;
- scoped progress with no matching live line item when another-scope line item
  exists for the same learner/activity;
- verified line-item scope reassignment and any stale fenced completion; and
- activity-code report projection encountering multiple scope rows for one
  enrollment.

These signals measure concurrency and data-quality states.
They do not directly prove that a cold child inherited the intended opener's
context. Define thresholds for investigation—for example, high divergence plus
support reports—before considering href propagation.

Never log an OAuth code, access token, Canvas term id, course identity, or
learner identity in client telemetry. The internal `scope_id` and term name are
not secrets, but aggregate counters are preferable where either value is not
needed.

## Alternatives Considered

### `sessionStorage` Only

Rejected. It handles reload but cannot be relied upon for all new-tab creation
paths or a new browser session.

### Shared Map of Recent Scopes

Rejected as a selector. It can support diagnostics or a first-party report
picker, but it cannot determine which source tab caused a new navigation.

### `scope_id` in the Activity Query String

Accepted as the baseline transport. The value is an opaque bucket label rather
than a secret or capability. The agent should scrub it with the other launch
parameters after reading it so copied URLs and bookmarks do not accidentally
become term-specific. Preserve unrelated query parameters and the complete URL
fragment. A fragment transport is rejected because authored activities may use
anchors and the OAuth redirect URI discards fragments.

### Scope in the Learner Session Cookie

Rejected. The first-party learner session is shared across Modulus tabs, so a
single current scope in that session recreates the same concurrent-term race at
a different layer.

### Blocking Term Picker

Rejected for ordinary agent startup. It asks learners to resolve an institutional
context they may not recognize, blocks activity access, and creates focus-trap,
keyboard, and restoration requirements. Future stakeholder-driven analytics may
add first-party filters, but this feature does not choose them.

### Href Rewriting

Deferred. Encoding `scope_id` in every navigable link can preserve link lineage
more directly than the foreground heuristic, including for a background script
that opens a URL already rewritten by its own tab. It also
requires author-DOM mutation, dynamic-link observation, URL cleanup, and full
keyboard/context-menu testing.

If adopted later, rewrite links up front rather than on pointer events so
keyboard activation and context-menu opening receive the same URL. Even then,
bookmarks remain governed by the product's current-term semantic unless the
scope context is deliberately retained in bookmarkable URLs.

### BroadcastChannel, `storage` Events, or `postMessage`

Useful for coordination, but insufficient as the only lineage mechanism.
Broadcast and storage channels are shared and do not identify an opener;
`postMessage` requires a usable opener relationship that many new-tab modes do
not preserve.

## Implementation Sequence

There are no live Modulus deployments, so this feature does not need observe,
compatibility, or enforcement rollout modes. Implementation can establish the
new contracts directly, while still sequencing schema and code changes so the
work is reviewable and testable.

### Phase 0 — Settle Blocking Product and Integrity Decisions

- Confirm activity codes remain reusable across terms.
- Record scope-specific enrollment and instructor-report semantics as deferred
  stakeholder decisions rather than feature prerequisites.
- Define the aggregate that keeps current instructor reports to one row per
  enrollment after `progress` becomes multi-scope.
- Consult stakeholders on reads, writes, and passback before `starts_at` and
  after `ends_at`, including the intended Canvas `endAt` semantics.
- Decide whether a scope must belong to the issuer/platform paired with it in
  browser storage, or whether existence alone is sufficient.
- Decide whether the initial agent contract exposes `scope_name`, or only
  reserves that nullable field for a later UI.
- Confirm that a verified term change for an existing line-item URL rebinds the
  row, resets submission state, and leaves historical activity state in the old
  scope.
- Confirm the top-level-document assumption for supported Ximera activities.

### Phase 1 — Add the Complete Scoped Schema

- Define `scopes` plus every scope column, key, foreign key, relation, and index
  across authorization codes, activity state, events, and line items.
- Seed the default sentinel and backfill existing development and test records.
- Rebuild composite keys, unique constraints, foreign keys, and indexes.
- Retain line-item uniqueness on `(user_id, activity_id, lineitem_url)`.
- Keep `name`, `starts_at`, and `ends_at` nullable.
- Generate, inspect, and commit one consolidated migration and its metadata only
  after the complete schema shape is settled.
- Leave the unused `agent_refresh_tokens` table unchanged and record that
  exclusion explicitly.

Even without production data, migration tests should use realistically populated
fixtures so key reconstruction and event-table behavior are exercised.

### Phase 2 — Make Core Scope-Complete

- Extend `AgentAuth`, token payload schemas, issuance, verification, and renewal.
- Thread `scope_id` through all operational state, cumulative, line-item, and
  passback repositories.
- Keep line-item URL identity stable; on a stakeholder-confirmed verified scope
  change, rebind and reset the existing row without relabelling old activity
  state.
- Diagnose scoped progress that misses a line item when another-scope live row
  exists for the same learner/activity.
- Adapt instructor progress queries to the compatibility aggregate without
  adding `scope_id` to `enrollment` or `activity_code_member`.
- Add scope derivation from verified LTI custom claims.
- Route a missing, empty, null, or unexpanded Canvas term id to the default
  sentinel.
- Accept partial or absent optional term metadata without rejecting the launch
  or erasing previously known valid metadata.
- Add authorize-step validation for malformed or unknown client-selected scope
  labels.

### Phase 3 — Add Agent Context Transport

- Add versioned tab/shared context records.
- Add guarded foreground publication and resolution rules.
- Guard shared deletion as well as publication; transient OAuth failures clear
  only tab state.
- Preserve the record across the OAuth redirect in `sessionStorage`.
- Send the default sentinel explicitly from the non-LTI first-party path.
- Normalize a valid Modulus context without a scope label to the default
  sentinel.
- Add optional `scope_name` transport if Phase 0 selects it for the initial
  agent contract.

### Phase 4 — Complete UX and Verification

- Show the verified term name on the launch interstitial when available and
  generic context wording when it is not.
- If exposed, present `scope_name` as understandable, display-only agent UI.
- Verify that existing activity-code reports retain one row per enrollment and
  broad cross-course/cross-semester cohort semantics.
- Validate keyboard, screen-reader, focus, countdown, storage, and error
  behavior.
- Reconsider href rewriting only if browser tests or later operational evidence
  justify it.

## Acceptance Criteria

### Token Binding and Privacy

- An authenticated learner may request any existing `scope_id` for their own
  activity state; the selection does not change the token's `user_id` or
  `activity_id`.
- A malformed or unknown `scope_id` is rejected as invalid input.
- The token endpoint cannot change the scope stored by the authorize step.
- Agent token renewal preserves the same `scope_id` across term boundaries.
- Token payloads and activity URLs may contain the opaque internal `scope_id`.
  Agent-visible context may also contain nullable `scope_name`, but contains no
  raw Canvas term id, course identity, learner PII, or LMS gradebook data.
- A missing, empty, null, or unexpanded Canvas term id routes the launch to the
  default scope.
- A valid term id is sufficient to select a non-default scope even when name and
  dates are absent, malformed, or unexpanded.

### State and Passback

- The same learner/activity can have independent progress and page state in two
  scopes.
- A lower or repeated progress write remains a per-scope no-op.
- Cumulative contributions read and write only the token scope.
- A progress event in scope A cannot update, revive, claim, or submit a line item
  in scope B.
- Both `getProgressWithCutoff` and `getProgressAtCutoff` use only events from
  the line item's scope.
- One `updateLineItems` statement returns `updated_count` and
  `scope_mismatch`; no follow-up query runs when no line item exists.
- A zero-row scoped line-item update reports a mismatch when an eligible line
  item exists for the same learner/activity in another scope, including when the
  token uses the sentinel.
- Other-scope line items are read only as diagnostic candidates. The actual
  update retains its scope predicate and does not lock or rewrite them.
- A verified new scope for an existing line-item URL rebinds the existing row,
  resets its submitted/submittable and queue state for the new scope, and leaves
  historical activity state under the old scope.
- Line-item reconciliation uses a conflict-tolerant insert followed, when
  needed, by a `FOR UPDATE` read and an explicit scope branch. A transaction
  containing an unlocked read is not sufficient.
- A same-scope launch with a lower non-zero incoming value preserves the
  existing non-zero high-water mark and submission/lease/error state. A rebind
  from a non-zero old-scope value stores exactly the new scope's value,
  including zero, and resets only the designated rebind fields.
- Existing rows appear in default scope after migration without duplication.
- The advisory transaction lock remains keyed only by `user_id`.

### Browser Behaviour

- Reload retains the tab scope after another tab foregrounds a different one.
- A background fresh launch does not overwrite the shared foreground record.
- An OAuth failure in a background tab does not delete the shared foreground
  record.
- Foregrounding a tab in another term republishes its complete issuer/scope pair.
- A cold user-opened tab normally inherits the currently foregrounded context.
- The non-LTI first-party path sends the default sentinel as an explicit fresh
  context, regardless of shared LTI context.
- Bookmark and typed-URL tests assert the documented current-term semantic.
- Malformed or version-unknown storage records fail safely.
- OAuth response handling uses the pre-redirect tab record, not a shared value
  changed while the tab was away.
- Query cleanup removes the recognized scope parameter while preserving
  unrelated query parameters and the complete authored fragment.

### Reporting and UX

- `enrollment` and `activity_code_member` remain unscoped.
- A reused activity code produces one compatibility row per enrollment without
  duplicate rows from historical scopes.
- The compatibility projection is formed before enrollment join, ordering,
  total calculation, limit, and offset.
- Report totals count enrollments; deterministic ordering produces stable page
  boundaries for unchanged data, including tied aggregate values.
- `getProgressForUser` uses the selected aggregate explicitly, and no Drizzle
  `one(progress)` relation claims that an enrollment has only one progress row.
- No scope selector or semester-specific analytics semantics are introduced by
  this feature.
- The interstitial displays the verified term name when available and generic
  context wording otherwise.
- If the activity receives `scope_name`, it treats that field as nullable,
  display-only metadata and selects buckets only by `scope_id`.
- The launch path is fully keyboard-operable and tested with screen-reader
  announcements appropriate to static versus dynamic text.

### Verification Matrix

Tests should cover at least:

- schema migration from populated unscoped fixtures;
- repository integration tests for every conflict target and scope predicate;
- valid, malformed, unknown, and optionally platform-mismatched scope labels,
  plus PKCE binding;
- Canvas launches with term id only, partially supplied metadata, no term id,
  null/empty values, unexpanded literals, and malformed dates;
- the verified redirect → interstitial → `startActivity` → activity-query
  handoff, plus the explicit-default non-LTI path;
- direct and cumulative progress in two scopes;
- statement-count assertions showing one line-item statement for the current
  activity and one per advanced cumulative target, including the normal
  no-line-item case;
- both cutoff queries plus line-item revival, lease, success, failure,
  cross-scope mismatch diagnostics, verified term reassignment from non-zero
  state, first-insert races, and concurrent reconciliation;
- instructor report compatibility aggregation with one code reused across
  scopes, courses, and semesters, including totals, tied ordering, and multiple
  offset pages;
- agent unit tests with mocked focus, visibility, storage, OAuth redirect, and
  background fresh launch and failure-driven shared deletion;
- browser tests for reload, ordinary click, middle-click, context-menu new tab,
  separate windows, background launch, bookmark, and typed URL;
- accessibility checks for named-term, unnamed-term, and default-scope
  interstitial states.

## Risks and Mitigations

### Scope Labels Are Visible to Authored Content

Any script on the activity origin can inspect `scope_id` in the launch URL,
`localStorage`, and `sessionStorage`. This is expected: the UUID is an opaque
label, not a credential. It must not encode Canvas term or course metadata, and
the server must continue deriving `user_id` and `activity_id` from authenticated
context rather than browser storage.

### Scope Labels in URLs

The internal UUID may appear in activity-origin logs or same-origin referrers
before the agent scrubs it. This is not credential leakage, but unnecessary URL
retention can create confusing bookmarks and diagnostics. Scrub the parameter
with the issuer and OAuth values while preserving authored fragments and use an
appropriate referrer policy. The optional term name does not need to travel in
the URL; it can be supplied by the verified server response if the initial agent
contract exposes it.

### Scope Divergence Can Omit Canvas Scores

A client transport error can place valid learner progress in a scope with no
matching line item. Scope-qualified updates then correctly refuse to cross the
boundary, but the score is not scheduled for Canvas and the current system has
no learner- or instructor-visible failure. Detect the narrower condition where
another-scope live line item exists, emit a structured diagnostic, and decide
with stakeholders whether the signal must also reach learners or instructors.
Return that classification from the same SQL statement that attempts the scoped
update. Do not add a normal-case probe inside the advisory-lock transaction, do
not skip sentinel contexts without a separate single-bucket invariant, and do
not update unmatched rows merely to return their scope ids.

### Canvas Term Reassignment Resets Passback State

Rebinding a stable line-item URL to a newly verified scope deliberately starts
its submitted and submittable progress from the new scope rather than carrying
old-term work forward. This can surprise stakeholders and can race with an
already in-flight external submission. Require stakeholder confirmation, reset
and fence all stored queue state atomically, and log both the reassignment and
any stale completion attempt. Implement the distinction with a locked explicit
branch rather than repeated conditional upsert expressions, and test with a
non-zero old-scope high-water mark so an accidental `GREATEST` cannot pass.

### Browser Event and Storage Variability

Focus, visibility, storage availability, back-forward cache, and window-manager
behaviour vary. Test the major browser paths and use the default sentinel when a
valid Modulus context has no scope label. Guard shared deletes as well as writes
so a background OAuth failure cannot erase the foreground context. A routing
mistake remains within the authenticated learner/activity boundary but can
still cause the Canvas-score omission described above.

### Large-Table Migration

`progress_events` is append-only and may be the largest affected table. A
non-null backfill and new indexes can lock or rewrite substantial data. Measure
production-like volume, use an additive/backfill/constraint sequence where
needed, and do not assume the smallest current development database represents
deployment cost.

### Date-Bound Acceptance Policy Is Undecided

Canvas term dates may be missing, edited, or inconsistent with extensions, but
`endAt` may also be the institution's intended final deadline for late and
incomplete work. Treat the dates as descriptive until stakeholders decide
whether and how they gate reads, writes, or passback. Keep that decision separate
from scope identity, inactive-scope presentation, and data retention.

### Deferred Instructor Analytics

The compatibility aggregate can preserve the current report shape, but it
cannot decide which future statistical questions matter. Scoping enrollment
would materially redefine activity codes; selecting only one scope would hide
their intentional cross-course and cross-semester cohort. Keep those changes out
of the baseline. Convene instructors, course coordinators, and other stakeholders
before deciding whether future reports use event-date windows, scope filters,
both, or a separate cohort model.

## Open Decisions and Deferred Questions

1. Should structural validation require `scope_id` to belong to the stored
   issuer/platform, or is existence sufficient?
2. Which exact aggregate and timestamp rules best preserve the existing
   instructor progress report after `progress` becomes multi-scope?
3. After stakeholder consultation, should semester-specific activity-code
   analytics use coarse event-date windows, optional scope filters, a separate
   cohort model, or some combination?
4. Should Modulus accept reads, progress writes, page-state writes, and grade
   passback before `starts_at` or after `ends_at`, and does Canvas `endAt`
   represent the final late/incomplete-work deadline for supported deployments?
5. Should `scope_name` ship in the initial agent contract, and which verified
   response should populate or refresh it?
6. Do stakeholders confirm that moving a Canvas course to a new term rebinds an
   existing line-item row, resets its submission state to progress from the new
   scope, and leaves old-term learner state unchanged?
7. Which supported browsers and link-opening modes form the release gate?

Items 1, 2, and 4–7 affect particular baseline contracts and should be resolved
before the corresponding implementation work. Item 3 is explicitly deferred
for stakeholder discussion and does not block operational activity scoping. The
query-string transport and explicit-default non-LTI launch behaviour are settled
baseline decisions rather than open questions.

## Out of Scope

- implementing the database migration, server services, routes, agent changes,
  UI, or tests;
- retaining complete interaction history beyond the existing progress-event
  stream;
- institutional data-retention policy;
- deciding or implementing date-bound acceptance before stakeholder
  consultation;
- adding `scope_id` to `enrollment` or `activity_code_member`;
- defining or shipping scope-specific instructor analytics;
- redesigning activity-code authorization generally;
- proving authored activity code or learner browsers trustworthy;
- cross-origin multi-page activities;
- iframe-specific focus transport;
- href rewriting in the baseline;
- selecting a term through a blocking learner dialog.

## Final Recommendation

Proceed with activity scopes: `scope_id` is a client-transported bucket label,
not an authorization capability. Keep the following refinements load-bearing:

1. bind the selected label into the authorization code and agent token so every
   operation in one session uses the same bucket;
2. allow shared writes and destructive shared clears only under rules that
   preserve the visible, focused document's context;
3. make every cumulative/passback predicate scope-aware while leaving
   `enrollment` and activity-code cohort semantics unchanged;
4. describe foreground inheritance and telemetry as best-effort routing
   correctness whose failure mode can silently omit the learner's score from
   Canvas, and detect mismatches when another-scope line item exists;
5. use the default sentinel when Canvas supplies no usable term id, while
   treating name and dates as nullable metadata and deferring date-bound
   acceptance policy to stakeholders;
6. carry LTI scope through the first-party query and `startActivity`, while the
   non-LTI first-party path explicitly launches in the default scope; and
7. keep the stable line-item URL identity, rebind and reset its row on a verified
   Canvas term change, and obtain stakeholder confirmation for those semantics
   before implementation.

With those changes, the design fits Modulus's architecture: verified LTI context
creates non-default scope labels, incomplete term context falls back safely to
the default label, the token keeps each learner/activity/scope tuple consistent,
activities may receive an understandable nullable term name without relying on
it for identity, term partitioning applies to state and grade passback as one
coherent invariant, and broad cohort analytics remain available for later
stakeholder-led design.
