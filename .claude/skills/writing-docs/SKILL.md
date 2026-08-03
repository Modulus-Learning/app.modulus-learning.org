---
name: writing-docs
description: Use when creating, rewriting, tightening, or reviewing any Modulus documentation — the documents under docs/ (introduction, architecture, core composition, data model, authn/authz, LTI, agent, deployment, security and privacy) and any per-package design notes. Trigger whenever the user asks to write, draft, improve, or review a doc; add a setup or getting-started section; document a subsystem, package, or API; or turn design notes into reference. Also use whenever a new subsystem ships and needs documenting, or a Planned document in DOCUMENTATION-PLAN.md is being written. This skill encodes Modulus's documentation standard — doc-type selection, required structure, definition-before-use, runnable code examples, and house voice — so new and revised docs match the existing set rather than drifting from it.
---

# Writing Modulus docs

Modulus's docs are unusually good for a project this young: they orient the
reader before explaining, define their vocabulary before using it, show real code
from the repo rather than pseudocode, and are honest about what is not yet built.
`docs/ARCHITECTURE.md`, `docs/CORE-COMPOSITION.md`, and `docs/LTI.md` set the bar.

That makes your job specific: **match the existing set, don't drift from it.** The
risk here is not a bad doc, it's an inconsistent one — a new page in a different
voice, with different heading case, missing the closing section every other doc
has, or documenting an API from memory that has since changed. The bar is: a
competent developer who has never seen Modulus can land on the page, know within
two sentences what it is and whether it's for them, and leave able to *do* the
thing — with working code, not paraphrase.

Read this whole file before writing. Then read the relevant implementation,
manifests, and tests: the code and executable config are the source of truth, and
the doc must describe what the code actually does — not what memory or an older
doc suggests. Then pick a doc type, follow its skeleton, and run the self-check at
the end before you call it done.

## Step 1 — Pick the doc type first

Decide which one you're writing. The four types come from Diátaxis (diataxis.fr);
each has a different job and a different shape, and they must not blur inside a
single section.

| Type | Job | Modulus examples |
|------|-----|------------------|
| **Tutorial** | Teach a newcomer by walking them through a guaranteed-to-work path. Learning-oriented. | the Planned "Getting Started" doc; the local setup path in `docs/DEPLOYMENT.md` |
| **How-to / recipe** | Get a competent user to an outcome for a specific task. Assumes background. | the per-flow walkthroughs in `docs/LTI.md`, the platform-registration steps |
| **Reference** | Let a working developer look up exact facts fast. No narrative. | the entity-group listings in `docs/DATA-MODEL.md`, the provider kinds in `docs/CORE-COMPOSITION.md` |
| **Explanation** | Build understanding — the "why", the tradeoffs, the rejected alternatives. | `docs/ARCHITECTURE.md`, `docs/INTRODUCTION.md`, `docs/DYNAMIC-ACTIVITIES.md` |

The subsystem docs (`docs/LTI.md`, `docs/AUTHN-AUTHZ.md`, `docs/AGENT.md`,
`docs/CORE-COMPOSITION.md`, `docs/DATA-MODEL.md`) are deliberately **reference +
explanation hybrids**. That's allowed — but section them so the two stay separate:
an explanation part ("how it works and why") and a reference part ("the exact
surface"). Do not answer a "why" question in the middle of a lookup table, or drop
a command signature into a paragraph of rationale.

If you can't name the type in one word, the doc isn't scoped yet. Split it.

## Step 2 — Use the skeleton for that type

Every doc opens with the same house wrapper; the type-specific skeleton is the
body that follows it.

### House format (every doc)

Docs under `docs/` are imported and served by the CMS, so the top of the file is
not free-form:

```markdown
---
title: "Human-readable title"
path: "url-slug"
summary: "One sentence describing what the document explains."
---

# Human-readable title
```

- **Write all three keys.** `title`, `path`, and `summary` are the house contract
  (`docs/DOCUMENTATION-PLAN.md` states it explicitly). There is no automated
  checker in this repo, so nothing will catch a missing key for you.
- **`path` is the published URL slug and must be unique across `docs/`.** It is
  *not* derived from the filename — it is chosen. Usually it is the lowercased
  filename (`ARCHITECTURE.md` → `architecture`, `LTI-SCORE-SUBMISSION.md` →
  `lti-score-submission`), but not always: `DOCUMENTATION-PLAN.md` publishes as
  `documentation-overview`, and `CUMMULATIVE-PROGRESS.md` publishes as
  `cumulative-progress` — correcting the typo in the filename. Grep the other
  docs' front matter (`grep -h '^path:' docs/*.md`) before choosing one.
- **`summary` is one long, concrete sentence**, not a teaser — it lists what the
  document actually covers. Match the density of the existing summaries.
- **The front-matter `title` and the first H1 must match**, or the rendered page
  gets a duplicate heading. Never put backticks or emphasis in the front-matter
  title.
- **Close with `## Where to go next`** — a short list of related documents, each
  with a one-line reason to click. Every system and subsystem doc ends this way:
  `ARCHITECTURE`, `CORE-COMPOSITION`, `DATA-MODEL`, `AUTHN-AUTHZ`, `LTI`,
  `AGENT`, `DEPLOYMENT`, and `SECURITY-AND-PRIVACY` all do. (`INTRODUCTION.md`
  closes on `## Status` and `DYNAMIC-ACTIVITIES.md` on an appendix — both are
  special cases, not licence to skip it.) This is where cross-document navigation
  lives — link a companion rather than repeating its explanation.

### Where the file goes

`docs/` is **flat** — no numbered directories, no per-section `index.md`. Files
are named in SCREAMING-KEBAB-CASE after their subject:

```text
docs/INTRODUCTION.md   ARCHITECTURE.md   CORE-COMPOSITION.md   DATA-MODEL.md
docs/AUTHN-AUTHZ.md    LTI.md   LTI-SCORE-SUBMISSION.md   AGENT.md
docs/DYNAMIC-ACTIVITIES.md   CUMMULATIVE-PROGRESS.md   DEPLOYMENT.md
docs/SECURITY-AND-PRIVACY.md   ACCESSIBILITY-AUDIT.md   DOCUMENTATION-PLAN.md
```

`docs/DOCUMENTATION-PLAN.md` is the index of the whole set. It organises documents
into three tiers — **Tier 1** system documents (orientation and architecture),
**Tier 2** subsystem reference (one per subsystem), **Tier 3** operational and
process — and marks each as **Available** or **Planned**.

Two obligations follow:

1. **Register the document.** A new doc gets an entry in the right tier with a
   two-to-four-line description in the same style as its neighbours.
2. **Flip Planned to Available.** Most new docs are already listed as Planned
   there. Writing one means changing its heading from `### Name — Planned` to
   `### [Name](./NAME.md) — Available` and replacing the placeholder description
   with what the document actually covers. Forgetting this is the most common
   miss.

If the subject fits no tier, say so and ask rather than inventing one.

### Checking links

There is **no `docs:check` script and no automated docs pipeline in this repo** —
link integrity is entirely manual. Before finishing:

- Every relative link target (`](./FILE.md`) must be a file that exists in `docs/`.
- Every anchor (`](./FILE.md#some-heading`) must match a real heading in the
  target document, including same-document anchors. Anchors are derived from the
  heading text, so a Title Case heading like `## System Context: Three Tiers`
  anchors as `#system-context-three-tiers`.
- Repo-root files (`README.md`, `RELEASE-INSTRUCTIONS.md`, `CONTRIBUTING.md`) sit
  outside `docs/` and outside the CMS import set — link them as absolute GitHub
  URLs, not as `../README.md`.

### Tutorial
```
# <Title>
One sentence: what the reader will have built/running by the end.

## Prerequisites
Exact versions and env (Node >=22.13, pnpm, Postgres, an initialised DB). No "recent version of X".

## Steps
For each step, in this order:
  1. The command or code block (copy-paste-able, complete)
  2. What to expect — the real output, the URL, the row that appears
  3. One line on why this step matters (only if non-obvious)

## Checkpoint
"You should now see …" — a concrete, verifiable end state.

## Where to go next
Links onward, each with a reason.
```
A tutorial that can fail silently is broken. Every step must be runnable as
written and must tell the reader how to know it worked.

### How-to / recipe
```
# <Task stated as a goal>  e.g. "Registering a New LTI Platform"
One line: what this achieves and when you'd reach for it.

## Assumptions
One or two lines — what must already be true (a deployment registered, a keypair generated).

## Recipe
The minimal, complete code or steps that do the job. Real Modulus APIs, not pseudocode.

## Variations / edge cases
The two or three ways real usage bends this.
```
A recipe is not a tutorial: assume competence, skip the hand-holding, get to the
code.

### Reference
```
# <Subsystem / API>
One line: what this surface is.

## <Each item>
- Signature / schema / table shape
- Parameters — name, type, required?, meaning
- Returns / stored shape
- Constraints and gotchas
- One tiny example (2–6 lines)

## Honest Notes & Open Questions
Anything unbuilt, undecided, or known-rough, clearly fenced off.
```
Reference is consulted, not read. Optimise for someone scanning with Cmd-F, not
reading top to bottom. No story.

### Explanation
```
# <The question it answers>  e.g. "Why lazy-create activities?"
## The problem / context
## The design
## The tradeoffs — including what we rejected and why
```
No numbered steps. This is for understanding, so it's allowed to be discursive —
but it still opens by naming the question it answers.

### Section conventions in the subsystem docs

The reference + explanation hybrids follow a settled shape. Match it when you add
or revise one:

1. **Orientation first.** One or two paragraphs placing the subsystem in the
   system — often by tier ("LTI 1.3 is the Tier 1 ↔ Tier 2 surface") and with a
   link to `docs/ARCHITECTURE.md`. This is what a reader arriving from a search
   result gets.
2. **Vocabulary or conventions block** where the subsystem has its own terms —
   `docs/DATA-MODEL.md` opens with `## Conventions`, `docs/ARCHITECTURE.md` with
   the three-tier diagram.
3. **The detailed sections**, one concept each. Numbered flows where there is a
   sequence (`## Flow 1 — OIDC Login (third-party initiated)` in `docs/LTI.md`).
4. **An honest-notes section** — what is unbuilt, undecided, or rough. Most docs
   title it `## Honest Notes & Open Questions`; `docs/DATA-MODEL.md` uses
   `## Open Questions` and `docs/SECURITY-AND-PRIVACY.md` uses
   `## Open Questions / Needs Institutional Policy`. Prefer the first unless the
   doc has a reason to narrow it. Keep this convention — it is one of the best
   things about this corpus.
5. **`## Where to go next`** — always last.

`docs/LTI.md` is the cleanest example of the full pattern.

## Step 3 — Apply the universal bar (every type)

Non-negotiable, whatever the type.

- **Orientation in the first two sentences.** What is this, who is it for, where
  does it sit? A reader who lands here from a search result must not have to
  reverse-engineer the context.
- **Define before use.** The first time a doc uses a Modulus term — the registry
  and `AsyncRegistry`, `compose()`, the commands facade / `CoreCommands`, a
  *command* (a `CoreUtils.createCommand` callable with an auth mode and Zod
  schemas), `RequestContext`, `RegisteredServices`, `BaseService`, the `@cached`
  getter, the three actor domains (app / admin / agent), activity codes,
  enrollment, normalized progress, page-state snapshots, lazy-create activities
  and the allowlist, `DEPLOYMENT_MODE`, or the LTI vocabulary (OIDC login
  initiation, resource-link launch, deep linking, platform and deployment, the
  keystore, AGS score passback) — define it in a clause or link to the doc that
  does. Never assume the reader arrived via the doc that would have defined it.
- **Show, don't paraphrase.** If a point can be made in code, make it in code.
  Examples must be real (actual Modulus APIs and types, copied from the source),
  complete (imports where they matter), and minimal. Label the excerpt with its
  source path in a comment, as the existing docs do:
  `// packages/core/src/core.ts`.
- **Respect the data-isolation boundary.** No learner PII, no credentials, no
  real LTI client or deployment IDs, no internal OSU hostnames in examples. This
  repo is public. Use placeholders.
- **Be honest about shipped vs unbuilt.** Keep the existing convention of naming
  what's implemented and what's planned. Never document aspirational API as if it
  exists. `## Honest Notes & Open Questions` is where the caveats go.
- **Cross-link.** Every term you *don't* define here should link to the doc that
  does. Docs are a graph, not a pile.
- **One concept per section.** If a heading covers two ideas, split it.

## Voice

A doc describes what the system does, directly, for a developer evaluating or
learning Modulus. No metaphors, slogans, compressed fragments, or rhetorical
flourishes, and nothing that asks the reader to infer unstated context.

- **Address the reader as "you."** "You call `initCore` once", "read this document
  when you are wiring a new module" — not "one calls" or "the developer calls".
  This is separate from naming *system* actors: the Postgres pool, the agent, and
  the host application are named concretely and never personified, never "you".
- **Do:** write clear, grammatically complete sentences; name concrete subjects —
  "the gradebook app", "core", "the agent", "the registry" — not vague shorthand;
  state limitations plainly; use active voice; reach for a small table or code
  block when it makes a distinction easier to scan.
- **Don't:** "simply", "just", "easy", "powerful", "seamless"; marketing
  adjectives; metaphors and slogans; hedging ("it might be possible to
  perhaps…"); undefined acronyms — expand LTI, AGS, OIDC, PKCE, DI, PII on first
  use; a wall of prose where a list or code block is clearer.
- **Plain English must not weaken the contract.** Simplify the wording, never the
  meaning: keep the precise limits, boundaries, and technical qualifications
  intact. A doc that reads easily but softens a guarantee — especially a privacy
  or auth guarantee — is wrong.
- **Signpost a link with a complete sentence that says what the reader will
  find.** "The full agent authorization flow is described in [AGENT](./AGENT.md)"
  — not a teaser fragment ending in a colon and a link. The same applies to
  `## Where to go next` entries.

### House mechanics

- **Headings are Title Case**: `## System Context: Three Tiers`, `## The JWT
  Layer`, `## Migrations & Seeds`. This is the settled convention across the
  corpus — do not convert to sentence case. The one fixed exception is the
  closing `## Where to go next`, which is sentence case in every document; keep
  it exactly as written.
- Em-dash (—), not a hyphen, for parenthetical breaks.
- Code-format every file path, table name, type, and symbol:
  `packages/core/src/lib/registry.ts`, `CoreCommands`, `DEPLOYMENT_MODE`.
- **British spelling in prose** ("behaviour", "organised", "initialised",
  "materialised"). The exception is fixed domain terminology, which keeps its
  established spelling — **`normalized` progress** is spelled that way throughout
  because it is the term of art in the agent and AGS surfaces. Don't convert
  existing text either way.
- **Admonitions are Docusaurus-style and always carry a title**:
  `:::note[Status]`, `:::warning[…]`, `:::tip[…]`, closed by `:::` on its own
  line. A bare `:::note` is wrong — the title is what a reader scanning the page
  sees, so make it say something specific. Use them sparingly; a paragraph that
  could sit in the body should stay in the body.
- ASCII diagrams in fenced blocks are used and welcome for structural overviews
  (see the three-tier diagram in `docs/ARCHITECTURE.md`).

## Anti-patterns — what "not first-class" looks like here

Name these when reviewing; avoid them when writing.

1. **In-medias-res opening** — the doc starts explaining a mechanism before
   saying what the mechanism is for.
2. **Undefined jargon** — `RequestContext`, the commands facade, or "the registry"
   used pages before (or without ever) being defined.
3. **Assertion without code** — "commands validate their input and return a
   `Result`" with no example showing the shape.
4. **Toy code** — invented service names and fake APIs instead of real excerpts
   copied from `packages/core`.
5. **Blurred type** — a lookup table interrupted by three paragraphs of
   rationale, or an essay that suddenly lists function signatures.
6. **Stub-as-doc** — a heading with "TODO" or one hand-wavy sentence under it,
   shipped as if complete. Use `## Honest Notes & Open Questions` instead.
7. **Prose where a table/list wins** — parameters, options, or comparisons buried
   in sentences.
8. **Slogans and metaphors** — README-style flourishes dropped into a reference
   doc. Docs describe; they don't sell.
9. **Broken front matter** — missing `title`/`path`/`summary`, a `path` that
   collides with another document, or a front-matter `title` that doesn't match
   the first H1.
10. **Drifting from house conventions** — sentence-case headings, a missing
    `## Where to go next`, or a doc that never gets registered in
    `docs/DOCUMENTATION-PLAN.md`.
11. **Leaking what must not be public** — learner PII, credentials, real
    deployment IDs, or internal hostnames in an example.

## Worked example

**Weak (assertion without code, jargon undefined):**
> Applications talk to core through the commands facade. Commands are validated
> and auth-aware, and return a Result instead of throwing.

**First-class (orients, defines, shows):**
> Consuming applications never see the registry, the services, or the
> repositories. After `compose()`, core hands back a single facade — `commands` —
> organised into three branches, one per actor domain:
>
> ```ts
> // packages/core/src/core.ts
> export type CoreCommands = {
>   app: ReturnType<typeof getAppCommands>
>   admin: ReturnType<typeof getAdminCommands>
>   agent: ReturnType<typeof getAgentCommands>
> }
> ```
>
> A *command* is more than a method. Defined through `CoreUtils.createCommand`
> (`packages/core/src/lib/utils.ts`), each command is a callable annotated with a
> method name, an auth mode, and Zod input/output schemas. The wrapper validates
> input and output, establishes a logging context, and returns a `Result` rather
> than throwing. Its first argument is always a `RequestContext` whose shape is
> determined by the auth mode:
>
> ```ts
> type AuthMode = 'none' | 'user' | 'admin' | 'agent'
>
> // the call signature a command exposes to consumers
> (ctx: RequestContextType[Mode], input: z.input<InSchema>)
>   => Promise<Result<z.output<OutSchema>>>
> ```
>
> The boundary between an application and core is therefore small, explicit, and
> self-describing: a fixed set of validated, typed, auth-aware calls. See
> [Core Composition](./CORE-COMPOSITION.md) for how the facade is projected out
> of each module registry.

Note what the code does that the prose can't: it shows that the auth mode
*determines the context type*, which is the thing a reader would otherwise guess
wrong. When you write your own example, open the real source file and copy the
current surface — do not reconstruct it from memory.

## Self-check before finishing

Run this against the draft. If any answer is "no", fix it before delivering.

- [ ] Can a stranger tell what this is and whether it's for them from the first two sentences?
- [ ] Is the doc exactly one type (or a hybrid with cleanly separated reference/explanation sections)?
- [ ] Is every Modulus term defined or linked on first use, and every acronym expanded?
- [ ] Does every "you can do X" claim have real, source-copied code next to it, labelled with its path?
- [ ] Are shipped and unbuilt features clearly distinguished, with caveats under an honest-notes section?
- [ ] Is the voice plain and direct — no slogans, metaphors, or filler words — while keeping every technical qualification intact?
- [ ] Is the reader addressed as "you", with system actors still named concretely (not personified)?
- [ ] Does the front matter carry `title`/`path`/`summary`, with a unique `path` and `title` matching the first H1?
- [ ] Are headings Title Case, and does the doc end with `## Where to go next`?
- [ ] Do all relative links point at files that exist in `docs/`, and does every anchor name a heading that exists?
- [ ] Does every admonition carry a specific title (`:::note[…]`, `:::warning[…]`)?
- [ ] Is the document registered in `docs/DOCUMENTATION-PLAN.md`, under the right tier, flipped from Planned to Available?
- [ ] Is the example free of PII, credentials, real deployment IDs, and internal hostnames?
- [ ] Are code symbols, paths, commands, limits, and behavioural claims verified against the current repo, not memory?
- [ ] Would this doc, as written, actually let someone *do the thing* without opening the source?

## Gold-standard exemplars

Read at least one of these before writing. A concrete exemplar calibrates tone and
depth better than any rule above.

- **[`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) — the primary model
  for voice and register.** Read it first. It places the system in its three-tier
  context before any internal detail, states the constraints that drive the design
  (the no-PII boundary, the thousands-of-concurrent-submissions requirement),
  numbers each decision, shows real excerpts from `packages/core` for every claim,
  and closes with `## Where to go next`. When in doubt about tone or how much to
  show versus tell, match this.
- [`docs/CORE-COMPOSITION.md`](../../../docs/CORE-COMPOSITION.md) — the model for
  **depth** in a reference + explanation hybrid: it takes the most distinctive
  part of the codebase and works through it from provider kinds to compile-time
  validation to the composition lifecycle, without ever blurring the "how it
  works" and "why it's shaped this way" registers.
- [`docs/LTI.md`](../../../docs/LTI.md) — the model for **structure** in a
  flow-heavy subsystem doc: orientation by tier, then keys and trust, then
  numbered flows in the order they occur, then honest notes.

When revising an existing doc, match the exemplar it is closest to rather than
importing a shape from elsewhere.
