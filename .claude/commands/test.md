---
name: test
description: Run tests. Pass a file path to run a single test, or no arguments to run all tests.
allowed-tools: Bash, Read
argument-hint: [path/to/file.test.ts]
---

Read `.agents/skills/test/SKILL.md` from the repository root in full and
follow it. Treat `$ARGUMENTS` as the user’s arguments to that workflow.
Use Claude Code’s available tools for the actions described there.
