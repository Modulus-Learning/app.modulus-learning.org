---
title: "LMS Integration Packages"
path: "lms-integration"
summary: "The shared LTI contracts and Canvas adapter, how the host selects an adapter, and the remaining work on downstream registration and launch documentation."
---

# LMS Integration Packages

Modulus separates Learning Tools Interoperability (LTI) contracts from
learning-management-system (LMS) behaviour. `@modulus-learning/lti` defines the
shared vocabulary; `@modulus-learning/lms-canvas` supplies the Canvas adapter.

:::note[Documentation in Progress]
Documentation is actively being worked on. Package boundaries are implemented;
registration, launch, and score-passback walkthroughs will be checked against a
working downstream installation before this becomes a complete integration guide.
:::

## Shared Contracts

`@modulus-learning/lti` exports claims and messages, access-token and score types,
and the `LmsAdapter` contract. It has no dependency on core, a database, or a host
framework. Core uses the contract for LMS-facing behaviour.

## Canvas Adapter

`canvasAdapter()` from `@modulus-learning/lms-canvas` is the current adapter.
It supplies role interpretation, term fields, custom deep-link variables,
registration defaults, and the Assignment & Grade Services (AGS) score client
with quota handling. Core owns application policy, queueing, and retry decisions.

The host application selects the adapter when it creates its server entry.
The current design selects one LMS adapter for an installation. Additional
vendor adapters remain future work.

## Documentation Still to Come

The guide will cover LMS registration, deployment records, launch validation,
deep linking, and the first verified score submission. Examples will use
placeholders for installation-specific identifiers and credentials.

## Where to go next

- [Core Composition](./10-core-composition.md#the-lms-adapter) explains adapter injection.
- [LTI](./13-lti.md) describes the protocol flows already implemented.
- [LTI Score Submission](./14-lti-score-submission.md) describes the passback worker.
