# Release Instructions

Modulus publishes one **lockstep set** of packages to npm. Every package listed
in `fixed[0]` of `.changeset/config.json` is released together at the same
version. Read that configuration when preparing a release; the current set is:

| Package | Path | Licence |
| --- | --- | --- |
| `@modulus-learning/agent` | `apps/agent` | MIT |
| `@modulus-learning/core` | `packages/core` | MPL-2.0 |
| `@modulus-learning/lti` | `packages/lti` | MPL-2.0 |
| `@modulus-learning/lms-canvas` | `packages/lms-canvas` | MPL-2.0 |
| `@modulus-learning/host-tanstack-start` | `packages/host-tanstack-start` | MPL-2.0 |

`apps/gradebook` and the agent demos are private and listed under `ignore`.
The root `VERSION`, used to tag the gradebook image, follows the lockstep version.

This is the human-facing release policy and operator guide. The canonical agent
workflow is `.agents/skills/release/SKILL.md`; Claude Code's `/release` command
reads that same skill. This guide takes precedence on release policy. Keep the
skill's execution and recovery instructions consistent with it.

Releases are published **locally**, using `publish-packages.sh` and npm passkey
2FA. `/release` checks preconditions, prepares the bump and release notes, asks
for publication approval, runs the script, checks its result, and creates one
umbrella GitHub release. Explicit approval already given for the same concrete
release remains valid. A release never deploys the gradebook.

## Before You Start

- Use Bash 4 or later for `publish-packages.sh` (macOS's bundled Bash 3 is too old).
- Run `npm login` with an account that can publish to `@modulus-learning`, and
  check `npm whoami` and `gh auth status`.
- Start a new release from a clean `develop` checkout. Fetch origin and ensure
  neither `develop` nor `main` is behind its remote tracking branch.
- For a stable release, check both `main` and `origin/main` are ancestors of the
  intended release branch using `git merge-base --is-ancestor`. Resolve any
  divergence **before publication**. Prereleases stay on `develop`.
- Record the current version as `PREV_VERSION` and its per-package core tag as
  `PREV_TAG`. Before core's first release only, use the agent tag instead.
  Verify the tag exists and is an ancestor of the release branch.
- If a release was interrupted, use [Resuming a Release](#resuming-a-release)
  instead of starting another bump.

## Steps

1. **Gates.** Run the main CI job, schema checks, and the separate packed-install
   job from the repository root:

   ```sh
   pnpm run ci
   pnpm -F @modulus-learning/core schema:manifest:check
   pnpm -F @modulus-learning/core schema:baseline
   git diff --exit-code -- packages/core/src/database/sql/baseline.sql
   bash scripts/check-release-sql.sh "$PREV_TAG"
   pnpm test:packed
   ```

   `pnpm run ci` includes tarball checks with publint and arethetypeswrong.
   To reproduce all hosted CI coverage, set `FIXTURE_DATABASE_URL` to a fresh,
   empty PostgreSQL 18 database ending in `_test` before `pnpm test:packed`.
   Without it, the packed-install job skips real core startup; report that gap.
   Stop on a failing gate.

   Released SQL filenames and contents are immutable. The SQL check disables
   rename detection so renaming a released migration fails as a deletion would.
   New scripts are allowed; installations record checksums for existing scripts.

2. **Changeset.** Choose patch, minor, or major and write a changeset naming
   every package in `fixed[0]` at that level. `/release` derives its short summary
   from commits since `PREV_TAG`. Review existing pending changesets too.

3. **Version and commit.** Run `pnpm version-packages`, verify the whole set has
   one expected version, and update `VERSION`. Account for Changesets prerelease
   state when present. Run `pnpm lint` for safe fixes and review the diff;
   Biome does not format Markdown CHANGELOGs. Commit the release artefacts as
   `chore(release): X.Y.Z`, without trailers, and push the release branch.
   Record the full SHA as `RELEASE_COMMIT`. Require a clean checkout and recheck
   stable-main ancestry after fetching origin.

4. **Approve and publish.** Review the exact version, release commit, dist-tag,
   proposed umbrella notes, and remaining actions before authorising publication:

   ```sh
   ./publish-packages.sh --anchor "$RELEASE_COMMIT"
   ```

   The script requires `HEAD` to equal that release commit, the expected commit
   subject, a clean tree, and matching package/root versions. Before publishing
   anything, it checks every existing local and remote package/umbrella tag
   against that commit and stops on mismatches or a failed remote lookup.

   It builds the set, packs each package (rewriting `workspace:*` dependencies),
   refuses workspace leaks and repository-only files, then runs `npm publish`
   in dependency order. It creates and pushes the per-package tags. Existing
   matching tags, including annotated remote tags, are preserved.

   - `--dry-run` builds, packs and verifies the whole set without publishing,
     tagging or pushing; it permits an uncommitted checkout and needs no anchor.
   - `--no-build` reuses existing `dist/`; use only output from this release.
   - `--yes` skips the script's prompt after publication has been authorised.
   - Versions containing a prerelease suffix publish under `next`; stable
     versions use `latest`. `--tag latest|next` overrides the default, but a
     prerelease can never publish under `latest`.

   Check the exit status. A non-zero result may follow a partial publish or a
   tag-push failure: use the recovery steps below. Registry reads may lag after
   a successful publish; allow propagation before concluding anything failed.
   The script skips versions already present when resuming the same release.

   This script supports the repository's passkey-only publishing setup where
   the pnpm/Changesets OTP flow cannot complete. `pnpm pack` rewrites workspace
   dependencies before `npm publish` uses the authenticated npm configuration.

5. **Sync stable releases to `main`.** Fetch origin. Fast-forward `main` to
   `RELEASE_COMMIT`, **not** the current tip of `develop`, and push. If `main`
   already contains the release commit, leave it there; never rewind it. Stop
   on divergence. Skip this step for prereleases.

6. **Umbrella release.** Verify the per-package tags point at `RELEASE_COMMIT`,
   then create and push `vX.Y.Z` at that same commit. Verify an existing local
   or remote umbrella tag's target before reusing it. Create the GitHub release
   from the approved notes with `gh release create ... --verify-tag`; for a
   prerelease, also pass `--prerelease --latest=false`. Leave an existing matching
   release intact unless an edit was requested. Under **Migrations**, name new
   dated SQL scripts and the operator step (`modulus db upgrade`).

## Resuming a Release

Use `/release resume <version> <release-commit>` in Claude Code, or give those
values to the shared release skill. Preserve the original previous-release tag
and release notes. Do not create another changeset to repair a partial publish.

If versioning completed but no release commit exists, inspect the existing diff
and Changesets state, finish verification and committing, and record that commit.
Do not run versioning again. If the intended version or original anchor is
ambiguous, establish it before proceeding.

Once the release commit exists, work from a clean checkout at that exact SHA.
If the branch has advanced, use a separate worktree at the release commit;
never reset the branch or publish later code under the old version. Verify all
package versions, `VERSION`, and existing local and remote tags. Repeat gates
whose successful completion cannot be established for that release. Then resume
the first incomplete step:

```sh
./publish-packages.sh --anchor "$RELEASE_COMMIT" --yes
```

Use `--yes` only with publication authorisation. Diagnose a failed invocation
before retrying, and allow registry propagation time. The publisher can complete
missing packages and tags from the same anchor. Conflicting tags must be
investigated, not moved. If publication finished and only main sync or the
umbrella release remains, continue directly with that step.

## Prereleases

Enter Changesets prerelease mode with `pnpm changeset pre enter next` and commit
it. Releases become `X.Y.Z-next.N`, publish under `next`, stay on `develop`, and
are explicitly marked as GitHub prereleases. `main` advances only for a stable
release. Run `pnpm changeset pre exit` before preparing that stable release and
verify the resulting release plan; a prerelease exit is not an ordinary bump.
Prerelease mode covers the whole set. An urgent stable fix during a prerelease
cycle uses a short-lived branch cut from the last stable tag.

## The Legacy GitHub Action

The old workflow is archived at `.github/workflows/release.yml.disabled`;
GitHub does not load that extension. This change takes effect on GitHub when it
reaches `main`. Until then, the previously committed `release.yml` can still
run on pushes to `main`. Missing npm credentials do not disable a workflow.

Publication remains local. Re-enabling automated publishing requires a separate
review of authentication, lockstep builds, release gates, and tag ownership;
do not restore the legacy workflow unchanged.
