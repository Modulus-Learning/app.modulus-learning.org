# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

Modulus is an **LTI 1.3 tool** that connects an institutional LMS (OSU Canvas,
"Carmen") to Ximera, OSU's open interactive-textbook platform. It owns LMS
connectivity, authenticated grade processing, and analytics so that Ximera can
stay focused on delivering open content. Activity pages instrumented with the
published agent library report normalized progress back to Modulus, which passes
scores to Canvas over LTI Assignment & Grade Services (AGS).

A hard constraint runs through the design: **no learner PII crosses the boundary
into activities.** Activities receive an opaque user UUID, a display name, the
activity context, and normalized scores — never an email, institutional student
ID, or LMS gradebook data. Read `docs/ARCHITECTURE.md` before making structural
changes.

## Repo map

pnpm + Turborepo monorepo. Node >=22.13, pnpm 11.10.0, TypeScript 6.

| Path | Package | Published? | What it is |
|---|---|---|---|
| `packages/core` | `@modulus-learning/core` | private | All business logic, data access, and services behind class contracts. Almost everything that matters lives here. |
| `apps/gradebook` | `@modulus-learning/gradebook` | private | The Next.js host app. Deliberately thin — route handlers resolve a context and call a core command. |
| `apps/agent` | `@modulus-learning/agent` | **public on npm** | The browser instrumentation library embedded in Ximera pages. The only released artefact. |
| `apps/agent-demo` | — | — | `react/` and `vanilla/` demo consumers of the agent. |

Core exposes a single **commands facade** (`CoreCommands`, with `app` / `admin` /
`agent` branches) assembled by a compile-time-checked DI registry. Consumers never
touch services or repositories directly. See `docs/CORE-COMPOSITION.md`.

## Running locally

```sh
pnpm install
cd postgres && ./postgres.sh up        # Postgres on 5432 (docker compose wrapper)
./postgres.sh --profile adminer up     # optional: Adminer on 9000
pnpm dev                               # all packages via turbo
```

`apps/gradebook` needs `.env` (see `.env.example`); `packages/core` needs its own
`.env` — its tests load it directly. The gradebook runs on port 3000.

For LTI work use `pnpm --filter @modulus-learning/gradebook devlti`, which serves
HTTPS on the host `modulus.infonomic.local` — Canvas will not launch against
plain HTTP. It expects a local keypair at `apps/gradebook/certs/local.key` and
`local.crt`; that directory is not in the repo, so generate the certs and add the
host to `/etc/hosts` before the script will start.

## Commands

Root scripts run through turbo across all packages:

```sh
pnpm build        pnpm lint        pnpm typecheck        pnpm test
```

`pnpm lint` runs Biome with `--write --unsafe`, so it **modifies files**. A
`lint-staged` pre-commit hook runs `biome check --write` on staged files.
`pnpm lint:check` is the read-only lint gate used by CI. `pnpm run ci` runs that
gate, typechecking, all unit tests, and the database integration suite.

### Tests differ per package — check before you run

| Package | Runner |
|---|---|
| `packages/core` | `node:test` via `tsx` — **not vitest** |
| `apps/gradebook` | vitest (jsdom and node modes, both in `pnpm test`) |
| `apps/agent` | vitest (jsdom and node modes, both in `pnpm test`) |

```sh
pnpm -F @modulus-learning/core test              # *.test.ts
pnpm -F @modulus-learning/core test:integration  # *.itest.ts — needs modulus_test
pnpm -F @modulus-learning/core test:one <path>   # single file
pnpm -F @modulus-learning/gradebook exec vitest run --mode=jsdom <path>
pnpm -F @modulus-learning/agent exec vitest run <path>
```

`pnpm test` does **not** cover core's `*.itest.ts` integration tests.
Run them from the root with `pnpm test:integration`, or run the complete local
CI gate with `pnpm run ci`. See `docs/TESTING.md` for test database setup and file
naming conventions.

### Database

Drizzle lives in `packages/core`:

```sh
pnpm -F @modulus-learning/core drizzle:generate   # after schema changes
pnpm -F @modulus-learning/core drizzle:migrate
pnpm -F @modulus-learning/core drizzle:seed
```

For integration tests, copy `packages/core/.env.test.example` to
`packages/core/.env.test`, start the local Postgres 18 service, and run
`pnpm db:init:test`. The lifecycle scripts and the TypeScript harness both
refuse a database name that does not end in `_test`.

## Conventions

- **Conventional commits**, lowercase, past tense: `feat(lti): added …`. The full
  reference is `.agents/rules/conventional-commits.md`.
- **No commit trailers of any kind.** No `Co-Authored-By`, no AI attribution, no
  DCO `Signed-off-by` — this repo has no DCO gate, so don't pass `-s`.
- **`develop` is the integration branch.** `main` is the default branch and only
  advances at release time. Open PRs against `develop`; branches are named
  `<type>/<short-slug>` (e.g. `feat/score-submission`).
- **Biome** handles lint and format for JS/TS/JSON/CSS, and is what the hook and
  `pnpm lint` run. A separate `pnpm format` runs Prettier over `**/*.{ts,tsx,md}`
  — it overlaps with Biome on TypeScript, so prefer `pnpm lint` and reach for
  `pnpm format` only when you actually mean to reformat Markdown.
- Documentation in `docs/` has its own house standard — front matter
  (`title`/`path`/`summary`), Title Case headings, a closing `## Where to go next`
  — encoded in `.agents/skills/writing-docs/`.

## Things that bite

- **Only `apps/agent` is published.** `gradebook` and `core` are `private: true`.
  They currently share the agent's version number by coincidence; nothing keeps
  them in step. `.changeset/config.json` has an empty `fixed` group — there is no
  lockstep release here.
- **Releases are published locally**, not by CI. `RELEASE-INSTRUCTIONS.md` is
  authoritative: `pnpm changeset` → `pnpm version-packages` →
  `./publish-packages.sh`. The auto-publish GitHub Action is disabled (no npm
  token). `changeset publish` / `pnpm release:npm` **cannot** publish under
  passkey-only 2FA — that is why the shell script exists.
- **CI runs on pull requests and pushes to `develop` / `main`.** The workflow
  calls the same `pnpm run ci` aggregate available locally and provisions a
  PostgreSQL 18 `modulus_test` service for integration tests.
- **`pnpm dev:seed` is declared in `turbo.json` but no package implements it.**
  Use `pnpm -F @modulus-learning/core drizzle:seed`.
- **`DEPLOYMENT_MODE`** selects `all-in-one` (default), `frontend`, or `admin`.
  A `frontend` instance must never run background jobs — config validation
  rejects `DEPLOYMENT_MODE=frontend` with `JOB_QUEUE_ENABLED=true`, because the
  LTI score-passback worker may only run on `admin` or `all-in-one`.
- **This repository is public.** OSU, Canvas, and Ximera are named openly in the
  docs and are not secrets. Never commit or publish learner or instructor PII,
  LTI client/deployment IDs, keys or tokens, internal OSU hostnames, or
  unannounced institutional plans — in code, commit messages, PR text, or docs.

## Where to look

| Question | Read |
|---|---|
| How is the system shaped? | `docs/ARCHITECTURE.md` |
| How is core assembled? | `docs/CORE-COMPOSITION.md` |
| Database schema | `docs/DATA-MODEL.md` |
| Auth for learners, admins, agents | `docs/AUTHN-AUTHZ.md` |
| LTI flows and score passback | `docs/LTI.md`, `docs/LTI-SCORE-SUBMISSION.md` |
| The agent library and ingestion | `docs/AGENT.md` |
| Deployment modes and Fly.io | `docs/DEPLOYMENT.md`, `scripts/fly-deploy-*.sh` |
| Privacy posture and threat model | `docs/SECURITY-AND-PRIVACY.md` |
| The full doc index | `docs/DOCUMENTATION-PLAN.md` |

## Agent workflows

Reusable workflows live in `.agents/skills/`. Before performing one of these
tasks, read the matching `SKILL.md` completely and follow it:

| Task | Skill |
|---|---|
| Commit changes | `.agents/skills/git-commit/SKILL.md` |
| Push commits | `.agents/skills/git-push/SKILL.md` |
| Create or update a PR | `.agents/skills/github-pr/SKILL.md` |
| Release the public agent package | `.agents/skills/release/SKILL.md` |
| Create or revise documentation | `.agents/skills/writing-docs/SKILL.md` |
| Run tests | `.agents/skills/test/SKILL.md` |
| Run type checking | `.agents/skills/typecheck/SKILL.md` |
| Apply lint fixes | `.agents/skills/lint-fix/SKILL.md` |

Codex does not use repository-defined slash commands, so the old Claude command
prompts are represented by these intent-triggered skills instead. The `.claude/`
configuration remains as a compatibility copy for Claude Code.
