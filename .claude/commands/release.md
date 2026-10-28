---
name: release
description: Full lockstep release for @modulus-learning/* — changeset → version-packages → lint → release commit → npm publish → push tags → sync develop/main → umbrella GitHub release.
allowed-tools: AskUserQuestion, Bash, Read, Write
argument-hint: [optional bump level: patch|minor|major]
---

Drive the full release loop for the `@modulus-learning/*` lockstep set, end to
end. The publishable packages listed under `fixed` in `.changeset/config.json`
always move together to the same version. Always read the current set from that
file rather than trusting a count — it grows as packages are extracted (`lti`
and `lms-canvas` are planned).

The set lives in `packages/*` (`core`, `host-tanstack-start`) and `apps/agent`.
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
4. Runs `pnpm lint` to auto-fix any formatting churn on the bumped CHANGELOGs /
   package.json files.
5. Stages the bump + lint output and creates a single `chore(release): X.Y.Z`
   commit on the current branch (usually `develop`).
6. Pushes that branch.
7. Runs `./publish-packages.sh` — builds, packs (rewriting `workspace:*` deps),
   `npm publish`es each package in dependency order, and creates + pushes
   per-package tags. Replaces `changeset publish` / `pnpm release:npm`, which
   dead-ends under passkey-only 2FA.
8. Fast-forwards `main` to the release commit and pushes it, bringing `develop`
   and `main` back into sync.
9. Creates the umbrella `v<version>` tag and a single GitHub release that
   summarises the cycle.

The command is idempotent at every step — re-running after a partial failure
should detect what's already done and skip it.

## Preconditions

Before any visible action, verify all of these. If any fails, stop and explain
what the user needs to do:

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
5. **You are on a branch where the release should land** — normally `develop`.
   If on `main` or a feature branch, confirm with the user before proceeding.
6. **Read the *current* version** from `packages/core/package.json` and stash it
   as `PREV_VERSION`. This is the "before" anchor for the bump-level check.
7. **The previous release's anchor.** Use the tag `@modulus-learning/core@<PREV_VERSION>`
   if it exists; before core's first publish, fall back to
   `@modulus-learning/agent@<PREV_VERSION>`. Stash it as `PREV_TAG`.

### Gates before versioning

Run from the repository root. Stop before versioning, build, pack, or
publication if any fails:

```sh
pnpm run ci                                              # the full local CI gate
pnpm -F @modulus-learning/core schema:manifest:check     # release-script manifest current
pnpm -F @modulus-learning/core schema:baseline           # regenerate the baseline …
git diff --exit-code -- packages/core/src/database/sql/baseline.sql   # … and require no drift
git diff --exit-code --diff-filter=MD "$PREV_TAG" -- 'packages/core/src/database/sql/[0-9]*.sql'
./scripts/packed-install.sh                              # the packed-install smoke test
```

The last `git diff` requires every dated release script that shipped in the
previous release to remain present and byte-identical: installations record
each script's checksum when they apply it, and refuse a changed one.

`pnpm run ci` already runs `pnpm check:packages` (publint and arethetypeswrong
on every packed tarball). Run the smoke test with `FIXTURE_DATABASE_URL` set to
an empty `*_test` database when one is available, so core startup is covered.

## Step 1 — Choose bump level

If `$ARGUMENTS` is one of `patch` / `minor` / `major`, use that. Otherwise ask
via `AskUserQuestion`:

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
- Compute the expected next version from `PREV_VERSION` and the bump level.
  Confirm the new version matches. If not, stop and show actual vs expected.
- Record this as `NEXT_VERSION`, and write it to the root `VERSION` file (the
  gradebook image tag follows the lockstep version).

## Step 5 — Lint

`pnpm lint` (Biome with safe auto-fix). If it fails on unrelated issues, stop
and surface the output. If only the CHANGELOG / package.json files got
reformatted, continue.

## Step 6 — Release commit

Stage the bump artefacts explicitly — do **not** use `git add -A`:

- `git add .changeset/`
- `git add VERSION` and the `package.json` / `CHANGELOG.md` of every package in
  `fixed[0]`
- If lint touched anything else, include only files modified by the bump or by
  lint in this turn.

Commit with the literal message `chore(release): <NEXT_VERSION>`, with no
trailers (see `.claude/rules/conventional-commits.md`). Then `git push` on the
current branch.

## Step 7 — Confirm before publishing

Stop here and show the user:

- `PREV_VERSION → NEXT_VERSION`, and the dist-tag the script will use (`next`
  for a prerelease version, otherwise `latest`)
- The anchor commit SHA (short form, just-pushed `HEAD`)
- The changeset summary line(s) from Step 2
- The remaining steps: `./publish-packages.sh` (publish + push per-package
  tags) → fast-forward `main` and push → umbrella tag + GitHub release.

Wait for explicit approval. `./publish-packages.sh` publishes to the public npm
registry and is not trivially reversible — the user must confirm.

## Step 8 — Publish to npm (+ push per-package tags)

`./publish-packages.sh --yes` — Step 7 already captured explicit approval, so
`--yes` skips the script's own confirmation prompt.

This replaces `changeset publish` / `pnpm release:npm`, which **cannot publish
under passkey-only 2FA**. The script:

- Builds every package in the set via turbo.
- For each package in `fixed[0]`, dependencies first: `pnpm pack` (which
  rewrites `workspace:*` into real versions), guards against a `workspace:` leak
  in the tarball, then `npm publish <tarball> --access public --tag <dist-tag>`.
- Creates per-package git tags at the release commit
  (`@modulus-learning/core@<NEXT_VERSION>`, etc.) **and pushes them**.

It is **idempotent**: packages already live at `NEXT_VERSION` are skipped and
existing tags are left alone. Run `./publish-packages.sh --dry-run` first if you
want to pack + verify without publishing.

If publish fails partway, surface the script's output verbatim and stop.
Re-running the script is the intended recovery path — but only after the user
diagnoses why it failed.

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

## Step 10 — Sync `main`

- `git checkout main`
- `git merge --ff-only develop` (or whichever branch the release landed on). If
  fast-forward isn't possible, **stop** and ask the user how to reconcile.
- `git push origin main`
- `git checkout <original-branch>`

## Step 11 — Umbrella GitHub release

1. **Find the anchor commit.** `git rev-list -n 1 "@modulus-learning/core@<NEXT_VERSION>"`.
2. **Detect prior state (idempotency).**
   - Local umbrella tag `v<NEXT_VERSION>` exists? Verify it points at the
     anchor; if it diverges, stop and ask. If it matches, skip creating it.
   - Remote umbrella tag exists? Skip the push.
   - Existing GitHub release? `gh release view v<NEXT_VERSION> --repo
     Modulus-Learning/app.modulus-learning.org`. If one exists, show its URL and
     ask whether to leave it, edit the notes, or delete and recreate.
3. **Synthesize release notes**, in these sections and this order, omitting any
   that are empty: **Highlights**, **Bug Fixes**, **Chores**, **Migrations**,
   **Breaking Changes**. Lead each bullet with the affected package(s) in bold
   backticks (**`@modulus-learning/core`**), or **monorepo** for cross-cutting
   items. Each bullet is a substantive paragraph in user-visible terms: what
   changed, why, and any consumer-side effect. Past tense.
   - **Migrations** must name every new dated release script and the operator
     step: run `modulus db upgrade` (or the installation's Fly
     `release_command`) before the new build serves traffic.
   - **Breaking Changes** must state the required downstream action.
   - Always end with this exact line, outside any section:

     ```
     All other `@modulus-learning/*` packages bumped to `<NEXT_VERSION>` in lockstep with no behavioural changes this cycle.
     ```

   Source priority: this session's context, then `git log --oneline
   "$PREV_TAG..HEAD"` and `git show <sha>`, then the top of
   `packages/core/CHANGELOG.md`. If you can't construct a confident summary,
   ask the user for a paragraph rather than guessing.
4. **Confirm before any visible action.** Show the version, anchor SHA, full
   proposed notes, and the steps about to run. Wait for explicit approval.
5. **Execute** only the steps needed: write the notes to
   `/tmp/release-notes-v<NEXT_VERSION>.md`, then
   - `git tag v<NEXT_VERSION> <anchor-sha>`
   - `git push origin v<NEXT_VERSION>`
   - `gh release create v<NEXT_VERSION> --repo Modulus-Learning/app.modulus-learning.org --title "v<NEXT_VERSION>" --notes-file /tmp/release-notes-v<NEXT_VERSION>.md`
6. **Report** the release URL.

## Prereleases

For a prerelease line, enter Changesets prerelease mode first
(`pnpm changeset pre enter next`, committed), then run this command as usual:
versions become `X.Y.Z-next.N`, and `./publish-packages.sh` publishes them under
the `next` dist-tag automatically. Leave prerelease mode with
`pnpm changeset pre exit` before the stable release. Prerelease mode applies to
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
- `gh release create` fails → surface the error verbatim and stop.

## What this command does NOT do

- It does NOT publish itself — `./publish-packages.sh` does the npm publish and
  per-package tag creation/push; this command invokes it after Step 7 approval.
- It does NOT create draft GitHub releases unless the user asks at Step 11.
- It does NOT edit per-package tags. They are immutable npm bookkeeping.
- It does NOT skip hooks (`--no-verify`) or signing on the release commit.
- It does NOT deploy the gradebook. Deployment is `scripts/fly-deploy-*.sh`.
