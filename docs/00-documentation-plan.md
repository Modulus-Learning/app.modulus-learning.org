---
title: "Documentation Overview"
path: "documentation-overview"
summary: "A reading path through the refactored Modulus packages, CLI, host and LMS integration, with existing subsystem references and clearly marked drafts awaiting downstream installation validation."
---

# Documentation Overview

The Modulus documentation is organised into three tiers, from broad orientation
down to subsystem and operational reference. Every document shares the same
frontmatter contract (`title`, `path`, `summary`) so it can be imported and
served by the CMS.

- **Tier 1 — System documents.** Orientation and the load-bearing architecture.
  These alone are enough to understand *what Modulus is* and *how it is shaped*.
- **Tier 2 — Subsystem reference.** One document per subsystem, each the
  canonical reference for that area and cross-linked from the architecture doc.
- **Tier 3 — Operational & process.** Deployment, security and privacy, testing,
  contribution, and the roadmap.

:::note[Documentation in Progress]
Documentation is actively being worked on following the package refactor.
Detailed installation and upgrade instructions will be completed after a
working independent installation has been validated.
:::

**Available** identifies an existing reference; its detailed examples may still
need review after the refactor. **Draft** identifies a new orientation page or
implementation draft with incomplete consumer guidance. **Planned** identifies
a document that has not yet been written. A draft's presence does not mean its
setup instructions have been validated downstream.

## Start Here

1. [Introduction](./01-introduction.md) explains the purpose and scope.
2. [Getting Started](./02-getting-started.md) helps you choose between the reference
   installation, a downstream host, and activity instrumentation.
3. [Packages](./03-packages.md) maps the five published packages and their boundaries.
4. [Configuration](./05-configuration.md) and [CLI](./06-cli.md) sketch installation
   settings and the operational commands already supplied by core.
5. [TanStack Start Host](./07-host-tanstack-start.md) and
   [LMS Integration](./08-lms-integration.md) introduce the host and adapter contracts.

Start with orientation, then use the package and operational references for
your installation.

## Source Order and CMS Import

Files use two-digit prefixes and lowercase names, following the website's
Byline importer convention. The source reading order is:

| Prefixes | Reading Area |
| --- | --- |
| `00`–`03` | Overview, introduction, getting started, and packages |
| `04`–`08` | Installation, configuration, CLI, host, and LMS integration |
| `09`–`18` | Architecture and subsystem references |
| `19`–`24` | Deployment, upgrades, security, testing, migration, and accessibility |
| `25` | Planned remote connector |

The website's `byline/scripts/import-docs.ts` sorts source paths; use `--tree`
to apply that order to navigation. Frontmatter `path` values remain unchanged,
so numbering the files preserves the current document URLs. Import the whole
documentation set together so relative Markdown links resolve within the batch.

The documents remain flat while the downstream guides take shape. When a
section needs its own landing page, the importer supports `NN-section/index.md`
with numbered child documents. A section's frontmatter path becomes part of
its children's URLs, so adding nesting needs a separate URL review.

---

## Tier 1 — System Documents

### [Introduction](./01-introduction.md) — Available
The orientation document: what Modulus is, why it exists, and the principles that
shape it.

### [Architecture](./09-architecture.md) — Available
The load-bearing decisions that define the system — the contract-based core and
dependency-injection registry, the commands facade, the single-instance
in-process deployment model, the three actor domains, and the
repository/service split — each with a link to the deeper reference doc.

### [Core Composition](./10-core-composition.md) — Available
A deep dive into how the core is assembled: the registry types, the providers
that wire modules together, the composition lifecycle, request-context
threading, and how a module registry is built. The registry is the most
distinctive part of the codebase, and this is its canonical reference.

### [Packages and Installation Boundaries](./03-packages.md) — Draft
The current five-package inventory, licences, commands facade, LMS adapter
boundary, reference application, and installation-owned responsibilities.

### Mission — Planned
A short statement of intent: the project's purpose, intended audience, and its
relationship to the wider Ximera community.

---

## Tier 2 — Subsystem Reference

### [Data Model](./11-data-model.md) — Available
The canonical reference for the database schema. Covers the entity groups and
how they relate — identity and roles, enrollment and membership, the
activity-tracking core, LTI tables, and agent authentication — and explains the
two recorded signal shapes: time-series progress and the latest page-state
snapshot. Defines canonical activity URL identity, the spelling distinctions it
preserves, and the per-code URL prefix. Includes the migration and seed story.

### [Authentication & Authorization](./12-authn-authz.md) — Available
How Modulus answers *who are you?* and *what may you do?* for its three actor
types — learners, administrators, and instrumentation agents. Covers the JWT
layer, per-actor sessions and token refresh, the host's verification-only
sessions with explicit renewal and the expected-principal check,
ability-based authorization, and the agent's OAuth 2.0 + PKCE flow, with a
worked login-to-authorized-call path for each actor.

### [LTI](./13-lti.md) — Available
Modulus as an LTI 1.3 tool: OIDC login initiation, resource-link launch,
deep-linking with instructor activity URL validation, the platform and
deployment data model, the keystore, and Assignment & Grade Services score
passback. The primary reference for any institution integrating Modulus through
their LMS.

### [Agent / Instrumentation](./15-agent.md) — Available
The instrumentation story across both the published client and the server: how a
Ximera page is instrumented, the agent's OAuth-style authorization, and the
ingestion endpoints that record activity state. Carries the activity URL
contract content authors work to — which URL variants share progress and page
state, and why independently graded content needs distinct paths. The natural
companion to the LTI doc — together they are the two integration surfaces.

### [Dynamic Activities (Lazy Create)](./16-dynamic-activities.md) — Available
How new activities are materialized on demand from agent traffic. Records the
decision to lazy-create activities without an activity-code association, the
analytics consequence for instructors, and the alternatives considered. The
site-wide allowlist proposed here was superseded by the shipped sitewide activity
URL allowlist, which is documented in [Data Model](./11-data-model.md),
[Authentication & Authorization](./12-authn-authz.md) and
[Security & Privacy](./21-security-and-privacy.md); this document retains the earlier
proposal as history. Companion to
[Cumulative Progress](./17-cumulative-progress.md).

### Activities & Progress — Planned
The domain reference tying the data model to behaviour: what an activity is, how
activity codes and enrollment work, how progress is computed and recorded, how
page-state snapshots are stored and retrieved, and how scoring flows from agent
ingestion through to LTI passback.

### [TanStack Start Host](./07-host-tanstack-start.md) — Draft
The first host adapter: shared request handling, routes, server functions, UI,
and styles, with application-owned wiring demonstrated by `apps/gradebook`.
Consumer setup examples await downstream validation.

### [LMS Integration Packages](./08-lms-integration.md) — Draft
The implemented shared LTI contracts and Canvas adapter, how the application
selects an adapter, and the scope of the forthcoming registration guide.

### Gradebook — Planned
The reference application's public pages, documentation renderer, and learner
and administrator views. Shared integration belongs in the host package guide;
this document will focus on the application that consumes it.

### Internationalization — Planned
The locale strategy: the required `$lng` route segment, the router's URL rewrite
that keeps the default locale out of visible URLs, the server entry's locale
negotiation, and how translations are authored.

### Email — Planned
The email layer: templates, the mailer implementations, and the flows that send
mail (registration, email-change requests, and account messages).

### [Reports](./18-reports.md) — Draft
A placeholder for the report inventory, permissions, aggregation semantics,
and worked examples. Definitions are being checked against core and the host.

---

## Tier 3 — Operations and Process

### [Getting Started](./02-getting-started.md) — Draft
An orientation for evaluating the reference installation, building a downstream
host, or instrumenting activities. The full setup walkthrough remains pending.

### [Configuration](./05-configuration.md) — Draft
The map of installation-owned configuration and public/secret boundaries.
Required settings and complete examples await downstream validation.

### [Modulus CLI](./06-cli.md) — Draft
The operational `modulus` executable shipped by `@modulus-learning/core`:
database lifecycle, bootstrap, administrator creation, and key generation.
The command inventory is verified; full recipes remain in progress.

### [Upgrading Modulus](./20-upgrading.md) — Draft
The scope of a future downstream upgrade runbook: coordinated package versions,
schema scripts, verification, and recovery. The operational walkthrough will
follow a working independent installation.

### [Deployment](./19-deployment.md) — Available
The three runtime deployment modes — all-in-one, frontend-only, and admin-only —
selected via `DEPLOYMENT_MODE`: what each mode serves, how route surfaces are
classified and gated (the server-entry path gate plus the server-function
surface middleware), the background-jobs switch and eager boot, graceful
shutdown and its deadline chain, the LTI launch-interstitial switch, the
rule that a frontend instance may never run jobs, and how the database schema is
applied and checked at release — the `modulus db` commands, the boot-time check,
the Fly `release_command`, and adopting an existing database.

### [Installing Modulus](./04-installation.md) — Draft
An existing implementation recipe based on the reference application and
packed-install fixture. It is retained for context and explicitly marked as
awaiting independent downstream validation; it is not a finished setup guide.

### [Database Migration](./23-database-migration.md) — Available
Moving the shared gradebook database between Neon projects with a rehearsed
restore, a coordinated Fly maintenance window, private backups, data
verification, and recovery steps that preserve the single backend worker.

### [Remote Connector](./25-remote-connector.md) — Draft for a Planned Feature
A placeholder that distinguishes the proposed cross-process connector from the
implemented in-process host. No remote connector package is shipped today.

### Packaging and Distribution — Planned
The specification in
`specs/2026-10-28-modulus-packaging-and-distribution-spec.md` publishes the
server packages and the agent as one lockstep set with a TanStack Start host
package. The packages and release machinery are implemented.
The installation and configuration guides are drafts; downstream validation
and per-release upgrade notes remain to be completed.

### [Security & Privacy](./21-security-and-privacy.md) — Available
The security and privacy posture: the principle of storing as little as
possible, the LTI identity abstraction, what data is and is not retained,
retention and FERPA considerations, and the threat model.

### Accessibility — Planned
The accessibility posture and conformance statement (VPAT) for the application.

### [Testing Strategy](./22-testing.md) — Available
The unit and integration test boundaries, file naming and runtime conventions,
dedicated PostgreSQL test database lifecycle, the gradebook's HTTP-level session
and route-contract suites, release-script safety tests, fixture responsibilities,
and local reproduction of the main and packed-install CI jobs.

### Contributing and Licensing — Available; Governance — Planned
The root [contributing guide](https://github.com/Modulus-Learning/app.modulus-learning.org/blob/develop/CONTRIBUTING.md)
and [licensing guide](https://github.com/Modulus-Learning/app.modulus-learning.org/blob/develop/LICENSING.md)
record the workflow and the MPL-2.0 default with MIT agent/demo exceptions.
A separate governance document remains planned.

### Roadmap — Planned
A living view of planned work, including the remote connector and
framework-portability tracks.

---

## How the Documentation Grows

The system documents — Architecture and Core Composition — form the spine that
everything else links back to, with the Data Model providing the shared
vocabulary the subsystem references reuse. The integration subsystems
(Authentication & Authorization, LTI, and Agent) build on that foundation, and
the operational and process documents round out the set. Planned documents are
added incrementally; this overview is the index to the whole.

## Where to go next

- [Getting Started](./02-getting-started.md) identifies your entry point.
- [Packages](./03-packages.md) explains the refactored structure.
- [Architecture](./09-architecture.md) connects package boundaries to the system design.
