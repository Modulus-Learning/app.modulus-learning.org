# Launch interstitial optionality — analysis

Date: 2026-08-25
Status: proposed; review complete 2026-08-25; awaiting approval to plan
Related:

- `docs/LTI.md` — Flow 2 (resource-link launch) and the interstitial's place in it
- `docs/AGENT.md` — the OAuth 2.0 + PKCE handshake the learner lands in after the redirect
- `docs/AUTHN-AUTHZ.md` — session cookies and the agent flow
- `docs/SECURITY-AND-PRIVACY.md` — the no-PII-across-the-boundary constraint
- `apps/gradebook/src/app/routes/lti/launch/route.ts` — the launch handler that redirects to the interstitial
- `apps/gradebook/src/app/lti/launch/[...go]/page.tsx` — the LTI interstitial
- `apps/gradebook/src/modules/lti/components/lti-launch-activity.tsx` — its countdown UI
- `apps/gradebook/src/app/[lng]/(forms)/start-activity/[...go]/page.tsx` — the non-LTI interstitial
- `packages/core/src/modules/app/lti/services/launch.ts` — `handleActivityLaunch`
- `packages/core/src/modules/app/activities/services/start-activity.ts` — `startActivity`

Today every learner who clicks a Modulus assignment in Canvas is parked on a
Modulus-branded page for up to ten seconds before reaching the activity they
asked for. This document analyses what that page does, what it costs, and how it
could be made optional or removed.

It does not authorise code, schema, or configuration changes. Once reviewed and
approved, it should be followed by a separate implementation plan.

**Modulus has no live deployments.** There are no instances to upgrade, no
pre-existing LTI links in any Canvas course, and no learner bookmarks. Backward
compatibility is therefore not a requirement anywhere in this document, and no
recommendation here should be justified by it.

## Question

Should the launch interstitial remain unconditional, become configurable, become
a learner-dismissible page, or disappear?

The answer must keep the LTI launch correct (session established before the
agent's OAuth hop), keep the non-LTI `/start-activity` sign-in path working, keep
scope display names out of redirect URLs, and preserve a place to render launch
errors. Redesigning the non-LTI learner onboarding experience and adding a
general-purpose settings surface are explicitly *not* requirements.

## Executive Recommendation

Skip the interstitial on verified LTI launches by default, keep the page behind
a switch, and give it a purpose-built read command so it stops re-running the
launch handler's work.

Concretely:

1. **Let `/routes/lti/launch` choose the destination.** It already holds
   everything the interstitial re-derives, so in the skip case it should build
   the activity launch URL itself and issue one redirect.
2. **Gate that on an instance-level switch** — `LTI_LAUNCH_INTERSTITIAL` with
   values `never` / `always`, **defaulting to `never`**. An enum rather than a
   boolean, so `first-launch` can be added later without a breaking
   configuration change.
3. **Give the interstitial its own read-only core command**, keyed on
   `(activity_id, scope_id)` and taking no activity code. `startActivity` is the
   wrong command for this page — see
   [The Interstitial Is Stricter Than The Launch Handler](#the-interstitial-is-stricter-than-the-launch-handler)
   and [The Interstitial's Core Command](#the-interstitials-core-command).
4. **Re-key the LTI interstitial route to the activity id** —
   `/lti/launch/{activity_id}?scope_id=…` — and delete the old catch-all
   outright. No compatibility shim: nothing dereferences the old shape, and there
   are no existing links to preserve. The deep-link content item's `url` becomes
   the generic tool launch URL.
5. **Keep the page mounted** for the `always` mode and for the user gesture it
   provides — but not as *the* error surface, which it never was, and not as a
   JavaScript-free fallback, which it currently is not. Making it one is a small
   fix worth doing while the page is already being rewritten; see
   [Making The Retained Page Work Without JavaScript](#making-the-retained-page-work-without-javascript).
6. **Add a generic `/lti/error?code=…` route**, and route the launch handler's
   failures to it. Early failures have no `activity_id` and so cannot reach the
   re-keyed page at all; with `never` as the default they would otherwise all
   surface as raw JSON or a framework 500. See
   [The Error Surface](#the-error-surface).
7. **Defer `first-launch`.** It stays in this analysis as
   [Option E](#option-e--first-launch-only), but it is not part of the initial
   implementation and it is not free: the enrollment write cannot currently
   distinguish a first launch from a repeat one.
8. **Do not add a per-learner "don't show this again" preference.** Both storage
   mechanisms carry a real cost, and with `never` as the default the page most
   learners see is no page at all (see
   [Preference Storage](#preference-storage-cookie-versus-users-column)).
9. **Leave the non-LTI `/start-activity` interstitial alone.** It is a genuine
   sign-in surface, not a speed bump; it keeps its readable nested URL; and any
   change to it is out of scope.

The headline finding is that on the LTI path the interstitial is not merely
optional. Its work is redundant, and the redundancy is not inert: it re-derives
the launch under *stricter* rules than the launch handler applied, so an LTI link
whose activity code no longer resolves is honoured by the handler and then
hard-failed by the page. Skipping the interstitial, or re-pointing it at a
command that takes no activity code, repairs that. See
[The Interstitial Is Stricter Than The Launch Handler](#the-interstitial-is-stricter-than-the-launch-handler)
and
[The Second Lookup Can Fail Where The First Succeeded](#the-second-lookup-can-fail-where-the-first-succeeded).

## Resolved Decisions

Answered in review on 2026-08-25. The recommendation above already reflects them.

1. **Canvas framing.** Canvas opens a Modulus launch in a new tab when the
   instructor ticks "open in a new tab" while creating the link, and instructors
   are expected to choose that option in almost every case. So the dominant case
   is a **top-level tab**, where every Modulus navigation is first-party and the
   session and agent-authorize cookies behave normally. The iframe case survives
   as a minority path and is unchanged by this work — see
   [Frame Context and Third-Party Cookies](#frame-context-and-third-party-cookies).
2. **Shipped default.** `never`. The faster launch is the behaviour the analysis
   argues for, so it should be what an instance gets; the switch exists to
   restore the page, not to hide the fix behind an environment variable. An
   earlier draft recommended defaulting to `always` on two grounds, both since
   withdrawn: that a default-off skip path would go unexercised (overstated — the
   modes differ by one branch in one route, not by a subsystem), and that an
   instance upgrading without changes should see no behaviour change (void —
   there are no instances).
3. **Compliance.** The interstitial is **not** a compliance artefact. No
   institutional agreement depends on a pre-redirect notice, so the disclosure
   argument for keeping it is a product-quality argument, not a binding one.
4. **Instructor preview.** Rejected. Instructors should see exactly what their
   learners see, so the mode must not branch on
   `isInstructor(launch[CLAIM_ROLES])`.
5. **Readable nested URL.** The stakeholder requirement that the activity URL be
   legible in the address bar **does not apply to the LTI path**. The LTI launch
   already uses a dedicated interstitial, distinct from the direct-link one, and
   that page's URL may take a simpler shape — keyed on `activity_id` rather than
   the activity URL.
6. **The direct `/start-activity` path keeps its readable nested URL**, at least
   for now. `extractActivityLaunchParameters` and `appendQueryBeforeFragment`
   therefore stay in the codebase, narrowed to that one caller, along with the
   round-trip fragility that comes with them. Any change to that page is out of
   scope.
7. **`first-launch` is deferred.** The initial implementation ships two modes.
   The option is retained in this analysis rather than discarded.
8. **The agent-side connection badge is out of scope.** Accepted as a good idea,
   not part of this work.
9. **Detecting framed launches is out of scope.** Accepted as worth doing
   separately.
10. **The new command lives on `app.activities`**, alongside `startActivity`,
    rather than on `app.lti`.
11. **An unresolvable `(activity_id, scope_id)` pair renders the interstitial's
    existing "Launch Error" card**, not a new error surface.
12. **No compatibility shim, and no backward-compatibility requirement at all.**
    Modulus has no live deployments, no pre-existing LTI links, and no learner
    bookmarks. The old catch-all is deleted outright.
13. **Canvas surfaces the deep-link `url` nowhere**, so it need not be readable
    or carry the activity URL. It becomes the generic tool launch URL.
14. **The retained page is made to work without JavaScript** as part of this
    change — a server-rendered anchor, with the countdown demoted to an
    enhancement. Raised by independent review, which found the "JavaScript-free
    fallback" rationale contradicted both the component and this document's own
    cost analysis.
15. **A generic `/lti/error` route is in scope.** Raised by independent review:
    the recommended design had assumed launch failures already rendered readable
    cards, which they never did. The LTI-conformant error *response* to the
    platform remains out of scope.

## Current-State Findings

### There Are Two Interstitials, Not One

They share the `startActivity` server action and nothing else.

| | LTI interstitial | Direct interstitial |
|---|---|---|
| Route | `app/lti/launch/[...go]` | `app/[lng]/(forms)/start-activity/[...go]` |
| Reached from | the launch handler's redirect only | a link a learner or instructor follows |
| Component | `LtiLaunchActivity` | `StartActivity` → `LaunchActivity` / `NeedsUser` |
| Scope | `?scope_id` from the launch, validated as a UUID | always `DEFAULT_SCOPE_ID` |
| Auto-redirect | yes, 10 seconds, cancellable | no |
| Unauthenticated | renders "Authentication Required" | renders a sign-in form (`NeedsUser`) |
| Localised | no — sits outside `[lng]` | route is under `[lng]`; the strings are still hardcoded English |
| Navigation | `window.location.replace` | `router.replace` with an external URL |

Everything below concerns the LTI page unless it says otherwise. The direct page
is discussed in [The Non-LTI Path](#the-non-lti-path).

### The LTI Interstitial Performs No Work The Launch Handler Has Not Already Done

`handleActivityLaunch` (`packages/core/src/modules/app/lti/services/launch.ts`)
already, before it returns:

- resolves the activity from `modulus_activity_url` (`findActivityByURL`) and
  fails the launch outright if it does not exist;
- resolves the verified scope (`resolveVerifiedLaunchScope`);
- signs the learner in and mints tokens;
- enrolls the learner in the activity code (`enrollByPublicActivityCode`);
- upserts progress and reconciles the AGS line item.

It returns `{ type: 'start-activity', activity_code, activity_url, scope_id,
scope_name, tokens }`. The route sets the session cookies from `tokens` and
redirects.

The interstitial then calls `startActivity`, which re-reads the user, re-resolves
the activity code, re-resolves the activity by URL, re-resolves the scope, and
calls `enrollByActivityCodeId` — an idempotent no-op at this point. It uses the
result for exactly four values: `activity.url` and `scope_id` (which build the
redirect), and `scope_name` and the learner's name (which are display only, and
the name comes from the session rather than the result). Three of those are
already in the launch response. The fourth, `modulus_server_url`, is
`config.server.baseUrl` — available to the route as `publicServerUrl`.

So the LTI interstitial contributes five extra database round trips, a duplicate
enrollment attempt, and a page render, in exchange for display text.

### The Interstitial Is Stricter Than The Launch Handler

Confirmed in review: the LTI interstitial needs the activity code for nothing.

`LtiLaunchActivity` never references it — the component reads the session name,
`activity.url`, `scope_name`, `scope_id`, and `modulus_server_url`, and that is
all. The page passes `activityCode` to exactly one place: the `startActivity`
argument list. Inside that command the code is used for two things, both of which
`handleActivityLaunch` has already done:

- **Validation.** `findActivityCodeByPublicCode` resolves the code.
- **Enrollment.** `enrollByActivityCodeId` checks `isActivityInActivityCode` and
  inserts.

But the two paths do not agree on what an unresolvable code *means*, and the
disagreement is not incidental — it is documented on both sides.
`EnrollmentService.enrollByPublicActivityCode` carries the comment:

> Used by the LTI resource-link launch, which must tolerate a code that no longer
> resolves: an unresolvable code leaves the launch response unchanged.

and `handleActivityLaunch` states the same policy in its own comment. Meanwhile
`startActivity` throws `ERR_ACTIVITY_CODE_NOT_FOUND`, which the host's
`start-activity` action maps to neither of its two special cases and so renders
as the generic "Error starting activity".

So an LTI launch whose activity code has been deleted or renamed is deliberately
honoured by the launch handler — signed in, progress upserted, line item
reconciled, enrollment skipped with a warning — and is then hard-failed by the
interstitial two hundred milliseconds later. The redundant second pass is not
merely wasted work; it silently overrides a policy the launch handler chose on
purpose.

This is the concrete argument for the interstitial having its own command rather
than borrowing `startActivity`. It also means the fix is not only a
simplification: skipping the interstitial, or re-pointing it at a command that
takes no activity code, repairs a live inconsistency.

### The Second Lookup Can Fail Where The First Succeeded

The launch handler holds `modulus_activity_url` verbatim from the id_token's
custom claim. It then throws that fidelity away: the route serialises the URL
into a *path* (`/lti/launch/{code}/{activity_url}`) so the address bar stays
readable, and `extractActivityLaunchParameters` reassembles it from Next's route
segments on the other side.

`docs/LTI.md` already admits the consequence:

> an authored query, fragment, or literal percent escape embedded in that target
> is not guaranteed to round-trip through the catch-all route.

The failure mode is worth stating exactly, because it is not URL corruption. The
reassembled string is used only as the *lookup key* for
`findActivityByURL`; the URL the learner is actually sent to is the canonical
`activities.url` column read back from the database. So a lossy round trip does
not silently mis-navigate — it produces `ERR_ACTIVITY_NOT_FOUND` and a "Launch
Error" card for an activity the launch handler had already found a moment
earlier.

Two commits have already been spent on this seam (`c4ef7c6` "preserved readable
activity launch urls", `5bfbe6a` "reconstructed encoded activity launch urls").
Redirecting from the route removes the seam rather than hardening it again.

### Nothing Outside Modulus Links To The Interstitial Route

The deep-link content item sets
`url: ${publicServerUrl}/lti/launch/${activityCode}/${activityUrl}`, so Canvas
does store that path as the resource link's `target_link_uri`. But
`LtiLoginService` never reads `target_link_uri` — the field is parsed and
ignored behind a `// TODO: What should we do with target_link_uri here?`. Canvas
initiates OIDC at `/lti/login` and posts the launch to
`LTI_REDIRECT_URI` (`/routes/lti/launch`).

The interstitial route is therefore reachable only from Modulus's own redirect.
Changing where that redirect points — or what shape it takes — requires no Canvas
reconfiguration. This is what makes both the skip and the
[re-keying](#re-keying-the-lti-interstitial-url) cheap, and it would hold even if
courses full of assignment links existed.

It is also why **no compatibility shim is needed**. An earlier draft of this
document recommended one, reasoning that stored `target_link_uri` values would
otherwise 404. That was wrong twice over. Nothing dereferences the stored URL —
the browser never navigates to `target_link_uri` at any point in the flow, which
that same draft had already conceded a sentence before concluding the opposite.
And if Modulus ever does honour the claim as the specification intends, a tool
*parses* it server-side to select the resource; it does not send a browser to it,
so an HTTP redirect route would not help. With no live deployments there are no
stored links in any case. The old catch-all is deleted.

### The Launch Flow Already Has Three Error Shapes

The interstitial is often described as the flow's error surface. It is one of
three, and it catches the narrowest slice.

| Failure | Surface today |
|---|---|
| Malformed authentication response (`safeParse` fails) | `NextResponse.json({ status: 'failed', … })` — raw JSON |
| `handleLaunch` returns `!ok` (bad token, unknown platform, `ERR_INVALID_LAUNCH`) | raw JSON, same shape |
| Missing `state-<state>` cookie | `throw new Error('Missing state cookie')` — an unhandled throw, so a framework 500 |
| Interstitial's own parameter validation | "Launch Error" card |
| No session at the interstitial | "Authentication Required" card |
| `startActivity` fails | "Launch Error" card with the command's message |

Only the last three are readable, and all three live on the page. The route
carries `// TODO: Propert LTI error response, here and below` against the JSON
branches, so this is known and unfinished rather than deliberate.

Two consequences matter for this proposal, and they cut in opposite directions
from the way the interstitial is usually defended:

- Skipping the page does not remove a working error surface for launch failures,
  because the page never handled those. It removes the surface for its *own*
  validation failures, which under the recommended design stop occurring anyway.
- But it does mean that with `never` as the default, **every** learner-visible
  launch failure becomes raw JSON or a 500. That is a real regression in a flow
  that had one readable page, and it is why the error route is in scope rather
  than deferred.

### What The Page Genuinely Provides

Not nothing. An honest inventory:

- **Identity confirmation.** "Welcome, *Test Learner*" catches the shared-browser
  and wrong-account case before the learner starts submitting work under someone
  else's name.
- **Destination disclosure.** The learner sees they are leaving Modulus for a
  named third-party URL.
- **Scope disclosure.** "This activity will use the *Autumn 2026* learning
  context" is the only place a learner ever sees which scope their work will be
  recorded under.
- **A partial error surface.** Its own parameter validation,
  `ERR_LEARNER_NOT_FOUND`, and an absent session render as readable cards. It
  catches nothing that fails earlier — see
  [The Launch Flow Already Has Three Error Shapes](#the-launch-flow-already-has-three-error-shapes)
  for what it does not catch, and why that gap is now in scope rather than
  inherited.
- **A user gesture.** "Launch Now" is a real click on the Modulus origin. Nothing
  currently depends on it, but see
  [Frame Context and Third-Party Cookies](#frame-context-and-third-party-cookies).

### What It Costs

- **Up to ten seconds per launch**, on every launch, forever. `COUNTDOWN_SECONDS
  = 10` in `lti-launch-activity.tsx`. A learner working through a problem set
  pays it repeatedly.
- **A hard JavaScript dependency.** Every launch affordance is a
  `<button onClick={handleLaunch}>` — there is no anchor anywhere in the
  component — and the redirect is a `useEffect` timer. With scripting off the
  page renders inert controls above a `<noscript>` reading "JavaScript is
  required to launch this activity," offering no way forward. A server redirect
  has no such requirement, and the retained page should not have one either
  ([below](#making-the-retained-page-work-without-javascript)).
- **English only.** The route sits outside `[lng]`, so no locale is negotiated
  and every string is hardcoded.
- **Learned dismissal.** A page that always says the same thing and then leaves
  is a page learners stop reading, which devalues the disclosure it exists to
  make.

## Options

### Option A — Server-Side Redirect For LTI Launches

`/routes/lti/launch` calls `buildActivityLaunchUrl` with the launch response's
own `activity_url` and `scope_id` plus `publicServerUrl`, and redirects there
directly. `buildActivityLaunchUrl` sets only `modulus` and `scope_id`, so the
existing "scope name must not appear in the redirect" assertion in
`route.test.node.ts` continues to hold.

One caveat: the route would use the verbatim claim value rather than the
canonical `activities.url` column. `handleActivityLaunch` found the row by that
exact string, so they agree on the value that matters — but the launch response
should carry the resolved activity's `url` (and ideally its `id`) explicitly
rather than leaving the route to assume it.

- **Gains** — removes the ten-second wait, the JavaScript dependency, five
  database round trips, the duplicate enrollment call, and the lossy path hop.
- **Loses** — all four disclosures and the error page, unless the page is kept
  for the error path (it should be).
- **Effort** — small. One route change, a launch-response field, and test
  updates.

### Option B — Instance Switch

An environment variable that selects the behaviour, following the
`DEPLOYMENT_MODE` precedent in `apps/gradebook/src/config/index.ts` — a `z.enum`
with a default, validated at boot.

```
LTI_LAUNCH_INTERSTITIAL = never | always      # first-launch deferred
```

`never` is the shipped default. The switch is the escape hatch, not the opt-in:
an instance gets the faster launch, and an operator who wants the page back —
because a stakeholder asks, or because a storage-access mitigation needs the user
gesture (see
[Frame Context and Third-Party Cookies](#frame-context-and-third-party-cookies))
— sets one variable.

**An enum, not a boolean**, even with only two values today. `first-launch` is
deferred rather than rejected, and adding a third state to a boolean later is a
breaking configuration change for every instance that set it.

There is no migration story to write. With no live deployments, nothing has to be
set before deploying and no operator can be surprised — the first instance ever
stood up simply gets the analysed behaviour. `docs/DEPLOYMENT.md` documents the
key; there is nobody to announce a change to.

- **Gains** — the analysed improvement is what instances actually get;
  reversibility in both directions without a deploy; a single documented place to
  describe the trade-off.
- **Loses** — one more configuration key to document in `.env.example` and
  `docs/DEPLOYMENT.md`.
- **Effort** — small.

### Option C — Learner "Don't Show This Again"

Show the page with a checkbox; honour the stored preference on later launches.
Two storage choices, analysed in
[Preference Storage](#preference-storage-cookie-versus-users-column). In short:
a cookie mostly works now that launches are known to open in a new tab, but is
per-device and fails in the framed minority case; a `users` column is reliable
but buys a per-learner opt-out of a page that, on an instance configured for
`never`, most learners should never have seen in the first place.

- **Gains** — learner agency; a defensible answer to "we removed a disclosure".
- **Loses** — every learner still pays the full cost at least once per browser
  (cookie) or once ever (column); adds a write path, a preference-resolution
  rule, and a settings affordance for reversing it.
- **Effort** — medium. Schema or cookie plumbing, a server action, UI, tests, and
  a way to undo the choice.

### Option D — Per-Activity-Code Switch

A `show_launch_interstitial boolean not null default true` column on
`activity_codes`, exposed in the instructor dashboard alongside the existing
`url_prefix` control.

This is the option with the best *authority* story: the instructor owns the
cohort, knows whether their learners have been briefed, and already configures
the code. It is also the only option that can differ between a first-year survey
course and a graduate seminar on the same instance.

- **Gains** — the decision sits with the person who knows the answer.
- **Loses** — a schema change, a dashboard control, and a resolution rule for
  launches whose code does not resolve (`enrollByPublicActivityCode` already
  tolerates that case, so the interstitial decision must too).
- **Effort** — medium.

### Option E — First-Launch-Only

**Deferred, not rejected.** Retained here because it is the natural third mode if
the disclosure is later judged worth keeping.

Show the interstitial the first time a learner enters an activity code, and never
again for that code. The disclosure lands when it is new information; the
repetition disappears.

**The signal does not currently exist, and an earlier draft of this document was
wrong to say it did.** `EnrollmentService` does return an `EnrollmentOutcome`
discriminated union, but `status: 'enrolled'` does not mean "a row was inserted"
— it means "enrollment was attempted and the learner was eligible". The write
underneath is:

```ts
// packages/core/src/modules/app/activities/repository/index.ts
async enrollInActivityCode(user_id: string, activity_code_id: string): Promise<void> {
  await this.db.get()
    .insert(enrollment)
    .values({ user_id, activity_code_id })
    .onConflictDoNothing()
    .catch(this.utils.wrapDbErrorNew())
}
```

`Promise<void>`, no `.returning()`, and `enrollByActivityCodeId` returns
`{ status: 'enrolled' }` unconditionally afterwards. A learner's tenth launch is
indistinguishable from their first. The outcome type exists for the reason its
docstring gives — so tests can assert behaviour without scraping logs — not to
identify first launches.

Making the signal real is small but not nothing, and it touches the one service
the codebase designates as the single writer of enrollment:

- `enrollInActivityCode` returns the rows from `onConflictDoNothing().returning()`
  instead of `void`. Postgres resolves the conflict atomically and yields zero
  rows to the loser, so "did *I* insert this" is race-safe by construction —
  two concurrent first launches produce exactly one `inserted`.
- `EnrollmentOutcome` gains the distinction, most naturally as a third status
  (`'enrolled' | 'already_enrolled' | 'skipped'`) to match the existing
  discriminated-union style rather than a boolean field on `'enrolled'`.
- Existing assertions on `status === 'enrolled'` in the enrollment tests have to
  be re-read, since the meaning of that member narrows.

Two behavioural caveats remain regardless. A learner who clicks past the page by
reflex never sees it again. And the two `skipped` reasons —
`unknown_activity_code` and `activity_not_in_activity_code` — answer neither
"first launch" nor "repeat launch", so the mode needs a defined and tested
fallback rather than treating a skip as a first launch by default.

- **Gains** — near-zero steady-state cost, disclosure preserved where it matters,
  no new table and no new column.
- **Loses** — requires changing the enrollment repository, service return type,
  and existing tests; ties a UI decision to an enrollment side effect, which is a
  coupling worth naming; needs a fallback rule for the two skip reasons.
- **Effort** — small-to-medium.

### Option F — Delete The Interstitial Entirely

Option A with the page removed rather than retained.

Not recommended, though the margin narrows once `/lti/error` is in scope: a
generic error route removes the strongest objection, since launch failures would
then have somewhere readable to land whether or not the interstitial exists.

What remains is enough. Deleting the page removes the `always` mode entirely —
the escape hatch the switch exists to provide, including for a future
storage-access mitigation that needs the user gesture — and forgoes the
no-JavaScript path the page is about to gain. The page is cheap to keep once
nothing routes through it by default.

### Other Ideas Considered

- **Zero-delay handoff page.** Keep the page, drop the countdown to zero, and
  redirect on first paint (or via a server `303`). This is Option A with extra
  steps: the learner still sees a flash of Modulus chrome, and the JavaScript
  dependency survives unless the redirect is server-side.
- **Move the disclosure into the activity.** The agent already receives `user`,
  `scope_id`, and `scope_name` from the token exchange, and exposes `scope_id`
  and display-only `scope_name` on `AuthStatus`. A small persistent "Connected to
  Modulus as *Name* — *Autumn 2026*" badge on the activity page would make the
  identity and scope disclosure *continuous* rather than a page learners click
  past. This is the strongest replacement for what the interstitial actually
  provides, and it is independent of every option above. It belongs to `apps/agent`
  and its consumers, so it is a separate piece of work — but it should be
  considered before concluding that removing the interstitial removes a
  disclosure.
- **Error-and-mismatch-only.** Redirect silently unless something is worth
  saying: the launch failed, or the LTI identity differs from an existing Modulus
  session. The second condition is the shared-browser case the interstitial's
  "Welcome, *Name*" line is really for, and it can be detected in the route by
  comparing the pre-launch session (if any) against `signIn.user`. This is a good
  refinement to layer on any of A/B/E, not an option on its own.
- **Instructor preview.** *Considered and rejected in review.* Keeping the full
  interstitial for launches whose LTI roles mark the actor as an instructor would
  be cheap — `isInstructor(launch[CLAIM_ROLES])` is already computed in
  `handleActivityLaunch` — but it would mean instructors never see what their
  learners see. The mode must not branch on role.

## Comparison

| | Removes the wait | Keeps disclosure | Learner control | Instructor control | Schema change | Effort |
|---|---|---|---|---|---|---|
| A — server redirect | always | no | no | no | no | S |
| B — instance switch | per instance | per instance | no | no | no | S |
| C — don't show again | after first | first launch per browser/account | yes | no | cookie or column | M |
| D — per-code switch | per code | per code | no | yes | yes | M |
| E — first-launch-only | after first | first launch per code | no | no | no | S–M |
| F — delete | always | no | no | no | no | S |

The recommendation is A gated by B, defaulting to the skip. E is deferred; C, D,
and F are not pursued. Two changes apply regardless of mode and are therefore not
options in this table: giving the interstitial
[its own read command](#the-interstitials-core-command) and
[re-keying its URL](#re-keying-the-lti-interstitial-url).

## Recommended Design

Layer B over A, re-key the interstitial's URL, give it its own command, and keep
the page for errors.

**Resolution order**, evaluated in `/routes/lti/launch` after a successful
`handleActivityLaunch`, with no branch on LTI role:

1. If `LTI_LAUNCH_INTERSTITIAL=always` → redirect to
   `/lti/launch/{activity_id}?scope_id=…`.
2. Else (`never`, the shipped default) → redirect straight to
   `buildActivityLaunchUrl({ activityUrl, modulusServerUrl, scopeId })`.

Failures do **not** keep their current path, and an earlier draft of this
document was wrong to say they did. Under `never` the interstitial is not
rendered, so the only readable error surface in the flow disappears with it. This
change therefore owns a generic error route — see
[The Error Surface](#the-error-surface).

Two extension points, neither in the initial implementation. `first-launch`
(Option E) becomes a third branch between 1 and 2, reading an `EnrollmentOutcome`
that would first have to be taught to distinguish an insert from a no-op. Option D's per-code override slots in
above the instance default, with an unresolvable code falling through to it.

### The Error Surface

The recommendation adds a first-party error page at **`/lti/error?code=<slug>`**,
activity-independent and reachable without any launch context.

It is required, not optional, and the re-keying is what makes that unavoidable.
Early failures — a malformed authentication response, a missing state cookie, an
unknown platform, `ERR_INVALID_LAUNCH` because no `activities` row matches the
claim — occur *before* an activity is resolved. They have no `activity_id`, so
they cannot route to `/lti/launch/{activity_id}`. There is no version of the
activity-keyed page that can serve them. A generic route is the only thing that
can.

The design:

- `/routes/lti/launch` redirects to `/lti/error?code=…` in place of every
  `NextResponse.json({ status: 'failed' })`, and in place of the bare
  `throw new Error('Missing state cookie')`.
- `code` is a small closed set of opaque slugs — `invalid_request`,
  `invalid_launch`, `session_expired`, `server_error` — chosen for what the
  learner should do next, not for what went wrong internally. Diagnostics stay in
  the existing `log.error({ lti_launch: … })` calls, which already capture the
  detail.
- The page lives beside the interstitial under the existing
  `apps/gradebook/src/app/lti/layout.tsx`, so it inherits the same chrome and the
  same non-localised treatment as the rest of that surface.
- The interstitial keeps its own "Launch Error" and "Authentication Required"
  cards for the `always` mode, since those failures *do* have context and are
  better rendered in place.

**What stays out of scope** is the LTI-conformant error response — signing and
posting an error back to the platform, or honouring a platform-supplied error
return URL. That is a different piece of work against the specification, and the
route's `// TODO: Propert LTI error response` refers to it. Bringing a readable
first-party page into scope does not require finishing that, and conflating the
two is what let this get deferred in the first place.

### The Interstitial's Core Command

`startActivity` is the wrong command for the LTI interstitial, and review has
confirmed why: the page needs the activity code for nothing at all. It is not
displayed, and both things `startActivity` does with it — resolve it, and enroll
through it — were already done by `handleActivityLaunch`. Worse, the second pass
disagrees with the first about unresolvable codes, so it converts a launch the
handler deliberately honoured into an error page. See
[The Interstitial Is Stricter Than The Launch Handler](#the-interstitial-is-stricter-than-the-launch-handler).

The page should instead call a **read-only command keyed on `(activity_id,
scope_id)`**. Review has placed it on the **`app.activities`** branch, alongside
`startActivity` — with the data it returns rather than with the LTI launch that
precedes it, so a later non-LTI caller does not have to reach into `app.lti`:

```ts
// proposed
core.app.activities.getActivityLaunchView(userAuth, {
  activity_id: string,   // uuid
  scope_id: string,      // uuid
})
// → {
//     user: { id, full_name? },
//     activity: { id, url, name? },
//     scope_id, scope_name,
//     modulus_server_url,
//   }
```

Named for the data it returns rather than the page that consumes it, so a second
caller does not have to pretend to be an interstitial.

Three properties matter:

- **It takes no activity code and performs no enrollment.** That is what removes
  both the duplicate work and the policy contradiction. A launch whose code no
  longer resolves renders the interstitial normally, matching what the launch
  handler already decided.
- **It mutates nothing.** `startActivity` remains the mutating command for the
  direct `/start-activity` path, which still needs the code for a learner who
  arrives without a prior launch.
- **An unresolvable pair renders the existing "Launch Error" card.** The command
  returns not-found and the page reuses the error state it already has for
  missing or malformed parameters. The failure mode changes — a bad `activity_id`
  or `scope_id` rather than a mangled URL — so it needs its own test, but not its
  own UI.
- **Its authorisation rule needs an explicit decision.** The obvious tightening —
  require the learner to be enrolled in a code containing the activity — must be
  rejected: enrollment is deliberately skipped for an unresolvable or
  disassociated code, so that rule would fail the interstitial for exactly the
  case this change is fixing. The defensible rule is the status quo, stated
  rather than inherited: **require an authenticated session, and nothing more.**
  Re-keying in fact *raises* the barrier rather than holding it level. Today the
  page needs an `activity_codes.code` and an activity URL — a public code and
  public Ximera content, both knowable without guessing. The re-keyed route needs
  a uuidv7 `activities.id`, which is not. The scope half is unchanged either way:
  `findScopeById` resolves a scope and returns its display name without checking
  any relation to the user or the activity, so an authenticated caller can
  already render an unrelated `scope_name` today. That is status quo, and worth
  recording as such rather than discovering later. If a stronger binding is
  wanted, a short-lived signed handoff parameter minted by the launch route is
  the shape to reach for, not an enrollment check.

### Making The Retained Page Work Without JavaScript

The page is described in places as a JavaScript-free fallback. It is not, and an
earlier draft of this document asserted that it was while also, thirty lines
earlier, listing its hard JavaScript dependency as a reason to skip it. The same
fact cannot argue both ways; independent review caught the contradiction.

The current component offers three ways to launch — the `Launch Now` button, the
"click here" link, and the countdown — and all three are
`<button onClick={handleLaunch}>` plus a `useEffect` timer. None is an anchor.
With scripting disabled the learner gets inert controls and a `<noscript>` that
tells them JavaScript is required without offering a route forward.

Since the page is being rewritten anyway to call the new command, the fix rides
along:

- **The server component renders the destination as a real anchor.** It already
  has everything `buildActivityLaunchUrl` needs, and that function is pure, so
  the `href` can be computed server-side and emitted in the initial HTML.
- **The countdown becomes a pure enhancement.** Auto-redirect, the cancel
  control, and the live counter stay client-side and decorate the anchor that is
  already there.
- **The `<noscript>` tells the truth.** It should say the automatic redirect
  needs JavaScript and point at the link, rather than claiming the activity
  cannot be launched.

This is worth doing on its own merits, independent of the fallback argument. A
launch is a navigation, so an anchor is the correct element for it: it restores
middle-click, open-in-new-tab, copy-link, and the keyboard and assistive-technology
behaviour that a `<button>` standing in for a link discards. That matters in a
repository that has already spent a dedicated analysis on chart accessibility.

Only after this is the "JavaScript-free fallback" rationale true, and only then
should the recommendation lean on it.

### Re-Keying The LTI Interstitial URL

Review has confirmed that the readable-nested-URL requirement does not bind the
LTI path.

An earlier draft called this the most valuable single change in the proposal,
reasoning that the lossy catch-all would otherwise stay live on every instance.
With `never` as the default that argument no longer holds — the default path
does not touch the catch-all at all. The honest case is narrower and still
sufficient: `always` is a supported mode, so the page it serves must be correct
rather than latently broken, and once the command in
[The Interstitial's Core Command](#the-interstitials-core-command) is keyed on
`(activity_id, scope_id)`, keying the route the same way is nearly free.

The route becomes:

```
/lti/launch/{activity_id}?scope_id={uuid}
```

Both segments are UUIDs. The activity URL — the only value that was ever at risk
in transport — never appears in a Modulus-owned URL on the LTI path again, so the
class of failure described in
[The Second Lookup Can Fail Where The First Succeeded](#the-second-lookup-can-fail-where-the-first-succeeded)
disappears from that path in both modes.

`appendQueryBeforeFragment` and `extractActivityLaunchParameters` do **not**
disappear from the codebase. Review has kept the readable nested URL on the
direct `/start-activity` path, so the helpers narrow to that single caller and
keep their tests — and that path keeps the round-trip fragility the LTI path
sheds. That is a deliberate, recorded consequence, not an oversight.

Two consequences to design for:

- **The launch response must carry `activity_id`.** `handleActivityLaunch`
  already resolves the `activities` row; it currently returns only
  `activity_code` and `activity_url`. Adding the resolved id (and `url`) is a
  small, additive change to `LaunchResponse`.
- **`urlBuilder.startActivityUrl` splits in two.** It builds the deep-link
  content item's `url` today from `(activityCode, activityUrl)`. The LTI shape
  now wants the activity id — which `handleDeepLink` has, since it
  finds-or-creates the `activities` row before constructing the content item —
  while the direct path keeps the readable form. Two builders, named for their
  surfaces.

**The old catch-all is deleted, with no shim.** Independent review found the
shim both unnecessary and unimplementable as specified, and it was right on both
counts. Unnecessary: nothing dereferences `target_link_uri`, and with no live
deployments there are no stored links to strand. Unimplementable: resolving a URL
to an activity id needs a URL-keyed lookup the design does not have —
`startActivity` is the only existing one, and it is the mutating, code-strict
command this proposal exists to stop calling — and it could never be complete,
since fragments do not reach the server and authored queries are ambiguous in the
old route. A shim would have kept `extractActivityLaunchParameters` wired into
the LTI path to serve traffic that does not exist, preserving the exact defect
the re-keying removes.

### The Deep-Link Content Item's URL

`handleDeepLink` builds the content item's `url` from
`urlBuilder.startActivityUrl(code, activityUrl)`, and Canvas stores it as the
resource link's `target_link_uri`. Review has established that **Canvas surfaces
that URL nowhere** — not in assignment settings, not anywhere an instructor sees
it. Combined with the fact that Modulus ignores the claim, the URL is read by
nobody and dereferenced by nothing.

It should therefore become the **generic tool launch URL**,
`${publicServerUrl}/lti/launch` — which `urlBuilder.ltiLaunchUrl` already is, and
which `launch.test.ts:419` already uses as its `target_link_uri` fixture. A single
stable tool endpoint is the ordinary LTI pattern, and the resource identity
already travels in the signed custom claims (`modulus_activity_code`,
`modulus_activity_url`), which is what `handleActivityLaunch` actually reads.

There is a positive argument beyond simplicity. Under `never` the learner is
redirected straight to the activity and never reaches the interstitial, so a
per-activity `target_link_uri` naming that page would assert a landing place that
does not exist. A generic launch URL makes no false claim.

`urlBuilder.startActivityUrl` then serves only the direct `/start-activity` path
and keeps its readable form.

### Where The Switch Should Live

Environment configuration, not the database. There is no settings table in
`packages/core/src/database/schema/source/`, no settings module under
`packages/core/src/modules/admin/`, and no settings page in the admin surface —
which is otherwise well developed, with CRUD for users, roles, admin users,
admin roles, activities, and LTI platforms. Introducing a general settings
mechanism to hold one enum would be a considerably larger change than the change
it enables, and it would want a considered design rather than one column bolted
on. The `DEPLOYMENT_MODE` enum in `apps/gradebook/src/config/index.ts` is the
precedent to follow, including boot-time validation.

Per-*code* configuration (Option D) is different: `activity_codes` already
carries instructor-owned configuration in `url_prefix`, and the dashboard already
edits it. That is a natural home if and when the per-code decision is wanted.

### Preference Storage: Cookie Versus Users Column

If Option C is adopted despite the recommendation, the storage choice matters
more than it first appears.

**A cookie** is weaker than it looks, though less catastrophically so than this
analysis first assumed. Review has established that launches normally open in a
new tab, which makes Modulus cookies first-party in the common case — so a
preference cookie would usually persist. Two problems remain. It is per-browser
and per-device, so a learner re-dismisses on every machine and after every
cleared profile. And in the minority iframe case — an instructor who missed the
"open in a new tab" checkbox — the cookie is third-party (`SameSite=None;
Secure`) and subject to browser restrictions, so it silently fails to persist in
exactly the configuration where the wait is most intrusive. A preference that
works except when it is most wanted is a poor preference.

**A `users` column** is the right shape if the feature is built. There is direct
precedent — `remember_me` and `agreed_to_terms` are both `boolean not null
default` columns on `users` — and the launch handler already has the signed-in
user in hand, so reading it costs nothing extra. It survives across devices and
browsers, and it is unaffected by frame context. The column would need a matching
control somewhere in the learner dashboard so the choice can be reversed; a
preference with no undo is a support burden.

Note that `first-launch` mode (Option E) would deliver most of what Option C
promises without either mechanism — the difference is only whether the learner
*chose* to stop seeing the page or simply stopped seeing it. Both are deferred,
and with `never` as the default neither is needed to remove the wait.

## Frame Context and Third-Party Cookies

This was the one area where removing a click could plausibly break something.
Review has largely settled it.

**Canvas opens the launch in a new tab when the instructor ticks "open in a new
tab" at link-creation time, and instructors are expected to choose that in almost
every case.** The deep-link content item's
`window: { targetName: 'modulus-<code>-<url>' }` names the window; the
instructor's checkbox decides whether one is used. So the dominant case is:

- **Top-level tab (expected).** Every navigation to the Modulus origin is
  first-party. The session cookie set by `/routes/lti/launch`, and the cookie
  read later by `/routes/agent/authorize`, both behave normally. Removing the
  interstitial changes nothing about cookie behaviour.

The minority case survives and is worth stating, because it is the one an
instructor can create by accident:

- **Iframe (instructor did not tick the box).** Modulus cookies are third-party
  throughout — both today and after the change. The agent's OAuth hop to
  `/routes/agent/authorize` is a cross-site navigation that must carry the
  session cookie, or the route redirects back with `error=access_denied`, which
  the agent surfaces as "session has ended". This fragility is **pre-existing and
  independent of the interstitial**: the page does not make the iframe case work
  today, it just fails a little later in the sequence.

That said, the interstitial's one genuinely irreplaceable property is that
"Launch Now" is a **user activation on the Modulus origin**. Nothing in the
current code uses it. But if a future mitigation for the iframe case requires
`document.requestStorageAccess()`, that call needs transient activation — and the
interstitial is the only place in the flow where a learner clicks a Modulus
button. Skipping it forecloses the cheapest version of that mitigation.

Two consequences, both already in the recommendation. First, keep the page
mounted and reachable rather than deleting it, so a storage-access requirement
is a reason to set `always` rather than to rebuild the page. Second, since the
iframe case is now understood to be an instructor misconfiguration rather than
the norm, a clearer long-term answer is to detect it — the launch handler could
warn when a launch arrives framed — instead of preserving a ten-second page for
every learner on the strength of it.

A caveat worth recording: "expected to choose that option in almost every case"
is a statement about instructor behaviour, not an enforced constraint. Nothing in
Modulus requires the checkbox, and nothing today reports how often it is missed.

## The Non-LTI Path

`/start-activity/[...go]` should not be changed by this work, for two reasons.

First, it is not a speed bump. When there is no session it renders `NeedsUser`,
which is a sign-in form — the only way a direct-link learner can authenticate.
There is nothing to skip.

Second, when there *is* a session it renders `LaunchActivity`, which has problems
that a redirect would hide rather than fix:

- It tells every learner "you've come from the Ohio State University Canvas
  Learning Management System (LMS)" — which is precisely what a learner on the
  non-LTI path did *not* do.
- It hardcodes `DEFAULT_SCOPE_ID`, so a direct launch silently discards scope.
- It has three placeholder "visit ... for more information" strings.
- It calls `router.replace` with an external URL, where the LTI component
  correctly uses `window.location.replace`.
- `sessionName` reads `session?.user?.full_name ?? session?.user.full_name` —
  the same expression twice.

These are worth a separate, small cleanup. Folding them into an interstitial
decision would conflate "should we show this page" with "this page is wrong".

## Trade-Offs

The recommendation trades a guaranteed, repeated, low-value disclosure for a
faster and more robust launch, and with `never` as the default it makes that
trade on every instance's behalf rather than offering it.

The cost is that learners will no longer see a statement of which scope their work
is recorded under. That is a real loss even though review has confirmed it is not
a compliance one, and it should not be waved away. Deferring `first-launch`
sharpens it: there is now no mode between "every launch" and "never". The
mitigation was never `first-launch` anyway — a learner reads a page once and
forgets it — but the persistent agent-side badge that would be the real answer is
also out of scope, so for the initial implementation the disclosure is simply
gone unless an operator sets `always`.

`docs/DEPLOYMENT.md` should describe `always` as a supported configuration rather
than a legacy one, so that an operator who wants the disclosure knows it is a
first-class choice. No migration guidance is needed, since there is nothing
deployed to migrate.

Deferring `first-launch` also has a structural cost worth naming, and it is
larger than an earlier draft of this document claimed. Adding the mode later
means changing `enrollInActivityCode` to report whether it inserted, widening
`EnrollmentOutcome`, and revisiting the enrollment tests — modest work, but work
inside the service the codebase designates as the single writer of enrollment,
which is not somewhere to make an incidental change. That is a reason to defer it
deliberately rather than to treat it as a later free addition.

The configuration shape matters for the same reason. Shipping a boolean would
make the third state a breaking configuration change on top of that service
change, which is why the recommendation specifies an enum with two values rather
than `LTI_LAUNCH_INTERSTITIAL_ENABLED`.

The change also concentrates more responsibility in `/routes/lti/launch`. It
already validates state, handles the launch, and sets cookies; it would also
decide the destination. That is the right place for the decision — it is the only
component that holds the verified launch result — but the route is growing, and
the destination-selection logic should be extracted into a small, directly
testable helper rather than inlined.

Finally, the readable-URL requirement recorded in `docs/LTI.md` no longer binds
the LTI path, but review has confirmed it still governs the direct
`/start-activity` path. Two consequences. `docs/LTI.md` states the requirement
without qualifying it by surface, so the doc needs amending to say which one it
now governs. And `appendQueryBeforeFragment` and `extractActivityLaunchParameters`
survive with a single caller — so the codebase ends up with one launch path that
is robust and one that is not, which is a better state than today but not a tidy
one. Whoever revisits `/start-activity` inherits that.

## Acceptance Criteria

A future implementation of the recommendation is complete when:

- `LTI_LAUNCH_INTERSTITIAL` is validated at boot as a `never | always` enum,
  **defaults to `never`**, and appears in `.env.example` and
  `docs/DEPLOYMENT.md`;
- with `never`, a verified resource-link launch redirects once, directly to the
  activity URL carrying only `modulus` and `scope_id`;
- with `always`, a verified resource-link launch shows the interstitial and
  reaches the same activity URL;
- neither mode branches on `isInstructor` — an instructor and a learner launching
  the same link take the same path;
- a new read-only command returns the interstitial's display data for one
  `(activity_id, scope_id)` pair, takes no activity code, and performs no
  enrollment;
- `startActivity` is not called on the LTI path in either mode, and no duplicate
  enrollment or association check occurs;
- **an LTI launch whose activity code no longer resolves reaches the activity in
  both modes**, matching the launch handler's documented policy — this is the
  regression test for
  [the stricter-than-the-handler defect](#the-interstitial-is-stricter-than-the-launch-handler);
- the LTI interstitial route is keyed `/lti/launch/{activity_id}?scope_id=…`, and
  no Modulus-owned URL on the LTI path contains an activity URL;
- `LaunchResponse` carries the resolved activity's `id` and `url`;
- the old `/lti/launch/[...go]` catch-all is deleted, and no shim replaces it;
- the deep-link content item's `url` is the generic tool launch URL, while
  `urlBuilder.startActivityUrl` is unchanged and serves the direct
  `/start-activity` path only;
- a launch whose activity URL carries an authored query, fragment, or literal
  percent escape reaches the activity in **both modes**, including cases that
  fail today through the catch-all route;
- no redirect URL in either mode contains `scope_name` — the existing
  `route.test.node.ts` assertion is extended to cover the direct-redirect path;
- session cookies are set before the redirect in both modes, and the agent's
  subsequent `/routes/agent/authorize` request authenticates;
- the new command is exposed on `core.app.activities`;
- the interstitial requires an authenticated session and no more, with that rule
  stated in the code rather than inherited;
- an `(activity_id, scope_id)` pair that does not resolve renders the existing
  "Launch Error" card, with a test covering a bad activity id and a bad scope id;
- a `/lti/error?code=<slug>` route exists, renders a readable page without any
  launch or activity context, and is reachable when no `activity_id` has been
  resolved;
- every `NextResponse.json({ status: 'failed' })` branch in `/routes/lti/launch`
  redirects there instead, and the bare `throw new Error('Missing state cookie')`
  does too, so no learner-visible launch failure returns raw JSON or a framework
  500 in either mode;
- error codes are a closed set of opaque slugs carrying no internal diagnostics,
  while the existing `log.error({ lti_launch: … })` detail is unchanged;
- the interstitial page renders its error, authentication-required, and success
  states when reached directly under the new URL shape;
- the interstitial's primary launch control is a server-rendered anchor whose
  `href` is the fully-built activity launch URL, present in the initial HTML;
- with JavaScript disabled, the interstitial can still reach the activity, and
  its `<noscript>` describes the missing auto-redirect rather than claiming the
  activity cannot be launched;
- the countdown, its cancel control, and the auto-redirect are enhancements over
  that anchor and are the only launch behaviour that requires scripting;
- the destination-selection logic lives in a helper with direct unit tests
  covering both modes;
- `/start-activity`, its components, its URL shape, and
  `extractActivityLaunchParameters` are unchanged, and their tests still pass;
- `docs/LTI.md` Flow 2 is updated to describe the switch and the re-keyed URL,
  and its readable-nested-URL note is amended to say it governs the direct
  `/start-activity` path only.

## Risks and Mitigations

- **`always` rots because it is no longer the default.** It is not today's code
  path any more — new URL shape, new command — so it needs deliberate coverage
  rather than an assumption that it still works. Mitigated by testing both modes
  in CI. This is the mirror of a risk an earlier draft overstated in the other
  direction; it is real but small, since the modes differ by one branch.
- **The new command's authorisation is set too tight.** Requiring enrollment
  would fail the interstitial for the unresolvable-code case this change exists
  to fix. Mitigated by specifying session-only authorisation explicitly, with a
  test for the unresolvable-code path.
- **An instructor forgets the "open in a new tab" checkbox.** The launch lands in
  an iframe, Modulus cookies become third-party, and the agent's authorize hop
  may fail with `access_denied`. Pre-existing and not caused by this change,
  though skipping the page removes the only user activation on the Modulus
  origin. Mitigated by keeping the page mounted so `always` can restore it, and
  better addressed by detecting framed launches — out of scope here.
- **Launch errors become raw JSON for everyone.** Under `never` the interstitial
  is not rendered, so the flow's only readable error surface is gone and every
  failure falls back to JSON or a 500. This is the risk that moved the error
  route from deferred into scope; mitigated by `/lti/error` and the acceptance
  criteria above.
- **The scope disclosure is gone by default.** Not a compliance risk — review has
  confirmed that — and not mitigated by anything in this scope, since both
  `first-launch` and the agent badge are deferred. Operators who want it set
  `always`.
- **The two launch paths diverge in robustness.** The LTI path sheds the lossy
  URL round trip; `/start-activity` keeps it. Accepted deliberately, and recorded
  so the next person to touch that page knows it is inherited, not overlooked.

## Out of Scope

Confirmed in review:

- **The direct `/start-activity` path in its entirety** — its readable nested
  URL, its copy, its scope handling, `NeedsUser`, and the defects listed in
  [The Non-LTI Path](#the-non-lti-path). It keeps `startActivity` and the
  reassembly helpers unchanged.
- **The `first-launch` mode** (Option E), deferred to a later change.
- **The agent-side connection badge**, accepted as a good idea but not part of
  this work.
- **Detecting or reporting framed launches**, and any third-party-cookie or
  Storage Access API mitigation.

Also out of scope:

- A general-purpose admin settings table or settings UI.
- The per-activity-code switch (Option D) and the per-learner preference
  (Option C).
- The **LTI-conformant error response** — signing an error back to the platform
  or honouring a platform error return URL, which is what the route's
  `// TODO: Propert LTI error response` refers to. The readable first-party error
  page *is* in scope; the specification work is not.
- Any change to the deep-link content item's `window.targetName`. Its `url`
  *does* change, to the generic tool launch URL — see
  [The Deep-Link Content Item's URL](#the-deep-link-content-items-url).

## Open Questions

None. Every question this analysis raised has been answered in review and
recorded under [Resolved Decisions](#resolved-decisions) or
[Out of Scope](#out-of-scope).

## Implementation-Planning Handoff

Review has settled the mode set, the shipped default, the compliance and role
questions, both URL shapes, the new command's placement and error behaviour, and
the scope boundary around `/start-activity`. Nothing is outstanding.

The next step is a separate
`specs/2026-08-25-launch-interstitial-optionality-implementation-plan.md` mapping
the agreed behaviour to ordered tasks with explicit verification after each:

1. `LTI_LAUNCH_INTERSTITIAL` config key and boot validation.
2. `LaunchResponse` gains the resolved activity's `id` and `url`.
3. The read-only `getActivityLaunchView` command, with the unresolvable-code
   case tested.
4. The re-keyed `/lti/launch/{activity_id}` route and page, calling (3), with
   the server-rendered launch anchor and the countdown demoted to an
   enhancement.
5. The `/lti/error` route and its closed set of error codes.
6. The destination-selection helper and the branch in `/routes/lti/launch`,
   including redirecting every failure branch to (5).
7. Deletion of the old catch-all route and its helpers' LTI-side wiring.
8. The generic deep-link content item `url`.
9. Test matrix across both modes, including every error branch; confirm
   `/start-activity` is untouched.
10. `docs/LTI.md`, `docs/DEPLOYMENT.md`, and `.env.example`.
