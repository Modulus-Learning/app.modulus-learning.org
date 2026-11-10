---
title: "TanStack Start Host"
path: "host-tanstack-start"
summary: "The first Modulus host adapter, its responsibilities, and the boundary between shared TanStack Start integration and installation-owned application code."
---

# TanStack Start Host

`@modulus-learning/host-tanstack-start` is Modulus's first host adapter. It
connects core's business operations to a TanStack Start application and supplies
the shared administrator and learner interface.

:::note[Documentation in Progress]
Documentation is actively being worked on. This page identifies the current
boundaries; a complete route, entry-point, and UI integration guide will follow
a validated downstream installation.
:::

## Shared Host Responsibilities

The package provides request-entry helpers, route factories, gated server
functions, session handling, UI components, styles, and a Vite preset.
Deployment-mode gates control which surfaces an instance serves and whether it
may run background jobs. Applications use public package exports.

## Application Responsibilities

The application supplies its own route files, public pages, runtime
configuration, branding, infrastructure, and selected LMS adapter. In the
reference installation, `apps/gradebook/src/server.ts` passes `canvasAdapter()`
to `createModulusFetch`, which initialises core through the shared host.

`apps/gradebook` demonstrates the complete reference application.
`fixtures/host-minimal` exercises a smaller installation against packed packages.
The fixture is a packaging check; a validated independent installation will
supply the evidence for the downstream walkthrough.

## Documentation Still to Come

The reference will cover supported entry points, route composition, server
function boundaries, UI customisation, styles, and configuration. It will
separate required application wiring from optional reference-site features.

## Where to go next

- [Packages](./03-packages.md) maps the host alongside core and the LMS adapter.
- [Configuration](./05-configuration.md) sketches application-owned settings.
- [Installing Modulus](./04-installation.md) retains the current implementation draft.
- [Deployment](./19-deployment.md) explains request gates and worker placement.
