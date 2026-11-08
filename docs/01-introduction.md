---
title: "Introduction"
path: "introduction"
summary: "An assignment-grade database designed to track progress on Ximera assignments using time-series data and latest page-state snapshots. Helping instructors understand their assignments."
---

# Introduction

Modulus is a learner activity database for Ximera, the open-source interactive textbook platform developed at The Ohio State University (OSU), Mathematics Department. Modulus connects Ximera to OSU's learning management system (LMS) via Learning Tools Interoperability (LTI) 1.3. Modulus also records time-series interaction data and page-state snapshots from Ximera assignments, giving instructors a clearer picture of how their materials are actually being used.

## What Modulus Is

At its core, Modulus is a small piece of infrastructure. It sits alongside a Ximera deployment, receives activity data via instrumented Ximera pages, and then stores that data in a structured form that instructors can query. For LMS-launched assignments, students continue through their LMS and Ximera without a separate sign-up workflow. Instructors do not need to change how they author or assign work.
The project is open-source and available on GitHub. Institutions can run their own instance, or use a shared public deployment.

## Why It Exists

Open educational resources have grown considerably over the last decade. Ximera in particular has a legacy as a 'best in class' platform for teaching mathematics. What has been less developed is the tooling around these resources — specifically, the ability for an instructor to look at an assignment after the fact and understand how students moved through it. Where did learners spend time? Which problems produced repeated attempts? Which sections were skipped?
Modulus is an attempt to fill that gap. It is not an LMS, or a student information system. It is a focused database that captures the kinds of signals an instructor would want to look at when revising a course.

## How It Fits with Ximera

Ximera — "Interactive, Mathematics, Education, Resources, for All" — is an open-source interactive mathematics learning platform. Modulus is built on the assumption that Ximera is doing its job well: presenting content, accepting learner input. Modulus acts as both an analytics system, and the integration layer between Ximera and OSU's institutional LMS via LTI 1.3.
Modulus does not replace any part of Ximera. It listens, records, and presents what it has recorded. Both projects share a commitment to open educational resources, and Modulus is intended to be useful to the existing Ximera community rather than to redirect it.

## Design Principles

A few principles have shaped the project so far:

- **Store as little as possible.** Modulus retains assignment interaction data and the identity information needed to authenticate learners and process their work. Student identity is abstracted through LTI; institutional identifiers and LMS gradebook data stay inside the trusted server boundary. [Security & Privacy](./21-security-and-privacy.md) describes what is retained and what activities receive.
- **Stay out of the way.** Learners interact with Ximera the way they always have, through their LMS or on the open web. Instructors do not have to change how they author or assign work.
- **Be deployable.** The project aims to be installable with minimal configuration and safe to run as a public instance. It targets WCAG 2.1 AA accessibility standards.
- **Be honest about scope.** Modulus is one component in a larger ecosystem. It does not aim to be a complete platform.

## Package Structure

Business operations and data access live in `@modulus-learning/core`. Shared
LTI contracts and Canvas-specific behaviour live in separate packages. The
first host adapter, `@modulus-learning/host-tanstack-start`, connects those
operations to application routes and UI. Activity pages use the separately
published `@modulus-learning/agent` browser library.

[Packages](./03-packages.md) explains the five-package set and the boundaries an
independent installation uses. The `modulus` operational CLI is included in
core; its current commands are listed in [CLI](./06-cli.md).

## Licence and Status

Project-owned source uses MPL-2.0, with MIT retained for the browser agent and
its demos. The [licensing guide](https://github.com/Modulus-Learning/app.modulus-learning.org/blob/develop/LICENSING.md)
records the full scope.

The codebase is available now. Full documentation and deployment guides are still
being written, and the project should be considered early in its lifecycle.
Feedback, issues, and contributions are welcome through the GitHub repository.

:::note[Documentation in Progress]
Documentation is actively being worked on following the package refactor.
Detailed setup and upgrade guides will be completed after a working independent
installation has been validated. Existing implementation drafts and new
placeholder pages are identified in the documentation overview.
:::

## Where to go next

- [Getting Started](./02-getting-started.md) helps you choose where to begin.
- [Packages](./03-packages.md) maps the refactored structure.
- [Architecture](./09-architecture.md) explains the main design decisions.
- [Documentation Overview](./00-documentation-plan.md) distinguishes existing references, drafts, and planned work.
