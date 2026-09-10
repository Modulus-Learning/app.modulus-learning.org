---
title: "Activity URL Canonicalization Analysis"
path: "activity-url-canonicalization-analysis"
summary: "The agreed design for canonical activity URL identity across registration, lookup, OAuth, cumulative progress, deep linking, and activity-code editing, including normalisation rules, instructor validation, staging assumptions, deferred near-match detection, and the known direct-launch URL limitation pending a stakeholder decision."
---

# Activity URL Canonicalization Analysis

Date: 2026-09-07
Updated: 2026-09-10
Status: canonicalisation design approved; direct-launch URL transport decision deferred pending stakeholder discussion, with known unsupported paths; implementation remains separate work

This analysis records the agreed design for canonicalising activity URLs so
that equivalent inputs resolve to one Modulus activity. It defines a standalone
feature covering activity identity, registration, lookup, and instructor input
validation, and is intended for implementation planning and review. It does not
itself authorise implementation or data changes.

The canonicalisation rules remain agreed. Review on 2026-09-10 identified a
separate limitation in direct-launch URL transport: some valid canonical URLs,
especially those with a non-root trailing slash, cannot launch correctly through
the current direct-link format. The replacement format is deferred pending
stakeholder discussion, as described under
[Deferred Direct-Launch URL Transport](#deferred-direct-launch-url-transport).

The [activity URL allowlist analysis](./2026-09-02-activity-url-allowlist-analysis.md) deliberately
left activity identity normalisation unresolved. Its admission-only policy
remains the baseline: an **activity** is a row in `activities`, an **activity
code** groups activities for instructional use, and the **allowlist** decides
whether an unseen activity may be registered. **Grandfathering** means an
existing activity remains usable regardless of later allowlist changes. The
[data model](../docs/DATA-MODEL.md) describes the records and their relationships.

## Problem

Modulus currently allows URL spelling to determine which activity receives
progress. For example, these strings can identify separate rows even though the
platform URL parser serialises them identically:

| Submitted URL | Canonical Stored URL Under This Design |
| --- | --- |
| `HTTPS://CONTENT.TEST:443/course/lesson` | `https://content.test/course/lesson` |
| `https://content.test/course/./lesson` | `https://content.test/course/lesson` |
| `https://content.test/course/unit/../lesson` | `https://content.test/course/lesson` |

The consequences extend beyond duplicate records. An instructor can register one
spelling while the browser agent authenticates against another, splitting
progress and page state between activity IDs. A cumulative target can miss its
existing activity or evade the self-reference check by resolving to a newly
created duplicate. A spelling variant of a grandfathered URL can also be denied
as unseen when the original spelling would succeed.

The allowlist itself already handles the scheme, host, default port, and dot
segment examples above. The gap is between policy comparison and database
identity, rather than an absence of URL parsing throughout the system.

## Current Implementation

The following findings describe the implementation inspected on 2026-09-07,
rather than the implementation plan's historical status text.

| Surface | Current Behaviour | Source |
| --- | --- | --- |
| Allowlist parsing and matching | `new URL()` parses candidates; rules compare parsed origins and segment-bounded paths. Query and fragment do not affect admission. | `packages/core/src/modules/activity-registration/url-policy.ts` |
| Shared registration | `register()` looks up, length-checks, inserts, and re-reads the submitted string. Its comment explicitly defers canonicalisation. | `packages/core/src/modules/activity-registration/services/activity-registration.ts` |
| Database identity | `activities.url` is a unique `varchar(255)`; registration uses equality and `onConflictDoNothing` against that column. | `packages/core/src/database/schema/source/activities.ts`; `packages/core/src/modules/activity-registration/repository/index.ts` |
| Agent OAuth | `createAuthCode()` registers `redirect_uri`; `claimAuthCode()` checks the stored protocol values exactly, then looks up the activity using the supplied `redirect_uri`. | `packages/core/src/modules/agent/auth/services/agent-auth.ts` |
| Cumulative progress | Writes use registration and compare the resulting ID with self. Additional reads use a separate exact URL lookup. Duplicate targets are rejected only when their submitted strings are identical. | `packages/core/src/modules/agent/activity-state/services/progress.ts`; `packages/core/src/modules/agent/activity-state/schemas.ts` |
| Instructor activity-code forms | Host actions trim lines and prefixes; validators use regular expressions and raw `startsWith()`. Core sorts and deduplicates raw URLs before registering them. | `apps/gradebook/src/modules/app/activities/`; `packages/core/src/modules/app/activities/services/activity.ts` |
| Learning Tools Interoperability (LTI) deep linking | `handleDeepLink()` checks a raw per-code prefix, registers the input, then writes the input spelling into `modulus_activity_url`. | `packages/core/src/modules/app/lti/services/deep-link.ts` |
| Subsequent launches | LTI launch and direct activity start resolve an incoming activity URL through `findActivityByURL()`, which uses database equality. | `packages/core/src/modules/app/lti/services/launch.ts`; `packages/core/src/modules/app/activities/services/start-activity.ts`; `packages/core/src/modules/app/activities/repository/index.ts` |

The browser agent is a qualification to the statement that inputs are always
raw. Its `getOAuthRedirectUri()` already serialises a browser URL and removes
the entire query and fragment:

```ts
// apps/agent/src/core/auth.ts
const getOAuthRedirectUri = () => {
  const location = new URL(window.location.href)
  location.search = ''
  location.hash = ''
  return location.toString()
}
```

This makes disagreement between browser-produced and instructor-authored URLs
more likely. The query/fragment policy agreed below brings activity identity
into line with this agent behaviour; current storage behaviour is not a
previously settled product contract that the new design must preserve.

## Separate The Three Comparisons

A **canonical activity URL** is the single stored spelling that Modulus uses to
resolve an activity. Canonicalisation defines an equivalence relation: two
inputs refer to one activity exactly when they produce the same canonical
string. It does not prove that two different URLs serve different content, or
that two equivalent strings will always receive identical server responses.

Three existing uses of URLs require different contracts:

| Purpose | Comparison | Query And Fragment |
| --- | --- | --- |
| Activity identity | Equality of canonical activity strings | Always exclude both components |
| Sitewide admission | Match an unseen activity URL against the allowlist's exact origin and path-subtree rules | Absent from rules and the canonical activity URL; the matcher considers only origin and path |
| OAuth request binding | Compare token-exchange parameter values with the values saved from the authorisation request, using exact equality | Preserve the original protocol values for this comparison; do not compare them with `activities.url` |

An allowlist rule admits many activities. Its representation is therefore not
an activity identity: `normalizeRuleBaseUrl()` strips trailing path slashes as
well as query and fragment. Although the query/fragment treatment now agrees,
reusing that helper as the activity normaliser would also merge distinct paths.

OAuth is different again. Its token request must carry the same `redirect_uri`
value as the authorisation request. Canonical activity equality must not weaken
that protocol check. This follows [RFC 6749, Section 4.1.3](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.1.3).

The original OAuth parameter value and the canonical activity lookup key have
separate purposes. Removing query and fragment for activity lookup does not
remove them from the saved protocol value or make an altered token-exchange
value acceptable. This row describes request binding, not callback syntax
validation or comparison with pre-registered OAuth callback URLs. It does not
add a rule rejecting query-bearing callbacks merely because canonical activity
URLs contain no query. General callback-handling changes are outside this
normalisation work.

## Agreed Normalisation Profile

Use the platform's WHATWG `URL` parser without a base URL, clear `search` and
`hash`, and store the resulting `href` serialization. Excluding query and
fragment is an agreed Modulus activity-identity rule. Use WHATWG serialization
alone for the remaining components, with the residual distinctions below
documented rather than adding further equivalences.
Node's `URL` API implements the same standard as browsers; the standard defines
URL equality through serialization. See the
[Node URL documentation](https://nodejs.org/api/url.html#the-whatwg-url-api)
and [WHATWG URL equivalence](https://url.spec.whatwg.org/#url-equivalence).

Instructor input requires a separate check before clearing those components:
their presence is a validation failure, not an invitation to silently correct
the supplied URL. Identity resolution and input acceptance have different jobs.

The profile must be deterministic, idempotent, and independent of network
access, the current user, the academic scope, and the allowlist snapshot.
Applying it twice must produce the same result as applying it once.

### Transformations To Adopt

The examples below were checked with the local Node v24.19.0 runtime, using
`URL` serialization and explicitly clearing query and fragment for identity.
They are not claims that Modulus already stores these values. Inputs containing
query or fragment illustrate identity resolution; instructor submissions of
those inputs must be rejected instead.

| Input | Canonical String | Effect |
| --- | --- | --- |
| `HTTPS://CONTENT.TEST:443/lesson` | `https://content.test/lesson` | Lowercase scheme and host; remove HTTPS default port |
| `http://localhost:80/lesson` | `http://localhost/lesson` | Remove HTTP default port; admission still requires a matching rule |
| `https://content.test:8443/lesson` | Same string | Retain a non-default port |
| `https://content.test` | `https://content.test/` | Supply the root path |
| `https://content.test/a/../lesson` | `https://content.test/lesson` | Resolve dot segments |
| `https://content.test/a/%2e%2e/lesson` | `https://content.test/lesson` | Resolve parser-recognised encoded dot segments |
| `https://bücher.example/` | `https://xn--bcher-kva.example/` | Serialise an internationalised domain in ASCII |
| `https://content.test/é` | `https://content.test/%C3%A9` | Encode a Unicode path character |
| `https://content.test/lesson?foo=bar&blah=17#scroll-to-here` | `https://content.test/lesson` | Exclude query and fragment from activity identity |
| `https://content.test/lesson?` or `https://content.test/lesson#` | `https://content.test/lesson` | Exclude empty components from activity identity too |

These transformations retain the existing allowlist parser's origin and path
interpretation; admission already ignores query and fragment. No independent
lowercasing or path-rewriting implementation is needed.

### Distinctions To Preserve

Under the agreed profile, preserve the following distinctions:

| Examples | Reason |
| --- | --- |
| `/Lesson` and `/lesson` | Path case can identify different resources |
| `/lesson` and `/lesson/` | A non-root trailing slash can change routing and relative-link resolution |
| `/a//b` and `/a/b` | Repeated path separators can have application meaning |
| `/lesson` and `/lesson/index.html` | An index-document alias is a server convention |
| `http://localhost/lesson` and `https://localhost/lesson` | Different schemes remain different origins |
| `content.test`, `www.content.test`, and `content.test.` | Do not infer host aliases or strip a trailing domain dot |
| `/a%2Fb` and `/a/b` | Do not decode a reserved separator into path structure |

Do not follow redirects, resolve DNS aliases, inspect HTML canonical links,
or infer equivalence from content. Those choices depend on a publisher's routing
and application semantics. A false merge would
combine learner progress and page state, making it more consequential than a
missed spelling equivalence. Queries and fragments are excluded in their
entirety under the authoring contract below; no parameter-by-parameter
classification or tracking-parameter detection is needed.

### Percent-Encoding Is A Deliberate Limit

`new URL(value).href` is not a complete implementation of every RFC 3986
normalisation. In particular, it preserves existing percent-escape case in a
path and does not generally decode unreserved path characters. Thus
`/%7euser`, `/%7Euser`, and `/~user` remain distinct under this design.

[RFC 3986, Section 6.2.2](https://www.rfc-editor.org/rfc/rfc3986.html#section-6.2.2)
describes uppercasing percent-escape hex digits and decoding escapes for
unreserved characters. Review chose not to add those equivalences. Such an
extension would require component-aware processing, matching changes for
allowlist paths and rule collisions, and more equivalence tests. Decoding the
complete URL with `decodeURIComponent()` is unsuitable because it can turn
escaped delimiters into URL structure.

Use WHATWG serialization and document this limit. Do not describe the result
as merging every standards-equivalent URL. Additional RFC-style percent
normalisation is outside this feature.

### Parsing Does Not Mean Admission

Keep normalisation independent of the allowlist and its syntactic admission
restrictions. Parsing, excluding query/fragment, and serialization determine a
lookup key; `parseAdmissibleUrl()` continues to decide whether an unseen URL
has an acceptable scheme and no credentials. Never strip credentials to make
an input admissible.

This distinction preserves grandfathering for a parseable stored URL that
would not pass today's admission syntax. Running `parseAdmissibleUrl()` before
every existing-activity lookup would introduce a new rejection gate. OAuth's
separate redirect safety check remains in place regardless of grandfathering.

The platform parser also repairs some inputs: missing slashes after a scheme,
backslashes in HTTP(S) paths, and certain whitespace or numeric host spellings.
For example, local checks serialised `https:content.test/lesson` as
`https://content.test/lesson` and `http://127.1/` as `http://127.0.0.1/`.
It can preserve malformed percent escapes such as `%zz`. These behaviours
already affect `parseAdmissibleUrl()`; normalisation must not be presented as a
new strict URL validator. The [WHATWG parsing rules](https://url.spec.whatwg.org/#url-parsing)
distinguish validation errors from parser failure. Tightening that accepted
syntax is a separate decision.

## Query And Fragment Policy

The following decisions were agreed on 2026-09-08. They replace this draft's
earlier recommendation to preserve full-URL identity and treat the agent's
behaviour as a limitation to resolve separately.

### Activity Identity And The Authoring Contract

A canonical activity URL never contains a query string or fragment. All URLs
with the same normalised origin and path identify one Modulus activity. For
the same learner in the same academic scope, navigating from `/lesson` to
`/lesson?foo=bar&blah=17#scroll-to-here` must retain access to the same progress
and page state. The query and fragment do not create another activity,
contribution target, or independent grading identity.

Content authors must ensure that progress has the same meaning and saved page
state is mutually compatible across those URL variants. Query parameters and
fragments may influence navigation or presentation, but must not select
independently tracked activities. Separately graded exercises such as
`?exercise=17` and `?exercise=18`, or separate lessons selected by fragment
routing, require distinct paths to be separate Modulus activities.

This is a Modulus authoring contract, not a claim about arbitrary web resources.
Generic URI syntax permits queries to participate in resource identification;
Modulus deliberately supports a narrower activity model. See
[RFC 3986, Section 3.4](https://www.rfc-editor.org/rfc/rfc3986.html#section-3.4).
The service cannot establish content or page-state compatibility by inspecting
a URL, so the contract must be documented for content authors.

### Instructor Input Must Be Rejected Explicitly

During LTI deep linking and activity-code creation or editing, an
instructor-supplied activity URL containing a query or fragment is invalid.
Reject it with a field-level warning that explains the unsupported components
and asks the instructor to supply the activity URL without them. Preserve the
entered value so the instructor can inspect and correct it. For example:

> Activity URLs cannot include query strings or fragments. Supply the activity
> URL without these components; Modulus does not currently support custom
> launch parameters.

Do not silently remove the components, save a corrected value, or offer to
proceed with the original URL. This validation applies even when its
query-free and fragment-free identity already exists. It validates the
instructor's requested operation rather than revoking an existing activity.
Activity-code submissions remain all-or-nothing; a rejected URL must not leave
other new activities, code changes, or associations committed.

Detect component presence before the identity helper clears it, including an
empty query or fragment introduced by a trailing `?` or `#`. Checking only
whether `URL.search` or `URL.hash` is non-empty misses those cases. An encoded
`%3F` or `%23` inside a path is not a query or fragment delimiter and must not
be rejected on that basis. Enforce the rule at the relevant core command
boundaries as well as providing host form feedback.

Explicit rejection prevents an intentional launch option from disappearing
without explanation. Instructor reports of blocked use cases can inform a
later launch-parameter feature; this change adds no automatic collection of
the rejected URL or its parameter values.

### Browser Location And OAuth

Keep the agent's existing separation between activity identity and browser
location. It authenticates with query and fragment removed from its callback
URL, while preserving the learner's query and fragment locally across the
OAuth round trip. Restoring that location must not change the activity ID used
for progress or page state.

Modulus's own `modulus` and `scope_id` launch parameters remain transport
values; they are not part of activity identity. Excluding `scope_id` from the
URL key does not remove the existing academic-scope boundary on stored data.
The instructor input restriction does not prohibit the agent from running on
a page whose current location contains query or fragment components.

### Instructor-Configured Launch Parameters Are Deferred

A future feature could attach query and fragment values to an LTI resource
link or direct launch request, then combine them with a canonical activity URL
when launching. Those values would belong to the particular link, not the
shared activity record. The activity's progress and page state would still be
shared under the identity contract above.

That feature has no current requirement and is deferred. This change adds no
separate authored launch destination or mechanism for forwarding instructor
query/fragment components. Modulus launches the stored canonical activity URL
with its own transport parameters, while the agent continues preserving a
learner's existing browser location during authentication.

If the feature is revisited, it must account for direct-link encoding,
immediate and interstitial launches, transport-parameter precedence, and actual
navigation behaviour after OAuth. The current agent restores the address with
`history.replaceState()`; that does not fetch query-dependent server content
or by itself guarantee fragment scrolling.

## Deferred Near-Match Detection

Review considered warning an instructor when a new URL differs from an existing
activity only by path case, a trailing slash, or a terminal `/index.html`.
These differences remain outside canonical equivalence. An advisory check
could compare URLs on the same normalised origin, explain the difference, and
let the instructor choose an existing URL or retain the entered one before
registration. It would never merge records or establish an identity alias.

Such a check could prevent accidental duplicates across instructors and time,
but an already-registered URL is not necessarily the correct destination.
Furthermore, if `/lesson` redirects to `/lesson/`, the agent authenticates at
the final browser path. Selecting the existing spelling does not resolve that
identity mismatch. Similarity alone provides no evidence about publisher
routing or which address should receive progress.

The check would also introduce false-positive warnings, another review step
for bulk submissions, and a decision about exposing globally registered URLs
as suggestions. These costs are unnecessary for establishing normalisation.
Near-match detection is therefore deferred, including its user interface and
candidate-search machinery. This change adds no similarity warnings,
network-based equivalence discovery, or automatic fallback to a similar URL.
Publisher redirects remain a separate identity concern; normalisation does
not follow them or claim to resolve them.

## Apply One Contract Across Every Path

### Core Ownership And Storage

Introduce one pure, dependency-free core normalisation helper, colocated with
the activity-registration URL utilities. The eventual name and return type
belong in the implementation plan; no such helper exists today. It should
return a canonical string or a parse failure and retain no mutable shared
`URL` object. Host validation can consume an exported pure helper, following
the existing `isUsableRedirectUri` precedent.

The agent activity-state schema may import this helper directly for canonical
duplicate detection. This is a dependency on pure URL utilities, not on the
registration service or admission policy; the helper may live in a sibling
file to `url-policy.ts` without changing that ownership.

Store the canonical string in `activities.url`. Keep database equality and the
existing unique constraint; normalise URL lookup arguments before they reach the
four repositories that currently resolve activities by URL. Do not add
case-insensitive SQL matching: lowercasing an entire URL would merge paths
that should remain distinct. A second raw/canonical column pair
or alias table is unnecessary for this design.

Registration should parse and normalise, resolve the canonical key, return an
existing row without policy evaluation, then length-check and evaluate an
unseen URL before inserting that same key. The conflict re-read must use the
same canonical key. Two concurrent spelling variants then contend on the same
unique value and resolve to one winning activity ID.

The instructor-only component-presence check must run before this shared
normalisation flow discards query and fragment. Other identity lookups use the
same component-free key without acquiring the instructor form restriction.

Apply the 255-character column limit to the canonical string that will be
stored. An input can shrink through default-port or dot-segment removal, or
grow through Unicode encoding. Preserve the submitted string separately for
field-error correlation. Parser failure remains `malformed_url`, an oversized
canonical URL remains `url_too_long`, and a policy denial remains
`activity_url_not_allowed`. Instructor query/fragment rejection is a distinct
input-validation outcome, not an allowlist denial; its message must not direct
the instructor to request allowlist access. General request-size limits are a
separate concern.

### OAuth Authorisation And Token Exchange

Use the canonical activity key for registration during `createAuthCode()` and
for the activity lookup during `claimAuthCode()`. Keep the received `client_id`
and `redirect_uri` values unchanged in the authorisation-code record. The
normal agent supplies both without query or fragment. Canonicalisation for
activity lookup must not rewrite protocol values supplied by other callers
before the existing exact checks.

Keep both existing exact comparisons at token exchange, as well as the
authorisation route's `client_id === redirect_uri` check. A caller that
authorises with an explicit `:443` and exchanges with the port omitted must
still fail the protocol check even though both strings identify one activity.
An exchange that repeats the original spelling exactly should succeed and
resolve the canonical activity.

Token exchange must not register an activity or re-evaluate the allowlist.
Normalisation changes activity resolution, not authorisation-code lifetime,
Proof Key for Code Exchange (PKCE), scope checks, or token binding to an
activity ID. The [authentication reference](../docs/AUTHN-AUTHZ.md) describes
those contracts.

### Cumulative Progress

Normalise both additional progress-read URLs and cumulative-write targets.
Query or fragment variants resolve to the same target; the instructor-only
validation restriction does not apply to these requests.
Reads must remain side-effect-free: an unknown or unparseable target produces
no activity and no policy evaluation. Preserve the requested URL spelling in
`others[].url` and `rejected_targets[].url` so consumers can correlate responses
with their submitted targets.

Duplicate read inputs are intentionally allowed, including identical strings
and different spellings of one canonical activity URL. Return one `others`
entry for each successfully resolved input occurrence, in input order and with
its submitted spelling; continue omitting unknown or unparseable targets.
This differs from duplicate writes because reads correlate results with inputs,
whereas duplicate contribution targets could apply multiple contributions to
one activity. This feature adds no read-duplicate rejection or response
deduplication.

Keep the self-reference check on the resolved activity ID. A target that differs
from self only by a normalised spelling, query, or fragment must resolve to self
and receive `self_reference`, with no additional activity, contribution event, or line-item
update. Other admitted targets and self progress retain the existing transaction
semantics described in [Cumulative Progress](../docs/CUMMULATIVE-PROGRESS.md).

Canonical duplicates follow the existing request-validation contract. Today two
identical target strings invalidate the request at schema validation. After normalisation,
`HTTPS://CONTENT.TEST:443/total` and `https://content.test/total` must not each
apply `delta × factor` to the same activity. The same requirement applies to
`/total?source=one` and `/total?source=two#summary` on the same origin.

Extend the existing refinement on the `increments_for_other_pages` field of
`setProgressSchemas.input` in
`packages/core/src/modules/agent/activity-state/schemas.ts`; keep the check in
schema validation rather than moving it to the progress service. Use the shared
pure normalisation helper only to derive comparison keys, leaving the submitted
URL strings unchanged. The command wrapper must reject duplicates before the
handler runs, including before token refresh and any progress writes.

Preserve `ERR_VALIDATION`, the Zod issue path `increments_for_other_pages`, and
the existing message `increments_for_other_pages contains duplicate target URLs`.
The HTTP response remains status 400 with
`{ "status": "error", "code": "ERR_VALIDATION" }`. Do not sum factors or choose
one target. This is distinct from per-target admission and self-reference
rejections, which continue allowing valid progress to commit.

Retain rejection of identical raw target strings, including malformed strings,
then detect canonical duplicates among successfully parsed URLs. Distinct
malformed URLs must not become duplicates merely because the normaliser returns
the same parse-failure value for both. Invalid URL parsing remains a per-target
outcome unless the request already violates the duplicate contract. A future
change making duplicates per-target rejections needs its own choice about
conflicting factors and response reasons.

### Instructor Activity-Code Creation And Editing

Reject any submitted activity URL containing a query or fragment before
registration, even if the canonical activity is known. Identify the affected
lines and leave the submitted values available for correction. Once that
validation passes, normalise before deduplicating and sorting the set. Sorting
raw variants and then normalising during insertion no longer guarantees a common
database lock order across overlapping transactions. Canonical sorting retains
the existing deadlock-avoidance intent.

Associate each resolved activity ID only once. Keep submitted-line mappings so
denials identify the instructor's input, and retain all-or-nothing transaction
behaviour for code changes, new registrations, and associations. Display stored
canonical URLs after a successful save.

The host's current regular expressions reject some parseable variants, including
uppercase schemes, before core receives them. Client feedback and server actions
must use the agreed parsing contract if those variants are to work through the
instructor forms.

The optional per-code `url_prefix` remains an independent curriculum constraint.
Require prefixes to contain no query or fragment too, then normalise the prefix
and candidate before applying the
existing string-prefix comparison. A query-bearing prefix cannot constrain
canonical activity URLs under the agreed identity rule. Reject such a prefix
with a field-level warning before stripping components, so that its constraint
is not silently broadened. Preserve authored non-root trailing slashes; an
origin-only prefix gains `/` through serialization. Do not reuse the allowlist's
subtree normaliser or silently change this field to segment-subtree semantics.
Apply the same comparison in host validation and deep linking; moving prefix
enforcement into core is not required by this analysis.

### Deep Linking And Subsequent Launches

Reject an instructor's deep-link input containing query or fragment before
registration or association and before building a signed content item. The
warning must remain distinct from a sitewide-policy denial and preserve the
input for correction.

After registration, write `outcome.activity.url` into the durable
`modulus_activity_url` custom field. Build `window.targetName` as
`modulus-${activity_code}-${outcome.activity.id}`, using the activity code's
resolved public code and the resolved activity ID instead of the submitted URL.
This makes the window target independent of URL spelling while retaining a
distinct name per activity code and activity. It does not select an activity-ID
format for direct-launch links; that transport decision remains deferred.
Keep the content item's top-level launch URL pointed at Modulus's LTI endpoint.

Normalise incoming activity URLs for both LTI resource-link launch and direct
`startActivity()` lookup. Continue taking the actual launch destination from
the resolved record, without copying query or fragment components from the
incoming value into that destination. Forwarding those components would be the
deferred launch-parameter feature. A new canonical writer with old raw readers
would leave valid spelling variants unable to launch or authenticate.

With these changes, the launch readers and agent authentication will use the
same activity identity contract without query or fragment. The direct-launch
route can still lose significant path characters before its reader receives
the URL; the deferred transport issue below limits which URLs can reach that
reader intact. Activity-code membership checks and academic-scope resolution
retain their existing meanings.

### Deferred Direct-Launch URL Transport

A **direct launch** is the non-LTI route through
`apps/gradebook/src/app/[lng]/(forms)/start-activity/[...go]/page.tsx`.
The activity list currently builds its public links as
`{modulusServerUrl}/{activityCode}/{activityUrl}` in
`apps/gradebook/src/modules/app/activities/components/activities-view.tsx`.
Middleware directs these links into `start-activity`, and
`extractActivityLaunchParameters()` reconstructs the activity URL from route
segments in `apps/gradebook/src/modules/app/activity/launch-url.ts`.

Embedding the activity URL in Modulus's pathname exposes it to outer-path
normalisation. Next.js collapses repeated slashes before application middleware
and, with the current configuration, removes trailing slashes. The extractor
restores the known `//` after the scheme but cannot recover significant slashes
lost from the activity path. Canonicalising the reconstructed URL does not
recover that information either.

| Activity Path | Canonical Path | Current Direct-Link Limitation |
| --- | --- | --- |
| `/lesson/` | `/lesson/` | The trailing slash is lost; lookup receives `/lesson`, a different activity identity |
| `/a//b` | `/a//b` | The repeated slash is collapsed; lookup receives `/a/b`, a different activity identity |
| `/foo/../bar` | `/bar` | Dot segments are already removed by the agreed canonicalisation rules; preserving them in transport is unnecessary |
| `/` | `/` | The outer trailing slash is lost, but the proposed lookup normalisation restores the activity's root slash |

URLs with a non-root trailing slash will not launch correctly through the
current generated direct links until this transport issue is fixed. Repeated
slashes have the same limitation, although the maintainer does not expect them
in production; trailing slashes are the likely practical case. If the altered
URL has no activity record, lookup fails. If it identifies another registered
activity, lookup can select that activity instead. These URLs remain valid
under the agreed identity rules; the limitation belongs to direct-link
transport and does not impose the same restriction on LTI launches.

Review on 2026-09-10 accepted deferring the replacement format and its
implementation pending stakeholder discussion. Two acceptable candidates
remain open; neither has been selected:

- **Carry the activity URL in a query parameter.** An encoded parameter on the
  Modulus launch URL preserves the activity URL without making it part of the
  outer path. Links can still be constructed from an activity code and URL.
  This would require preserving the parameter through locale redirects and
  sign-in; `withCurrentPath` currently captures only the pathname. A Modulus
  transport parameter does not permit query strings in the activity URL itself.
- **Carry an activity ID in the path.** Resolve the stored destination by ID
  while retaining the direct-launch activity code and enrollment behaviour.
  Generated links avoid transporting the activity URL, but constructing a link
  requires the ID as well as the code.

Canonicalisation implementation may proceed with this known limitation. This
analysis does not select or implement a replacement route, collapse repeated
slashes, or remove non-root trailing slashes from activity identity. The later
transport fix must verify generated links through actual routing, locale
redirects, and sign-in; extractor-only tests cannot detect information lost
before the page receives its parameters.

## Existing Data And Grandfathering

The maintainer confirmed on 2026-09-08 that there are still no live deployments
and reported inspecting the staging activity URLs. A few URLs without the root
trailing slash and a small number of mistyped URLs will be deleted separately
from this feature. The remaining activity URLs are already canonical and have
no duplicates. This is the maintainer's reported audit, not a database inspection
performed for this document.

There is no staging-data issue for this analysis to resolve. Do not add a
backfill, offline rewrite, collision-merge procedure, reset/reseed workflow,
compatibility bridge, or raw-lookup fallback. The separately handled cleanup
does not become an implementation task or acceptance gate in this feature.
Seeds and test fixtures must still use canonical activity URLs because they
bypass the runtime writer.

Grandfathering remains the product contract: resolving an existing canonical
activity through an equivalent spelling must not re-evaluate its admission
against current allowlist rules. No data-cleanup or deletion operation is
authorised by this analysis.

## Acceptance Criteria For A Later Implementation

These are requirements for the eventual implementation plan, not tests added or
run by this documentation change.

- Accepted inputs use one canonical identity contract across all four admitting
  paths and their corresponding readers. Deliberately distinct path and origin
  examples remain distinct, and repeated normalisation is idempotent.
- Canonical activity URLs contain neither query nor fragment. For the same
  learner and academic scope, browser locations differing only in those
  components use the same activity ID, progress, and page state.
- Deep linking and activity-code creation/editing reject instructor activity
  URLs with query or fragment, including empty `?` and `#` suffixes, even when
  the canonical activity already exists. Encoded path characters `%3F` and
  `%23` are not mistaken for component delimiters. Rejection preserves the
  input, gives a specific field warning, and leaves no registration, association,
  code changes, or signed deep-link content item from the failed operation.
- A grandfathered canonical activity resolves through a spelling variant even
  with no enabled rules, without policy evaluation. With zero enabled rules,
  unknown activities are allowed subject to the existing admission syntax and
  canonical length checks. With one or more enabled rules, unknown activities
  must match an enabled rule.
- Concurrent registrations using different equivalent strings both succeed
  with the same ID. Instructor batches deduplicate and sort canonical keys.
- Canonical length controls storage eligibility, including shrinking inputs,
  Unicode expansion, and the 255/256-character boundary.
- OAuth exchange succeeds when it repeats the authorised parameter values and
  fails when it substitutes an equivalent but different spelling. The successful
  lookup resolves the same activity registered during authorisation.
- Additional progress reads resolve spelling variants without registration or
  policy evaluation and preserve request spelling in responses. Identical and
  canonically equivalent read inputs are allowed, with one response entry per
  successfully resolved occurrence in input order.
- A canonical self-reference remains a per-target rejection. Canonical duplicate
  contribution targets reject the whole request at schema validation before the
  command handler runs, including targets differing only by query or fragment.
  The existing validation code, issue path, message, and HTTP response are
  preserved; no factors are summed or selected on the caller's behalf. Identical
  malformed strings remain duplicates, but distinct parse failures do not
  trigger duplicate rejection.
- Instructor validation and deep linking agree on normalised per-code prefixes;
  prefixes containing query or fragment are rejected with a field warning, and
  the existing string-prefix meaning is retained. Policy admission remains an
  independent check.
- A deep link publishes the canonical activity URL in `modulus_activity_url` and
  uses the resolved public activity code and activity ID in `window.targetName`;
  equivalent submitted URL spellings produce the same window target name.
  Both launch readers resolve spelling variants received intact. Direct-link
  transport retains the known
  limitation for non-root trailing slashes and repeated slashes until the
  separately deferred fix; canonicalisation alone must not be described as
  making those direct links work. An end-to-end LTI launch, agent authentication,
  and progress check verifies that supported URLs use the activity tied to the
  LMS line item.
- The agent continues preserving the learner's query and fragment across OAuth
  while identifying the activity without them. Launches add Modulus's own
  transport parameters but do not forward instructor-authored query or fragment
  values. Documentation states the required compatibility of progress and page
  state across browser-location variants.
- Near-match paths remain separate activity identities; registration and lookup
  introduce no similarity warnings, automatic aliasing, or redirect discovery.
- Seeds and fixtures use canonical activity URLs. Staging cleanup remains
  separate; this feature adds no data-rewrite or merge machinery.
- Diagnostics retain the existing restricted fields. Full submitted URLs,
  queries, fragments, credentials, and OAuth values must not be added to logs
  or public fixtures as part of normalisation.

## Resolved Decisions

Review on 2026-09-08 settled the canonicalisation decisions below. Review on
2026-09-10 clarified schema validation in decision 4 and added the direct-launch
transport deferral and the read-duplicate and window-target decisions in 8–10:

1. **Equivalence profile.** Exclude query and fragment, then use WHATWG
   serialization alone. Retain and document the residual distinctions; do not
   add RFC-style percent-escape normalisation.
2. **Instructor input.** Reject activity URLs containing query or fragment
   during deep linking and activity-code creation/editing, with an explicit
   field warning. Do not silently remove intentional launch options.
3. **Browser location.** Retain the agent's preservation of query and fragment
   across OAuth, while binding progress and page state to the canonical activity
   and the existing learner/scope context.
4. **Duplicate cumulative targets.** Extend the existing whole-request duplicate
   rejection to canonical duplicates in the existing Zod schema refinement,
   using the pure normaliser and preserving the validation error contract.
   Reject before the command handler runs. Do not combine factors or pick one
   target to retain; distinct malformed URLs are not canonical duplicates.
5. **Per-code prefixes.** Require prefixes without query or fragment and compare
   normalised strings while retaining the existing string-prefix meaning.
6. **Staging data.** There are no live deployments. The maintainer's staging
   inspection found no remaining canonicalisation or duplicate problem after
   separately planned cleanup. No staging-data work belongs to this feature.
7. **Deferred features.** Instructor-configured launch parameters and near-match
   detection are deferred. Neither is required for the agreed identity contract.
8. **Direct-launch transport.** Defer the choice between carrying the activity
   URL in a query parameter and carrying an activity ID in the path until
   stakeholder discussion. Retain the agreed canonicalisation profile and
   accept that current generated direct links cannot correctly launch some
   valid canonical URLs, especially those with non-root trailing slashes,
   until the transport fix is implemented.
9. **Duplicate progress reads.** Allow identical and canonically equivalent
   inputs. Return one entry per successfully resolved input occurrence,
   preserving submitted spelling and order. The asymmetry with write rejection
   is intentional.
10. **Deep-link window target.** Use the resolved public activity code and
    activity ID in `window.targetName`, replacing the submitted activity URL.
    This decision is independent of the deferred direct-launch URL format.

## Honest Notes & Open Questions

The canonicalisation policy is agreed and ready for implementation planning.
The direct-launch transport choice remains open pending stakeholder discussion;
its deferral explicitly accepts the unsupported paths described above. Neither
candidate format has been selected, and canonicalisation implementation does
not resolve this limitation. Other deferred allowlist issues can be analysed
separately without reopening the agreed identity rules.

This design does not close the OAuth open redirect, redesign callback handling,
add emergency blocking, broaden allowlist rules, change progress calculations,
or implement an activity merge. Published subsystem documentation and its
availability index should be updated when the resulting behaviour is implemented;
this file remains a design analysis under `specs/`.

## Where to go next

- The [original allowlist analysis](./2026-09-02-activity-url-allowlist-analysis.md)
  defines admission, grandfathering, and the deliberately deferred work.
- The [allowlist implementation plan](./2026-09-02-activity-url-allowlist-implementation-plan.md)
  records the existing admission and registration contracts that canonicalisation
  builds on.
- The [authentication reference](../docs/AUTHN-AUTHZ.md) explains OAuth and
  activity-bound tokens.
- The [cumulative progress reference](../docs/CUMMULATIVE-PROGRESS.md) explains
  target contributions, self progress, and rejection behaviour.
- The [data model](../docs/DATA-MODEL.md) describes the dependent records that
  use activity IDs for associations, progress, page state, and grading.
