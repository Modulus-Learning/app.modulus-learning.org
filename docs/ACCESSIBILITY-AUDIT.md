---
title: "Accessibility Audit Response"
path: "accessibility-audit"
summary: "Tracking response to the MODULUS website accessibility audit (report 02) for the gradebook application. Records each finding, where the fix lives (gradebook app, the @infonomic/uikit component library, or @base-ui/react), the current status, and implementation notes — so completed items can be reported back to the auditor."
---

# Accessibility Audit Response

This document tracks our response to the **MODULUS website accessibility
audit (report 02)** for the [gradebook](../apps/gradebook) application. It
mirrors the auditor's findings and records, for each item, where the fix lives,
its current status, and any implementation notes.

Its purpose is twofold: to plan the work internally, and to serve as the
artifact we return to the auditor — with items marked **Resolved** as we
complete and verify them.

:::note[Where fixes live]
A significant share of the findings are not in the gradebook app itself but in
the shared **`@infonomic/uikit`** component library (the `Search`, `Select`,
`Input`, `Checkbox`, `CopyButton`, `Pagination`, `Tabs` components, etc.). Those
fixes require a new uikit release. A few behaviours are governed by
**`@base-ui/react`**, which uikit's `Tabs` and `Select` wrap — those may require
a library upgrade or a workaround rather than a direct edit.
:::

:::note[Progress — 2026-07-03]
First implementation pass complete and the uikit fixes are **released** in
`@infonomic/uikit` **6.7.7** (now bumped into the app; app typecheck clean).

- **✅ Verified on the public sign-in page** (rendered DOM + screenshot + served
  CSS): findings 30, 31, 32, 33. Finding 22 was already resolved by an earlier
  uikit a11y pass (shipped in 6.7.6).
- **✅ Verified in-app while signed in:** findings 12 and 20 (darker focus rings
  visible) and the Activity Code edit-page cluster **11, 13, 14** (keyboard test
  passed — arrow keys switch tabs with a visible ring; the Remove Member dialog no
  longer has the phantom tab stop and opens focus on a labelled Close button).
- **🛠 Code-complete, awaiting an authenticated verification pass** (auth-gated
  dashboard pages): findings 10, 17, 21, 25, 26, 28, 29. The code is confirmed
  present in the app source and the released uikit assets; they move to ✅ once
  seen in-browser while signed in.
:::

## Legend

**Status**

- ✅ **Resolved** — implemented and verified.
- 🛠 **Fixed** — code complete; pending a uikit release and/or in-app verification before it is reported as Resolved.
- ☐ **Open** — planned, not yet started.
- 🔍 **Investigating** — needs live reproduction or dependency work before we can commit to an approach.
- ➖ **Acknowledged** — logged by the auditor as informational / not practical to fix.

**Fix location**

- **App** — `apps/gradebook` source. We own it directly.
- **UIKit** — `@infonomic/uikit`. Requires a new package release.
- **Base UI** — behaviour injected by `@base-ui/react` (wrapped by uikit `Tabs` / `Select`).

**Confidence** — our confidence in implementing the auditor's recommendation as
described (High / Medium / Low).

## Summary

| #  | Finding | WCAG | Severity | Fix location | Confidence | Status |
|----|---------|------|----------|--------------|------------|--------|
| 1  | Theme switcher activates on TAB/SHIFT | 2.1.1 A | Moderate | App | — | ✅ Resolved |
| 2  | Profile menu reports wrong item count | 1.3.1 A | Moderate | App | — | ✅ Resolved |
| 3  | Focus indicator contrast in footer | 1.4.11 AA | Moderate | App | — | ✅ Resolved |
| 4  | "Create activity code" should be `h1` | 1.3.1 A | Minor | App | — | ✅ Resolved |
| 5  | Heading levels skipped (footer `h3`) | 1.3.1 A | Best Practice | App | — | ➖ Acknowledged |
| 6  | Associate field helper texts (`aria-describedby`) | 1.3.1 A | Minor | App | — | ✅ Resolved |
| 7  | "Activity code" field has no accessible name | 3.3.2 A | Serious | App | — | ✅ Resolved |
| 8  | Multiple unnamed forms (create activity code) | 4.1.2 A | Minor | App | — | ✅ Resolved |
| 9  | SPA nav not announced (focus `h1`) | Best Practice | Best Practice | App | Medium | ☐ Open |
| 10 | "Copy" button unnamed | 4.1.2 / 3.3.2 A | **Critical** | App | High | 🛠 Fixed |
| 11 | Focus indicator lost on tab / tabpanel | 2.1.1 / 2.4.7 A/AA | Serious | App | Medium | ✅ Resolved |
| 12 | Focus indicator contrast on cancel buttons | 1.1.1 A | Serious | UIKit | Medium | ✅ Resolved |
| 13 | sr-only "no action" button in Remove Member dialog | 2.1.1 / 2.4.7 | Moderate | App | Medium | ✅ Resolved |
| 14 | Tabs not keyboard-navigable (arrow keys) | 2.1.1 A | **Critical** | App | Medium | ✅ Resolved |
| 15 | Autocomplete reads raw data before value | 4.1.2 A | Minor | UIKit | Low | 🔍 Investigating |
| 16 | Members should be an unordered list | 1.3.1 A | Moderate | App | — | ✅ Resolved |
| 17 | Focus indicator contrast on analytics cards | 2.4.7 / 2.1.1 | Moderate | App / UIKit | Medium | 🛠 Fixed |
| 18 | Breadcrumb focus differs Safari/Chrome | 2.4.7 AA | Minor | App | Medium | ☐ Open |
| 19 | Card headings need semantic headings + link overlay | 1.3.1 A | Minor | App | Medium | ☐ Open |
| 20 | Search clear/search buttons no focus indicator | 2.4.7 AA | Serious | UIKit | High | ✅ Resolved |
| 21 | Search buttons unnamed + `arial-label` typo + redundant role | 4.1.2 A | Serious | UIKit | High | 🛠 Fixed |
| 22 | Search `aria-labelledby` points to non-existent id | 4.1.2 A | Serious | UIKit | High | ✅ Resolved |
| 23 | Pagination controls not operable | 1.3.1 A | **Critical** | App / UIKit | Medium | 🔍 Investigating |
| 24 | "Pages per view" has incorrect `role="combobox"` | 4.1.2 A | Minor | Base UI | Low | 🔍 Investigating |
| 25 | Sortable columns need `aria-sort` + "sortable" hint | 4.1.2 A | Moderate | App | High | 🛠 Fixed |
| 26 | Copy buttons in table cells need accessible names | 4.1.2 A | Serious | App | High | 🛠 Fixed |
| 27 | SPA does not update page `<title>` | 2.4.2 A | Moderate | App | Medium | ☐ Open |
| 28 | Stats cards should be a list / `role="group"` | 1.3.1 A | Minor | App | High | 🛠 Fixed |
| 29 | Page sections need semantic headings | 1.3.1 A | Minor | App | High | 🛠 Fixed |
| 30 | Multiple unnamed forms on login | 4.1.2 A | Minor | App | High | ✅ Resolved |
| 31 | Required "*" can sit outside the label text | — | Best Practice | UIKit | Medium | ✅ Resolved |
| 32 | "Remember me" checkbox has no focus indicator | 2.4.7 AA | Moderate | UIKit | Medium | ✅ Resolved |
| 33 | "Sign In" should be an `h2` | 1.3.1 A | Minor | App | Medium | ✅ Resolved |

## Resolved findings (1–8, 16)

These were addressed in the initial accessibility pass
(commits `e489425`, `ca980f1`) and by the activity-code membership work.

- **1 — Theme switcher activates on TAB/SHIFT.** Key handling on the switcher
  now activates only on `Space` / `Enter`.
- **2 — Profile menu item count.** The `role="separator"` divider was removed so
  the menu no longer miscounts items.
- **3 — Footer focus-indicator contrast.** Focus colour darkened to meet the
  1.4.11 non-text contrast threshold.
- **4 — Page `h1`.** The "Create activity code" page heading is now an `h1`.
- **5 — Skipped heading levels in footer.** ➖ *Acknowledged.* The auditor logged
  this as informational ("not really practical to fix"); footer headings are
  structural and changing them site-wide is out of scope.
- **6 — Helper-text association.** Helper texts are associated to their inputs via
  `aria-describedby`.
- **7 — "Activity code" field accessible name.** The field now has a valid
  accessible name.
- **8 — Multiple unnamed forms (create activity code).** Addressed on the
  create-activity-code page.
- **16 — Members list.** The activity-code members panel already renders a proper
  `<ul>` / `<li>` list with each member's action button inside its `<li>`
  (`activity-code-members-panel.tsx`).

## Open findings — gradebook app

Fixes we own directly in `apps/gradebook`.

### High confidence

- **10 — "Copy" button unnamed (Critical).** `CopyButton` forwards arbitrary
  props to its underlying button, so an `aria-label` supplied at the call site
  resolves the missing name. Applies to the activity-codes dashboard.
- **25 — Sortable columns.** `TableHeadingCellSortable`
  (`ui/components/th-sortable.tsx`) is our own component. Add `aria-sort` to the
  `th` reflecting current sort state, and a visually-hidden " sortable" suffix on
  the sort buttons.
- **26 — Copy buttons in table cells.** Same mechanism as #10 — pass
  disambiguating labels (`"Copy URL"`, `"Copy launch URL"`) in
  `activities-view.tsx`.
- **28 — Stats cards as a list.** Wrap the stats grid on the Completion view in
  list semantics, or add `role="group"` + an `aria-label`.
- **29 — Semantic section headings.** Promote the Completion page section labels
  to real headings.
- **30 — Unnamed login forms.** `sign-in.tsx` contains three `<form>` elements
  (password, GitHub, Google). Give each an `aria-label`, or consolidate.

### Medium confidence

- **9 — SPA navigation not announced.** Add a route-change handler (Next.js App
  Router) that moves focus to the page `h1` after client navigations. The app
  already renders useful, visible `h1`s.
- **27 — SPA page `<title>`.** Update `document.title` on client navigation so
  screen readers announce the new page. Shares plumbing with #9.
- **11 — Focus lost on tab / tabpanel.** The app explicitly sets `outline-none`
  on the tab trigger `Button` (`activity-code-container.tsx`); remove it and add
  a visible `:focus-visible` ring. The tabpanel ring is uikit CSS (see UIKit
  section).
- **13 — sr-only "no action" button.** The button in the Remove Member dialog
  (`activity-code-members-panel.tsx`) is a deliberate autofocus sink that keeps
  initial focus off the Cancel/Remove buttons. Replace it with a cleaner
  approach (e.g. focusing the dialog heading) while preserving that behaviour.
- **18 — Breadcrumb focus indicator.** `ui/components/breadcrumbs.tsx` — set an
  explicit, sufficient-contrast focus colour so Safari and Chrome match.
- **19 — Card headings + link overlay.** On the Analytics cards, give each card a
  real heading (`h2`) and convert the whole-card link into a
  [link-overlay](https://inclusive-components.design/cards/#thepseudocontenttrick)
  so the heading text is the accessible link.
- **33 — "Sign In" heading.** `Card.Title` renders a non-heading element; emit an
  `h2` so it matches the "Start Activity" heading level.

## Open findings — `@infonomic/uikit` release

These live in shared uikit components and are fixed once, centrally. We have
verified the exact source locations.

### High confidence

- **20 — Search buttons have no focus indicator (Serious).** `widgets/search/search.tsx`
  hard-codes `style={{ outline: 'none' }}` on the search and clear `IconButton`s.
  Remove it and provide a visible focus ring.
- **21 — Search buttons unnamed + redundant role (Serious).** Same file: the
  accessible-name attribute is misspelled **`arial-label`** (so the name never
  applies), and a redundant `role="button"` is set on a `<button>`. Fix the
  attribute name and drop the role.
- **22 — Search `aria-labelledby` to a missing id (Serious).** `components/inputs/input.tsx`
  emits `aria-labelledby="label-for-<id>"`; with the hard-coded search id this
  points at a non-existent element. Only emit it when a matching label is
  rendered.

### Medium confidence

- **12 — Cancel-button focus contrast (Serious).** The shared button focus-ring
  token is too light (~`#C0C0C0`, 1.8:1). Darken it to meet the 3:1 non-text
  contrast requirement.
- **17 — Analytics-card focus contrast.** Same underlying focus-ring token /
  card focus style; can be resolved with #12 or an app-level override.
- **31 — Required "*" placement (Best Practice).** Move the required asterisk
  outside the `<label>` text in the uikit `Label` / `Input`.
- **32 — "Remember me" checkbox focus indicator.** `components/inputs/checkbox.module.css`
  defines a focus ring but the ring colour isn't applied in the default
  (unchecked) state, so no visible indicator appears. Ensure the ring shows on
  `:focus-visible` regardless of checked state.

## Under investigation

These need live reproduction or dependency work before we commit to an approach.

- **23 — Pagination not operable (Critical).** Our `RouterPager`
  (`ui/components/router-pager.tsx`) actually renders navigation **links**
  (`LangLink`), not `div`s, so this may already be partly addressed or point at a
  different pager. Needs reproduction against the audited build before we decide.
- **24 — "Pages per view" `role="combobox"`.** The role is injected by Base UI's
  `Select.Trigger`, not authored by us, so "just remove the attribute" isn't
  directly possible — this likely needs a Base UI upgrade or is acceptable under
  current ARIA guidance. To be confirmed.
- **15 — Autocomplete announces raw data.** The instructor-search `Autocomplete`
  (uikit) momentarily exposes a behind-the-scenes value to the screen reader
  before the visible label. Needs investigation into the component's live-region
  / value rendering.

## Notes for the auditor

- Items are reported **Resolved** only after implementation **and** verification.
- Findings marked **UIKit** are fixed in our shared component library and will
  ship to the app via a version bump; they resolve the issue everywhere the
  component is used, not only on the page where it was reported.
- Finding **5** is retained as **Acknowledged** per the auditor's own note that
  it is informational and not practical to fix.
