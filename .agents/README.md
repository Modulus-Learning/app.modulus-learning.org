# Agent Configuration

This directory contains the canonical repository workflows for every agent.
Agents discover skills under `.agents/skills/`; Claude commands and skills
read the same files through their entry points under `.claude/`.

## Entry Points

| Claude entry point | Shared source |
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

The `.claude/` files remain in place so Claude Code continues to work.
`CLAUDE.md` imports `AGENTS.md` with `@AGENTS.md`, so shared repository rules
live only in `AGENTS.md`; `CLAUDE.md` holds Claude-specific details alone. When
a workflow changes, update its body only in `.agents/skills/`. Change a Claude
adapter only when its command arguments, runtime metadata, or target path
changes. Keep the conventional-commits rule copies synchronised; the Claude
copy is loaded by Claude's rules mechanism.
