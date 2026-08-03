---
title: "Documentation Overview"
path: "documentation-overview"
summary: "A map of the Modulus documentation set — how it is organised into system, subsystem, and operational tiers, what each document covers, and which documents are available today versus planned."
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

Documents marked **Available** can be read now; those marked **Planned** are part
of the intended set and will be added over time.

---

## Tier 1 — System documents

### [Introduction](./INTRODUCTION.md) — Available
The orientation document: what Modulus is, why it exists, and the principles that
shape it.

### [Architecture](./ARCHITECTURE.md) — Available
The load-bearing decisions that define the system — the contract-based core and
dependency-injection registry, the commands facade, the single-instance
in-process deployment model, the three actor domains, and the
repository/service split — each with a link to the deeper reference doc.

### [Core Composition](./CORE-COMPOSITION.md) — Available
A deep dive into how the core is assembled: the registry types, the providers
that wire modules together, the composition lifecycle, request-context
threading, and how a module registry is built. The registry is the most
distinctive part of the codebase, and this is its canonical reference.

### Mission — Planned
A short statement of intent: the project's purpose, intended audience, and its
relationship to the wider Ximera community.

---

## Tier 2 — Subsystem reference

### [Data Model](./DATA-MODEL.md) — Available
The canonical reference for the database schema. Covers the entity groups and
how they relate — identity and roles, enrollment and membership, the
activity-tracking core, LTI tables, and agent authentication — and explains the
two recorded signal shapes: time-series progress and the latest page-state
snapshot. Includes the migration and seed story.

### [Authentication & Authorization](./AUTHN-AUTHZ.md) — Available
How Modulus answers *who are you?* and *what may you do?* for its three actor
types — learners, administrators, and instrumentation agents. Covers the JWT
layer, per-actor sessions and token refresh, ability-based authorization, and
the agent's OAuth 2.0 + PKCE flow, with a worked login-to-authorized-call path
for each actor.

### [LTI](./LTI.md) — Available
Modulus as an LTI 1.3 tool: OIDC login initiation, resource-link launch,
deep-linking, the platform and deployment data model, the keystore, and
Assignment & Grade Services score passback. The primary reference for any
institution integrating Modulus through their LMS.

### [Agent / Instrumentation](./AGENT.md) — Available
The instrumentation story across both the published client and the server: how a
Ximera page is instrumented, the agent's OAuth-style authorization, and the
ingestion endpoints that record activity state. The natural companion to the LTI
doc — together they are the two integration surfaces.

### [Dynamic Activities (Lazy Create)](./DYNAMIC-ACTIVITIES.md) — Available
How new activities are materialized on demand from agent traffic, and the
site-wide admin allowlist (domain / domain+path rules) that governs it. Records
the decision to lazy-create activities without an activity-code association, the
analytics consequence for instructors, and the alternatives considered. Companion
to [Cumulative Progress](./CUMMULATIVE-PROGRESS.md).

### Activities & Progress — Planned
The domain reference tying the data model to behaviour: what an activity is, how
activity codes and enrollment work, how progress is computed and recorded, how
page-state snapshots are stored and retrieved, and how scoring flows from agent
ingestion through to LTI passback.

### Gradebook — Planned
The host application: its app-router layout, how route handlers delegate into
core, the in-repo docs renderer, internationalization, and the instructor-facing
gradebook and reporting views.

### Internationalization — Planned
The locale strategy: the localized route segment, the i18n middleware, and how
translations are authored.

### Email — Planned
The email layer: templates, the mailer implementations, and the flows that send
mail (registration, email-change requests, and account messages).

### Reports — Planned
The reporting subsystem: which reports exist, what they measure (such as
monthly active users), and how they are computed.

---

## Tier 3 — Operational & process

### Getting Started — Planned
A local setup guide: clone, install, build, database setup and migration, seeds,
environment configuration, and running the app in development.

### [Deployment](./DEPLOYMENT.md) — Available
The three runtime deployment modes — all-in-one, frontend-only, and admin-only —
selected via `DEPLOYMENT_MODE`: what each mode serves, how route surfaces are
classified and gated (the proxy gate plus the LTI/admin layout guards), the
background-jobs switch, and the rule that a frontend instance may never run jobs.

### Remote Connector — Planned
The planned HTTP proxy layer — a thin wrapper over the core service layer with
proxy implementations of the class contracts, swappable with the in-process
implementations through the same dependency-injection registry.

### [Security & Privacy](./SECURITY-AND-PRIVACY.md) — Available
The security and privacy posture: the principle of storing as little as
possible, the LTI identity abstraction, what data is and is not retained,
retention and FERPA considerations, and the threat model.

### Accessibility — Planned
The accessibility posture and conformance statement (VPAT) for the application.

### [Testing Strategy](./TESTING.md) — Available
The unit and integration test boundaries, file naming and runtime conventions,
dedicated PostgreSQL test database lifecycle, fixture responsibilities, local
commands, and the minimum pull-request CI gate.

### Contributing, Governance & License — Planned
How to contribute, the project's governance model, and licensing. Some of these
are still being settled and will be published as decisions land.

### Roadmap — Planned
A living view of planned work, including the remote connector and
framework-portability tracks.

---

## How the documentation grows

The system documents — Architecture and Core Composition — form the spine that
everything else links back to, with the Data Model providing the shared
vocabulary the subsystem references reuse. The integration subsystems
(Authentication & Authorization, LTI, and Agent) build on that foundation, and
the operational and process documents round out the set. Planned documents are
added incrementally; this overview is the index to the whole.
