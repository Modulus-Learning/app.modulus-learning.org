# Package Changset and Release Instructions

> **NOTE: Only the local (manual) flow is available right now.** We do not have a
> remote NPM token workflow configured at GitHub at the moment, so the auto flow in
> Section I does **not** run. Releases must be published **locally** from your machine
> using the manual flow in Section II (`./publish-packages.sh`). Section I is retained
> below for reference / future re-enablement.

## I: Auto flow with GitHub action (currently DISABLED — no remote token):

NOTE: Because this repo is part of an organization (Modulus-learning) you MUST set the organization-level settings for general actions to allow pull requests for the organization AND this repo, as well as set the appropriate permissions in the release.yml workflow.

NOTE: This flow will use a GitHub action to version packages based on a pending changeset in the .changeset directory, and then create a PR to be merged after manual review. Once the PR has been accepted, the action will then publish the package to NPM - currently using a token from the 58bits NPM account (expires in 20 years, and only has access to the @modulus repo).

1. `pnpm changeset`

Choose packages to version with major, minor or patch releases.
Write a summary for the change set.

2. Git commit the change set to main and push.

3. The github action will create a pull request for the changeset

4. Manually review and accept the PR - the github action will then publish to npm.

NOTE: the auto-flow GitHub action will also create a Releases entry in the repo as well as attach zipped binaries.

IMPORTANT: It's important that everyone then git fetches, git pulls the latest from the main branch of the repo, and merges / rebases their local branches to bring them up to date with the release.

## II Manual flow (run locally):

This is the **only** active flow at the moment — there is no remote token workflow, so releases are published from your local machine.

NOTE: you'll need to log in to NPM on the command line before starting: `npm login`

1. `pnpm changeset`

Choose packages to version with major, minor or patch releases.
Write a summary for the change set.

2. `pnpm version-packages`

This will call changeset version, updating all package.json versions and updating release notes. It will also clear / remove the pending changeset from the .changeset directory.

Commit the resulting version bump before publishing.

3. `./publish-packages.sh`

This builds `@modulus-learning/agent`, packs it (rewriting any `workspace:*` deps), publishes the tarball to npm via `npm publish`, then creates and pushes the `@modulus-learning/agent@<version>` git tag. It publishes via whatever account you've authenticated locally with via `npm login`.

We use this script instead of `pnpm release:npm` (`changeset publish`) because the latter cannot publish under passkey-only 2FA — its OTP pre-check accepts only a typed numeric code and dead-ends at `ERR_PNPM_OTP_NON_INTERACTIVE`, whereas `npm publish` honours the bypass token in `~/.npmrc`.

Useful flags: `--dry-run` (pack + verify only, no publish/tag/push), `--no-build` (reuse existing `dist/`), `--yes` (skip the confirmation prompt). The script is idempotent — a version already live on npm is skipped and an existing tag is not recreated, so re-running after a partial failure just finishes the job.

NOTE: The manual flow will not create a Releases entry in the repo (and therefore not create any attached zip binaries).
