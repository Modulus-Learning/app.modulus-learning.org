---
title: "LTI 1.3 Integration"
path: "lti"
summary: "How Modulus is an LTI 1.3 tool for an institutional LMS: the three keypairs and trust model, platform registration, the OIDC login and launch flows, deep linking for content selection, and the queue-backed AGS score-passback worker built to survive thousands of concurrent submissions."
---

# LTI 1.3 Integration

LTI 1.3 is the **Tier 1 ↔ Tier 2** surface from
[ARCHITECTURE → System Context](./ARCHITECTURE.md#system-context-three-tiers): the
standards-based connection between the institutional LMS (OSU Canvas / "Carmen")
and Modulus. It is the reason Modulus exists — replacing Ximera's legacy LTI link
with a modern one that supports deep linking, resource-link launches, and
Assignment & Grade Services (AGS) grade passback.

The implementation lives in `packages/core/src/modules/app/lti/`, with the
tool keystore in `lib/lti-keystore.ts` and the passback worker in
`workers/score-submission.ts`. The schema it drives is in
[DATA-MODEL → LTI integration](./DATA-MODEL.md#5-lti-integration).

This doc maps onto the data-flow table in the institutional summary; the eight
flows there correspond to the sections below.

## Keys & Trust

Three distinct RS256 keypairs are in play — keeping them straight is the key to
understanding the rest:

| Keypair | Source | Used to | Reference |
| --- | --- | --- | --- |
| **Modulus session keys** | `config.jwt` | sign/verify learner, admin, agent session tokens | [AUTHN-AUTHZ](./AUTHN-AUTHZ.md) |
| **Tool LTI keys** | `config.lti.jwks` | sign *tool-originating* LTI messages and AGS client-assertions; published as our JWKS | this doc |
| **Platform keys** | remote, per platform | verify *incoming* `id_token` launches | this doc |

The tool's keypair is held by **`LtiKeyStore`** (`LtiKeyStore.create` from
`config.lti.jwks`). It exposes `getJWKS()` (served at the host's `/lti/jwks` route
so the LMS can fetch our public key), `signPlatformMessage()` (used by deep
linking), and the private key + `kid` (used to mint AGS client-assertions). Keys
are currently in-memory and regenerated on restart — persistence is a noted
`TODO`.

Incoming launches are verified against the **platform's** JWKS, fetched lazily
with `jose`'s `createRemoteJWKSet` and cached in-memory per platform inside
`LtiLaunchService` (also a candidate for a dedicated service / persistence).

## Platform Registration

For an LMS to be trusted it must exist in `lti_platforms` — `issuer`,
`client_id`, the platform's `authorization_endpoint`, `token_endpoint`,
`jwks_uri`, and `authorization_server`. These records are managed through the
admin `ltiPlatforms` commands (`modules/admin/lti-platforms/`). Each
`(issuer, deployment_id)` seen during a launch is upserted into
`lti_platform_deployments` automatically.

## Flow 1 — OIDC Login (third-party initiated)

Every LTI 1.3 launch begins with an OpenID Connect *third-party initiated login*.
The platform redirects the browser to the host's `/lti/login`, which calls
`LtiCommands.handleLogin` → `LtiLoginService` (`services/login.ts`):

1. Resolve the platform by `iss`; if a `client_id` was supplied, verify it
   matches the registered one.
2. Generate a **nonce**, persist it (`lti_nonces`), and generate a random
   `state`.
3. Build the OIDC `AuthenticationRequest` (`response_type=id_token`,
   `response_mode=form_post`, `scope=openid`, `prompt=none`, our
   `redirect_uri`, the `nonce`, `state`, and the platform's `login_hint` /
   `lti_message_hint`) and redirect the browser to the platform's
   `authorization_endpoint`.

The nonce written here is what the subsequent launch must present — the anti-
replay mechanism closes in Flow 2.

## Flow 2 — Launch & Validation

The platform posts a signed `id_token` back to the host's `/lti/launch`, which
calls `LtiCommands.handleLaunch` → `LtiLaunchService.handleLaunch`. Validation
(`validateLaunch`) is strict and ordered:

1. Resolve the platform by `issuer`; fetch its JWKS.
2. **Verify the `id_token`** signature against that JWKS (`jwtVerify`, 10-minute
   clock tolerance).
3. Validate the payload shape, then check the **`iss`** claim equals the issuer
   and the **`aud`** claim contains the platform's `client_id`.
4. Upsert the platform deployment.
5. **Nonce check** — the launch nonce must exist in `lti_nonces` and be unused;
   it is then marked used. A replayed launch fails here.

A valid launch is then dispatched on the pair `(message_type, custom
modulus_launch_type)` — only known combinations are accepted:

| `modulus_launch_type` | LTI message type | Handler |
| --- | --- | --- |
| `start-activity` | `LtiResourceLinkRequest` | `handleActivityLaunch` |
| `deep-link` | `LtiDeepLinkingRequest` | `handleDeepLinkLaunch` |
| `view-dashboard` | `LtiResourceLinkRequest` | `handleDashboardLaunch` |

All three resolve the launching user through **`LtiSignInService`** (resolve by
`(iss, sub)` → by email → auto-provision; instructor vs. learner decided by
`isInstructor()` over the LTI roles claim — see
[AUTHN-AUTHZ → Learner sessions](./AUTHN-AUTHZ.md#learner-sessions-appsession))
and mint Modulus session tokens.

`handleActivityLaunch` additionally provisions grade passback: it reads the
`modulus_activity_code` / `modulus_activity_url` custom claims, finds the
activity, and — if the launch carries an AGS endpoint — **finds or creates a
`lti_lineitems` row** (`submitted_progress: 0`) binding this `(user, activity)`
to the platform's line-item URL. No score is sent here; that is the worker's job
(Flow 4). The host then renders the interstitial launch page and redirects the
learner into the Ximera activity.

## Flow 3 — Deep Linking (instructor content selection)

Deep linking is how an instructor, *inside Canvas*, picks which Ximera activity
an assignment points to.

1. The instructor's deep-link launch (Flow 2 → `handleDeepLinkLaunch`) stores the
   full launch JSON in `lti_launches` (1-hour expiry) and returns a `launch_id`
   to the Modulus UI.
2. The instructor selects/enters an activity in the Modulus interstitial; the
   host posts to `/lti/deep-link/activities` → `LtiCommands.handleDeepLink` →
   `LtiDeepLinkingService.handleDeepLink`:
   - load the stored launch (reject if expired), resolve the platform;
   - resolve the **activity code** by its public code and enforce its
     `url_prefix` if set;
   - **find-or-create** the `activities` row for the URL and **associate** it with
     the activity code (idempotent — see the in-code note on the cancel-after-
     submit caveat);
   - build an `ltiResourceLink` content item whose launch URL carries the custom
     claims (`modulus_launch_type: 'start-activity'`, the activity code/URL, plus
     a broad set of Canvas substitution variables), **sign** a
     `LtiDeepLinkingResponse` with the tool keystore, and return `{ jwt,
     return_url }`.
3. The host auto-posts the signed response back to the platform's
   `deep_link_return_url`; Canvas creates the assignment link. A later learner
   click on that link is a `start-activity` launch (Flow 2).

## Flow 4 — AGS Score Passback

This is the centrepiece, and the part designed for the OSU-scale constraint:
**thousands of learners may submit progress at nearly the same time, and no score
may be lost.** The design treats the database as a durable work queue and does
passback in a background worker rather than inline on a request.

### How a score becomes a submission

The agent records normalized progress (0–1.0) into the `progress` table
([AGENT](./AGENT.md)). The worker does the rest:

```
agent → progress table → [worker: findNext → claim → submit → mark] → LMS AGS
```

`startScoreSubmissionWorker` (`workers/score-submission.ts`) is launched by
`initCore`'s `startBackgroundJobs()`
([ARCHITECTURE → Single-instance](./ARCHITECTURE.md#3-single-instance-no-separate-api-server))
and polls `ScoreSubmissionProcessor.processOne()` in a loop. Each call does one
unit of work:

1. **Find the next eligible line item** (`findNextPendingSubmission`). A single
   SQL query joins `lti_lineitems` to `progress` and selects rows where:
   - `progress.progress > lineitems.submitted_progress` (there's something new
     to send),
   - the progress update is older than `debounce_seconds` (so a flurry of rapid
     updates coalesces into one submission of the *latest* value),
   - the row is **not locked** (or its lock is older than `lock_timeout_seconds`,
     i.e. stale), and
   - it is **not in a backoff** window (`submission_next_retry_at` is null or
     past).

   Results are ordered by the `GREATEST(...)` of their eligibility timestamps, so
   the longest-waiting work goes first; `LIMIT 1`.

2. **Claim it** (`claimLineItemForSubmission`). An atomic
   `UPDATE … SET submission_locked_at = NOW() WHERE id = ? AND (unlocked OR
   stale) RETURNING id`. If it returns no row, another worker won the race →
   `claimed_by_other`. This row-level compare-and-set is what makes running
   **multiple workers** safe.

3. **Submit** (`submitScore`). Fetch a platform access token (below) and
   `POST {lineitem_url}/scores` with `scoreGiven`, `scoreMaximum: 1`,
   `activityProgress: InProgress`, `gradingProgress: FullyGraded`, and the LMS
   `lti_user_id`.

4. **Record the outcome:**
   - success → `markSubmissionSuccess` clears the lock/attempts/retry/error and
     sets `submitted_progress` + `submitted_at`;
   - failure → `markSubmissionFailure` releases the lock, increments
     `submission_attempts`, stores the error, and sets
     `submission_next_retry_at = NOW() + LEAST(max, base * 2^attempts)` —
     **exponential backoff** capped at `backoff_max_seconds`.

The loop sleeps `poll_interval_ms` only when nothing is pending; on success,
contended claim, or failure it loops immediately to drain the queue. An
unexpected error backs off `error_interval_ms`. All knobs live under
`config.lti.score_submission` (`debounce_seconds`, `lock_timeout_seconds`,
`poll_interval_ms`, `error_interval_ms`, `backoff_base_seconds`,
`backoff_max_seconds`).

### Why this survives scale and crashes

- **Debounce** collapses many progress writes per learner into one passback of
  the current value — essential when an activity reports frequently.
- **Idempotent target state** — the worker always sends the *current* progress
  and only when it exceeds what was last submitted, so a missed cycle simply
  gets picked up later.
- **Stale-lock reclaim** — a worker that crashes mid-submission leaves a lock
  that becomes claimable again after `lock_timeout_seconds`, so no line item is
  stranded.
- **Independent scaling** — because claiming is an atomic row update, passback
  can be scaled out to several worker processes for high-volume installs (the
  summary doc's note), and is the obvious candidate to run out-of-process behind
  the planned [remote connector](./REMOTE-CONNECTOR.md).

### Platform access tokens

`AccessTokenManager` (`services/access-tokens.ts`) obtains the OAuth token needed
to call AGS, using the **client-credentials grant with a JWT client-assertion** —
no shared secret. It signs a short-lived assertion with the tool keystore
(`client_assertion_type: …jwt-bearer`), requests the AGS scopes
(`…/lineitem`, `…/result.readonly`, `…/score`), and caches the resulting token
in-memory per platform, refreshing ~30s before expiry (Canvas tokens last an
hour).

> **Note — superseded inline path.** `services/score-passback.ts`
> (`LtiScorePassbackService`) is an earlier, synchronous submit-on-demand variant.
> It is **not wired into the DI registry** and is not on the live path; the
> worker-driven `ScoreSubmissionProcessor` replaces it. Treat it as legacy until
> removed.

## Commands & Host Routes

The LTI commands are all **`auth: { mode: 'none' }`** — they are
platform-to-platform exchanges authenticated by JWT signatures and nonces, not by
a Modulus session ([CORE-COMPOSITION → The Command Pattern](./CORE-COMPOSITION.md#the-command-pattern)):

| Command | Host route | Purpose |
| --- | --- | --- |
| `getJWKS` | `/lti/jwks` | publish the tool's public key set |
| `handleLogin` | `/lti/login` | OIDC login initiation (Flow 1) |
| `handleLaunch` | `/lti/launch` | id_token launch (Flow 2) |
| `handleDeepLink` | `/lti/deep-link/activities` | content-item response (Flow 3) |

The host also serves the activity launch interstitial under
`app/lti/launch/[...go]` and a registration helper at `/lti/register`. (An open
`TODO` asks whether `handleDeepLink` should require an authenticated `user`
instead of `none`.)

## Honest Notes & Open Questions

- **In-memory key/JWKS caches.** The tool keystore and per-platform remote JWKS
  caches reset on restart and don't survive across serverless instances —
  persistence is flagged for both.
- **`activityProgress` is always `InProgress`.** The passback never sends
  `Completed`; whether/when it should is a `TODO`.
- **Stored-launch shape.** Deep-link launches are persisted as a JSON blob;
  picking out only the needed fields into columns is noted.
- **Nonce cleanup.** Used nonces are marked but not yet pruned.
- **Multi-platform reality.** The code currently targets Canvas; role mapping
  (`INSTRUCTOR_LTI_ROLES`) and some custom fields are Canvas-shaped.

---

## Where to go next

- [AGENT](./AGENT.md) — how normalized progress reaches the `progress` table that
  feeds passback.
- [DATA-MODEL → LTI integration](./DATA-MODEL.md#5-lti-integration) — the table
  definitions, including the `lti_lineitems` submission-tracking columns.
- [AUTHN-AUTHZ](./AUTHN-AUTHZ.md) — auto-provisioning and the session tokens
  minted at launch.
