---
title: "The Modulus Agent"
path: "agent"
summary: "The published browser instrumentation library and server ingestion path: authoring API, the activity URL contract that decides which pages share progress and page state, duplicate contribution targets, local-first resilience, OAuth with PKCE, per-tab and last-successful activity context, and activity-state isolation by the token-bound user/activity/scope tuple."
---

# The Modulus Agent

The agent is how **curriculum content becomes "Modulus-aware."** It belongs to
the *curriculum and content authoring* domain — it is the piece a content author
embeds in a Ximera activity so that, when a learner works through that activity,
their progress and page state are reported back to Modulus. It is the
**Tier 2 ↔ Tier 3** surface from
[ARCHITECTURE → System Context](./ARCHITECTURE.md#system-context-three-tiers).

A defining property: instrumentation is **additive and optional**. Ximera content
remains openly accessible without a login; the agent only activates grade tracking
and state persistence when a learner arrives via an LMS launch and a Modulus
server is reachable. Authored content that uses the agent still works when no
Modulus server is present — it simply runs locally.

The agent has two halves:

- the **client library** — `apps/agent`, published to npm as
  `@modulus-learning/agent`, embedded in content;
- the **server module** — `packages/core/src/modules/agent`, which authenticates
  the agent and ingests what it reports.

This document covers both. The authentication handshake is summarised here from
the client's perspective; the server side is in
[AUTHN-AUTHZ → The Agent Flow](./AUTHN-AUTHZ.md#the-agent-flow-oauth-20--pkce).

## The Published Package

`@modulus-learning/agent` ships several entry points so authors can consume it at
the right level:

| Export | Contents | For |
| --- | --- | --- |
| `.` | `createModulusAgent`, the `ModulusAgent` instance type, logger helpers, and public types | bundler consumers |
| `./browser` | a browser build whose default export is `createModulusAgent` | dropping into a page |
| `./ui/vanilla` | a prebuilt vanilla UI widget (`ui-vanilla/`) | a ready-made status/progress display |

Worked examples — plain HTML/CSS/JS and a React version — live in
`apps/agent-demo`, and a live demo runs at
`modulus-agent-demo.fly.dev/calculus-1`.

## The Authoring API

The public client surface is the instance returned by `createModulusAgent`
(`apps/agent/src/core/agent.ts`), a typed `EventEmitter`. An author creates one
instance per page; the factory starts authentication and loading saved state.

```ts
import createModulusAgent from '@modulus-learning/agent/browser'

const agent = createModulusAgent()

agent.onReady(({ auth }) => {
  // onReady fires even if the agent is already ready by the time you subscribe
  if (auth.status === 'authenticated') {
    // resume: agent.progress() and agent.pageState() are pre-loaded
  }
})

// report a learner's progress through the activity (0.0 – 1.0)
agent.setProgress(0.5)

// persist arbitrary JSON so the learner can resume where they left off
agent.setPageState({ section: 3, answers: { q1: '42' } })
```

The surface divides into three groups:

- **State updates** — `setProgress(n)` and `setPageState(json)`. These are what
  authored content calls as the learner works.
- **State & status getters** — `isReady()`, `isAuthenticated()`, `user()`,
  `isConnected()`, `isConnectionLost()`, `progress()`, `submittedProgress()`,
  `pageState()`, `lastError()`, and a debug `status()`.
- **Events** — a typed set the content (or the bundled UI) can react to:
  `ready`, `progress-changed`, `progress-submitted`, `pagestate-changed`,
  `pagestate-submitted`, `retry`, `error`, `connection-lost`,
  `connection-restored`, and `session-expired`.

Two semantic rules matter for authors:

- **Progress is a monotonic high-water mark.** `setProgress` must be in
  `[0, 1]` and a value **lower than the current progress is silently ignored** —
  progress only moves forward.
- **Page state is whole-value replacement.** Any JSON-serializable value is
  accepted; the agent replaces (it does not currently deep-merge or patch).

## The Activity URL Contract

This section is for content authors. It is the one Modulus rule you have to hold
in mind while choosing the URLs your activities live at, and it decides which of
your pages share a learner's progress and saved page state.

**An activity is identified by its origin and path. Query and fragment are not
part of its identity.** Modulus resolves every activity URL to a canonical form —
the `URL` serialization with query and fragment removed — and looks the activity
up by that, so all of these are *one* Modulus activity, with one progress value
and one page-state record per learner and academic scope:

```text
https://content.test/lesson
https://content.test/lesson?tab=2
https://content.test/lesson#part-3
HTTPS://CONTENT.TEST:443/lesson
```

The full set of spellings that merge, and the distinctions that are preserved —
path case, non-root trailing slashes, repeated slashes, percent-escape spelling —
is in
[DATA-MODEL → Activities & grouping](./DATA-MODEL.md#3-activities--grouping).

Two obligations follow for you as an author:

- **Variants must be mutually compatible.** Progress must mean the same thing
  across every query and fragment variant of one path, and any page state saved
  under one variant has to be readable by the others. A learner who navigates
  from `/lesson` to `/lesson?tab=2` keeps the same progress and the same saved
  state, and the agent on the second URL will load what the first one wrote.
- **Independently graded content needs distinct paths.** If two things must be
  tracked or graded separately, they must differ in their path.
  `?exercise=17` and `?exercise=18` on one path are not two activities, and
  neither are two lessons selected by fragment routing. Give them
  `/exercise/17` and `/exercise/18`, or any other distinct paths.

Modulus cannot check either obligation for you. It has no way to inspect a URL
and learn whether two variants of a page track the same work, so the contract is
documented rather than enforced. This is a deliberately narrower model than
generic URI syntax allows, where
[a query can participate in resource identification](https://www.rfc-editor.org/rfc/rfc3986.html#section-3.4).

**Your page's own URL is left in the address bar.** Canonicalization applies to
the identity Modulus stores and looks up, not to the learner's location. The
agent derives `redirect_uri` and `client_id` for the OAuth handshake from
`window.location` with query and fragment cleared, but after authentication it
restores your authored query parameters — duplicate names and order included —
and your fragment. A learner who launches `/lesson?tab=2#part-3` ends up with
`/lesson?tab=2#part-3` in the address bar, and the activity resolved as
`/lesson`.

Restoration rewrites history only. It does **not** reload the page, re-render
query-dependent content, or scroll to the fragment, so acting on a restored
query or fragment is the activity's own responsibility. If your page renders
from `location.search` or scrolls to `location.hash`, read them after the agent
is ready rather than only at initial load.

**Nothing about learner or scope isolation changes.** Progress and page state are
still partitioned by the `(user, activity, scope)` tuple taken from the token, so
merging two spellings merges nothing across learners and nothing across academic
scopes — it only means both spellings name the same `activity_id` in that tuple.
See [The Data-Isolation Guarantee, End to End](#the-data-isolation-guarantee-end-to-end).

### Duplicate Contribution Targets

Because query strings are not part of an activity's identity, two contribution
targets can name the same activity without looking alike. These are one target:

```ts
agent.addContributionTarget({ url: 'https://content.test/total?exercise=17', factor: 0.5 })
agent.addContributionTarget({ url: 'https://content.test/total?exercise=18', factor: 0.25 })
```

Both resolve to `https://content.test/total`, so the submission asks for one
activity to be incremented by two different factors. There is no sound way for
the server to choose `0.5` over `0.25`, or to add them into `0.75`: the page's
authored markup is wrong, and guessing would silently corrupt a learner's
progress. **The entire `set-progress` submission is refused**, with HTTP `400`
and:

```json
{ "status": "error", "code": "ERR_VALIDATION" }
```

"Entire" is the part to plan for. The refusal happens in request validation,
before the handler runs, so the learner's **own self-progress update in that
submission is refused too**, and no `rejected_targets` list comes back. The
agent surfaces it as a non-retriable `request-rejected` error:

```ts
// apps/agent/src/core/agent.ts (excerpt)
const error: AgentError = {
  type: 'request-rejected',
  context,
  message: `Request rejected while ${gerund} ${noun} (HTTP ${result.code})`,
  retriable: false,
}
```

The session stays authenticated and the connection is not marked lost, but the
submission does not succeed and the local value stays ahead of the submitted one.
Since the target list comes from your page's markup, every later submission from
that page sends the same list and fails the same way for as long as the page is
loaded. Progress already saved is untouched, and `setPageState` requests are
unaffected — they carry no target list.

**Your application must handle the `error` event to make this visible.** The
agent emits `request-rejected` and stops there; it does not render anything, and
its default logger is `createSilentLogger()`, so nothing reaches a console unless
you pass `createConsoleLogger()` or `createDebugLogger()`. An author or learner
sees this only if your page listens:

```ts
agent.on('error', (error) => {
  if (error.type === 'request-rejected') {
    // surface it to the author in development, or the learner in production
  }
})
```

**The correction:** submit each canonical contribution target once, and choose
the factor you actually intend for it. The server will not combine two factors or
pick one target over another on your behalf. If `?exercise=17` and `?exercise=18`
are meant to contribute separately, they need distinct paths, as
[the contract above](#the-activity-url-contract) requires.

Do not confuse this with `rejected_targets`, which is a different outcome
entirely:

| | Duplicate targets | `rejected_targets` |
| --- | --- | --- |
| Decided by | request validation, before the handler | the handler, per target |
| HTTP status | `400` with `code: "ERR_VALIDATION"` | `200` |
| Self progress | refused with everything else | committed |
| Accepted targets | none — nothing is applied | applied normally |
| Agent event | `error` with `type: 'request-rejected'` | logged by `ModulusAgent`, no error |

`rejected_targets` and its reason vocabulary are described in
[Cumulative Progress → Refused targets](./CUMMULATIVE-PROGRESS.md#refused-targets).

For diagnosis, the server-side record is the reliable one: core logs a warning
for the failed submission and, separately, a sanitized warning for each denied
registration carrying the refusal reason with the candidate's normalized origin
and path. Be clear about the limits of both. Neither the HTTP response nor the
log line names the duplicate URLs — a target URL can carry authored query values,
so validation messages name the field, not the value — and there is no
URL-bearing diagnostic and no author-facing warning in the response. What you get
is the field-level `ERR_VALIDATION` code; identifying *which* of your targets
collide is done by reading your own page's target list against the identity rule
above.

## Local-First Resilience

The agent is built to never get in the learner's way, which shapes its runtime
behaviour:

- **Degrades to local-only.** If initialization finds no Modulus server (no
  issuer to authenticate against), the agent reports `auth: { status: 'none' }`
  and still accepts `setProgress` / `setPageState` — they just aren't submitted.
  Open content stays usable.
- **Submits in the background with retry/backoff.** Each `setProgress` /
  `setPageState` triggers an in-flight-guarded submit loop that keeps trying
  while the local value is ahead of the submitted value. On `server-error` /
  `network-error` it retries with exponential backoff (`1000 * 2^attempt` ms, up
  to 4 attempts), emitting `retry` each time.
- **Tracks connection health.** After exhausting retries it flips to
  *connection-lost* (emitting `connection-lost`); a later success emits
  `connection-restored`. `retry()` lets the page re-attempt on demand.
- **Handles session expiry distinctly.** A `401` from the API surfaces as
  `session-expired` (a non-retriable error), so content can prompt a re-launch.
- **Resumes on load.** When authenticated, initialization fetches the saved
  progress and page state up front, so `agent.progress()` / `agent.pageState()`
  reflect the server before the learner resumes.

## Connecting to Modulus

When content *is* launched through an LMS, the client authenticates over OAuth
2.0 Authorization Code + **PKCE** — and, crucially, validates the server first.
The logic is in `apps/agent/src/core/auth.ts`. Resolution order is deliberate:

1. **Fresh launch** — `?modulus=<issuer>&scope_id=<uuid>` validates the issuer,
   commits the complete versioned context to this tab's `sessionStorage`, and
   begins OAuth. An omitted scope becomes the default sentinel.
2. **OAuth response** — `?state`/`?code`/`?error` consumes one atomic stored
   session containing PKCE state, verifier, context, and the exact authored
   return query/fragment.
3. **Incomplete OAuth transaction** — a saved transaction without response
   parameters returns `missing_redirect` before either context cache is used.
   The transaction remains stored, so this result is sticky for the lifetime of
   that tab's storage session.
4. **Committed tab context** — reload and same-tab navigation keep this tab's
   issuer and scope stable even if another tab changes scope.
5. **Local default** — a cold tab with no tab context selects the most recently
   completed successful authentication from `localStorage`, binds it into its
   own OAuth transaction, and commits it to the tab only after token exchange
   succeeds.
6. **Nothing** — `status: 'none'`; open content continues locally.

`sessionStorage` owns committed tab identity. `localStorage` holds one
complete issuer/scope/name record from the most recently completed successful
agent OAuth exchange on this activity origin. Every successful callback writes
that local default, even from a background tab. Separate tabs remain stable
because their tab records take precedence, while successful callbacks in
different tabs use ordinary last-completion-wins semantics for future cold
tabs. The agent does not infer foreground ownership or opener lineage.

Authentication consumes page-global query parameters, browser history, storage,
and navigation state. Agent instances whose authentication calls overlap in one
JavaScript page realm therefore share the same in-flight promise. The first call
owns context resolution, OAuth transaction creation, navigation, token exchange,
and the result. Once an authenticated, failed, or no-context operation settles,
a staggered later instance may authenticate again. Separate tabs do not share
this in-flight guard.

**Registry validation (anti-spoofing).** Before trusting *any* issuer, the agent
fetches the central registry at `https://modulus-learning.org/api/registry` and
confirms the issuer appears in `installations[].site-url`. An unrecognised issuer
is rejected. If a stored issuer is definitively invalid, the agent removes every
current tab or local context that still names that issuer without deleting a
different context written while validation was in flight. An invalid issuer from
a fresh query does not clear unrelated stored context. This stops a malicious
page from pointing instrumented content at a rogue "Modulus" server.

**PKCE handshake.** The agent generates a `code_verifier` (48 random bytes,
base64url) and its S256 `code_challenge`, plus a CSRF `state`, stashing them in
`sessionStorage` as part of the same atomic OAuth record. It uses the activity's
own URL (query/fragment stripped) as both `redirect_uri` and `client_id` — the
same canonical form Modulus stores the activity under, so both legs of the
exchange send one spelling and the server can compare the protocol values
byte for byte while resolving the activity canonically
([AUTHN-AUTHZ → The Agent Flow](./AUTHN-AUTHZ.md#the-agent-flow-oauth-20--pkce)).
It then redirects to
`{issuer}/routes/agent/authorize`. After the server issues a code and redirects
back, the agent POSTs to `{issuer}/routes/agent/token` with the `code_verifier`;
on success it receives `{ api_base_url, access_token, user, scope_id,
scope_name }`, verifies the returned scope matches the OAuth session, refreshes
the tab context and local default, and is ready. An OAuth error or rejected token
response does not replace the prior local default and does not commit a
locally-restored context to the tab. The server side of this exchange —
`createAuthCode` / `claimAuthCode`, the PKCE check, and the activity-and-scope-bound token
it mints — is documented in
[AUTHN-AUTHZ → The Agent Flow](./AUTHN-AUTHZ.md#the-agent-flow-oauth-20--pkce).

The resulting access token carries only an opaque user id, a display name, one
`activity_id`, one opaque `scope_id`, and a `renew_after` hint — never raw LMS
term identity or learner PII. Authenticated `AuthStatus` exposes canonical
`scope_id` and nullable display-only `scope_name`.

The agent removes its recognised launch/OAuth parameters after reading them and
restores unrelated query parameters — including duplicate names and order — and
the authored fragment. The following names are reserved on activity URLs:
`modulus`, `scope_id`, `code`, `state`, `error`, `error_description`, and
`error_uri`. Authors must not use them for activity-owned state.

## Server-Side Ingestion

Once authenticated, the agent talks to four `agent`-mode commands
(`modules/agent/activity-state/commands.ts`), exposed by the host under a single
unified endpoint, `POST /routes/agent/activity`. The request body's `op`
discriminator selects the command; the route dispatches on it and rejects an
unknown `op` before reaching the core. The client's `ApiClient` posts to this one
URL (`AGENT_ACTIVITY_URL`):

| Command | API call | Effect |
| --- | --- | --- |
| `getProgress` | `POST …/activity` `{ op: 'get-progress' }` | read the learner's progress for this activity |
| `setProgress` | `POST …/activity` `{ op: 'set-progress' }` | record progress (0–1) |
| `getPageState` | `POST …/activity` `{ op: 'get-page-state' }` | read saved page state |
| `setPageState` | `POST …/activity` `{ op: 'set-page-state' }` | save page state |

Three things are true of all four:

- **Everything is scoped to the token.** The services take `user_id`,
  `activity_id`, and `scope_id` *from the `AgentAuth` context*, never from the request body
  (`ActivityProgressService`, `ActivityPageStateService`). An agent can only ever
  read or write the single `(user, activity, scope)` tuple its token was minted
  for — it cannot address another learner or another activity. The scope is an
  opaque partition label, not a capability.
- **Tokens renew transparently.** Each command first calls the agent
  `TokenRefreshService.refreshToken(auth)`. If the token is past its
  `renew_after`, it re-checks the user is enabled and the activity exists, mints a
  fresh token, and returns it as `new_token` in the response; the client's
  `ApiClient` picks `new_token` up and rolls forward. The effect is a sliding
  session built on short-lived tokens, renewed on the back of normal traffic.
- **Writes feed, but don't block on, grade passback.** `setProgress` writes the
  `progress` table and returns immediately. It does **not** call the LMS — the
  [LTI score-submission worker](./LTI.md#flow-4--ags-score-passback) discovers the
  changed scoped line item and submits it independently. Page state is
  `JSON.stringify`'d into the `page_state.state` column (and parsed back on read).

See [DATA-MODEL → Learner signals](./DATA-MODEL.md#5-learner-signals) for the
`progress` and `page_state` tables these write.

## The Data-Isolation Guarantee, End to End

Putting the pieces together, the Tier 2 ↔ Tier 3 rule (activities never receive
PII) is upheld at three points:

1. the **token** carries only `{ user: {id, full_name?}, activity_id, scope_id,
   renew_after }`;
2. the **API** exposes this learner's progress/page state for only the token's
   activity and scope, because services read the tuple from the token; and
3. the agent **validates the server** (registry) before sending anything.

What may cross to authored content is exactly the right-hand column of the
[data-isolation table](./DATA-MODEL.md#the-data-isolation-boundary-in-schema-terms).
See [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) for the policy view.

## Honest Notes & Open Questions

Flagged in the code, relevant to authors and maintainers:

- **Latest state is scoped.** The server stores current progress and page state
  per `(user, activity, scope)`; progress advances also have an append-only
  event history. Activity-code reports intentionally aggregate across scopes
  first, then intersect that aggregate with the reporting cohort: the learners
  enrolled in the selected activity code, and the activities associated with it.
  Enrollment is a learner's membership of an activity code — see
  [DATA-MODEL → Activities & grouping](./DATA-MODEL.md#3-activities--grouping) —
  and is deliberately unscoped, so a cohort survives across terms.

  Activity codes never cross the Tier 2 ↔ Tier 3 boundary. No agent API, access-
  token claim, cumulative-progress payload, or page-state shape carries one, and
  reporting an advance never creates an enrollment. Enrollment is written only by
  a verified LTI resource-link launch or by `startActivity`, both of which happen
  in Modulus before the activity page runs.
- **Storage unavailable.** Context/OAuth storage failures make authentication
  fail safely before redirect when the tab context or atomic OAuth transaction
  cannot be preserved; they do not prevent the authored activity from operating
  locally. A cache-write failure after a verified token response is diagnosed
  but does not discard the valid in-memory token.
- **Cancelled authorization navigation can remain pending.** Browsers provide no
  reliable signal that a requested cross-origin navigation was blocked,
  cancelled, or stopped. If it does not commit, the page-global authentication
  promise remains pending and later agent instances in that page remain
  connecting until the page unloads.
- **Referrers before initialisation belong to the host.** Agent cleanup cannot
  suppress requests or referrers already emitted by the activity document.
  Activity hosts should send `Referrer-Policy: strict-origin` or a stricter
  policy. The opaque scope UUID may still appear in the initial activity URL and
  is accepted as a non-secret residual; raw Canvas term identity never appears.
- **A duplicate target list has no author-facing diagnostic.** The response
  carries `ERR_VALIDATION` and no URL, and the server log deliberately records
  no target value either, so identifying which targets collide is manual. A
  URL-bearing diagnostic would have to be safe to log, which authored query
  values are not; adding a response-only warning is unbuilt. See
  [Duplicate Contribution Targets](#duplicate-contribution-targets).
- **Identity resolves spellings, not every standards-equivalent URL.**
  `/%7euser`, `/%7Euser`, and `/~user` remain three activities, and Modulus
  follows no redirects and resolves no host aliases to discover that two URLs
  serve one page. If your content is reachable at genuinely different paths,
  pick one and link to it consistently.
- **No local persistence yet.** Caching progress/page state in `localStorage`
  (so an offline learner doesn't lose work before the connection returns) is a
  `TODO`.
- **Page-state change detection is referential.** `setPageState` compares by
  identity, not deep equality, and replaces wholesale; deep-equality and
  patch-style updates are noted as future work.
- **Initial-load failure is treated as auth failure.** If fetching initial state
  fails after a successful auth, the agent currently downgrades to `failed`; the
  code notes this is a simplification pending a state-merge strategy.
- **Single central registry.** Registry validation is hardwired to
  `modulus-learning.org/api/registry`; how this evolves for self-hosted installs
  relates to the [remote connector](./REMOTE-CONNECTOR.md).

---

## Where to go next

- [AUTHN-AUTHZ → The Agent Flow](./AUTHN-AUTHZ.md#the-agent-flow-oauth-20--pkce)
  — the server side of the PKCE handshake.
- [LTI → AGS Score Passback](./LTI.md#flow-4--ags-score-passback) — what happens
  to the progress the agent records.
- [DATA-MODEL → Learner signals](./DATA-MODEL.md#5-learner-signals) — the tables
  the agent reads and writes.
