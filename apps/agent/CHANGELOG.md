# @modulus-learning/agent

## 0.13.1

### Patch Changes

- fixed the admin area in `vite dev` for pnpm installations by pre-bundling the host package's browser dependencies, removed the unused mobile menu that imported missing images, and kept the `modulus admin create` password prompts visible
  simplified the packaged site footer to home, about and docs links

## 0.13.0

### Minor Changes

- 738ce75: put all host package css in cascade layers (modulus-theme, modulus-base, modulus-components) below an installation's overrides layer, so tailwind utilities and installation themes win; added the `css-layers` export, the head statement and the vite preset's postcss plugin; moved the stylesheet entry to the installation; gave the lti, agent and session-renewal screens an `integration` theme context and replaced the body background utilities with a `--page-background` token.
  
  Upgrading an installation:
  
  - import a stylesheet from `src/routes/__root.tsx`: `@modulus-learning/host-tanstack-start/styles.css`, or your own entry built from `styles/modulus.css` and `styles/tailwind.css`. The packaged root route no longer imports css.
  - put your own css in `@layer components` or `@layer overrides`, scoped to `:root[data-theme-context="public"]`; an unlayered rule now beats package css in every area, including the dashboard and admin.
  - move any `postcss.config.*` plugins into `vite.config.ts`; the `modulus()` preset sets `css.postcss` inline, which makes vite ignore those files.
  - `ui/styles/overrides.css` is now `ui/styles/theme.css`; import `styles.css` or `styles/modulus.css` instead of the package's internal style files.
  
  See docs/26-styling-and-themes.md.
- added editable lti registration endpoints with hosted canvas sso defaults, and a css cascade-layer contract with an installation-owned stylesheet entry so installations can theme their public pages

## 0.12.0

### Minor Changes

- canonicalized activity urls across lti launches, deep links, progress and instructor forms, and added an admin lti identity view with an unlink action
  fixed list search and sorting in **`@modulus-learning/host-tanstack-start`** and declared its `tailwind-merge` runtime dependency

## 0.11.3

### Patch Changes

- fixed **`@modulus-learning/host-tanstack-start`** so a Response thrown from a gated server function keeps its 400/401/409 status under Nitro 3.0.261029-rc and later, by turning off Nitro's `fastResponse` polyfill in `modulusNitroOptions()`

## 0.11.2

### Patch Changes

- 431da36: changed the server packages to mpl-2.0 and removed project-specific ownership claims; retained mit for the browser agent and demos

## 0.11.1

### Patch Changes

- first publish of **`@modulus-learning/core`**, **`@modulus-learning/host-tanstack-start`**, **`@modulus-learning/lti`** and **`@modulus-learning/lms-canvas`**, with release-script schema commands and a non-destructive bootstrap
  hardened lti identity linking, token caching and registration binding

## 0.11.0

### Minor Changes

- c8f44f7: Reported cumulative contribution targets the server refused. A `set-progress` response may now carry an additive `rejected_targets` member naming each target and why it was refused; the submission itself still completes, and the targets are logged through the agent's logger for authors who opted into one.

## 0.10.0

### Minor Changes

- 856e996: Added scope-bound agent authentication, stable per-tab activity context across OAuth redirects, last-successful context restoration for cold tabs, same-page authentication single-flight handling, and canonical scope identity and display metadata in authenticated status.

### Patch Changes

- Deps updates

## 0.9.1

### Patch Changes

- Updated dependencies, and patch release flow.

## 0.9.0

### Minor Changes

- 633550e: Test deploy agent to NPM

## 0.8.0

### Minor Changes

- 2f7655e: Updated agent to support OAuth

## 0.7.0

### Minor Changes

- 3981dc1: Second attempt at agent zip file creation for release

## 0.6.0

### Minor Changes

- 568a4a0: Test zip file for agent in release

## 0.5.0

### Minor Changes

- e231105: Test changeset with removed permissions

## 0.4.0

### Minor Changes

- 7f52a61: Test changeset with tag

## 0.3.0

### Minor Changes

- ed4f114: Second test for changeset release

## 0.2.0

### Minor Changes

- b5d4bda: Test changeset release
