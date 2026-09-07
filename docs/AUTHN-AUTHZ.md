---
title: "Authentication & Authorization"
path: "authn-authz"
summary: "How Modulus answers 'who are you?' and 'what may you do?' for its three actor types — learners, administrators, and instrumentation agents — covering the RS256 JWT layer, per-actor sessions and token refresh, ability-based authorization, and the agent's OAuth 2.0 + PKCE flow, including the fixed branch ordering of the authorization endpoint, the syntactic `redirect_uri` gate, and the sitewide allowlist check that admits an activity URL."
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
| Agent | `agent` | `AgentAuth` | `AgentRequestContext` | a `users` row, via OAuth + PKCE, scoped to one activity and academic scope |

The auth objects (`packages/core/src/lib/auth.ts`) are small value classes the
host constructs per request and threads into core through the context:

```ts
class UserAuth  { constructor(readonly id: string, readonly abilities: string[]) {} }
class AdminAuth { constructor(readonly admin_id: string, readonly admin_abilities: string[]) {} }
class AgentAuth { constructor(readonly user_id: string,
                              readonly activity_id: string,
                              readonly scope_id: string,
                              readonly renew_after: number) {} }
```

`UserAuth` and `AdminAuth` carry the actor's id plus the abilities granted to
them, and expose `assertAbilities()` / `assertAdminAbilities()` (used by the
command wrapper). `AgentAuth` is deliberately leaner: an opaque user id, one
activity, one scope label, and a renewal hint — no abilities and no PII (see
[the agent flow](#the-agent-flow-oauth-20--pkce)).

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
  ability check — an agent's authority is fixed by the user/activity/scope tuple
  in its token, not an ability set. Agent-mode services derive that tuple from
  the verified token; the scope label is not itself a capability.

### The Activity URL Allowlist Abilities

Two admin abilities govern the sitewide activity URL allowlist — the policy that
decides which previously unseen activity URLs Modulus will register. Both are
granted to the seeded Manager role in
`packages/core/src/database/seeds/03_admin_permissions.ts`:

| Ability | What it permits |
| --- | --- |
| `activity-url-allowlist:list` | Reading the rules, and previewing how many existing activities a prospective policy would not have admitted. |
| `activity-url-allowlist:manage` | Creating, editing, enabling/disabling and deleting rules. |

Two, rather than the per-verb set used elsewhere (`lti-platforms:list` /
`:create`, `admin-roles:create|edit|delete`), for a reason specific to this
resource: a submitted base URL that normalizes onto an existing *disabled* rule
resolves into an edit, so an administrator holding `create` without `edit` would
hit a dead end on an ordinary submission with no way to express what they asked
for. Mutating the allowlist is one capability, so it is one ability.

Instructors and learners never see these rules. The rules table references
`admin_users` for provenance and holds no learner or instructor data — see
[DATA-MODEL → Activities & Grouping](./DATA-MODEL.md#3-activities--grouping).

## The Agent Flow (OAuth 2.0 + PKCE)

The agent is how instrumented Ximera content authenticates to Modulus
([AGENT](./AGENT.md)). It is **not** an LMS session; it derives a narrowly-scoped
credential from an already-authenticated learner, using the OAuth 2.0
Authorization Code flow with **PKCE**, and it never receives PII. Two steps,
backed by `agent_auth_codes` and `agent_refresh_tokens`:

**1 — Create the auth code** (`createAuthCode`, called as a `user`-authed
operation via the host's `routes/agent/authorize`). The learner is already
signed in; the agent supplies a `client_id`, a `redirect_uri` (the activity URL),
a structurally valid `scope_id`, and a PKCE `code_challenge`. An omitted scope
label becomes the default sentinel. Modulus resolves the scope first, then
**registers** the activity URL — the step described in
[Admitting the activity URL](#admitting-the-activity-url) — and only then stores
a random, 5-minute code bound to the full context and the challenge:

```ts
// packages/core/src/modules/agent/auth/services/agent-auth.ts (excerpt)
const scope = await this.queries.findScopeById(scope_id)
if (scope == null) throw ERR_VALIDATION({ message: 'Unknown scope', logExtra: { scope_id } })

const policy = await this.registration.loadPolicy()
const outcome = await this.registration.register(redirect_uri, policy)
// a denial is thrown as ERR_ACTIVITY_URL_NOT_ALLOWED; otherwise outcome.activity exists

const code = randomBytes(60).toString('base64url')
await this.mutations.createAuthCode({ code, user_id: userAuth.id,
  client_id, redirect_uri, scope_id: scope.id, code_challenge, expires_at: now + 5min })
```

That order is deliberate at both steps. An unknown `scope_id` fails before
anything is registered, so a request naming a scope that does not exist leaves no
`activities` row behind. Registration then commits the activity before the auth
code that names it, so no interleaving can produce a code the agent cannot
exchange, and a failure between the two leaves at most a bare activity row.

**2 — Claim the auth code** (`claimAuthCode`, via `routes/agent/token`). The
agent presents the code plus the PKCE `code_verifier`. Modulus claims the code
(single-use), then checks, in order: `client_id` matches, `redirect_uri`
matches, `sha256(code_verifier)` equals the stored `code_challenge`, the user
exists and is enabled, the activity exists, and the stored scope still exists.
The token request schema has no `scope_id`, so exchange cannot substitute a
different label. **`claimAuthCode` re-checks no allowlist policy** — it looks the
activity up and requires it to exist, nothing more. Admission was decided at step
1; re-deciding it here would let a rule change revoke a code already issued. Only
then does Modulus issue an **activity-and-scope-bound access token**:

```ts
const code_challenge = createHash('sha256').update(code_verifier).digest().toString('base64url')
if (authCode.code_challenge !== code_challenge) throw ERR_UNAUTHORIZED('Incorrect code_challenge')
// …user enabled?…activity exists?…
const access_token = await this.tokenIssuer.createAccessToken({ user, activity, scope_id })
return { access_token, api_base_url, user: { id, full_name }, scope_id, scope_name }
```

The access-token payload is `{ user: {id, full_name?}, activity_id, scope_id,
renew_after }`. `scope_name` is nullable display metadata returned beside the
token and exposed through authenticated `AuthStatus`; it is not a JWT identity
claim. State services derive the complete `(user_id, activity_id, scope_id)`
tuple from the verified token. `scope_id` is a partition label, not an
authorization entitlement, so core checks that it exists but does not infer a
platform association. This is exactly the right-hand column of the
[data-isolation table](./DATA-MODEL.md#the-data-isolation-boundary-in-schema-terms):
no email, no LMS identity, no abilities. `renew_after` (≈60s) is a hint telling
the agent when to refresh; the host turns a verified token into an `AgentAuth`:

```ts
// apps/gradebook/src/core-adapter.ts (excerpt)
const result = await tokenVerifiers.agent.verifyAccessToken(bearerToken)
if (result.status === 'valid') {
  const { activity_id, user, scope_id, renew_after } = result.payload
  return { requestId, agentAuth: new AgentAuth(user.id, activity_id, scope_id, renew_after) }
}
```

### Admitting the Activity URL

Step 1 is also where Modulus decides whether it will record this activity at all.
The `redirect_uri` *is* the activity URL, so authorization is one of four paths
that can create an `activities` row, and all four go through one service —
`ActivityRegistrationService`
(`packages/core/src/modules/activity-registration/services/activity-registration.ts`).
It resolves the URL, and only if Modulus has never seen it before does it measure
the URL against the **sitewide activity URL allowlist**: a set of rules managed
by administrators, each a normalized origin plus a path prefix, stored in
`activity_url_allowlist_rules` and edited at `/admin/activities`.

Three properties of that check matter here:

- **Resolve before evaluate.** An activity that already exists is returned
  without the policy being consulted. A rule change therefore cannot revoke an
  activity Modulus has already accepted — learners keep launching it, and it may
  still be added to activity codes and used in new deep links. The allowlist
  governs *admission*, never use.
- **Deny by default.** With no enabled rules, no previously unseen URL is
  admitted, on any path. Seeds create no rules, so a freshly seeded database
  refuses every new registration until an administrator adds the first rule.
- **The denial is returned, then thrown at this caller.** The service returns a
  refusal rather than raising one, because its four callers need different
  outcomes from the same decision. `createAuthCode` converts it into
  `ERR_ACTIVITY_URL_NOT_ALLOWED`, which the authorization route maps to an OAuth
  error below.

### The Authorization Endpoint's Branch Ordering

`apps/gradebook/src/app/routes/agent/authorize/route.ts` runs four branches in a
fixed order, and the order is load-bearing:

| # | Condition | Outcome |
| --- | --- | --- |
| 1 | `redirect_uri` missing or not syntactically usable | Redirect to `/agent/error`. **Never** bounces. |
| 2 | Request otherwise malformed (`response_type`, `client_id`, `state`, `code_challenge`, `code_challenge_method`, `scope_id`) | Bounce back with `state` and `error=invalid_request` |
| 3 | No Modulus session | Bounce back with `state` and `error=access_denied` |
| 4 | `createAuthCode()` | Bounce back with `state` and `code`, or with an error |

Branches 2 and 3 consult no policy and call no core command, so there is at most
one core call per request, on the authenticated branch only.

**Branch 1 is a syntactic gate, and it is core's own.** The route imports
`isUsableRedirectUri` from `@modulus-learning/core` rather than reimplementing the
rule, because a second definition in the host would drift from core's exactly as
the gradebook's form validator already had. It is deliberately stricter than
`new URL()`:

```ts
// packages/core/src/modules/activity-registration/url-policy.ts (excerpt)
const HTTP_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

export const parseAdmissibleUrl = (value: string): URL | null => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  // A credentialed URL displays one host and resolves to another.
  if (url.username !== '' || url.password !== '') return null
  if (url.protocol === 'https:') return url
  if (url.protocol === 'http:' && HTTP_LOOPBACK_HOSTS.has(url.hostname)) return url
  return null
}

export const isUsableRedirectUri = (value: string): boolean => parseAdmissibleUrl(value) !== null
```

`new URL()` and Zod's `z.url()` both accept `javascript:alert(1)` and
`data:text/html,x`, so a validator built on either alone admits them. Rejecting
userinfo removes the `https://modulus.example@evil.example/` disguise, in which
the apparent host is only a username. HTTP is permitted for exactly `localhost`
and `127.0.0.1`, for local development.

**`/agent/error` is the one branch with no destination to return to.** It is a
chromeless page outside the `[lng]` segment — the same shape as `/lti/error` —
that answers `200`, picks its copy from a closed slug union
(`invalid_request` | `server_error`, defaulting to `server_error` for an unknown
or absent slug so an outage never blames the learner's course link), and
**reflects no caller-supplied value into the DOM**. The value that brought a
learner there is by definition one that failed validation. Not rendering it is
necessary but not sufficient: Next serializes the request URL, query string
included, into the RSC flight payload of the served HTML, so the route redirects
with a fixed slug and never with the rejected URI. The diagnosis stays in the
route's server log.

**A denied registration returns `unauthorized_client`, never `access_denied`.**
The agent maps `access_denied` to `status: 'expired'` and prompts the learner to
re-launch from their LMS, which for an activity the allowlist does not admit
sends them round the same loop indefinitely. `unauthorized_client` is in the
agent's accepted `OAUTH_ERRORS` set, terminates at `status: 'failed'`, and is the
correct RFC 6749 code here given that `client_id` is the activity URL.

:::warning[This endpoint is still an open redirect]
Branches 2, 3 and 4 all bounce the browser to a syntactically valid
`redirect_uri` without consulting the allowlist, so the endpoint can still be
pointed at any `https` origin an attacker chooses. Branch 1 **narrows** that: it
removes the credentialed-host disguise, `javascript:` and `data:` destinations,
and an unhandled `500` on a value `new URL()` could not parse. It does not close
it. Closing the bounce means replacing it with a Modulus page and a return link,
a learner-visible change needing stakeholder input, because session expiry is the
common path here and today it resolves with no learner action at all.
:::

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
- **Agent renewal preserves scope.** Renewal carries the verified token's
  `scope_id` forward unchanged while re-checking that the user remains enabled
  and the activity still exists; it does not resolve a fresh scope from browser
  storage.
- **Agent refresh-token rotation.** `agent_refresh_tokens` carries `used_at` for
  rotation/replay detection; confirm the issuing/rotation path is fully wired as
  the agent matures.
- **`permissions.ability` nullability.** `getUserAbilities` filters nulls with a
  `TODO` questioning why the column is nullable at all.
- **The agent authorization endpoint remains an open redirect.** The syntactic
  gate on `redirect_uri` narrows it; it does not close it. Closing it is
  deliberately deferred — see the warning in
  [The Authorization Endpoint's Branch Ordering](#the-authorization-endpoints-branch-ordering).
- **`client_id` has no registry.** The route requires `client_id === redirect_uri`
  and carries a `TODO` asking whether it should instead be the redirect URI's
  domain, or come from a registry.
- **Withdrawing an admitted activity is not implemented.** The allowlist admits;
  nothing revokes. An emergency block — stopping launches, tokens, or passback
  for an activity already accepted — is a separate deferred feature with its own
  decision surface, recorded in
  [SECURITY-AND-PRIVACY → Open Questions](./SECURITY-AND-PRIVACY.md#open-questions--needs-institutional-policy).

---

## Where to go next

- [CORE-COMPOSITION → The Command Pattern](./CORE-COMPOSITION.md#the-command-pattern)
  — where ability assertion and context typing are enforced.
- [LTI](./LTI.md) — the LMS launch/login path that drives `LtiSignInService` and
  auto-provisioning.
- [AGENT](./AGENT.md) — the client side of the PKCE flow and registry validation.
- [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md) — the data-isolation and
  FERPA posture these mechanisms uphold.
