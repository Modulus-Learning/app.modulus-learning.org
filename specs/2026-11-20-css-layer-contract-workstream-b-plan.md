# CSS Layer Contract (Workstream B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every upstream Modulus stylesheet into named cascade layers below an
installation's `overrides`, establish the full Modulus layer order in every
document and CSS chunk, and move the stylesheet entry to the installation (D2).

**Architecture:** A React-free `css-layers` module exports the Modulus order
statement and a PostCSS plugin. The root route renders the statement first in
`<head>`, and the `modulus()` Vite preset registers the plugin. Package CSS is
re-wrapped in `modulus-theme` / `modulus-base` / `modulus-components`. The root
route stops importing CSS. The package ships a default `styles.css` entry plus
Tailwind-free and Tailwind-only parts for installations with their own entry.

**Tech Stack:** CSS cascade layers, PostCSS 8, Tailwind CSS 4 (`@tailwindcss/vite`),
Vite 8, TanStack Start, vitest (node mode), `@infonomic/uikit` 6.9.0.

**Spec:** `../osu.modulus-learning.org/specs/2026-11-20-css-layer-contract-and-installation-theming.md`
(§2–§4, §6, §9 D2), in the OSU installation repository.

## Status Going In

- uikit 6.9.0 is installed. All 92 of its built stylesheets establish the full
  §3.1 kit order first. All dependencies were upgraded at the same time.
- Step 0 of the spec (the visual baseline) was replaced by the owner's manual
  end-to-end inspection on 6.9.0 (2026-11-20). That inspected state is the
  reference for every visual check below.
- The Rolldown 1.3 fix to `apps/agent/rolldown.config.js` and the dependency
  upgrade are uncommitted (Task 1).

## Global Constraints

- Modulus order, verbatim: `@layer base, infonomic-base, theme, infonomic-theme, modulus-theme, infonomic-functional, infonomic-typography, modulus-base, components, infonomic-components, modulus-components, overrides, infonomic-utilities, utilities;`
- No ordinary unlayered declarations in package CSS. Exempt: descriptors inside `@font-face`, `@property`, `@counter-style`, `@keyframes`, and Tailwind's `@theme` and `@utility`.
- No `!important` in package CSS or in package TSX/TS (no allowlist entries are expected).
- No raising selector specificity as a substitute for layering. Do not make Tailwind `important`.
- Tailwind preflight stays off.
- The layer names `modulus-theme`, `modulus-base` and `modulus-components` are fixed (D1). If one cannot hold a rule, raise it with the owner; do not switch schemes.
- Installation rules never target `data-theme-context="integration"`.
- `createModulusRootRoute` gains no stylesheet option (D2).
- Commits: conventional, lowercase, past tense, **no trailers of any kind**. Commit on `develop`.
- Do not publish, tag or deploy. Releasing is the owner's call (Task 7 stops at the changeset).

## Review Focus

1. **A kit-only CSS chunk reaches the browser first.** The kit's own prelude places `infonomic-functional` directly after `infonomic-theme`. If that prelude is seen before the Modulus statement, `modulus-theme` lands at the end, above `utilities`. Expected: every built chunk opens with the full Modulus order. Pinned by the built-CSS check (Task 6).
2. **`@source "../../"` moves out of the default entry.** Tailwind resolves `@source` relative to the file that contains it, so a moved or re-imported file can silently stop scanning package components. Expected: a utility used only in package code (`group-last:hidden`, from `registration-stepper.tsx`; the gradebook uses `flex-1` itself, so that proves nothing) is still generated in both hosts. Pinned by the built-CSS check (Task 6).
3. **An installation with a `postcss.config.*` file.** Vite ignores PostCSS config files once `css.postcss` is set inline, and the preset now sets it. Expected: documented in the upgrade notes, with the remedy (move the plugins inline). Pinned by the preset test asserting the inline plugin (Task 2) and the docs step (Task 7).
4. **`.not-dark` must keep beating `.dark`.** Both blocks move into `modulus-theme`, where they have equal specificity, so `.not-dark` wins only by coming later in source order. Expected: chromeless pages stay light even when the early theme detector adds `.dark`. Pinned by a guard assertion on source order (Task 3) and a `data-chrome` page-background test (Task 4).
5. **Restyles of kit components hidden among the tokens.** `overrides.css` nests `.infonomic-checkbox-primary { --checkbox-icon-color }` (white, and black in dark mode) inside its `:root` and `.dark` blocks. The kit sets the same property in `infonomic-components`, so in `modulus-theme` the kit would win and the dark checkbox would change. Expected: a checked primary checkbox looks the same in light and dark. Pinned by the guard rule that `modulus-theme` holds only root-level token selectors (Task 3).
6. **`admin/renew` is chromeless but stays `protected`.** Expected: only `lti`, `agent` and `auth/renew` become `integration`. Pinned by the theme-context test (Task 4).

---

### Task 1: Commit the Dependency Upgrade

**Files:**
- Modify (already changed): `apps/agent/rolldown.config.js`, every `package.json` and `biome.jsonc` shown by `git status`, `pnpm-lock.yaml`

- [ ] **Step 1: Verify**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: every task successful (8 build, 12 typecheck, 10 test tasks).

- [ ] **Step 2: Commit**

```bash
git add apps/agent/rolldown.config.js pnpm-lock.yaml package.json biome.jsonc \
  apps/agent/package.json apps/agent-demo/react/package.json apps/agent-demo/vanilla/package.json \
  apps/gradebook/package.json fixtures/host-minimal/biome.jsonc \
  packages/{core,host-tanstack-start,lms-canvas,lti}/package.json \
  packages/{core,host-tanstack-start,lms-canvas,lti}/biome.jsonc
git status --short   # expected: only the untracked plan remains
git commit -m "chore(deps): updated deps including @infonomic/uikit 6.9.0, and made the agent's library entries explicit relative paths for rolldown 1.3"
```

---

### Task 2: The Modulus Layer Order Export, Head Statement and Vite Preset

**Files:**
- Create: `packages/host-tanstack-start/src/css-layers.ts`
- Create: `packages/host-tanstack-start/src/css-layers.test.node.ts`
- Modify: `packages/host-tanstack-start/src/vite/index.ts` (`modulus()` config hook)
- Modify: `packages/host-tanstack-start/src/routes/__root.route.tsx` (`<head>` in `RootDocument`)
- Modify: `packages/host-tanstack-start/package.json` (`peerDependencies.postcss: "^8.4.0"`, `peerDependenciesMeta.postcss.optional: true`, mirroring the kit)

**Interfaces:**
- Produces: `export const MODULUS_LAYER_ORDER: string` (the Global Constraints statement, verbatim) and `export function modulusLayerOrder(): import('postcss').Plugin` (with `postcssPlugin: 'modulus-layer-order'`). The import path is `@modulus-learning/host-tanstack-start/css-layers`, through the existing `./*` export. The module has a type-only `postcss` import and no React import.

- [ ] **Step 1: Write the failing tests** in `css-layers.test.node.ts`

```ts
import { INFONOMIC_LAYER_ORDER } from '@infonomic/uikit/css-layers'
import postcss from 'postcss'
import { MODULUS_LAYER_ORDER, modulusLayerOrder } from './css-layers'
import { modulus } from './vite/index'

const names = (s: string) => s.replace(/^@layer\s+/, '').replace(/;$/, '').split(',').map((n) => n.trim())
// firstLayerOrder(css): first-appearance layer names across top-level @layer at-rules (port from Byline)

test('the order is a superset of the kit order with the same relative order', () => {
  const kit = names(INFONOMIC_LAYER_ORDER)
  expect(names(MODULUS_LAYER_ORDER).filter((n) => kit.includes(n))).toEqual(kit)
})
test('package layers sit directly above the kit layer they extend and below overrides', () => {
  const o = names(MODULUS_LAYER_ORDER)
  expect(o.indexOf('modulus-theme')).toBe(o.indexOf('infonomic-theme') + 1)
  expect(o.indexOf('modulus-base')).toBe(o.indexOf('infonomic-typography') + 1)
  expect(o.indexOf('modulus-components')).toBe(o.indexOf('infonomic-components') + 1)
  expect(o.indexOf('overrides')).toBeGreaterThan(o.indexOf('modulus-components'))
  expect(o.at(-1)).toBe('utilities')
})
test.each([
  '@import "host.css"; .host { color: red }',
  '@layer base, infonomic-base, theme, infonomic-theme, infonomic-functional; @layer infonomic-typography { :root { --x: 1 } }',
  '@layer utilities, overrides; @layer overrides { .brand { color: red } }',
])('the plugin reserves the full order first, idempotently: %s', async (css) => {
  const once = (await postcss([modulusLayerOrder()]).process(css, { from: undefined })).css
  expect(firstLayerOrder(once)).toEqual(names(MODULUS_LAYER_ORDER))
  const twice = (await postcss([modulusLayerOrder()]).process(once, { from: undefined })).css
  expect(firstLayerOrder(twice)).toEqual(names(MODULUS_LAYER_ORDER))
})
test('the Vite preset registers the plugin inline', () => {
  const config = (modulus().config as () => any)()
  expect(config.css.postcss.plugins.map((p: any) => p.postcssPlugin)).toContain('modulus-layer-order')
})
test('the root document renders the statement as the first head element', () => {
  const src = readFileSync(new URL('./routes/__root.route.tsx', import.meta.url), 'utf8')
  expect(src).toMatch(/<head>\s*<style>\{MODULUS_LAYER_ORDER\}<\/style>/)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm -F @modulus-learning/host-tanstack-start exec vitest run --mode=node src/css-layers.test.node.ts`
Expected: FAIL, because `./css-layers` cannot be resolved.

- [ ] **Step 3: Implement `css-layers.ts`** by mirroring `@infonomic/uikit`'s `css-layers` module: a `layers` string, the statement, and a plugin whose `Once` prepends one `@layer` at-rule. Doc comments say what each mechanism covers (§3.3).

- [ ] **Step 4: Wire it in.** In `modulus().config`, return `css: { postcss: { plugins: [modulusLayerOrder()] } }` beside the existing `ssr`/`optimizeDeps`, and extend the doc comment. In `RootDocument`, render `<style>{MODULUS_LAYER_ORDER}</style>` as the first child of `<head>`, before the analytics script. CSP already allows inline styles (`style-src 'self' 'unsafe-inline'`).

- [ ] **Step 5: Run the tests and the package checks**

Run: `pnpm -F @modulus-learning/host-tanstack-start exec vitest run --mode=node src/css-layers.test.node.ts && pnpm -F @modulus-learning/host-tanstack-start typecheck && pnpm -F @modulus-learning/host-tanstack-start build && grep -L "react" packages/host-tanstack-start/dist/css-layers.js`
Expected: the tests pass, typecheck and build succeed, and grep prints the path (no React reference).

- [ ] **Step 6: Commit** `feat(host): added the modulus css layer order, its postcss plugin in the vite preset, and the head statement`

---

### Task 3: Layer Every Package Stylesheet, With the Guard

**Files:**
- Create: `packages/host-tanstack-start/src/css-layer-guard.test.node.ts`
- Rename: `src/ui/styles/overrides.css` → `src/ui/styles/theme.css`. Its `:root`, `.dark…` and `.not-dark` token blocks go in `modulus-theme`. Its two nested `.infonomic-checkbox-primary` rules (`--checkbox-icon-color: white` under `:root`, `black` under `.dark, [data-theme="dark"]`) move out of the token blocks into a `@layer modulus-components` block in the same file, as `.infonomic-checkbox-primary` and `:is(.dark, [data-theme="dark"]) .infonomic-checkbox-primary`. The kit sets the property in `infonomic-components`, so it must sit above that layer.
- Create: `src/ui/styles/components/white-icon.css` (the `.white-icon` rules from both account containers)
- Modify: every `*.css` under `packages/host-tanstack-start/src` (34 files listed by `find packages/host-tanstack-start/src -name '*.css'`)
- Modify: `src/modules/app/account/components/account-container.tsx`, `src/modules/admin/account/components/account-container.tsx` (remove `whiteIcon` and its `<style>`)
- Modify: `src/ui/styles/components/components.css` (import `white-icon.css`), `src/ui/styles/global.css` (import `theme.css`)

**Interfaces:**
- Consumes: `MODULUS_LAYER_ORDER` (Task 2).
- Produces: the guard file. Task 6 extends it for the new entry files.

**Layer assignment:**

| Content | Layer |
|---|---|
| Custom-property-only blocks on `:root`, `.dark`/`[data-theme="dark"]`, `.not-dark` (`theme.css`; `--loader-color` in `app.css`; the `:root` block in `components/yarl.css`) | `modulus-theme` |
| `base/*`, `layouts/*`, `utils/*`, the remaining rules in `app.css` | `modulus-base` |
| `components/*`, `blocks/*`, `ui/components/*.css`, `ui/theme/theme-switch.css`, `white-icon.css` | `modulus-components` |
| `@font-face` in `base/fonts.css` | stays outside any layer (descriptors) |
| `tailwind.css` | its `@layer theme, base, components, utilities;` line is replaced by the Modulus statement; `@theme`/`@utility` stay unwrapped |

Every file, including index files made only of `@import`s, opens with the Modulus
statement verbatim. A file that has `@import`s keeps them directly after the statement
(only `@layer` statements may come before `@import`). A file may hold more than one
layer block (for example `yarl.css`). Do not reorder blocks inside `theme.css`.
`corner-ribbon.css` and `blocks/media.css` are not imported anywhere. Layer them all the
same and leave them in place.

- [ ] **Step 1: Write the guard** with these tests. Port the helpers from infonomic.io `apps/webapp/vite/css-layer-audit.ts` (`auditCss`, `auditScopeRoots`, `hasLayerPrelude`) into the test file, adding `font-feature-values|theme|utility` to the descriptor exemptions as that file does.
  - `every package stylesheet opens with the full Modulus statement`: `hasLayerPrelude(file, MODULUS_LAYER_ORDER)` for every `src/**/*.css`.
  - `package declarations are layered and never important`: `auditCss` returns `[]` for every file.
  - `package CSS uses only modulus layers`: every named `@layer` block is `modulus-theme`, `modulus-base` or `modulus-components`.
  - `modulus-theme holds only root-level tokens`: inside `@layer modulus-theme`, every declaration is a custom property, and every selector (including nested ones, resolved against their parent) is one of `:root`, `:root[data-chrome="chromeless"]`, `.dark`, `[data-theme="dark"]`, `[data-theme="dark"] ::backdrop` or `.not-dark`. The current `overrides.css` fails this on its nested checkbox rules.
  - `scope roots can match`: `auditScopeRoots` is `[]` for every file. Also a negative case: `'@layer overrides { @scope (:root[data-theme-context="public"]) { :root { --x: 1 } .dark .y { color: red } } }'` reports 2 issues, and `:scope { --x: 1 }` / `.y:is(.dark *)` report none.
  - `.not-dark comes after the dark token block in theme.css`: the source index of the `.not-dark` rule is greater than that of the `.dark` rule.
  - `components render no style elements and no important`: in `src/**/*.{ts,tsx}` (excluding tests), the only `<style>` is `<style>{MODULUS_LAYER_ORDER}</style>`, and no non-comment line contains `!important`.

- [ ] **Step 2: Run the guard to see it fail**

Run: `pnpm -F @modulus-learning/host-tanstack-start exec vitest run --mode=node src/css-layer-guard.test.node.ts`
Expected: FAIL, listing missing preludes and unlayered declarations in most files, and the two `<style>` elements.

- [ ] **Step 3: Apply the layer assignment** to every file, do the rename and the white-icon move, and update the two imports.

- [ ] **Step 4: Run the guard, the package suite and the build**

Run: `pnpm -F @modulus-learning/host-tanstack-start exec vitest run --mode=node src/css-layer-guard.test.node.ts && pnpm -F @modulus-learning/host-tanstack-start test && pnpm build`
Expected: all pass.

- [ ] **Step 5: Visual spot check.** `pnpm dev`, then compare the home page, sign-in, the learner dashboard and the admin area (light and dark) against the owner's reference inspection. Include a checked primary checkbox (for example on sign-up or an admin form) in light and dark: the icon is white in light and black in dark, as before. Expected: no visible change.

- [ ] **Step 6: Commit** `feat(host): put all package css in modulus-theme, modulus-base and modulus-components layers, with a guard`

---

### Task 4: Page Background Token and the Integration Theme Context

**Files:**
- Modify: `src/server/router-options.ts:43` (`themeContext?: 'public' | 'protected' | 'integration'`)
- Modify: `src/routes/lti/route.route.tsx`, `src/routes/agent/route.route.tsx`, `src/routes/auth/renew.route.tsx` (`staticData: { chrome: 'chromeless', themeContext: 'integration' }`)
- Modify: `src/routes/__root.route.tsx` (remove the `bg-*` classes from `<body>` and keep `not-dark light`; add `data-chrome={chrome}` to `<html>`)
- Modify: `src/ui/styles/theme.css`, `src/ui/styles/app.css`
- Create: `src/routes/theme-context.test.node.ts`
- Modify: `src/css-layer-guard.test.node.ts`

**Interfaces:**
- Produces: the token `--page-background`, which an installation sets on `:scope` of its public scope. The `data-chrome="full" | "chromeless"` attribute on `<html>`.

Token values, all in `modulus-theme`, matching today's utilities:
`:root { --page-background: white }`, `.dark, [data-theme="dark"] { --page-background: var(--canvas-900) }`,
`:root[data-chrome="chromeless"] { --page-background: var(--gray-50) }` (higher specificity than `.dark`, so it stays light).
In `modulus-base` (`app.css`): `body { background-color: var(--page-background) }`.

- [ ] **Step 1: Write the failing tests**
  - `theme-context.test.node.ts`: for each of the `lti`, `agent` and `auth/renew` factories, `createRoute(path as never).options.staticData` equals `{ chrome: 'chromeless', themeContext: 'integration' }`. The `admin/renew` factory's `staticData.themeContext` is `undefined` (it inherits `protected` from `_admin`), and `_admin`'s is `'protected'`.
  - Guard addition `the body background is a token`: `__root.route.tsx` has no `bg-` class on `<body>` and contains `data-chrome={chrome}`. `theme.css` declares `--page-background` for `:root`, for `.dark` and for `:root[data-chrome="chromeless"]`. `app.css` sets `background-color: var(--page-background)` on `body` inside `@layer modulus-base`.

- [ ] **Step 2: Run them to see them fail**, using the vitest node command from Task 3 with both files. Expected: FAIL.

- [ ] **Step 3: Implement** the type, the three `staticData` changes, the root attribute and body class change, and the token rules.

- [ ] **Step 4: Run the tests, typecheck and the host suite.** Expected: all pass.

- [ ] **Step 5: Visual check.** An LTI error screen (`/lti/...` with a bad launch) is light gray in both theme settings. The public pages and the dashboard keep the white and `canvas-900` backgrounds. Check that `<html>` carries `data-theme-context="integration"` on the LTI screen.

- [ ] **Step 6: Commit** `feat(host): replaced body background utilities with a --page-background token and gave chromeless integration screens their own theme context`

---

### Task 5: Move the Stylesheet Entry to the Installation (D2)

**Files:**
- Create: `src/ui/styles/modulus.css`: the Modulus statement, then `@import`s of the kit `reset.css`, `styles.css` and `typography.css`, then `./theme.css` and `./app.css`. No Tailwind.
- Modify: `src/ui/styles/tailwind.css`: keep the Modulus statement, `@source "../../"`, `@custom-variant dark`, `@utility container` and the whole `@theme`. Remove the two `tailwindcss/*` imports.
- Modify: `src/ui/styles/global.css` (the default entry): the Modulus statement, `@import "./modulus.css"`, `@import "tailwindcss/theme.css" layer(theme)`, `@import "tailwindcss/utilities.css" layer(utilities)`, `@import "./tailwind.css"`.
- Modify: `packages/host-tanstack-start/package.json` exports: keep `"./styles.css": "./dist/ui/styles/global.css"`, and add `"./styles/modulus.css": "./dist/ui/styles/modulus.css"` and `"./styles/tailwind.css": "./dist/ui/styles/tailwind.css"`.
- Modify: `src/routes/__root.route.tsx` (delete the `global.css` import and its comment)
- Modify: `fixtures/host-minimal/src/routes/__root.tsx` (`import '@modulus-learning/host-tanstack-start/styles.css'`)
- Create: `apps/gradebook/src/ui/styles/global.css` (statement, `@import "@modulus-learning/host-tanstack-start/styles/modulus.css"`, `@import "./tailwind.css"`)
- Create: `apps/gradebook/src/ui/styles/tailwind.css` (statement, the two `tailwindcss/*` imports with their layers, `@import "@modulus-learning/host-tanstack-start/styles/tailwind.css"`). It adds no theme values of its own; it only shows where they would go.
- Modify: `apps/gradebook/src/routes/__root.tsx` (`import '../ui/styles/global.css'`)
- Modify: `scripts/check-packages.sh:34`: the host's `attw` arguments become `--exclude-entrypoints ./styles.css ./styles/modulus.css ./styles/tailwind.css`. Excluding exactly those three keeps every JavaScript entry checked; the comment above `attw_args` names all three.
- Modify: `src/css-layer-guard.test.node.ts`

**Interfaces:**
- Produces: the three style exports above. Task 6 checks their built output, and Task 7 documents them.

- [ ] **Step 1: Write the failing guard additions**
  - `the root route imports no CSS`: `__root.route.tsx` has no `.css` import.
  - `the Tailwind part is the whole Tailwind contract minus the compiler imports`: `tailwind.css` contains `@source`, `@custom-variant dark (&:is(.dark *))`, `@utility container` and `@theme`, and no `@import "tailwindcss`.
  - `modulus.css has no Tailwind`: no `tailwindcss` import.
  - `the default entry composes both`: `global.css` imports `./modulus.css`, both `tailwindcss/*` files with `layer(theme)` and `layer(utilities)`, and `./tailwind.css`, in that order.

- [ ] **Step 2: Run the guard to see it fail.** Expected: FAIL on all four.

- [ ] **Step 3: Implement** the files, exports and host imports listed above.

- [ ] **Step 4: Build and check both hosts**

Run: `pnpm build && pnpm -F @modulus-learning/host-tanstack-start test && pnpm check:packages`
Expected: all pass. Task 6 adds the automated built-CSS check. For now, `grep -l 'group-last' apps/gradebook/.output/public/_build/*.css` prints a file.

- [ ] **Step 5: Commit** `feat(host)!: moved the stylesheet entry to the installation and exported the modulus and tailwind style parts`

---

### Task 6: Built CSS Checks in CI and the Packed Install

**Files:**
- Create: `scripts/check-built-css.mjs`
- Modify: root `package.json` (`"check:css": "node scripts/check-built-css.mjs apps/gradebook/.output/public/_build"`; add `pnpm check:css` to `ci` directly after `pnpm test:session`, which builds the gradebook)
- Modify: `scripts/packed-install.sh` (after the existing "packaged styles" loop: `node "$ROOT/scripts/check-built-css.mjs" .output/public/assets || fail "built css check failed"`, using whatever variable the script already holds for the repository root)

**Interfaces:**
- Consumes: `MODULUS_LAYER_ORDER`, imported from `packages/host-tanstack-start/dist/css-layers.js` by relative path from the script.
- Produces: `node scripts/check-built-css.mjs <dir>`. It exits with 0 on success, and with 1 after printing every failure.

- [ ] **Step 1: Write the script.** For every `*.css` in `<dir>`, the first-appearance order of `@layer` names begins with the full Modulus order. Use a regex over the whole file, because minifiers fold the prelude into blocks (see `hasBuiltLayerOrder` in the infonomic.io audit). Across all files together, it also requires:
  - `.group-last\:hidden` (escaped as Tailwind emits it), a utility used only in package code (`registration-stepper.tsx`). Do not use `flex-1`: the gradebook uses it in its own layout;
  - `.gradient-glow` (CSS imported by a package component);
  - the class-based dark variant (`:is(.dark *)` in any spacing);
  - the package's custom container: inside `@layer utilities`, a `.container` rule with `max-width: 60rem`, and `.container` rules with `max-width` `64rem`, `74.375rem` and `87.5rem` inside media queries for `66rem`, `77rem` and `94rem` respectively. Searching for the numbers alone is not enough, because the kit's container CSS emits the same widths. Parse with `postcss`, loaded through `createRequire` from `packages/host-tanstack-start/package.json`, and accept either media syntax (`min-width: 66rem` or `width>=66rem`).

  Run the same checks against both hosts: the gradebook (custom entry) and the fixture (default `styles.css`).

- [ ] **Step 2: Prove it catches a failure.** Copy one built chunk into the scratchpad, delete its leading `@layer` statement, and run the script on that directory. Expected: exit 1, naming the file. Repeat with a copy where the `.container` rule is removed from the utilities layer. Expected: exit 1, naming the container check.

- [ ] **Step 3: Run it for real**

Run: `pnpm -F @modulus-learning/gradebook build && pnpm check:css`, then `pnpm test:packed` (with `FIXTURE_DATABASE_URL` unset it skips database startup)
Expected: both exit 0. The packed run reports the new check as passing.

- [ ] **Step 4: Commit** `ci: checked that built css establishes the modulus layer order and keeps package utilities, the dark variant and container widths`

---

### Task 7: Documentation and Changeset

Use the `writing-docs` skill (`.agents/skills/writing-docs/SKILL.md`) for every doc change.

**Files:**
- Create: `docs/26-styling-and-themes.md`. It covers the contract (§2, verbatim, with its limits), the Modulus layer table (§3.2), how the order is established (head statement plus preset plugin), theme contexts including `integration`, the installation pattern (`@layer overrides { @scope (:root[data-theme-context="public"]) { :scope { … } } }`, own components in `@layer components`, new names only in a top-level `@theme`, `--page-background`), the `@scope` root rule (§4.3), and an **Upgrading Installations** section. The upgrading section says:
  - add the CSS import to `src/routes/__root.tsx` (`@modulus-learning/host-tanstack-start/styles.css`, or the installation's own entry built from `styles/modulus.css` and `styles/tailwind.css`);
  - any unlayered installation rule now beats layered package CSS in every area, including the dashboard and admin;
  - a `postcss.config.*` file is ignored once the preset sets `css.postcss` inline; move its plugins into `vite.config.ts`;
  - `@modulus-learning/host-tanstack-start/ui/styles/overrides.css` (reachable today through the `./ui/styles/*` export) is now `ui/styles/theme.css`. It now holds layered tokens plus one component block, and installations should import `styles.css` or `styles/modulus.css` instead. There is no forwarding file: a stylesheet named for the installation's `overrides` layer that holds package tokens would mislead.
- Modify: `docs/04-installation.md`. Step 2 drops "You do not import a stylesheet". Step 4 adds the CSS import to the root route file. Link to doc 26.
- Modify: `docs/07-host-tanstack-start.md` (styles responsibility and a link), `docs/00-documentation-plan.md` (index entry), and the `AGENTS.md` "Where to look" table (a row for styling).
- Create: `.changeset/<name>.md`, a `minor` bump for the lockstep set in `.changeset/config.json`. Its text is a short summary plus the four upgrade notes above.

- [ ] **Step 1: Write the docs and changeset.**
- [ ] **Step 2: Run** `pnpm lint:check`. Expected: clean.
- [ ] **Step 3: Commit** `docs: documented the css layer contract, installation theming and the stylesheet upgrade`

---

### Task 8: Acceptance Pass

No commit unless a fix is needed.

- [ ] **Step 1:** Run `pnpm run ci`. Expected: every step passes, including `check:css`.
- [ ] **Step 2: Cascade and context switch.** Add an uncommitted `apps/gradebook/src/ui/styles/overrides.css` containing `@layer overrides { @scope (:root[data-theme-context="public"]) { :scope { --page-background: magenta } } }`, imported from the gradebook `global.css`. In `pnpm -F @modulus-learning/gradebook dev`:
  - sign-in is magenta;
  - navigating to the dashboard shows the default background;
  - navigating back to sign-in shows magenta again;
  - an LTI error screen is not magenta.

  Then remove the file.
- [ ] **Step 3: Utilities win.** On a kit `Button`, a `Card` and a prose region, temporarily apply a conflicting utility (for example `bg-red-500`, `p-0`, `text-red-600`) and confirm it takes effect. Revert.
- [ ] **Step 4: Production order.** In `pnpm -F @modulus-learning/gradebook build && pnpm -F @modulus-learning/gradebook start`, the first `<style>` in `<head>` is the Modulus statement. DevTools shows `modulus-*` layers in the expected order.
- [ ] **Step 5:** The owner repeats the manual end-to-end inspection (public pages, sign-in, sign-up, start-activity, an LTI error screen, the dashboard, the admin area with a dialog and a toast, in light and dark) against their 6.9.0 reference.
