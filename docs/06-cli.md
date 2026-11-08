---
title: "Modulus CLI"
path: "cli"
summary: "The operational modulus command shipped by core: database status and lifecycle, reference-data bootstrap, administrator creation, and key generation, with installation recipes still in progress."
---

# Modulus CLI

The `modulus` command is shipped by **`@modulus-learning/core`**. It operates an
installation's database, reference data, administrator accounts, and keys.
Application scaffolding and host configuration remain installation-owned work.

:::note[Documentation in Progress]
Documentation is actively being worked on. The command inventory below is
verified against `packages/core/src/cli/index.ts`. Full setup, recovery, and
upgrade recipes will follow validation of an independent installation.
:::

## Package and Entry Point

Core's `package.json` maps the `modulus` executable to `dist/cli/index.js`.
The source entry point is `packages/core/src/cli/index.ts`; there is no separate
`@modulus-learning/cli` package in this repository.

In an application where core is installed, inspect the available commands with:

```sh
pnpm exec modulus --help
```

## Current Commands

| Command | Effect |
| --- | --- |
| `modulus db status` | Reports applied, pending, and unknown release scripts; returns a non-zero status when the schema is not current |
| `modulus db init` | Applies the baseline to an empty database and creates reference roles and permissions |
| `modulus db upgrade` | Applies unapplied release scripts |
| `modulus db adopt --through <script>` | Records the release-script ledger for an existing schema after its compatibility has been established |
| `modulus bootstrap` | Creates missing reference roles and permissions |
| `modulus admin create --email <address>` | Creates an administrator; accepts optional given/family names and `--password-stdin` |
| `modulus keys generate` | Prints fresh installation keys and a session secret; does not write a file |

Database commands accept `--database-url` or use `POSTGRES_CONNECTION_STRING`.
`--env-file` loads an explicitly selected environment file. Except for status,
these database operations change persistent state. Generated key output is
secret and belongs in the installation's secret storage.

## Documentation Still to Come

The finished reference will cover connection configuration, schema adoption
preconditions, password input, key handling, exit statuses, and recovery from
partial setup. It will include worked examples validated against a downstream
installation, rather than treating database operations as an installer.

## Where to go next

- [Packages](./03-packages.md) explains why the executable lives in core.
- [Deployment](./19-deployment.md#database-schema-at-release) describes schema checks and release scripts.
- [Configuration](./05-configuration.md) sketches installation-owned settings.
- [Upgrading](./20-upgrading.md) records the scope of the forthcoming upgrade guide.
