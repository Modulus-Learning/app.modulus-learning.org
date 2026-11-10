# Contributing to Modulus

Modulus is in active development, including the transition to independently
installable packages. Reproducible bug reports, documentation corrections, and
feedback from real installations are useful contributions. Discuss substantial
changes with the maintainers before implementing them.

## Questions and Bug Reports

Search the [issue tracker](https://github.com/Modulus-Learning/app.modulus-learning.org/issues)
first. For a new report, include the package versions, runtime, relevant
configuration with secrets removed, reproduction steps, expected behaviour,
and actual behaviour. Prefer a small reproducible example to a large log dump.

Do not include learner or instructor data, access tokens, keys, LMS client or
deployment identifiers, or private institutional details in public reports.
Send sensitive security reports privately to `info@infonomic.io`.

## Licence of Contributions

The repository and server packages use **MPL-2.0**. `apps/agent` and everything
under `apps/agent-demo` use **MIT**. Contributions are submitted under the
licence of the area being changed. You must have the right to submit the work
under that licence; preserve the licences and required notices of third-party
material. See [Licensing](./LICENSING.md) for the complete scope.

This repository does not require a Developer Certificate of Origin sign-off.
Do not add `Signed-off-by`, `Co-Authored-By`, AI attribution, or other commit
trailers. The same no-attribution rule applies to pull request descriptions.

## Preparing a Change

1. Read [AGENTS.md](./AGENTS.md) for the repository map and current commands,
   and [Architecture](./docs/09-architecture.md) before changing package boundaries.
2. Branch from `develop`, using `<type>/<short-slug>`, such as
   `fix/score-validation`. Open pull requests against `develop`.
3. Keep the change focused. Applications consume packages through their public
   exports; core's commands facade is the entry point for business operations.
4. Add or update tests where behaviour changes, and update relevant docs.
5. Describe the problem, resulting behaviour, and validation in the pull request.
   Identify incomplete checks and link the related issue when there is one.

The published packages release in lockstep, as defined in
`.changeset/config.json`. Include a changeset for changes to published
behaviour, public interfaces, package metadata, or licensing. Release operations
follow [Release Instructions](./RELEASE-INSTRUCTIONS.md).

## Verification

Every package uses Vitest, in the modes its `package.json` scripts name: core's
integration suite runs separately with `--mode=integration`.
[Testing Strategy](./docs/22-testing.md) describes test modes and database setup.

```sh
pnpm lint:check
pnpm run ci
```

`pnpm run ci` runs the main CI job. GitHub also runs `pnpm test:packed` with
`FIXTURE_DATABASE_URL` pointing to a fresh, empty PostgreSQL 18 database ending
in `_test`. Run that too when validating a downstream package change; without
the variable, the script skips real database startup.

`pnpm lint` applies Biome's safe fixes and modifies files. Review its diff.
Never add `--unsafe`. The pre-commit hook checks staged JS, TS, and JSON files;
it does not replace the CI checks.

## Commit Messages

Use conventional commits with a lowercase, past-tense subject:

```text
fix(lti): corrected score validation
```

Use a scope when the change is confined to one area. Put supporting context in
the body when needed. Follow the [commit reference](./.agents/rules/conventional-commits.md),
including the prohibition on trailers.

## AI-Assisted Contributions

Tool-assisted work must meet the same standard as other contributions. Verify
reported bugs against the software, review generated changes, and be able to
explain the code and the evidence supporting it. State what was tested and what
remains uncertain. Do not submit generated reports or patches that nobody has
checked.

## Documentation

The [documentation overview](./docs/00-documentation-plan.md) maps the current and
planned guides. Documentation for the refactored packages is actively being
worked on. Detailed downstream installation instructions will be validated
against a working independent installation before being presented as complete.
Clearly labelled drafts and focused corrections are welcome.
