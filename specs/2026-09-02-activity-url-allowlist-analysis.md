# Sitewide activity URL allowlist — analysis

Date: 2026-09-02
Status: proposed; awaiting review
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

This document specifies a proposed sitewide allowlist for activity URLs. It
answers who controls the list, what counts as registering an activity, how each
registration path fails, and whether a later policy change affects activities
that Modulus has already accepted.

It does not authorize code, schema, migration, or UI changes. After review, the
approved contracts should be translated into a separate implementation plan.

## Question

How should a sitewide, administrator-managed activity URL allowlist govern
activity registration across instructor workflows and agent traffic, and
how—if at all—should changes to that allowlist affect activities and
associations that Modulus previously accepted?

The answer must cover every current runtime path that can insert an `activities`
row or associate an activity with an activity code:

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
4. **Check the policy when an operation would admit a new URL.** Inserting a new
   `activities` row is registration. Adding an existing global activity to a new
   activity code is also registration for that instructor-owned grouping.
5. **Do not re-check ordinary use of an already-registered activity.** Agent
   OAuth, token exchange and renewal, direct/self progress, page state, LTI
   launch, and cumulative updates to an existing activity continue to work even
   if no current rule matches its URL.
6. **Grandfather existing activities and associations.** Editing or deleting a
   rule never deletes an activity, removes an activity-code association, rejects
   an existing token, or blocks subsequent reads and writes. The admin UI should
   preview how many existing activities would sit outside the prospective
   policy and label them as grandfathered.
7. **Reject instructor registration atomically and visibly.** Activity-code
   creation checks every submitted URL. Activity-code editing checks newly added
   associations, while allowing unchanged grandfathered associations to remain.
   If any addition is disallowed, nothing in the form submission changes and the
   form identifies every rejected URL.
8. **Never redirect an OAuth error to an unapproved, unseen URL.** A disallowed
   authorization request ends on a Modulus-owned `403` error page. It does not
   create an auth code or activity, and it does not navigate back to the
   requested `redirect_uri`.
9. **Preserve self progress when a cumulative target is disallowed.** Skip the
   target, create no activity/progress/event/line-item data for it, commit the
   current page and other allowed targets, and return a successful response with
   a structured rejected-target result. The agent should log that result and
   must not retry it as a transient transport failure.
10. **Store normalized rules in PostgreSQL.** Use a dedicated
    `activity_url_allowlist_rules` table with exact origin and path-prefix
    columns, enabled state, description, administrator provenance, timestamps,
    and a uniqueness constraint. Do not put the rules in environment variables,
    reuse `activity_codes.url_prefix`, or introduce a generic settings JSON
    blob.
11. **Centralize the decision inside core.** Every host and actor path should
    call one policy service. Client-side form checks may improve feedback but
    are not enforcement.

The key consequence is intentional: removing a rule stops future admissions but
does not revoke past admissions. If administrators need an emergency kill
switch for compromised content, that should be designed separately as explicit
activity/origin blocking with its own launch, token, state, and score-passback
semantics.

## Terminology: Registration Versus Use

An allowlist is easy to apply inconsistently unless *registration* is defined as
an operation rather than inferred from which endpoint was called.

For this feature, an operation registers an activity URL when it does either of
the following:

- inserts a new row into `activities`; or
- adds a new row to `activity_activity_code` for that activity.

The second case matters because an activity can already exist globally after
agent OAuth or cumulative reporting but still be absent from every instructor's
activity code. Associating that URL with a code is a new institutional use even
though it does not insert another `activities` row.

Use means reading or writing an activity that Modulus has already admitted.
OAuth for a known activity, an LTI launch of an existing link, progress and page
state under an existing activity-bound token, and cumulative progress applied to
an existing target are uses, not registrations.

This produces the following enforcement matrix:

| Operation | When the allowlist is checked | Disallowed result |
| --- | --- | --- |
| Create an activity code with URLs | Every submitted URL | Reject the whole form; create neither code nor activities |
| Edit an activity code | Each newly added URL/code association | Reject the whole edit; retained associations need not match |
| LTI deep link | When the URL is not already associated with the selected code | Return a field error; create neither activity nor association |
| Agent authorization | Only when `redirect_uri` does not resolve to an activity | Render a Modulus-owned `403`; create no activity or auth code |
| Agent token exchange | Never; the authorization code names an admitted activity | Existing OAuth checks remain authoritative |
| Set self progress/page state | Never; the token is already activity-bound | Continue normally |
| Set cumulative progress | Only when a target URL does not resolve to an activity | Skip that target and report it as rejected; commit self and allowed targets |
| Get progress for other URLs | Never and never creates | Known URLs are read; unknown URLs remain omitted |
| LTI/direct launch | Never; launch does not register | Continue the existing launch policy |
| Seed/migration fixture insertion | Outside runtime policy | Explicit trusted bootstrap operation |

If a deep-link request names an activity that is already associated with the
selected code, it is reuse of an existing registration and may proceed while
grandfathered. If it names an existing activity that is not associated with the
selected code, the new association is checked.

## Current-State Findings

### Activity-code forms can register any syntactically accepted URL

`ActivityService.createActivityCode()` and `updateActivityCode()` call
`ensureActivitiesExist()` and then create `activity_activity_code` rows. The core
request schema uses `z.url()` but has no site policy. The gradebook server actions
apply stricter HTTPS/localhost validation and optionally require the URL to
start with that activity code's `url_prefix`, but those host checks are neither a
sitewide trust decision nor a core enforcement boundary.

The update service currently removes every association and recreates the
submitted set. An allowlist implementation cannot simply validate the complete
submitted set: doing that would make a harmless description edit fail until an
instructor also removed every grandfathered URL. It must load the old set and
validate only additions before performing the replace operation.

### LTI deep linking is another instructor registration path

`LtiDeepLinkingService.handleDeepLink()` validates the selected code's optional
`url_prefix`, creates the activity if necessary, and associates it with the
code. This is semantically the same admission as the activity-code edit page and
must use the same sitewide policy. Otherwise an instructor could bypass the
allowlist by entering the URL through Canvas deep linking.

The per-code prefix remains useful after this feature. It is an additional,
instructor-managed curriculum constraint; it cannot broaden the site policy. A
new URL must satisfy both rules when the code has a prefix:

```text
sitewide allowlist AND activity-code url_prefix
```

### Agent OAuth currently lazy-creates every unseen redirect URI

`AgentAuthService.createAuthCode()` looks up `redirect_uri` and unconditionally
calls `createActivity()` on a miss. `claimAuthCode()` later requires that row to
exist before it mints the activity-and-scope-bound access token.

The browser route adds a separate security concern. On some failures,
`/routes/agent/authorize` currently appends an OAuth error to the caller-supplied
`redirect_uri` and redirects the browser there. That is safe only after Modulus
has decided that the URI is a trusted redirect destination. A disallowed unseen
URI must therefore be classified before every branch that redirects to it,
including the unauthenticated `access_denied` branch. It is not sufficient to
put the check only inside the user-authenticated `createAuthCode()` call.

### Cumulative progress currently lazy-creates every unseen target

`ActivityProgressService.resolveTarget()` creates a bare activity for each
previously unseen `increments_for_other_pages[].url`, inside the same transaction
as self progress and cumulative updates. Existing target activities are not
activity-code scoped, by design.

A disallowed target must not turn the entire request into a retrying failure.
The learner's self high-water mark is valid independently of one bad authored
target, and the agent retries failed submissions. Returning a non-success status
would repeatedly submit a permanently invalid target and withhold otherwise
valid self progress. Skipping the target with a structured successful response
keeps the failure local to the misconfigured URL.

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

The recommended admin abilities are:

- `activity-url-allowlist:list`; and
- `activity-url-allowlist:manage` for create, edit, enable/disable, and delete.

The seeded Manager admin role receives both. Other admin roles receive neither
unless deliberately granted. Commands use `AdminRequestContext` and
`assertAdminAbilities`, so an instructor access token cannot call them even if
an ability string were accidentally duplicated across the actor domains.

The existing `/admin/activities` placeholder is the natural first UI. It should
list rules and provide create/edit, enable/disable, and delete actions. The
baseline does not require instructors to see the whole policy. Their forms
should identify the URLs they submitted that were denied and tell them to
contact a Modulus administrator.

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
may accept HTTP only for the exact loopback hosts `localhost`, `127.0.0.1`, and
`[::1]`, with an explicit port when needed. No other insecure origin is valid.

Malformed URLs never match. Instructor commands return validation errors; a
malformed OAuth redirect stays on a Modulus-owned `400` page; and a malformed
cumulative target is reported as a rejected target without creating data.

## Storage Recommendation

Use a dedicated relational table rather than configuration or a generic
settings record:

```text
activity_url_allowlist_rules {
  id           uuid pk
  origin       varchar(255) not null
  path_prefix  varchar(1024) not null default '/'
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

This shape is preferable because:

- rules are shared across all application instances and deployment modes;
- CRUD, uniqueness, provenance, and enable/disable state are explicit;
- policy queries can participate in the same database transaction as activity
  creation or association;
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

The admin page must explain the deny-all state prominently. Development seeds
may add the exact Ximera and loopback origins used by repository demos, but a
production migration must not infer trust by converting every historical
activity origin into an allowlist rule. Existing rows are grandfathered already;
automatically approving their origins would also approve unseen paths and hide
the administrator's decision.

If an existing deployment needs uninterrupted new registration during rollout,
the deployment sequence should create reviewed rules before enabling the gate.
That is an operational implementation-plan concern, not a reason to weaken the
steady-state default.

## Instructor Registration Behaviour

### Activity-code creation

Validate and normalize input first, evaluate every submitted URL against the
same policy snapshot, and return all disallowed URLs in one field error. Only
after all URLs pass may the transaction create the code, its initial member, the
activities, and the associations.

No partial registration is useful here. Creating a code with only the approved
subset would make the saved grouping differ silently from the instructor's
form.

### Activity-code editing

Load the currently associated URLs and compare them with the requested set.
Check only set additions. Retained associations are grandfathered and removals
are always allowed.

If any addition is disallowed, reject the whole edit before changing the code's
description, per-code prefix, or associations. The response should put a message
beside the URL field such as:

> This Modulus site does not allow these activity URLs: … Contact a Modulus
> administrator to request access.

The message may echo URLs the instructor submitted; it should not disclose
administrator identity or unrelated rules.

### LTI deep linking

Apply the same association rule after authenticating the instructor and loading
the selected activity code, but before creating an activity or association. A
disallowed URL returns a dedicated `ERR_ACTIVITY_URL_NOT_ALLOWED` core error,
which the gradebook maps to the deep-link form's `activity_url` field. It must
not return a signed content item to Canvas.

An existing per-code association may be deep-linked while grandfathered. A
global activity row without that selected association still needs approval,
because adding the association is a registration event.

## Agent OAuth Behaviour

### Previously unseen and allowed

For an authenticated learner, evaluate the redirect URI, create the bare
activity row, and create the authorization code. The two decisions should be one
logical transaction. A concurrent create of the same allowed activity resolves
to the winning row and remains successful.

The activity is not automatically associated with an activity code. The
allowlist expresses site trust, not curriculum ownership.

### Previously unseen and disallowed

Do not create an activity or authorization code. The browser must remain on a
Modulus-owned error surface with HTTP status `403` and learner-facing copy such
as:

> This activity is not approved for this Modulus site. Ask your instructor or a
> Modulus administrator for help.

The page may show the rejected origin to help diagnose authoring, but should not
echo an arbitrary full URL into links or HTML without ordinary escaping. Core
logs a warn-level, PII-free diagnostic with the normalized origin and path; it
does not log learner identity, LMS context, tokens, auth codes, or PKCE values.

Most importantly, the route must not redirect to the rejected URI. OAuth
authorization servers redirect errors only after validating a redirect URI;
otherwise the error path itself is an open redirect.

### Authorization-route ordering

The route needs a read-only core decision before any redirect branch:

```text
malformed URI                     -> Modulus 400 page
known activity                    -> URI is an admitted redirect destination
unknown URI matching allowlist    -> URI is eligible; create only after user auth
unknown URI not matching          -> Modulus 403 page, never redirect
```

This check does not create an activity for an unauthenticated request. If the
URI is eligible but the learner has no Modulus session, the existing
`access_denied` redirect may go back to it. If the learner is authenticated,
`createAuthCode()` performs the authoritative check-and-create so a host-only
precheck cannot bypass core.

`claimAuthCode()` does not re-check the policy. The activity exists by then, and
a rule removed between authorization and token exchange does not revoke the
admission. It retains the current single-use code, client id, redirect URI,
PKCE, enabled-user, activity, and scope validations.

## Agent Progress Behaviour

The policy applies only to previously unseen entries in
`increments_for_other_pages`. It does not apply to self progress, page state, or
known cumulative targets.

For each unseen target:

1. parse and evaluate the URL under the registration policy;
2. if allowed, lazy-create the bare activity and apply the contribution as now;
3. if disallowed, create no activity, progress row, event, or line-item update;
4. continue with the other targets; and
5. return the rejection as data in the successful response.

A proposed additive response shape is:

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

The agent should send this through its existing diagnostic logger and treat it
as a completed submission. A non-2xx response would misclassify a durable
authoring decision as a transient failure and trigger retries. Silent omission
would preserve data but leave authors unable to distinguish a policy denial
from a page whose cumulative progress happens to remain zero.

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
| Grandfather | Leave existing activities and associations operational; apply the new policy only to later registration | Preserves data and makes ordinary policy maintenance predictable | Content remains usable after its rule is removed, so urgent revocation requires a separate control |

Deletion is the most destructive interpretation and provides little recovery
value: an administrator cannot reliably reconstruct progress, page state,
events, line-item state, or historical associations by adding the rule back.
Blocking is reversible but is not narrow. Its exact meaning cannot be specified
without deciding every operation listed in the table, and different choices can
leave learners in internally inconsistent states.

Grandfathering best fits the stated core requirement, which is that only
matching URLs may be *registered*. It also keeps a routine allowlist edit from
silently becoming a data-retention or live-access operation. The cost is real:
rule removal is not an incident-response mechanism. On balance, this analysis
recommends grandfathering and treating emergency blocking as a separate feature
whose broader semantics are visible to administrators.

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
- deep linking through an association that already exists.

An instructor may remove its activity-code association. Re-adding that
association later is a new registration and must satisfy the policy then in
force.

No activity or learner state is deleted. Deletion would be disproportionate and
could cascade through progress, events, page state, line items, and reporting.
Continuously blocking old activities would also turn an apparently narrow rule
edit into an access-control and grade-processing change with active-token and
learner-support consequences.

The admin edit/delete confirmation should therefore use precise language:

> This change stops new registrations under this base URL. Existing activities
> and activity-code associations will continue to work.

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

The policy check and the registration mutation must use one policy snapshot. A
request must not pass a check, lose a race with an administrator removing the
last matching rule, and then insert or associate the URL after the policy change
has committed.

The implementation plan should serialize allowlist mutations against admission
transactions. A transaction-scoped PostgreSQL advisory lock is one suitable
mechanism: registration attempts take a shared lock only after an activity or
association miss, and admin mutations take the matching exclusive lock. The
exact mechanism can be selected in implementation planning, but the externally
observable contract is fixed:

- an admin change and a competing registration have a definite commit order;
- if registration commits first, it is grandfathered by the later admin change;
- if the admin change commits first, registration evaluates the new policy.

Activity creation must retain its current unique-URL race handling. Association
insertion remains idempotent.

## Core Ownership and Composition

Policy evaluation is cross-cutting internal domain logic, not an admin service
that agent code should call through the public commands facade. Put the policy
registry/service at the root of core composition before the `app`, `admin`, and
`agent` actor registries, then inject it where needed.

The shared service should own:

- parsing and normalizing rule input;
- pure candidate-to-rule matching;
- reading the active policy snapshot;
- checking or asserting registration eligibility; and
- the registration/admin serialization contract.

Admin commands wrap its rule queries and mutations with admin authorization.
App and agent services receive only the internal evaluation interface. No host
route should query the table directly, and no client-side validator should be
able to make the final decision.

All current runtime writers must be updated; enforcing only one repository
would leave bypasses because activity insertion currently exists independently
in app activities, agent auth, and agent activity-state repositories.

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

### Check only new `activities` rows

This is simpler, but an instructor could attach an old lazy-created URL to a new
activity code after it ceased to be approved. Rejected because a new
activity-code association is itself a registration of institutional use.

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

This makes the server response simple but rolls back valid self progress and
causes the agent to retry a permanent authoring error. Rejected in favor of
per-target rejection in a successful response.

## Acceptance Criteria

A future implementation is complete when:

- only authenticated administrators with the declared allowlist abilities can
  list or mutate rules;
- zero enabled rules deny every new runtime registration;
- a rule matches one exact HTTPS origin and either all paths or one
  path-segment-bounded subtree;
- deceptive host prefixes, sibling path prefixes, userinfo, insecure remote
  HTTP, malformed URLs, and implicit subdomains do not match;
- activity-code creation validates every URL and is atomic on denial;
- activity-code editing validates only newly added associations, so an
  instructor can edit metadata or remove URLs while grandfathered entries
  remain;
- LTI deep linking cannot bypass the sitewide check, and a denial is rendered
  as an activity URL field error without returning a content item;
- the existing per-code prefix remains an additional constraint;
- agent authorization lazy-creates only an allowed unseen activity;
- no OAuth branch redirects to an unseen disallowed or malformed URI, including
  the missing-session error branch;
- a disallowed OAuth request renders a PII-free Modulus-owned error surface and
  creates neither an activity nor an auth code;
- token exchange does not re-check a successfully admitted activity;
- a disallowed unseen cumulative target creates no activity, progress, event,
  or line-item record;
- self progress and allowed targets in that submission still commit;
- the response identifies rejected targets as durable per-target outcomes, and
  the agent logs rather than retries them;
- known cumulative targets and side-effect-free reads do not query the policy;
- disabling, editing, or deleting rules never deletes or blocks existing
  activities, associations, tokens, state, launches, reports, or passback;
- removing and later re-adding an activity-code association applies the policy
  in force at re-add time;
- the admin UI explains deny-all and grandfathering and previews the existing
  activities left outside the prospective policy;
- policy mutation and registration races have deterministic commit-order
  semantics; and
- the allowlist lives in a dedicated PostgreSQL table with administrator
  provenance and no learner PII.

## Risks and Mitigations

- **Administrators mistake removal for revocation.** Mitigate with explicit
  grandfathering copy and the prospective impact count. Do not use "block" or
  "disable activity" for rule operations.
- **An instructor cannot save an unrelated edit.** Mitigate by validating the
  association delta, not the complete post-edit URL set.
- **The OAuth error path becomes an open redirect.** Mitigate by making redirect
  eligibility a core decision before every branch that navigates to
  `redirect_uri`; invalid destinations stay on Modulus.
- **One bad cumulative target withholds valid learner work.** Mitigate with
  per-target rejection, a successful response, and agent diagnostics.
- **A prefix implementation admits sibling hosts or paths.** Mitigate with
  parsed exact-origin comparison and path-segment tests rather than raw string
  prefixes.
- **Multiple processes observe stale policy.** Mitigate by avoiding initial
  process-local caching and serializing rule writes with admission transactions.
- **Deny-all surprises a new operator.** Mitigate with prominent empty-state
  UI, reviewed development seeds, and explicit deployment sequencing.
- **Grandfathering leaves content usable after a security incident.** Accepted
  for this admission feature; mitigate through a separately specified emergency
  block capability rather than undocumented allowlist side effects.

## Out of Scope

- implementing schema, services, commands, routes, forms, migrations, or tests;
- deleting, disabling, quarantining, or revalidating existing activities;
- an emergency activity/origin blocklist or kill switch;
- wildcard domains, public-suffix reasoning, or automatic subdomain inclusion;
- proving control of a domain through DNS or HTTP challenges;
- URL canonicalization that merges existing `activities` rows;
- changing activity-code ownership, enrollment, reporting, or academic scopes;
- automatically associating agent-created activities with an activity code;
- redesigning progress retry/backoff beyond recognizing the new durable
  rejected-target outcome; and
- updating shipped documentation before the proposal is approved and
  implemented.

## Open Questions

These do not block the recommended baseline but should be answered before or
during implementation planning:

1. **Immutable audit history.** Are administrator UUIDs and timestamps on the
   current row sufficient for the first release, or must every rule mutation be
   retained in a dedicated audit-event table?
2. **Instructor visibility.** Should activity-code and deep-link forms show the
   currently approved base URLs proactively, or only explain a denial? The
   policy is not secret, but a long list may be a poor authoring interface.
3. **Rollout inventory.** Does any non-disposable deployment need rules prepared
   before the strict gate ships, and which existing origins should an operator
   review rather than auto-approve?
4. **Emergency blocking.** Is a separate kill switch required soon enough to be
   planned alongside this feature, or can it remain future work?

## Implementation-Planning Handoff

Do not implement from this draft until review confirms the admission-only model,
strict empty-state default, matching semantics, OAuth error surface, per-target
progress response, and grandfathering behaviour.

The follow-up implementation plan should map the accepted contracts into ordered
tasks for:

1. rule schema, migration, constraints, and development seed policy;
2. the root-composed policy service and pure URL matcher;
3. admin abilities, commands, server actions, and `/admin/activities` UI;
4. activity-code create/update delta enforcement;
5. LTI deep-link enforcement and form errors;
6. OAuth redirect prevalidation, atomic lazy creation, and the Modulus-owned
   error page;
7. cumulative-target filtering, response schema, and agent diagnostics;
8. registration/admin concurrency semantics;
9. unit, integration, route, and agent regression tests; and
10. updates to `DYNAMIC-ACTIVITIES.md`, `CUMMULATIVE-PROGRESS.md`,
    `AUTHN-AUTHZ.md`, `DATA-MODEL.md`, and `SECURITY-AND-PRIVACY.md` after the
    implementation is accepted.
