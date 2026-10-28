# LMS Extraction: Characterisation

Date: 2026-10-28

Status: Complete for the first three increments of
[Canvas and LTI Package Extraction](./2026-10-25-canvas-lti-package-extraction-spec.md).

Document type: Record of pinned behaviour and known gaps.

The extraction spec's first increment is characterisation: capture current
Canvas and LTI behaviour in tests before any code moves, and record known gaps
rather than labelling them correct. This document lists what is now pinned and
the gaps found, with a recommendation for each.

## What Is Pinned

All tests use `node:test` through `tsx`, as core's other unit tests do. The
shared harness — a platform key pair, a local JWKS endpoint, and a synthetic
platform record — is `packages/core/src/test-support/lti.ts`.

| Area | Test file | Pinned behaviour |
| --- | --- | --- |
| Launch verification | `modules/app/lti/services/launch-characterisation.test.ts` | Unknown issuer and bad signature rejected before the nonce is claimed; `iss` must match; `aud` must name the client id (string or array); ten-minute clock tolerance; a replayed nonce writes nothing; nonce claim, then deployment upsert, then sign-in |
| Message dispatch | same | `start-activity` and `view-dashboard` need `LtiResourceLinkRequest`, `deep-link` needs `LtiDeepLinkingRequest`; any other combination is rejected |
| Canvas roles | same | The five instructor roles; `Learner`, `TestUser`, system `Administrator`, and short role names sign in as learners |
| Cutoff precedence | same | Usable `ResourceLink.available.endDateTime` wins; unexpanded, missing, or `null` falls back to `Canvas.assignment.lockAt.iso8601`; neither usable means no cutoff |
| Custom-claim types | same | A custom claim that is not a string, boolean, or `null` rejects the whole launch |
| Term and scope | `services/launch.test.ts` (existing) | Term field quality, scope resolution, enrollment, line-item reconciliation |
| OIDC login | `services/login.test.ts` | The authentication request parameters; one fresh nonce per login; state returned as the cookie value; `client_id` checks |
| Tool keystore | `lib/lti-keystore.test.ts` | One RS256 signing key under the configured key id, no private material, one-minute default expiry |
| Access tokens | `services/access-tokens.test.ts` | Form-encoded client-credentials request, the three AGS scopes, the client assertion's claims and signer, failure classification |
| Deep linking | `services/deep-link.test.ts` (extended) | The exact set of 53 Canvas substitution variables, each `$<name>`; the signed response envelope |
| Score passback | `score-submission/*.test.ts` (existing) | Score payload and encoding, rate-limit readings, error classification, quota pacing |
| Canvas registration | `admin/lti-platforms/services/lti-platforms.test.ts` | Endpoints derived from the issuer; the complete developer-key configuration; overrides |
| LTI sign-in | `session/services/lti-sign-in.test.ts` | Matching by issuer and subject, then by email; account creation and roles; the concurrent-creation race; disabled accounts |

## Known Gaps

| # | Gap | Pinned as | Recommendation |
| --- | --- | --- | --- |
| 1 | **Email linking re-points an account that already has a different LTI identity.** | `lti-sign-in.test.ts` — "re-points … (current gap)" | Fix during boundary preparation, as decided: scoped linking for the configured registration, never re-pointing an existing identity. |
| 2 | **Access tokens are never cached.** `getAccessToken` checks a cache `fetchAccessToken` never writes, so every score submission requests a new token from the platform. | `access-tokens.test.ts` — "never cached (current gap)" | Fix during boundary preparation. The spec already requires registration-bound token caches with invalidation; this is the same work. |
| 3 | **An absent `lti_message_hint` is sent as the string `undefined`.** Every authentication-request field is copied with `searchParams.set`. | `login.test.ts` — "(current gap)" | Fix with the move to shared LTI: omit absent optional parameters. Small, and Canvas always sends the hint today. |
| 4 | **`azp` is not checked when the audience has several values.** | `launch-characterisation.test.ts` — "(current gap)" | Address in shared LTI verification, as the spec's verification review requires. |
| 5 | **Deployments are written inside launch verification.** | `launch-characterisation.test.ts` — order test | Move after verification returns, as the spec decides. The nonce claim stays the only write inside verification. |
| 6 | **The platform JWKS resolver is cached by platform id and never replaced** when a registration's `jwks_uri` changes. | Not pinned (needs a configuration-change scenario) | Fix with registration-bound caches (spec: compatibility and persistence). |
| 7 | **Ten-minute clock tolerance.** | `launch-characterisation.test.ts` | Keep during extraction; review as part of the verification review. |
| 8 | **Cutoff parsing accepts any `Date.parse`-able string**, not only ISO 8601 with an offset, unlike term dates. | `launch-characterisation.test.ts` | Keep during extraction (behaviour preservation); decide in contract review whether shared LTI should be stricter. |
| 9 | **One malformed custom claim rejects the whole launch.** | `launch-characterisation.test.ts` | Keep during extraction; the spec's TODO to validate only the claims Modulus uses belongs to shared LTI. |

## Boundary Preparation (Done)

The second increment followed on 2026-10-28:

- **Gaps 1, 2 and 5 fixed**, each changing its characterisation test
  deliberately: email linking refuses to re-point an account linked to a
  different LTI identity (`ERR_LTI_IDENTITY_CONFLICT`, shown to the learner as
  `identity_conflict`); access tokens are cached per registration until 30
  seconds before expiry; the deployment is recorded after verification returns.
- **The adapter contract** (`packages/core/src/lms/contract.ts`) and
  `canvasAdapter()` (`packages/core/src/lms/canvas/`). `initCore` takes `lms`,
  checks its contract version, and registers it; the launch, deep-linking,
  registration, and score-submission services depend on it. Core no longer
  constructs `HttpLtiAgsClient` or `QuotaGovernor`, interprets Canvas roles or
  term fields, or holds the Canvas substitution variables and endpoints.
  Rate-limit readings are opaque to core; the processor caps the adapter's
  target at its configured maximum.
- **Evidence that core runs without Canvas:** a synthetic adapter
  (`test-support/lms.ts`) exercises launch, deep linking, and registration; a
  boundary test fails when a core module imports Canvas implementation.

Still in core, by design until extraction: launch verification, the OIDC
request, token exchange, and the files the Canvas adapter wraps
(`score-submission/ags-client.ts`, `error-classifier.ts`, `quota-governor.ts`).
The installation binding (stored adapter id and integration-schema version) is
part of the later operational-adoption increment.

## Package Extraction (Done)

The third increment followed on 2026-10-28:

- **`@modulus-learning/lti`** (`packages/lti`) holds the shared protocol
  vocabulary moved out of core — claim constants, platform and tool message
  types, the OIDC authentication request, access-token types — together with
  the `LmsAdapter` contract, the score-client types (`LtiAgsClient`,
  `SubmissionResult`, `SubmissionErrorCategory`), and the narrow
  `LtiRegistration`, `AccessTokenSource`, and `LtiLogger` shapes an adapter
  receives in place of core's records, token manager, and logger.
- **`@modulus-learning/lms-canvas`** (`packages/lms-canvas`) holds
  `canvasAdapter()` and everything it wraps: roles, term fields, deep-link
  variables, registration defaults, `HttpLtiAgsClient`, the error classifier,
  and `QuotaGovernor`. It depends on `lti` only. The score client takes plain
  `settings` (timeout, concurrency, quota reserve, window, and ramp) rather than
  core's `Config`.
- **Host wiring.** The application's server entry names its adapter:
  `createModulusFetch(render, { lms: canvasAdapter() })`. The host package
  depends on `lti` for the type and never on `lms-canvas`; core has
  `lms-canvas` as a development dependency for its tests. The boundary test now
  fails if a core runtime module imports `@modulus-learning/lms-canvas`.
- **Release and smoke test.** Both packages join `fixed[0]` at 0.11.0. The
  packed-install smoke test packs them and installs the Canvas adapter into the
  fixture from its tarball.

Still in core, by design: launch verification, the OIDC request, token
exchange, and the keystore (Phase B moves them behind the shared LTI package),
and the installation binding (operational adoption).

## Next Increment

The 0.12.0-next.0 prerelease of the extended lockstep set, then Phase B.
