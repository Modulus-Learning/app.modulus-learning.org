---
title: "Data Model"
path: "data-model"
summary: "The Modulus Postgres schema: identity and RBAC, the activity and unscoped cohort graph, academic scopes, scope-partitioned learner signals, LTI passback, agent OAuth storage, and the conventions shared across them."
---

# Data Model

This is the canonical reference for the Modulus database schema. It is the shared
vocabulary the subsystem docs build on, so it is worth reading before
[LTI](./LTI.md), [AGENT](./AGENT.md), or [AUTHN-AUTHZ](./AUTHN-AUTHZ.md).

The schema is defined with [Drizzle ORM](https://orm.drizzle.team) in
`packages/core/src/database/schema/source/`, re-exported through
`schema/index.js`, and is the *only* thing the repository layer touches — all SQL
lives in `*Queries`/`*Mutations` classes (see
[CORE-COMPOSITION → Anatomy of a Module](./CORE-COMPOSITION.md#anatomy-of-a-module)).
Postgres is the only supported database.

## Conventions

A few patterns recur across nearly every table:

- **UUID primary keys.** Entities use `uuid` primary keys, generated as
  time-ordered **UUIDv7** in the service layer (`uuid`'s `v7`). Time-ordered ids
  keep inserts index-friendly and make ids roughly sortable by creation time.
- **Version counter (`vid`).** Mutable first-class entities (`users`, `roles`,
  `permissions`, the `admin_*` set) carry an `integer` `vid` defaulting to `1`.
  It is an optimistic-concurrency token: an update asserts the `vid` it read and
  bumps it, so a stale writer is detected rather than silently clobbering.
- **Timestamps.** `created_at` / `updated_at` come from a shared `timestamps`
  helper (`schema/common.ts`): `TIMESTAMPTZ` at microsecond precision, stored in
  UTC. Where a table needs only creation time it declares `created_at` alone.
- **Join tables use composite primary keys.** Many-to-many links
  (`role_user`, `enrollment`, `activity_activity_code`, …) are keyed by the
  columns they join, so the link itself enforces uniqueness.
- **Cascade with intent.** Foreign keys generally `ON DELETE cascade`, with
  deliberate exceptions called out in the schema (e.g. `activity_activity_code`
  does *not* cascade from the activity-code side because an activity may be shared
  by several codes; `activity_codes.created_by` is `set null`).

## Entity Groups

The tables fall into eight groups.

### 1. Identity & access — learners

The learner-facing actor (`app` domain). `users` is the spine; a user may
authenticate through any of several providers, which is why the table carries
`password`, `github_id`, `google_id`, and the LTI pair `lti_iss` / `lti_sub`
side by side, plus lifecycle flags (`is_enabled`, `is_email_verified`,
`agreed_to_terms`, `failed_login_attempts`, `last_login*`).

Authorization is role-based:

- **`roles`** — named roles with a unique `machine_name` and an `order`.
- **`permissions`** — one row per `ability` string (e.g. `account:read_own`)
  belonging to a role. Abilities are the strings asserted by commands; see
  [AUTHN-AUTHZ](./AUTHN-AUTHZ.md).
- **`role_user`** — the user ⇄ role assignment (composite PK).

Two supporting flows hang off identity:

- **`registrations`** — a pending self-registration (name, email, a
  `verification_code`, `attempts`, `ip`) that exists *before* a `users` row, until
  email verification promotes it.
- **`email_change_requests`** — a pending email change awaiting its
  `verification_code`.

And one audit table:

- **`user_logins`** — an **insert-only** login audit (`time`, `user_id`,
  `provider`, `ip_address`, and a `user_login_outcome` enum:
  `success` / `failed_no_password` / `failed_bad_password` / `failed_disabled`).
  `user_id` is deliberately **not** a foreign key: the table is meant to be
  append-only and pruned by age, and is a candidate for conversion to a
  TimescaleDB hypertable — a foreign key's `ON DELETE` behaviour would conflict
  with both goals. Indexed by `time DESC` and by outcome.

### 2. Identity & access — administrators

A **parallel, separate** RBAC set for the `admin` domain — the schema-level
expression of the actor separation in
[ARCHITECTURE → Three Actor Domains](./ARCHITECTURE.md#4-three-separate-actor-domains).
`admin_users` (with an `is_super_admin` flag), `admin_roles`,
`admin_permissions`, and the `admin_role_admin_user` assignment table mirror the
learner tables but are entirely distinct — an admin is not a `users` row, and the
two ability namespaces never mix.

### 3. Activities & grouping

This is the graph that connects learners to Ximera content.

```
        activity_codes ──< activity_activity_code >── activities
              │  │                                        │
              │  └──< activity_code_member >── users      │
              │                                  │        │
              └──────────< enrollment >──────────┴────────┘
                          (code, activity, user)
```

- **`activities`** — a Ximera activity/page, identified by a unique `url` (plus
  optional `name`).
- **`activity_codes`** — the institutional grouping/whitelist mechanism described
  in the summary doc: a public `code` and a `private_code`, an optional
  `url_prefix` that scopes which activity URLs the code covers, a `description`,
  and `created_by`. Activity codes are what let an institution control which
  activities are accessible and reuse a set across courses/semesters.
- **`activity_activity_code`** — which activities belong to which code (M:N).
- **`activity_code_member`** — which users belong to a code (M:N), i.e. roster
  membership of a code.
- **`enrollment`** — the three-way link `(activity_code_id, activity_id,
  user_id)` that records a learner working a specific activity in the context of
  a specific code. Enrollment and activity-code membership deliberately remain
  broad, unscoped cohorts; scope is applied only when learner state is read or
  written.

### 4. Academic scopes

**`scopes`** defines opaque buckets that partition learner state and score
passback. A non-default row is identified by the platform-qualified pair
`(platform_id, external_id)` and may carry a nullable display `name`, nullable
descriptive `starts_at` / `ends_at`, and `last_verified_launch_at`. The external
id is retained inside Modulus and never sent to activity content.

The global fallback row has the fixed id
`00000000-0000-0000-0000-000000000000`, with null `platform_id` and
`external_id`. A check constraint permits that null identity only for the
fallback row; every other scope must have both identity columns. Existing or
unscoped data therefore remains explicit rather than relying on nullable foreign
keys.

### 5. Learner signals

The current learner state is partitioned by the token-bound
`(user_id, activity_id, scope_id)` tuple:

- **`progress`** — a `real` high-water mark normalized **0–1.0**, with
  `timestamps`. Its composite primary key is
  `(activity_id, user_id, scope_id)`.
- **`page_state`** — a `state` blob (currently `text`, defaulting to `'{}'`) that
  lets a learner resume an activity where they left off. Its composite primary
  key is `(user_id, activity_id, scope_id)`.
- **`progress_events`** — an append-only event stream recording each direct
  high-water-mark advance and cumulative contribution. Events carry the same
  scope and an optional `source_activity_id` for contributions.

`progress` and `page_state` are latest-state tables within a scope;
`progress_events` is progress history, not page-state history. All five tables
that gained `scope_id` use a non-null foreign key with the sentinel default.

### 6. LTI integration

Everything needed to be an LTI 1.3 tool and to passback grades (see [LTI](./LTI.md)):

- **`lti_platforms`** — a registered LMS platform: `issuer` (unique), `name`,
  `client_id`, and the platform's `authorization_endpoint`, `token_endpoint`,
  `jwks_uri`, and `authorization_server`. Managed via the admin `ltiPlatforms`
  commands.
- **`lti_platform_deployments`** — `(platform_issuer, deployment_id)` pairs; a
  platform may have several deployments.
- **`lti_launches`** — short-lived storage of an in-flight launch (`launch` blob
  + `expires_at`).
- **`lti_nonces`** — one-time-use nonces (`used` flag) for **replay protection**
  on launches.
- **`lti_lineitems`** — the AGS passback ledger and durable work queue. Beyond
  the identity columns (`user_id`, `activity_id`, `scope_id`, `lineitem_url`,
  `platform_issuer`, `deployment_id`, `lti_user_id`) it tracks both what has been
  sent and the retry machinery the background worker relies on:

  ```ts
  submittable_progress          // scoped target value eligible for passback
  submitted_progress            // last value successfully submitted
  submission_eligible_at        // throttle/backoff schedule
  submission_lease_token        // fencing token for the active worker
  submission_lease_expires_at   // when another worker may reclaim it
  submission_error_*            // consecutive failure diagnostics
  ```

  These columns make passback **reliable at scale** — workers claim with
  lease-fenced updates, back off on failure, and recover expired leases after a
  crash. The flow is documented in
  [LTI Score Submission](./LTI-SCORE-SUBMISSION.md), and worker config lives under
  `config.lti.score_submission`. Unique on `(user_id, activity_id, lineitem_url)`.
  Scope is deliberately absent from that unique key: a verified term change
  rebinds and resets the existing row instead of creating a second line item.

### 7. Agent authorization (OAuth 2.0 + PKCE)

Storage for the browser agent's authorization (see [AGENT](./AGENT.md)):

- **`agent_auth_codes`** — short-lived authorization codes for the OAuth
  Authorization Code flow. The `code_challenge` column is the **PKCE** challenge,
  bound to a `client_id`, `redirect_uri`, `user_id`, and `scope_id`. The scope is
  fixed before redirect and cannot be substituted at token exchange.
- **`agent_refresh_tokens`** — issued refresh tokens (`id`, `user_id`,
  `expires_at`, `used_at`); `used_at` supports rotation/replay detection.

Note the boundary this enforces, consistent with the
[data-isolation rule](./ARCHITECTURE.md#system-context-three-tiers): the agent's
authorization is tied to an opaque `users.id`, not to any LMS identity.

### 8. Reporting

- **`admin_reports_mau`** — a small precomputed rollup of monthly active users,
  keyed `(year, month)` with a `total`. The basis for the admin reports surface
  ([REPORTS](./REPORTS.md)).

Instructor activity-code reports deliberately remain scope-agnostic. The query
first projects all scoped progress to one row per `(user_id, activity_id)` using
maximum progress, earliest creation, and latest update, then joins the unscoped
`enrollment` cohort. Totals and offset pagination operate on enrollments, with
nulls last and stable ascending activity/user tie-breakers; no arbitrary
`scope_id` is exposed in the report.

## The Data-Isolation Boundary, in Schema Terms

The Tier 2 ↔ Tier 3 rule — activities never receive learner PII — maps onto the
schema as a split between columns that live on `users` / LTI tables and the
minimal projection the agent is allowed to see:

| Stays in Modulus (Tier 2) | May reach an activity (Tier 3) |
| --- | --- |
| `users.email`, `username`, provider ids | opaque `users.id` (UUID) |
| `lti_*` issuer/sub/lineitem/platform data | display name |
| course / context identity | activity context / `activities.url` |
| raw scope external id and term dates | opaque `scope_id` and nullable display name |
| — | normalized `progress` (0–1.0) |
| — | `page_state` (activity-specific) |

The agent's access token payload is built to carry only the right-hand column set;
see [AGENT](./AGENT.md) and [SECURITY-AND-PRIVACY](./SECURITY-AND-PRIVACY.md).

## Migrations & Seeds

- **Migrations** live in `packages/core/src/database/migrations/` as Drizzle
  migrations (`0000_…`–`0014_…` plus the `meta/` journal), generated with
  `pnpm drizzle:generate` and applied with `pnpm drizzle:migrate`.
- **Historical SQL** under `database/sql/` (`modulus-deploy-YYYY-MM-DD.sql` and a
  few targeted `migrate-*.sql` scripts) predates the Drizzle migration track and
  is retained for reference / older deployments — it is not the current source of
  truth.
- **Seeds** in `database/seeds/` run in numbered order via `index.ts`
  (`pnpm drizzle:seed`), and the ordering encodes the dependency chain: admin
  identity (`01`–`04`) → learner identity (`05`–`08`) → activity codes and
  activities (`09`–`10`) → enrollment (`11`) → progress (`12`).

## Open Questions

These are flagged in the code or implied by the design, and are worth resolving
in a future revision:

- **`page_state.state` type.** Currently `text`; a `TODO` in the schema asks
  whether `jsonb` would be better (queryability, indexing) — relevant if
  page-state ever needs to be inspected server-side.
- **Page-state history.** `progress_events` records progress advances, but
  `page_state` remains latest-only. Whether page-state needs history, and whether
  event/audit tables move to TimescaleDB, remains open.
- **`user_logins.provider`.** A `TODO` asks whether this free-text column should
  become an enum like `outcome`.

---

## Where to go next

- [AUTHN-AUTHZ](./AUTHN-AUTHZ.md) — how `users`/`roles`/`permissions` (and the
  `admin_*` mirror) become the three actor contexts and ability checks.
- [LTI](./LTI.md) — how the `lti_*` tables drive launch, deep linking, and AGS
  passback.
- [AGENT](./AGENT.md) — how `agent_auth_codes` / `agent_refresh_tokens` and the
  learner-signal tables are written from instrumented content.
