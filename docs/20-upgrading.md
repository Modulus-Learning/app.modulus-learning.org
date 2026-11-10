---
title: "Upgrading Modulus"
path: "upgrading"
summary: "The planned downstream upgrade guide, covering lockstep package versions, database release scripts, compatibility checks, and recovery validation."
---

# Upgrading Modulus

A Modulus upgrade coordinates package versions, application configuration, and
the database schema. This page records the scope of the downstream upgrade guide.

:::note[Documentation in Progress]
Documentation is actively being worked on. A complete upgrade procedure will be
written and rehearsed after the first working independent installation. This
page is a placeholder, not an operational runbook.
:::

## What the Guide Will Cover

- Selecting one lockstep version for the published Modulus packages.
- Reviewing release notes for configuration and public API changes.
- Backing up and checking the existing installation before an upgrade.
- Applying the release's database scripts through `modulus db upgrade`.
- Verifying startup, LMS launch, activity reporting, and score passback.
- Recovery constraints when code and database versions differ.

The existing [database schema reference](./19-deployment.md#database-schema-at-release)
explains shipped release scripts and startup checks. It provides implementation
context while the end-to-end operator procedure is being validated.

## Where to go next

- [CLI](./06-cli.md) lists the current database commands.
- [Deployment](./19-deployment.md) describes runtime modes and schema enforcement.
- [Getting Started](./02-getting-started.md) records the installation documentation status.
