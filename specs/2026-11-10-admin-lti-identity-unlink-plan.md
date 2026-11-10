# Admin LTI Identity View and Unlink: Implementation Plan

Date: 2026-11-10

Status: Revision 2, after review (checkpoint 3: changes requested). Nothing is
implemented.

Document type: Implementation plan for issue 1 of the
[LTI Email Account Linking](./2026-10-28-lti-email-account-linking-analysis.md)
analysis.

## Problem

Scoped email linking refuses a launch whose email matches an account already
linked to a different LTI identity (`ERR_LTI_IDENTITY_CONFLICT`). The learner
sees the "Account Already Linked" page and is told to contact a Modulus
administrator. No admin page or command shows an account's LTI identity or
clears it. Today the only remedy is a manual `UPDATE users`.

## Outcome

An administrator with the right abilities can:

1. see, on a learner's admin page, whether the account is linked to an LTI
   identity, and to which issuer and subject; and
2. unlink it, which clears `users.lti_iss` and `users.lti_sub`.

The account, its email, enrollments, progress, page state and line items are
unchanged.

### What Unlinking Does and Does Not Do

Unlinking is **support recovery, not containment of a compromised account.**

- **It reopens email-based linking.** After unlinking, the account has no LTI
  identity. The first eligible launch whose email matches the account links its
  identity to it, whichever launch arrives first. That may be the new identity,
  which is the intended recovery. It may equally be the previous identity
  returning.
- **It does not sign anyone out.**
  - Learner sessions are stateless JWTs.
  - `refreshTokens` checks that the user exists and is enabled, not the
    account's LTI identity, and it issues a new refresh token.
  - An existing learner session can therefore keep renewing after an unlink,
    beyond its tokens' original expiry.
  - Server-side revocation belongs to the
    [session management review](./2026-10-30-session-management-review-analysis.md),
    and this plan does not attempt it.
- **It does not block the previous identity.** To keep someone out of an account,
  an administrator disables the account, which `refreshTokens` does check. That
  is a separate action from unlinking.

The confirmation step and the docs say this in plain words.

## Decisions

These are the accepted defaults; the review accepted each one.

1. **Abilities.**
   - The unlink command requires `users:edit`, which already gates `updateUser`.
   - The LTI identity on the detail response is visible with `users:read`, the
     ability `getUser` already requires.
   - Both are enforced server-side by the commands. Hiding the button is
     presentation only.
2. **Concurrency.**
   - The command takes `{ id, vid, lti_iss, lti_sub }`: the version and the
     identity values the admin was shown, each possibly null.
   - The write is one conditional `UPDATE`. It changes the row only while `vid`
     matches and both identity columns are `IS NOT DISTINCT FROM` the given
     values. It clears both columns and increments `vid`.
   - No row updated gives `ERR_VERSION_CONFLICT`, and the page asks the admin to
     refresh.
   - If the stored row already has both columns null, the command is a
     successful no-op and changes nothing, including `vid`.
3. **Audit: an operational log event, not a durable record.**
   - After a **confirmed changed row**, and only then, the service emits one
     `info` event, `lti identity unlinked`.
   - Its fields are `actor_admin_id`, from the authenticated admin context;
     `target_user_id`, from the updated row; the cleared `issuer`; and
     `subject_hash`, a SHA-256 prefix of the cleared subject.
   - No event is emitted for a no-op or a conflict.
   - The hash is a correlation value, not anonymisation.
   - A durable, transactional link-provenance record belongs to analysis issue 4,
     with the installation binding. There is no audit table in this task.
4. **No raw subject or email in any log or public error, on success or
   failure.**
   - Every query on this path carries the raw subject in its SQL parameters. The
     shared `wrapDbError` and `wrapDbErrorNew` attach the database error as
     `cause` and log it, and Drizzle's query error embeds its full parameter list.
   - So this path does not use the shared wrappers. The repository catches the
     error and throws `ERR_DATABASE` with a fixed message and **no `cause`**.
   - It logs only `{ method, target_user_id, pg_code }`, where `pg_code` is the
     Postgres SQLSTATE read from the driver error, if present.
   - The same applies to the service's lookup of the current row.
   - The change is limited to this path. There is no general logging redesign.
5. **Admins see the full subject** on the authorised detail page. Support needs
   it to match a Canvas user, and admins already see emails there.
6. **Partial identity data.**
   - The linking code treats an account with either column null as unlinked
     (`SessionMutations.linkLtiIdentity`).
   - `included.lti` is therefore `{ issuer: string | null, subject: string | null,
     linked: boolean }`. `linked` is true only when both are non-null, and
     `included.lti` is null when both are null.
   - When exactly one column is set, the panel shows "Not linked (incomplete LTI
     identity data)" with the stored value, and offers the same unlink action to
     clear it.
   - The view must not crash on this data.
7. **Out of scope:** a `modulus` CLI equivalent, an audit table, and session
   revocation.

## Implementation Surface

### Core (`packages/core`)

- **`modules/admin/users/schemas.ts`.**
  - Add `included.lti` to the `getUser` response only. List rows are unchanged.
  - Add `unlinkUserLtiIdentityRequestSchema`, `{ id: uuid, vid: int, lti_iss:
    string | null, lti_sub: string | null }`.
  - Add a response, `{ changed: boolean, vid: number }`.
- **`modules/admin/users/repository/index.ts`.**
  - Expose the identity columns on the user lookup that `getUser` uses.
  - Add an `unlinkLtiIdentity` mutation: a single conditional `UPDATE … SET
    lti_iss = NULL, lti_sub = NULL, vid = vid + 1, updated_at = now() WHERE id =
    $1 AND vid = $2 AND lti_iss IS NOT DISTINCT FROM $3 AND lti_sub IS NOT
    DISTINCT FROM $4 RETURNING id, vid`.
  - Error handling on this path follows decision 4.
- **`modules/admin/users/services/users.ts`.** Add `unlinkLtiIdentity`.
  1. Load the user: a missing user gives `ERR_NOT_FOUND`.
  2. If both identity columns are null, return `{ changed: false, vid }`.
  3. Otherwise apply the conditional update. No row updated gives
     `ERR_VERSION_CONFLICT`.
  4. On a returned row, emit the audit event and return `{ changed: true, vid }`.
- **`modules/admin/users/commands.ts`.** Add `unlinkUserLtiIdentity`, with
  `auth: { mode: 'admin', abilities: ['users:edit'] }`.
- **Unit tests** (`*.test.ts`, `node:test`).
  - The service's not-found, already-unlinked no-op, conflict and success paths.
  - The audit event's fields: emitted only on success, with `actor_admin_id` and
    `target_user_id`, and no raw subject.
  - **Failure injection:** a repository double, or a forced database failure,
    raises an error containing a distinctive synthetic subject. The test asserts
    that the subject appears neither in the captured log output nor in the thrown
    public error, including its `cause` chain.
  - **Command authorisation:** an admin context without `users:edit` is refused
    by the command itself.
- **Integration tests** (`*.itest.ts`, `modulus_test`).
  - The conditional update.
  - A stale `vid`, which is refused.
  - An identity changed between view and unlink, which is refused.
  - A partial identity, cleared successfully.
  - Enrollments, progress and line items, which survive.
  - After unlinking, `signInLti` with a different identity and the same email
    links that identity to the same account.
  - After unlinking, the previous identity relinks if it arrives first. This pins
    the documented behaviour.

### Host (`packages/host-tanstack-start`)

- **Admin user detail view** (`modules/admin/users/components/`).
  - An "LTI identity" panel with three states: not linked; linked (issuer,
    subject and an "Unlink" button); and incomplete identity data (decision 6).
  - The button is shown only when the admin has `users:edit`.
  - Confirmation is an in-page step, not a browser `confirm()`. A "Confirm
    unlink" button sits beside text stating the consequences above: it reopens
    linking for whichever launch arrives first, it does not sign anyone out, and
    it does not block the previous identity.
  - **The confirm state resets** when the target user id, `vid` or identity
    changes, and after a successful invalidation, so a stale confirm cannot carry
    across users or versions.
- **Server function.**
  - `unlinkUserLtiIdentity` in its own module. Its first middleware is the admin
    gate (`server-fn-convention.test.node.ts` enforces this), and server-only
    imports go in a `*.server.ts` loaded with a dynamic `import()`.
  - On success it invalidates the route. On `ERR_VERSION_CONFLICT` it shows
    "refresh and try again".
- **Tests** (jsdom).
  - The panel's three states, including incomplete data without a crash.
  - The confirm step and its consequence text.
  - The confirm reset on a change of user or `vid`.
  - The button hidden without `users:edit`.

### Docs

- `docs/12-authn-authz.md`, or `docs/13-lti.md`: a short "Unlinking an LTI
  identity" section. It gives the consequences above, covers the operational
  audit event, and says to disable the account instead when containment is the
  goal.
- The email linking analysis: mark issue 1 as resolved, linking to the commits.

## Order and Review

One code checkpoint, after core, host and docs are complete and tested:

1. core schema, repository and service, with unit and integration tests;
2. the host server function and view, with jsdom tests;
3. docs.

## Acceptance

- An admin with `users:edit` can unlink. Without it, the command refuses, which
  a test proves, and the button is hidden.
- The identity is visible with `users:read`.
- A stale page cannot clear a link made after it was loaded.
- The learner's data is unchanged. Their next eligible launch with a matching
  email relinks the account, whichever identity it carries.
- No raw LTI subject or email appears in logs or public errors, on success or
  failure. A failure-injection test proves the failure case.
- The audit event is emitted exactly once per changed row, and never for a no-op
  or a conflict.
- The confirmation and docs state that unlinking does not revoke sessions or
  block the previous identity.
- `pnpm run ci` passes.

## Where to go next

- [LTI Email Account Linking](./2026-10-28-lti-email-account-linking-analysis.md)
  describes the linking policy and the remaining open issues.
- [Session Management Review](./2026-10-30-session-management-review-analysis.md)
  covers server-side revocation, which this plan does not attempt.
