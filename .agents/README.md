# Agent Configuration

This directory contains repository-local workflows for agents that read
`AGENTS.md` and discover skills under `.agents/skills/`.

## Migration map

| Claude source | Agent equivalent |
|---|---|
| `CLAUDE.md` | `AGENTS.md` |
| `.claude/rules/conventional-commits.md` | `.agents/rules/conventional-commits.md` |
| `.claude/skills/git-commit/` | `.agents/skills/git-commit/` |
| `.claude/skills/github-pr/` | `.agents/skills/github-pr/` |
| `.claude/skills/writing-docs/` and `/document` | `.agents/skills/writing-docs/` |
| `/release` | `.agents/skills/release/` |
| `/test` | `.agents/skills/test/` |
| `/typecheck` | `.agents/skills/typecheck/` |
| `/lint-fix` | `.agents/skills/lint-fix/` |
| `/push` | `.agents/skills/git-push/` |
| `/commit`, `/create-pr` | Covered by `git-commit` and `github-pr` |

Claude's `.claude/launch.json` has no `.agents` equivalent. Its useful run
commands are documented in `AGENTS.md`. Claude permission allowlists in
`.claude/settings*.json` are also not portable: each agent runtime enforces its
own sandbox and approval policy.

The `.claude/` files remain in place so Claude Code continues to work. When a
shared repository rule changes, update both `CLAUDE.md` and `AGENTS.md`; when a
workflow changes, update the corresponding skill in both configuration trees.
