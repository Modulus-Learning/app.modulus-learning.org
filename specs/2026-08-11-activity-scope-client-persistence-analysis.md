# Activity scope client persistence simplification — analysis

Date: 2026-08-11
Status: approved for implementation; partially supersedes the browser-context
contracts in `specs/2026-08-04-activity-scopes-analysis.md`
Related:

- `specs/2026-08-04-activity-scopes-analysis.md` — original activity-scope
  analysis, including the foreground-context model superseded here
- `specs/2026-08-04-activity-scopes-implementation-plan.md` — completed plan
  that implemented the original model
- `docs/AGENT.md` — shipped browser-agent authentication and storage behaviour
- `docs/AUTHN-AUTHZ.md` — agent authorization-code, token, and renewal contracts
- `apps/agent/src/core/activity-context.ts` — current versioned context records
  and foreground publication
- `apps/agent/src/core/auth.ts` — current context resolution and OAuth with Proof
  Key for Code Exchange (PKCE)

## Question

How should the browser agent retain an activity scope across OAuth, reloads,
ordinary navigation, and new tabs without attempting to determine which browser
tab is foregrounded?

The original activity-scope design made `sessionStorage` authoritative for an
established tab and used `localStorage` to publish the most recently foregrounded
tab's context. Publication required both `document.visibilityState === 'visible'`
and `document.hasFocus()`, triggered by `visibilitychange` and `focus` events.

Acceptance testing showed that the event model is not reliable enough to justify
its lifecycle, ownership, race-avoidance, deletion, diagnostics, and browser-test
complexity. Browser focus and visibility signals do not always arrive in an order
that lets the handler observe both conditions at once. Adding retries, interaction
listeners, page-lifecycle signals, or polling would improve detection but would
expand a best-effort routing heuristic into a substantial client subsystem.

The remaining routing failures are expected to be rare. A scope is an opaque
partition label rather than an authorization capability, and a wrong selection
can affect only the authenticated learner's state for the authenticated activity.
It may still route progress into a term without a matching line item and therefore
affect score passback, but stakeholders accept that residual risk in exchange for
a smaller and more predictable client model.

## Executive Recommendation

Replace foreground-context inheritance with last-successful-authentication
persistence:

1. Keep a versioned activity context in `sessionStorage` for the context committed
   to this tab by an explicit launch or verified OAuth success.
2. Keep the same complete context in `localStorage` as the default for tabs that
   have no tab context. This record means “most recently authenticated
   successfully”, not “currently foregrounded”.
3. Keep the OAuth transaction as a separate, atomic `sessionStorage` record
   containing PKCE state, the code verifier, the selected context, and the exact
   return location.
4. Resolve context in this order: explicit fresh launch, OAuth response,
   incomplete OAuth transaction, tab context, local default, then no Modulus
   context.
5. Treat authentication as one page-global operation. Concurrent agent
   instances in the same JavaScript page realm share one in-flight promise
   rather than consuming launch parameters or creating OAuth transactions
   independently.
6. After a verified OAuth token response, write the canonical issuer, returned
   `scope_id`, and optional returned `scope_name` to both the tab record and the
   local default without inspecting focus or visibility.
7. Remove foreground listeners, ownership checks, shared snapshots, guarded
   deletion, and foreground-specific diagnostics.
8. Accept that successful OAuth flows in separate tabs use
   last-completion-wins semantics for the local default. Each established tab
   remains stable because its tab record takes precedence.

This keeps the OAuth transaction binding and token-bound scope invariant while
removing the claim that the agent can infer the user's current tab or navigation
lineage.

## Supersession Boundary

This analysis supersedes only the client-context selection and persistence model
from `specs/2026-08-04-activity-scopes-analysis.md`. In particular, it replaces:

- Executive Recommendation items 5–7;
- the requirement to combine `visibilitychange` and `focus` signals;
- “A Fresh Background Launch Must Not Overwrite the Foreground Record”;
- “Foreground Inheritance Is a Routing Heuristic” as an implemented selection
  mechanism;
- the foreground-specific parts of “Telemetry Cannot Observe the Silent
  Residual Directly”;
- the original “Resolution Rules”, “Foreground Publication”, and browser
  “Behaviour Matrix”;
- foreground publication and deletion work in the original implementation
  sequence and verification criteria; and
- the foreground-inheritance acceptance expectations assigned to Task 10 and
  Task 11 of `specs/2026-08-04-activity-scopes-implementation-plan.md`.

The following original contracts remain in force:

- a scope is a partition label, not an entitlement or capability;
- a fresh first-party launch supplies an explicit issuer and `scope_id`;
- the non-LTI launch path supplies the default sentinel explicitly;
- the authorization request validates that `scope_id` is a UUID naming an
  existing scope;
- the single-use authorization code and agent token bind the selected
  `scope_id`;
- every learner-state and score-passback operation uses the token-bound
  `(user_id, activity_id, scope_id)` tuple;
- OAuth state, PKCE state, and the return location remain an atomic per-tab
  transaction;
- concurrent agent instances in one JavaScript page realm share one in-flight
  authentication operation, while separate tabs remain independent;
- recognized launch and OAuth query parameters are removed while authored query
  parameters and fragments are preserved;
- `scope_name` is optional display metadata and never participates in identity;
  and
- browser storage contains no learner identity, token, Canvas term id, course
  identity, or gradebook data.

## Storage Model

### Activity Context Record

Store issuer, scope identity, and display metadata as one versioned record:

```ts
type StoredActivityContext = {
  version: 1
  issuer: string
  scope_id: string
  scope_name?: string
}
```

Here `issuer` is the validated public base URL of the Modulus server used for
agent OAuth. `scope_id` is a normalized UUID. `scope_name` is optional metadata
returned by Modulus after token exchange; it is never used to choose or compare
buckets.

Issuer and scope must not be stored as independent keys. One serialized record
prevents a partial write from combining the issuer from one authentication with
the scope from another. Reads validate the complete record and remove malformed
or unsupported values from the storage area in which they were found.

### Tab Context in `sessionStorage`

The tab record means “the context selected for this top-level browsing context.”
It survives reloads and same-tab navigation and disappears when the browser ends
that tab's storage session.

An explicit fresh launch replaces the tab record before OAuth begins. A local
default selected by a tab with no record does not become the tab context until
its OAuth exchange succeeds. The OAuth transaction itself preserves that
selection across the redirect. A successful token exchange writes or refreshes
the tab record with the canonical returned `scope_id` and optional
`scope_name`.

The tab record intentionally takes precedence over a different local default.
That difference is not divergence requiring reconciliation: it is how an
existing tab remains stable while another tab authenticates in a different term.

### Local Default in `localStorage`

The local record means “the context from the most recently completed successful
agent OAuth exchange on this activity origin.” It persists across tabs, windows,
and browser restarts according to ordinary `localStorage` behaviour.

Only a successful, verified token exchange writes this record. Receiving a fresh
launch URL, beginning OAuth, becoming visible or focused, or receiving an OAuth
error does not write it.

Every successful exchange writes the complete canonical context without a
foreground condition. Concurrent tabs therefore race only in the ordinary
last-write-wins sense: whichever successful exchange completes last becomes the
default for future tabs without their own context.

This record is not described as shared ownership, foreground state, current
term, opener lineage, or an assertion that the user is viewing the writing tab.

### OAuth Transaction in `sessionStorage`

The OAuth transaction remains separate from both context caches:

```ts
type StoredOAuthSession = {
  version: 1
  state: string
  code_verifier: string
  context: StoredActivityContext
  return_location: {
    search: string
    hash: string
  }
}
```

The agent writes the transaction before navigating to Modulus. The callback
uses this exact record for state verification, PKCE exchange, issuer selection,
scope comparison, and return-location restoration. It does not consult either
the tab context or local default to decide which scope belongs to an OAuth
response.

Writing this transaction is mandatory. If `sessionStorage` cannot preserve it,
the agent cannot perform OAuth safely and reports `storage_unavailable` without
navigating. Context-cache writes after successful authentication are
best-effort: a persistence failure is diagnosed but does not invalidate an
otherwise valid token response.

If this transaction exists but the URL contains no OAuth response, the agent
returns `missing_redirect` before considering either context cache. It preserves
the transaction, so the failure remains sticky across reloads for the lifetime
of that `sessionStorage` session. This behaviour is preserved unchanged; this
analysis does not add recovery or expiry for an abandoned client transaction.

### Page-Global Authentication Operation

Authentication consumes page-global resources: launch and OAuth query
parameters, browser history, the per-tab OAuth transaction, and navigation. Two
agent instances running concurrently in the same JavaScript page realm must not
consume those resources independently. They share the first in-flight
authentication promise, including its context resolution, OAuth transaction,
navigation, token exchange, and result.

The first caller owns that operation's logger and navigation options. A settled
authenticated, failed, or no-context result releases the guard, so a staggered
later instance begins a new operation. The guarantee applies only to callers
that overlap while authentication is in flight. An initial OAuth redirect
intentionally leaves its promise pending until page unload and therefore remains
the shared operation for that page lifetime when navigation commits.

This guard is page-local, not cross-tab coordination. Separate tabs retain
independent OAuth transactions and the accepted last-successful,
last-completion-wins local-default semantics.

## Context Resolution

Use the following order for the page's active authentication operation.
Concurrent initializations join that operation before reading or removing query
parameters, reading storage, generating PKCE state, writing an OAuth
transaction, or navigating.

### 1. Explicit Fresh Launch

If the URL contains the recognized Modulus issuer parameter, validate the issuer
through the existing registry flow and construct a context from the explicit
`scope_id`. When the label is omitted on a legacy or manually constructed launch,
use the fixed default sentinel. First-party launch producers continue supplying
the label explicitly.

The fresh context replaces this tab's context before OAuth begins and is copied
into the OAuth transaction. It does not update the local default until the token
exchange succeeds. Consequently, an explicit launch always overrides older tab
or local records, while an abandoned or rejected launch does not change what a
future cold tab inherits.

If OAuth returns an error, the explicit context remains selected for this tab
but the previous successful local default remains unchanged. A reload in the
same tab may retry the selected context; a new tab still inherits the last
successful context.

### 2. OAuth Response

If the URL contains an OAuth response, recover only the pending OAuth
transaction. Restore its saved return location before returning any success or
error result. Validate the response state, exchange the authorization code using
the saved PKCE verifier, and validate the token response.

The returned `scope_id` must normalize to and equal the `scope_id` saved in the
transaction. A mismatch fails authentication and writes neither context cache.
After a match, create the canonical context from the saved issuer and the
returned scope id and name, then write it to both `sessionStorage` and
`localStorage` without a visibility or focus check.

### 3. Incomplete OAuth Transaction

If an OAuth transaction exists but the URL contains no OAuth response, return
`missing_redirect`. Do not use a tab context, adopt the local default, operate as
an unlaunched activity, or clear the transaction. This short circuit prevents a
stale in-flight transaction from being silently replaced by cache resolution.

### 4. Existing Tab Context

When there is no fresh launch, OAuth response, or incomplete transaction, use a
valid tab context. Validate its issuer and request an authorization code for its
exact scope. Do not consult or copy a different local default first.

This rule preserves reload and same-tab navigation even if another tab has since
completed OAuth in a different term.

### 5. Local Default

When the tab has no context, read the versioned local default and request
authorization for that issuer and scope without first writing the tab context.
The OAuth transaction binds that exact selection, so another tab changing the
local default during the redirect cannot change the in-flight exchange. Verified
success writes the canonical context to the tab and local caches. Failure leaves
the tab without a committed context, so a later reload may select a newer local
default.

This selection is called default adoption or local-context restoration, not
foreground inheritance. It makes no claim about which tab caused the new
navigation, and it does not become established tab state before authentication.

### 6. No Context

If neither storage area contains a valid context and the URL supplies none, the
activity continues in its existing open, local-only mode without Modulus
authentication.

When registry validation definitively rejects an issuer read from stored
context, remove every current tab or local context whose parsed record still
names that issuer, then return the issuer failure without selecting another
context during the same call. Re-read before removal so a different context
written meanwhile is not intentionally deleted. An invalid issuer supplied by
an explicit query does not erase unrelated stored contexts.

## Successful Persistence Contract

A token response may update storage only after all of these conditions hold:

1. the OAuth response supplies a state value;
2. the pending transaction exists and its state matches;
3. Modulus accepts the authorization code and PKCE verifier;
4. the response has the expected authenticated result shape;
5. the returned `scope_id` is a valid UUID; and
6. the returned `scope_id` equals the transaction's selected scope.

The context written after those checks uses the transaction issuer and the
canonical returned scope metadata. An OAuth error, malformed response, token
request failure, state mismatch, or scope mismatch leaves the local default
unchanged.

An inability to write either cache after these checks does not discard the valid
access token. The agent returns the authenticated result and emits a storage
failure diagnostic. The access token itself remains only in memory.

## Behaviour Matrix

| Scenario | Selected Context | Storage Result |
| --- | --- | --- |
| Fresh LTI launch | Explicit issuer and `scope_id` | Replace tab context; update local only after successful OAuth |
| Fresh non-LTI launch | Explicit issuer and default sentinel | Replace tab context; update local only after successful OAuth |
| OAuth callback | Pending transaction context | On verified success, refresh both tab and local records |
| Reload or same-tab navigation | Tab context | Keep the tab stable; successful OAuth refreshes both records |
| New tab with no explicit launch | Local default | Authenticate the exact local context; commit the tab only after success |
| Bookmark or typed URL in an established tab | Tab context | Preserve that tab's selected context |
| Bookmark or typed URL in a cold tab | Local default | Adopt the most recently authenticated context |
| Two established tabs in different terms | Each tab's context | Both remain stable; the last successful OAuth callback becomes the local default |
| Concurrent agent instances in one page | First in-flight authentication | Share one context resolution, OAuth transaction, navigation, and callback result |
| Successful OAuth in a background tab | That OAuth transaction | Background callback replaces the local default |
| OAuth error or token failure | Pending transaction for the error result | Leave the local default unchanged; a locally restored context remains uncommitted in the tab |
| Pending transaction without OAuth response | Pending transaction | Return sticky `missing_redirect`; do not fall through to either cache |
| Malformed stored record | No context from that record | Remove it from its own storage area and continue resolution |
| Storage unavailable before redirect | Explicit or restored candidate | Do not start OAuth if the transaction cannot be saved |
| Cache write unavailable after token success | Verified transaction context | Return authenticated; diagnose loss of persistence |

## Accepted Failure Modes

The simpler model deliberately accepts the following outcomes:

- A successful OAuth flow in a background tab can replace the local default
  even though another tab remains foregrounded.
- Two successful flows in different tabs and scopes make the last completed
  flow the default, regardless of which flow began last or which tab the user
  is viewing.
- A cold tab, bookmark, or typed URL can adopt a term unrelated to the tab from
  which the learner conceptually navigated.
- A local default can remain stale across a long period or browser restart until
  another OAuth exchange succeeds.
- A tab with an established session context does not automatically follow a new
  local default written by another tab.
- Reloading or revisiting an established tab starts OAuth for that tab's context.
  A successful callback rewrites the local default to that scope even when the
  reload occurred in an old-term background tab.
- If an authorization navigation is blocked, cancelled, or stopped after the
  agent invokes it, the browser provides no reliable completion signal. The
  page-global authentication promise remains pending, and later agent instances
  in that page remain connecting until the page unloads.
- The agent cannot diagnose that an inherited context was semantically wrong,
  because a cold tab has no independent expected scope.

These are routing failures, not authorization or privacy failures. The server
continues deriving the learner and activity from authenticated context, validates
that the selected scope exists, and binds the chosen label into one token. A
wrong selection can partition that learner's work into the wrong term and can
prevent it from matching the intended Assignment & Grade Services (AGS) line
item. The learner cannot use it to read or modify another learner's data or to
select another activity.

If operational evidence later shows that wrong-bucket routing is material, the
next design should use explicit context propagation or a first-party selection
surface. It should not restore foreground inference without new evidence that
browser events provide the required semantics.

## Privacy and Trust

The local and tab records contain a public Modulus base URL, an opaque scope UUID,
and optional term display name. They contain no token, authorization code, PKCE
verifier, user UUID, learner name, Canvas term id, course id, assignment id, or
grade data. The OAuth transaction contains PKCE material but remains in
`sessionStorage` and is removed when the response is handled.

Same-origin activity code can inspect or alter browser storage. This does not
create a new authority boundary: the browser already supplies `scope_id` as a
client-selected label, and the server treats it as a partition choice rather
than an entitlement. Modulus still rejects malformed and unknown labels and
continues deriving `user_id` and `activity_id` independently.

The stored term name may reveal ordinary academic-context metadata to scripts on
the activity origin. That exposure was already accepted for the authenticated
agent response and foreground record. It remains display-only, and omitting or
staling it does not change identity or passback.

## Diagnostics

Remove diagnostics whose meaning depends on foreground ownership:

- foreground publication;
- tab/shared divergence before foreground publication;
- foreground versus background launch switching;
- guarded foreground deletion; and
- cold-tab inheritance from a foreground record.

Retain or add diagnostics for states the simplified model can describe
truthfully:

- selected context source: explicit launch, tab, or local default;
- explicit launch replacing a different tab context;
- local default adoption by a tab;
- successful persistence of a canonical context, when useful during rollout;
- malformed records and storage access failures;
- issuer validation failures;
- malformed, unknown, or mismatched scope labels; and
- OAuth state, exchange, and token failures.

Diagnostics may include opaque scope ids, source labels, and booleans. They must
not include OAuth codes, access tokens, PKCE verifiers, Canvas term ids, course
identity, external LTI user identity, or learner PII. Session/local disagreement
is expected and should not be logged as an error.

## Alternatives Considered

### Local Storage Only

Rejected. It is the smallest implementation, but an OAuth completion in any tab
would change the context used when every other tab next reloads. Keeping a tab
record provides meaningful stability at low implementation cost and gives each
storage area one clear role.

### Session Storage Only

Rejected. It preserves established tabs but supplies no context to a genuinely
new top-level browsing context or a new browser session. Those cases would lose
Modulus authentication unless every URL carried an explicit launch context.

### Foreground Publication

Superseded. The model attempted to make local storage represent the currently
foregrounded tab, but real browser focus and visibility events did not update the
record consistently. Closing the timing gaps would require more events, retries,
or polling while still providing only a heuristic.

### Explicit Link Propagation

Deferred. Rewriting authored links to carry `scope_id` would preserve navigation
lineage more directly, including middle-click and context-menu navigation when
performed before activation. It would also expand the agent into author DOM
mutation, dynamic-link observation, reserved-query handling, and broader
accessibility testing.

### Broadcast or Storage Coordination

Rejected for this model. `BroadcastChannel` and `storage` events can distribute
state but do not identify which tab should own the default or which opener caused
a navigation. The new design does not elect an owner; successful OAuth completion
is the only local-default write event.

## Implementation Consequences

The matching implementation plan should translate this analysis into one
reviewable client task and its documentation and verification work. At minimum,
implementation will:

- replace foreground/shared terminology with tab-context and local-default
  terminology;
- retain the versioned `StoredActivityContext` and atomic `StoredOAuthSession`;
- add direct read and write operations for the local default;
- make verified OAuth success write both context caches;
- preserve fresh-launch, OAuth-response, incomplete-transaction, tab, local,
  and no-context precedence;
- make same-page concurrent agent initializations share one in-flight
  authentication operation while leaving separate tabs independent;
- defer committing a locally restored context to the tab until OAuth succeeds;
- remove `visibilitychange` and `focus` listeners;
- remove foreground ownership, shared snapshots, guarded deletion, and their
  tests and diagnostics;
- test simultaneous and sequential OAuth completions as explicit
  last-write-wins behaviour;
- test same-page concurrency for both initial redirect and OAuth callback paths,
  including stale storage competing with fresh launch parameters;
- test that established tabs remain stable while the local default changes;
- test that errors never replace the last successful local default;
- test that `missing_redirect` remains sticky and prevents cache fallback;
- leave the obsolete `modulus_base_url` and
  `modulus_foreground_activity_context` keys untouched and ensure neither is
  read nor written; activity-scope persistence has not reached production, so
  compatibility cleanup is unnecessary;
- update the pending Changesets entry for the published agent; and
- revise `docs/AGENT.md` and related authentication/privacy documentation so no
  shipped reference describes foreground inheritance.

The implementation plan should not reopen server-side scope identity, schema,
state partitioning, or score-passback contracts. Those portions of the original
activity-scope work remain complete.

## Acceptance Principles

The implementation satisfies this analysis when:

- no production agent code observes browser visibility or focus for context
  persistence;
- a verified OAuth success updates the complete local default even in a
  background tab;
- an established tab resolves its tab context before a different local default;
- a cold tab adopts one complete local record and binds it into its own OAuth
  transaction without committing the tab before success;
- an incomplete OAuth transaction returns sticky `missing_redirect` before cache
  resolution;
- agent instances whose authentication calls overlap in one page share one
  promise, so only one operation consumes query parameters, writes an OAuth
  transaction, navigates, or exchanges an authorization code;
- an in-flight OAuth exchange cannot change scope because another tab writes
  local storage;
- failed OAuth flows do not overwrite the last successful local default;
- storage failures do not expose tokens or learner identity and do not invalidate
  an already verified token response;
- tests state and accept last-completion-wins local semantics; and
- documentation no longer promises foreground ownership or navigation lineage.
