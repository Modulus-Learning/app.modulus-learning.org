# Admin LTI Identity View and Unlink: Implementation Plan

Date: 2026-11-10

Status: Draft for review. Nothing is implemented.

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

An administrator with the right ability can:

1. see, on a learner's admin page, whether the account is linked to an LTI
   identity, and to which issuer and subject; and
2. unlink it, which clears `users.lti_iss` and `users.lti_sub`.

The account, its email, enrollments, progress, page state and line items are
unchanged. After unlinking, the learner's next launch is handled by the
existing sign-in rules:

- by identity, which no longer matches;
- then by email, which matches the now-unlinked account, so it links the new
  identity;
- otherwise a new account.

## Decisions

These are proposed defaults. Each lists its alternative.

1. **Ability: reuse `users:edit`.** Unlinking changes a user record, and
   `users:edit` already gates `updateUser`. A dedicated `users:unlink-lti`
   ability would mean new reference data, a release script and role grants for
   one action. Alternative: add the dedicated ability now if admins should be
   able to edit users without being able to unlink them.
2. **Concurrency: guard with `vid`, plus the expected identity.**
   - The command takes `{ id, vid, lti_iss, lti_sub }`, the identity the admin
     was shown.
   - The write is one conditional `UPDATE`: it changes the row only while `vid`
     and both identity columns still match, and it increments `vid`.
   - No row updated gives `ERR_VERSION_CONFLICT`, the same error `updateUser`
     uses, and the page asks the admin to refresh. This stops a stale page from
     clearing a link a concurrent launch has just made.
   - If the account is already unlinked, the command is a successful no-op.
3. **Audit: a structured log event now, a table later.**
   - Core has no audit store, and adding one means a schema migration, a release
     script and a retention policy.
   - The command emits one `info` event, `lti identity unlinked`, carrying the
     admin user id, the target user id, the issuer, and a SHA-256 prefix of the
     subject.
   - It does not log the raw subject or any email. `AGENTS.md` forbids
     committing or publishing learner PII, and the subject is an
     institution-scoped identifier.
   - A durable link-provenance record (`linked_at`, `linked_via`) belongs to
     issue 4 of the analysis, with the installation binding. Alternative: add an
     `admin_audit_events` table in this change.
4. **Admin visibility of the subject.** The admin user page shows the issuer and
   the full subject. Admins already see email addresses on this surface, and
   support needs the subject to match a Canvas user. Alternative: show only a
   masked subject.
5. **Sessions are not revoked.** Learner sessions are stateless JWTs, and
   revocation is the subject of the
   [session management review](./2026-10-30-session-management-review-analysis.md).
   An existing session for the account stays valid until it expires. That is
   acceptable, because unlinking grants nothing new to anyone.

## Implementation Surface

### Core (`packages/core`)

- **`modules/admin/users/schemas.ts`.**
  - Add `lti: { issuer: string, subject: string } | null` to `userSchema`, or to
    the `getUser` response's `included`, so the list response does not grow.
    Proposed: `included.lti`.
  - Add `unlinkUserLtiIdentityRequestSchema`, `{ id, vid, lti_iss, lti_sub }`.
- **`modules/admin/users/repository/index.ts`.** Add an `unlinkLtiIdentity`
  mutation: a single conditional `UPDATE … SET lti_iss = NULL, lti_sub = NULL,
  vid = vid + 1, updated_at = now() WHERE id = $1 AND vid = $2 AND lti_iss = $3
  AND lti_sub = $4 RETURNING id`.
- **`modules/admin/users/services/users.ts`.** Add `unlinkLtiIdentity`.
  1. Load the user: a missing user gives `ERR_NOT_FOUND`.
  2. If the account is already unlinked, return success.
  3. Otherwise apply the conditional update. No row updated gives
     `ERR_VERSION_CONFLICT`.
  4. On success, log the audit event.
- **`modules/admin/users/commands.ts`.** Add `unlinkUserLtiIdentity`, with
  `auth: { mode: 'admin', abilities: ['users:edit'] }`.
- **Tests.**
  - Unit test (`*.test.ts`, `node:test`): the service's not-found, already
    unlinked, conflict and success paths, and the log event's fields, with no
    raw subject.
  - Integration test (`*.itest.ts`):
    - the conditional update against `modulus_test`;
    - a stale `vid`, which is refused;
    - an identity changed between view and unlink, which is refused;
    - enrollments, progress and line items, which survive;
    - after unlinking, `signInLti` with a different identity and the same email
      links that identity to the same account.

### Host (`packages/host-tanstack-start`)

- **Admin user detail view** (`modules/admin/users/components/`).
  - An "LTI identity" panel: "Not linked", or the issuer and subject with an
    "Unlink" button.
  - Confirmation is an in-page step, not a browser `confirm()`: a second button,
    "Confirm unlink", with text explaining what happens on the next launch.
- **Server function.**
  - `unlinkUserLtiIdentity` in its own module. Its first middleware is the admin
    gate (`server-fn-convention.test.node.ts` enforces this), and server-only
    imports go in a `*.server.ts` loaded with a dynamic `import()`.
  - On success it invalidates the route. On `ERR_VERSION_CONFLICT` it shows the
    "refresh and try again" message.
- **Tests.**
  - jsdom: the panel in its two states, and the confirm step.
  - The existing server-function convention test covers the gate.

### Docs

- `docs/12-authn-authz.md` or `docs/13-lti.md`: a short "Unlinking an LTI
  identity" section. It describes the effect on the next launch, says sessions
  are not revoked, and covers the audit event.
- The email linking analysis: mark issue 1 as resolved, linking to the commits.

## Order and Review

One checkpoint, after core, host and docs are complete and tested:

1. core schema, repository and service, with unit and integration tests;
2. the host server function and view, with jsdom tests;
3. docs.

## Acceptance

- An admin with `users:edit` can view and unlink. An admin without it gets the
  command's ability refusal, and the panel's button is not shown.
- A stale page cannot clear a link made after it was loaded.
- The learner's data is unchanged, and their next launch from the new identity
  signs them into the same account.
- No raw LTI subject or email appears in logs.
- `pnpm run ci` passes.

## Where to go next

- [LTI Email Account Linking](./2026-10-28-lti-email-account-linking-analysis.md)
  describes the linking policy and the remaining open issues.
- [Session Management Review](./2026-10-30-session-management-review-analysis.md)
  covers server-side revocation, which this plan does not attempt.
