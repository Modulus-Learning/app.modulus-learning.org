# Launch interstitial optionality — implementation plan

Date: 2026-08-26
Status: proposed; not started
Related:

- `specs/2026-08-25-interstitial-page-analysis.md` — the approved analysis and
  the source of every contract below
- `docs/LTI.md` — Flow 2 resource-link launch, which changes shape here
- `docs/AGENT.md` — the OAuth hop the learner lands in after the redirect
- `docs/DEPLOYMENT.md` — where the new configuration key is documented
- `apps/gradebook/src/app/routes/lti/launch/route.ts`
- `apps/gradebook/src/app/lti/launch/[...go]/page.tsx`
- `apps/gradebook/src/modules/lti/components/lti-launch-activity.tsx`
- `packages/core/src/modules/app/activities/commands.ts`
- `packages/core/src/modules/app/lti/services/launch.ts`

This plan maps the approved analysis to ordered core, host, deep-link, test, and
documentation tasks with explicit verification after each one. It does not
authorise work beyond those tasks.

## Outcome

A verified LTI resource-link launch redirects the learner straight to the
activity. The interstitial survives behind a configuration switch, keyed on the
activity id, served by its own read-only command, and usable without JavaScript.
Launch failures land on a readable page instead of raw JSON or a framework 500.

The work is complete when:

1. `LTI_LAUNCH_INTERSTITIAL` is a boot-validated `never | always` enum defaulting
   to `never`;
2. with `never`, a verified resource-link launch performs exactly one redirect,
   straight to the activity URL carrying only `modulus` and `scope_id`;
3. with `always`, the same launch reaches the same activity URL by way of
   `/lti/launch/{activity_id}?scope_id=…`;
4. neither mode branches on LTI role;
5. `core.app.activities.getActivityLaunchView` returns the interstitial's display
   data for one `(activity_id, scope_id)` pair, takes no activity code, and
   writes nothing;
6. `startActivity` is never called on the LTI path, and no duplicate enrollment
   or association check occurs;
7. an LTI launch whose activity code no longer resolves reaches the activity in
   both modes;
8. no Modulus-owned URL on the LTI path embeds an activity URL, and the old
   `/lti/launch/[...go]` catch-all is deleted with no shim;
9. `/lti/error?code=<slug>` renders readably with no launch context, and every
   failure branch in `/routes/lti/launch` redirects there;
10. the interstitial's primary launch control is a server-rendered anchor, and
    the countdown is the only launch behaviour requiring scripting;
11. the deep-link content item's `url` is the generic tool launch URL; and
12. `/start-activity` — its route shape, components, command, and
    `extractActivityLaunchParameters` — is untouched.

## Non-Negotiable Contracts

Every task must preserve these, taken from the approved analysis:

- **No learner PII crosses the boundary.** The redirect carries `modulus` and
  `scope_id` only. `scope_name` must never appear in any URL; the existing
  assertion in `route.test.node.ts` is extended, not relaxed.
- **The launch handler's tolerance is authoritative.** An unresolvable activity
  code, or an activity no longer associated with its code, honours the launch and
  skips enrollment. Nothing downstream may re-impose a stricter rule. This is the
  defect the change exists to repair.
- **Enrollment has one writer.** `EnrollmentService` stays the only writer, and
  this change adds no enrollment call site. The new command mutates nothing.
- **The session precedes the hop.** Session cookies are set before any redirect
  in both modes, so the agent's later `/routes/agent/authorize` request
  authenticates.
- **Error codes carry no diagnostics.** `/lti/error` receives a slug from a closed
  set. Detail stays in the existing `log.error({ lti_launch: … })` calls.
- **No backward compatibility is owed.** Modulus has no live deployments, no
  pre-existing LTI links, and no learner bookmarks. No task may add a shim,
  fallback route, or migration on compatibility grounds.
- **`/start-activity` is out of scope.** It keeps `startActivity`, its readable
  nested URL, and its helpers. Only its LTI sibling changes.

## Decisions This Plan Makes

Resolved during review; recorded so the implementer does not relitigate them.

- **The command lives on `app.activities`**, named `getActivityLaunchView` for
  the data it returns rather than the page that consumes it.
- **Authorisation is session-only**, stated explicitly in the command. An
  enrollment check is forbidden: enrollment is deliberately skipped for an
  unresolvable or disassociated code, so requiring it would fail the interstitial
  for exactly the case being fixed.
- **An unresolvable pair renders the existing "Launch Error" card**, not a new
  surface and not a redirect to `/lti/error`.
- **The switch lives in host configuration**, not core and not the database. The
  destination decision belongs to the route, and the route reads host config.
- **An enum, not a boolean**, so `first-launch` can be added later without a
  breaking configuration change.
- **`first-launch`, the per-code switch, the per-learner preference, the
  agent-side badge, framed-launch detection, and the LTI-conformant error
  response are all excluded.**

## Execution Rules

- Work on the existing `feat/interstitial-page` branch, which already carries the
  analysis. Open one pull request against `develop` at Task 8. Do not merge as
  part of this plan.
- Complete tasks in order. After each task is committed, stop for independent
  review before starting the next.
- One focused conventional commit per task, lowercase and past tense, with no
  trailers and no `-s`. Corrective commits for review findings belong to the task
  whose acceptance they repair.
- **Every task must leave the tree compiling, linted, and green on both test
  runners.** No task may leave `always` mode broken between commits — this is why
  the new page is added before the route is flipped.
- Behaviour tests ship in the same commit as the production change they cover.
- `pnpm lint` rewrites files; use `pnpm lint:check` as the gate and let the
  pre-commit hook format staged files.
- Core tests run on `node:test` via `tsx`, not vitest. Gradebook tests run on
  vitest in both jsdom and node modes.

## Dependency Map

| Phase | Task | Depends on | Primary boundary |
| --- | --- | --- | --- |
| 1 | 1. Add `getActivityLaunchView` | approved analysis | core repository, service, command, registry |
| 1 | 2. Carry the resolved activity through the launch response | — | core LTI schema and handler |
| 2 | 3. Add the generic LTI error route | — | host route + page |
| 2 | 4. Add the re-keyed interstitial page | Tasks 1, 2 | host page + component |
| 2 | 5. Flip the launch route and delete the catch-all | Tasks 2, 3, 4 | host config + launch route |
| 3 | 6. Generic deep-link content item URL | Task 5 | core URL builder |
| 3 | 7. Update shipped documentation | Tasks 1–6 | docs |
| 3 | 8. Full verification and pull request | Tasks 1–7 | acceptance |

Tasks 1, 2, and 3 are mutually independent and may be reviewed in any order among
themselves; the numbering is for review convenience.

---

## Phase 1 — Core Contracts

### Task 1 — Add The Activity Launch View Command

Proposed commit: `feat(core): added read-only activity launch view command`

The interstitial's replacement for `startActivity`. Read-only, keyed on ids,
blind to activity codes. Nothing calls it yet; Task 4 wires it up.

Files:

- revise `packages/core/src/modules/app/activities/repository/index.ts`;
- revise `packages/core/src/modules/app/activities/schemas.ts`;
- add `packages/core/src/modules/app/activities/services/activity-launch-view.ts`;
- add `packages/core/src/modules/app/activities/services/activity-launch-view.test.ts`;
- revise `packages/core/src/modules/app/activities/commands.ts`;
- revise `packages/core/src/modules/app/index.ts`; and
- revise `packages/core/src/modules/app/activities/repository/index.itest.ts`.

#### Repository

Add `findActivityById` beside the existing `findActivityByURL`, in the same
shape:

```ts
@method
async findActivityById(id: string): Promise<ActivityRecord | undefined> {
  return await this.db
    .get()
    .query.activities.findFirst({ where: eq(activities.id, id) })
    .catch(this.utils.wrapDbErrorNew())
}
```

No other repository change. `findScopeById` and `getUser` already exist and are
reused as-is.

#### Schemas

Add to `schemas.ts`, beside the `startActivity` pair:

```ts
export const activityLaunchViewRequestSchema = z.strictObject({
  activity_id: z.uuid(),
  scope_id: z.uuid(),
})

export const activityLaunchViewResponseSchema = z.strictObject({
  user: z.strictObject({
    id: z.string(),
    full_name: z.string().optional(),
  }),
  activity: z.strictObject({
    id: z.string(),
    name: z.string().optional(),
    url: z.url(),
  }),
  scope_id: z.uuid(),
  scope_name: z.string().nullable(),
  modulus_server_url: z.string(),
})
```

Note the deliberate absence of `activity_code`. The response is
`startActivityResponseSchema` minus that member; do not derive one from the other
— they are separate contracts that happen to overlap, and coupling them would
re-create the pressure to reuse `startActivity`.

#### Service

`ActivityLaunchViewService` mirrors `StartActivityService`'s construction
(`BaseService`, `@method`, injected `logger`, `config`, `queries`) but takes **no
`EnrollmentService`**. That omission is the point of the class and should carry a
comment saying so.

Resolution order and errors, reusing the existing error types:

1. `getUser(userAuth.id)` → `ERR_LEARNER_NOT_FOUND` if absent;
2. `findActivityById(activity_id)` → `ERR_ACTIVITY_NOT_FOUND` if absent;
3. `findScopeById(scope_id)` → `ERR_ACTIVITY_SCOPE_NOT_FOUND` if absent;
4. return the view, with `modulus_server_url: this.config.server.baseUrl`.

No enrollment call. No `findActivityCodeByPublicCode`. No association check.

Add a class-level comment recording the authorisation rule and why it is not
tighter:

> Authorisation is session-only and deliberately no tighter. Requiring the
> learner to be enrolled in a code containing the activity would fail the
> interstitial for a launch whose activity code no longer resolves — the exact
> case the LTI launch handler chooses to honour.

#### Command And Registry

In `commands.ts`, add beside `startActivity`:

```ts
@cached get getActivityLaunchView() {
  return this.utils.createCommand({
    method: 'getActivityLaunchView',
    auth: { mode: 'user', abilities: [] },
    schemas: {
      input: activityLaunchViewRequestSchema,
      output: activityLaunchViewResponseSchema,
    },
    handler: this.launchViewService.getActivityLaunchView.bind(this.launchViewService),
  })
}
```

Add `launchViewService` to the constructor `deps` and, in
`packages/core/src/modules/app/index.ts`, add
`.addClass('launchViewService', ActivityLaunchViewService)` to
`createActivityRegistry()` **before** `.addClass('commands', ActivityCommands)`.
The registry is compile-time checked, so a misordered or missing entry fails
`typecheck` rather than at runtime.

#### Tests

`activity-launch-view.test.ts` (core, `node:test`), using the same fake-queries
approach as `start-activity.test.ts`:

- returns the view for a valid pair, with `modulus_server_url` from config;
- throws `ERR_LEARNER_NOT_FOUND`, `ERR_ACTIVITY_NOT_FOUND`, and
  `ERR_ACTIVITY_SCOPE_NOT_FOUND` for each missing record;
- **succeeds when the activity is associated with no activity code at all** —
  the regression test for the stricter-than-the-handler defect;
- asserts no enrollment mutation is invoked, by passing a mutations fake whose
  `enrollInActivityCode` throws if called.

Add an integration case to `repository/index.itest.ts` covering
`findActivityById` hit and miss.

Verification:

```sh
pnpm -F @modulus-learning/core test:one src/modules/app/activities/services/activity-launch-view.test.ts
pnpm -F @modulus-learning/core test
pnpm -F @modulus-learning/core test:integration
pnpm typecheck && pnpm lint:check
```

---

### Task 2 — Carry The Resolved Activity Through The Launch Response

Proposed commit: `feat(lti): carried the resolved activity id through the launch response`

Additive. `handleActivityLaunch` already resolves the `activities` row and throws
it away; the route needs the id to build the interstitial URL and the canonical
URL to build the redirect.

Files:

- revise `packages/core/src/modules/app/lti/schemas.ts`; and
- revise `packages/core/src/modules/app/lti/services/launch.ts`.

In `launchResponseSchema`, extend the `start-activity` member:

```ts
z.strictObject({
  type: z.literal('start-activity'),
  activity_code: z.string(),
  activity_id: z.uuid(),        // added
  activity_url: z.string(),
  scope_id: z.uuid(),
  scope_name: z.string().nullable(),
  tokens: userTokensSchema,
}),
```

In `handleActivityLaunch`, populate `activity_id: activity.id` and change
`activity_url` to `activity.url` — the canonical column rather than the claim
string. They agree today, since `findActivityByURL(activity_url)` matched on that
exact value, but the database row is the authority and the redirect should use
it.

`activity_code` stays in the response. It is still needed for enrollment inside
the handler and is informative in logs; only the *interstitial* stops consuming
it.

Because the union member is `strictObject`, adding a field without updating
`launch.test.ts` fixtures fails core's tests. Update them.

Verification:

```sh
pnpm -F @modulus-learning/core test:one src/modules/app/lti/services/launch.test.ts
pnpm -F @modulus-learning/core test && pnpm typecheck && pnpm lint:check
```

---

## Phase 2 — The Host Launch Path

### Task 3 — Add The Generic LTI Error Route

Proposed commit: `feat(lti): added a readable launch error page`

Self-contained and independently valuable: it replaces raw JSON and an unhandled
throw with a readable page, before any behaviour flip depends on it.

Files:

- add `apps/gradebook/src/app/lti/error/page.tsx`;
- add `apps/gradebook/src/app/lti/error/page.test.node.tsx`;
- revise `apps/gradebook/src/app/routes/lti/launch/route.ts`; and
- revise `apps/gradebook/src/app/routes/lti/launch/route.test.node.ts`.

#### The Page

Lives under the existing `apps/gradebook/src/app/lti/layout.tsx`, so it inherits
the chromeless LTI shell, the deployment-mode guard, and the same non-localised
treatment as the interstitial. It reads one query parameter:

```
/lti/error?code=<slug>
```

The closed set, with the learner-facing message each maps to:

| `code` | Cause | Message |
| --- | --- | --- |
| `invalid_request` | malformed authentication response | The launch request was not valid. Please return to your LMS and try again. |
| `invalid_launch` | `handleLaunch` returned `!ok` | This activity could not be launched. Please contact your instructor. |
| `session_expired` | missing `state-<state>` cookie | Your launch could not be completed. Please return to your LMS and open the activity again. |
| `server_error` | anything else | Something went wrong on our end. Please try again. |

An unrecognised or absent `code` renders `server_error`. No slug carries internal
detail, and the page must not echo the raw query value into the DOM.

`session_expired` deserves a code comment. The state cookie is set
`SameSite=None`, so the most likely cause in practice is a launch rendered inside
a Canvas iframe with third-party cookies blocked — the instructor did not tick
"open in a new tab". Today that path is an unhandled `throw` and a framework 500;
after this task it is a readable instruction. Detecting and reporting the framed
case is out of scope, but the comment should name it so the next reader does not
mistake this for a generic fallback.

#### Route Wiring

Replace, in `/routes/lti/launch`:

- both `return NextResponse.json({ status: 'failed', … })` branches with
  `redirect('/lti/error?code=invalid_request')` and
  `redirect('/lti/error?code=invalid_launch')` respectively; and
- `throw new Error('Missing state cookie')` with
  `redirect('/lti/error?code=session_expired')`.

Keep every existing `log.error({ lti_launch: … })` call exactly as it is. The
logging is the diagnostic channel; the slug is not.

Leave the `// TODO: Propert LTI error response` comment in place, reworded to say
that the LTI-conformant response to the platform is still outstanding and that
the redirect is the first-party surface only.

#### Tests

- `page.test.node.tsx`: each slug renders its message; an unknown slug and a
  missing slug both render `server_error`; a slug value containing markup is not
  reflected into the output.
- `route.test.node.ts`: add three cases asserting the redirect target for a
  malformed body, a missing state cookie, and a failed `handleLaunch`; assert no
  response body is JSON on those paths.

Verification:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=node src/app/lti/error/page.test.node.tsx
pnpm -F @modulus-learning/gradebook test && pnpm typecheck && pnpm lint:check
```

---

### Task 4 — Add The Re-Keyed Interstitial Page

Proposed commit: `feat(lti): added the id-keyed launch interstitial`

The new page is added **beside** the old catch-all, not in place of it. Nothing
redirects here yet, so `always` behaviour keeps working through the old route
until Task 5 switches over and deletes it. This is what keeps every commit green.

Files:

- add `apps/gradebook/src/app/lti/launch/[activity_id]/page.tsx`;
- add `apps/gradebook/src/app/lti/launch/[activity_id]/page.test.node.tsx`;
- add `apps/gradebook/src/modules/app/activity/activity-launch-view.ts`;
- revise `apps/gradebook/src/modules/lti/components/lti-launch-activity.tsx`; and
- revise `apps/gradebook/src/modules/lti/components/lti-launch-activity.test.tsx`.

#### Route Coexistence

`app/lti/launch/[activity_id]` and `app/lti/launch/[...go]` both match
`/lti/launch/<one-segment>`. Next resolves the more specific dynamic segment
before the catch-all, so the new page wins for single-segment requests and the
old one continues to serve the multi-segment URLs the route currently produces.
Confirm this holds in `pnpm dev` before proceeding; if it does not, merge Tasks 4
and 5 into one commit rather than working around it.

#### Server Component

```
/lti/launch/{activity_id}?scope_id={uuid}
```

Both parsed with `z.uuid()`. On a parse failure, render the existing "Launch
Error" card — do not redirect to `/lti/error`, which exists for failures that
have no page of their own.

Add a thin server action `activity-launch-view.ts` mirroring the existing
`start-activity.ts` wrapper: resolve the user context, call
`core.app.activities.getActivityLaunchView`, and map `!ok` results to the same
`StartActivityResult`-shaped discriminated union the component already consumes,
so the three existing render states are preserved:

- no user context → "Authentication Required";
- `ERR_ACTIVITY_NOT_FOUND` / `ERR_ACTIVITY_SCOPE_NOT_FOUND` / anything else →
  "Launch Error";
- success → `LtiLaunchActivity`.

**Build the destination in the server component**, not the client one:

```ts
const destination = buildActivityLaunchUrl({
  activityUrl: view.activity.url,
  modulusServerUrl: view.modulus_server_url,
  scopeId: view.scope_id,
})
```

and pass it to `LtiLaunchActivity` as a prop. `buildActivityLaunchUrl` is pure and
already exported from `modules/app/activity/launch-url.ts`; it stays where it is
and keeps serving `/start-activity` unchanged.

#### Component: Anchor First, Countdown Second

Rework `LtiLaunchActivity` so the launch is a navigation rather than a script:

- accept `destination: string` and render the primary control as
  `<a href={destination}>` styled as a button — present in the server-rendered
  HTML;
- replace the secondary "click here" `<button onClick>` with an anchor to the
  same `href`;
- keep the countdown, its live counter, and its Cancel control client-side; they
  decorate the anchor and remain the only launch behaviour needing scripting;
- the auto-redirect still calls `navigate(destination)`, so the injectable
  `navigate` prop and its tests survive;
- replace the `<noscript>` text with wording that describes the missing
  auto-redirect and points at the link, rather than claiming the activity cannot
  be launched.

Delete the client-side `buildActivityLaunchUrl` call and the
`startActivityResult` prop plumbing it needed, replacing them with the
`destination` prop and the display fields (`scope_name`, `isDefaultScope`, the
session name) the component already reads.

#### Tests

`page.test.node.tsx`:

- a valid pair renders the launch view and calls the command with exactly
  `{ activity_id, scope_id }`;
- a non-UUID `activity_id` and a non-UUID/absent `scope_id` each render "Launch
  Error";
- `ERR_ACTIVITY_NOT_FOUND` and `ERR_ACTIVITY_SCOPE_NOT_FOUND` each render "Launch
  Error" — the bad-activity-id and bad-scope-id cases the analysis requires;
- no user context renders "Authentication Required";
- **an activity belonging to no activity code renders normally**, mirroring the
  core-side regression test.

`lti-launch-activity.test.tsx` (jsdom), extending the existing suite:

- the rendered markup contains an `<a href>` equal to the destination, asserted
  against `renderToStaticMarkup` output so it is proven present without
  hydration;
- manual click and countdown expiry still reach the same destination;
- countdown cancellation still works;
- the `<noscript>` no longer asserts that JavaScript is required to launch.

Verification:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=jsdom src/modules/lti/components/lti-launch-activity.test.tsx
pnpm -F @modulus-learning/gradebook test && pnpm typecheck && pnpm lint:check
```

---

### Task 5 — Flip The Launch Route And Delete The Catch-All

Proposed commit: `feat(lti): redirected verified launches straight to the activity`

The behaviour change. Everything it depends on already exists and is tested.

Files:

- revise `apps/gradebook/src/config/index.ts`;
- revise `apps/gradebook/.env.example`;
- add `apps/gradebook/src/modules/lti/launch-destination.ts`;
- add `apps/gradebook/src/modules/lti/launch-destination.test.node.ts`;
- revise `apps/gradebook/src/app/routes/lti/launch/route.ts`;
- revise `apps/gradebook/src/app/routes/lti/launch/route.test.node.ts`;
- delete `apps/gradebook/src/app/lti/launch/[...go]/page.tsx`; and
- delete `apps/gradebook/src/app/lti/launch/[...go]/page.test.node.tsx`.

#### Configuration

Add an `lti` group to the host `serverSchema`, following the `deployment` group's
pattern:

```ts
lti: z.object({
  /**
   * Whether a verified LTI resource-link launch shows the interstitial before
   * redirecting to the activity.
   *
   * - `never`  — redirect straight to the activity (default).
   * - `always` — show the interstitial.
   *
   * An enum rather than a boolean so that a future `first-launch` mode can be
   * added without a breaking configuration change.
   */
  launchInterstitial: z.enum(['never', 'always']).default('never'),
}),
```

fed from `process.env.LTI_LAUNCH_INTERSTITIAL`, and documented in
`.env.example` with the same two-line explanation.

#### Destination Helper

A pure function, unit-tested without a route:

```ts
export const selectLaunchDestination = (args: {
  mode: 'never' | 'always'
  activityId: string
  activityUrl: string
  scopeId: string
  modulusServerUrl: string
}): string
```

`always` returns `/lti/launch/{activityId}?scope_id={scopeId}`. `never` returns
`buildActivityLaunchUrl({ activityUrl, modulusServerUrl, scopeId })`. No role
argument — the absence is the contract, and a comment should say so.

#### Route

In the `start-activity` branch, replace the hand-built path and its query
assembly with one call to the helper, then `redirect(...)`.

Delete `appendQueryBeforeFragment` from the route. It exists only to splice a
query into a URL that carries an authored fragment, which no longer happens on
this path. **Do not touch `extractActivityLaunchParameters` or
`buildActivityLaunchUrl`** in `modules/app/activity/launch-url.ts` — the first
still serves `/start-activity`, the second serves both paths.

Delete the old catch-all page and its test. No shim, no placeholder, no redirect
stub.

#### Tests

`launch-destination.test.node.ts`:

- `never` produces the activity URL with exactly `modulus` and `scope_id` added,
  preserving an authored query and fragment;
- `always` produces `/lti/launch/{uuid}?scope_id={uuid}`;
- neither output contains a scope name, asserted against a scope name passed
  nowhere near the function — a guard against a future signature change.

`route.test.node.ts`:

- default configuration redirects to the activity URL;
- `always` redirects to the id-keyed interstitial;
- both set session cookies before redirecting;
- the existing "no `scope_name` in the target" assertion now runs against both
  modes;
- an activity URL carrying an authored query, fragment, and literal percent
  escape survives in both modes — the case that fails today through the
  catch-all;
- an instructor-role launch and a learner-role launch produce identical targets.

Verification:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=node src/modules/lti/launch-destination.test.node.ts
pnpm -F @modulus-learning/gradebook test && pnpm typecheck && pnpm lint:check
```

Then confirm by hand with `pnpm --filter @modulus-learning/gradebook devlti`
against Canvas: a launch with no configuration reaches the activity in one hop
and the agent authenticates; with `LTI_LAUNCH_INTERSTITIAL=always` the
interstitial appears and reaches the same place; with scripting disabled the
interstitial's link still works.

---

## Phase 3 — Deep Links, Documentation, And Acceptance

### Task 6 — Generic Deep-Link Content Item URL

Proposed commit: `feat(lti): used the generic tool launch url for deep links`

Files:

- revise `packages/core/src/modules/app/lti/services/deep-link.ts`; and
- add `packages/core/src/modules/app/lti/services/deep-link.test.ts`.

**`LtiDeepLinkingService` has no test file today** — nothing under `packages/core`
covers `handleDeepLink`. This task therefore writes the first one rather than
revising an existing suite. Keep it narrow: assert that the returned content item
carries `ltiLaunchUrl` as its `url`, that `window.targetName` and the custom
claims are unchanged, and that the signed response still names the pending
launch's deployment id. Broader deep-linking coverage is welcome but is not this
task's obligation, and must not delay it.

Change the content item's `url` from `this.urlBuilder.startActivityUrl(...)` to
`this.urlBuilder.ltiLaunchUrl`, which is already `${publicServerUrl}/lti/launch`.

Leave `window: { targetName: … }` alone, leave `UrlBuilder.startActivityUrl` in
place — it still serves `/start-activity` — and leave the custom claims
unchanged, since `handleActivityLaunch` reads the resource identity from them.

Add a comment recording why the generic URL is correct: Canvas surfaces this URL
nowhere, `LtiLoginService` ignores `target_link_uri`, and under `never` the
interstitial is not a landing place at all, so a per-activity URL would name a
page the learner never reaches.

Verification:

```sh
pnpm -F @modulus-learning/core test:one src/modules/app/lti/services/deep-link.test.ts
pnpm -F @modulus-learning/core test && pnpm typecheck && pnpm lint:check
```

---

### Task 7 — Update Shipped Documentation

Proposed commit: `docs: documented the optional launch interstitial`

Follow `.claude/skills/writing-docs/` — front matter, Title Case headings, and a
closing `## Where to go next`.

- **`docs/LTI.md`** — Flow 2 gains the mode switch and the one-hop redirect. The
  paragraph describing the readable nested URL is amended to say it governs the
  direct `/start-activity` path only, and the round-trip caveat moves with it.
  The endpoint table gains `/lti/error`, and the sentence naming
  `app/lti/launch/[...go]` is updated to the id-keyed route. Update the
  deep-linking step to say the content item carries the generic launch URL.
- **`docs/DEPLOYMENT.md`** — document `LTI_LAUNCH_INTERSTITIAL`, presenting
  `always` as a supported configuration rather than a legacy one, with a sentence
  on what an operator gives up by choosing `never`.
- **`docs/AUTHN-AUTHZ.md`** — if it describes the interstitial as part of the
  session hand-off, correct it; the session is established by the launch route
  and does not depend on the page.
- **`specs/2026-08-25-interstitial-page-analysis.md`** — set the status line to
  `implemented on feat/interstitial-page`.

No release notes: there are no deployments to notify.

Verification: `pnpm lint:check`, and re-read each changed section against the
code rather than against this plan.

---

### Task 8 — Full Verification And Pull Request

Proposed commit: none, unless review findings require one.

Run the complete gate:

```sh
pnpm run ci
```

Then walk the acceptance list below and confirm each row against the tree, not
against memory. Open one pull request from `feat/interstitial-page` against
`develop` describing the behaviour change, the new configuration key, and the two
defects repaired (the stricter-than-the-handler failure, and launch errors
rendering as JSON or a 500).

---

## Acceptance-Criteria Traceability

Every criterion in the analysis, mapped to the task that satisfies it.

| Criterion | Task |
| --- | --- |
| `LTI_LAUNCH_INTERSTITIAL` boot-validated enum, default `never`, in `.env.example` and `docs/DEPLOYMENT.md` | 5, 7 |
| `never` redirects once, directly, with only `modulus` and `scope_id` | 5 |
| `always` shows the interstitial and reaches the same activity URL | 4, 5 |
| Neither mode branches on `isInstructor` | 5 |
| Read-only command for one `(activity_id, scope_id)` pair, no activity code, no enrollment | 1 |
| `startActivity` not called on the LTI path; no duplicate enrollment or association check | 1, 4, 5 |
| Unresolvable activity code still reaches the activity in both modes | 1, 4, 5 |
| Interstitial keyed `/lti/launch/{activity_id}`; no activity URL in any LTI-path Modulus URL | 4, 5 |
| `LaunchResponse` carries the resolved activity's `id` and `url` | 2 |
| Old catch-all deleted, no shim | 5 |
| Deep-link `url` is the generic launch URL; `startActivityUrl` unchanged | 6 |
| Authored query, fragment, percent escape survive in both modes | 5 |
| No `scope_name` in any redirect URL, both modes | 5 |
| Session cookies set before the redirect; agent authorize succeeds | 5 |
| Command exposed on `core.app.activities` | 1 |
| Session-only authorisation, stated in code | 1 |
| Unresolvable pair renders "Launch Error", bad activity id and bad scope id tested | 1, 4 |
| `/lti/error?code=<slug>` renders without launch context | 3 |
| Every JSON branch and the bare throw redirect to it | 3 |
| Error codes are opaque slugs; `log.error` detail unchanged | 3 |
| Interstitial renders error, auth-required, and success states under the new URL | 4 |
| Server-rendered launch anchor in the initial HTML | 4 |
| Works with JavaScript disabled; truthful `<noscript>` | 4 |
| Countdown is the only scripting-dependent launch behaviour | 4 |
| Destination logic in a directly unit-tested helper, both modes | 5 |
| `/start-activity` and `extractActivityLaunchParameters` unchanged, tests pass | 5, 8 |
| `docs/LTI.md` updated, readable-URL note scoped to `/start-activity` | 7 |

## Out Of Scope

Carried from the analysis; no task may drift into these.

- `/start-activity` in its entirety — route shape, copy, scope handling,
  `NeedsUser`, and the defects the analysis lists in The Non-LTI Path.
- The `first-launch` mode, the per-activity-code switch, and the per-learner
  "don't show this again" preference.
- The agent-side connection badge.
- Detecting or reporting framed launches; third-party-cookie and Storage Access
  API mitigations.
- The LTI-conformant error response to the platform.
- A general-purpose admin settings table or settings UI.
- Any compatibility shim, fallback route, or migration.
