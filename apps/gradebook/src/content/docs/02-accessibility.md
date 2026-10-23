---

title: "Accessibility Conformance Report"
summary: "Voluntary Product Accessibility Template (VPAT) for Modulus, covering WCAG 2.1 Level A and AA success criteria."
---

# Accessibility Conformance Report

## Introduction

Modulus strives to be compliant with the Web Content Accessibility Guidelines (WCAG) 2.1 AA standard, as required by the United States Department of Education and as adopted by The Ohio State University. Modulus is the learner activity database and instructor analytics surface that sits alongside the Ximera interactive textbook platform; this report covers the Modulus web application itself, not the Ximera content it observes.

Technical conformance with WCAG does not guarantee that every user with a disability will be able to complete every task. Institutions deploying Modulus should publish their own accessibility statement, and instructors using Modulus should ensure the courses and assignments they assemble in Ximera (and surface in their LMS) carry their own accessibility statements.

## Product Information

| Item                 | Details                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**             | Modulus                                                                                                                                                                  |
| **Type**             | Web-based learner activity database and instructor analytics application                                                                                                 |
| **Description**      | Records time-series interaction data and page-state snapshots from Ximera assignments and presents them to instructors; integrates with institutional LMSes via LTI 1.3. |
| **Primary Use Case** | Postsecondary education — instructors reviewing assignment activity; learners launched into Ximera through their LMS                                                     |
| **Hosting Model**    | Self-hosted or institutionally hosted web application                                                                                                                    |
| **Contact**          | https://modulus-learning.org                                                                                                                                             |
| **Report Date**      | 2026-05                                                                                                                                                                  |

## Evaluation Methods

The assessment employed:
- Manual expert review by the Modulus development team
- Keyboard-only navigation across the public site, LTI launch flow, instructor dashboards, and administrative forms
- Targeted screen-reader testing with NVDA (Firefox, Chrome on Windows) and VoiceOver (Safari, Chrome on macOS)
- Automated linting (Biome) and component-level accessibility checks during development
- Visual inspection of color contrast in default and dark themes

The report reflects the current state of the application and acknowledges ongoing work, particularly in instructor-facing data visualisations.

## Applicable Standards

| Standard           | Included      |
| ------------------ | ------------- |
| WCAG 2.1 Level A   | Yes           |
| WCAG 2.1 Level AA  | Yes           |
| WCAG 2.1 Level AAA | Not Evaluated |

## Conformance Terminology

- **Supports**: Functionality meets the criterion without known defects.
- **Partially Supports**: Some functionality does not fully meet the criterion.
- **Does Not Support**: The majority of functionality does not meet the criterion.
- **Not Applicable**: The criterion does not apply to the product.

---

## WCAG 2.1 Level A Success Criteria

| Criterion                                 | Conformance        | Remarks                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.1.1 Non-text Content**                | Partially Supports | Icons and decorative images carry appropriate alt text or are hidden from assistive technology. Instructor-facing charts (built with Recharts) expose values in the underlying SVG but accessible text alternatives for full chart contents are still being expanded.                         |
| **1.2.1–1.2.3 Audio/Video (Prerecorded)** | Not Applicable     | Modulus does not host audio or video content.                                                                                                                                                                                                                                                 |
| **1.3.1 Info and Relationships**          | Supports           | Pages use semantic HTML landmarks (`header`, `nav`, `main`, `footer`), heading levels, lists, and tables for tabular data. Form fields are programmatically associated with their labels via React Hook Form.                                                                                 |
| **1.3.2 Meaningful Sequence**             | Supports           | Content order in the DOM matches the intended reading and tab order.                                                                                                                                                                                                                          |
| **1.3.3 Sensory Characteristics**         | Supports           | Instructions and call-outs do not rely on shape, size, location, or sound alone.                                                                                                                                                                                                              |
| **1.4.1 Use of Color**                    | Supports           | Status (e.g. submission state, error/success messages) is conveyed by text and icon in addition to color. Chart series are distinguished using a combination of color, legend labels, and tooltips; chart styling is adjusted as needed to ensure information is not conveyed by color alone. |
| **1.4.2 Audio Control**                   | Not Applicable     | No auto-playing audio or video.                                                                                                                                                                                                                                                               |
| **2.1.1 Keyboard**                        | Supports           | All interactive controls, including the navigation drawer, dialogs, tables, and forms, are reachable and operable via the keyboard. Chart drill-downs that depend on hover have keyboard-accessible equivalents.                                                                              |
| **2.1.2 No Keyboard Trap**                | Supports           | Focus can be moved into and out of every component, including modal dialogs, using standard keyboard controls.                                                                                                                                                                                |
| **2.1.4 Character Key Shortcuts**         | Not Applicable     | Modulus does not implement single-character keyboard shortcuts.                                                                                                                                                                                                                               |
| **2.2.1 Timing Adjustable**               | Supports           | No time limits are imposed on instructor tasks. Authentication sessions extend silently within their LTI launch window.                                                                                                                                                                       |
| **2.2.2 Pause, Stop, Hide**               | Not Applicable     | No moving, blinking, scrolling, or auto-updating content beyond brief loading indicators.                                                                                                                                                                                                     |
| **2.3.1 Three Flashes or Below**          | Supports           | No content flashes more than three times per second.                                                                                                                                                                                                                                          |
| **2.4.1 Bypass Blocks**                   | Supports           | A "Skip to main content" link is provided, and page regions are marked up as ARIA landmarks.                                                                                                                                                                                                  |
| **2.4.2 Page Titled**                     | Supports           | Each route sets a descriptive `<title>` via Next.js metadata.                                                                                                                                                                                                                                 |
| **2.4.3 Focus Order**                     | Supports           | Tab order follows the logical reading sequence; dialogs trap focus while open and restore it on close.                                                                                                                                                                                        |
| **2.4.4 Link Purpose (In Context)**       | Supports           | Link text is descriptive on its own or within its immediate context; ambient "click here" links are avoided.                                                                                                                                                                                  |
| **2.5.1 Pointer Gestures**                | Not Applicable     | All functions are operable via single-point activation; no multi-point or path-based gestures are required.                                                                                                                                                                                   |
| **2.5.2 Pointer Cancellation**            | Supports           | Actions are triggered on the up-event of a pointer, allowing users to abort by moving off the target.                                                                                                                                                                                         |
| **2.5.3 Label in Name**                   | Supports           | Visible labels and the accessible name of each control match.                                                                                                                                                                                                                                 |
| **2.5.4 Motion Actuation**                | Not Applicable     | Modulus does not use device motion or user motion as input.                                                                                                                                                                                                                                   |
| **3.1.1 Language of Page**                | Supports           | The document `lang` attribute is set on every page (currently English).                                                                                                                                                                                                                       |
| **3.2.1 On Focus**                        | Supports           | Receiving focus does not cause an unexpected change of context.                                                                                                                                                                                                                               |
| **3.2.2 On Input**                        | Supports           | Changing a field value does not submit the form or navigate the user; explicit submit actions are required.                                                                                                                                                                                   |
| **3.3.1 Error Identification**            | Supports           | Form errors are identified in text near the offending field, in addition to color and icon cues.                                                                                                                                                                                              |
| **3.3.2 Labels or Instructions**          | Supports           | All form fields have visible labels; additional instructions are provided where input format is constrained.                                                                                                                                                                                  |
| **4.1.1 Parsing**                         | Supports           | The rendered HTML conforms to modern parsing requirements (the criterion is treated as obsolete in WCAG 2.2).                                                                                                                                                                                 |
| **4.1.2 Name, Role, Value**               | Partially Supports | Native form controls expose name, role, and value automatically. Custom components built on Base UI expose ARIA attributes; a small number of bespoke widgets (notably some chart interactions) are still being audited and improved.                                                         |

---

## WCAG 2.1 Level AA Success Criteria

| Criterion                                           | Conformance        | Remarks                                                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1.2.4 Captions (Live)**                           | Not Applicable     | No live audio or video.                                                                                                                                                                                                  |
| **1.2.5 Audio Description (Prerecorded)**           | Not Applicable     | No prerecorded audio or video.                                                                                                                                                                                           |
| **1.3.4 Orientation**                               | Supports           | Layouts reflow in both portrait and landscape orientations; no orientation is locked.                                                                                                                                    |
| **1.3.5 Identify Input Purpose**                    | Partially Supports | Common input purposes (email, name) carry appropriate `autocomplete` attributes. A pass to extend coverage to all applicable fields is in progress.                                                                      |
| **1.4.3 Contrast (Minimum)**                        | Supports           | Body text and primary controls meet the WCAG AA 4.5:1 (normal text) and 3:1 (large text) minimums in both light and dark themes. Chart colors are tuned to meet contrast targets and will be adjusted further as needed. |
| **1.4.4 Resize Text**                               | Supports           | Text can be resized to 200% without loss of content or functionality.                                                                                                                                                    |
| **1.4.5 Images of Text**                            | Supports           | Text is rendered as text; logos are the only image-of-text exception.                                                                                                                                                    |
| **1.4.10 Reflow**                                   | Supports           | Content reflows at 400% zoom without requiring two-dimensional scrolling, except where two-dimensional layout is essential (data tables, charts).                                                                        |
| **1.4.11 Non-text Contrast**                        | Supports           | Focus indicators, form borders, and primary buttons meet the 3:1 contrast minimum against adjacent colors. Chart axes, gridlines, and series strokes are tuned to meet contrast targets and adjusted as needed.          |
| **1.4.12 Text Spacing**                             | Supports           | User stylesheets that adjust line height, paragraph spacing, letter spacing, and word spacing do not break the layout.                                                                                                   |
| **1.4.13 Content on Hover or Focus**                | Supports           | Tooltips and popovers are dismissible with Escape, remain visible while hovered, and persist until the triggering element loses hover or focus.                                                                          |
| **2.4.5 Multiple Ways**                             | Supports           | Pages are reachable via primary navigation, deep links from the LMS, and direct URLs.                                                                                                                                    |
| **2.4.6 Headings and Labels**                       | Supports           | Headings and form labels describe the topic or purpose of their section or control.                                                                                                                                      |
| **2.4.7 Focus Visible**                             | Supports           | A visible focus indicator is provided for every keyboard-operable control; the indicator meets non-text contrast minimums.                                                                                               |
| **3.1.2 Language of Parts**                         | Not Applicable     | All in-product text is in a single language (English).                                                                                                                                                                   |
| **3.2.3 Consistent Navigation**                     | Supports           | Navigation and chrome are presented consistently across pages within a given role (public, instructor, admin).                                                                                                           |
| **3.2.4 Consistent Identification**                 | Supports           | Components that perform the same function (e.g. "Save", "Cancel", "Export") are identified consistently.                                                                                                                 |
| **3.3.3 Error Suggestion**                          | Supports           | Where a form value is known to be incorrect, a suggestion is offered (e.g. expected format, allowed values).                                                                                                             |
| **3.3.4 Error Prevention (Legal, Financial, Data)** | Supports           | Destructive administrative actions require explicit confirmation; no financial or legal transactions are handled by Modulus.                                                                                             |
| **4.1.3 Status Messages**                           | Partially Supports | Toast notifications and inline form-status messages are exposed via ARIA live regions. A small number of asynchronous updates in instructor dashboards do not yet emit status messages and are being addressed.          |

---

## Known Issues and Roadmap

The following areas have been identified for ongoing accessibility work:
- **Charts and data visualisations** — Adding accessible text summaries and keyboard-navigable data tables alongside Recharts-based visualisations.
- **Live region coverage** — Extending ARIA live-region announcements to all asynchronous status changes in instructor dashboards.

## Legal Disclaimer

This document is provided for informational purposes only and does not constitute a warranty of accessibility compliance. Accessibility outcomes vary based on configuration, deployment, integrations, and end-user environments. The Modulus project will continue to improve accessibility as part of its development roadmap and welcomes accessibility feedback via its public issue tracker.
