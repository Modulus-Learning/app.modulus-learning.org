# Canvas and LTI Package Extraction

Date: 2026-10-25

Status: Ready for contract review; implementation has not started.

Revision: 2026-10-28, aligned with the companion
[Modulus Packaging and Distribution](./2026-10-28-modulus-packaging-and-distribution-spec.md)
specification. The new packages are now published as part of a lockstep server
set; the adapter is selected in a host's composition file; LTI HTTP handling
moves into a published host package; and adapter compatibility is checked at
boot. Earlier revision: 2026-10-25, incorporating source review, explicit
contract-boundary decisions, and remaining contract-review notes.

Document type: Explanation and architectural specification.

This specification proposes extracting Canvas integration into a dedicated
package, with shared Learning Tools Interoperability (LTI) protocol functionality
in a separate package. It is for reviewing the boundaries and migration strategy
before writing a detailed implementation plan.

**Each Modulus installation supports one selected learning management system
(LMS) at a time.** Different installations may select Canvas, Moodle, or
Blackboard. An installation may later migrate to another LMS; that is a managed
data and operational transition, not a configuration toggle.

## Strategic Outcome

The first delivery should establish a reliable Canvas package and prove that
Modulus's application logic no longer depends on Canvas behaviour. It should
prepare for a second LMS without claiming that Moodle or Blackboard already
works, or designing every future connector in advance.

The recommended approach is to:

- Establish behavioural contracts and conformance tests before moving code.
- Separate shared LTI protocol work, Canvas-specific behaviour, and Modulus
  business rules. Extract along these boundaries rather than moving the entire
  current LTI directory into a Canvas package.
- Select one adapter at installation startup. Multiple registrations or
  deployments of that LMS can use the same adapter.
- Keep the current in-process deployment, database ownership, and public command
  surface. Package extraction does not require a new service.
- Ship and stabilise Canvas before implementing a second LMS. Use that second
  implementation to test and refine the abstraction.
- Preserve enough source identity and operational state to support a later LMS
  migration without sending old grades to a new platform.

The boundary decisions below are explicit proposals for contract review, not
choices to defer to implementation. Package names, exact interfaces, schema
details, and the implementation sequence remain subject to review.

## Current State and Extraction Boundary

The implementation is more specific than its LTI naming suggests. The following
inventory is based on source, including the current TanStack Start host, rather
than assuming every existing documentation statement is current.

| Current Area | What It Does | Proposed Ownership |
| --- | --- | --- |
| `packages/core/src/modules/admin/lti-platforms/services/lti-platforms.ts` | Constructs Canvas endpoint defaults and developer-key configuration, including placements and substitution variables | Canvas package owns construction; core retains authorised registration commands and persistence |
| `packages/core/src/modules/app/lti/services/login.ts` | Resolves a registration, stores a nonce, and constructs an OpenID Connect (OIDC) authentication request | Adapter calls shared LTI message builders; core supplies registration and nonce storage |
| `packages/core/src/modules/app/lti/services/launch.ts` | Verifies signed launches, parses Canvas term fields, determines instructor status, resolves scopes, signs in users, enrolls users, and reconciles grade destinations | Adapter composes shared verification and vendor interpretation; core owns deployment persistence and application orchestration |
| `packages/core/src/modules/app/lti/services/deep-link.ts` | Authorises activity selection, creates associations, adds Canvas custom fields, and signs a deep-link response | Core owns authorisation and activity changes; Canvas supplies vendor fields; shared LTI builds and signs the response |
| `packages/core/src/lib/lti-keystore.ts` and `services/access-tokens.ts` under the LTI module | Loads configured tool keys and obtains platform access tokens | Shared LTI package with explicit configuration and injected runtime dependencies |
| `packages/core/src/modules/app/lti/score-submission/ags-client.ts` | Sends Assignment & Grade Services (AGS) scores and interprets responses | Shared protocol primitives with Canvas transport compatibility and response interpretation in Canvas |
| `score-submission/error-classifier.ts` and `quota-governor.ts` under the LTI module | Recognises Canvas error text and adapts concurrency to Canvas quota headers | Canvas package |
| Remaining score-submission orchestration, repositories, and `packages/core/src/workers/` | Claims durable work, fences completion, schedules retries, records incidents, and manages worker lifetime | Core |
| `apps/gradebook/src/routes/routes/lti/` and `src/modules/lti/` | HTTP handling, state cookies, session cookies, redirects, deep-link forms, and launch presentation | Host package `@modulus-learning/host-tanstack-start`, exposed as route factories at fixed paths; each host application re-exports them |
| `apps/gradebook/src/session-http/` | End-to-end HTTP suites for launch, deep link, and sessions | Reference host (`apps/gradebook`) |

An existing contract provides a useful starting point:

```ts
// packages/core/src/modules/app/lti/score-submission/ags-client.ts
export interface LtiAgsClient {
  readonly issuer: string
  publishScore(input: PublishScoreInput): Promise<PublishScoreOutcome>
}
```

The submitter already uses this interface. However, the manager constructs
`HttpLtiAgsClient` directly, and the processor constructs `QuotaGovernor`
directly. Extraction must remove those concrete dependencies as well as relocate
files. The current `RateLimitReading` also encodes Canvas quota semantics; merely
moving that type into a shared package would preserve the coupling.

No separate general-purpose Canvas REST connector was identified in the reviewed
integration paths. This proposal covers the existing registration, launch,
deep-link, token, and score-passback functionality. It does not introduce roster
sync, course provisioning, or a general Canvas API client.

## Architectural Model

### Package Responsibilities

The following names are proposed, not existing APIs.

| Package | Responsibility | Dependencies and Restrictions |
| --- | --- | --- |
| `@modulus-learning/lti` in `packages/lti` | Shared LTI messages, verification, signing, token exchange, AGS primitives, and the contracts used by LTI-based LMS adapters | No core, database, host framework, or Canvas dependency |
| `@modulus-learning/lms-canvas` in `packages/lms-canvas` | The complete Canvas adapter: registration defaults/configuration, launch interpretation, custom fields, transport compatibility, error classification, and quota policy | Depends on the shared LTI package; no core or host imports |
| `@modulus-learning/lms-conformance` in `packages/lms-conformance` | Reusable behavioural suites and synthetic fixtures for adapter contracts | Private test infrastructure; no production imports and no adapter-specific implementation |
| Existing `@modulus-learning/core` | Application policy, durable state, account/session handling, activity scopes, enrollment, score queue, incidents, and authorised commands | Imports shared contracts as types and calls an injected adapter; no shared protocol runtime or Canvas imports |
| `@modulus-learning/host-tanstack-start` in `packages/host-tanstack-start` | LTI route handlers, state and session cookies, deep-link forms, and launch presentation, among the other host concerns defined by the packaging specification | Imports core; does not import an adapter package; receives the adapter only through core |
| Host application — the reference host `apps/gradebook` or a downstream installation | Selects the installed adapter in its composition file and re-exports host-package routes | Imports core, the host package, and the selected adapter only in server composition |

`lti` and `lms-canvas` are published with core and the host package in one
lockstep Changesets `fixed` group, as the packaging specification describes.
`lms-conformance` remains private test infrastructure. The agent is in the
same lockstep group. Third-party adapter loading — an adapter published
outside this repository — is not supported by this extraction; the contract is
public so that it can be reviewed and tested, not yet so that external adapters
can rely on its stability.

The runtime dependency direction is host → core and selected adapter;
Canvas → shared LTI. Core depends on shared LTI for contracts and types only. Because core's
published declaration files reference those types, `@modulus-learning/lti` is a
declared runtime `dependency` of core, not a development dependency, even though
core's source imports it with `import type` only.
Its single runtime integration object is the injected adapter, including for
OIDC construction, launch verification, public JWKS retrieval, deep-link signing,
and registration-bound score clients. Core does not call shared protocol helpers
alongside the adapter. A synthetic adapter therefore replaces the whole
integration boundary, not part of a fixed verification pipeline.

Neither shared LTI nor Canvas imports core, including its internal aliases,
database row types, `BaseService`, or full `Config` object. This avoids a
circular package graph.

Shared LTI owns the small adapter contract because the immediate expansion is to
other LTI-based LMSs. A protocol-independent LMS contract package is deferred
until an actual non-LTI integration requires it.

### One Adapter Per Installation

Extend `initCore` to accept an adapter factory selected by the host's server
composition file — `modulus/server.config.ts` in the packaging specification —
which imports the adapter package and passes it in. The factory receives narrow dependencies and returns an
installation adapter capable of creating registration-specific clients.
Register this value through the existing typed dependency-injection registry,
which assembles core's services; retain `CoreCommands` as the host's only
application-operation surface.

All frontend and admin processes belonging to the same installation must use
the same adapter selection and support the stored integration-schema version.
That version describes persisted integration state and its interpretation;
it is not the npm package version. The lockstep release means a normal install
pairs core with an adapter built and tested alongside it, but published packages
can still be mismatched by a hand-pinned dependency or a duplicated install,
and the frontend and admin applications can temporarily run different builds
during rollout. The adapter therefore also declares the LMS contract version it
implements, and core refuses to start integration services on an incompatible
one. Each build must check the stored adapter ID
and integration-schema version at boot, and refuse incompatible integration
work. Deployment mode changes which surfaces and workers run, not which LMS
owns the installation.

The selected adapter is the one the composition file imports, and its stable
`id` — initially `canvas` — is the configured selection compared with the stored
installation binding. A separate environment variable naming the adapter would
duplicate that choice and could disagree with it, so none is added. Selection is
explicit at startup, not inferred from an issuer hostname, launch claim, or
administrator-entered display name. A missing or incompatible adapter
must prevent the relevant integration services from starting.

This is not a per-platform vendor dispatcher. An installation can hold several
registrations and deployments for its selected LMS, with separate credentials
and clients. It does not run a Canvas adapter for one registration and a Moodle
adapter for another. Existing issuer uniqueness remains unchanged during the
extraction; multiple client registrations under the same issuer require a
separate data-model decision.

Registration IDs are the client/cache identity, but existing grade work remains
issuer-keyed: `PendingSubmission`, line-item reconciliation, and queue claims
carry `platform_issuer`. During extraction, core resolves each issuer to its
unique active registration and binds the client to both its ID and issuer.
Adapters must preserve and validate that association; registration-bound does
not mean the queue has already migrated to registration IDs. Relaxing issuer
uniqueness later requires a coordinated change to queue keys, repositories,
adapter inputs, and conformance tests, not just a new registration form.

Host composition selects and injects the adapter once. Route handlers and UI
components continue to call core commands and do not instantiate vendor clients.
Adding another supported LMS package later should change installation wiring,
configuration, and adapter implementation, without vendor branches in core's
launch or score-processing paths.

### Shared Protocol and Application Policy

The shared LTI package owns protocol mechanics: OIDC request construction,
JSON Web Token (JWT) verification and signing, JSON Web Key Set (JWKS) handling,
LTI message validation, OAuth client assertions, token acquisition, and shared
deep-link/AGS message construction.

The adapter composes these primitives and selects explicit platform validation
policy, including issuer matching, audience/`azp` handling, deployment handling,
and clock tolerance. Vendor differences must be named and tested; adapters must
not silently bypass signature, audience, or replay protection. Shared tests pin
the primitive guarantees, while adapter conformance tests exercise verification
through the actual adapter entry point.

Core supplies narrowly defined ports: registration lookup, durable nonce
creation and atomic consumption, and any required persisted launch context.
The host retains browser state-cookie verification. The adapter returns a
verified, normalised launch only after protocol and platform checks and the
atomic nonce claim succeed. Vendor interpretation uses authenticated claims;
untrusted claims cannot trigger account, enrollment, or deployment writes.

Deployment persistence is an explicit core operation after that return. Today,
`validateLaunch` calls `upsertPlatformDeployment` after claiming the nonce but
before returning. Move that call out of verification and invoke the existing
core persistence operation with the verified registration and deployment ID.
Retain current auto-registration behaviour initially, but distinguish observing
an authenticated deployment claim from approving a deployment under any future
allowlist policy. The nonce claim remains the only persistence write permitted
inside launch verification; a rejected replay cannot create a deployment.

Core owns what a verified launch means for Modulus: account linking, local
permissions, activity admission, enrollment, scope persistence, and grade
eligibility. The Canvas adapter interprets vendor roles and claims as facts;
core applies the policy that grants Modulus roles. Protocol packages cannot
create users or grant application privileges.

Email-based account linking is an explicit core policy, not an automatic
consequence of a valid signature. The adapter reports the email claim and its
trust assessment, including the configured or verified basis for that
assessment. A signed email alone does not establish that the platform verified
ownership or prevents arbitrary email assertions. Core combines that evidence
with installation policy and migration state before permitting any email-based
association or overwrite of an existing LTI identity. Unknown or insufficient
trust cannot authorise automatic linking. Preserve lookup by an already linked
issuer/subject pair independently of this email policy.

This is a named security-related change to current behaviour, not a claim that
the guard already exists. Contract review must approve the Canvas trust basis
and legacy policy transition before implementation; a broader identity-table
redesign remains outside extraction scope.

Contract-review note: a strict legacy default prevents implicit email linking,
but users who first registered through Google or GitHub can lose the automatic
association when they later launch from Canvas. The current unique email
constraint prevents creating another account with the same email, so denying
linking can instead block sign-in. A replacement flow that creates a separate
account can split identity and progress; preventing that split is preferable
to merging accounts afterwards. A permissive default preserves the
association but retains the takeover risk unless the email trust basis is
established. Reviewers must choose the default and the account-linking or
recovery path together, including how an existing email match is handled when
automatic linking is denied. Do not silently resolve that decision by creating
another account or retaining the existing permissive behaviour.

Likewise, deep linking has three owners: core authorises the selection and
associates activities; Canvas contributes its placement/custom-field behaviour;
shared LTI constructs and signs the resulting message. The adapter cannot
bypass core's activity URL allowlist or activity-code membership checks.

### Contract Shape

Exact TypeScript signatures belong in the next review. The boundary must
nevertheless make the following information and authority explicit.

| Contract | Required Meaning |
| --- | --- |
| Adapter identity and capabilities | Stable adapter identifier; launch and score publication required; deep linking, term metadata, and registration configuration generation explicitly declared capabilities |
| Registration description | Stable registration ID, unique issuer, client ID, configured protocol endpoints and audience; plain values rather than a Drizzle row; preserve the issuer-to-ID mapping used by existing queue work |
| Verified launch | Authenticated registration, deployment claim, subject, roles, message type, relevant identity claims with email trust evidence, and optional grade endpoint/scopes; distinguish verified data from untrusted input and deployment approval |
| Normalised launch metadata | Optional external term identity/label/dates, effective assignment cutoff, interpreted roles, and bounded diagnostics; no Canvas field names required by core |
| Deep-link input | Core-approved activity identity and URL, activity code, verified return context, and platform deployment; vendor fields cannot overwrite reserved Modulus fields |
| Score publication | A registration-bound client accepts the grade destination, external subject, and normalized score; returns a classified outcome and scheduling advice |
| Scheduling policy | Each registration-bound client owns its scheduling-policy state and observes its vendor quota information; core enforces its configured concurrency cap, breaker, lease, retry, and shutdown rules |
| Runtime dependencies | Explicit HTTP transport, clock, randomness where needed, restricted logger, signing capability, and timeout configuration |

The baseline requires resource-link launch and score-publication support. It
does not require every individual launch to carry an AGS endpoint. Deep linking
and term metadata are optional across adapters until a second LMS informs the
contract; Canvas must retain both existing capabilities and cannot disable them
to pass conformance. Core and the host must explicitly handle unsupported deep
linking instead of presenting a flow the selected adapter cannot complete.

Canvas field-quality distinctions already used for terms—missing, empty,
unexpanded, malformed, and usable—must survive where they explain fallback
behaviour. Core receives a normalised external term and resolves its opaque
Modulus scope ID. It must not inspect `Canvas.term.*` itself.

Standard cutoff parsing belongs in shared LTI. Its helper reads
`ResourceLink.available.endDateTime` and chooses the first usable date before
consulting an adapter-supplied fallback. Canvas supplies
`Canvas.assignment.lockAt.iso8601` as that fallback. Preserve the current date
acceptance rules during extraction: a usable standard value wins; a missing or
unparseable standard value permits the Canvas fallback; neither usable means no
cutoff. Other adapters reuse the standard parser and ordering rather than
reimplementing them. Shared tests pin standard-first selection and Canvas tests
pin its particular fallback; core receives only the resulting effective cutoff.

Contract-review note: the standard variable is not an automatically supplied
LTI claim. Modulus's generated Canvas deep-link custom fields currently map
`$ResourceLink.available.endDateTime` to the custom-field key
`ResourceLink.available.endDateTime` in `services/deep-link.ts`. The shared
helper's key is therefore a documented configuration convention. A second LMS
must provide the equivalent mapping to use that convention; otherwise the
standard value is absent and fallback behaviour applies. Contract review may
instead make the custom-field key an explicit registration setting, while
keeping parsing and standard-first precedence shared.

External identity data is server-only and purpose-limited. A verified launch
object is not an activity response or a general-purpose logging payload.
Activities continue to receive only the established opaque user identity,
display name, activity context, and normalized scores. No email, institutional
student identifier, raw LMS term/course identity, credentials, or LMS gradebook
data may be added to the agent boundary.

Operational diagnostics should identify the adapter, registration, operation,
and classified outcome without copying raw launch tokens or unrestricted vendor
response bodies into logs. Keep correlation with existing queue and incident
records so extraction does not reduce operational visibility.

### Grade Delivery and Failure Semantics

Preserve the existing outcome categories initially: `superseded`,
`lineitem_dead`, `transient`, `platform_config`, `platform_token`, `rate_limit`,
`malformed`, and `unknown`. Their application meaning belongs to the shared
contract; recognition of Canvas status/body combinations belongs to Canvas.

This follows Byline's error-classification pattern: the adapter classifies
external failures; core decides the application consequence. Core must not
match vendor error strings. Unknown responses must remain observable and follow
the existing failure policy; they cannot silently retire a grade destination
or count as success. Only evidence meeting the declared contract may produce
`superseded` or `lineitem_dead`.

Canvas retains its quota algorithm behind the scheduling contract, with one
policy instance per registration-bound client/processor, as with today's
per-platform `QuotaGovernor`. No state is implicitly shared between
registrations. Cross-registration or cross-process coordination of a vendor's
shared quota bucket is separate work. Another adapter may use different headers
or have no quota telemetry. Core must not require Canvas's remaining/cost
measurements in order to run a worker.
Scheduling advice never permits the adapter to claim work, persist completion,
start its own worker loop, or exceed core's configured limits.

Durable queue semantics remain in core: claim → publish → record under a fenced
lease, meaning a completion can write only while its claim token is still valid.
Retries may repeat a network request; the extraction must not claim exactly-once
remote delivery. Preserve cutoff handling, scope rebinding, stale-completion
rejection, incident ordering, and graceful draining.

## Compatibility and Persistence

The extraction should preserve current Canvas behaviour, except for separately
identified and reviewed fixes. Compatibility includes:

- Existing `/routes/lti/*` endpoints, launch/deep-link pages, state and session
  cookies, redirects, command results, and registered tool URLs. These paths are
  fixed by the host package's route factories; a downstream installation cannot
  relocate them.
- Existing durable resource links and `modulus_*` custom fields. No requirement
  to recreate Canvas assignments or regenerate all developer keys.
- Configured signing keys and key IDs. The current keystore loads keys from
  configuration and is stable across restarts; extraction must not generate new
  identities. Key rotation remains separate work.
- Canvas configuration output, scope requests, term fallback, cutoff precedence,
  role behaviour, and score transport. The current score client sends form data;
  preserve and characterise it as Canvas compatibility behaviour, without making
  that encoding a requirement for every future adapter.
- Existing database identifiers and records for users, activities, scopes,
  registrations, deployments, pending deep links, line items, and queue state.
- The rule that frontend instances never run background jobs; existing admin
  and all-in-one worker lifecycle and shutdown remain authoritative.

Core retains migrations and repositories, including LTI-specific persistence.
Packages do not independently migrate a shared database or start pools. Moving
protocol implementation does not justify renaming tables or splitting transactions.

Configuration is divided by owner: shared protocol settings, Canvas settings,
and core operational policy. Published packages receive these as arguments and
do not read `process.env`. The host package's environment loader is the single
documented mapping from today's environment inputs, and its variable names are
a semver-governed contract for downstream installations. Adapter-specific
settings are passed to the adapter factory in the composition file. Pass only
relevant settings into packages. Tool keys, tokens, and server adapter imports must stay out of
browser bundles.

Token and JWKS caches must be registration-bound, with token scope and signing
identity accounted for where relevant. Startup, credential changes, registration
removal, and shutdown need explicit invalidation/disposal rules. Preserve dynamic
registration discovery by the worker manager; vendor selection remains fixed for
the lifetime of the process.

Concretely, `LtiLaunchService.getPlatformJWKS` currently caches a remote JWKS
resolver by `platform.id` and does not replace it when that registration's
`jwks_uri` changes. Extraction must add configuration-change detection and
replace/dispose affected clients and caches, rather than preserving that stale
resolver. Cover changed JWKS URLs, token endpoints, client IDs, scopes, and
signing keys in cache-lifecycle tests. The worker manager must reconcile changed
registration configuration as well as additions/removals, draining an old client
before using its replacement for new work.

## Migration Between LMSs

Supporting one LMS at a time simplifies runtime composition. It does not make
Canvas and another LMS interchangeable data sources. Issuers, external user
subjects, deployments, terms, resource links, and grade destinations belong to
the source LMS. Changing the adapter cannot reinterpret those values.

### Foundations Required During Extraction

Record the installation's adapter ID and integration-schema version durably and
check them against startup configuration and the build's supported schema
versions. Preserve source-LMS provenance for retained integration records,
either through that binding or explicit migration metadata. This records
ownership; it does not introduce runtime routing among vendors. Exact schema and
the treatment of existing installations are review decisions.

The system must be able to make source registrations and outstanding source
grade work inactive without deleting their history. A mismatch between stored
binding and configured adapter must stop integration startup until a deliberate
migration has been completed. Changing an environment variable alone must never
send Canvas queue entries through another adapter.

The binding check must also gate email relinking. On an LMS change, existing
accounts must not acquire a target issuer/subject through email coincidence.
Core must require an approved identity mapping or a separately authorised
account-linking flow before replacing a source identity. This protection must
be enforced on sign-in, not only in a migration script or boot check. Gate
unsafe relinking while mapping is incomplete, even after the new adapter and
stored binding agree. Test that a first target-LMS launch with the same email
cannot silently overwrite the source identity.

### A Later Migration Workflow

A separate migration specification should define these stages:

| Stage | Required Outcome |
| --- | --- |
| Assess and map | Inventory registrations, identities, activity scopes, links, and outstanding grades; define which records transfer and which remain historical |
| Rehearse | Exercise the target adapter, mappings, and recovery procedure against an isolated restored dataset and target LMS test environment |
| Quiesce the source | Stop new source launches/grade work, drain in-flight requests, then complete, retain as inactive, or explicitly abandon pending deliveries under an agreed policy |
| Preserve and prepare | Back up source state, retain historical associations, create target registrations, and provision target resource links and grade destinations |
| Cut over | Change the durable installation binding and configured adapter together; invalidate source tokens, browser launch state, pending deep links, and protocol caches |
| Validate and resume | Verify target launch, enrollment, grade delivery, and any advertised deep-link capability before normal traffic resumes; retain the agreed recovery window |

There is one active LMS before and after cutover. Validation of the target uses
an isolated environment; simultaneous production operation of both LMSs is out
of scope. Retained source registrations and queue entries must remain ineligible
for target launch resolution and target delivery.

Preserve Modulus user/activity identifiers and historical progress where the
migration policy permits. Target grade destinations must be newly established
and verified. Reusing historical progress for target grades is an explicit
scope/cutoff policy decision, not an automatic replay of the source queue.

The current user record holds one `lti_iss`/`lti_sub` pair. When sign-in cannot
find that pair, it looks up the email and can overwrite the matched account's
pair in `LtiSignInService.signInLti`. The policy and binding guards above must
prevent that path from silently performing a migration. A future migration
still needs an explicit identity mapping and history policy; routine sign-in
must not serve as the migration mechanism. A separate external-identities table
may be appropriate then, but is not required merely to extract Canvas.
Supporting multiple registrations under one issuer is also a separate issue,
not a prerequisite for different installations to use different LMSs.

Rollback has a boundary: before target writes, restoring the source binding and
state may suffice; after target grades or identities have changed, recovery
requires reconciliation. The migration plan must define that boundary and must
not promise a reversible adapter toggle.

## Conformance Strategy

### Lessons From Byline

The reference is the public [Byline repository](https://github.com/Byline-CMS/bylinecms.dev).
The source links below are pinned to the revision examined for this review.
These are architectural precedents, not dependencies to import or instructions
to copy its test runner into Modulus.

| Byline Source | Pattern Applied Here |
| --- | --- |
| [MySQL adapter design](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/specs/2026-07-24-db-mysql-adapter-design.md) | Extract shared behaviour and prove the existing adapter first; deliver the second adapter as a later increment |
| [Database conformance suite](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/db-conformance/src/index.ts), with [Postgres](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/db-postgres/tests/conformance.integration.test.ts) and [MySQL](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/db-mysql/tests/conformance.integration.test.ts) entry points | One behavioural suite, parameterised by adapter-owned factories and lifecycle hooks |
| [Error-classification contract](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/db-conformance/src/classify-error-contract.ts) | Different external failure shapes must produce the same shared classification for the same semantic failure |
| [Search conformance suite](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/search-conformance/src/index.ts) and [its documentation](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/search-conformance/README.md) | Explicit capabilities and a complete aggregate suite for supported adapters; staged subsets are only an implementation aid |
| [Analytics conformance documentation](https://github.com/Byline-CMS/bylinecms.dev/blob/eeb97629b5c2abdfb27f72e2a301a78c846ada35/packages/analytics-conformance/README.md) | Conformance is private test infrastructure and verifies operational semantics, not only interface shape |

The main adaptation is that LMS compatibility involves a remote protocol and a
browser launch flow. Package tests alone cannot prove an LMS integration works.

### Test Ownership and Required Evidence

| Layer | What It Must Prove |
| --- | --- |
| Shared LTI tests | Message construction, signature/issuer/audience validation primitives, replay-port behaviour, signing-key handling, token exchange, standard cutoff parsing and standard-first fallback ordering, and deterministic timeout/error paths |
| Shared adapter conformance | Complete adapter verification path; capability declarations match behaviour; launches produce canonical results and email trust evidence; score outcomes have consistent meaning; issuer/registration association, isolated scheduling state, cache invalidation, and unsupported optional features are explicit |
| Canvas-specific tests | Endpoint defaults, placement/config output, substitution fields, role interpretation, term quality, Canvas cutoff fallback and its precedence after the standard value, error text rules, wire encoding, quota parsing and pacing |
| Core integration tests | Real database nonce consumption; deployment writes only after verified launch; enrollment, identity resolution and email-link policy including migration gating; pending-link ownership/expiry; scope reconciliation; queue fencing, retry/incident persistence, registration isolation, and binding/schema checks |
| Host HTTP tests | Actual login/launch state cookies, replay rejection, session issuance, deep-link flow, interstitial behaviour, endpoint stability, and deployment-mode gates |
| LMS acceptance | A documented instructor/learner exercise against a real Canvas test installation, including visible grade delivery; repeat for each later supported LMS |

The shared suite should accept adapter construction, controlled HTTP responses,
clock, reset, teardown, and independently specified expected capabilities. A
claimed capability must run its full suite; an adapter cannot mark a required
feature unsupported to obtain a pass. Canvas-specific request fixtures remain
adapter-owned, while shared assertions describe observable outcomes.

Use Modulus's existing `node:test` through `tsx` for new server package suites
and core unit tests. Core's PostgreSQL-backed `*.itest.ts` tests also use
`node:test`, run through `tsx --test --test-concurrency=1`. Retain Vitest for
gradebook and agent tests; do not introduce it into core. Migrate relevant
existing tests rather than retaining duplicate suites that can diverge. Keep
SQL races and browser-cookie assertions at their real boundaries instead of
replacing them with mocks.

A deliberately non-Canvas test adapter should prove that core can run without
Canvas custom fields, error messages, or quota headers. This is an architectural
test, not evidence of Moodle or Blackboard compatibility. Synthetic fixtures
must contain no real institutional IDs, learner data, or credentials.

Add dependency/export checks to prevent core importing Canvas or shared LTI
runtime implementations, adapters importing core internals, and browser bundles
importing server packages. Core's shared LTI imports must remain type-only.
Extend the actual CI discovery paths: root `lint:check` currently enumerates
existing source directories, so a new workspace package is not automatically
covered by it.
Ensure the aggregate CI gate executes the new suites and existing session tests.
Include `lti` and `lms-canvas` in the packaging specification's packed-install
smoke test and public-export baseline, so a missing `files` entry, undeclared
dependency, or unreviewed export is caught before publication.

Conformance proves the adapter; it does not prove an installation. Each
downstream installation repeats the LMS acceptance exercise against its own
LMS test environment before go-live. Publish that exercise as a checklist in
`docs/` so it does not depend on knowledge held only in this repository.

## Delivery Strategy and Review Gates

These are reviewable increments, not an approved task breakdown or schedule.

| Increment | Deliverable | Gate Before Proceeding |
| --- | --- | --- |
| Contract review | Approve the explicit runtime boundary, post-verification deployment write, issuer/registration mapping, cutoff ownership, email-link policy, capability baseline, and installation binding | Resolve remaining policy/schema details below before producing a detailed implementation plan |
| Characterisation | Capture existing Canvas behaviour, separate reusable assertions from vendor fixtures, and document known gaps | Existing implementation passes the relevant baseline; behaviour changes are explicitly identified |
| Boundary preparation | Introduce neutral launch/outcome values and injectable protocol, transport, and scheduling boundaries in the existing composition | Canvas behaviour remains stable; core tests can substitute a non-Canvas adapter |
| Package extraction | Move shared protocol and Canvas implementation into their packages; wire the selected adapter in the reference host's composition file | No forbidden imports; Canvas passes full conformance; core database and host HTTP checks pass; the packed-install smoke test passes with `lti` and `lms-canvas` installed from tarballs |
| Operational adoption | Rehearse upgrade and rollback, enable binding/schema and email-relinking checks, document configuration, and run Canvas acceptance | Existing registrations/assignments and queued scores survive the upgrade; reviewed account-linking policy and cache fixes have explicit acceptance evidence |
| Second LMS | Implement one chosen LMS against the reviewed contracts and the same conformance suite | Independent real-LMS acceptance; core has no new vendor-specific branches |

Each increment should be independently reviewable. Do not combine extraction
with a protocol rewrite, identity redesign, database relocation, or general
connector framework. Security or correctness gaps discovered during baseline
work should be recorded and prioritised explicitly; behaviour preservation is
not a reason to label known gaps as correct or standards-compliant.

Carry the scope restriction above verbatim into the implementation plan. The
email-linking guard, cache invalidation, and draining/replacing workers when
registration configuration changes are named exceptions to strict behaviour
preservation and need their own acceptance cases. Today's manager compares
registration IDs only; configuration-change reconciliation is new behaviour.
These exceptions do not authorise a general identity or protocol redesign.

For the extraction rollout, prefer additive persistence changes and retain
compatibility with the prior Canvas deployment through a defined rollback
window. Stop and drain workers during a cutover where mixed binaries would
interpret integration state differently. Do not reset leases, retry counters,
or submitted progress merely because implementation classes moved packages.
Document which integration-schema versions each build can read/write and stage
schema changes accordingly. A legacy build that predates binding or email-policy
checks must be stopped before relying on those checks; a stored version cannot
enforce a guard that the old executable does not implement.

Contract-review note: Drizzle's migration journal records which database
migrations ran; the integration-schema version declares how a build interprets
persisted integration state. Any change to the meaning, ownership, eligibility,
or processing of persisted LTI or queue data must bump the integration-schema
version, including a code-only interpretation change with no new table or
column. A migration that adds unused storage or an index without changing those
semantics need not bump it, but must record that rationale. Each relevant change
must state its old/new integration-schema versions, associated Drizzle migration
if any, supported reader/writer builds, and rollout order in the same review.
The two mechanisms are coordinated; their version numbers need not match.

## Completion Criteria

The extraction is complete when Canvas functionality resides behind the proposed
package boundaries, the installation selects one adapter explicitly, and core
contains no Canvas-specific endpoint generation, claim parsing, response matching,
or quota algorithm. Canvas references in fixtures, historical documentation, and
compatibility command names are not evidence of an architectural leak.

Existing Canvas registrations, links, launches, and grade delivery must continue
to work, with the same privacy boundary and durable queue guarantees. Shared
conformance, Canvas-specific tests, core integration tests, host HTTP tests, and
real Canvas acceptance must all provide evidence. The selected adapter and stored
installation binding must agree, all processes must support the stored
integration-schema version, and historical source work must have a defined
inactive state for a later LMS migration. Email-link policy must prevent an
untrusted claim or a first target-LMS launch from silently taking over or
re-pointing an existing account. Core must call only the adapter at the runtime
integration boundary, and deployment writes must follow verified launch return.

Preparation for another LMS is complete when a non-Canvas test adapter exercises
core without vendor assumptions and the next real adapter has a clear contract
to implement. It does not mean that any untested LMS is supported, or that a
production LMS migration tool has been delivered.

## Trade-Offs and Alternatives

**Move all existing LTI code into Canvas.** This provides a quick package boundary
but embeds user/session policy and queue persistence inside a vendor package.
Other LMSs would then duplicate LTI or depend on Canvas. The proposed split costs
more initial boundary work and avoids that dependency.

**Keep shared LTI implementation in core.** This reduces the package count, but
makes reuse by independent adapters difficult and encourages imports from core
internals. A small shared protocol package provides a clearer dependency graph.

**Build a vendor-neutral plugin platform immediately.** Dynamic discovery,
multi-vendor routing, and a broad non-LTI API introduce scope without serving
the one-LMS-per-installation requirement. Explicit server composition is enough.

**Build Moodle or Blackboard during extraction.** A second implementation is
valuable evidence, but combining it with relocation obscures the cause of
regressions. Stabilise Canvas first, then use one real second adapter to refine
the contract. Do not generalise solely from the synthetic adapter.

## Honest Notes & Open Questions

### Decisions Recorded 2026-10-28

- **Packages:** `@modulus-learning/lti` and `@modulus-learning/lms-canvas` as
  separate packages, both joining the lockstep set, with a private
  `lms-conformance` test package. The contract stays LTI-specific.
- **Email-based account linking:** keep automatic linking for the configured
  Canvas registration, scoped: it never re-points an account that already has a
  different LTI identity, and the adapter records the trust basis as
  registration-trusted. This closes the overwrite case without stranding users
  who first signed in with Google or GitHub. The migration-gating requirement in
  [Migration Between LMSs](#migration-between-lmss) still applies.
- **Order:** the installation guide and a prerelease of the current packages
  come first; this extraction follows, and stable publication waits for it. The
  adapter becoming a required `initCore` input is therefore a planned breaking
  change for prerelease consumers.

The remaining items below are still open.

The runtime boundary, post-verification deployment write, retained issuer
uniqueness, standard-first cutoff ownership, per-registration scheduling, and
required launch/score baseline are now explicit design proposals above. Contract
review should approve or revise them before implementation, rather than leave
these choices to the implementer. The remaining details to settle are:

- **Contract placement and naming:** accept `lti`, `lms-canvas`, and
  `lms-conformance`, and confirm the shared package owns contracts for LTI-based
  adapters rather than a universal LMS API. Published npm names are effectively
  permanent, so settle them before the first prerelease.
- **Sequencing with packaging:** the packaging specification recommends
  completing this extraction before stable publication. A prerelease before
  the extraction is possible; the adapter becoming a required `initCore` input
  is then a planned breaking change.
- **Installation binding:** choose the additive schema for adapter ID and
  integration-schema version, the supported-version rollout rules, the legacy
  Canvas backfill, and the representation of inactive registrations and retained
  source work. Boot and sign-in enforcement are required, not optional follow-ups.
- **Optional capabilities:** confirm how the host handles an adapter without
  deep linking, term metadata, or generated registration configuration. Canvas
  retains its current features; launch and score publication remain required.
- **Verification and account-linking gaps:** review nonce context/lifetime,
  `azp` handling for multiple audiences, target-link checks, clock tolerance,
  and trusted outbound destinations. Also review email lookup followed by
  `lti_iss`/`lti_sub` overwrite as an account-takeover risk if a platform can
  assert arbitrary emails. Approve the adapter's evidence model, core's linking
  policy, and the legacy Canvas transition; do not infer email trust from a
  valid launch signature. These are review topics, not claims of protections
  the current code already implements.
- **Deployment admission policy:** retaining auto-registration after verification
  preserves today's behaviour; decide whether a later deployment allowlist is
  needed. Its persistence owner and position after verification are already
  specified above.
- **Compatibility command:** retain `generateCanvasConfig` as a delegating
  wrapper during extraction; decide when to add a vendor-neutral registration
  configuration command without breaking the existing admin flow.
- **Metadata and transport:** confirm role mapping, term fallback, cutoff date
  acceptance rules, and Canvas score encoding from baseline tests and acceptance.
  Do not assume Moodle or Blackboard supplies equivalent metadata.
- **Migration scope:** agree that this extraction supplies binding, provenance,
  deactivation, and email-relinking guards, while identity mapping, historical scope
  transfer, target-link provisioning, and production cutover tooling need a
  separate migration specification.
- **Second LMS:** choose Moodle or Blackboard based on an actual deployment
  requirement and access to a representative test environment. The target's
  version, configuration, and supported LTI features must be established then.

Implementation planning should follow this review. No package creation,
publication, runtime change, schema migration, or new LMS support is authorised
by the existence of this draft alone.

## Where to go next

- [Modulus Packaging and Distribution](./2026-10-28-modulus-packaging-and-distribution-spec.md)
  defines the published package set, host package, release process, and
  downstream installation model this extraction fits into.
- [Documentation Overview](../docs/DOCUMENTATION-PLAN.md) records this draft and
  distinguishes the available proposal from planned implementation/reference work.
- [Architecture](../docs/ARCHITECTURE.md) explains the core boundary and the
  separation between LMS connectivity and activity instrumentation.
- [Core Composition](../docs/CORE-COMPOSITION.md) describes the typed registry
  and commands facade that will receive the selected adapter.
- [LTI](../docs/LTI.md) describes the existing integration flows; implementation
  details should be checked against source when refining this draft.
- [LTI Score Submission](../docs/LTI-SCORE-SUBMISSION.md) explains queue,
  retry, lease, and incident behaviour that extraction must preserve.
- [Testing Strategy](../docs/TESTING.md) describes the package, database, and
  host HTTP test boundaries.
- [Security & Privacy](../docs/SECURITY-AND-PRIVACY.md) explains the activity
  data-isolation constraint that applies to every LMS adapter.
