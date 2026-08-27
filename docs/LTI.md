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
[DATA-MODEL → LTI integration](./DATA-MODEL.md#6-lti-integration).

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
`config.lti.jwks`). It exposes `getJWKS()` (served at the host's `/routes/lti/jwks` route
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
The platform redirects the browser to the host's `/routes/lti/login`, which calls
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

The platform posts a signed `id_token` back to the host's `/routes/lti/launch`, which
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

`handleActivityLaunch` also resolves an academic scope from the **verified**
launch. Canvas links created by current deep linking request four custom
substitutions: `Canvas.term.id`, `Canvas.term.name`, `Canvas.term.startAt`, and
`Canvas.term.endAt`. A trimmed, expanded term id resolves the unique
`(platform.id, external term id)` scope. Missing, null, empty, or unexpanded ids
use the global default sentinel instead. The optional name and ISO dates are
normalised independently: unusable metadata never rejects the launch, erases a
previously known value, or mutates the sentinel. Dates are descriptive and do
not gate access or passback.

After sign-in, `handleActivityLaunch` enrolls the launching user in the activity
code named by the launch. Modulus resolves the public code from the custom
`modulus_activity_code` claim against its own records and writes the enrollment
only when that code resolves *and* the launched activity is still associated with
it. The write is idempotent, so a learner who opens the same link every week
keeps one enrollment row with its original `created_at`. Under current policy no
role distinction is made here: an instructor performing a resource-link launch is
enrolled in the same cohort as a learner. Enrollment is defined in
[DATA-MODEL → Activities & grouping](./DATA-MODEL.md#3-activities--grouping).

Two conditions skip the write without disturbing the launch. A public code that
no longer resolves, and an activity that has been removed from the code since the
LMS link was created, each produce a warn-level structured log carrying only the
available code identifier and the activity id — never learner PII — and the
launch response is returned unchanged. Modulus does not restore a removed
association or invent one, and neither condition turns into an invalid launch. An
activity URL that resolves to no `activities` row at all is a different matter:
there is nothing to launch, and that remains an error.

The enrollment write runs before the redirect is returned, whether or not the
launch carries an AGS endpoint, and outside the AGS transaction described next —
a line-item reconciliation failure cannot roll it back.

:::note[Interim diagnostic]
An instructor whose LMS link points at a missing code or a removed association
gets no feedback in the launch itself. The warn log is the only signal today.
:::

If the launch carries an AGS endpoint, core reconciles the one line-item row
unique on `(user, activity, lineitem_url)` with that resolved scope. The current
verified launch is authoritative for platform, deployment, and LTI user
identity. A scope change rebinds the locked row and resets its stale submission,
lease, error, and retry state while leaving historical activity state intact.
No score is sent inline; that is the worker's job (Flow 4).

### Where The Learner Lands

The host sets the learner's session cookies and then redirects. Where it
redirects is a deployment choice, made by `LTI_LAUNCH_INTERSTITIAL` and
documented in
[DEPLOYMENT → Launch Interstitial](./DEPLOYMENT.md#launch-interstitial):

| Mode | The browser goes to | Hops to the activity |
| --- | --- | --- |
| `never` (default) | the activity URL itself | one |
| `always` | `/lti/launch/{activity_id}?scope_id={uuid}` — the Modulus interstitial, which links on to the same activity URL | two |

Both modes end at the same activity URL, carrying exactly two added query
parameters: `modulus`, the Modulus server the agent reports progress to, and
`scope_id`. Neither mode branches on the launching user's LTI role. The
destination is chosen by `selectLaunchDestination`
(`apps/gradebook/src/modules/lti/launch-destination.ts`), which takes no role
argument.

`scope_name` never appears in a URL in either mode. It is display-only — on the
interstitial, and in the later token response the agent receives.

The session is established before the redirect in both modes, which is what lets
the agent's later `/routes/agent/authorize` request authenticate. Every redirect
out of an LTI route is sent as **303 See Other**. The platform delivers the
launch as an auto-submitting HTML form, so a 307 would preserve the method and
replay the learner's `id_token` and `state` to whatever comes next — including,
under `never`, a third-party activity origin.

No Modulus-owned URL on the LTI path embeds an activity URL. Under `never` the
redirect target is the activity URL itself, and under `always` the interstitial
is keyed on the activity's uuid and reads the URL from the `activities` row. An
authored query, fragment, or literal percent escape in an activity URL therefore
survives both modes. The readable nested-URL form, and the round-trip caveat that
came with it, now apply only to the direct `/start-activity` path described
below.

:::note[The direct `/start-activity` path is unchanged]
`/{lng}/start-activity/{code}/{activity-url}` — the non-LTI path, for a learner
who arrives with an activity code rather than through an LMS link — still nests
the target activity URL in the route, readable and unencoded, at stakeholder
request. An authored query, fragment, or literal percent escape embedded in that
target is not guaranteed to round-trip through that catch-all route. Authors
should avoid those forms on that path until link validation or a transport change
is agreed.
:::

If a launch fails before or during any of this, the host redirects to
`/lti/error?code=<slug>`, a readable page carrying no diagnostic detail. The
slugs are a closed set — `invalid_request`, `invalid_launch`, `session_expired`,
and `server_error` — chosen for what the learner should do next rather than for
what went wrong. Only an allowlist of domain errors from core can reach
`invalid_launch`; every other error code defaults to `server_error`, so an outage
never tells a learner to contact their instructor. The diagnostic detail stays in
the existing `log.error({ lti_launch: … })` and `log.error({ lti_login: … })`
calls.

## Flow 3 — Deep Linking (instructor content selection)

Deep linking is how an instructor, *inside Canvas*, picks which Ximera activity
an assignment points to.

1. The instructor's deep-link launch (Flow 2 → `handleDeepLinkLaunch`) stores the
   full launch JSON in `lti_launches` (1-hour expiry) and returns a `launch_id`
   to the Modulus UI.
2. The instructor selects/enters an activity in the Modulus deep-linking form
   at `/lti/deep-link?id=<launch_id>`; the
   host posts to `/routes/lti/deep-link/activities` → `LtiCommands.handleDeepLink` →
   `LtiDeepLinkingService.handleDeepLink`:
   - load the stored launch (reject if expired), resolve the platform;
   - resolve the **activity code** by its public code and enforce its
     `url_prefix` if set;
   - **find-or-create** the `activities` row for the URL and **associate** it with
     the activity code (idempotent — see the in-code note on the cancel-after-
     submit caveat). This association is what a later resource-link launch checks
     before enrolling the learner, so removing an activity from a code in the
     Modulus dashboard stops enrollment through any LMS link that still points at
     it;
   - build an `ltiResourceLink` content item whose `url` is the **generic tool
     launch URL** — `urlBuilder.ltiLaunchUrl`, currently
     `{publicServerUrl}/lti/launch` — with the resource identity carried in the
     custom claims (`modulus_launch_type: 'start-activity'`, the activity
     code/URL, Canvas term identity/display fields, plus the existing Canvas
     substitution variables), **sign** a `LtiDeepLinkingResponse` with the tool
     keystore, and return `{ jwt, return_url }`. The URL is generic rather than
     per-activity because Canvas surfaces it nowhere, `LtiLoginService` ignores
     `target_link_uri`, and under the default `never` mode there is no
     per-activity Modulus page for it to name.
3. The host auto-posts the signed response back to the platform's
   `deep_link_return_url`; Canvas creates the assignment link. A later learner
   click on that link is a `start-activity` launch (Flow 2).

Canvas substitutions are stored on each resource link. Links created before the
term fields were added must be deep-linked again before their launches can
resolve a named scope; otherwise they correctly fall back to the sentinel.

## Flow 4 — AGS Score Passback

This is the centrepiece, and the part designed for the OSU-scale constraint:
**thousands of learners may submit progress at nearly the same time, and no score
may be lost.** The design treats the database as a durable work queue and does
passback in a background worker rather than inline on a request.

### How a score becomes a submission

The agent records normalized progress (0–1.0) under its token-bound scope. The
same ingestion transaction advances `progress_events` and runs one scoped line-
item scheduling statement:

```
agent → scoped progress/event → scoped line-item queue → lease-fenced worker → LMS AGS
```

The scheduling update only matches a live line item with the same `scope_id`.
If another-scope row exists, it is classified and logged without being locked or
rewritten. The worker selects due items from the partial queue index, claims one
with `FOR UPDATE SKIP LOCKED`, persists an expiring lease and fencing token,
posts the row's `submittable_progress`, then records the outcome only if its
fencing token still matches. Per-item throttling/backoff and the per-platform
circuit breaker are described in the canonical
[LTI Score Submission](./LTI-SCORE-SUBMISSION.md) reference.

### Why this survives scale and crashes

- **Level-triggered state** — work exists whenever
  `submittable_progress > submitted_progress`; no enqueue flag can be lost.
- **Scope isolation** — only the line item matching the progress event's scope is
  scheduled, and the claimed row carries that same scope to diagnostics.
- **Lease expiry and fencing** — a crash leaves a reclaimable lease, while a
  stale worker cannot overwrite the newer claimant's result.
- **Bounded concurrency** — independent line items run concurrently under a
  per-platform quota governor and circuit breaker.

### Platform access tokens

`AccessTokenManager` (`services/access-tokens.ts`) obtains the OAuth token needed
to call AGS, using the **client-credentials grant with a JWT client-assertion** —
no shared secret. It signs a short-lived assertion with the tool keystore
(`client_assertion_type: …jwt-bearer`), requests the AGS scopes
(`…/lineitem`, `…/result.readonly`, `…/score`), and caches the resulting token
in-memory per platform, refreshing ~30s before expiry (Canvas tokens last an
hour).

## Commands & Host Routes

The three platform-to-platform commands are **`auth: { mode: 'none' }`** — they
are authenticated by JWT signatures and nonces, not by a Modulus session
([CORE-COMPOSITION → The Command Pattern](./CORE-COMPOSITION.md#the-command-pattern)).
`handleDeepLink` is the exception: it is submitted by a signed-in instructor from
a Modulus form, so it requires a user session and an ability
([AUTHN-AUTHZ](./AUTHN-AUTHZ.md)).

| Command | Host route | Auth | Purpose |
| --- | --- | --- | --- |
| `getJWKS` | `/routes/lti/jwks` | `none` | publish the tool's public key set |
| `handleLogin` | `/routes/lti/login` | `none` | OIDC login initiation (Flow 1) |
| `handleLaunch` | `/routes/lti/launch` | `none` | id_token launch (Flow 2) |
| `handleDeepLink` | `/routes/lti/deep-link/activities` | `user` + `activity_codes:update_own` | content-item response (Flow 3) |

The handler routes all live under `/routes/lti/…`. The bare `/lti/…` paths are
first-party pages the host renders for a person to look at, and none of them is a
core command:

| Page | Purpose |
| --- | --- |
| `/lti/deep-link?id=<launch_id>` | the deep-linking form an instructor fills in (Flow 3) |
| `/lti/launch/{activity_id}?scope_id=<uuid>` | the launch interstitial, reached only when `LTI_LAUNCH_INTERSTITIAL=always` |
| `/lti/error?code=<slug>` | the readable launch-failure page |

The dynamic-registration helper is a page rather than a handler despite its
location, at `/routes/lti/register`.

The interstitial reads its display data from
`core.app.activities.getActivityLaunchView`, a read-only command keyed on
`(activity_id, scope_id)`. It takes no activity code and writes nothing: by the
time it renders, `handleActivityLaunch` has already resolved the code and made
the enrollment decision, including the decision to honour a launch whose code no
longer resolves. Its authorisation rule is session-only, and deliberately no
tighter — requiring the learner to be enrolled would fail the page for exactly
that case.

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
- **The deep-link content item's `url` points at nothing.**
  `urlBuilder.ltiLaunchUrl` is `{publicServerUrl}/lti/launch`, which is neither
  a handler (those are under `/routes/lti/…`) nor a page (the interstitial is
  `/lti/launch/{activity_id}`). Nothing fetches it — Canvas stores it as
  `target_link_uri` and `LtiLoginService` ignores that claim — so it is inert
  rather than broken. Pointing it at `/routes/lti/launch`, the real tool launch
  endpoint, would be more honest.
- **No LTI-conformant error response.** `/lti/error` is a first-party page for
  the learner. Signing and posting an error back to the platform, or honouring a
  platform-supplied error return URL, is still outstanding and is what the
  `TODO` in both LTI routes refers to.
- **Framed launches are not detected.** The `state-<state>` cookie is set
  `SameSite=None`, so the likeliest cause of a missing one — and therefore of
  `session_expired` — is a launch rendered inside a Canvas iframe with
  third-party cookies blocked, because the instructor did not tick "open in a new
  tab". Modulus does not currently detect or report that case specifically.
- **The interstitial needs JavaScript for its countdown.** Its launch control is
  a server-rendered anchor, so the hop itself is a plain navigation, but the
  automatic redirect is not. This is not a supported no-JavaScript path: a Canvas
  launch cannot complete without JavaScript in the first place, and Ximera
  activities generally require it too.

---

## Where to go next

- [AGENT](./AGENT.md) — how normalized progress reaches the `progress` table that
  feeds passback.
- [DATA-MODEL → LTI integration](./DATA-MODEL.md#6-lti-integration) — the table
  definitions, including the `lti_lineitems` submission-tracking columns.
- [AUTHN-AUTHZ](./AUTHN-AUTHZ.md) — auto-provisioning and the session tokens
  minted at launch.
