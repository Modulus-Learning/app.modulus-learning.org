# Gradebook chart accessibility — analysis

Date: 2026-08-04
Status: proposed; no implementation has started
Related:

- `apps/gradebook/src/ui/components/bar-chart.tsx` — shared single-series Recharts wrapper
- `apps/gradebook/src/ui/components/bar-chart-stacked.tsx` — shared stacked Recharts wrapper
- `apps/gradebook/src/modules/app/activities/components/completion-chart.tsx` — learner/instructor activity chart
- `apps/gradebook/src/modules/admin/dashboard/components` — four administration dashboard charts
- `apps/gradebook/src/content/docs/02-accessibility.md` — current public accessibility conformance statement
- `docs/ACCESSIBILITY-AUDIT.md` — response to the completed application accessibility review
- External references: [Recharts accessibility](https://github.com/recharts/recharts/wiki/Recharts-and-accessibility), [Recharts API](https://recharts.github.io/en-US/api/), [TanStack Charts accessibility](https://tanstack.com/charts/latest/docs/guides/accessibility), [TanStack Charts repository](https://github.com/TanStack/charts), [WCAG 2.1 SC 1.1.1 guidance](https://www.w3.org/WAI/WCAG21/Understanding/non-text-content), [WAI-ARIA 1.2 `img` role](https://www.w3.org/TR/wai-aria-1.2/#img), and [SVG 2 ARIA attributes](https://www.w3.org/TR/SVG2/struct.html#ARIAAttributes)

## Question

Should Modulus improve the two existing Recharts wrappers, replace Recharts
with TanStack Charts or another renderer, or adopt a different presentation
contract so the charts work predictably with Chrome/NVDA and with Safari or
Chrome/VoiceOver?

The answer must account for the auditor's observed failure mode: left and right
arrow navigation works in Chrome/NVDA, but VoiceOver often reads SVG axis labels
while the chart's tooltip live region is also announcing the selected datum.
The result is overlapping or inconsistent speech and an interaction that cannot
be discovered or operated reliably.

This document analyses the current implementation and recommends a direction.
It does not authorise implementation, dependency changes, a feature branch, or
changes to the public conformance statement.

## Executive Recommendation

Keep Recharts for the next accessibility change, but stop treating an
interactive SVG tooltip as the only exact-value interface.

The target should be an **accessible chart composition** with three layers:

1. a visible heading and concise summary that state the comparison, units, time
   range, and important trend;
2. a Recharts SVG treated as a named, static visual representation rather than
   an application-mode screen-reader widget; and
3. an ordinary HTML data table, available through a visible disclosure, that
   contains every category and value shown in the chart.

For these five charts, the SVG has no selection, drill-down, editing, or other
function that must be preserved for assistive technology. The tooltip only
reveals values already present in the source data. A semantic table therefore
provides a more robust exact-value path than requiring a screen reader to enter
a special interaction mode and consume changing tooltip announcements.

As part of that composition, the Recharts accessibility layer should be
disabled, the SVG should have static image semantics with a meaningful name and
description, and the visual tooltip should no longer be an ARIA live region.
The tooltip can remain for pointer users because the adjacent table provides the
same information to keyboard and screen-reader users.

Do not migrate to TanStack Charts now. Its accessibility model is promising and
better aligned with the desired contract, but the official project currently
labels the 0.6.x line **pre-alpha** and not ready for production use. A renderer
migration would also not remove the need for the summary, data table, application
semantics, and assistive-technology testing described here.

## Scope

### Shared Renderers

| File | Current purpose |
|---|---|
| `apps/gradebook/src/ui/components/bar-chart.tsx` | One categorical series, Cartesian axes, pointer/keyboard tooltip |
| `apps/gradebook/src/ui/components/bar-chart-stacked.tsx` | Two or more stacked series, Cartesian axes, legend, pointer/keyboard tooltip |

### Current Consumers

| Surface | Chart | Shape | Current accessible name |
|---|---|---|---|
| Learner/instructor activity completion | Learner Activity | 12 weekly categories, one `students` series | `Learner activity by week` |
| Admin dashboard | Registrations Per Day | Up to one month of daily categories, one series | None supplied by the consumer |
| Admin dashboard | Registrations Per Month | 12 monthly categories, one series | None supplied by the consumer |
| Admin dashboard | Monthly Active Users | 12 monthly categories, one series | None supplied by the consumer |
| Admin dashboard | New vs Returning Users | 12 monthly categories, two stacked series | No `ariaLabel` prop exists on the wrapper |

No component-level tests currently exercise either chart wrapper, its generated
semantics, its keyboard behaviour, or an equivalent exact-value presentation.

## Current Behaviour

The gradebook resolves Recharts 3.9.2. In Recharts 3, `accessibilityLayer`
defaults to `true`. The installed implementation consequently gives the root
SVG `tabIndex="0"` and `role="application"`, activates the first tooltip datum
when the chart receives focus, and changes the active datum for left and right
arrow keys.

Both Modulus wrappers use a custom tooltip. Recharts passes
`accessibilityLayer: true` into that tooltip, and the wrapper then renders a
permanently mounted `role="status"` with `aria-live="assertive"`. The status
contents change as keyboard focus moves through the chart. At the same time,
the axis tick text remains exposed inside the SVG accessibility tree.

The resulting accessibility tree has three competing behaviours:

1. `role="application"` asks assistive technology to pass keystrokes through to
   the chart;
2. SVG text nodes remain available for ordinary screen-reader traversal; and
3. an assertive live region interrupts to announce the active tooltip.

That combination explains the auditor's report. It is not a failure to attach
the keyboard handler; it is a conflict between application-mode keyboard
handling, ordinary SVG reading, and live announcements.

### The VoiceOver Limitation Is Documented Upstream

The [Recharts accessibility guidance](https://github.com/recharts/recharts/wiki/Recharts-and-accessibility)
states that VoiceOver users must turn Quick Nav off before its left/right arrow
handling reaches the chart. Recharts uses `role="application"` so NVDA and JAWS
enter a mode that passes keystrokes to the page, but the same role does not
produce equivalent behaviour in VoiceOver.

This means Modulus cannot make the existing interaction consistent across the
tested browser/screen-reader combinations by changing tooltip markup alone. A
local fix can reduce duplicate speech, but it cannot make VoiceOver forward
arrow keys while Quick Nav remains on.

### The Current Contract Is Incomplete Beyond VoiceOver

- Four of the five charts do not receive an accessible name from their
  consumer. `role="application"` requires an author-provided name.
- The accessible label on Learner Activity names the topic but does not provide
  units, the date range, the trend, or all values.
- The custom tooltip uses an assertive live region for exploratory information.
  Assertive announcements can interrupt the screen reader's current speech;
  they should be reserved for urgent information.
- The two wrappers accept `any[]`, string data keys, and, for the stacked chart,
  `any[]` series metadata. They cannot require labels, units, value formatting,
  or table headings at compile time.
- The single-series wrapper can accept an `ariaLabel`; the stacked wrapper
  cannot. Neither accepts a description or relationship to visible explanatory
  text.
- Axis tick labels have no programmatic axis title or unit. A user hearing a
  value through the tooltip must infer its measure from nearby page content.
- Loading renders a visual `LoaderRing`, but the wrappers do not expose a chart
  loading state or a no-data state in text.
- The public accessibility statement already identifies charts as partially
  supporting non-text content and lists summaries and keyboard-navigable data
  tables as roadmap work. The implementation should make that statement true
  before its conformance language is strengthened.

## Accessibility Requirements

The renderer is only one part of the accessible result. The application-level
contract should satisfy these requirements regardless of chart library.

### Equivalent Information

[WCAG 2.1 Success Criterion 1.1.1](https://www.w3.org/WAI/WCAG21/Understanding/non-text-content)
requires non-text content to have a text alternative that serves the equivalent
purpose. Its chart example recommends a short label, a longer description of
the trend and implications, and, where practical, the actual data in a table.

For Modulus, equivalent information means:

- the chart topic and analytical purpose;
- the category dimension, including its time granularity and selected range;
- the measure and unit;
- the series names for a multi-series chart;
- the values used to render every mark; and
- any conclusion presented visually, such as the peak or comparison between
  series.

An `aria-label` such as `Learner activity by week` is a useful short name, but
it is not an alternative for the underlying values.

### Keyboard Access

Users must be able to reach the exact values without a pointer. That does not
require making each SVG bar a control when the chart itself performs no action.
A native disclosure and data table provide a familiar keyboard path and avoid
adding a tab stop for every mark.

If a future chart adds selection, filtering, drill-down, or editing, its
controls must be keyboard operable and expose the same resulting state in text.
The static-image recommendation in this document should not be applied to a
future functional chart without reassessing that interaction.

### Announcements

Exploring historical chart values is not an urgent status change. If a live
region remains anywhere in a future interactive chart, it should be polite,
should announce one complete datum at a time, and should not compete with SVG
labels. Dynamic filter changes should update the heading, summary, description,
and table together; they should not announce every rerender.

### Visual Access

The existing non-screen-reader concerns remain part of the contract:

- series must not be distinguishable by colour alone;
- bars, axes, labels, focus indicators, and legend markers must meet the
  applicable contrast requirements in light, dark, forced-colours, and high
  contrast modes;
- the chart and its alternative must work at 200% text resize and 400% zoom;
- visible tooltips must be dismissible and must not obscure content that the
  user needs to operate; and
- empty, loading, and error states must be conveyed in text.

## `aria-hidden` Assessment

`aria-hidden` is allowed on SVG elements. The SVG specification includes it
among the supported ARIA attributes. It can therefore be used on a non-focusable
axis group or decorative SVG child.

It must **not** be placed on the current chart root while that root retains
`tabIndex="0"`, `role="application"`, or keyboard handling. W3C's
[Using ARIA guidance](https://www.w3.org/TR/using-aria/) explicitly warns against
putting `aria-hidden="true"` on a focusable element or on an ancestor of
focusable descendants because users can otherwise focus an object that has
disappeared from the accessibility tree.

Hiding only the axis labels is a valid experiment, but it is not the recommended
end state:

- it can reduce the duplicate axis speech reported by the auditor;
- it leaves the VoiceOver Quick Nav limitation in place;
- it leaves exact values dependent on an assertive transient tooltip; and
- it removes meaningful visual text from the accessibility tree unless a full
  equivalent is supplied elsewhere.

If the chart is intentionally made static, disable Recharts'
`accessibilityLayer`, apply `role="img"`, and use Recharts' native `title` and
`desc` properties to emit SVG `<title>` and `<desc>` children. The title supplies
the graphic's accessible name and the description states its purpose and range.
An image role presents the composed graphic as one object instead of inviting
traversal of each tick label. The adjacent summary and table then carry the
detailed information.

Decision: do **not** add `aria-hidden` to the root SVG or its axes. Hiding the
root would conflict with its image role, while hiding individual axes is
unnecessary once the graphic is exposed atomically and risks removing useful
fallback content. `aria-hidden="true"` is reserved for the non-focusable HTML
tooltip because it is supplemental to the complete native table. This contract
must still be confirmed in the manual browser and assistive-technology matrix.

## Options

### Option A — Keep the Current Interactive Recharts Model and Hide Axis Text

This is the smallest code change. The wrappers would retain
`accessibilityLayer`, `role="application"`, keyboard tooltip navigation, and a
live tooltip while hiding axis ticks from assistive technology.

Benefits:

- preserves the working Chrome/NVDA experience;
- directly targets the duplicate axis announcements; and
- changes no dependency or consumer data model.

Costs:

- does not solve the documented VoiceOver Quick Nav requirement;
- continues to depend on a transient live region for exact values;
- risks hiding meaningful information without providing an equivalent;
- still needs names, descriptions, summaries, tables, state handling, and tests;
  and
- keeps `role="application"` for a chart with no application-like function.

Decision: **reject as the target architecture**. It may be useful as a short
diagnostic spike, but it does not satisfy the cross-platform requirement.

### Option B — Keep Recharts as a Static Visual and Add Semantic HTML

The wrappers would render the same bars and pointer tooltip, but the SVG would
be presented as a named static image. Each consumer would supply chart metadata
and a table derived from the same typed data used by Recharts.

Benefits:

- avoids the VoiceOver/application-mode conflict;
- uses native HTML for the information that must be exact and navigable;
- improves access for screen-reader, keyboard, low-vision, cognitive, print,
  and copy/paste use cases;
- keeps visual and accessible values synchronized because both derive from the
  same data array;
- requires no dependency migration; and
- matches both W3C guidance and the roadmap already published in
  `apps/gradebook/src/content/docs/02-accessibility.md`.

Costs:

- removes arrow-key tooltip exploration from the chart itself;
- adds visible page content and a disclosure control;
- requires clear responsive table behaviour for 12–31 rows; and
- requires intentional summaries instead of trying to generate analytical
  conclusions from arbitrary keys.

Decision: **recommend**.

### Option C — Migrate to TanStack Charts Now

TanStack Charts has a notably stronger documented accessibility contract than
the current Recharts wrapper:

- every adapter requires an accessible label and supports a description;
- the SVG renderer uses image semantics and a chart role description;
- tooltip rows use a polite status region;
- keyboard navigation includes arrows, Home, End, Enter, Space, and Escape;
- its guide says that tooltips are supplemental and exact values should be
  available in a summary or linked table;
- it exposes typed focus and selection callbacks; and
- it respects reduced motion by default.

Those choices are directionally right. They do not yet justify a production
migration:

- the [official repository](https://github.com/TanStack/charts) labels 0.6.x
  pre-alpha, warns that APIs may change between releases, and says it is not
  ready for production use;
- it is a grammar plus framework adapter and granular D3 dependencies, not a
  drop-in replacement for the two current wrappers;
- its keyboard model still depends on arrow events reaching a focused SVG, so
  the exact VoiceOver/browser combinations in the audit must be tested rather
  than assumed fixed;
- the current five charts do not need its richer focus, selection, renderer, or
  custom-mark capabilities; and
- summaries and linked tables remain application responsibilities even after a
  migration.

Decision: **defer**. Re-evaluate after a stable production release and after a
small browser/screen-reader proof of concept demonstrates a material improvement
over the recommended Recharts composition.

### Option D — Replace Recharts With Hand-Written HTML/CSS/SVG

The current chart set is small enough that a local bar-chart implementation is
possible. Native HTML could make labels and values explicit and reduce the
dependency surface.

This is not inherently more accessible. Modulus would own scale calculation,
axes, stacking, responsive layout, focus behaviour, tooltip placement, reduced
motion, forced-colour support, and regression testing. The same summary and
table would still be required. Replacing a maintained visual renderer with
application code is not justified by the present charts.

Decision: **reject for now**.

## Recommended Presentation Contract

The detailed implementation plan should define one shared chart composition
rather than independently patching five consumers. At the specification level,
that composition must provide the following contract.

### Required Metadata

Every chart must provide:

- a stable identifier used to connect heading, description, graphic, and table;
- a visible title;
- a concise visible description containing measure, unit, granularity, and
  selected time range;
- a short accessible graphic name;
- an intentional summary of the important trend or comparison;
- typed category metadata and one or more typed series definitions;
- value and category formatters shared by tooltip, summary data, and table; and
- explicit loading, empty, and error text.

The shared interface should not retain `data: any[]`, arbitrary string keys, or
an untyped `dataKey: any[]` series list. The future plan should select generics
or a normalized internal row shape so a consumer cannot add a chart without
also naming its categories, series, and units.

### Semantic Structure

The rendered order should be:

1. heading;
2. visible description and summary;
3. named static chart graphic;
4. `View data table` disclosure; and
5. native table with a caption and scoped column headings.

The table must use the same rows and formatters as the visual chart. The
single-series table needs category and value columns. The stacked chart needs a
category column, one column per series, and a total only if that total is also a
meaningful part of the visible presentation.

The table should be available to all users rather than visually hidden for
screen readers. A disclosure keeps the dashboard compact while making exact
values useful to users who zoom, magnify, print, copy data, or find a chart hard
to interpret.

### Renderer Behaviour

For the current informational charts:

- set Recharts `accessibilityLayer={false}`;
- give the root SVG an explicit image role plus native `<title>` and `<desc>`
  text through Recharts' `title` and `desc` properties;
- associate the graphic with the visible description or summary;
- remove `role="status"` and `aria-live` from the visual tooltip;
- apply `aria-hidden="true"` to that non-focusable supplemental tooltip, not to
  the SVG root or axis groups;
- retain the pointer tooltip as supplemental visual information;
- keep the SVG out of the tab order because it performs no action; and
- avoid per-axis `aria-hidden` overrides unless cross-browser inspection shows
  that image semantics alone are insufficient.

This deliberately exchanges a partially working chart-specific keyboard
interaction for a consistently available native HTML exact-value interface.

### Consumer-Specific Content

| Chart | Required table columns | Summary responsibility |
|---|---|---|
| Learner Activity | Week/date range; students | Total, peak week, early/late distribution; replace or reconcile the current synthetic insight text |
| Registrations Per Day | Date; registrations | Selected month/year, total registrations, peak day, and zero-data statement |
| Registrations Per Month | Month; registrations | Selected year, total, peak month, and direction only when supported by the data |
| Monthly Active Users | Month; active users | Selected year, peak month, and meaningful range or trend |
| New vs Returning Users | Month; new; returning | Selected year, overall series comparison, peak month per series, and stacked total only where useful |

Summaries must be derived from actual response data and must not invent a trend
when the result is empty or statistically flat. The implementation plan should
also resolve the learner activity chart's existing use of generated 2023 sample
data presented as if it described the selected activity. That data-integrity
issue is not caused by accessibility, but an accessible table would make it more
visible and it should not be carried into the final presentation without an
explicit product decision.

## Verification Strategy

Automated tests can protect structure and synchronization, but the reported
defect requires manual assistive-technology testing.

### Component Tests

The future implementation should verify that:

- a chart cannot render without a non-empty title, graphic name, description,
  unit, category definition, and series definition;
- the SVG has static image semantics and is not tabbable;
- no tooltip status or live region exists;
- the disclosure has a useful accessible name and controls the table;
- every source row and formatted value appears in the table;
- the stacked table has a heading for every series;
- loading, empty, and error states are exposed as text; and
- changing data updates the chart description, summary, and table together.

Avoid snapshots of the complete Recharts SVG. Assert the application-owned
semantic contract and a small number of renderer integration attributes.

### Manual Matrix

Test the complete chart card, not an isolated SVG, with:

| Platform | Browser | Assistive technology | Required result |
|---|---|---|---|
| Windows | Chrome | NVDA | Chart is announced once as a named graphic; table disclosure and values are operable without duplicate speech |
| Windows | Firefox | NVDA | Same information and control order as Chrome/NVDA |
| macOS | Safari | VoiceOver | No Quick Nav change is required; rotor and ordinary navigation reach the heading, summary, disclosure, and table |
| macOS | Chrome | VoiceOver | Same exact-value path as Safari/VoiceOver, with no overlapping tooltip/axis announcements |
| Any supported desktop | Chrome/Safari/Firefox | Keyboard only | Disclosure and table are reachable with visible focus; the non-interactive chart is not an unexplained tab stop |

Also verify at 200% text resize, 400% zoom, dark mode, forced-colours/high
contrast mode where available, and with reduced motion enabled. Review daily and
monthly charts with their maximum row counts and verify empty results.

The acceptance test should be task-based: a tester can identify the chart,
state its purpose and time range, find a requested category's exact value,
compare series where present, and move past the chart without changing a screen
reader input mode.

## Acceptance Criteria for a Future Implementation

- All five charts expose a visible title, purpose, units, time range, concise
  summary, and complete exact-value table.
- The graphic, tooltip, summary, and table derive their displayed values from
  the same typed data and formatters.
- Informational SVGs are named static images, have no application role, do not
  enter the tab order, and do not expose a live tooltip region.
- No chart requires VoiceOver Quick Nav to be disabled.
- A user can retrieve every plotted value with keyboard-only and ordinary
  screen-reader table navigation.
- Multi-series meaning is conveyed by text and not by colour alone.
- Loading, empty, and error outcomes are conveyed in text.
- Component tests protect the application-owned semantic contract.
- The manual browser/assistive-technology matrix passes without simultaneous
  axis and tooltip announcements.
- `apps/gradebook/src/content/docs/02-accessibility.md` is updated only after the
  implementation and manual verification accurately support a conformance
  statement change.

## Risks and Mitigations

### Duplicate Content

A summary, chart, and table repeat related information. The repetition is
intentional but can become noisy. Keep the summary short, make the table
disclosed rather than permanently expanded, and expose the SVG as one named
image rather than a tree of ticks and bars.

### Table Width on Small Screens

The stacked chart table has at least three numeric columns. Use a responsive
container with an explicit table label and preserve native table semantics.
Do not convert rows into visually styled generic elements solely to avoid
horizontal overflow.

### Visual and Tabular Drift

Separate transforms or formatters could produce different values. The chart
composition must accept one typed dataset and shared formatters, and tests must
assert that each source row appears in the table.

### Loss of Keyboard Tooltip Exploration

Chrome/NVDA users who currently use arrows would instead open and navigate the
table. This is a deliberate tradeoff for a predictable cross-platform path. The
table supplies stronger category/value relationships and supports copy, braille,
and direct cell navigation.

### Future Interactive Charts

Static image semantics are unsuitable if a later chart gains selection or
drill-down. Treat interactivity as a new contract: add semantic controls and
re-run the assistive-technology matrix rather than re-enabling Recharts'
application layer by default.

### TanStack Charts Maturity Changes

The pre-alpha assessment is time-sensitive. Revisit it against a pinned stable
release, its migration guide, and a local VoiceOver/NVDA proof of concept. Do
not migrate based on documentation claims alone.

## Out of Scope

- implementing any chart, wrapper, summary, disclosure, or table change;
- adding, removing, or upgrading dependencies;
- creating a feature branch or committing code;
- redesigning the admin dashboard layout;
- changing report queries or analytical definitions;
- claiming that the application meets a different WCAG conformance level;
- updating the public accessibility conformance statement before verification;
- selecting a replacement chart library for future chart types that Modulus
  does not currently render; and
- replacing the learner activity chart's synthetic data with production
  analytics. The approved near-term decision is to retain it and label every
  presentation as illustrative sample data.

## Final Recommendation

Adopt Option B: retain Recharts as the visual renderer, make its output a named
static image, remove the assertive tooltip live region, and place the exact data
in a native HTML table behind a visible disclosure. Build the contract once in
the shared chart layer and require every consumer to provide its purpose, units,
summary, typed series metadata, and state text.

This approach addresses the actual audit finding without making Modulus depend
on a screen-reader-specific application mode. It also remains valid if the
visual renderer changes later. TanStack Charts should stay on the evaluation
list because its documented defaults are closer to this contract, but a
pre-alpha migration is not warranted for five informational bar charts.
