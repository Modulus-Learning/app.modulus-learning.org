---
title: "Getting Started"
path: "getting-started"
summary: "The entry points for evaluating Modulus, contributing to the reference installation, and preparing a downstream host, with installation validation still in progress."
---

# Getting Started

Modulus is distributed as packages that an installation composes into a host
application. This guide helps you choose where to begin: the reference
installation, your own host, or the browser agent for activity content.

:::note[Documentation in Progress]
Documentation is actively being worked on following the package refactor.
Detailed installation steps will be completed after a working independent
installation has been validated. This page is an orientation draft.
:::

## Choose Your Starting Point

| Your Task | Starting Point |
| --- | --- |
| Understand what Modulus provides | [Introduction](./01-introduction.md) and [Packages](./03-packages.md) |
| Work on the reference installation | `apps/gradebook`, with repository commands in `AGENTS.md` |
| Prepare an independent installation | [TanStack Start Host](./07-host-tanstack-start.md) and the [installation draft](./04-installation.md) |
| Instrument activity content | [Agent](./15-agent.md) and `apps/agent-demo` |
| Inspect operational commands | [CLI](./06-cli.md), provided by `@modulus-learning/core` |

## Installation Documentation Still to Come

The downstream walkthrough will cover package versions, host configuration,
database provisioning, keys, LMS registration, first launch, and score passback.
It will distinguish a fresh installation from an upgrade and document a concrete
verification step for each stage. The reference application and
`fixtures/host-minimal` provide implementation evidence while that work proceeds.

## Where to go next

- [Packages](./03-packages.md) explains the refactored boundaries.
- [Configuration](./05-configuration.md) sketches installation-owned settings.
- [CLI](./06-cli.md) inventories the commands already implemented.
