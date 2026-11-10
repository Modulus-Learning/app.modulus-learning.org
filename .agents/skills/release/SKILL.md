---
name: release
description: Use when asked to release or publish the @modulus-learning/* packages. Runs the lockstep changeset, versioning, gates, lint, release commit, npm publish and per-package tags, stable main sync, and umbrella GitHub release. Accepts patch, minor, major, or resume with a version and release commit.
---

Drive the full release loop for the `@modulus-learning/*` lockstep set, end to
end. The publishable packages listed under `fixed` in `.changeset/config.json`
always move together to the same version. Always read the current set from that
file rather than trusting a count — it grows as packages are extracted.

The set lives in `packages/*` (`core`, `host-tanstack-start`, `lms-canvas`,
`lti`) and `apps/agent`.
`apps/gradebook` and the agent demos are private and listed under `ignore`; they
are never published and never part of a changeset.

Read `RELEASE-INSTRUCTIONS.md` before starting — it is the human-facing
statement of this process and takes precedence if the two ever disagree.

## What this command does

1. Asks the user for the bump level (patch / minor / major).
2. Derives a one- or two-line changeset summary from the commits since the
   previous release and writes a changeset file naming every package in the
   fixed group at the chosen bump level.
3. Runs `pnpm version-packages` and verifies every package in the set landed on
   the same new version and that the version delta matches the requested bump.
4. Runs `pnpm lint` for safe fixes to supported files and reviews the release
   diff. Markdown CHANGELOGs are not formatted by Biome in this repository.
5. Stages the bump + lint output and creates a single `chore(release): X.Y.Z`
   commit on the current branch (usually `develop`).
6. Pushes that branch.
7. Runs `./publish-packages.sh` — builds, packs (rewriting `workspace:*` deps),
   `npm publish`es each package in dependency order, and creates + pushes
   per-package tags. Replaces `changeset publish` / `pnpm release:npm`, which
   dead-ends under passkey-only 2FA.
8. For a stable release, fast-forwards `main` to the release commit and pushes
   it. Prereleases stay on `develop`.
9. Creates the umbrella `v<version>` tag and a single GitHub release that
   summarises the cycle.

Choose **new release** or **resume** before any versioning. A fresh run is not
idempotent: versioning again can create another release. After an interruption,
follow Resume below. Shared publication policy lives in `AGENTS.md`; explicit
authorisation already given for the same concrete release remains valid.

## Resume

Accept `resume <version> <release-commit>` or the same information in natural
language. Recover the version, full commit SHA, previous release tag, original
branch, and completed steps from the conversation, release commit, tags, and
registry. Do not infer the intended release from a later `HEAD`.

- If versioning changed files but no release commit exists, inspect the diff
  and Changesets state. Continue verification, lint, and committing those
  existing changes; do not create another changeset or run versioning again.
  Ask for the intended version if it cannot be established from that evidence.
- Once a release commit exists, set `NEXT_VERSION` to its package version and
  `RELEASE_COMMIT` to its full SHA. Verify all fixed packages and `VERSION` at
  that commit agree, and its subject is `chore(release): <NEXT_VERSION>`.
- Use a clean checkout at `RELEASE_COMMIT`. If the working branch has advanced,
  use an isolated worktree at that commit; never reset the branch or publish
  later code under the old version.
- Recover `PREV_TAG` from release history before the release commit; verify it
  is an ancestor. Keep that anchor for the SQL check and release notes. If
  ambiguous, ask; the bumped package version is not the previous version.
- Fetch origin. Verify every existing local and remote per-package and umbrella
  tag for `NEXT_VERSION` resolves to `RELEASE_COMMIT`. A remote annotated tag
  must be compared using its peeled commit. Stop on any mismatch; never move
  published tags. `publish-packages.sh` checks the whole set before publishing.
- Repeat any gates whose successful completion cannot be established for this
  release. Ensure the release commit is pushed to its intended branch. Check
  stable-main ancestry as below before publication; skip new-release Steps 1–6.
- Resume at the first incomplete step, using
  `./publish-packages.sh --anchor "$RELEASE_COMMIT" --yes` only when publication
  is authorised. Allow registry propagation before retrying. Existing matching
  tags and an existing GitHub release are left intact; edit published notes only
  if requested. Never restart the version bump to repair a tag or upload failure.

## Preconditions

For a new release, verify these before versioning. For a resume, use the
existing release commit and version as described above:

1. **`gh` is installed and authenticated** — `gh auth status` shows a logged-in
   account with `repo` scope.
2. **npm is authenticated** — `npm whoami` succeeds with an account that can
   publish to the `@modulus-learning` scope.
3. **Working tree is clean** — `git status --porcelain` is empty. (Otherwise the
   release commit would sweep up unrelated work.)
4. **Both `develop` and `main` exist locally and on origin, and neither is
   behind its tracking branch.** Run `git fetch origin && git rev-list
   --left-right --count <branch>...origin/<branch>` for each; the **right-hand
   number must be `0`**. The release branch is normally *ahead* — those are the
   commits being released, and Step 6 pushes them. Only a non-zero right-hand
   count is a blocker: unpulled remote work would be excluded from the release.
   For a stable release, also run `git merge-base --is-ancestor main HEAD` and
   `git merge-base --is-ancestor origin/main HEAD`. Resolve divergence before
   versioning or publishing. These checks are separate from tracking-branch
   freshness. Prereleases do not advance `main`.
5. **You are on a branch where the release should land** — normally `develop`.
   If on `main` or a feature branch, confirm with the user before proceeding.
6. **Read the *current* version** from `packages/core/package.json` and stash it
   as `PREV_VERSION`. This is the "before" anchor for the bump-level check.
7. **The previous release's anchor.** Use the tag `@modulus-learning/core@<PREV_VERSION>`
   if it exists; before core's first publish, fall back to
   `@modulus-learning/agent@<PREV_VERSION>`. Stash it as `PREV_TAG`.

### Gates before versioning

Run from the repository root. These gates build and pack packages. Stop before
versioning or publication if any fails:

```sh
pnpm run ci                                              # the main CI job
pnpm -F @modulus-learning/core schema:manifest:check     # release-script manifest current
pnpm -F @modulus-learning/core schema:baseline           # regenerate the baseline …
git diff --exit-code -- packages/core/src/database/sql/baseline.sql   # … and require no drift
bash scripts/check-release-sql.sh "$PREV_TAG"             # includes renamed/deleted released SQL
./scripts/packed-install.sh                              # the packed-install smoke test
```

The SQL check disables rename detection and requires every dated release script
from the previous release to remain present and byte-identical. Installations
record each script's checksum when they apply it, and refuse a changed one.

`pnpm run ci` already runs `pnpm check:packages` (publint and arethetypeswrong
on every packed tarball). To match GitHub’s separate packed-install job, set
`FIXTURE_DATABASE_URL` to a fresh, empty PostgreSQL 18 `*_test` database. Without
it, startup coverage is skipped: report that gap and do not claim full CI parity.

## Step 1 — Choose bump level

If the user supplied `patch`, `minor`, or `major`, use it. Otherwise ask using
the available user-input tool or a concise question:

- Question: `"Release bump level for v<PREV_VERSION> → next?"`
- Header: `"Bump level"`
- Options (in this order): **Patch (Recommended)** (bug fixes, internal chores),
  **Minor** (backward-compatible features, release scripts), **Major**
  (breaking changes).

Before 1.0, a breaking change is a minor bump with an upgrade note in the
release notes (see `specs/2026-10-28-modulus-packaging-and-distribution-spec.md`).

## Step 2 — Derive the changeset summary from commits

Do **not** ask the user for a summary. Build a short one (one or two lines,
never a paragraph) from the commits between the previous release and `HEAD`:

```sh
git log --oneline "$PREV_TAG..HEAD"
```

Rules for synthesising the line(s):

- Lead with the most user-visible change in the range. Bug fixes and features
  beat chores; chores beat dependency bumps.
- Mention package scope in bold backticks when it disambiguates (e.g.
  **`@modulus-learning/core`**) — otherwise keep it general.
- Past tense, lowercase, no trailing period, like a one-line changelog entry.
- Skip release commits (`chore(release): …`), pure lint/format commits, and dep
  bumps unless that's literally all there is in the range.
- Hard cap: two lines. The longer prose belongs in the umbrella GitHub release
  notes in Step 11, not in the per-package CHANGELOGs.

This text goes verbatim into the changeset markdown body, where
`pnpm version-packages` fans it out into every package's CHANGELOG.

## Step 3 — Write the changeset file

Write `.changeset/release-<timestamp>.md` with frontmatter listing every package
in the fixed group, all at the chosen bump level, followed by the summary from
Step 2. Generate the frontmatter from the config rather than typing it, so the
list can never drift from `fixed[0]`:

```sh
node -e "console.log(require('./.changeset/config.json').fixed[0].map(p=>JSON.stringify(p)+': <level>').join('\n'))"
```

## Step 4 — Run version-packages

`pnpm version-packages` (non-interactive — it consumes the changeset file).
After it completes:

- Read the `version` of every package in `fixed[0]`. Confirm they are all
  identical. If not, **stop** and show the divergence — something is wrong with
  the `fixed` group.
- Check the version against the Changesets release plan, pending changesets,
  and `.changeset/pre.json` when present. In stable mode verify the requested
  semantic-version bump; in prerelease mode account for the `next.N` suffix
  and counter. Do not apply a stable-only comparison to a prerelease or its exit.
  Stop and explain any mismatch before committing.
- Record this as `NEXT_VERSION`, and write it to the root `VERSION` file (the
  gradebook image tag follows the lockstep version).

## Step 5 — Lint

`pnpm lint` (Biome with safe auto-fix). If it fails on unrelated issues, stop
and surface the output. Review any source fixes before including them; rerun
affected checks if they change code. Markdown CHANGELOG formatting is disabled
in Biome, so inspect those changes separately.

## Step 6 — Release commit

Stage the bump artefacts explicitly — do **not** use `git add -A`:

- `git add .changeset/`
- `git add VERSION` and the `package.json` / `CHANGELOG.md` of every package in
  `fixed[0]`
- If lint touched anything else, include only files modified by the bump or by
  lint in this turn.

Commit with the literal message `chore(release): <NEXT_VERSION>`, with no
trailers (see `.agents/rules/conventional-commits.md`). Record the full SHA as
`RELEASE_COMMIT`, and push the current branch. Require a clean working tree.
For stable releases, fetch origin and recheck both `main` and `origin/main` are
ancestors of `RELEASE_COMMIT` before publishing.

## Step 7 — Confirm before publishing

Stop here and show the user:

- `PREV_VERSION → NEXT_VERSION`, and the dist-tag the script will use (`next`
  for a prerelease version, otherwise `latest`)
- The anchor commit SHA (short form, just-pushed `HEAD`)
- The changeset summary line(s) from Step 2
- The full proposed GitHub release notes from Step 11, prepared now
- The remaining steps: publish + push per-package tags → stable-only `main`
  sync → umbrella tag + GitHub release (marked prerelease for `next` versions).

Obtain explicit approval for this concrete result unless the user has already
authorised the same version, notes, and actions. Public npm publication is not
trivially reversible. Prepare all notes before asking so approval is the final
review step; do not ask again later for the same authorised actions.

## Step 8 — Publish to npm (+ push per-package tags)

`./publish-packages.sh --anchor "$RELEASE_COMMIT" --yes` — Step 7 establishes
authorisation, so `--yes` skips the script’s confirmation prompt. The script
requires the clean checkout to match that release commit and root `VERSION`.

This replaces `changeset publish` / `pnpm release:npm`, which **cannot publish
under passkey-only 2FA**. The script:

- Builds every package in the set via turbo.
- For each package in `fixed[0]`, dependencies first: `pnpm pack` (which
  rewrites `workspace:*` into real versions), guards against a `workspace:` leak
  in the tarball, then `npm publish <tarball> --access public --tag <dist-tag>`.
- Creates per-package git tags at the release commit
  (`@modulus-learning/core@<NEXT_VERSION>`, etc.) **and pushes them**.

For the same release anchor, packages already live at `NEXT_VERSION` are
skipped and matching tags are preserved. Mismatched tags abort before publishing.
Run `./publish-packages.sh --dry-run` first if you want to pack + verify without
publishing.

If publish fails partway, surface the script's output verbatim and stop.
Use the Resume path after diagnosing the failure; do not start another bump.

### Registry propagation — wait before concluding anything failed

npm registry propagation can take up to 5 minutes. Neither `npm view` nor a
direct packument fetch is authoritative during that window — both are
CDN-cached. The primary success signal is the script's own exit status: a failed
`npm publish` aborts the run, so a clean exit means the publishes were accepted.
If a sweep comes back short, wait and re-check; do not re-run the script on that
evidence alone.

## Step 9 — Push tags

Already handled by `./publish-packages.sh`. Nothing to do here unless the script
reported a tag-push failure, in which case `git push origin <tag> …` the ones it
names.

## Step 10 — Sync `main` for Stable Releases

Skip this step for prereleases. For a stable release, fetch origin again and
compare both local and remote `main` with `RELEASE_COMMIT`. If either already
contains that commit, do not rewind it. If it is an ancestor, fast-forward to
the exact release commit, never to a moving `develop` tip. Stop on divergence.

When both main refs can advance:

- `git checkout main`
- `git merge --ff-only "$RELEASE_COMMIT"`
- `git push origin main`
- Return to the original checkout (or release worktree).

On resume, verify remote reachability and skip a sync already completed.

## Step 11 — Umbrella GitHub release

This is the original `/release` behaviour, run with `NEXT_VERSION`:

1. **Verify the anchor commit.** `git rev-list -n 1 "@modulus-learning/core@<NEXT_VERSION>"` must equal `RELEASE_COMMIT`. The umbrella tag points to that same commit.
2. **Detect prior state (idempotency).**
   - Local umbrella tag `v<NEXT_VERSION>` exists? Verify it points at the anchor commit; if it diverges, stop and ask. If it matches, skip the create step.
   - Remote umbrella tag exists? Verify its peeled commit matches `RELEASE_COMMIT` before skipping the push.
   - Existing GitHub release? `gh release view v<NEXT_VERSION> --repo Modulus-Learning/app.modulus-learning.org` (capture exit code). If a release already exists, verify its tag and prerelease status, show its URL, and leave it unchanged unless the user requested an edit. Report mismatches before changing a published release.
3. **Synthesize release notes.** Group changes into these sections, in this order. Omit any section that has no entries — never include an empty heading.

   ```markdown
   ## Highlights

   New features, enhancements, and any other non-breaking, non-migrating changes likely to be of user interest. Lead each bullet with the affected package(s) in bold backticks: **`@modulus-learning/host-tanstack-start`**.

   ## Bug Fixes

   Direct bug fixes — regressions, packaging fixes, runtime corrections. Same bullet shape as Highlights.

   ## Chores

   Internal-tooling and dev-experience changes that don't alter consumer behaviour but are worth recording in the cycle (e.g. wiring a package check, updating the release script). Brief — usually one line per item.

   ## Migrations

   Non-breaking changes that nonetheless require the user to migrate existing data, run a script, or update configuration to take advantage of (or stay compatible with) the new behaviour. State the migration step explicitly. Name every new dated release script under `packages/core/src/database/sql/`, and state the operator step: run `modulus db upgrade` (or the installation's Fly `release_command`) before the new build serves traffic.

   ## Breaking Changes

   Anything that requires the user to change code, config, or dependencies *before* the release will run. State both the breaking change and the required user action. Mark inline mentions elsewhere with **breaking**: in bold.
   ```

   Within each section:
   - Lead each bullet with the package name(s) in bold backticks: **`@modulus-learning/core`**, **`@modulus-learning/host-tanstack-start`**. Use **monorepo** (no backticks) for cross-cutting items that aren't owned by a single package.
   - Each bullet should be a substantive paragraph, not a commit subject. Explain *what* changed in user-visible terms, *why* it matters (the constraint or bug it addresses), and any *consumer-side effect* (migration step, bundle impact, new install footprint, behavioural change). Past tense.
   - Focus on user-visible behaviour and migration impact, not implementation detail. But name specific symbols (component names, hook names, env vars, route paths) when the user would search for them.
   - Skip "patch dependencies updated" noise — those are auto-generated CHANGELOG entries, not release-note prose.

   **Always** end the notes with this exact closing line, outside any section, even if all sections were populated:

   ```
   All other `@modulus-learning/*` packages bumped to `<NEXT_VERSION>` in lockstep with no behavioural changes this cycle.
   ```

   This is the standing convention for lockstep releases — it signals to consumers that any package they pin from the set has the same baseline as the rest, regardless of whether that specific package shows up in the sections above.

   **Source priority for the prose:**
   1. The conversation context for this release cycle — usually the strongest source if the work happened in-session.
   2. `git log --oneline "$PREV_TAG..HEAD"` plus per-commit diffs (`git show <sha>`) for anything that's not obvious from the subject line.
   3. The top section of `packages/core/CHANGELOG.md` (the Step 2 line) — expand it with package context, not replace it.

   The umbrella release notes can and should be longer than the changeset summary — full sections, multiple bullets per section, with the depth of prose seen in recent releases (open `gh release view v<PREV_VERSION> --repo Modulus-Learning/app.modulus-learning.org` and match the tone). The Step 2 line is the headline; this is the cycle write-up.

   If you can't construct a confident summary, stop and ask the user for a paragraph rather than guessing.

4. **Check authorisation.** Step 7 includes the full proposed notes and remaining actions. Reuse that approval. Ask only if the notes or scope have materially changed or approval is still missing.

5. **Execute.** Write the notes to `/tmp/release-notes-v<NEXT_VERSION>.md`. Then, only running the steps actually needed:
   - `git tag v<NEXT_VERSION> <anchor-sha>`
   - `git push origin v<NEXT_VERSION>`
   - Stable: `gh release create v<NEXT_VERSION> --verify-tag --repo Modulus-Learning/app.modulus-learning.org --title "v<NEXT_VERSION>" --notes-file /tmp/release-notes-v<NEXT_VERSION>.md`
   - Prerelease: use the same command with `--prerelease --latest=false`. Never create an ordinary GitHub release for a `next` version.

6. **Report.** Print the release URL returned by `gh release create` (or by `gh release view` if it already existed and the user chose to leave it).

## Prereleases

For a prerelease line, enter Changesets prerelease mode first
(`pnpm changeset pre enter next`, committed), then run this command as usual:
versions become `X.Y.Z-next.N`, and `./publish-packages.sh` publishes them under
the `next` dist-tag automatically. Keep prereleases on `develop`, skip Step 10,
and mark the GitHub release with `--prerelease --latest=false`. Leave prerelease
mode with `pnpm changeset pre exit` before the stable release. Prerelease mode applies to
the whole set; an urgent stable fix during a prerelease cycle is released from a
short-lived branch cut from the last stable tag.

## Failure modes to handle gracefully

- `pnpm version-packages` produces no version change → no pending changeset was
  found; the file likely wasn't written correctly. Surface and stop.
- Lockstep mismatch after `version-packages` → show the divergence; stop.
- A gate fails (schema drift, a changed released script, a failing smoke test)
  → surface the output and stop before versioning.
- `./publish-packages.sh` fails partway → surface the output verbatim and stop.
  Re-running it is the intended recovery once the cause is fixed.
- `git merge --ff-only` on `main` fails → stop and ask how to reconcile.
- `gh release create` fails because of branch protection → surface the error verbatim and stop.
- Stable release commit is not reachable from remote `main` after sync → stop
  and report incomplete synchronisation. Prereleases intentionally stay off `main`.

## What this command does NOT do

- It does NOT publish itself — `./publish-packages.sh` does the npm publish and
  per-package tag creation/push; this command invokes it after Step 7 approval.
- It does NOT create draft GitHub releases unless the user asks at Step 11.
- It does NOT edit per-package tags. They are immutable npm bookkeeping.
- It does NOT skip hooks (`--no-verify`) or signing on the release commit.
- It does NOT deploy the gradebook. Deployment is `scripts/fly-deploy-*.sh`.
