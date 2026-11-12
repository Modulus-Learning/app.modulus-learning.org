# Editable LTI Registration Endpoints

Date: 2026-11-09

Status: Proposed. Not yet scheduled.

Document type: Explanation and implementation specification.

This specification proposes letting a Modulus administrator enter and later
correct each of an LTI platform registration's four endpoint values, instead of
having Modulus derive all four from the issuer. The LMS adapter's derivation
stays, but as a source of suggested defaults rather than the only source of
truth. It also updates the Canvas adapter's defaults to the hosts Instructure
currently documents.

## Why

When an administrator registers a platform today, they enter only a name, an
issuer and a client ID. `LtiPlatformsService.createLtiPlatform`
(`packages/core/src/modules/admin/lti-platforms/services/lti-platforms.ts`)
fills `authorization_endpoint`, `token_endpoint`, `jwks_uri` and
`authorization_server` from `LmsAdapter.registrationEndpoints(issuer)`. Canvas
implements that in `packages/lms-canvas/src/registration.ts` as
`new URL(<path>, issuer)` for each endpoint. Once saved, a registration
cannot be changed through the admin surface at all.

That model is wrong in principle and stale in practice.

### What the Specifications Say

None of the IMS specifications derive platform endpoints from the issuer. Each
endpoint is a separate value the tool is given at registration:

- **IMS Security Framework 1.0.** The tool "must be given the Public Key and
  Issuer Identifier … (using some out-of-band registration process)" (§5.1).
  The platform's "OIDC Authorization end-point" is part of that out-of-band
  exchange (§5.1.1). The tool redirects to "the OIDC Authentication endpoint
  registered with the iss" (§5.1.1.2), which is a registration lookup, not a URL
  rule. The client-credentials `aud` "MUST be configured out of band"; the
  authorization server "MAY" ask the tool to use its token endpoint URL
  (§4.1.1). The issuer is an HTTPS URL with no query or fragment (§1.2).
- **LTI 1.3 Core.** "The access token endpoint is communicated during the tool
  registration" (§6.2).
- **LTI Dynamic Registration 1.0.** The platform's OpenID configuration lists
  `authorization_endpoint`, `token_endpoint`, `jwks_uri` and
  `registration_endpoint` as separate required properties, and
  `authorization_server` as optional (§2.1.1). `jwks_uri` "may be specific per
  registration". The only host rule ties the *configuration URL* to the issuer
  (§3.4); there is no such rule for the endpoints themselves.

So `authorization_server` is not necessarily equal to `token_endpoint`, and none
of the four endpoints must share the issuer's host.

### What Canvas Does

For Instructure-hosted Canvas, the issuer identifies the hosting environment,
not the institution. Every hosted institution's launches carry the same `iss`:

| Environment | Issuer | Documented authorization endpoint |
|---|---|---|
| Production | `https://canvas.instructure.com` | `https://sso.canvaslms.com/api/lti/authorize_redirect` |
| Beta | `https://canvas.beta.instructure.com` | `https://sso.beta.canvaslms.com/api/lti/authorize_redirect` |
| Test | `https://canvas.test.instructure.com` | `https://sso.test.canvaslms.com/api/lti/authorize_redirect` |

Instructure calls `canvas.instructure.com` the old authorization host. It "will
continue to work", but tools should "update this endpoint in their
configuration store as soon as possible", and tools implementing Platform
Storage are required to use the new host. Self-hosted Canvas sets `iss` to its
own hostname, and there the issuer-relative paths are correct.

Third-party setup guides also list `sso.canvaslms.com` for the token endpoint
(`/login/oauth2/token`) and the key set (`/api/lti/security/jwks`). Instructure's
own developer documentation does not yet state this; its sample OpenID
configuration still shows `canvas.instructure.com` hosts and a different JWKS
path (`/login/oauth2/jwks`).

Today's derivation therefore points every hosted-Canvas registration at the
legacy host. It works only because Instructure still honours that host, and an
administrator has no way to correct it.

### Other Platforms

From general knowledge of each platform, not verified for this spec:

- Moodle serves all endpoints under the site URL, so derivation works.
- Blackboard Learn uses the issuer `https://blackboard.com` and serves its
  endpoints from `developer.blackboard.com`.
- D2L Brightspace uses an institution issuer but serves its token endpoint from
  `auth.brightspace.com`.

An adapter can offer sensible defaults, but core must not assume they are
correct.

## Outcome

After this work:

1. The create form shows all four endpoint fields. An administrator can fill
   them with the adapter's defaults for the entered issuer, then accept or
   change each one.
2. An administrator can edit an existing registration's name, client ID and
   four endpoint values. The issuer cannot be edited.
3. A corrected value takes effect on next use, on every instance, without a
   restart. The existing fingerprint machinery already provides this (see
   [Propagation of Changes](#propagation-of-changes)).
4. The Canvas adapter's defaults use the hosts Instructure documents for
   hosted Canvas, and stay issuer-relative for self-hosted Canvas.
5. Existing registrations keep their stored values until an administrator
   changes them. Nothing is rewritten automatically.

## Non-Negotiable Contracts

- **The issuer is immutable after creation.** Launches and logins look a
  registration up by issuer (`findPlatformByIssuer` in `login.ts` and
  `launch.ts`), and learner identities and score state are keyed through it.
  Changing an issuer in place would silently re-home that state. Registering a
  different issuer means creating a new registration.
- **Core never rewrites a stored endpoint on its own.** Adapter defaults are
  applied only when a registration is created or when an administrator asks for
  them. Changing an adapter's defaults in a release must not change any
  existing registration.
- **Every write is validated server side**, in core's request schema, whatever
  the form did. The rules are in [Validation](#validation).
- **No secret material is introduced.** The four values are public platform
  URLs and identifiers, the same class of data the details page already shows.

## Design

### The Adapter Contract

`RegistrationEndpoints` and `registrationEndpoints(issuer)` stay as they are in
`packages/lti/src/contract.ts`. Only their meaning changes: from "the
endpoints a registration uses" to "the endpoints an adapter suggests for this
issuer". Update both doc comments to say so:

```ts
/** Default endpoints an LMS adapter suggests for an issuer; an administrator may override each. */
export type RegistrationEndpoints = { … }

/** Suggested endpoints for a registration with `issuer`; core stores what the administrator confirms. */
registrationEndpoints(issuer: string): RegistrationEndpoints
```

The type and method signature don't change, so `LMS_CONTRACT_VERSION` stays at
1. The change still ships in a lockstep release with the other published
packages.

### Canvas Defaults

`canvasRegistrationEndpoints` maps the three hosted issuers to their `sso.*`
host and falls back to the issuer's origin for self-hosted Canvas:

```ts
const HOSTED_CANVAS_SSO: Record<string, string> = {
  'https://canvas.instructure.com': 'https://sso.canvaslms.com',
  'https://canvas.beta.instructure.com': 'https://sso.beta.canvaslms.com',
  'https://canvas.test.instructure.com': 'https://sso.test.canvaslms.com',
}
```

The authorization endpoint moves to the `sso.*` host in this work, because
Instructure documents it. The token endpoint, JWKS URI and authorization
server default move only after the check in
[Open Questions](#honest-notes--open-questions) passes against Canvas test.
Until then they keep their current issuer-relative values. Normalise the issuer
(`new URL(issuer).origin`) before the lookup so a trailing slash still matches.

### Core: Create

`createLtiPlatformRequestSchema` gains the four endpoint fields as optional:

```ts
export const createLtiPlatformRequestSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  issuer: issuerSchema,
  client_id: z.string().min(1, 'Client ID is required.'),
  authorization_endpoint: endpointUrlSchema.optional(),
  token_endpoint: endpointUrlSchema.optional(),
  jwks_uri: endpointUrlSchema.optional(),
  authorization_server: audienceSchema.optional(),
})
```

`createLtiPlatform` fills each omitted field separately from
`this.lms.registrationEndpoints(issuer)`. The admin form always sends all four
fields, but keeping them optional preserves the current command shape for other
callers: `modulus` CLI scripts, tests, and any downstream host that uses the
command directly.

### Core: Suggested Defaults

A new read command, `suggestLtiPlatformEndpoints`, lets the form fill its
endpoint fields from the issuer before saving. It takes `{ issuer }`, validates
it with `issuerSchema`, and returns `RegistrationEndpoints`. It requires
`lti-platforms:create`, the same as `generateCanvasConfig`, which serves the
same form.

### Core: Update

Add `updateLtiPlatform` to the service, commands and repository:

```ts
export const updateLtiPlatformRequestSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required.'),
  client_id: z.string().min(1, 'Client ID is required.'),
  authorization_endpoint: endpointUrlSchema,
  token_endpoint: endpointUrlSchema,
  jwks_uri: endpointUrlSchema,
  authorization_server: audienceSchema,
})
```

- Every field is required. An edit is a complete statement of the
  registration, and defaults are never applied silently on update.
- The schema has no `issuer` field, so it cannot be changed. Zod's default
  stripping drops an `issuer` sent by a client.
- `LtiPlatformMutations.updatePlatform(id, data)` returns the updated record,
  or throws `ERR_NOT_FOUND` when no row matches the id.
- The new ability is `lti-platforms:edit`, following the per-verb convention
  of `admin-roles:edit`. The command requires it.

### Abilities

Grant `lti-platforms:edit` to the Manager role in two places:

- **New databases.** Add it to the Manager role in
  `packages/core/src/database/bootstrap/reference-data.ts`, beside the
  existing `lti-platforms:*` grants.
- **Existing databases.** `modulus bootstrap` grants abilities only to roles it
  creates and never changes an existing role, so the reference data alone
  doesn't reach them. Add a data-only release script under
  `packages/core/src/database/sql/`, named
  `<date>-001-grant-manager-abilities.sql`, that inserts the grant for
  the `manager` admin role. The same script also grants
  `activity-url-allowlist:list` and `activity-url-allowlist:manage`. The
  allowlist release added those to the reference data only, so existing
  databases have the same gap. Follow
  `2026-10-28-001-rename-manager-admin-role.sql`: a header saying it is data
  only and safe to re-run, and one transaction. `admin_permissions` has no
  unique constraint on `(admin_role_id, ability)`, so guard each insert with
  `NOT EXISTS`. The `id` column has no default, so the script generates it:
  `uuidv7()` if every supported deployment runs PostgreSQL 18, otherwise
  `gen_random_uuid()`.

  `modulus db upgrade` applies the script. Admin deploys on Fly run that as
  their `release_command`, and the upgrade guide (`docs/20-upgrading.md`)
  puts it in the downstream upgrade path.

Admin access tokens carry abilities, so a new grant reaches an administrator who
is already signed in only when their access token renews, which takes up to its
10-minute lifetime (finding 4 of the
[Session Management Review](./2026-10-30-session-management-review-analysis.md)).
The release notes should tell administrators to sign in again if the Edit
button doesn't appear.

Grant `lti-platforms:read` in the same reference-data change and the same
release script. `getLtiPlatform` requires it, but the Manager role does not
grant it: the reference data lists only `lti-platforms:list` and
`lti-platforms:create`. Abilities are matched exactly, with no wildcard, and
no seed, release script or fixture grants `read` elsewhere, so the details
page is unreachable for a seeded Manager. The edit route's loader calls the
same command.

### Validation

Define the schemas once in core's `lti-platforms/schemas.ts`. The host's form
schema in `packages/host-tanstack-start/src/modules/admin/lti-platforms/@types`
mirrors them for field-level messages.

- **`issuerSchema`**: an absolute `https:` URL with no query or fragment
  (Security Framework §1.2), at most 255 characters, trimmed, and not ending
  in `/`. Logins and launches match the stored issuer exactly against the
  `iss` claim, which platforms send without a trailing slash, and the issuer
  can't be corrected after creation. It is applied on
  create and to `suggestLtiPlatformEndpoints` only. Existing rows are not
  revalidated.
- **`endpointUrlSchema`**: an absolute `https:` URL, at most 2048 characters,
  trimmed. A query string is allowed, because some platforms put registration
  parameters on their JWKS or authorization URLs. A fragment is rejected.
- **`audienceSchema`**: a non-empty string of at most 2048 characters, trimmed,
  and not required to be a URL. The Security Framework leaves the `aud`
  string to out-of-band agreement, and Canvas's own sample OpenID
  configuration gives `authorization_server` as a bare host name.

Plain `http:` URLs are rejected. The session HTTP and unit fixtures already use
`https://` throughout. If a local mock platform ever needs `http:`, add an
explicit development-only switch at that point rather than loosening the rule
now.

### Propagation of Changes

No new cache work is needed, because each consumer already rebinds on changed
values:

| Consumer | Reads | Picks up an edit by |
|---|---|---|
| OIDC login (`services/login.ts`) | `authorization_endpoint` | Loading the registration from the database on every login. |
| Launch verification (`services/launch.ts`) | `jwks_uri` | Comparing the cached key set's `jwks_uri` with the current record, then rebuilding it. |
| Score passback (`score-submission/manager.ts`) | `token_endpoint`, `authorization_server`, `client_id` | Reconciling on `registrationFingerprint`, which drains the old processor, forgets its cached token and starts a replacement. |

The update path relies on this behaviour, so it now needs test coverage: each
row of the table gets a test (see [Tests](#tests)). An edit made on an `admin`
instance reaches `frontend` instances through the database. Login and launch
read per request, and only `admin` and `all-in-one` instances run score
processors.

### Admin Surface

All of this lives in `@modulus-learning/host-tanstack-start`. The gradebook
gains one thin route file that calls the new factory.

**Create form** (`components/create-form.tsx`):

- Add an "Endpoints" fieldset below the client ID with four required inputs:
  Authorization Endpoint, Token Endpoint, JWKS URI and Authorization Server
  (token `aud`).
- Add a "Fill defaults from issuer" button beside the fieldset. It calls
  `suggestLtiPlatformEndpoints` and fills only the empty fields, so values the
  administrator has typed are kept.
- Each input's help text says where to find the value. For Canvas, point to
  Instructure's LTI launch overview.
- Rewrite step 4 of the instructions. It currently says "issuer (base Canvas
  URL)", which is wrong for hosted Canvas. The issuer for hosted Canvas is
  `https://canvas.instructure.com` (or the beta or test equivalent), not the
  institution's Canvas URL.

**Edit form** (new, at `/admin/lti-platforms/$id/edit`):

- Reuse the create form's field components. The issuer is shown read-only.
- Show the same "Fill defaults from issuer" button. Here it replaces all four
  values, after the administrator confirms in the form itself (not a browser
  dialog).
- On save, set the flash cookie and redirect to the details page, matching
  `create.server.ts`.
- Add `update.ts` and `update.server.ts`. The server function's first
  middleware is `adminSessionMiddleware`, and the convention test enforces it.
  Use it exactly as the sibling server functions do. The session-management
  work will rework that middleware, and reusing it unchanged keeps the edit
  route covered by whichever change lands second.

**Details view**: add an Edit button, shown only when the session holds
`lti-platforms:edit`.

### Documentation

- `docs/13-lti.md`, "Platform Registration": replace the implication that
  endpoints come from the issuer. State that each endpoint is entered per
  registration, that the adapter only suggests defaults, and that the issuer
  is immutable.
- `docs/11-data-model.md`: note that the four columns are administrator-entered.
- `docs/08-lms-integration.md`: this placeholder promises a registration
  walkthrough. Record under "Documentation Still to Come" that the walkthrough
  covers the four endpoint fields, the "Fill defaults from issuer" button, and
  the hosted-Canvas issuer (`https://canvas.instructure.com` or its beta or test
  equivalent, not the institution's Canvas URL). Write the walkthrough itself
  only when the placeholder becomes a full guide.
- `packages/lms-canvas/src/registration.ts`: a doc comment on
  `canvasRegistrationEndpoints` with the hosted-issuer table, the self-hosted
  fallback and a link to Instructure's launch overview. The package README
  only points to the repository and website, so the table goes in the doc
  comment, not the README.
- A changeset covering `lti` (doc-comment change), `lms-canvas` (defaults),
  `core` (commands and validation) and `host-tanstack-start` (forms and
  routes).

## Data and Migration

- **No schema migration.** `lti_platforms` already has all four columns as
  `varchar NOT NULL` with no length limit
  (`packages/core/src/database/schema/source/lti/lti-platforms.ts`).
- **One data-only release script, for abilities.** It grants
  `lti-platforms:edit`, `lti-platforms:read` (the gap is confirmed) and the two
  `activity-url-allowlist` abilities to the `manager` admin role. See
  [Abilities](#abilities).
- **No registration data migration.** Existing hosted-Canvas registrations keep their
  `canvas.instructure.com` endpoints, which still work. The release notes tell
  administrators that they can now switch the authorization endpoint to
  `sso.canvaslms.com` from the edit form, and why.

## Tests

Core unit tests (vitest `--mode=node`, `*.test.node.ts`):

- `createLtiPlatform` stores supplied endpoints as given, and fills each omitted
  field separately from the adapter.
- `createLtiPlatform` rejects a non-`https:` issuer, an issuer with a query,
  fragment or trailing slash, and a non-`https:` endpoint.
- `updateLtiPlatform` changes only the permitted fields and ignores a supplied
  `issuer`. It returns `ERR_NOT_FOUND` for an unknown id and is refused
  without `lti-platforms:edit`.
- `suggestLtiPlatformEndpoints` returns the adapter's values.
- Login uses the updated `authorization_endpoint` on the next call.
- Launch verification rebuilds the key set after `jwks_uri` changes. The
  existing test in `launch-characterisation.test.node.ts` ("uses a corrected
  jwks_uri on the next launch, without a restart") already covers this.
- The access-token manager signs the next token request with the new `aud`
  after only `authorization_server` changes and the registration is forgotten
  (`access-tokens.test.node.ts`).

LMS Canvas (vitest `--mode=node`, a new `registration.test.node.ts`):

- Each hosted issuer, with and without a trailing slash, maps to its `sso.*`
  authorization endpoint.
- A self-hosted issuer keeps issuer-relative paths for all four values.

Host and gradebook (vitest):

- The create form's defaults button fills only empty fields.
- The edit form renders the issuer read-only and submits all four endpoints.
- The server-function gate convention test covers `update.ts`.

Core integration (vitest `--mode=integration`, `src/**/tests/**/*.test.ts`):

- The ability release script grants the four abilities to `manager` once, and
  inserts nothing when run a second time.
- Score submission: `score-submission/tests/manager.test.ts` already updates a
  row and expects `forgetRegistration`. Add a case that changes only
  `authorization_server` and expects the registration to be forgotten and a
  replacement client to start. That test stubs the access-token manager, so
  the signed `aud` is checked in the unit test above.

Session HTTP suite:

- Extend the global setup so one test edits a registration through the command
  and then completes a login against the new `authorization_endpoint`.
- Calling the update server function with no admin session gets a non-200
  refusal from the session gate. Before `8087512` (released in 0.11.3),
  Nitro's `fastResponse` turned a gate's thrown 401, 409 or 400 into a 200,
  and this suite is what guards that fix.
- Calling it from an admin session without `lti-platforms:edit` gets a failed
  form state, and the row is unchanged in the database. The session gate
  doesn't check abilities. Core refuses the command with `ERR_FORBIDDEN`, and
  admin form actions return that as a form state over HTTP 200. The case
  checks that the refusal is enforced on the server, not just by hiding the
  Edit button. Whether admin actions should answer ability refusals with a
  non-200 status is a separate decision.

## Delivery

One branch, `feat/editable-platform-endpoints`, opened against
`develop`, in this order:

1. Core: validation schemas, the optional create fields, `updateLtiPlatform`,
   `suggestLtiPlatformEndpoints`, the ability with its reference-data grant and
   release script, and the `lti-platforms:read` and allowlist grants. Include
   the tests.
2. Propagation tests for login, launch and score passback.
3. Host: the create-form fieldset, the edit route and form, and the details
   Edit button. Add the gradebook route file.
4. Canvas: move the hosted authorization-endpoint default to `sso.*`.
5. Docs and the changeset.

Moving the Canvas token, JWKS and audience defaults is a separate, later change
that depends on the check below.

This work and the implementation of the
[Session Management Review](./2026-10-30-session-management-review-analysis.md)
both touch the admin server functions. They don't depend on each other.
Whichever lands second rebases onto the other, and the new `update.ts`
follows whatever gate convention is current at that point.

## Trade-Offs and Alternatives

- **Dynamic Registration instead of manual entry.** Canvas supports LTI Dynamic
  Registration. With it, the platform's OpenID configuration would supply all
  four values and the client ID, and nothing would need typing. It is the
  better long-term path, but it is a larger feature: a registration
  initiation endpoint, tool-configuration exchange and a review step. Manual
  entry is still needed for platforms that don't support it, and for
  correcting a registration later. This spec doesn't block it.
- **Fetch defaults from the issuer's OpenID configuration.** The Dynamic
  Registration specification places the configuration URL on the issuer's
  host, but tools receive it during a dynamic-registration flow; it is not a
  well-known URL every platform publishes. Canvas does publish
  `/api/lti/security/openid-configuration`, but on hosted Canvas the issuer
  host is shared by all institutions. Static adapter defaults are simpler and
  predictable.
- **Make the issuer editable.** Rejected. See
  [Non-Negotiable Contracts](#non-negotiable-contracts).
- **Silently migrate existing hosted-Canvas rows to `sso.*`.** Rejected for
  now. The old host works, and rewriting registrations automatically breaks
  the rule that only administrators change them. An administrator who wants
  the change makes it from the edit form.

## Honest Notes & Open Questions

- **Canvas token, JWKS and audience on `sso.*`.** Instructure documents only
  the authorization endpoint's move. Before moving the other defaults, check
  against Canvas test (`canvas.test.instructure.com`) that:
  1. A client-credentials request to `https://sso.test.canvaslms.com/login/oauth2/token`
     succeeds.
  2. The `aud` it accepts is the `sso.*` token URL, the legacy token URL, or
     both.
  3. `https://sso.test.canvaslms.com/api/lti/security/jwks` serves the key that
     signs launches.

  If the accepted `aud` differs from the token URL, the Canvas default for
  `authorization_server` must stop copying `token_endpoint`.
- **One registration per issuer.** `lti_platforms.issuer` is unique. Every
  hosted-Canvas institution shares one issuer, so an installation can hold
  only one hosted-Canvas registration per environment. That matches the
  one-LMS-per-installation decision in
  [Canvas and LTI Package Extraction](./2026-10-25-canvas-lti-package-extraction-spec.md),
  but LTI identifies a registration by issuer and client ID together (Core
  §6.2.1). Allowing several registrations per issuer is out of scope here. If
  it is ever needed, it is a separate change touching lookups, uniqueness and
  identity.
- **The `lti-platforms:read` gap** described under
  [Abilities](#abilities) was found while writing this spec. It was confirmed
  by reading the code on 2026-11-10, but not reproduced at runtime.
- **The other-platform claims** (Moodle, Blackboard, D2L) come from general
  knowledge and were not verified for this spec. They only motivate the design
  and don't affect it.

## Sources

- [Canvas: LTI Launch Overview](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_launch_overview)
- [Canvas: Registration](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.registration)
- [Canvas: OAuth2 Endpoints](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth_endpoints)
- [IMS LTI 1.3 Core](https://www.imsglobal.org/spec/lti/v1p3/)
- [IMS Security Framework 1.0](https://www.imsglobal.org/spec/security/v1p0/)
- [IMS LTI Dynamic Registration 1.0](https://www.imsglobal.org/spec/lti-dr/v1p0)

## Where to go next

- [LTI](../docs/13-lti.md): login, launch and score-passback flows that consume
  these values.
- [LTI Score Submission](../docs/14-lti-score-submission.md): processor
  reconciliation and token caching.
- [LMS Integration Packages](../docs/08-lms-integration.md): the planned
  registration guide this work feeds.
- [Canvas and LTI Package Extraction](./2026-10-25-canvas-lti-package-extraction-spec.md):
  the adapter contract this spec amends.
