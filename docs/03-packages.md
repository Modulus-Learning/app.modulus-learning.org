---
title: "Packages and Installation Boundaries"
path: "packages"
summary: "The five published Modulus packages, their responsibilities and licences, and the distinction between the shared host layer, the reference application, and a downstream installation."
---

# Packages and Installation Boundaries

Modulus separates business operations, LMS-specific behaviour, host-framework
integration, and activity instrumentation into five published packages. This is
the starting map for developers evaluating the refactored structure.

:::note[Documentation in Progress]
Documentation is actively being worked on. This package map reflects the current
manifests and public entry points; complete consumer examples and installation
recipes will follow downstream validation.
:::

## Published Packages

| Package | Responsibility | Licence |
| --- | --- | --- |
| `@modulus-learning/core` | Business operations, repositories, schema scripts, and the `modulus` CLI | MPL-2.0 |
| `@modulus-learning/lti` | LTI claims and messages, score types, and the `LmsAdapter` contract | MPL-2.0 |
| `@modulus-learning/lms-canvas` | `canvasAdapter()`, Canvas registration defaults, role and term interpretation, and score transport | MPL-2.0 |
| `@modulus-learning/host-tanstack-start` | Request handling, gated server functions, route factories, UI, styles, and host setup helpers | MPL-2.0 |
| `@modulus-learning/agent` | Browser instrumentation and progress reporting from activity pages | MIT |

The packages release together at one version, as defined by `fixed[0]` in
`.changeset/config.json`. The [licensing guide](https://github.com/Modulus-Learning/app.modulus-learning.org/blob/develop/LICENSING.md)
records the repository-wide scope, including the MIT demos and third-party assets.

## How They Connect

The host receives an LMS adapter from its application and passes it to core.
Core uses the neutral `LmsAdapter` contract from `@modulus-learning/lti`;
Canvas-specific behaviour lives in `@modulus-learning/lms-canvas`. Core's runtime
does not import the Canvas adapter.

Applications call core through the `CoreCommands` facade, organised into `app`,
`admin`, and `agent` branches. Services and repositories are internal to core.
The browser agent runs on activity pages and sends reports to the host's agent
endpoints. Activity content receives an opaque identity and scoped activity
context; it does not receive institutional identifiers or LMS gradebook data.

## Installation-Owned Code

`apps/gradebook` is this repository's installation and reference consumer. It
supplies application routes, public pages, configuration, and the selected LMS
adapter through package exports. `fixtures/host-minimal` checks a smaller host
against packed packages outside the workspace.

An independent installation owns its database, credentials, LMS registration,
public URLs, branding, and deployment. The first host adapter is TanStack Start.
Other framework adapters and the remote connector remain future work.

## Where to go next

- [Core Composition](./10-core-composition.md) explains the commands facade and dependency registry.
- [TanStack Start Host](./07-host-tanstack-start.md) sketches the application boundary.
- [LMS Integration](./08-lms-integration.md) maps shared LTI and Canvas responsibilities.
- [CLI](./06-cli.md) describes operational commands shipped by core.
