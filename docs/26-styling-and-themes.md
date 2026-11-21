---
title: "Styling and Themes"
path: "styling-and-themes"
summary: "How Modulus orders its CSS in cascade layers, how an installation adds its stylesheet entry and themes its public pages without reaching the learner dashboard or admin area, the theme contexts it can target, the checks that hold the contract, and what changes for an existing installation on upgrade."
---

# Styling and Themes

This document is for developers who run a Modulus installation and want its
public pages (the home page, docs, sign-in and sign-up, and any route the
installation adds) to carry their own look, while the packaged learner dashboard
and admin area keep the styling Modulus ships. It explains the CSS cascade-layer
contract the packages follow, then gives the recipe for an installation's
stylesheet.

An *installation* is a TanStack Start application that adds the Modulus packages
and supplies its own configuration, public pages and branding; `apps/gradebook`
is this repository's own. [Installing Modulus](./04-installation.md) describes
the rest of an installation's wiring.

:::note[Draft — Downstream Validation Pending]
The layer order, stylesheet exports and checks below are implemented and tested
in `apps/gradebook` and the packed-install fixture. The theming recipe has not
yet been exercised by an independent installation.
:::

## The Layer Contract

Every stylesheet the packages ship puts its rules in a named CSS cascade layer.
A *cascade layer* (`@layer`) ranks whole groups of rules: for ordinary
declarations, a rule in a later layer beats a rule in an earlier one whatever
the selectors' specificity, and a rule in no layer beats every layer. Modulus
uses the layers to give one guarantee:

> A Tailwind utility applied directly to an element overrides ordinary
> component, typography and theme declarations for the same property on that
> element.

The guarantee has limits:

- It applies per element and per property. A utility on a parent does not beat
  a rule on its children.
- Two conflicting utilities follow Tailwind's generated order, not their order
  in `className`.
- `@apply` keeps the precedence of the layer it is written in. `@utility` is
  emitted into Tailwind's `utilities` layer.
- `!important`, inline styles, animations and transitions are outside the
  contract. Important declarations reverse layer order. Do not make Tailwind
  `important` globally, and do not raise selector specificity as a substitute
  for layering.
- An installation rule that is not in a layer beats layered package CSS in
  every area, including the dashboard and admin. Put every installation rule in
  a layer.

## The Layer Order

`@modulus-learning/host-tanstack-start/css-layers` exports the order, lowest to
highest precedence:

```ts
// packages/host-tanstack-start/src/css-layers.ts
const layers =
  'properties, base, infonomic-base, theme, infonomic-theme, modulus-theme, infonomic-functional, infonomic-typography, modulus-base, components, infonomic-components, modulus-components, overrides, infonomic-utilities, utilities'

export const MODULUS_LAYER_ORDER = `@layer ${layers};`
```

| Layer | Owner | Holds |
|---|---|---|
| `properties`, `base`, `theme`, `components`, `utilities` | Tailwind | Tailwind's output. `properties` holds `--tw-*` initial values for browsers without `@property`. |
| `infonomic-*` | `@infonomic/uikit` | The UI kit's reset, tokens, intent tokens (`infonomic-functional`), typography, components and utilities. |
| `modulus-theme` | Modulus | The default palette (`--theme-*`, `--primary-*`, `--gray-*`, `--canvas-*` and the rest) and `--page-background`. |
| `modulus-base` | Modulus | Base rules and typography, plus the intent tokens (`--fill-primary-*`, `--text-primary-*` and the rest) and `--loader-color`, which the kit sets in `infonomic-functional`. |
| `components` | Installation | The installation's own component CSS, including CSS modules. |
| `modulus-components` | Modulus | Component and block CSS, including restyles of kit components. |
| `overrides` | Installation | Brand tokens, area themes, and restyles of kit and Modulus components. |
| `utilities` | Tailwind | The final say. |

Each Modulus layer sits directly above the kit layer it extends. Everything the
packages own sits below `overrides`, so an installation's `overrides` layer can
replace any package token or rule, and Tailwind utilities beat both.

## How the Order Is Established

A browser fixes a layer's position the first time it sees the layer's name.
If any stylesheet reaches the browser with a partial order first (the kit's own
stylesheets declare only the kit's layers), a Modulus layer would land in the
wrong place. Modulus therefore declares the full order through two routes:

1. **The head statement.** `createModulusRootRoute` renders
   `<style>{MODULUS_LAYER_ORDER}</style>` as the first element in `<head>`. This
   covers CSS that Vite injects in development.
2. **The PostCSS plugin.** The `modulus()` Vite preset registers
   `modulusLayerOrder()`, which prepends the statement to every stylesheet before
   the bundler hashes it. This covers production, where React hoists stylesheet
   `<link>` elements above the inline statement.

```ts
// packages/host-tanstack-start/src/vite/index.ts (excerpt)
export const modulus = (): Plugin => ({
  name: 'modulus:host',
  config: () => ({
    // …
    css: { postcss: { plugins: [modulusLayerOrder()] } },
  }),
})
```

The preset sets the PostCSS plugin inline. Vite merges it with any inline
plugins in your `vite.config.ts`. An inline PostCSS configuration also stops
Vite reading `postcss.config.*` files, so an installation that has one moves
those plugins into `vite.config.ts`. Keep Vite's default CSS transformer: with
`css.transformer: 'lightningcss'`, Vite skips PostCSS, the plugin never runs,
and a production chunk can establish a partial order that places the Modulus
layers above `utilities`.

## Theme Contexts

The root route sets `data-theme-context` on `<html>` from each layout route's
`staticData.themeContext`; the deepest match wins, and the default is `public`.
Because the attribute is on `<html>`, dialogs, drawers and toasts rendered in
portals take the same theme as the page.

| Layout | Pages | Context |
|---|---|---|
| `_public` (installation-owned) | Home, docs, about, legal, any installation route | `public` |
| `_forms` | Sign-in, sign-up, start-activity | `public` |
| `_auth` | Learner dashboard, account | `protected` |
| `_admin` | Admin area, including the chromeless `admin/renew` | `protected` |
| `lti` | LTI launch, deep-link and error screens, some shown inside the LMS | `integration` |
| `agent` | Agent error screen | `integration` |
| `auth/renew` | Session renewal | `integration` |

Installation themes target `public` only. The `protected` areas and the
`integration` screens keep the Modulus defaults. The root route also sets
`data-chrome` (`full` or `chromeless`) on `<html>`.

## Adding Your Stylesheet

The packaged root route imports no CSS. Your `src/routes/__root.tsx` imports
your stylesheet entry beside the factory call. The package exports three
stylesheets:

| Export | Contents |
|---|---|
| `@modulus-learning/host-tanstack-start/styles.css` | The default entry: the kit and Modulus CSS, then Tailwind with the package's configuration. |
| `@modulus-learning/host-tanstack-start/styles/modulus.css` | The kit and Modulus CSS, with no Tailwind. |
| `@modulus-learning/host-tanstack-start/styles/tailwind.css` | The package's Tailwind configuration: the `@source` that scans the packaged components, the class-based `dark` variant, the `container` utility, and the `@theme` values. It imports no Tailwind files. |

An installation that adds no CSS of its own imports the default:

```tsx
// fixtures/host-minimal/src/routes/__root.tsx
import { createModulusRootRoute } from '@modulus-learning/host-tanstack-start/routes/__root.route'

// The installation owns the stylesheet entry; this one uses the package default.
import '@modulus-learning/host-tanstack-start/styles.css'

export const Route = createModulusRootRoute({ appTitle: 'Fixture' })
```

An installation with its own CSS owns its entry, so Tailwind compiles once and
the installation's own theme values compile alongside the package's. The root
route imports the entry:

```tsx
// apps/gradebook/src/routes/__root.tsx (excerpt)
// The installation owns the stylesheet entry (kit and Modulus CSS, then one
// Tailwind entry), so installation theme values compile with the package's.
import '../ui/styles/global.css'
```

The entry imports the kit and Modulus CSS, then one Tailwind entry:

```css
/* apps/gradebook/src/ui/styles/global.css (excerpt) */
@import "@modulus-learning/host-tanstack-start/styles/modulus.css";
@import "./tailwind.css";
```

```css
/* apps/gradebook/src/ui/styles/tailwind.css (excerpt) */
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@import "@modulus-learning/host-tanstack-start/styles/tailwind.css";
```

Begin each of your stylesheets with the `MODULUS_LAYER_ORDER` statement, as
these files do. Leave Tailwind's preflight out, as the package does, so the
packaged areas do not change.

## Theming the Public Pages

Isolation between the public pages and the packaged areas is a convention,
backed by the checks below, not a hard boundary. Follow these rules so nothing
you write reaches the dashboard or admin area:

- **Brand tokens, typography and restyles of kit or Modulus components** go in
  `@layer overrides`, inside `@scope (:root[data-theme-context="public"])`.
- **Your own component CSS** goes in `@layer components`, scoped the same way
  unless its classes cannot appear in a packaged area.
- **Set tokens on the scope root itself** (`:scope`), not on a descendant
  wrapper: Tailwind's colour utilities resolve the tokens on the root.
- **The page background** is the `--page-background` token, which Modulus applies
  to `<body>`. Set it on the scope root rather than styling `body`.

For example, an installation's `overrides.css` might contain:

```css
@layer overrides {
  @scope (:root[data-theme-context="public"]) {
    :scope {
      --primary-base: oklch(52% 0.2 25);
      --page-background: oklch(98% 0.01 25);
    }

    :scope.dark {
      --page-background: oklch(20% 0.01 25);
    }
  }
}
```

Being in a layer is not enough. `@layer overrides { :root { --primary-base: red } }`
is layered, but it has no scope, so it recolours the dashboard and admin area too.

**Tailwind theme values.** You may add new names in a top-level `@theme` in your
Tailwind entry (for example `--color-brand-500`), because only your own markup
uses them. Place your `@theme` after the package import: the package's `@theme`
resets the font and breakpoint namespaces (`--font-*: initial`,
`--breakpoint-*: initial`), so a font or breakpoint name declared before it is
cleared and its utility is never generated.

```css
/* your src/ui/styles/tailwind.css */
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@import "@modulus-learning/host-tanstack-start/styles/tailwind.css";

@theme {
  --color-brand-500: oklch(52% 0.2 25);
  --font-brand: Georgia, serif;
}
```

Do not redefine a shared value there (an existing colour, font or breakpoint):
Tailwind theme variables are global, so the change reaches utilities used in
the admin area. Change shared colours and fonts on the scoped public root
instead.

## Writing Rules Inside @scope

A scope rooted at `<html>` matches only elements *below* the root. `<html>` also
carries the `dark` class, so inside `@scope (:root[data-theme-context="public"])`
a rule written as `:root { … }`, `html { … }` or `.dark .x { … }` never matches,
and nothing reports it.

| Instead of | Write |
|---|---|
| `:root { … }`, `html { … }` | `:scope { … }` |
| `.dark { … }` | `:scope.dark { … }` |
| `.dark .x { … }` | `:scope.dark .x { … }` or `.x:is(.dark *) { … }` |

## The Checks

| Check | Command | What it enforces |
|---|---|---|
| Layer guard | `pnpm -F @modulus-learning/host-tanstack-start test` (`src/css-layer-guard.test.node.ts`) | Every package stylesheet opens with the full order; every declaration is in a Modulus layer; no `!important`; `modulus-theme` holds only root-level tokens; no package token sits below a kit layer that also sets it; `@scope` roots can match; components render no `<style>` elements; the stylesheet exports keep their contents. |
| Order export | `src/css-layers.test.node.ts` in the same suite | The order is a superset of the kit's, the plugin prepends it, the preset registers the plugin, and the root route renders the statement first. |
| Built CSS | `pnpm check:css` (gradebook, in `pnpm run ci`) and `pnpm test:packed` (fixture) | Every built stylesheet establishes the full order first; Tailwind scanned the package; the dark variant and the package's container widths survive. |

`scripts/check-built-css.mjs` is part of this repository, not of a published
package: it reads the order from the host package's `dist` by a repository path,
and it expects the reference application's packaged components in the bundle.
An installation that wants the same check copies the script and adapts it,
importing `MODULUS_LAYER_ORDER` from
`@modulus-learning/host-tanstack-start/css-layers`.

## Upgrading Installations

These changes arrive in the release that introduced the layer contract:

1. **Import a stylesheet.** The packaged root route no longer imports CSS. Add
   `import '@modulus-learning/host-tanstack-start/styles.css'` to
   `src/routes/__root.tsx`, or build your own entry from `styles/modulus.css`
   and `styles/tailwind.css` as shown above.
2. **Put your CSS in layers.** Package CSS is now layered, so any unlayered rule
   in your installation beats it everywhere, including the dashboard and admin
   area. Move your rules into `@layer components` or `@layer overrides`, scoped
   to the public context.
3. **Move PostCSS config files inline.** The `modulus()` preset sets
   `css.postcss` inline, which makes Vite ignore `postcss.config.*` files. Move
   their plugins into `vite.config.ts`.
4. **`ui/styles/overrides.css` is now `ui/styles/theme.css`.** The file was
   reachable through the `./ui/styles/*` export. It now holds layered tokens and
   one component block. Import `styles.css` or `styles/modulus.css` instead of
   reaching into the package's style files.

## Honest Notes & Open Questions

- **Branding of the app bar and footer.** The public app bar and footer still
  show the Modulus logo, and the footer links only to Home, About and the
  Modulus docs. Installation branding for the public pages may come later; it
  will not reach the dashboard or admin, which keep the Modulus chrome.
  `appTitle` and `icons` remain the only branding options of
  `createModulusRootRoute`.
- **Intent tokens sit in `modulus-base`.** The kit defines its intent tokens in
  `infonomic-functional`, above `modulus-theme`, so the Modulus values live in
  `modulus-base`. An installation overrides either kind in `overrides`, so this
  placement does not affect installation themes.
- **The `properties` layer.** Tailwind declares `properties` ahead of its own
  output. Modulus puts it first in its order so the statement Modulus declares
  first does not push it above `utilities`.
- **No installation guard is shipped.** The package guard covers the package's
  own CSS. An installation that wants the same checks on its stylesheets
  (layered declarations, public-scope ancestors, `@scope` roots) writes its own,
  following `packages/host-tanstack-start/src/css-layer-guard.test.node.ts`.

## Where to go next

- [Installing Modulus](./04-installation.md) covers the rest of an installation's
  wiring, including the root route that imports your stylesheet.
- [TanStack Start Host](./07-host-tanstack-start.md) describes what the host
  package owns and what your application supplies.
- [Packages](./03-packages.md) maps the published packages and their public
  entry points.
- [Accessibility Audit](./24-accessibility-audit.md) records the audit findings,
  including colour contrast, that a theme change should not reintroduce.
