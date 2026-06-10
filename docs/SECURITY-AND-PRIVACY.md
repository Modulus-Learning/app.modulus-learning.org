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
| Normalized progress (0–1.0) | LMS gradebook data |
| Page state (activity-specific) | Any other institutional PII |

This is what keeps Modulus FERPA-compatible: learner PII stays within the local
Modulus deployment, and the LMS gradebook data flows *one way* (Modulus → LMS via
AGS), never out to third-party content.

The boundary is enforced in code at three points (detailed in
[AGENT → Data-Isolation Guarantee](./AGENT.md#the-data-isolation-guarantee-end-to-end)):

1. **The token** an agent receives carries only `{ user: {id, full_name?},
   activity_id, renew_after }`.
2. **The API** only ever exposes *this* learner's progress/page state for *this*
   one activity, because the ingestion services read `user_id` and `activity_id`
   from the verified token, never from the request body
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
by `(user, activity)` and hold the latest value, normalized to 0–1.0 for
progress. These are the data an instructor is meant to inspect; they are
interaction data, not personal records.

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
- **Bot mitigation.** The gradebook integrates reCAPTCHA (legacy and Enterprise)
  for public-facing flows such as registration.
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
- **Activity-scoped, PII-free tokens.** The issued token is scoped to a single
  activity and carries no PII; it renews transparently on the back of normal
  traffic via short-lived tokens and a `new_token` roll-forward.
- **Activity allow-listing.** Institutions control which activities are reachable
  through **activity codes** ([DATA-MODEL → Activities](./DATA-MODEL.md#3-activities--grouping)),
  and deep linking enforces a code's `url_prefix`.

### Score integrity

All activity scores are **normalized to 0–1.0** before storage and passback, so
grade reporting is consistent regardless of an activity's internal scoring model,
and AGS submissions always use `scoreMaximum: 1`.

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
- **Failed-login throttling.** `failed_login_attempts` is recorded but lockout /
  back-off and timing-attack mitigations are not yet enforced
  ([AUTHN-AUTHZ → Honest Notes](./AUTHN-AUTHZ.md#honest-notes--open-questions)).
- **Key persistence.** The LTI tool keystore and the agent's per-platform JWKS
  caches are in-memory and reset on restart; persistence (and rotation strategy)
  is a noted `TODO` ([LTI → Keys & Trust](./LTI.md#keys--trust)).
- **Nonce / token housekeeping.** Used LTI nonces are marked but not yet pruned;
  agent refresh-token rotation (`used_at`) should be confirmed end-to-end.
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
