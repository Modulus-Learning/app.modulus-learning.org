# Session Management Review: Modulus Against the Byline Refactor

Date: 2026-10-30

Status: Revision 4, after three independent reviews (see
[Review Response](#review-response)). Nothing in the code has been changed. This
document establishes the need for the work and lists the decisions the
implementation spec must settle; it is not itself the implementation spec.
Revision 4 has passed the final analysis review and is ready for implementation
specification. See [Implementation Handoff](#implementation-handoff) for the
next agent's requirements; no prior chat context is needed.

Document type: Analysis — what Modulus does today, how it compares with the
refactor made in bylinecms.dev after its security audit, and a proposed scope.

## Question

bylinecms.dev refactored its two-cookie (access + refresh) session strategy
following a security audit and review; infonomic.io and www.forru.org followed
downstream. One visible result is an interstitial page with a spinner, shown when
the access cookie may have expired and the browser must find out whether the
refresh credential can still restore the session.

Does Modulus — the learner gradebook and the admin backend — warrant a similar
refactor?

## Short Answer

Not the host-layer refactor: Modulus already has it, including the spinner
interstitial. It was ported from Byline during the TanStack Start migration
(`session-recovery.tsx` says "ported from Byline's `AdminSessionRecovery`").

The part that is missing is the **server-side half** of Byline's audit work:
stateful, revocable sessions in the provider (core) layer. Modulus learner and
admin sessions cannot be revoked server-side. That is worth fixing — admin first.

## Byline Reference Points

The comparison was made against these bylinecms.dev commits and documents:

- `db29c013` — fix: coordinated jwt renewal and per-login revocation (login
  sessions table, `sid` in tokens, session middleware, session-change boundary).
- `74d28e13` — fix: added account session revocation checkpoint (`sv` session
  generation).
- `6294e7fd` — feat(host): renewed expired sessions in place on admin navigation.
- `e5244ba5` — fix(host): styled and translated the session change interstitial.
- `docs/07-auth-and-security/01-authn-authz.md`, sections "Sessions —
  `SessionProvider` interface", "Password changes and account disablement", and
  "Explicit renewal and session changes".

Byline's built-in `JwtSessionProvider`: 15-minute access, 30-day refresh stored
in `admin_refresh_tokens`, rotation on every refresh, replay detection that
revokes the login, per-login `sid`, account generation `sv` checked on access
verification, and revocation of all sessions on password change or disablement.

## What Modulus Already Has

All paths below are under `packages/host-tanstack-start/src/` unless stated.

| Byline mechanism | Modulus equivalent |
|---|---|
| Verification-only requests and SSR; no token rotation as a side effect | `lib/session/state.ts`, `lib/session/context.ts` |
| Explicit renewal; a failed renewal never clears cookies | `lib/session/renewal.ts`, `modules/{app,admin}/session/renew.server.ts` |
| SSR with expired access → interstitial (spinner) page that renews and returns | `lib/session/bootstrap.ts` + `lib/session/session-bootstrap.tsx` (`LoaderRing`) at `/auth/renew` and `/admin/renew`; the `_renewed=1` marker bounds it to one bootstrap per navigation |
| Renew in place on client-side navigation | `lib/session/route-guard.ts` |
| Pre-handler boundary; one renewal-and-replay only when the handler provably did not run | `lib/session/boundary.ts`, `lib/session/replay.ts` |
| Single-flight per tab, Web Locks across tabs, BroadcastChannel notices | `lib/session/coordination.ts`, `lib/session/browser-renewal.ts` |
| Session-changed blocking interstitial | `lib/session/session-identity.tsx` |
| Public-page soft recovery | `lib/session/session-recovery.tsx`, mounted in `apps/gradebook/src/routes/$lng/_public/route.tsx` |
| LMS-framed terminal state | `bootstrapStep` returns `session-unavailable` for a framed learner instead of sign-in (LTI learners have no password) |

`docs/AUTHN-AUTHZ.md` § "Host Sessions: Verification and Explicit Renewal"
documents this model.

## Gaps

All in `packages/core`, with small host consequences.

### 1. Learner and Admin Refresh Tokens Are Stateless JWTs

`modules/admin/session/services/token-refresh.ts` (`AdminTokenRefreshService`)
and `modules/app/session/services/token-refresh.ts` (`TokenRefreshService`)
verify the refresh JWT's signature, re-read the user, check `is_enabled`, and
issue a new pair. The refresh payload is only `{ admin_user_id }` or
`{ user_id }`. No database row exists for a refresh token (the only refresh-token
table is `agent_refresh_tokens`). Consequences:

- **Rotation does not invalidate.** Every refresh token issued remains valid for
  its full lifetime — `API_JWT_REFRESH_TOKEN_EXPIRES_IN=2592000` (30 days) in
  `apps/gradebook/.env.example`. The production value was not checked.
- **No replay detection.** A stolen refresh token can be used alongside the
  legitimate one indefinitely within its lifetime.
- **Sign-out is client-side only.** `signOutDomain` in
  `lib/session/password-sign-in.server.ts` calls `clearSession(domain)` and
  nothing else. A copied refresh token survives sign-out. Without "remember me"
  the refresh cookie is a session cookie, but the JWT inside it is still valid
  for 30 days.

### 2. Password Change Does Not Revoke Other Sessions

`core.app.account.changePassword` (called from
`modules/app/account/change-password.server.ts`) and its admin counterpart have no
equivalent of Byline's `session_version`. After an admin changes a password
because of a suspected compromise, existing refresh tokens keep working. The only
effective kill switch is disabling the account, which takes effect at the next
refresh because refresh re-checks `is_enabled`.

### 3. No Per-Login Session Identifier

`lib/session/principal.ts` states: "Core does not issue a per-login session id
yet, so the identity is the principal — the session domain plus the user id."
As a result:

- a successful sign-in cannot revoke the login it replaces;
- the session-changed check cannot distinguish two logins of the same user;
- logout cannot target a specific login.

### 4. Access Tokens Are Signature-Only and Carry Abilities

Access verification checks only the signature and expiry. The access lifetime is
`API_JWT_ACCESS_TOKEN_EXPIRES_IN=600` (10 minutes) in `.env.example`. Within that
window an access token survives **every** revocation event, not only a permission
change:

- logout;
- password change or administrator reset;
- account disablement;
- detected refresh-token replay (see
  [Rotation by Login Generation](#rotation-by-login-generation)) — the event most
  likely to mean the credentials are already in an attacker's hands.

Byline closes this by checking the account generation (`sv`) and the login's
validity (`sid`) on every access verification, at the cost of a database read.

**Decision:** enforce revocation during access verification for **both**
domains. Admin traffic is low-volume and high-privilege, so the read is cheap
insurance. For learners, the agent's separate token path keeps instrumentation
traffic off this check, and without it learner revocation would only mean "no
further renewal", leaving a stolen learner access token its full 10 minutes.

Embedded abilities still lag by up to the access lifetime under either choice
unless the check also re-reads abilities; that lag on its own is acceptable.

## Admin Versus Learner

**Admin** clearly warrants the change: high-privilege, password-based sessions
where gaps 1–3 mirror exactly what Byline's audit closed.

**Learner** warrants it too, but with a different failure policy:

- Most learners arrive by LTI launch inside the Canvas iframe, have no password,
  and every launch mints a fresh session anyway.
- Inside the iframe, Web Locks and BroadcastChannel may be partitioned or denied
  (the coordination code feature-detects and degrades to the in-tab queue), so
  concurrent renewals from two Canvas tabs are realistic.
- Today such collisions are harmless *because* old refresh tokens stay valid.
  Byline's strict reuse rule (reuse revokes the login, failing closed) would turn
  them into "please relaunch" screens.

For learners, renewal tolerates a short reuse grace window, built so that a login
can never fork into two independently renewable branches — see
[Rotation by Login Generation](#rotation-by-login-generation).

### Retries After a Lost Response Affect Both Domains

Browser coordination (single-flight, Web Locks) prevents *concurrent* renewals,
but not this sequence: the server commits a rotation, the response is lost
(network drop, tab closed mid-flight, proxy timeout), and the browser retries
with the old refresh cookie it still holds. Under strict reuse detection that
retry revokes a legitimate login. Byline accepts this and documents it as a
fail-closed collision that may require fresh sign-in. Revoking the login on
reuse follows RFC 9700 §4.14.2; how to treat this legitimate retry is a product
decision, not a technical one (see [Open Decisions](#open-decisions)).

## Gap 5: Framed-Learner Recovery Outside the Bootstrap Page

The host is **not** unaffected. Today only the bootstrap page
(`lib/session/bootstrap.ts`, `bootstrapStep`) knows that a framed learner whose
session cannot be restored must see the relaunch message rather than sign-in —
and only for a `terminal` renewal. Every other authentication failure a framed
learner can reach ends at sign-in, a dead end for a password-less LTI learner:

- **Terminal renewal on client-side navigation.** `resolveGuardedSession`
  (`lib/session/route-guard.ts`) turns `terminal` into `anonymous`, and the
  learner layout (`routes/$lng/_auth/route.route.tsx`, `beforeLoad`) redirects
  to `/sign-in?callbackUrl=…`.
- **An access token that fails verification for a reason other than expiry.**
  `classifySession` (`lib/session/state.ts`) returns `anonymous` for any status
  other than `valid` or `expired` — `bad_payload` and `invalid` from
  `core/src/lib/jwt/services.ts` — *even when a refresh cookie is present*, so no
  renewal is attempted. At rollout, an unexpired legacy access token without
  `sid` fails payload validation and takes exactly this path. A revoked access
  token (Gap 4 enforcement) would too.
- **The server-function boundary — two distinct paths.**
  - An `unauthorized` decision (no session at all) is a plain, unmarked 401
    (`lib/session/boundary.ts`). `sendWithRenewal` (`lib/session/replay.ts`)
    returns it to the caller unchanged; nothing renews, and what the page then
    shows is up to the calling code.
  - Only a `renew`-signalled response leads to a renewal. If that renewal is
    `terminal` or `transient`, `sendWithRenewal` throws `SessionEndedError` —
    for `terminal`, "Your session has ended. Please sign in again."

The requirement is therefore broader than terminal renewal: **every** framed
learner authentication failure — anonymous, boundary-unauthorised, revoked,
legacy or terminal — must resolve to the relaunch state, through one shared
decision used by the bootstrap, the guard and the boundary. (Sign-in inside the
frame is never useful to an LTI learner, so this is correct even for a learner
who was never signed in.) These paths exist today but are rare; revocation and
the forced re-authentication at rollout make them routine.

Two limits on that shared decision:

- **Transient failures stay transient.** Once verification reads the database
  (Gap 4), a database outage during verification or renewal is neither
  anonymous nor revoked. It must surface as a retryable "unavailable" state —
  the existing manual-retry view — never as sign-in, never as the relaunch
  message, and never by clearing cookies. `classifySession` needs a fourth
  outcome for this; today it has only `valid`, `renewable` and `anonymous`.
- **Only boundary-marked responses carry session meaning.** A 401 produced by a
  business handler is not evidence about the session and is not proof that the
  handler did not run. The shared decision, like replay, acts only on responses
  the session middleware marked (`x-modulus-auth-boundary`) or on the
  middleware's own `unauthorized` answer, never on an arbitrary 401.

## Proposed Scope

For review — nothing implemented.

### Phase 1: Stateful Sessions in Core

- **Schema.** A per-domain login-session table (learner and admin share no tables
  today, so keep them separate) holding, per login: account id, current
  generation, `rotated_at`, a grace-used flag, `created_at`, `ended_at`, and the
  absolute expiry if adopted (Open Decision 4). Refresh tokens carry `sid` and
  the generation they were issued at; access tokens carry `sid` and the account
  generation `sv`. The generation scheme below needs no per-token rows; whether
  to keep hashed token rows anyway (for audit, as Byline does) is an
  implementation choice.
- **Access verification, both domains.** Reject an access token whose login is
  ended or whose `sv` is stale; see Gap 4. A database failure during this check
  is reported as unavailable (retryable), distinct from rejection.
- **One issuance path, one lock order.** Every operation that issues or revokes
  credentials takes the account row lock first, then the login row. That is:
  refresh; logout; password change and administrator reset; disablement; password
  sign-in; Google and GitHub OAuth sign-in
  (`modules/app/session/oauth-callback.server.ts`); and all three LTI issuance
  points — activity, deep-link and dashboard launches
  (`core/src/modules/app/lti/services/launch.ts`, the three `createTokens` calls).
- **Revalidate under the lock.** Credential checks that run *before* the lock —
  password verification in particular, which is deliberately slow — are not
  trusted at issuance. Inside the lock, sign-in re-checks that the account is
  enabled, that `sv` is unchanged from the value observed before verification,
  and, for password sign-in, that the stored password hash is the one that was
  verified. Refresh re-checks the login, `sv` and `is_enabled`. Otherwise a
  sign-in that verified the old password could wait out a concurrent password
  change and issue a session the change should have prevented.
- **Revocation scope.**
  - *One login* — logout, detected replay, and sign-in replacement end only the
    login concerned.
  - *Whole account* — password change, administrator reset and disablement
    advance `sv` and end all of the account's logins, atomically with the account
    update. Re-enabling an account does not restore ended logins.
- **Logout.** Revoke the login server-side, then clear cookies (database
  unavailable: Open Decision 3).
- **Sign-in replacement.** Optionally revoke the login identified by the
  credentials presented on the sign-in request, as Byline does.
- **Cleanup.** A background task alongside the existing nonce/auth-code cleanup,
  removing ended logins after a retention period.

### Rotation by Login Generation

Revision 2 proposed that a grace retry issue a fresh successor pair. A review
showed that this forks the login: if A rotates to B and a grace retry of A
produces C, B and C are both independently renewable, so an attacker holding one
branch and the browser holding the other can each keep rotating without either
ever presenting a consumed token. Invalidating B when issuing C instead breaks
the browser whenever B's delayed response is the cookie that lands last.

Keeping the generation on the **login** rather than on each token makes a single
live branch structural. Let the login's current generation be *L*, and the
presented refresh token's generation *t*. Each refresh runs under the lock:

| Presented | Condition | Result |
|---|---|---|
| *t = L* | — | Rotate: *L* becomes *L + 1*; issue a pair at *L + 1*; set `rotated_at`, clear grace-used |
| *t = L − 1* | within the grace window of `rotated_at`, grace not yet used | Grace: issue a pair at *L* (the generation the live successor already holds); *L* does not change; set grace-used |
| *t = L − 1* | outside the window, or grace already used | Replay: end the login |
| *t < L − 1* | — | Replay: end the login |
| any | login ended, `sv` stale, or account disabled | `terminal` |

What this gives:

- **No fork.** A grace pair and the live successor share generation *L*. The
  first of them to rotate advances the login to *L + 1*, which makes the other
  stale; presenting it after the window is replay.
- **Delayed responses are safe while the login has not advanced again.** If B
  (from the original rotation) and C (from the grace retry) both reach the
  browser, in either order, whichever cookie lands last is at generation *L* and
  valid. That guarantee does **not** hold if another request advances the login
  to *L + 1* before a delayed generation-*L* response writes its cookies: the
  browser then holds a predecessor, and its next renewal — outside the window —
  is replay, which ends the login. Within one tab, single-flight renewal and the
  auth-action queue make that ordering impossible; it needs two renewers that
  are not coordinated (tabs or frames without Web Locks) plus a response delayed
  past a full rotation. **Accepted** as a fail-closed residual, like Byline's
  documented collision: it costs a relaunch (learner) or sign-in (admin), never
  a security failure. Cover it with a test that pins the outcome.
- **Lost-response retry within the window succeeds**, which covers the common
  collision without failing closed.
- **Attacker detection is conditional, not guaranteed.** An attacker who
  presents a copied predecessor inside the window obtains a pair at *L* and
  shares one branch with the browser. Detection happens when either side
  presents a stale token **outside** grace: then the login ends for both, and
  Gap 4 enforcement cuts the access tokens too. Usually that is the stale side's
  next renewal, an access lifetime later. It is not guaranteed:
  - **Synchronised renewal.** Because grace resets each generation, an attacker
    who renews within the window after each of the browser's rotations (5 → 6,
    attacker obtains 6 by grace; 6 → 7, attacker obtains 7 by grace; and so on)
    is never detected. It needs favourable timing, but the policy permits it.
  - **Idle victim.** An attacker who rotates alone is never contested. That is
    inherent to refresh tokens, not to grace.

  An absolute login lifetime (Open Decision 4) bounds both cases. A further
  optional mitigation: treat grace issued on several consecutive generations as
  replay, since legitimate collisions are occasional rather than systematic.
- **Window and cap are per generation.** Grace-used resets on each rotation, so
  each generation permits at most one grace issuance.

Policy by domain:

- **Learner:** grace enabled.
- **Admin:** strict by default (grace disabled): any *t = L − 1* is replay, so a
  lost-response retry signs the admin out. Document that outcome and cover it
  with a test. Enabling grace for admins is Open Decision 1.

### Phase 2

With generation-based rotation in Phase 1, replay detection is part of the same
change rather than a later phase: the table above *is* the detection. Phase 2
reduces to tuning — window length, observability of grace issuances and replays
(a token-free event hook, as Byline's `onEvent`), and alerting.

### Host Changes

- **Principal identity.** Learners: domain + user id, so a same-user Canvas
  relaunch is continuity, not a change; `sid` stays in the credentials for
  server-side revocation. Admins: domain + user id + `sid`.
- **Cross-tab notices must respect the same distinction.** Today
  `notifySessionAction` (`lib/session/coordination.ts`) posts
  `{ type: 'session-changed' }` with no identity, and every receiving tab flags
  a change. The notice should carry the principal it was sent for (an opaque id,
  not a credential, on a same-origin channel), and receivers should compare it
  with `samePrincipal`. A sign-out always flags. LTI launches are server-side and
  send no notice; the server's `changed` answer remains the backstop.
- `signOutDomain` calls a core revocation command before `clearSession`.
- A successful password change clears session cookies and asks for fresh
  sign-in, as Byline's does.
- **Framed-learner relaunch handling** for every failure path (Gap 5).
- The renewal outcomes themselves do not change: a revoked login is `terminal`.

### Rollout

- Tokens in circulation have no `sid`; reject them, forcing one fresh sign-in
  (admins: password; learners: relaunch from Canvas). Gap 5 must be fixed first,
  including the legacy-token `bad_payload` path, or framed learners hit the
  sign-in dead end on rollout day.
- Requires a database migration and a lockstep release, because `core` and
  `host-tanstack-start` must ship together. Stop old instances before migrating,
  as Byline's upgrade note requires, so old and new providers never mix.

## Decisions Taken

Settled across the three reviews; the implementation spec should treat these as
given:

- **Learner access tokens are revocation-checked on every request**, as admin
  tokens are. The agent's separate token path keeps instrumentation traffic off
  this check, so another revocation window is not worth accepting.
- **Learner continuity is domain + user id**; `sid` is compared for admins only.
  Cross-tab notices follow the same rule.
- **Rotation is by login generation**, with grace for learners and strict reuse
  for admins by default.

## Open Decisions

For the implementation spec to settle:

1. **Lost-response retry for admins.** Strict (Byline's choice: a forced
   sign-in, documented and tested) or the learner grace rule?
2. **Grace window length** for learners (and admins, if enabled).
3. **Logout with the database unavailable.** Recommendation, following Byline:
   clear the cookies anyway, but report the logout as unconfirmed rather than
   successful, because the login remains valid server-side.
4. **Sliding versus absolute session lifetime.** Today rotation slides the
   refresh expiry indefinitely (as Byline's does; it has no absolute limit). An
   absolute cap per login, stored on the login row, bounds a stolen session's
   life — including the idle-victim and synchronised-renewal cases above.
   Recommendation: an absolute cap for both domains, because learner grace makes
   the synchronised case possible there.

## Implementation Handoff

Final analysis review: 2026-10-30. **Revision 4 is ready to serve as the basis
for an implementation spec.** No blocking issue remains at the analysis level,
and no further analysis revision is required before drafting that spec. This
confirms design readiness, not implementation correctness: the resulting code
and tests still require review.

If you are picking this up in another session or on another computer, use this
document as the review record. Write the implementation spec and plan under
`specs/`, preserving the requirements in [Decisions Taken](#decisions-taken)
and the limitations in [Rotation by Login Generation](#rotation-by-login-generation).
The next deliverable must:

1. **Resolve the four policy decisions.** State explicit defaults and limits
   for admin retry policy, grace duration, logout during a database outage, and
   absolute versus sliding lifetime for each domain. Record the rationale for
   each choice. The recommendations in [Open Decisions](#open-decisions) are
   inputs to these decisions, not already-settled values.
2. **Complete the rotation state machine.** Validate credentials before any
   state change; define rejection of invalid or future generations; enforce
   token and login expiry; and make account/login revocation checks precede
   issuance. Specify transaction boundaries, lock order, and rollback behaviour
   for every issuance and revocation path listed in Phase 1. Preserve the
   invariant of one shared generation counter with bounded predecessor
   acceptance, rather than claiming only one generation can be accepted.
3. **Define the host failure contract.** Make boundary-originated unauthorised
   responses distinguishable from ordinary business-handler 401s. Specify how
   that distinction reaches the shared learner recovery decision. Preserve
   retryable verification/renewal outages, and permit automatic replay only
   when the boundary proves the business handler did not run.
4. **Specify the implementation surface.** Include database schema and indexes,
   token claims and validation, core command contracts, host changes, cleanup,
   and an ordered implementation plan. Identify the affected files against the
   checkout you are working in rather than relying on historical line numbers.
5. **Define rollout and acceptance tests.** Include migration and stopped-instance
   upgrade steps, legacy-token rejection and framed-learner recovery. Cover
   concurrent refreshes; lost and delayed responses; sign-in overlapping a
   password change; refresh overlapping revocation; all sign-in and LTI issuance
   paths; learner/admin identity rules; database outages; and the documented
   synchronised-attacker and idle-victim sequences. Pin the accepted delayed
   response failure and conditional replay-detection limits in tests rather than
   claiming the generation scheme eliminates them.

The analysis remains a historical explanation of the findings and decisions.
The implementation spec should be a self-contained contract for the final
behaviour, with links back here for rationale. Keep unimplemented behaviour
clearly labelled until the work ships.

## Review Response

### Round 1 (Revision 1 → 2)

An independent review of revision 1 accepted the diagnosis and raised five
points, all adopted:

| Point | Change |
|---|---|
| The 10-minute window also lets a stolen access token outlive logout, password change, disablement and replay detection | Gap 4 rewritten; access verification enforces revocation |
| Rotation needs concurrency rules in Phase 1 | Single lock order and atomic issuance added to Phase 1 |
| "Return the same successor pair" contradicts hashed storage; grace exposure unstated | Superseded in round 2 by generation-based rotation |
| Strict admin reuse detection catches legitimate lost-response retries | Section on retries; Open Decision 1 |
| The host is not unchanged: framed learners reach sign-in through the guard | Confirmed in `routes/$lng/_auth/route.route.tsx`; Gap 5 |

### Round 2 (Revision 2 → 3)

| Point | Change |
|---|---|
| Fresh grace issuance forks a login into two renewable branches; invalidating the first breaks delayed responses | Replaced by [Rotation by Login Generation](#rotation-by-login-generation); replay detection folded into Phase 1 |
| Sign-in must revalidate credentials under the account lock; revocation scope unclear | "Revalidate under the lock" and "Revocation scope" added to Phase 1 |
| Recovery must cover invalid and revoked access tokens, not only terminal renewal | Confirmed in `classifySession`; Gap 5 broadened to every framed-learner failure path |
| Learner continuity by user id; cross-tab notices must respect it | Adopted; confirmed `notifySessionAction` carries no identity today; Host Changes updated |
| Learner access verification should check revocation | Adopted (Decisions Taken) |
| All three LTI issuance points must use the shared rules | Listed explicitly in Phase 1's issuance path |

### Round 3 (Revision 3 → 4)

| Point | Change |
|---|---|
| Detection is not guaranteed: synchronised attacker/browser renewal can ride grace every generation | Attacker analysis rewritten as conditional; synchronised case added to residual risk; absolute lifetime now recommended for both domains; optional consecutive-grace mitigation |
| Delayed responses are safe only while the login has not advanced again | Guarantee qualified; failure mode accepted as fail-closed and to be pinned by a test |
| The checklist misstated the invariant | Checklist item 6 restated as one shared counter with bounded predecessor acceptance |
| Database outages must stay retryable, and arbitrary handler 401s carry no session meaning | Two limits added to Gap 5; Phase 1 access verification distinguishes unavailable from rejected |
| The boundary description conflated the unmarked 401 with `SessionEndedError` | Confirmed in `replay.ts`; Gap 5 boundary bullet split into the two paths |

## Out of Scope / Not Reviewed

- infonomic.io and www.forru.org were not reviewed.
- Agent refresh-token rotation (`agent_refresh_tokens.used_at`) was not traced;
  `docs/AUTHN-AUTHZ.md` § "Honest Notes & Open Questions" already flags it.
- Failed-login throttling (also flagged in that section) is a separate item;
  Byline handled it in its password sign-in admission work.
- The `Partitioned` (CHIPS) cookie decision for the LMS iframe (GitHub issue #10)
  is unaffected by this proposal.

## Review Checklist

For the reviewing agent, the claims most worth verifying:

1. No learner or admin refresh-token table exists in
   `packages/core/src/database/schema/source/` (only `agent-refresh-tokens.ts`).
2. `refreshTokens` in both token-refresh services issues new tokens without
   persisting or invalidating anything.
3. `signOutDomain` performs no server-side revocation.
4. Neither `changePassword` path revokes sessions.
5. The host interstitial and boundary modules listed above behave as described,
   and a `terminal` renewal outcome is the right surface for a revoked login.
6. Rotation by login generation: that the invariant holds — one shared
   generation counter per login, with acceptance of the immediate predecessor
   bounded to the grace window and one issuance per generation (so two
   generations are deliberately renewable during grace, never independently) —
   and that the stated limits (conditional detection, delayed responses after a
   further rotation) are complete.
7. Gap 5: that the listed paths (guard, `classifySession` non-expiry failures,
   the boundary's unmarked 401 and `SessionEndedError` after a signalled
   renewal) are every route by which a framed learner can reach sign-in, and
   that none of them can turn a database outage into sign-in or relaunch.
8. That the Phase 1 issuance path and lock order cover every operation that
   issues or revokes credentials — password, Google and GitHub sign-in, the
   three LTI launches, refresh, logout, password change, reset and disablement —
   and that revalidation under the lock closes the verify-then-wait race.

## Where to Go Next

- `docs/AUTHN-AUTHZ.md` — current Modulus session documentation.
- bylinecms.dev `docs/07-auth-and-security/01-authn-authz.md` — the reference model.
- The next deliverable is a spec and implementation plan under `specs/` for
  Phase 1, following [Implementation Handoff](#implementation-handoff).
