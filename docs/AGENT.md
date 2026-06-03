---
title: "The Modulus Agent"
path: "agent"
summary: "The content-authoring instrumentation layer that makes Ximera curriculum 'Modulus-aware': the published @modulus-learning/agent browser library (authoring API, events, local-first resilience, OAuth+PKCE with registry validation) and the server-side activity-state ingestion that records progress and page state under a strict per-activity scope."
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
| `.` | the `ModulusAgent` class + types | authoring against the API directly |
| `./browser` | a browser build whose default export is `ModulusAgent` | dropping into a page |
| `./ui/vanilla` | a prebuilt vanilla UI widget (`ui-vanilla/`) | a ready-made status/progress display |

Worked examples — plain HTML/CSS/JS and a React version — live in
`apps/agent-demo`, and a live demo runs at
`modulus-agent-demo.fly.dev/calculus-1`.

## The Authoring API

The whole client surface is the `ModulusAgent` class
(`apps/agent/src/core/agent.ts`), a typed `EventEmitter`. An author creates one
instance per page; the constructor kicks off initialization (authentication +
loading any saved state) automatically.

```ts
import ModulusAgent from '@modulus-learning/agent/browser'

const agent = new ModulusAgent()

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
The logic is in `apps/agent/src/core/auth.ts`. On load it picks one of four
paths:

1. **OAuth response present** (`?state`/`?code`/`?error`) — we were redirected
   back from an authorization request → exchange the code (below).
2. **`?modulus=<issuer>` present** — the Modulus launch interstitial sent the
   learner here with the server URL → validate the issuer, then request an auth
   code.
3. **A stored issuer in `localStorage`** (a returning learner) → validate, then
   request an auth code.
4. **Nothing** → `status: 'none'`, operate locally.

**Registry validation (anti-spoofing).** Before trusting *any* issuer, the agent
fetches the central registry at `https://modulus-learning.org/api/registry` and
confirms the issuer appears in `installations[].site-url`. An unrecognised issuer
is rejected and a definitively-invalid stored issuer is dropped from
`localStorage`. This is what stops a malicious page from pointing instrumented
content at a rogue "Modulus" server.

**PKCE handshake.** The agent generates a `code_verifier` (48 random bytes,
base64url) and its S256 `code_challenge`, plus a CSRF `state`, stashing them in
`sessionStorage`. It uses the activity's own URL (query/fragment stripped) as both
`redirect_uri` and `client_id`, then redirects to
`{issuer}/routes/agent/authorize`. After the server issues a code and redirects
back, the agent POSTs to `{issuer}/routes/agent/token` with the `code_verifier`;
on success it receives `{ api_base_url, access_token, user }`, caches the issuer
in `localStorage`, and is ready. The server side of this exchange —
`createAuthCode` / `claimAuthCode`, the PKCE check, and the activity-scoped token
it mints — is documented in
[AUTHN-AUTHZ → The Agent Flow](./AUTHN-AUTHZ.md#the-agent-flow-oauth-20--pkce).

The resulting access token carries only an opaque user id, a display name, the
single `activity_id`, and a `renew_after` hint — never PII.

## Server-Side Ingestion

Once authenticated, the agent talks to four `agent`-mode commands
(`modules/agent/activity-state/commands.ts`), exposed by the host under
`/routes/agent/activity/{progress,page-state}` and called by the client's
`ApiClient`:

| Command | API call | Effect |
| --- | --- | --- |
| `getProgress` | `GET …/progress` | read the learner's progress for this activity |
| `setProgress` | `PUT …/progress` | record progress (0–1) |
| `getPageState` | `GET …/page-state` | read saved page state |
| `setPageState` | `PUT …/page-state` | save page state |

Three things are true of all four:

- **Everything is scoped to the token.** The services take `user_id` and
  `activity_id` *from the `AgentAuth` context*, never from the request body
  (`ActivityProgressService`, `ActivityPageStateService`). An agent can only ever
  read or write the single `(user, activity)` pair its token was minted for — it
  cannot address another learner or another activity. This is the data-isolation
  boundary enforced in code.
- **Tokens renew transparently.** Each command first calls the agent
  `TokenRefreshService.refreshToken(auth)`. If the token is past its
  `renew_after`, it re-checks the user is enabled and the activity exists, mints a
  fresh token, and returns it as `new_token` in the response; the client's
  `ApiClient` picks `new_token` up and rolls forward. The effect is a sliding
  session built on short-lived tokens, renewed on the back of normal traffic.
- **Writes feed, but don't block on, grade passback.** `setProgress` writes the
  `progress` table and returns immediately. It does **not** call the LMS — the
  [LTI score-submission worker](./LTI.md#flow-4--ags-score-passback) discovers the
  changed progress and submits it after its debounce window. Page state is
  `JSON.stringify`'d into the `page_state.state` column (and parsed back on read).

See [DATA-MODEL → Learner signals](./DATA-MODEL.md#4-learner-signals) for the
`progress` and `page_state` tables these write.

## The Data-Isolation Guarantee, End to End

Putting the pieces together, the Tier 2 ↔ Tier 3 rule (activities never receive
PII) is upheld at three points:

1. the **token** the agent receives carries only `{ user: {id, full_name?},
   activity_id, renew_after }`;
2. the **API** only ever exposes this learner's progress/page state for this one
   activity, because the services read identity from the token; and
3. the agent **validates the server** (registry) before sending anything.

What may cross to authored content is exactly the right-hand column of the
[data-isolation table](./DATA-MODEL.md#the-data-isolation-boundary-in-schema-terms).
See [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) for the policy view.

## Honest Notes & Open Questions

Flagged in the code, relevant to authors and maintainers:

- **Latest-only persistence.** The server stores the *current* progress and page
  state per `(user, activity)`, not a per-interaction history — see the
  [DATA-MODEL scope note](./DATA-MODEL.md#4-learner-signals).
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
- [DATA-MODEL → Learner signals](./DATA-MODEL.md#4-learner-signals) — the tables
  the agent reads and writes.
