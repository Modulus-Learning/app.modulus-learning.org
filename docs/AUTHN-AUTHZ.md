---
title: "Authentication & Authorization"
path: "authn-authz"
summary: "How Modulus answers 'who are you?' and 'what may you do?' for its three actor types — learners, administrators, and instrumentation agents — covering the RS256 JWT layer, per-actor sessions and token refresh, ability-based authorization, and the agent's OAuth 2.0 + PKCE flow."
---

# Authentication & Authorization

Modulus answers two questions on every protected call: **who are you?**
(authentication) and **what are you allowed to do?** (authorization). It answers
them separately for three kinds of caller — *learners*, *administrators*, and
*instrumentation agents* — and keeps those three apart all the way down, from the
database tables ([DATA-MODEL](./DATA-MODEL.md)) through to the command boundary
([CORE-COMPOSITION → The Command Pattern](./CORE-COMPOSITION.md#the-command-pattern)).

This document assumes the actor model from
[ARCHITECTURE → Three Actor Domains](./ARCHITECTURE.md#4-three-separate-actor-domains).

## The Three Actors

| Actor | Domain | Auth object | Request context | Identity source |
| --- | --- | --- | --- | --- |
| Learner | `app` | `UserAuth` | `UserRequestContext` | `users` (password / Google / GitHub / LTI) |
| Administrator | `admin` | `AdminAuth` | `AdminRequestContext` | `admin_users` (password) |
| Agent | `agent` | `AgentAuth` | `AgentRequestContext` | a `users` row, via OAuth + PKCE, scoped to one activity |

The auth objects (`packages/core/src/lib/auth.ts`) are small value classes the
host constructs per request and threads into core through the context:

```ts
class UserAuth  { constructor(readonly id: string, readonly abilities: string[]) {} }
class AdminAuth { constructor(readonly admin_id: string, readonly admin_abilities: string[]) {} }
class AgentAuth { constructor(readonly user_id: string,
                              readonly activity_id: string,
                              readonly renew_after: number) {} }
```

`UserAuth` and `AdminAuth` carry the actor's id plus the abilities granted to
them, and expose `assertAbilities()` / `assertAdminAbilities()` (used by the
command wrapper). `AgentAuth` is deliberately leaner: an opaque user id, the
single activity the agent is scoped to, and a renewal hint — no abilities and no
PII (see [the agent flow](#the-agent-flow-oauth-20--pkce)).

## The JWT Layer

All three actors authenticate with **RS256-signed JWTs**, produced and verified
by two services in `lib/jwt/services.ts` built on [`jose`](https://github.com/panva/jose):

- **`JWTSigner`** — imports the PKCS#8 private key once at construction
  (`JWTSigner.create`), then `sign(payload, 'access' | 'refresh')` stamps
  `iat`/`exp` (from `config.jwt.expires`), `aud`, and `iss` and returns the token
  plus its absolute expiry.
- **`JWTVerifier`** — imports the SPKI public key once, then `verify(token,
  schema)` checks signature, issuer, and audience, and **validates the payload
  against a Zod schema**. It returns a discriminated result rather than throwing:

  ```ts
  type JWTVerificationResult =
    | { status: 'valid'; payload; expires_at_ms }
    | { status: 'expired' }
    | { status: 'bad_payload' }
    | { status: 'invalid'; error }
  ```

Two things follow from this design:

1. **One signing keypair, many payload shapes.** Core composes a single
   `jwtSign` / `jwtVerify` pair from `config.jwt` (see
   [CORE-COMPOSITION → Initialization](./CORE-COMPOSITION.md#putting-it-together-initialization)).
   What distinguishes a learner token from an admin token from an agent token is
   the **payload schema** used to verify it — each actor has its own
   `accessTokenPayloadSchema`. The shapes are mutually exclusive (the admin
   payload is `strictObject` and additionally carries `provider: 'admin_session'`),
   so a token minted for one actor fails schema validation when parsed as another.
   LTI message signing uses a *separate* keypair (`config.lti.jwks`) — see
   [LTI](./LTI.md).
2. **Verification is decoupled from the full core graph.** A small standalone
   registry (`public/tokens.ts`, exported as `@modulus-learning/core/tokens`)
   composes just the three verifiers, so a host can validate a token — e.g. in
   edge middleware — without a database pool or the full service graph. This is
   what `getCoreTokenVerifiers` uses in the host adapter.

## Sessions & Token Refresh

Learner and admin sessions follow the same access/refresh pattern; the agent
session is different and covered [below](#the-agent-flow-oauth-20--pkce).

### Learner sessions (`app/session`)

A successful sign-in produces a `SignInResult` (`{ user: {id, full_name?},
abilities, remember_me }`), which `TokenIssuer` turns into a token pair:

- the **access token** payload carries `{ user: {id, full_name?}, abilities }` —
  the abilities are baked in, so authorization checks need no database hit;
- the **refresh token** payload carries only `{ user_id }`.

There are four sign-in services, all landing on the same `SignInResult` shape:

- **`PasswordSignInService`** — verifies an Argon2 hash; records outcomes to
  `user_logins`.
- **`GoogleSignInService`** / **`GithubSignInService`** — OAuth sign-in, wired to
  the host's `routes/oauth/{google,github}` handlers.
- **`LtiSignInService`** — the LMS path. Given LTI `iss`/`sub`, it resolves an
  existing user by `(iss, sub)`, else by email (adopting the LTI identity onto
  that account), else **auto-provisions** a new `users` row — granting
  `['everyone','instructor']` or `['everyone','learner']` by the launch role.
  This is the auto-registration the summary doc describes; see [LTI](./LTI.md).

`TokenRefreshService.refreshTokens` is intentionally not a blind re-issue. It
verifies the refresh token, **re-reads the user**, rejects a missing or disabled
account, **re-fetches current abilities**, and only then mints a fresh pair — so
a disabled user or a revoked role takes effect at the next refresh:

```ts
const { status, payload } = await this.tokenVerifier.verifyRefreshToken(refreshToken)
if (status !== 'valid') throw ERR_UNAUTHORIZED(...)
const userRecord = await this.queries.getUser(payload.user_id)
if (userRecord == null)        throw ERR_UNAUTHORIZED('user not found')
if (!userRecord.is_enabled)    throw ERR_UNAUTHORIZED('user is disabled')
const abilities = await this.queries.getUserAbilities(payload.user_id)
// → issue new access+refresh, return { tokens, session }
```

### Admin sessions (`admin/session`)

A structurally identical, separate implementation: password sign-in only, the
refresh payload keys on `admin_user_id` (not `user_id`), and the access payload
carries the `provider: 'admin_session'` discriminator plus the admin's
name/email. Admin and learner sessions share no tables and no token shapes.

## Authorization: Abilities

Modulus authorizes by **ability strings**, not roles directly. A role is a bag of
abilities; what a command checks is an ability.

- **Where they live.** Each `permissions` row is one `ability` (e.g.
  `account:read_own`) attached to a role; `role_user` assigns roles to users
  ([DATA-MODEL → Identity](./DATA-MODEL.md#1-identity--access--learners)). The
  `admin_*` tables mirror this for administrators.
- **How they're resolved.** `getUserAbilities` flattens role membership into a
  string list with a single join:

  ```ts
  select permissions.ability
    from permissions
    inner join role_user on permissions.role_id = role_user.role_id
   where role_user.user_id = $user_id
  ```

  This list is computed at sign-in/refresh and **carried in the access token**,
  so per-request authorization is a pure in-memory check.
- **How they're enforced.** The command wrapper asserts the abilities a command
  declares *before* running its handler. A command states them declaratively:

  ```ts
  this.utils.createCommand({
    method: 'setFullName',
    auth: { mode: 'user', abilities: ['account:read_own', 'account:edit_own'] },
    schemas: { input: setFullNameRequestSchema, output: accountResponseSchema },
    handler: this.accountService.setFullName.bind(this.accountService),
  })
  ```

  and `createCommand` calls `ctx.userAuth.assertAbilities(...)` (or the admin
  equivalent) up front — see
  [CORE-COMPOSITION → The Command Pattern](./CORE-COMPOSITION.md#the-command-pattern).
  Auth mode also fixes the *static* context type, so calling an `admin` command
  with a `UserRequestContext` is a compile error. The `agent` mode performs no
  ability check — an agent's authority is the activity scope in its token, not an
  ability set.

## The Agent Flow (OAuth 2.0 + PKCE)

The agent is how instrumented Ximera content authenticates to Modulus
([AGENT](./AGENT.md)). It is **not** an LMS session; it derives a narrowly-scoped
credential from an already-authenticated learner, using the OAuth 2.0
Authorization Code flow with **PKCE**, and it never receives PII. Two steps,
backed by `agent_auth_codes` and `agent_refresh_tokens`:

**1 — Create the auth code** (`createAuthCode`, called as a `user`-authed
operation via the host's `routes/agent/authorize`). The learner is already
signed in; the agent supplies a `client_id`, a `redirect_uri` (the activity URL),
and a PKCE `code_challenge`. Modulus verifies the activity exists, then stores a
random, 5-minute code bound to the learner and the challenge:

```ts
const activity = await this.queries.findActivityByUrl(redirect_uri) // must exist
const code = randomBytes(60).toString('base64url')
await this.mutations.createAuthCode({ code, user_id: userAuth.id,
  client_id, redirect_uri, code_challenge, expires_at: now + 5min })
```

**2 — Claim the auth code** (`claimAuthCode`, via `routes/agent/token`). The
agent presents the code plus the PKCE `code_verifier`. Modulus claims the code
(single-use), then checks, in order: `client_id` matches, `redirect_uri`
matches, `sha256(code_verifier)` equals the stored `code_challenge`, the user
exists and is enabled, and the activity exists. Only then does it issue an
**activity-scoped access token**:

```ts
const code_challenge = createHash('sha256').update(code_verifier).digest().toString('base64url')
if (authCode.code_challenge !== code_challenge) throw ERR_UNAUTHORIZED('Incorrect code_challenge')
// …user enabled?…activity exists?…
const access_token = await this.tokenIssuer.createAccessToken({ user, activity })
return { access_token, api_base_url, user: { id, full_name } }
```

The agent access-token payload is `{ user: {id, full_name?}, activity_id,
renew_after }` — an opaque user id, a display name, and the single activity it may
report against. This is exactly the right-hand column of the
[data-isolation table](./DATA-MODEL.md#the-data-isolation-boundary-in-schema-terms):
no email, no LMS identity, no abilities. `renew_after` (≈60s) is a hint telling
the agent when to refresh; the host turns a verified token into an `AgentAuth`:

```ts
// apps/gradebook/src/core-adapter.ts (excerpt)
const result = await tokenVerifiers.agent.verifyAccessToken(bearerToken)
if (result.status === 'valid') {
  const { activity_id, user, renew_after } = result.payload
  return { requestId, agentAuth: new AgentAuth(user.id, activity_id, renew_after) }
}
```

Server-identity (registry) validation — the agent confirming it is talking to a
genuine Modulus install before starting this flow — happens on the *agent* side;
see [AGENT](./AGENT.md).

## How the Host Wires It

Core is auth-mechanism-agnostic: it consumes a `RequestContext` and never reads a
cookie or header itself ([ARCHITECTURE → Single-instance](./ARCHITECTURE.md#3-single-instance-no-separate-api-server)).
The Next.js host builds each context in `apps/gradebook/src/core-adapter.ts`:

- `getCoreUserRequestContext()` reads the user session and builds
  `UserAuth(id, abilities)`.
- `getCoreAdminRequestContext()` does the same for the admin session; the
  `withAdminAuth` middleware guards admin routes.
- `getCoreAgentRequestContext(request)` parses the `Authorization: Bearer` header,
  verifies it with the agent verifier, and builds `AgentAuth`.

Refresh and OAuth/agent endpoints live under `app/routes/` (`auth/refresh`,
`auth/session`, `admin/refresh`, `oauth/{google,github}`, `agent/authorize`,
`agent/token`), each a thin handler over the corresponding command.

## Honest Notes & Open Questions

Flagged in the code, worth knowing before relying on these paths:

- **Failed-login throttling is not yet enforced.** `users.failed_login_attempts`
  exists and outcomes are recorded to `user_logins`, but lockout/back-off on
  repeated failures is a `TODO`, as are timing-attack mitigations on
  password sign-in.
- **Agent token lifetime.** `AgentTokenIssuer` signs the agent access token with
  its own expiry (`sign(payload, 'agent')`; `config.jwt.expires.agent` ←
  `AGENT_JWT_EXPIRES_IN`, defaulting to the refresh expiry). The real revocation
  cadence is `renew_after` (`config.jwt.agent.renewAfterSeconds` ←
  `AGENT_JWT_RENEW_AFTER_SECONDS`, ~60s): past it, every request re-validates that
  the user is still enabled and the activity still exists before re-minting the
  token, so `exp` only bounds a fully idle tab.
- **Agent refresh-token rotation.** `agent_refresh_tokens` carries `used_at` for
  rotation/replay detection; confirm the issuing/rotation path is fully wired as
  the agent matures.
- **`permissions.ability` nullability.** `getUserAbilities` filters nulls with a
  `TODO` questioning why the column is nullable at all.

---

## Where to go next

- [CORE-COMPOSITION → The Command Pattern](./CORE-COMPOSITION.md#the-command-pattern)
  — where ability assertion and context typing are enforced.
- [LTI](./LTI.md) — the LMS launch/login path that drives `LtiSignInService` and
  auto-provisioning.
- [AGENT](./AGENT.md) — the client side of the PKCE flow and registry validation.
- [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) — the data-isolation and
  FERPA posture these mechanisms uphold.
