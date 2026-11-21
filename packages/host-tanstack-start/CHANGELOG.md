# @modulus-learning/host-tanstack-start

## 0.13.1

### Patch Changes

- fixed the admin area in `vite dev` for pnpm installations by pre-bundling the host package's browser dependencies, removed the unused mobile menu that imported missing images, and kept the `modulus admin create` password prompts visible
  simplified the packaged site footer to home, about and docs links
- Updated dependencies
  - @modulus-learning/core@0.13.1
  - @modulus-learning/lti@0.13.1

## 0.13.0

### Minor Changes

- 738ce75: put all host package css in cascade layers (modulus-theme, modulus-base, modulus-components) below an installation's overrides layer, so tailwind utilities and installation themes win; added the `css-layers` export, the head statement and the vite preset's postcss plugin; moved the stylesheet entry to the installation; gave the lti, agent and session-renewal screens an `integration` theme context and replaced the body background utilities with a `--page-background` token.
  
  Upgrading an installation:
  
  - import a stylesheet from `src/routes/__root.tsx`: `@modulus-learning/host-tanstack-start/styles.css`, or your own entry built from `styles/modulus.css` and `styles/tailwind.css`. The packaged root route no longer imports css.
  - put your own css in `@layer components` or `@layer overrides`, scoped to `:root[data-theme-context="public"]`; an unlayered rule now beats package css in every area, including the dashboard and admin.
  - move any `postcss.config.*` plugins into `vite.config.ts`; the `modulus()` preset sets `css.postcss` inline, which makes vite ignore those files.
  - `ui/styles/overrides.css` is now `ui/styles/theme.css`; import `styles.css` or `styles/modulus.css` instead of the package's internal style files.
  
  See docs/26-styling-and-themes.md.
- ef90687: added editable lti registration endpoints: administrators now enter or confirm each platform endpoint, and the lms adapter only suggests defaults
  
  - Administrators holding `lti-platforms:edit` can edit a registration's name, client ID, authorization endpoint, token endpoint, JWKS URI and authorization server at `/admin/lti-platforms/$id/edit`. The issuer can't be changed. An edit applies on the next login, launch or score-passback reconcile, without a restart. The create form gains the four endpoint fields and a "Fill defaults from issuer" button.
  - Hosted-Canvas installations should move all four endpoints from the `canvas.instructure.com` host to `sso.canvaslms.com` from the edit form: authorization endpoint `https://sso.canvaslms.com/api/lti/authorize_redirect`, token endpoint and authorization server `https://sso.canvaslms.com/login/oauth2/token`, and JWKS URI `https://sso.canvaslms.com/api/lti/security/jwks`. Beta and test installations use `sso.beta.canvaslms.com` and `sso.test.canvaslms.com` in the same way. Instructure has asked tools to make this change; the issuer stays `https://canvas.instructure.com`, and the old hosts still work. Existing registrations are not rewritten automatically. The Canvas adapter now suggests the `sso.*` host for all four endpoints on new registrations.
  - `modulus db upgrade` grants the Manager role `lti-platforms:read` and `lti-platforms:edit`, and also the allowlist abilities `activity-url-allowlist:list` and `activity-url-allowlist:manage` that earlier upgrades missed.
  - A new registration's issuer can't end in a slash, because launches match it exactly against the `iss` claim.
  - An administrator who is already signed in may need to sign in again before the Edit button appears.
- added editable lti registration endpoints with hosted canvas sso defaults, and a css cascade-layer contract with an installation-owned stylesheet entry so installations can theme their public pages

### Patch Changes

- 2d9de46: widened the googleapis peer range to `^188.0.0 || ^189.0.0 || ^190.0.0`, so an installation on googleapis 190 (as the reference installation and core use) passes strict peer resolution
- bf8007e: replaced the kit avatar in the learner and admin user menus with plain initials (given and family name initials for admins, the first two letters of the full name for learners, a user icon when neither is known), so the menus no longer load a random photo from a third-party host; gave the menu trigger an accessible name
- Updated dependencies [738ce75]
- Updated dependencies [ef90687]
- Updated dependencies
  - @modulus-learning/core@0.13.0
  - @modulus-learning/lti@0.13.0

## 0.12.0

### Minor Changes

- canonicalized activity urls across lti launches, deep links, progress and instructor forms, and added an admin lti identity view with an unlink action
  fixed list search and sorting in **`@modulus-learning/host-tanstack-start`** and declared its `tailwind-merge` runtime dependency

### Patch Changes

- Updated dependencies
  - @modulus-learning/core@0.12.0
  - @modulus-learning/lti@0.12.0

## 0.11.3

### Patch Changes

- fixed **`@modulus-learning/host-tanstack-start`** so a Response thrown from a gated server function keeps its 400/401/409 status under Nitro 3.0.261029-rc and later, by turning off Nitro's `fastResponse` polyfill in `modulusNitroOptions()`
- Updated dependencies
  - @modulus-learning/core@0.11.3
  - @modulus-learning/lti@0.11.3

## 0.11.2

### Patch Changes

- 431da36: changed the server packages to mpl-2.0 and removed project-specific ownership claims; retained mit for the browser agent and demos
- Updated dependencies [431da36]
  - @modulus-learning/core@0.11.2
  - @modulus-learning/lti@0.11.2

## 0.11.1

### Patch Changes

- first publish of **`@modulus-learning/core`**, **`@modulus-learning/host-tanstack-start`**, **`@modulus-learning/lti`** and **`@modulus-learning/lms-canvas`**, with release-script schema commands and a non-destructive bootstrap
  hardened lti identity linking, token caching and registration binding
- Updated dependencies
  - @modulus-learning/core@0.11.1
  - @modulus-learning/lti@0.11.1
