# Conventional Commits

All git commits in this project MUST use conventional commit format.

## Format

```
type(scope): lowercase message in past tense
```

## Types

- `feat:` — new feature or significant enhancement
- `fix:` — bug fix
- `chore:` — maintenance (no runtime behaviour change)
- `chore(deps):` — dependency updates
- `refactor:` — restructuring without behaviour change
- `docs:` — documentation only
- `specs:` — implementation plans, designs, and analyses under `specs/`
- `test:` — test changes
- `style:` — formatting/whitespace (not CSS — those are feat/fix)
- `ci:` — CI/CD changes
- `perf:` — performance improvements

## Scope

Optional. Use when changes are confined to one area: `feat(a11y):`, `fix(lti):`, `chore(deps):`.
Omit for cross-cutting changes.

## Style rules

- Lowercase after the colon
- Past tense preferred: "updated", "added", "fixed", "removed"
- Concise single line, no trailing period unless multi-sentence

## Trailers

- Commit messages carry **no trailers of any kind**. No `Co-Authored-By`, no AI
  attribution, no `Signed-off-by`. The subject line (plus a body where one is
  genuinely warranted) is the whole message.
- This repo does **not** use DCO sign-off — do not pass `-s` to `git commit`.

## Examples from this repo

- `chore(deps): updated deps`
- `feat(a11y): fixed barchart helper for accessable tooltips`
- `feat: extracted score submission client with tests`
- `feat: added background task to periodically clean nonces, auth codes, etc`
- `chore: migration to @infonomic/uikit 6 and TypeScript 6`
- `docs: renamed accessability reports`
