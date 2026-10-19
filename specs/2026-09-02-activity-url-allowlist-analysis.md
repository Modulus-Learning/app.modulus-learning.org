# Sitewide activity URL allowlist — analysis

Date: 2026-09-02
Status: implemented on feat/activity-url-allowlist
Related:

- `docs/ARCHITECTURE.md` — actor separation and the Tier 2 ↔ Tier 3 boundary
- `docs/SECURITY-AND-PRIVACY.md` — current activity trust claims
- `docs/DYNAMIC-ACTIVITIES.md` — the earlier, partially superseded lazy-create
  allowlist proposal
- `docs/CUMMULATIVE-PROGRESS.md` — current multi-activity progress semantics
- `docs/AUTHN-AUTHZ.md` — agent OAuth 2.0 + PKCE and token binding
- `packages/core/src/modules/app/activities` — instructor activity-code CRUD
- `packages/core/src/modules/app/lti/services/deep-link.ts` — LTI deep-link
  registration
- `packages/core/src/modules/agent/auth` — OAuth-time activity creation
- `packages/core/src/modules/agent/activity-state/services/progress.ts` —
  progress-time target creation
- `apps/gradebook/src/app/routes/agent/authorize/route.ts` — browser-facing
  OAuth authorization behaviour
- `apps/gradebook/src/app/lti/error/page.tsx` and
  `apps/gradebook/src/modules/lti/error-slug.ts` — the house pattern for
  learner-facing error surfaces that `/agent/error` follows
- `apps/agent/src/core/agent.ts` and `apps/agent/src/core/api-client.ts` — the
  agent's error classification, retry gate, and progress response type

This document specifies the approved sitewide allowlist design for activity
URLs. It answers who controls the list, what counts as registering an activity,
how each registration path fails, and whether a later policy change affects
activities that Modulus has already accepted.

It does not itself authorize code, schema, migration, or UI changes. The
approved contracts should now be translated into a separate implementation
plan.

## Question

How should a sitewide, administrator-managed activity URL allowlist govern
activity registration across instructor workflows and agent traffic, and
how—if at all—should changes to that allowlist affect activities and
associations that Modulus previously accepted?

The answer must cover every current runtime path that may insert an `activities`
row, including instructor paths that also associate the resulting activity with
an activity code:

1. instructor activity-code creation and editing;
2. instructor LTI deep linking;
3. agent OAuth authorization for a previously unseen activity URL; and
4. cumulative progress reporting to a previously unseen target URL.

It must explicitly compare three lifecycle policies for an existing activity
that ceases to match the current allowlist:

1. delete the activity and its dependent data;
2. retain its data but block some or all continued launches, authentication,
   progress, page-state, reporting, or score-passback operations; or
3. grandfather it and apply the changed allowlist only to future registration.

Those are alternatives to evaluate, not constraints assumed by the question.
The analysis must account for existing LTI links, activity-code associations,
agent authorization codes and tokens, learner progress and page state,
reporting, and score passback before recommending one.

It must also preserve the privacy boundary: no learner PII, LMS identity, or
gradebook data crosses into an activity, and diagnostics must not introduce any
of those values.

## Executive Recommendation

Treat the allowlist as an **admission policy**, not a continuously evaluated
authorization policy.

The recommended contracts are:

1. **Only administrators may manage the sitewide allowlist.** Instructors may
   register activities under their own activity codes, but they cannot add,
   edit, disable, or remove allowlist rules.
2. **The policy is strict and deny-by-default.** With no enabled rules, no new
   activity URL can be registered. This deliberately supersedes the earlier
   `docs/DYNAMIC-ACTIVITIES.md` proposal in which zero rules meant allow all.
3. **One rule is an exact origin or an origin plus a path subtree.** A whole-site
   rule such as `https://ximera.osu.edu` accepts every path on that exact origin.
   A base rule such as `https://ximera.osu.edu/course/calculus/` accepts that
   path and descendants, not `/course/calculus-2` and not a subdomain.
4. **Check the policy when an operation would admit a new URL.** Registration
   means inserting a new `activities` row. Adding an already-known activity to
   an activity code is categorization, not registration, and remains allowed
   by the sitewide policy even when the URL no longer matches a current rule.
   The activity code's own `url_prefix`, when present, remains an independent
   constraint.
5. **Do not re-check ordinary use of an already-registered activity.** Agent
   OAuth, token exchange and renewal, direct/self progress, page state, LTI
   launch, and cumulative updates to an existing activity continue to work even
   if no current rule matches its URL.
6. **Grandfather existing activities globally.** Editing or deleting a rule
   never deletes an activity, removes an activity-code association, rejects an
   existing token, blocks subsequent reads and writes, or prevents a later
   association with an activity code. The admin UI should preview how many
   existing activities would sit outside the prospective policy and label them
   as grandfathered.
7. **Reject instructor registration atomically and visibly.** Activity-code
   creation and editing resolve every submitted URL. Known activities may be
   associated without a sitewide-policy check; each unseen URL must match the
   allowlist before it is created. If any unseen URL is disallowed, nothing in
   the form submission changes and the form identifies every rejected URL.
8. **Validate the OAuth `redirect_uri` syntactically before using it.** A
   `redirect_uri` that is not an absolute https — or exact-loopback http — URL
   without credentials is never used as a destination; the learner gets a
   Modulus-owned dead-end page at `/agent/error`. A URI that passes that check
   is still used for OAuth error redirection even when the allowlist would deny
   it, so a disallowed activity returns the learner to their page with
   `error=unauthorized_client` rather than stranding them. The allowlist gates
   registration, not redirect eligibility. This narrows the route's existing
   open redirect rather than closing it; see *Agent OAuth Behaviour*.
9. **Preserve self progress when a cumulative target is disallowed.** Skip the
   target, create no activity/progress/event/line-item data for it, commit the
   current page and other allowed targets, and return a successful response with
   a structured rejected-target result. Because the disallowed URL is authored
   into the page, failing the request instead would stop that page reporting
   progress permanently, not just once.
10. **Store normalized rules in PostgreSQL.** Use a dedicated
    `activity_url_allowlist_rules` table with exact origin and path-prefix
    columns, enabled state, description, administrator provenance, timestamps,
    and a uniqueness constraint. Do not put the rules in environment variables,
    reuse `activity_codes.url_prefix`, or introduce a generic settings JSON
    blob.
11. **Centralize the decision inside core.** Route every path that admits a URL
    through one internal registration entry point, which owns the syntactic
    check, policy evaluation, the insert, and the create race, and which returns
    denials rather than throwing them. Client-side form checks may improve
    feedback but are not enforcement.

The key consequence is intentional: removing a rule stops future admissions but
does not revoke past admissions. If administrators need an emergency kill
switch for compromised content, that should be designed separately as explicit
activity/origin blocking with its own launch, token, state, and score-passback
semantics.

## Terminology: Registration Versus Use

An allowlist is easy to apply inconsistently unless *registration* is defined as
an operation rather than inferred from which endpoint was called.

For this feature, an operation registers an activity URL only when it inserts a
new row into `activities`. That row is Modulus's durable record that the URL was
admitted under the policy in force at the time.

Adding a row to `activity_activity_code` categorizes an already-registered
activity for curriculum grouping and reporting. It can be a new instructional
use, but it does not admit another URL into Modulus and is not governed by this
allowlist. A known activity is grandfathered globally, not only within the
activity-code associations that happened to exist when its matching rule was
changed.

Use means reading or writing an activity that Modulus has already admitted.
OAuth for a known activity, an LTI launch of an existing link, progress and page
state under an existing activity-bound token, and cumulative progress applied to
an existing target are uses, not registrations.

This produces the following enforcement matrix:

| Operation | When the allowlist is checked | Disallowed result |
| --- | --- | --- |
| Create an activity code with URLs | Each URL that does not resolve to an activity | Reject the whole form; create neither code nor unseen activities |
| Edit an activity code | Each URL that does not resolve to an activity | Reject the whole edit; known grandfathered activities may be newly associated |
| LTI deep link | Only when the URL does not resolve to an activity | Return a field error and create no activity; a known grandfathered activity may be linked and associated |
| Agent authorization | Only when `redirect_uri` does not resolve to an activity | Create no activity or auth code; redirect back with `error=unauthorized_client` |
| Agent token exchange | Never; the authorization code names an admitted activity | Existing OAuth checks remain authoritative |
| Set self progress/page state | Never; the token is already activity-bound | Continue normally |
| Set cumulative progress | Only when a target URL does not resolve to an activity | Skip that target and report it as rejected; commit self and allowed targets |
| Get progress for other URLs | Never and never creates | Known URLs are read; unknown URLs remain omitted |
| LTI/direct launch | Never; launch does not register | Continue the existing launch policy |
| Seed/migration fixture insertion | Outside runtime policy | Explicit trusted bootstrap operation |

Every instructor-supplied URL is therefore resolved before it is evaluated.
Known means admitted: the sitewide policy permits the activity to be newly
associated with the selected code and used for deep linking even if it no longer
matches an enabled rule. Independent rules, including the selected activity
code's `url_prefix`, still apply. Unknown means a prospective registration: the
URL must match before core creates the activity and any requested association.

## Current-State Findings

### Activity-code forms can register any syntactically accepted URL

`ActivityService.createActivityCode()` and `updateActivityCode()` call
`ensureActivitiesExist()` and then create `activity_activity_code` rows. The core
request schema uses `z.url()` but has no site policy. The gradebook server actions
apply stricter HTTPS/localhost validation and optionally require the URL to
start with that activity code's `url_prefix`, but those host checks are neither a
sitewide trust decision nor a core enforcement boundary.

The update service currently removes every association and recreates the
submitted set. An allowlist implementation cannot simply require the complete
submitted set to match the current rules: doing that would make a harmless
description edit fail until an instructor also removed every grandfathered URL.
It must resolve submitted URLs first and evaluate only those with no existing
`activities` row. No association-delta calculation is needed for allowlist
purposes.

### LTI deep linking is another instructor registration path

`LtiDeepLinkingService.handleDeepLink()` validates the selected code's optional
`url_prefix`, creates the activity if necessary, and associates it with the
code. This is semantically the same admission as the activity-code edit page and
must use the same sitewide policy when the URL is unseen. A known grandfathered
activity may be newly associated and linked; otherwise an instructor could
bypass the creation gate by entering an unseen disallowed URL through Canvas
deep linking.

The per-code prefix remains useful after this feature. It is an additional,
instructor-managed curriculum constraint; it cannot broaden the site policy. A
previously unseen URL must satisfy both rules when the code has a prefix, while
a known grandfathered activity still must satisfy the prefix:

```text
sitewide allowlist AND activity-code url_prefix
```

### Agent OAuth currently lazy-creates every unseen redirect URI

`AgentAuthService.createAuthCode()` looks up `redirect_uri` and unconditionally
calls `createActivity()` on a miss. `claimAuthCode()` later requires that row to
exist before it mints the activity-and-scope-bound access token.

The browser route has adjacent problems that this feature touches but does not
exist to solve. `/routes/agent/authorize` uses the caller-supplied
`redirect_uri` as a redirect destination on several branches without validating
it in any way. Two consequences follow, and they are different in kind:

- **A crash.** `const redirectURL = new URL(redirect_uri)` runs before anything
  has checked the string, so a malformed value throws there and the learner
  gets an unhandled `500`.
- **An open redirect.** A syntactically hostile value such as
  `https://modulus.example@evil.example/` — where the userinfo segment puts a
  trusted-looking host in front of the real one — is followed as-is. So is a
  plain `https://evil.example/`.

The first is a defect to fix. The second predates this feature and is not what
an admission allowlist is for; §Agent OAuth Behaviour records how far this
feature goes and what it deliberately leaves open.

### Cumulative progress currently lazy-creates every unseen target

`ActivityProgressService.resolveTarget()` creates a bare activity for each
previously unseen `increments_for_other_pages[].url`, inside the same transaction
as self progress and cumulative updates. Existing target activities are not
activity-code scoped, by design.

A disallowed target must not fail the whole request. The target list comes from
the page's authored markup, so the same disallowed URL recurs in every
submission that page makes. Failing the request would therefore not cost one
update; it would permanently stop all progress from that page, including the
learner's own self high-water mark, which is valid independently of one bad
authored target. Skipping the target and reporting it in an otherwise
successful response keeps the failure local to the misconfigured URL.

That reasoning already applies to two failures the method has today.
`resolveTarget()` throws `ERR_VALIDATION` for a target URL over 255 characters
and for a target that resolves to the reporting activity itself, failing the
whole submission in both cases. Both are authored into the page exactly as a
disallowed URL is, so both recur on every submission and permanently stop that
page reporting. This feature should convert them to the same per-target outcome
rather than leave two durable authoring errors behaving the opposite way from
the one it introduces.

Target evaluation is also conditional today: the loop runs only when self
progress advanced. That is correct and stays — a submission with nothing to
contribute applies nothing to any target, so it has nothing to report about
them. Rejection reporting therefore follows contribution application, and a page
that reports the same bad target learns about it on the next advance.

Page state needs no multi-URL rule. It is always keyed by the activity id in the
verified agent token and cannot register or write another activity.

### The earlier dynamic-activities policy is not sufficient as written

`docs/DYNAMIC-ACTIVITIES.md` remains useful history, but its unimplemented
allowlist section predates this broader requirement. It proposes:

- allow-all when there are zero rules;
- host plus raw `pathname.startsWith(path_prefix)` matching;
- a `created_by` reference to learner/instructor `users`; and
- enforcement only on agent lazy creation.

This proposal changes all four points. A real allowlist must fail closed, path
matching must respect path boundaries, administrators belong to `admin_users`,
and instructor registration is part of the enforcement surface. If this
analysis is approved, its allowlist sections supersede the corresponding future
plan in `docs/DYNAMIC-ACTIVITIES.md`.

## Who May Manage the Allowlist

Only the separate administrator actor domain should manage it. Instructor
abilities such as `activity_codes:update_own` authorize curriculum grouping;
they must not authorize changes to site trust policy.

The recommended admin abilities are two:

- `activity-url-allowlist:list`; and
- `activity-url-allowlist:manage`, covering create, edit, enable/disable, and
  delete.

This departs from the per-verb convention the other admin abilities use
(`lti-platforms:list`, `admin-roles:create|edit|delete`), and it does so for a
reason specific to this resource. Because adding a rule that normalizes onto an
existing disabled one re-enables that row rather than inserting a new one — see
*Adding a Rule That Already Exists* — a create action can resolve into an edit.
Splitting the two abilities would let an administrator hold `create` without
`edit` and hit a dead end on a perfectly ordinary submission, with no way to
express what they asked for. Mutating the allowlist is one capability here, so
it is one ability.

The seeded Manager admin role receives both, added to
`seeds/03_admin_permissions.ts` alongside its existing grants. Other admin roles
receive neither unless deliberately granted. Commands use `AdminRequestContext`
and `assertAdminAbilities`, so an instructor access token cannot call them even if
an ability string were accidentally duplicated across the actor domains.

Note for planning: abilities currently reach an administrator only through that
seed. The admin-roles UI has a placeholder permissions tab, not a working
ability editor, so an existing database gains these grants by re-seeding or by a
separate data migration. That migration is not part of this feature.

The existing `/admin/activities` placeholder is the natural first UI. It should
list rules and provide create/edit, enable/disable, and delete actions.
Instructor-facing forms must not show the allowlist or currently approved base
URLs. They should identify the URLs the instructor submitted that were denied
and tell them to contact a Modulus administrator.

## Rule Representation and Matching

### One input shape covers domains and base URLs

Use one absolute base-URL input rather than separate "domain" and "base URL"
rule types:

| Administrator input | Stored meaning |
| --- | --- |
| `https://ximera.osu.edu` | exact origin, every path |
| `https://ximera.osu.edu/` | same as above |
| `https://ximera.osu.edu/course/calculus` | that exact path and descendants |
| `https://ximera.osu.edu/course/calculus/` | same normalized subtree |

Requiring the scheme avoids ambiguity about whether HTTP is trusted and makes
ports part of the origin. The UI may describe the first form as a domain rule,
but core should always receive an absolute URL.

### Matching contract

Parse both the rule and candidate with the platform URL parser, then compare
normalized components. String `startsWith()` on a complete URL is not safe:
`https://trusted.example.evil/` begins with `https://trusted.example`, and
`/course/calculus-2` begins with `/course/calculus`.

A candidate matches a rule only when all of the following are true:

1. the candidate is an absolute URL with no username or password;
2. its normalized `origin` exactly equals the rule origin, including scheme and
   non-default port;
3. the rule path is `/`, the candidate path equals the rule path, or the
   candidate path begins with the rule path followed at a path-segment boundary.

Host comparison is case-insensitive through URL normalization; path comparison
is case-sensitive. The URL parser normalizes dot segments and default ports.
Query strings and fragments do not participate in the rule match. Modulus may
continue storing the original canonical activity string; this feature does not
attempt to merge existing activity identities that differ only by URL spelling.

Initial rules apply to exact hosts only. A rule for `example.edu` does not admit
`www.example.edu`, `content.example.edu`, or arbitrary subdomains. Wildcards add
non-obvious public-suffix and ownership semantics and should be a later feature
if exact-rule volume proves burdensome.

Production rules must use HTTPS. To preserve the existing demo workflow, core
may accept HTTP only for the exact loopback hosts `localhost` and `127.0.0.1`,
with an explicit port when needed. No other insecure origin is valid, and
`[::1]` is deliberately not included: the gradebook's existing form validator
accepts only those same two hosts, so limiting core to them keeps the host and
core rules identical instead of introducing a value a form would reject before
core ever saw it.

Malformed URLs never match. Instructor commands return validation errors; a
malformed OAuth redirect stays on the Modulus-owned `/agent/error` dead-end
page; and a malformed cumulative target is reported as a rejected target
without creating data.

## Storage Recommendation

Use a dedicated relational table rather than configuration or a generic
settings record:

```text
activity_url_allowlist_rules {
  id           uuid pk
  origin       varchar(255) not null
  path_prefix  varchar(255) not null default '/'
  description  varchar(1024)
  is_enabled   boolean not null default true
  created_by   uuid -> admin_users.id on delete set null
  updated_by   uuid -> admin_users.id on delete set null
  created_at   timestamptz not null
  updated_at   timestamptz not null

  unique (origin, path_prefix)
}
```

`origin` is the normalized URL origin, with no trailing slash. `path_prefix` is
the normalized subtree root and always begins with `/`; using `/` rather than
`NULL` for a whole-origin rule makes uniqueness straightforward. Core derives a
human-readable base URL from the two fields for API and UI responses.

Core must also reject a rule whose derived base URL — `origin` plus
`path_prefix` — exceeds 255 characters, independently of the per-column widths.
`activities.url` is `varchar(255)`, so a longer rule could never match a
storable activity URL: it would be accepted, listed, and permanently inert. The
column widths alone cannot express this, since either column can be within its
own bound while the pair is not.

The provenance columns and timestamps on the current rule are sufficient for
this feature. No immutable audit-event table or mutation-history table is
required.

### Adding a Rule That Already Exists

Normalization makes collisions ordinary rather than exceptional:
`https://ximera.osu.edu/course/calculus` and the same URL with a trailing slash
resolve to one `(origin, path_prefix)` pair, so an administrator can submit what
looks like a new rule and hit the unique constraint. Raising
`ERR_UNIQUE_CONSTRAINT` at them is the wrong answer — they asked for a state,
not for an insert.

Resolve it by the existing rule's state:

- **an enabled rule already matches** — change nothing and tell them a rule for
  this base URL already exists. The requested state already holds.
- **a disabled rule already matches** — offer to re-enable it. This is what an
  administrator re-adding a previously removed base URL actually wants, and
  re-enabling preserves the existing rule's description and provenance rather
  than discarding them.

The second case is why the create action must be able to modify an existing
row, which shapes the permission split below.

This shape is preferable because:

- rules are shared across all application instances and deployment modes;
- CRUD, uniqueness, provenance, and enable/disable state are explicit;
- policy queries can participate in the same database transaction as activity
  creation;
- it avoids deployment restarts for routine admin changes; and
- it does not overload the per-code `activity_codes.url_prefix`, whose owner and
  purpose are different.

Environment variables are a poor fit for administrator-managed mutable state
and become difficult to keep identical across frontend/admin instances. A JSON
settings blob would discard useful constraints and make concurrent edits and
future rule metadata harder. Attaching a rule to an activity code would conflate
site trust with curriculum grouping, as the earlier dynamic-activities analysis
already concluded.

Do not use a process-local cache in the first implementation. Registration is
rare relative to ordinary progress traffic, and existing targets do not query
the policy. Reading the small enabled-rule set on an actual admission keeps
multi-instance edits immediately coherent. If scale later requires caching, it
needs an explicit cross-instance invalidation or revision scheme.

## Default and Rollout Semantics

Zero enabled rules means deny all new registration. The same is true when rules
exist but all are disabled. An allow-all empty state is operationally convenient
but is not an allowlist: a new installation could silently accept arbitrary
redirect targets until an administrator happened to add its first rule.

The admin page must explain the deny-all state prominently. Seeds add no
allowlist rules at all — not the Ximera origins in `seeds/10_activities.ts`, not
the loopback origins used by repository demos. A seeded database therefore
starts denying, and a developer adds the first rule through the admin UI, which
is also the shortest path to exercising that UI. Nor may a production migration
infer trust by converting every historical activity origin into a rule.
Existing rows are grandfathered already; automatically approving their origins
would also approve unseen paths and hide the administrator's decision.

Modulus has no live deployment. The only existing instance is staging, where
interruptions and some data loss are acceptable. The implementation therefore
needs no compatibility bridge, policy backfill, or special rollout sequence;
the strict empty-state default may ship directly. Existing activity rows remain
grandfathered under the ordinary product semantics, not because staging data
requires preservation.

## Instructor Registration Behaviour

### Activity-code creation

Validate and normalize input first, including the activity code's optional
prefix, then resolve every submitted URL. Existing activities—including
grandfathered ones—need no sitewide-policy evaluation. Evaluate all unseen URLs
against the same policy snapshot and return all disallowed unseen URLs in one
field error. Only after every prospective registration passes may the
transaction create the code, its initial member, the unseen activities, and all
requested associations.

No partial registration is useful here. Creating a code with only the approved
subset would make the saved grouping differ silently from the instructor's
form.

### Activity-code editing

Resolve the requested URL set against the global activity catalog. Any known
activity may be associated with the code, whether the association is retained,
new, or being restored after an earlier removal, provided it satisfies the
code's independent prefix rule. Check the sitewide policy only for URLs with no
`activities` row. Removals are always allowed.

If any unseen URL is disallowed, reject the whole edit before changing the
code's description, per-code prefix, or associations. The response should put a
message beside the URL field such as:

> This Modulus site does not allow these activity URLs: … Contact a Modulus
> administrator to request access.

The message may echo URLs the instructor submitted; it should not disclose
administrator identity or unrelated rules.

### LTI deep linking

After authenticating the instructor and loading the selected activity code,
resolve the URL globally. If it is known, associate it with the selected code if
needed and continue without a sitewide-policy check; the code's existing
`url_prefix` validation still applies. If it is unseen, require an allowlist
match before creating the activity and association. A disallowed unseen URL
returns a dedicated `ERR_ACTIVITY_URL_NOT_ALLOWED` core error, which the
gradebook maps to the deep-link form's `activity_url` field. It must not return a
signed content item to Canvas.

This means a grandfathered activity can be deployed through a new Canvas deep
link. That is a deliberate consequence of global activity-level grandfathering:
the `activities` row, not a particular code association, records admission. If
administrators later need to prevent new deployments of known activities, that
is a separate deployment or blocking policy rather than this registration
allowlist.

## Agent OAuth Behaviour

### Previously unseen and allowed

For an authenticated learner, evaluate the redirect URI, create the bare
activity row, and create the authorization code, in that order. No transaction
is required: the activity is committed before the code that names it, so no
interleaving yields a code the agent cannot exchange, and a failure after the
insert leaves only a bare activity row — a state this design already tolerates
everywhere else.

A concurrent create of the same allowed activity resolves to the winning row and
remains successful, which is what this path's existing `onConflictDoNothing`
insert already gives it.

The activity is not automatically associated with an activity code. The
allowlist expresses site trust, not curriculum ownership.

### Previously unseen and disallowed

Create no activity and no authorization code. `createAuthCode()` fails with
`ERR_ACTIVITY_URL_NOT_ALLOWED`, and the route returns the learner to their page
with `error=unauthorized_client`.

Not `access_denied`. The agent maps that code to `status: 'expired'` and prompts
a re-launch from the LMS, which for an unapproved activity would send the
learner round the same loop indefinitely. `unauthorized_client` is in the
agent's accepted set, maps to a terminal `status: 'failed'`, and is the correct
RFC 6749 code here given that `client_id` is the activity URL. The route
therefore maps `ERR_ACTIVITY_URL_NOT_ALLOWED` to `unauthorized_client` and every
other core failure to `server_error`, in the shape `errorSlugFor()` already
uses for LTI.

Core logs a warn-level, PII-free diagnostic with the normalized origin and path;
it does not log learner identity, LMS context, tokens, auth codes, or PKCE
values.

### Authorization-route ordering

The route validates the redirect destination syntactically, then makes at most
one core call:

```text
1. redirect_uri fails syntactic check -> /agent/error; never redirect
2. request otherwise malformed        -> back with state + error
3. no Modulus session                 -> back with state + access_denied
4. otherwise, createAuthCode()
     success                          -> back with state + code
     failure                          -> back with state + error
```

Step 1 is the only gate on the destination, and it must be stricter than
`new URL()`, which accepts `javascript:` and `data:` and treats
`https://modulus.example@evil.example/` as a perfectly good URL. The check is
the syntactic half of the matching contract above: an absolute URL, no username
or password, https — or http only for the exact loopback hosts. Failing it means
there is no safe destination and no link worth offering, so the learner gets a
dead-end page.

The route must not reimplement that check. Core owns URL parsing and
normalization for this feature, and a second definition in the host would drift
from it exactly as the host's own `@types/validate-urls.ts` already has.
Export it from core as a **pure** helper — no I/O, no policy data, no ctx —
the way `DEFAULT_SCOPE_ID` and the auth classes are already exported. That keeps
one definition without adding a second command call.

Step 2 is the route's existing protocol validation, which this feature keeps
and must not quietly drop while reordering around it: `response_type` is not
`code`, `client_id` does not equal `redirect_uri` (`route.ts:66`),
`code_challenge_method` is not `S256`, `client_id`, `state` or `code_challenge`
is absent, or `scope_id` does not parse as a UUID.

What changes at step 2 is only the response. Those failures currently return raw
`400` JSON, which no learner should ever see; bouncing back with an error lets
the agent surface a real failure instead. When the request is malformed
*because* `state` is missing there is no state to echo, and the agent reads the
response as `oauth_state_mismatch` and fails — acceptable, since a request
without state came from a broken client, not a learner condition.

Steps 2 and 3 consult no policy at all, which is what keeps this to one core
call per request: `createAuthCode()` is reached only on step 4, where a session
exists, and it remains the single authoritative check-and-create.

### What This Does Not Close

Steps 2, 3 and 4 redirect to a syntactically valid `redirect_uri` without asking
the allowlist. An attacker can therefore still use the endpoint to bounce a
browser to any https origin they choose. That is a real open redirect, it exists
today, and this feature narrows rather than removes it.

What the syntactic gate does remove is the dangerous half: the credentialed-host
disguise, `javascript:` and `data:` destinations, and the unhandled `500`. What
remains is a plain hop to an attacker's https site — the weakest form, and one
they could achieve by sending the victim a direct link.

Closing it entirely means never auto-redirecting to an unapproved URI, which
means replacing the bounce with a Modulus page offering a return link. That is
deferred deliberately. Session expiry is the common path, not an edge case, and
today it resolves without the learner doing anything; a page plus a click is a
real regression for every learner who leaves a tab open, and it is worth
stakeholder input rather than a side effect of an admission feature. The
follow-up would need the return link to carry the OAuth response parameters —
otherwise the agent re-attempts authorization on arrival and loops — and would
need its own scheme check in the page, since the link target would arrive as a
query parameter that anyone can set.

Recording this openly is the point. An allowlist that gates registration is not
a redirect-URI validator, and the analysis should not read as though it were.

### The Modulus-owned error page

`/agent/error` exists for step 1 alone: a `redirect_uri` with no safe
interpretation. It is a new page modelled on `/lti/error` and its
`errorSlugFor()` mapping — the pattern, not the page, since `/lti/error`'s slug
union is the closed set of *launch* failures and its own comment requires every
future code to be classified there deliberately.

Three properties carry over:

1. **The page answers `200`.** It is an App Router page reached by a redirect,
   not an error response; a status code is not available to it and is not how a
   learner is told anything. The redirect keeps the authorization route's
   existing `307`. `ltiErrorRedirect()` uses `303` for a reason specific to the
   LTI routes — they are POST handlers, and `303` stops the browser re-POSTing
   an `id_token` to the redirect target — and `/routes/agent/authorize` is a
   GET handler, so that rationale does not carry over.
2. **The slug, not the failure, chooses the copy.**

   ```ts
   type AgentErrorSlug = 'invalid_request' | 'server_error'
   ```

   `invalid_request` is the unusable `redirect_uri`. `server_error` is the
   default for an unknown or absent slug, following `/lti/error`'s reasoning:
   an outage must never blame the learner's course link.
3. **No caller-supplied value is reflected into the page.** `/lti/error`'s
   contract is explicit that the raw query value never reaches the DOM. Do not
   render the rejected URI and do not put it in a link — the value that reached
   this page is, by definition, one that failed validation. The diagnosis
   belongs in the server log.

Learner-facing copy for `invalid_request`, in the register the existing page
uses:

> **Launch Error** — This activity could not be connected to Modulus. Your work
> on this page will not be recorded. Please contact your instructor.

`/agent` is a new route group and needs its own `layout.tsx`, as `/lti` has.

`claimAuthCode()` does not re-check the policy. The activity exists by then, and
a rule removed between authorization and token exchange does not revoke the
admission. It retains the current single-use code, client id, redirect URI,
PKCE, enabled-user, activity, and scope validations.

## Agent Progress Behaviour

The policy applies only to previously unseen entries in
`increments_for_other_pages`. It does not apply to self progress, page state, or
known cumulative targets. Targets are processed only when self progress
advanced, as they are today; a submission that contributes nothing reports no
targets, accepted or rejected.

For each unseen target:

1. parse and evaluate the URL under the registration policy;
2. if allowed, lazy-create the bare activity and apply the contribution as now;
3. if disallowed, create no activity, progress row, event, or line-item update;
4. continue with the other targets; and
5. return the rejection as data in the successful response.

Every durable per-target authoring error takes this same route, including the
two that fail the whole submission today. The rejection reason is a closed
union:

```ts
type RejectedTargetReason =
  | 'activity_url_not_allowed' // no enabled rule matches an unseen URL
  | 'malformed_url' // not parseable as an absolute URL
  | 'url_too_long' // exceeds the 255-character `activities.url` column
  | 'self_reference' // the target is the reporting activity itself
```

The first three are the shared registration service's own denial reasons, so
this path names them rather than defining a parallel vocabulary. Only
`self_reference` is added here, because it needs the reporting activity's id and
is checked before the service is called.

The additive response shape is:

```ts
{
  progress: 0.75,
  others: [{ url: 'https://allowed.example/index', progress: 0.4 }],
  rejected_targets: [
    {
      url: 'https://unapproved.example/index',
      reason: 'activity_url_not_allowed',
    },
  ],
}
```

`rejected_targets` is omitted when empty, matching how `others` is already
handled.

The agent should send this through its existing diagnostic logger and treat it
as a completed submission. A non-2xx response would instead stop that page
reporting anything at all, for the reason given above. Silent omission would
preserve data but leave authors unable to distinguish a policy denial from a
page whose cumulative progress happens to remain zero.

Note what that diagnostic is worth in practice. The agent's default logger is
`createSilentLogger()`, deliberately — it runs inside learners' browsers on
third-party pages, so console output is opt-in. Rejected targets are therefore
visible to an author who passed `createConsoleLogger()` or
`createDebugLogger()`, and to nobody else. That is the right default and this
feature should not change it, but it means the server log is the reliable
record; the agent-side report is a convenience for whoever is actively
debugging a page.

Because `apps/agent` is the one published package, this response change reaches
content authors only through a release. It ships in this feature, with a
changeset, and follows `RELEASE-INSTRUCTIONS.md` rather than CI.

The current page's high-water mark, event, and line-item update remain valid and
commit. Allowed targets in the same request also commit. This is intentionally a
per-target outcome rather than all-or-nothing request validation.

The read path remains side-effect-free. `get-progress({ urls })` may return a
known grandfathered target even when no active rule matches it, and it omits an
unknown URL without consulting or mutating the policy.

## Lifecycle Options for Previously Accepted Activities

The three lifecycle policies produce materially different products, not merely
different cleanup strategies:

| Policy | Effect of removing the last matching rule | Principal benefit | Principal cost |
| --- | --- | --- | --- |
| Delete | Delete the activity and any data removed through its foreign-key relationships | The stored activity catalog mirrors the current allowlist | Destructive learner-state loss, broken historical reporting and links, and unclear cascade boundaries |
| Block | Retain data, but consult current policy during some or all launches, OAuth operations, token use, state access, reporting, and passback | Provides an immediate revocation control | Turns every rule edit into a broad authorization change and requires explicit semantics for active tokens, reads, writes, and queued work |
| Grandfather | Treat every existing activity as globally admitted; allow continued use and new code associations, and apply the new policy only to unseen URLs | Preserves data and gives the activity catalog a stable admission meaning | Content can still be adopted in new instructional contexts after its rule is removed, so urgent revocation requires a separate control |

Deletion is the most destructive interpretation and provides little recovery
value: an administrator cannot reliably reconstruct progress, page state,
events, line-item state, or historical associations by adding the rule back.
Blocking is reversible but is not narrow. Its exact meaning cannot be specified
without deciding every operation listed in the table, and different choices can
leave learners in internally inconsistent states.

Grandfathering best fits the stated core requirement, which is that only
matching URLs may be *registered*. It also keeps a routine allowlist edit from
silently becoming a data-retention or live-access operation. The cost is real:
rule removal neither revokes the activity nor prevents instructors from adopting
it in additional activity codes or LTI links. On balance, this analysis
recommends global activity-level grandfathering and treating emergency blocking
or deployment restrictions as separate features whose broader semantics are
visible to administrators.

## Recommended Grandfathering Behaviour

Editing, disabling, or deleting a rule changes only future registration
decisions. It does not mutate `activities` or `activity_activity_code` and does
not add an `is_allowed` snapshot to either table.

An existing activity that no longer matches any rule continues to support:

- agent authorization, token exchange, and token renewal;
- self progress and page-state reads/writes;
- cumulative reads and progress contributions when it is a known target;
- existing LTI and direct launches;
- existing activity-code reporting and associations; and
- new activity-code associations and LTI deep links.

An instructor may remove its activity-code association. Re-adding that
association later remains allowed because the activity itself is already
registered.

Adding an association is not inert: it can make the activity and historical
progress for learners enrolled under that code appear in code-scoped reporting,
and deep linking can deploy it into a new Canvas context. Those are consequences
of the existing grouping and deep-link models. The allowlist answers whether the
URL has entered Modulus, not whether every later instructional use needs renewed
administrator approval. If that reporting or deployment authority is too broad,
it should be addressed directly rather than by giving an activity-code join row
a second meaning as a trust decision.

No activity or learner state is deleted. Deletion would be disproportionate and
could cascade through progress, events, page state, line items, and reporting.
Continuously blocking old activities would also turn an apparently narrow rule
edit into an access-control and grade-processing change with active-token and
learner-support consequences.

The admin edit/delete confirmation should therefore use precise language:

> This change stops previously unseen URLs under this base URL from being
> registered. Existing activities will continue to work and may still be added
> to activity codes or used in new deep links.

It should also show a prospective count, and optionally a list, of existing
activities that would no longer match any enabled rule. Call those activities
**grandfathered**, not invalid, disabled, or noncompliant.

## Why Blocking Is a Separate Feature

An emergency block sounds similar to removing an allowlist entry but has a much
larger decision surface:

- Does an LTI launch stop before or after learner sign-in and enrollment?
- Are existing agent access and refresh tokens rejected immediately?
- Are self progress and page state both blocked, and are reads blocked too?
- Do queued AGS submissions proceed?
- Does a domain-wide block override per-activity exceptions?
- What first-party error does a learner see, and how does an administrator undo
  the block?

Those questions deserve an explicit activity/origin status model, audit trail,
and recovery workflow. Overloading allowlist deletion would hide all of that
power behind an ordinary configuration edit.

## Consistency and Concurrency

One admission operation uses one policy snapshot. Read the enabled rule set once
at the start of the operation and evaluate every candidate URL in it against
that one in-memory result.

That is the whole requirement. It exists for the multi-URL instructor paths: an
activity-code submission carrying five unseen URLs must not evaluate the first
three under one policy and the last two under another, because the outcome would
be a partial admission or a rejection naming an arbitrary subset — a result the
instructor cannot act on. A single read inside the existing transaction gives
this for free. For the single-URL paths — deep linking, agent authorization, one
cumulative target — the snapshot is one read and the requirement is trivially
satisfied.

### Registration Races With an Administrator Are Acceptable

Do not serialize admission against allowlist mutation. A registration may
evaluate a rule set, an administrator may remove the last matching rule, and the
registration may then commit under a policy that no longer exists.

That outcome is acceptable, and preventing it would be a mistake. Nothing in the
system re-reads the policy for an activity that already exists: no query joins
`activities` to the rule table, no operation re-checks admission, and no surface
partitions activities by whether they still match. Grandfathering decoupled
admission from use deliberately, so an activity admitted a few hundred
milliseconds "late" is indistinguishable from one admitted a few seconds early —
which no one proposes to prevent. The lost race produces stale state, not
inconsistent state.

Nor is this a security control. Exploiting the window would require knowing a
removal is in flight, committing inside it, and gaining something unobtainable
by simply registering earlier. The last condition fails, so there is nothing to
defend.

The cost of serializing would be real.
`ActivityStateMutations.acquireUserLock()` already holds a transaction-scoped
advisory lock across the whole of `setProgress()`, the busiest write path in the
system. Adding a second lock there to guard the rarest possible interleaving
puts admin rule edits in contention with learner progress traffic — and because
a pending exclusive request queues ahead of later shared requests, one
administrator saving a rule could briefly stall registration across every
instance. It would also create a lock-ordering invariant that every future
writer has to honour or deadlock.

The observable contract is therefore weaker than serialization and sufficient:

- a rule change governs operations that begin after it commits;
- an operation in flight when a rule changes may use either policy, consistently
  across all of its own URLs; and
- whatever commits is grandfathered, exactly as if it had arrived earlier.

This safety argument depends on one assumption worth stating for whoever builds
the deferred emergency-block capability: **no operation consults the policy on
behalf of an already-registered activity.** A block evaluated at use time would
not change the reasoning here, since it reads current state rather than
admission-time ordering. But a design that re-checked *this* allowlist during
launch, token issue, or passback would reintroduce exactly the torn state this
section says cannot occur, and would need to revisit it.

Activity creation itself races too, independently of the policy, and the
handling is not uniform across the writers.
`AgentAuthMutations.createActivity()` and
`ActivityStateMutations.createActivity()` insert with `onConflictDoNothing`, and
`ActivityProgressService.resolveTarget()` re-reads the winning row when its
insert returns nothing. `ActivityMutations.ensureActivitiesExist()` also uses
`onConflictDoNothing`. `ActivityMutations.createActivity()` — the single-row
insert the LTI deep-link path calls — does not, so a concurrent registration of
the same URL through deep linking surfaces a unique-constraint error today.

Close that gap as part of this feature. Two instructors deep linking the same
new activity URL at the same moment is ordinary behaviour, not an error, and one
of them should not see a failure for having lost the race. Every registration
must resolve a concurrent create of the same URL to the winning row and
continue: insert with `onConflictDoNothing`, and re-read by URL when the insert
returns nothing.

Handling it once is the point. The single registration entry point described
under *Core Ownership and Composition* owns this, so no path can be left out of
it. Association insertion is already idempotent everywhere.

## Core Ownership and Composition

Policy evaluation is cross-cutting internal domain logic, not an admin service
that agent code should call through the public commands facade. Put the policy
registry/service at the root of core composition before the `app`, `admin`, and
`agent` actor registries, then inject it where needed.

The shared service should own:

- parsing and normalizing rule input;
- pure candidate-to-rule matching;
- reading the active policy snapshot;
- checking or asserting registration eligibility.

Admin commands wrap its rule queries and mutations with admin authorization.
App and agent services receive only the internal evaluation interface. No host
route should query the table directly, and no client-side validator should be
able to make the final decision.

### One Registration Entry Point

Activity insertion currently exists independently in the app activities, agent
auth, and agent activity-state repositories, and each of the four registration
paths implements the same sequence around it: resolve the URL, evaluate it if
unseen, insert it, handle the race, report the outcome. Adding the policy check
to four separate implementations would repeat the arrangement that has already
let them drift:

- three insert with `onConflictDoNothing`; the deep-link path does not;
- `resolveTarget()` bounds the URL at 255 characters, matching the
  `activities.url` column, while `createAuthCode()` accepts an unbounded
  `z.string()` `redirect_uri` that fails as a database error instead; and
- the progress path treats durable authoring errors as whole-request failures,
  which this analysis has had to correct separately.

Give registration a single internal entry point instead, composed at the root
alongside the policy service and injected into every path that admits a URL. It
owns resolving a URL to an existing activity, the syntactic check, policy
evaluation against one snapshot, the insert, and the create race. Making it the
only writer is what makes "no bypasses" structural rather than a property each
reviewer has to re-verify.

**It returns denials; it does not throw them.** The four callers need different
outcomes from the same decision — the instructor paths raise a field error,
OAuth maps it to an OAuth error code, progress skips the target and reports it.
A service that threw would force the progress path into catch-and-continue,
which is the shape that made its existing failures wrong. Returning a per-URL
result lets each caller keep its own error policy while sharing the decision.

**Keep it narrow.** It does not own activity-code association, which only two
paths need and which this document's terminology section defines as *not*
registration; the per-code `url_prefix` check, which is instructor-only and out
of scope; or the self-reference check, which is progress-only because it needs
the reporting activity's id. A caller that needs the self-reference rule applies
it before calling.

This document fixes the seam and its contract, not the decomposition. Whether
the three existing repository methods are deleted, wrapped, or re-owned is a
sequencing question for the implementation plan.

### The Denial Error

Registration denial needs one error type, thrown by the three callers that fail
a request over it. It belongs to the registration module rather than to any
actor module, because `app/activities`, `app/lti`, and `agent/auth` all raise
it and none of them owns the concept.

Declare `ERR_ACTIVITY_URL_NOT_ALLOWED` in that module's `errors.ts`, following
the form of `app/activities/errors.ts`, at log level `warn` — it is caused by
user input, like every other `warn`-level domain error in core. Its details
carry the rejected URLs with the reason each was rejected:

```ts
details: { rejected: Array<{ url: string; reason: RegistrationDenialReason }> }
```

`RegistrationDenialReason` is the service's own union —
`activity_url_not_allowed`, `malformed_url`, `url_too_long` — and is the
rejected-target union from *Agent Progress Behaviour* minus `self_reference`,
which the progress caller adds itself. One vocabulary, not two overlapping ones.

Hosts read `result.error.code` as a string literal, as they already do
throughout the gradebook, so nothing needs exporting for that. They do need
`details`: no host reads `result.error.details` today, and the requirement that
a rejected submission name every offending URL cannot be met from a message
string. The activity-code server actions render it into `errors.urls`, which is
already a `string[]`.

Two mapping notes for the instructor paths. A URL that is not a URL at all is
rejected by the core request schema's `z.url()` before the policy runs, and
surfaces as `ERR_VALIDATION` — no second error code is needed for it, though
note `z.url()` is permissive enough to accept a `javascript:` URL, so the
registration service's syntactic check remains the real filter. And the
deep-link form must map **two** codes to its `activity_url` field:
`ERR_DEEP_LINKING` for a per-code `url_prefix` violation, which is unchanged,
and `ERR_ACTIVITY_URL_NOT_ALLOWED` for the sitewide denial. Missing the second
renders a policy denial as a generic failure.

## Alternatives Considered

### Allow all until the first rule exists

This is the earlier dynamic-activities proposal and minimizes initial setup. It
also makes adding the first rule a surprising global mode switch and leaves a
new site unrestricted by default. Rejected because it contradicts the ordinary
meaning and security posture of an allowlist.

### Re-check every request

Applying the current policy to known activities would make removal an immediate
revocation mechanism. That can be useful during an incident, but it couples
routine configuration to learner access, persisted state, tokens, and passback.
Rejected for this feature in favor of explicit grandfathering and a separately
designed block control.

### Treat each new activity-code association as registration

This would let rule removal stop a grandfathered activity from spreading into
additional codes while preserving its existing associations. It offers
administrators more control over future institutional adoption, but makes the
same known activity trusted for agent authentication and progress while
untrusted for curriculum categorization. It also makes an accidentally removed
association impossible to restore, can strand a bare lazy-created activity
outside code-scoped reporting, and gives `activity_activity_code` both grouping
and trust semantics. Rejected in favor of the simpler rule that the global
`activities` row records admission. New-deployment restrictions, if needed,
should be expressed directly.

### Delete activities that cease to match

This enforces a clean database at the cost of destructive cascades and lost
learner state. It also cannot distinguish a deliberate trust revocation from an
administrator correcting a path rule. Rejected.

### Store raw string prefixes

This mirrors `activity_codes.url_prefix` and is easy to explain superficially.
It is vulnerable to host-prefix and path-prefix confusion and leaves scheme,
port, normalization, and subdomains implicit. Rejected in favor of parsed origin
and path semantics.

### Reuse activity-code prefixes

Activity-code prefixes are owned by instructors and scope one curriculum
grouping. The sitewide allowlist is owned by administrators and gates all
registration, including activity rows with no code. Reusing the column would
leave agent-only creation uncovered and let instructors mutate site trust.
Rejected.

### Fail the whole progress request

This makes the server response simple but rolls back valid self progress along
with the rejected target, and because the page re-sends the same authored target
every time, it does so on every subsequent submission too. Rejected in favor of
per-target rejection in a successful response.

## Acceptance Criteria

A future implementation is complete when:

- only authenticated administrators with the declared allowlist abilities can
  list or mutate rules;
- zero enabled rules deny every new runtime registration;
- a rule matches one exact origin — HTTPS, or HTTP only for the permitted
  loopback hosts — and either all paths or one path-segment-bounded subtree;
- deceptive host prefixes, sibling path prefixes, userinfo, insecure remote
  HTTP, malformed URLs, and implicit subdomains do not match;
- a rule whose derived base URL exceeds 255 characters is rejected at creation
  rather than stored as a rule no activity URL could ever match;
- submitting a base URL that normalizes onto an existing rule never surfaces a
  constraint error: an enabled match reports that the rule already exists, and
  a disabled match offers to re-enable it with its description and provenance
  intact;
- seeding a database creates no allowlist rules, so a fresh install denies
  every registration until an administrator adds the first rule;
- activity-code creation and editing resolve every URL, evaluate only unseen
  URLs, and are atomic when any prospective registration is denied;
- any known grandfathered activity may be newly associated with an activity
  code or restored after its association was removed, subject to the code's
  independent prefix rule;
- LTI deep linking cannot create an unseen disallowed activity, and a denial is
  rendered as an activity URL field error without returning a content item;
- a known grandfathered activity may be associated and used in a new LTI deep
  link without matching the current policy;
- the existing per-code prefix remains an additional constraint;
- two concurrent deep links registering the same allowed unseen URL both
  succeed, resolving to the one winning `activities` row;
- agent authorization lazy-creates only an allowed unseen activity;
- no OAuth branch uses a `redirect_uri` that fails the syntactic check as a
  destination, including a `javascript:` or `data:` URI, one carrying userinfo,
  and one that today throws where the route parses it;
- that syntactic check is core's, called as a pure helper, not a second
  implementation in the route;
- a `redirect_uri` failing it lands the learner on the Modulus-owned
  `/agent/error` page, which answers `200`, selects its copy from a closed slug
  union, and reflects no caller-supplied value into the DOM;
- a disallowed OAuth request creates neither an activity nor an auth code and
  returns the learner to their page with `error=unauthorized_client`, never
  `access_denied`;
- the authorization route makes at most one core call per request, on the
  authenticated branch only;
- token exchange does not re-check a successfully admitted activity;
- a disallowed unseen cumulative target creates no activity, progress, event,
  or line-item record;
- self progress and allowed targets in that submission still commit;
- the response identifies rejected targets as durable per-target outcomes that
  the agent logs, and a rejected target never fails the submission carrying it;
- an over-long or self-referencing target is reported the same way, rather than
  failing the whole submission as it does today;
- known cumulative targets and side-effect-free reads do not query the policy;
- disabling, editing, or deleting rules never deletes or blocks existing
  activities, associations, tokens, state, launches, reports, passback, new code
  associations, or new deep links for known activities;
- the admin UI explains deny-all and grandfathering and previews the existing
  activities left outside the prospective policy;
- every URL in one admission operation is evaluated against a single policy
  snapshot, and no admission path serializes against allowlist mutation; and
- every path that admits a URL registers through the one shared entry point,
  which is the only writer of `activities` rows outside seeds and fixtures, so
  race handling, the 255-character bound, and the policy check cannot differ
  between paths; and
- the allowlist lives in a dedicated PostgreSQL table with administrator
  provenance and no learner PII.

## Risks and Mitigations

- **Administrators mistake removal for revocation.** Mitigate with explicit
  grandfathering copy and the prospective impact count. Do not use "block" or
  "disable activity" for rule operations.
- **An instructor cannot save an unrelated edit.** Mitigate by resolving the
  submitted URLs first and evaluating only those that are unseen, not every URL
  against the current policy.
- **The OAuth error path remains a narrowed open redirect.** Partially
  mitigated: the syntactic check removes credentialed-host disguises,
  `javascript:`/`data:` destinations, and the current unhandled `500`. A bounce
  to an arbitrary https origin is knowingly retained and deferred — see *What
  This Does Not Close*. Do not let the implementation plan describe this
  feature as having closed it.
- **The route grows its own copy of the URL check.** Mitigate by exporting
  core's validator as a pure helper. A host-side reimplementation would drift
  from core's rules exactly as the existing form validator already has.
- **One bad cumulative target withholds valid learner work.** Mitigate with
  per-target rejection, a successful response, and agent diagnostics.
- **A prefix implementation admits sibling hosts or paths.** Mitigate with
  parsed exact-origin comparison and path-segment tests rather than raw string
  prefixes.
- **Multiple processes observe stale policy.** Mitigate by avoiding initial
  process-local caching, so every admission reads the rules as they stand.
  A registration that races an administrator is accepted, not prevented; see
  *Consistency and Concurrency*.
- **Deny-all surprises a new operator.** Mitigate with prominent empty-state
  UI, reviewed development seeds, and explicit deployment sequencing.
- **Grandfathering leaves content usable after a security incident.** Accepted
  for this admission feature; mitigate through a separately specified emergency
  block capability rather than undocumented allowlist side effects.
- **A grandfathered activity can be adopted in new codes and deployments.**
  Accepted as the consequence of activity-level admission. If administrators
  need to stop new instructional uses without blocking existing ones, specify a
  separate deployment policy rather than changing the meaning of registration.

## Out of Scope

- implementing schema, services, commands, routes, forms, migrations, or tests;
- deleting, disabling, quarantining, or revalidating existing activities;
- an emergency activity/origin blocklist or kill switch;
- closing the authorization route's remaining open redirect. This feature
  narrows it to syntactically valid https destinations and records the rest as
  accepted; replacing the OAuth error bounce with a Modulus page and a return
  link is a separate, learner-visible change that needs stakeholder input,
  because session expiry is the common path and today it resolves with no
  learner action at all;
- wildcard domains, public-suffix reasoning, or automatic subdomain inclusion;
- proving control of a domain through DNS or HTTP challenges;
- URL canonicalization that merges existing `activities` rows;
- changing activity-code ownership, enrollment, reporting, or academic scopes;
- automatically associating agent-created activities with an activity code;
- redesigning progress retry/backoff beyond recognizing the new durable
  rejected-target outcome;
- moving per-code `url_prefix` enforcement into core. It stays where it is —
  the gradebook server actions for the activity-code forms, and
  `handleDeepLink()` for deep linking. "Centralize the decision inside core"
  governs the sitewide allowlist, not the per-code prefix, and unifying the two
  is a separate change;
- granting the new admin abilities to any existing database, which is a
  separate data migration; and
- updating shipped documentation before the feature is implemented and
  accepted.

## Resolved Decisions

Answered in review on 2026-09-02. The recommendation and requirements above
already reflect them.

1. **Audit history.** The allowlist rule's `created_by`, `updated_by`,
   `created_at`, and `updated_at` columns provide sufficient provenance. This
   feature does not add an immutable audit-event or mutation-history table.
2. **Instructor visibility.** Instructor-facing activity-code and deep-link
   forms do not display the allowlist or currently approved base URLs. A denied
   submission identifies the instructor-supplied URLs that failed and directs
   the instructor to a Modulus administrator.
3. **Rollout.** Modulus is not live. Its staging instance can tolerate
   interruptions and some data loss, so no compatibility bridge, data-preserving
   migration procedure, policy backfill, or special rollout sequence is needed.
4. **Emergency blocking.** A kill switch is not immediately required and is not
   part of this feature. The analysis retains it only as explicitly deferred
   future work.
5. **Remaining contracts.** Review confirmed the admission-only model, strict
   empty-state default, matching semantics, OAuth error surface, per-target
   progress response, global activity-level grandfathering, storage model,
   permission boundary, and implementation-planning handoff.

## Open Questions

None. All policy and product questions raised by this analysis have been
resolved for the baseline.

## Implementation-Planning Handoff

Review has confirmed the admission-only model, strict empty-state default,
matching semantics, OAuth error surface, per-target progress response, global
activity-level grandfathering, storage model, permission boundary, and the
scope of deferred work.

The next step is a separate implementation plan mapping the accepted contracts
into ordered tasks for:

1. rule schema, migration, constraints, and development seed policy;
2. the root-composed policy service, the pure URL matcher, and the shared
   registration entry point that every admitting path calls;
3. admin abilities, commands, server actions, and `/admin/activities` UI;
4. activity-code create/update resolve-before-create enforcement;
5. LTI deep-link enforcement for unseen URLs and form errors;
6. the shared pure URL validator, the authorization route's branch ordering and
   OAuth error mapping, ordered lazy creation, and the `/agent/error` page;
7. cumulative-target filtering, the rejected-target reason union and response
   schema, the agent's handling of it, and its changeset and release;
8. single-snapshot evaluation and the deep-link create-race fix;
9. unit, integration, route, and agent regression tests; and
10. updates to `DYNAMIC-ACTIVITIES.md`, `CUMMULATIVE-PROGRESS.md`,
    `AUTHN-AUTHZ.md`, `DATA-MODEL.md`, and `SECURITY-AND-PRIVACY.md` after the
    implementation is accepted.
