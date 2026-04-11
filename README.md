# Modulus

> [!NOTE]
> Modulus is in active development. Contributions may be initially limited to core maintainers while the project settles on a final governance and license structured. 

This is the monorepo for the Modulus project. Modulus is a learning platform monorepo (pnpm + Turborepo) targeting higher education with LTI integration support. The application is built on a **modular, package-based architecture** centered around a core registry and dependency injection framework in `packages/core`.

### Core Architectural Philosophy

The key architectural principle is that `packages/core` exposes all business logic, data access, and services through **class contracts (interfaces)** resolved via a DI registry (`AsyncRegistry`). The consuming application (currently Next.js) uses core directly in-process, leveraging the framework's **native routing system** — there is no separate API server. API routes in `apps/gradebook` are thin route handlers that delegate to core services.

This design enables **single-instance deploys** for smaller installations where the web app and backend logic run in the same process, which is a unique and important aspect of the project.

### Planned: Remote Connector

A planned remote connector will allow `packages/core` to communicate with an **external API** for larger or distributed deployments. This will consist of:

- A **thin HTTP API wrapper** around core's service layer (exposing core functionality over HTTP)
- **Proxy implementations** of core's class contracts that forward calls to the remote API instead of executing locally

This means consuming applications can swap between local (in-process) and remote (HTTP) implementations transparently, without changing application code. The contract-based DI architecture makes this possible.

### Apps and Packages

- `/apps/agent`: Modulus Client Agent - for 'instrumenting' Modulus-aware curriculum content. This application will include a working example of Modulus-aware content.
- `/apps/agent-demo`: Modulus Client Agent demos - with plain HTML/CSS/JS and React versions.
- `/apps/gradebook`: Modulus Gradebook - a [Next.js 16](https://nextjs.org/docs/app) application for the frontend and admin grade book application.
- `/packages/core`: the core Modulus learning module and package.


### Utilities

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [Biome](https://biomejs.dev/) for code linting and formatting
- [Turborepo](https://turborepo.org/) for running monorepo builds and scripts in a DX friendly and parallel manner

## Setup and Develop

Get started by running

1. `pnpm install` from the root of the monorepo.
2. Create `/apps/gradebook/.env` based on `/apps/gradebook/.env.example` (contact current maintainers for 'secrets')
3. `pnpm build` - from the root
4. `pnpm dev`- to start Next.js and Fastify dev servers

## Build

To build all apps and packages, run `pnpm build` from the root of the monorepo. Turborepo will take care of running the build scripts in the correct order based on the combined package.json dependency graph.

If you want to serve your production build locally, run `pnpm start` from the root of the monorepo.

## Deploy

We currently use Docker images deployed to [Fly.io](https://fly.io) for shared test deployments.

