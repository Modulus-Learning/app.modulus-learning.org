# Gradebook chart accessibility — implementation plan

Date: 2026-08-04
Status: approved for implementation on `feat/charts`
Related:

- `specs/2026-08-04-chart-accessibility-analysis.md` — approved analysis and renderer decision
- `apps/gradebook/src/ui/components/bar-chart.tsx` — shared single-series chart
- `apps/gradebook/src/ui/components/bar-chart-stacked.tsx` — shared stacked chart
- `apps/gradebook/src/modules/app/activities/components/completion-chart.tsx` — learner/instructor chart consumer
- `apps/gradebook/src/modules/admin/dashboard/components` — administration chart consumers
- `apps/gradebook/src/content/docs/02-accessibility.md` — public accessibility statement; unchanged until manual verification

## Outcome

Make all five informational gradebook charts expose the same predictable
accessible composition while retaining Recharts as the visual renderer:

1. visible purpose, time range, unit, and concise data-derived summary;
2. a named, described, non-interactive chart graphic;
3. a pointer tooltip that does not create screen-reader announcements; and
4. a visible `View data table` disclosure containing every plotted value in a
   native HTML table.

The implementation must eliminate the competing SVG-axis and assertive-tooltip
speech reported with VoiceOver. Exact values will use ordinary screen-reader
table navigation rather than Recharts' application-mode arrow interaction.

## Decisions

- Retain the installed Recharts 3 renderer. Do not add or migrate to TanStack
  Charts while its production API remains pre-alpha.
- Set `accessibilityLayer={false}` on these informational charts.
- Apply `role="img"`, an accessible name, and a description to each chart SVG.
  Do not put the SVG in the tab order.
- Hide the supplemental visual tooltip from assistive technology and remove its
  `role="status"` and `aria-live` attributes.
- Use one typed data and metadata contract for the chart, tooltip, summary, and
  table. Remove `any[]` and untyped series definitions from the shared wrappers.
- Use a native `details`/`summary` disclosure and native table elements. The
  alternative is available to every user, not visually hidden or restricted to
  screen readers.
- Keep the learner chart's generated dataset for this change, but label it
  clearly as illustrative sample data. Replacing it with activity-derived
  history requires a separate product and data-contract decision because the
  current `ProgressResponse` does not contain a weekly completion series.
- Do not strengthen the public accessibility conformance statement until the
  manual browser and assistive-technology matrix passes.

## Shared Contract

The chart wrappers will require typed metadata sufficient to render both the
graphic and its alternative:

- `title`: the chart topic used by the graphic and table;
- `description`: the measure, unit, granularity, and selected time range;
- `summary`: a concise, intentional conclusion derived by the consumer from the
  same response data;
- `category`: the typed category key, column label, and optional formatter;
- `series`: one or more typed keys, labels, units, optional formatters, and
  visual colours where needed;
- `data`: the typed source rows;
- `status`: `busy`, `idle`, or `error`; and
- explicit loading, empty, and error messages where defaults would not be
  meaningful.

The chart-height class applies only to the visual plot. The summary and table
must remain in normal document flow so a fixed chart height cannot clip them.

## Task 1 — Record the Decision and Execution Plan

Commit: `specs(a11y): added chart accessibility implementation plan`

Work:

- add the completed analysis to version control;
- record the approved Recharts/static-image decision;
- define implementation boundaries, commit boundaries, acceptance criteria,
  verification, and the manual handoff; and
- create and work only on `feat/charts`.

Acceptance criteria:

- the analysis distinguishes renderer accessibility from the complete
  application presentation contract;
- the plan accounts for every existing chart consumer;
- the synthetic learner dataset is explicitly resolved rather than silently
  presented as real activity data; and
- no production implementation is included in this commit.

## Task 2 — Build the Shared Accessible Chart Composition

Commit: `feat(a11y): added accessible chart composition`

Files:

- add a shared chart accessibility component under
  `apps/gradebook/src/ui/components`;
- revise `bar-chart.tsx` and `bar-chart-stacked.tsx`; and
- add focused gradebook component tests next to the shared components.

Work:

- introduce generic category and series definitions that constrain keys to the
  supplied row type;
- render a visible summary, textual loading/empty/error states, and a native
  disclosed table from the source rows and shared formatters;
- configure both Recharts roots as static named images with descriptions and
  `accessibilityLayer={false}`;
- remove tooltip live-region semantics and hide the pointer-only tooltip from
  the accessibility tree;
- ensure the stacked legend uses meaningful series labels rather than internal
  data keys; and
- preserve existing light/dark visual styling and responsive sizing.

Automated acceptance criteria:

- the root graphic has `role="img"`, a non-empty accessible name and
  description, no `role="application"`, and no `tabindex`;
- no `aria-live` region is rendered for tooltips;
- disclosure, caption, scoped headings, every row, and every formatted value
  appear in application-owned markup;
- stacked data produces one table heading per named series;
- busy, empty, and error outcomes are exposed in text; and
- tests avoid snapshots of Recharts' full generated SVG.

Verification for this task:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=jsdom \
  src/ui/components/chart-accessibility.test.tsx
pnpm -F @modulus-learning/gradebook typecheck
```

## Task 3 — Migrate the Administration Dashboard Charts

Commit: `feat(admin): added accessible chart summaries and tables`

Consumers:

- Registrations Per Day;
- Registrations Per Month;
- Monthly Active Users; and
- New vs Returning Users.

Work:

- supply each chart's title, selected range, measure, units, category, and
  series names;
- derive concise summaries from the actual response arrays;
- handle empty and flat datasets without inventing a trend;
- describe single-series totals and peaks only where totals are meaningful;
- describe monthly active users using range/peak language rather than summing
  people across months; and
- describe new and returning users with the peak of each series and a count of
  months led by each series, rather than treating monthly counts as unique
  annual totals.

Automated acceptance criteria:

- pure summary tests cover ordinary, empty, flat, tied, and zero-valued data;
- all four consumers satisfy the typed shared chart contract; and
- changing the selected month/year changes the description while the summary
  remains derived from the returned rows.

Verification for this task:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=jsdom \
  src/modules/admin/dashboard/chart-summaries.test.ts
pnpm -F @modulus-learning/gradebook typecheck
```

## Task 4 — Migrate and Clarify the Learner Activity Chart

Commit: `fix(activities): clarified accessible learner chart data`

Work:

- migrate Learner Activity to the shared title, description, summary, category,
  series, and disclosed-table contract;
- label the generated 2023/5,000-student distribution as illustrative sample
  data everywhere it is presented;
- remove wording that implies the sample describes the selected activity or
  its real learners;
- keep summary cards and insights synchronized with the same sample dataset;
  and
- include week/date range and student count in the exact-value table.

Automated acceptance criteria:

- generated rows total 5,000 and the derived peak/early/late values remain
  deterministic;
- accessible copy does not claim the sample is actual selected-activity data;
- each plotted weekly value is present in the disclosed table; and
- the selected activity code is not interpolated into a claim about the sample
  distribution.

Verification for this task:

```sh
pnpm -F @modulus-learning/gradebook exec vitest run --mode=jsdom \
  src/modules/app/activities/components/completion-chart.test.ts
pnpm -F @modulus-learning/gradebook typecheck
```

## Task 5 — Repository Verification and Pull Request

No standalone commit is required unless verification uncovers a code or
documentation correction. Any correction belongs in a focused conventional
commit describing the completed fix.

Automated verification:

```sh
pnpm -F @modulus-learning/gradebook test
pnpm -F @modulus-learning/gradebook typecheck
pnpm exec biome check \
  apps/gradebook/src/ui/components \
  apps/gradebook/src/modules/admin/dashboard \
  apps/gradebook/src/modules/app/activities/components
```

Then:

- review `git diff develop...HEAD`, commit history, and working-tree state;
- push `feat/charts` to `origin`;
- open one cumulative GitHub pull request against `develop`; and
- include automated results plus the outstanding manual matrix in the PR body.

Do not run Playwright, a headless browser, or an equivalent automated browser
check. Do not merge the pull request.

## Manual Acceptance and Handoff

After the cumulative pull request is ready, a human tester will perform the
visual and assistive-technology end-to-end review. The required matrix is:

| Platform | Browser | Assistive technology | Expected result |
|---|---|---|---|
| Windows | Chrome | NVDA | One named chart graphic; disclosure and values work without duplicate speech |
| Windows | Firefox | NVDA | Same content and control order as Chrome/NVDA |
| macOS | Safari | VoiceOver | No Quick Nav change; ordinary navigation reaches summary, disclosure, and table |
| macOS | Chrome | VoiceOver | No overlapping tooltip and axis announcements |
| Supported desktop | Chrome, Safari, Firefox | Keyboard only | Visible disclosure focus; chart is not an unexplained tab stop |

Also check light and dark themes, 200% text resize, 400% zoom, reduced motion,
forced colours/high contrast where available, maximum daily row counts, empty
results, tooltip readability, table overflow, and narrow layouts.

The manual task succeeds when a tester can identify each chart and its selected
range, explain its summary, retrieve a requested exact value, compare the two
stacked series, and move past the chart without changing screen-reader input
mode. Any findings will be addressed on `feat/charts` and added to the same pull
request before merge.

## Out of Scope

- migrating to TanStack Charts or another renderer;
- adding chart selection, filtering, drill-down, or editing;
- changing administration analytics queries or definitions;
- adding a weekly activity-completion series to core responses;
- replacing the learner sample with production analytics without a separate
  product decision;
- automated browser or screenshot testing;
- changing WCAG conformance claims before manual validation; and
- merging the cumulative pull request.
