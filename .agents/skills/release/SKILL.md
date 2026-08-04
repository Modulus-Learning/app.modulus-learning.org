---
name: release
description: Use when asked to release or publish @modulus-learning/agent. Runs the changeset, versioning, lint, release commit, npm publish and tag, develop/main sync, and optional GitHub release workflow. Accepts an optional patch, minor, or major bump level.
---

Drive the release loop for **`@modulus-learning/agent`** (`apps/agent`), end to end.

This repo publishes exactly **one** package. `apps/gradebook` and `packages/core`
are `private: true` and are never published — they carry version numbers that
happen to match the agent's today, but nothing keeps them in step, so never bump
or reason about them as a set. `.changeset/config.json` has an empty `fixed`
group, which is correct: there is no lockstep here.

Read `RELEASE-INSTRUCTIONS.md` before starting — it is the human-facing statement
of this process and takes precedence if the two ever disagree.

## What this workflow does

1. Asks the user for the bump level (patch / minor / major).
2. Derives a one- or two-line changeset summary from the commits since the
   previous release tag and writes a changeset file for `@modulus-learning/agent`
   at that level.
3. Runs `pnpm version-packages` and verifies the agent landed on the expected
   version.
4. Runs `pnpm lint` to absorb any formatting churn on the bumped
   `CHANGELOG.md` / `package.json`.
5. Stages the bump and creates a single `chore(release): X.Y.Z` commit on the
   current branch (usually `develop`), then pushes it.
6. Runs `./publish-packages.sh` — builds, packs (rewriting `workspace:*` deps),
   `npm publish`es the tarball, then creates and pushes the
   `@modulus-learning/agent@<version>` tag.
7. Fast-forwards `main` to the release commit and pushes it.
8. Optionally creates a GitHub release for the cycle.

The workflow is idempotent at every step — re-running after a partial failure
should detect what's already done and skip it.

## Preconditions

Before any visible action, verify all of these. If any fails, stop and explain
what the user needs to do:

1. **npm auth** — the user must already be logged in (`npm whoami`). Publishing
   goes through `npm publish` against the `@modulus-learning` scope; if this is
   not set up, stop and point them at `npm login`.
2. **`gh` is installed and authenticated** — only needed if the user wants the
   optional GitHub release in Step 10. Check with `gh auth status` at that point,
   not up front.
3. **Working tree is clean** — `git status --porcelain` is empty. Otherwise the
   release commit would sweep up unrelated work.
4. **Both `develop` and `main` exist locally and on origin**, and both are up to
   date with their tracking branches
   (`git fetch origin && git rev-list --left-right --count <branch>...origin/<branch>`
   shows `0 0`).
5. **You are on a branch where the release should land** — normally `develop`. If
   on `main` or a feature branch, confirm with the user before proceeding.
6. **Read the current version** from `apps/agent/package.json` and stash it as
   `PREV_VERSION`. This is the "before" anchor for the bump-level check.

## Step 1 — Choose bump level

If the user supplied one of `patch` / `minor` / `major`, use that. Otherwise ask
the user:

- Question: `"Release bump level for v<PREV_VERSION> → next?"`
- Header: `"Bump level"`
- Options (in this order): **Patch (Recommended)** (bug fixes, internal chores),
  **Minor** (backward-compatible features), **Major** (breaking changes).

Remember that the agent is an embedded browser library consumed by Ximera pages.
A change to its authoring API, its network contract with Modulus, or its bundle
shape is user-visible to activity authors even when the server is untouched —
weight the bump accordingly.

## Step 2 — Derive the changeset summary from commits

Do **not** ask the user for a summary. Build a short one (one or two lines, never
a paragraph) from the commits between the previous release tag and `HEAD`:

```sh
git log --oneline "@modulus-learning/agent@<PREV_VERSION>..HEAD"
```

Because the tag covers the whole repo but only the agent ships, filter to what
actually affects the published package:

```sh
git log --oneline "@modulus-learning/agent@<PREV_VERSION>..HEAD" -- apps/agent
```

Use the second list to write the summary; use the first only for context on
whether a server-side change alters the agent's contract.

Rules for synthesising the line(s):

- Lead with the most user-visible change. Bug fixes and features beat chores;
  chores beat dependency bumps.
- Past tense, lowercase, no trailing period. It should read like a one-line
  changelog entry, e.g. *"added client-error error type and made agent
  dependencies injectable"*.
- Skip release commits (`chore(release): …`), pure lint/format commits, and dep
  bumps unless that's literally all there is in the range.
- Hard cap: two lines. Longer prose belongs in the optional GitHub release notes
  in Step 10, not in the CHANGELOG.

This text goes verbatim into the changeset markdown body, from where
`pnpm version-packages` fans it into `apps/agent/CHANGELOG.md`.

## Step 3 — Write the changeset file

Pick a slug — `release-<timestamp>` is fine (e.g. `release-2026-08-03-1145`).
Write `.changeset/<slug>.md`:

```markdown
---
"@modulus-learning/agent": <level>
---

<summary derived in Step 2>
```

Name only `@modulus-learning/agent`. Adding a private package here is an error —
changesets will refuse to publish it and the bump would be meaningless.

## Step 4 — Run version-packages

`pnpm version-packages` (non-interactive — it consumes the changeset file). After
it completes:

- Compute the expected next version from `PREV_VERSION` and the chosen bump level
  (e.g. `0.9.1` + patch = `0.9.2`, + minor = `0.10.0`, + major = `1.0.0`).
- Read `apps/agent/package.json` and confirm the version matches. If not, stop and
  show actual vs expected.
- Confirm `apps/agent/CHANGELOG.md` gained an entry carrying the Step 2 summary.
- Record the result as `NEXT_VERSION`.

## Step 5 — Lint

`pnpm lint` (`turbo run lint --continue`; each package runs
`biome check --write --unsafe`). If it fails on unrelated issues, stop and surface
the output. If only the bumped `CHANGELOG.md` / `package.json` got reformatted,
continue.

## Step 6 — Release commit

Stage the bump artefacts explicitly — do **not** use `git add -A`:

- `git add .changeset/` (the consumed changeset file is removed; the config stays)
- `git add apps/agent/package.json apps/agent/CHANGELOG.md`
- If lint touched anything else, include only files actually modified by the bump
  or by lint in this turn.

Commit with the literal message `chore(release): <NEXT_VERSION>` — no trailers,
no `-s` (see `.agents/rules/conventional-commits.md`). Then `git push` on the
current branch.

## Step 7 — Confirm before publishing

Stop here and show the user:

- `PREV_VERSION → NEXT_VERSION`
- The anchor commit SHA (short form, just-pushed `HEAD`)
- The changeset summary line(s) from Step 2
- The remaining steps: `./publish-packages.sh` (publish + push tag) →
  fast-forward `main` and push → optional GitHub release.

Wait for explicit approval. `./publish-packages.sh` publishes to the public npm
registry and is not reversible — the user must confirm.

## Step 8 — Publish to npm (+ push the tag)

`./publish-packages.sh --yes` — Step 7 already captured explicit approval, so
`--yes` skips the script's own confirmation prompt.

This replaces `pnpm release:npm` (`changeset publish`), which **cannot publish
under passkey-only 2FA** — pnpm's OTP pre-check accepts only a typed numeric code
and dead-ends at `ERR_PNPM_OTP_NON_INTERACTIVE`. Plain `npm publish` honours the
bypass token in `~/.npmrc` silently. The script:

- Builds `@modulus-learning/agent` via `pnpm turbo run build --filter=…`.
- Runs `pnpm pack` (which rewrites `workspace:*` into real versions), refuses to
  continue if a `workspace:` spec leaked into the tarball, then
  `npm publish <tarball> --access public`.
- Creates the `@modulus-learning/agent@<NEXT_VERSION>` tag at `HEAD` **and pushes
  it** — no separate tag step is needed.
- Sweeps any `*.tgz` on exit, so a failed run leaves nothing behind.

It is **idempotent**: a version already live on npm is skipped and an existing tag
is left alone, so re-running after a partial failure just finishes the job. Run
`./publish-packages.sh --dry-run` first if you want to pack and verify without
publishing; `--no-build` reuses an existing `dist/`.

If publish fails partway, surface the script's output verbatim and stop.
Re-running is the intended recovery path — but only after the user diagnoses why
it failed.

## Step 9 — Sync `main`

Bring `main` up to the release commit so the two branches don't drift:

- `git checkout main`
- `git merge --ff-only develop` (or whichever branch the release landed on). If
  fast-forward isn't possible because `main` has commits `develop` doesn't,
  **stop** and ask the user how to reconcile.
- `git push origin main`
- `git checkout <original-branch>` to return to where you started.

Note that `.changeset/config.json` sets `baseBranch: "main"`, and
`.github/workflows/release.yml` watches pushes to `main`. That workflow is the
disabled auto-publish flow described in Section I of `RELEASE-INSTRUCTIONS.md`
(no npm token is configured). If it ever gets re-enabled, this step would trigger
it and the manual publish in Step 8 would need to be dropped — check the workflow
before assuming Step 8 is still the right path.

## Step 10 — Optional GitHub release

The manual flow does **not** create a GitHub release, and this repo has none yet.
Ask the user whether they want one; if not, skip to Report.

If they do:

1. **Check `gh auth status`** now.
2. **Find the anchor commit.** `git rev-list -n 1 "@modulus-learning/agent@<NEXT_VERSION>"`.
3. **Detect prior state (idempotency).** If a release for this version already
   exists (`gh release view v<NEXT_VERSION> --repo Modulus-Learning/app.modulus-learning.org`),
   show its URL and ask whether to leave it, edit the notes, or delete and
   recreate.
4. **Synthesize release notes.** Group into these sections, in this order, and
   omit any that has no entries — never include an empty heading.

   ```markdown
   ## Highlights

   New features and enhancements likely to be of interest to activity authors and
   integrators.

   ## Bug Fixes

   Regressions, packaging fixes, runtime corrections.

   ## Chores

   Internal tooling and dev-experience changes worth recording. One line each.

   ## Breaking Changes

   Anything requiring a consumer to change code, markup, or configuration before
   upgrading. State both the change and the required action.
   ```

   Within each section: each bullet is a substantive sentence or two, not a commit
   subject. Explain what changed in user-visible terms, why it matters, and any
   consumer-side effect. Past tense. Name specific symbols (option names, event
   names, endpoints) when a reader would search for them. Skip dependency-bump
   noise.

   Since the agent is the only published artefact, do **not** carry over any
   "other packages bumped in lockstep" boilerplate — there are no other packages.

   **Source priority for the prose:**
   1. The conversation context for this release cycle.
   2. `git log --oneline "@modulus-learning/agent@<PREV_VERSION>..HEAD" -- apps/agent`
      plus per-commit diffs (`git show <sha>`) where the subject isn't
      self-explanatory.
   3. The top section of `apps/agent/CHANGELOG.md` — expand the Step 2 line, don't
      just repeat it.

   Keep it free of learner PII, credentials, and internal hostnames — this repo
   and its releases are public.

   If you can't construct a confident summary, stop and ask the user for a
   paragraph rather than guessing.

5. **Confirm before any visible action.** Show the version, anchor SHA, and the
   full proposed notes. Wait for explicit approval.
6. **Execute.** Write the notes to a scratch file, then:
   - `git tag v<NEXT_VERSION> <anchor-sha>` (the umbrella tag; distinct from the
     package tag the script already pushed)
   - `git push origin v<NEXT_VERSION>`
   - `gh release create v<NEXT_VERSION> --repo Modulus-Learning/app.modulus-learning.org --title "v<NEXT_VERSION>" --notes-file <path>`

## Report

Show the published version, the npm package URL, the pushed tag, whether `main`
was synced, and the GitHub release URL if one was created.

## Failure modes to handle gracefully

- `pnpm version-packages` produces no version change → no pending changeset was
  found; the changeset file likely wasn't written correctly. Surface and stop.
- The agent's version moved but `CHANGELOG.md` didn't → the changeset body was
  empty. Stop and show it.
- `./publish-packages.sh` reports a workspace leak → a `workspace:*` dep survived
  packing. Do not retry blindly; surface the output and stop.
- `./publish-packages.sh` fails at `npm publish` → most often auth or 2FA. Surface
  the output verbatim and stop; re-running is safe once fixed, since an
  already-published version is skipped.
- `git merge --ff-only develop` on `main` fails → `main` has diverged. Stop and ask
  how to reconcile.
- Anchor commit is not reachable from `main` after Step 9 → warn loudly.

## What this workflow does NOT do

- It does NOT publish directly — `./publish-packages.sh` does the npm publish and
  the package tag; this orchestrator only invokes it (with `--yes`, after the
  Step 7 approval).
- It does NOT touch `apps/gradebook` or `packages/core` versions. Those are
  private and are not part of any release.
- It does NOT create a GitHub release unless the user asks in Step 10.
- It does NOT edit or move the `@modulus-learning/agent@<version>` tag. Those are
  immutable npm-bookkeeping artefacts.
- It does NOT skip hooks (`--no-verify`) on the release commit.
