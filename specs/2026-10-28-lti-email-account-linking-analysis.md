# LTI Email Account Linking

Date: 2026-10-28

Status: Analysis. The overwrite and race defects are fixed; the policy questions
below are open and need a decision before the extraction's installation-binding
work.

Document type: Analysis of current behaviour, its known limits, and options.

Companions:
[LMS Extraction: Characterisation](./2026-10-28-lms-extraction-characterisation.md)
(gap 1 and the review fixes) and
[Canvas and LTI Package Extraction](./2026-10-25-canvas-lti-package-extraction-spec.md)
(Migration Between LMSs, which requires a binding gate on email relinking).

## How a Launch Finds an Account

`LtiSignInService.signInLti`
(`packages/core/src/modules/app/session/services/lti-sign-in.ts`) resolves a
verified launch to a Modulus account in three steps:

1. **By LTI identity.** An account whose `lti_iss` and `lti_sub` equal the
   launch's issuer and subject is signed in.
2. **By email.** Otherwise, if the launch carries an `email` claim, an account
   with exactly that email is used, and the launch's identity is linked to it.
3. **New account.** Otherwise a new account is created with the launch's
   identity and email (`createLtiUserIfAbsent`, safe against a concurrent
   first launch through the partial unique index on `lti_iss, lti_sub`).

Step 2 exists so a person who first signed in with Google, GitHub or a password
keeps one account when they later arrive from Canvas.

## What Was Wrong, and What Is Fixed

| Defect | Fix | Commit | Test |
| --- | --- | --- | --- |
| Step 2 re-pointed an account already linked to a different LTI identity: any platform able to assert an email could take over that account | Refused with `ERR_LTI_IDENTITY_CONFLICT`; the learner sees the "Account Already Linked" page (`packages/host-tanstack-start/src/modules/lti/error-messages.ts`) | `f88c50c` | `lti-sign-in.test.ts` |
| The guard was check-then-write: two concurrent launches with different identities could both link one unlinked account, the second overwriting the first | `SessionMutations.linkLtiIdentity` is a single conditional `UPDATE`: it applies only while the account is unlinked (either column null) or already carries this identity | `13a848b` | `lti-sign-in.itest.ts` |
| The early guard in step 2 refused any account found by email that carried an LTI identity, even the launch's own: if a concurrent launch with the same identity linked the account between this launch's identity lookup and its email lookup, this launch failed with a false `ERR_LTI_IDENTITY_CONFLICT` | The guard refuses only a different issuer/subject pair; an account already linked to this identity is signed in. The conditional write is unchanged | `86c7f94` | `lti-sign-in.itest.ts` (pauses one launch between its two lookups) |

The policy in force is the one decided on 2026-10-28, "keep linking, scoped":
an email match may link an account that has no LTI identity, and never
re-points one that has.

## Open Issues

### 1. No Recovery Path for a Refused Learner

A refused learner is told to contact their Modulus administrator, but there is
no admin page or `modulus` command that shows an account's LTI identity or
clears it. Today the only remedy is a manual `UPDATE users SET lti_iss = NULL,
lti_sub = NULL` in the database. This is the most likely real-world support
case, so a small admin action (view and unlink, with an audit log entry) should
come before any wider rollout.

### 2. Legitimate Identity Changes Are Refused

The same person can arrive with a new `(iss, sub)` pair without any takeover:

- **Canvas beta and test instances.** Canvas issues launches from
  `https://canvas.beta.instructure.com` and `https://canvas.test.instructure.com`
  as well as `https://canvas.instructure.com`. If both a production and a beta
  registration exist in one installation, a learner who launched from one is
  refused by the other.
- **Re-provisioned LMS users** whose subject changes.
- **An LMS migration**, which the extraction spec treats as a managed cut-over
  with migration metadata rather than relinking.

Scoped linking treats all of these as conflicts. Whether some deserve an
explicit rule (for example, one identity per issuer, so a beta identity can sit
beside a production one) is a schema decision: `users` holds a single
`lti_iss`/`lti_sub` pair, so supporting more than one identity per account
needs a separate identities table.

### 3. Email Is Not Kept in Sync

On sign-in, Modulus writes the launch's email only when the account has none.
If an institution changes a learner's email in Canvas, Modulus keeps the old
one. Consequences:

- A later email-based match (step 2) uses the stale address.
- If the old address is reassigned to someone else at the institution, that
  person's first launch matches the stale account and, if it is unlinked, links
  to it. This is the remaining takeover-shaped case under scoped linking, and it
  depends on the institution reusing addresses.

Options: update the stored email from each verified launch of a linked account
(then the uniqueness constraint on `users.email` must be handled when the new
address already belongs to another account), or stop using email for matching
once an account is linked. A decision should also say which source wins when
the account was created by Google or GitHub sign-in.

### 4. The Trust Basis Is Not Recorded

The extraction spec asks that a launch's email carry trust evidence (for Canvas,
"registration-trusted": the email is as trustworthy as the registered platform).
Nothing records why an account was linked, or by which registration. A
`linked_at`/`linked_via` record would make issue 1's admin view and any later
audit possible.

### 5. Exact-Match Email Comparison

`SessionQueries.findUserByEmail` compares with `=`, so `Learner@Example.edu`
and `learner@example.edu` are different accounts. Normalising (lower-casing on
write and match, or a `citext` column) needs a data check first, because
existing rows may already differ only by case.

### 6. No Binding Gate Yet

The extraction spec requires email relinking to be gated by the installation
binding, so an LMS change cannot silently link target-LMS identities to source
accounts. The binding is not built (see the characterisation record's
Remaining Against the Extraction Spec).

## Recommended Order

1. Admin view-and-unlink action with an audit entry (issue 1).
2. Decide the email-sync rule (issue 3) together with case normalisation
   (issue 5), since both change how step 2 matches.
3. Record link provenance (issue 4) when the installation binding is built
   (issue 6).
4. Revisit multiple identities per account (issue 2) only if a beta/test
   registration or an LMS migration is actually planned.

## Where to go next

- [LMS Extraction: Characterisation](./2026-10-28-lms-extraction-characterisation.md)
  records the pinned sign-in behaviour and the fixes.
- [Packaging and LMS Extraction Handoff](./2026-10-28-packaging-and-lms-handoff.md)
  lists where this work stopped and what to pick up next.
