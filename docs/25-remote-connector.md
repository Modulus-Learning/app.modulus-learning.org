---
title: "Remote Connector"
path: "remote-connector"
summary: "A placeholder for the planned remote connector, distinguishing future cross-process core access from the current in-process TanStack Start host."
---

# Remote Connector

The remote connector is planned work for installations that need core business
operations behind a separate service boundary. The current TanStack Start host
composes core in process.

:::note[Planned Feature — Documentation in Progress]
Documentation is actively being worked on. No remote-connector package or
supported remote deployment recipe is provided by the current package set.
:::

## Scope to Be Defined

The design will need to specify the transport contract, authentication and
actor context, error handling, operational ownership, and compatibility between
host and service versions. Existing references to a remote connector describe
this direction, not an available installation option.

## Where to go next

- [Packages](./03-packages.md) lists the implemented packages.
- [Architecture](./09-architecture.md) explains the current in-process design.
- [Core Composition](./10-core-composition.md) describes the commands facade.
