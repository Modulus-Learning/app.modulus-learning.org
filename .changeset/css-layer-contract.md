---
"@modulus-learning/agent": minor
"@modulus-learning/core": minor
"@modulus-learning/host-tanstack-start": minor
"@modulus-learning/lms-canvas": minor
"@modulus-learning/lti": minor
---

put all host package css in cascade layers (modulus-theme, modulus-base, modulus-components) below an installation's overrides layer, so tailwind utilities and installation themes win; added the `css-layers` export, the head statement and the vite preset's postcss plugin; moved the stylesheet entry to the installation; gave the lti, agent and session-renewal screens an `integration` theme context and replaced the body background utilities with a `--page-background` token.

Upgrading an installation:

- import a stylesheet from `src/routes/__root.tsx`: `@modulus-learning/host-tanstack-start/styles.css`, or your own entry built from `styles/modulus.css` and `styles/tailwind.css`. The packaged root route no longer imports css.
- put your own css in `@layer components` or `@layer overrides`, scoped to `:root[data-theme-context="public"]`; an unlayered rule now beats package css in every area, including the dashboard and admin.
- move any `postcss.config.*` plugins into `vite.config.ts`; the `modulus()` preset sets `css.postcss` inline, which makes vite ignore those files.
- `ui/styles/overrides.css` is now `ui/styles/theme.css`; import `styles.css` or `styles/modulus.css` instead of the package's internal style files.

See docs/26-styling-and-themes.md.
