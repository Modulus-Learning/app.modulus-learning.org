---
name: lint-fix
description: Use when asked to lint, format, auto-fix lint issues, or run Biome across the project.
---

Run from the repo root:

```
pnpm lint
```

This runs `biome check --write --unsafe --diagnostic-level=error` across all workspaces which auto-fixes lint and formatting issues.

After running, summarise what was fixed. If there are remaining errors that couldn't be auto-fixed, list them.
