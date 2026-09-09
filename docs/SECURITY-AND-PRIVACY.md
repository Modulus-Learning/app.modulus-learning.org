---
title: "Security & Privacy"
path: "security-and-privacy"
summary: "Modulus's security and privacy posture for IT and security staff: the FERPA-aligned data-isolation boundary, what learner data is and isn't stored, the authentication and trust mechanisms across LTI, sessions, and the agent, and the open questions (retention windows, throttling) that need institutional policy."
---

# Security & Privacy

This document describes how Modulus protects learner data and how it
authenticates the parties it talks to. It is written for the audience the
institutional summary calls "IT and Security Staff," and it consolidates
mechanisms documented in detail elsewhere — [AUTHN-AUTHZ](./AUTHN-AUTHZ.md),
[LTI](./LTI.md), and [AGENT](./AGENT.md).

:::note[Status]
The *technical* controls below are implemented and described from the code. The
*policy* items — data-retention windows, the formal threat model, and
institutional accessibility/privacy statements — are not yet settled and are
flagged as [open questions](#open-questions--needs-institutional-policy). Treat
those sections as placeholders pending OSU input.
:::

## Design Principles

Two privacy principles, stated in [INTRODUCTION](./introduction), drive the
design:

- **Store as little as possible.** Modulus retains assignment-interaction data,
  not a student record. Learner identity is abstracted through LTI, and only the
  minimum needed to make the data useful is kept.
- **Stay out of the way.** Learners use Ximera as they always have; there is no
  new account system layered on top of the LMS. The LMS remains the system of
  record for who a student is.

## The Data-Isolation Boundary (FERPA)

The single most important control is the boundary between Modulus (Tier 2) and
the instrumented activities it observes (Tier 3): **no learner PII crosses it.**
Activities authenticate to Modulus and receive only an opaque identifier and a
display name — never institutional identity.

| ✅ May cross to an activity | ❌ Must not cross |
| --- | --- |
| Opaque user id (UUID) | Email address |
| Display name | Institutional student id |
| Activity context / URL | Course id or name |
| Opaque scope id and nullable display name | Raw LMS term id or term dates |
| Normalized progress (0–1.0) | LMS gradebook data |
| Page state (activity-specific) | Any other institutional PII |

This is what keeps Modulus FERPA-compatible: learner PII stays within the local
Modulus deployment, and the LMS gradebook data flows *one way* (Modulus → LMS via
AGS), never out to third-party content.

The boundary is enforced in code at three points (detailed in
[AGENT → Data-Isolation Guarantee](./AGENT.md#the-data-isolation-guarantee-end-to-end)):

1. **The token** an agent receives carries only `{ user: {id, full_name?},
   activity_id, scope_id, renew_after }`.
2. **The API** only ever exposes *this* learner's progress/page state for *this*
   activity and scope, because the ingestion services read `user_id`,
   `activity_id`, and `scope_id` from the verified token, never from the request body
   ([AGENT → Server-Side Ingestion](./AGENT.md#server-side-ingestion)).
3. **The agent validates the server** against a central registry before sending
   anything (below).

## What Modulus Stores About a Learner

Identity lives in the `users` table ([DATA-MODEL](./DATA-MODEL.md#1-identity--access--learners)).
For an LTI-provisioned learner this is deliberately thin: the LTI `iss`/`sub`
pair, and whatever name/email the launch supplied. LTI identity is *abstracted* —
the `sub` is the LMS's opaque subject identifier, and downstream (to activities)
even that is replaced by Modulus's own UUID.

The learner-activity signals themselves — `progress` and `page_state` — are keyed
by `(user, activity, scope)` and hold the latest value within that opaque bucket,
normalized to 0–1.0 for progress. `progress_events` retains the append-only
history of progress advances. These are interaction data, not personal records.

## Authentication & Trust Mechanisms

Modulus authenticates three classes of party, each with its own mechanism. The
following mirrors the summary doc's "Security Highlights," grounded in the code.

### Learner & admin sessions

- **Passwords** (where used) are hashed with **Argon2** (`argon2`); plaintext is
  never stored.
- **Sessions** are RS256 JWTs ([AUTHN-AUTHZ → JWT layer](./AUTHN-AUTHZ.md#the-jwt-layer)),
  delivered to the browser in cookies whose `httpOnly`, `secure`, and `sameSite`
  attributes are configurable per cookie (separate access/refresh cookies for
  user and admin).
- **Refresh is re-validated, not blind.** Token refresh re-reads the account,
  rejects a disabled user, and re-fetches abilities — so a disabled account or
  revoked role takes effect at the next refresh
  ([AUTHN-AUTHZ → Sessions](./AUTHN-AUTHZ.md#sessions--token-refresh)).
- **Bot mitigation.** Public self-service flows (self-registration, password
  sign-in) currently have **no bot mitigation** — no CAPTCHA and no failed-login
  lockout. In practice nearly all accounts are provisioned via trusted LTI
  launches rather than public self-registration, but hardening the
  public paths remains an open item (see Open Questions).
- **Actor separation.** Learner, admin, and agent tokens are distinguished by
  payload schema (and the admin discriminator), so a token minted for one actor
  cannot be used as another.

### LTI platform trust (Tier 1 ↔ Tier 2)

- **Signed launches.** Every `id_token` launch is verified against the platform's
  **JWKS**, with `iss` and `aud` (must equal our `client_id`) checked
  ([LTI → Launch & Validation](./LTI.md#flow-2--launch--validation)).
- **Replay protection.** Each launch carries a one-time **nonce** that must exist
  and be unused; it is marked used on acceptance.
- **No shared secrets for AGS.** Outbound grade passback obtains an access token
  via the OAuth **client-credentials grant with a signed JWT client-assertion**,
  using the tool's own keypair — there is no static API secret to leak
  ([LTI → Platform access tokens](./LTI.md#platform-access-tokens)).
- **Published key set.** The tool exposes its public keys at a JWKS endpoint; the
  private key signs tool-originating messages and client-assertions.

### Agent / activity trust (Tier 2 ↔ Tier 3)

- **OAuth 2.0 + PKCE.** The agent authenticates with the Authorization Code flow
  and PKCE (S256), so an intercepted authorization code is useless without the
  `code_verifier` ([AGENT → Connecting to Modulus](./AGENT.md#connecting-to-modulus)).
- **Registry validation (anti-spoofing).** Before authenticating, the agent
  confirms the Modulus server's identity against the central registry at
  `modulus-learning.org/api/registry`, preventing a rogue page from redirecting
  instrumented content to an impostor server.
- **Activity-and-scope-bound, PII-free tokens.** The issued token is bound to one
  activity and one opaque scope label and carries no learner PII; it renews
  transparently on the back of normal traffic via a `new_token` roll-forward.
- **Activity URL admission is an administrator decision.** Whether Modulus will
  record a *new* activity URL at all is governed by the **sitewide activity URL
  allowlist** — administrator-managed rules, each an exact normalized origin plus
  a path-segment-bounded subtree, held in `activity_url_allowlist_rules`
  ([DATA-MODEL → Activities](./DATA-MODEL.md#3-activities--grouping)) and managed
  at `/admin/activities`. With **no enabled rules**, every valid new activity URL
  is admitted, including when all stored rules are disabled. With one or more
  enabled rules, a new URL must match one of them. Disabling or deleting the last
  enabled rule restores allow-all. URL syntax and length checks always apply.
  The policy applies to every path that can add an
  activity — instructor activity-code creation and editing, LTI deep linking,
  agent authorization, and cumulative progress targets — through a single
  registration service that is the only writer of `activities` rows outside seeds
  and fixtures.
- **Admission is recorded by the `activities` row itself, and admission is not
  use.** A URL that already has an `activities` row is resolved without the
  policy being consulted, so **removing or disabling a rule is not revocation**:
  existing activities keep working, keep accepting progress, and may still be
  added to activity codes and used in new deep links. Administrators are shown
  that consequence in the admin surface, where a disable or delete preview
  counts activities outside the proposed policy and calls them **grandfathered** —
  not blocked, disabled, invalid, or noncompliant. Withdrawing access to an
  activity already accepted is a separate capability that does not exist (see
  Open Questions).

  One qualification, because it bounds the guarantee: the lookup that
  grandfathers a URL is an **exact string match** on `activities.url`, which
  stores the raw URL as it was submitted. Activity URLs are not canonicalized on
  storage — the registration service's own docstring calls that storage form
  unsettled and names canonicalization as deferred work — so grandfathering is
  spelling-sensitive. The same page reached by an equivalent but differently
  spelled URL misses the lookup and is evaluated as a new registration.
- **Activity codes remain a second, independent constraint.** Institutions also
  control which activities a given course grouping covers through **activity
  codes**, and deep linking enforces a code's `url_prefix`. A code's `url_prefix`
  cannot broaden the sitewide policy, and the sitewide policy does not replace it.

### Score integrity

All activity scores are **normalized to 0–1.0** before storage and passback, so
grade reporting is consistent regardless of an activity's internal scoring model,
and AGS submissions always use `scoreMaximum: 1`.

**Progress is client-asserted.** Progress and page state are computed in the
learner's browser by the agent and submitted under the learner's own
activity-and-scope-bound token; the server does not independently verify them. A
learner can assert any progress (up to 1.0) for their *own* launched activity and
chosen existing scope label — this is
inherent to instrumenting third-party content. The security boundary is
**isolation** (a learner can only ever write their own progress for the activity
in the token), not tamper-proof grading, so instructors should treat Modulus
progress as self-reported.

## Auditing

The `user_logins` table is an **append-only** audit of authentication events —
time, (nullable) user id, provider, IP address, and a typed outcome
(`success` / `failed_no_password` / `failed_bad_password` / `failed_disabled`).
It is intentionally not foreign-keyed so it can be pruned by age and, in future,
moved to a time-series store ([DATA-MODEL → Identity](./DATA-MODEL.md#1-identity--access--learners)).
The summary doc lists "full audit capability for launches, scores, and data
access" as a goal; the login audit exists today, and launch/score auditing is a
candidate area to extend.

## Open Questions / Needs Institutional Policy

These require decisions or hardening before a security sign-off, and several are
flagged directly in the code:

- **Data-retention windows.** How long `progress`, `page_state`, `user_logins`,
  and pending `registrations` / `email_change_requests` are kept is **not yet
  defined**. The schema is built to support age-based pruning; the policy is
  yours to set.
- **Bot mitigation & failed-login throttling.** Public self-service flows have no
  CAPTCHA, and while `failed_login_attempts` is recorded, lockout / back-off and
  timing-attack mitigations are not yet enforced
  ([AUTHN-AUTHZ → Honest Notes](./AUTHN-AUTHZ.md#honest-notes--open-questions)).
- **Key persistence.** The LTI tool keystore and the agent's per-platform JWKS
  caches are in-memory and reset on restart; persistence (and rotation strategy)
  is a noted `TODO` ([LTI → Keys & Trust](./LTI.md#keys--trust)).
- **Nonce / token housekeeping.** Used LTI nonces are marked but not yet pruned;
  agent refresh-token rotation (`used_at`) should be confirmed end-to-end.
- **Emergency blocking is deferred.** The activity URL allowlist admits; nothing
  revokes. Withdrawing access to an activity Modulus has already accepted has a
  much larger decision surface than deleting a rule — whether an LTI launch stops
  before or after sign-in and enrolment, whether live agent access and refresh
  tokens are rejected immediately, whether reads as well as writes stop, whether
  queued AGS submissions proceed, what a learner is told, and how an
  administrator undoes it. That needs an explicit activity/origin status model,
  an audit trail, and a recovery workflow. Overloading allowlist deletion with it
  would hide all of that behind an ordinary configuration edit, so it is
  deliberately **not** built.
- **The agent authorization endpoint is a knowingly retained open redirect.**
  `/routes/agent/authorize` returns the browser to the `redirect_uri` it was
  given on three of its four branches without consulting the allowlist, so it can
  be pointed at any `https` origin. A syntactic gate **narrows** this — it rejects
  the credentialed-host disguise (`https://modulus.example@evil.example/`),
  `javascript:` and `data:` destinations, and a value `new URL()` cannot parse,
  sending those to a Modulus error page instead. The rejected value does not reach
  that page, and the safety there is structural rather than a matter of what the
  page renders: Next serializes the request URL and its query string into the
  served HTML's RSC flight payload, so the route redirects with a fixed slug and
  never with the rejected URI. None of that closes the redirect. Leaving it open
  is an accepted risk, not an oversight: closing the bounce means replacing it
  with a Modulus page and a return link, and session expiry is the common path
  through this endpoint and today resolves with no learner action at all. See
  [AUTHN-AUTHZ → The Authorization Endpoint's Branch Ordering](./AUTHN-AUTHZ.md#the-authorization-endpoints-branch-ordering).
- **Formal threat model & pen-test.** A written threat model and an independent
  review are not yet part of the repository.
- **Transport & secrets.** TLS termination, secret management, and key
  distribution are deployment concerns — see [DEPLOYMENT](./DEPLOYMENT.md).

---

## Where to go next

- [AUTHN-AUTHZ](./AUTHN-AUTHZ.md) — the authentication and authorization
  mechanics in full.
- [LTI](./LTI.md) and [AGENT](./AGENT.md) — the two trust boundaries.
- [DATA-MODEL](./DATA-MODEL.md) — exactly what is stored, and where.
- [DEPLOYMENT](./DEPLOYMENT.md) — transport security, secrets, and operational
  hardening.
