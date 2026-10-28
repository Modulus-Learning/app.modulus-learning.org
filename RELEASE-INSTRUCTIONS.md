# Release Instructions

Modulus publishes one **lockstep set** of packages to npm. Every package listed
in `fixed[0]` of `.changeset/config.json` is released together at the same
version:

| Package | Path | Licence |
| --- | --- | --- |
| `@modulus-learning/agent` | `apps/agent` | MIT |
| `@modulus-learning/core` | `packages/core` | AGPL-3.0-only |
| `@modulus-learning/host-tanstack-start` | `packages/host-tanstack-start` | AGPL-3.0-only |

`apps/gradebook` (this repository's own installation) and the agent demos are
private and listed under `ignore`. The root `VERSION` file, used to tag the
gradebook image, follows the lockstep version.

Releases are published **locally**, not by CI: there is no npm automation token,
and publishing uses passkey 2FA. The `/release` command
(`.claude/commands/release.md`) drives the whole process; this file is the
human-facing statement of it and takes precedence if the two disagree.

## Before You Start

- `npm login` with an account that can publish to `@modulus-learning`.
- `gh auth status` for the umbrella GitHub release.
- A clean working tree on `develop`, with `develop` and `main` up to date with
  `origin`.

## Steps

1. **Gates.** Run the full local CI gate and the release checks:

   ```sh
   pnpm run ci                                              # includes pnpm check:packages
   pnpm -F @modulus-learning/core schema:manifest:check
   pnpm -F @modulus-learning/core schema:baseline && git diff --exit-code -- packages/core/src/database/sql/baseline.sql
   ./scripts/packed-install.sh                              # set FIXTURE_DATABASE_URL to cover core startup
   ```

   Released SQL scripts are immutable: installations record each script's
   checksum and refuse a changed one. `/release` checks that every dated script
   from the previous release is unchanged.

2. **Changeset.** `pnpm changeset`, selecting every package in the set at the
   same bump level (`/release` writes this file for you from `fixed[0]`).

3. **Version.** `pnpm version-packages` versions the whole set to one new
   version and updates every CHANGELOG. Update `VERSION` to match, run
   `pnpm lint`, and commit as `chore(release): X.Y.Z` (no trailers). Push.

4. **Publish.** `./publish-packages.sh` builds the set, packs each package
   (rewriting `workspace:*` dependencies to real versions), refuses any
   `workspace:` leak, and publishes each tarball with `npm publish` in
   dependency order. It then creates and pushes a per-package tag
   (`@modulus-learning/core@X.Y.Z`, …).

   - `--dry-run` packs and verifies without publishing, tagging or pushing.
   - `--no-build` reuses existing `dist/` output.
   - `--yes` skips the confirmation prompt.
   - The npm dist-tag follows the version: a prerelease (`X.Y.Z-next.N`)
     publishes under `next`, anything else under `latest`. `--tag` overrides
     it, but a prerelease is never published under `latest`.

   The script is idempotent: packages already live at the version are skipped
   and existing tags are kept, so re-running after a partial failure finishes
   the job. npm's registry views are CDN-cached for up to five minutes; trust
   the script's exit status rather than an immediate `npm view`.

   We use this script instead of `changeset publish` (`pnpm release:npm`)
   because pnpm's OTP pre-check cannot complete under passkey-only 2FA, whereas
   `npm publish` honours the bypass token in `~/.npmrc`.

5. **Sync `main`.** Fast-forward `main` to the release commit and push.

6. **Umbrella release.** Tag `vX.Y.Z` at the release commit, push it, and create
   the GitHub release with the cycle's notes. Name any new dated release scripts
   under **Migrations**, with the operator step (`modulus db upgrade`).

## Prereleases

Enter Changesets prerelease mode with `pnpm changeset pre enter next` and commit
it. Versions then become `X.Y.Z-next.N` and publish under the `next` dist-tag.
Run `pnpm changeset pre exit` before the stable release. Prerelease mode covers
the whole set; an urgent stable fix during a prerelease cycle is released from a
short-lived branch cut from the last stable tag.

## The GitHub Action

`.github/workflows/release.yml` runs the Changesets action on pushes to `main`.
Without an npm token it cannot publish, and the local release commit consumes
each changeset before `main` advances, so in practice it has nothing to do. It
is kept for a future token-based flow.
