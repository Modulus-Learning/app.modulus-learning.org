---
title: "Configuration"
path: "configuration"
summary: "A draft map of installation-owned configuration, its public and secret boundaries, and the reference sources for the future configuration guide."
---

# Configuration

A downstream Modulus application supplies configuration to the shared host and
core packages. This page sketches those responsibilities before the complete
configuration reference is validated.

:::note[Documentation in Progress]
Documentation is actively being worked on. Required settings, defaults, and
copyable environment examples will be documented after a working downstream
installation has been exercised.
:::

## Configuration Areas

| Area | Installation Responsibility |
| --- | --- |
| Host | Public URLs, application routes, deployment mode, and branding |
| Core | Database connection, authentication keys, and enabled services |
| LMS | Adapter selection, platform registration, and deployment configuration |
| Activity content | Agent configuration and allowed activity origins/URLs |
| Operations | Background-job placement, secret storage, and schema upgrades |

Public browser configuration and server secrets have separate boundaries. In
the reference application, `apps/gradebook/.env` contains public `VITE_*`
settings, while `.env.local` holds local secrets. This repository convention is
not a requirement to deploy environment files; production configuration belongs
to the installation's runtime environment.

## Reference Sources

The current examples live in `apps/gradebook/.env.example`,
`apps/gradebook/src/server.ts`, and `fixtures/host-minimal`. The host config
loaders live in `packages/host-tanstack-start/src/config`; core exposes its
environment mapping through `@modulus-learning/core/env`.

## Where to go next

- [TanStack Start Host](./07-host-tanstack-start.md) explains host-owned wiring.
- [Deployment](./19-deployment.md) describes deployment-mode and job constraints.
- [Security & Privacy](./21-security-and-privacy.md) explains the data boundaries.
