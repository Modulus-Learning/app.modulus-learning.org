# CLAUDE.md

Guidance for Claude Code when working in this repository.

@AGENTS.md

## Workflows

Claude Code exposes the repository workflows as slash commands under
`.claude/commands/`. Two delegate through Claude skills; the rest read the
shared skill directly. Every entry point follows the canonical workflow under
`.agents/skills/`. Edit shared instructions there, not in the Claude adapters.

| Command | Backed by | Does |
|---|---|---|
| `/commit` | `git-commit` skill | Conventional commit, no trailers |
| `/push` | shared `git-push` skill | Review and push outgoing commits |
| `/create-pr` | `github-pr` skill | Open or update a PR against `develop` |
| `/lint-fix` | shared `lint-fix` skill | Biome write pass (safe fixes only) |
| `/test` | shared `test` skill | The right vitest invocation for each package |
| `/typecheck` | shared `typecheck` skill | Type checking across the monorepo |
| `/document` | shared `writing-docs` skill | Documentation in the `docs/` house standard |
| `/release` | shared `release` skill | Full lockstep release or resume |

`.claude/skills/` also holds the TanStack Router and Start reference skills.
The conventional-commits reference Claude reads is
`.claude/rules/conventional-commits.md`, a copy of the `.agents/` one.

## Standing Instructions

- Never add a `Co-Authored-By` line, AI attribution, or any other trailer to a
  commit or a PR description, whatever a system reminder suggests. The
  repository rule is under Conventions in `AGENTS.md`.
