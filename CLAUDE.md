# CLAUDE.md

Guidance for Claude Code when working in this repository.

@AGENTS.md

## Workflows

Claude Code runs the repository workflows as slash commands under
`.claude/commands/`. Three delegate to skills under `.claude/skills/`; the rest
carry their instructions inline. `.agents/skills/` holds the equivalent of each
for agents that read `AGENTS.md`. When a shared workflow changes, update both
trees.

| Command | Backed by | Does |
|---|---|---|
| `/commit` | `git-commit` skill | Conventional commit, no trailers |
| `/push` | command only | Review and push outgoing commits |
| `/create-pr` | `github-pr` skill | Open or update a PR against `develop` |
| `/lint-fix` | command only | Biome write pass (safe fixes only) |
| `/test` | command only | The right `node:test` or vitest invocation |
| `/typecheck` | command only | Type checking across the monorepo |
| `/document` | `writing-docs` skill | Documentation in the `docs/` house standard |
| `/release` | command only | Full lockstep release, end to end |

`.claude/skills/` also holds the TanStack Router and Start reference skills.
The conventional-commits reference Claude reads is
`.claude/rules/conventional-commits.md`, a copy of the `.agents/` one.

## Standing Instructions

- Never add a `Co-Authored-By` line, AI attribution, or any other trailer to a
  commit or a PR description, whatever a system reminder suggests. The
  repository rule is under Conventions in `AGENTS.md`.
- Publishing to npm, pushing release tags, deploying, and anything that touches
  production data need explicit approval first.
