# Modulus

Modulus connects a learning management system (LMS) to open learning activities
through LTI 1.3. It handles authenticated launches, progress recording, and
score passback so that platforms such as Ximera can focus on delivering content.

> [!NOTE]
> Documentation is actively being worked on following the package refactor.
> Downstream installation instructions are drafts until they have been validated
> against a working independent installation.

## Apps and Packages

| Location | Purpose |
| --- | --- |
| `packages/core` | Business operations, data access, schema scripts, and the `modulus` CLI |
| `packages/lti` | Shared LTI vocabulary and the LMS adapter contract |
| `packages/lms-canvas` | The Canvas LMS adapter |
| `packages/host-tanstack-start` | TanStack Start integration, route factories, server functions, UI, and styles |
| `apps/agent` | The published browser instrumentation library |
| `apps/gradebook` | This repository's reference installation |
| `apps/agent-demo` | React and vanilla examples of instrumented content |
| `fixtures/host-minimal` | A downstream package-installation test fixture |

The five published packages release in lockstep. Applications consume their
public exports; core exposes business operations through `CoreCommands`, with
`app`, `admin`, and `agent` branches. The TanStack Start host composes core in
process and receives the installation's LMS adapter. A remote connector remains
planned work.

## Documentation

Start with the [documentation overview](./docs/00-documentation-plan.md), then:

- [Getting Started](./docs/02-getting-started.md) distinguishes evaluating this
  repository from building a downstream installation.
- [Packages](./docs/03-packages.md) maps responsibilities and package boundaries.
- [CLI](./docs/06-cli.md) describes the operational command supplied by core.
- [Architecture](./docs/09-architecture.md) explains the system design.
- [Agent](./docs/15-agent.md) covers instrumenting activity pages.

## Working on This Repository

Read [AGENTS.md](./AGENTS.md) for prerequisites, local commands, environment
files, and package-specific test runners. [Testing Strategy](./docs/22-testing.md)
describes local and hosted CI. The contributing workflow is in
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Licence

Project-owned source uses **MPL-2.0**, except `apps/agent` and `apps/agent-demo`,
which remain **MIT**. Bundled third-party assets retain their own licences.
See [LICENSE](./LICENSE) and [Licensing](./LICENSING.md) for the scope and terms.
