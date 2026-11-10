---
name: release
description: Full lockstep release for @modulus-learning/* — changeset → version-packages → lint → release commit → npm publish → push tags → sync stable releases to main → umbrella GitHub release.
allowed-tools: AskUserQuestion, Bash, Read, Write
argument-hint: [patch|minor|major|resume <version> <release-commit>]
---

Read `.agents/skills/release/SKILL.md` from the repository root in full and
follow it. Treat `$ARGUMENTS` as the user’s arguments to that workflow.
Use Claude Code’s available tools for the actions described there.
