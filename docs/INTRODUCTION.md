---
title: "Introduction"
path: "introduction"
summary: "An assignment-grade database designed to track progress on Ximera assignments using time-series data and latest page-state snapshots. Helping instructors understand their assignments."
---

# Introduction

Modulus is a learner activity database for Ximera, the open-source interactive textbook platform developed at The Ohio State University (OSU), Mathematics Department. Modulus connects Ximera to OSU's learning management system (LMS) via LTI 1.3. Modulus also records time-series interaction data and page-state snapshots from Ximera assignments, giving instructors a clearer picture of how their materials are actually being used.

## What Modulus is

At its core, Modulus is a small piece of infrastructure. It sits alongside a Ximera deployment, receives activity data via instrumented Ximera pages, and then stores that data in a structured form that instructors can query. There is no separate interface that students need to learn, no new workflow for instructors to adopt, and no account system layered on top of the LMS.
The project is open-source and available on GitHub. Institutions can run their own instance, or use a shared public deployment.

## Why it exists

Open educational resources have grown considerably over the last decade. Ximera in particular has a legacy as a 'best in class' platform for teaching mathematics. What has been less developed is the tooling around these resources — specifically, the ability for an instructor to look at an assignment after the fact and understand how students moved through it. Where did learners spend time? Which problems produced repeated attempts? Which sections were skipped?
Modulus is an attempt to fill that gap. It is not an LMS, or a student information system. It is a focused database that captures the kinds of signals an instructor would want to look at when revising a course.

## How it fits with Ximera

Ximera — "Interactive, Mathematics, Education, Resources, for All" — is an open-source interactive mathematics learning platform. Modulus is built on the assumption that Ximera is doing its job well: presenting content, accepting learner input. Modulus acts as  both an analytics system, and the integration layer between Ximera and OSU's institutional LMS via LTI 1.3.
Modulus does not replace any part of Ximera. It listens, records, and presents what it has recorded. Both projects share a commitment to open educational resources, and Modulus is intended to be useful to the existing Ximera community rather than to redirect it.

## Design principles

A few principles have shaped the project so far:
Store as little as possible. Modulus retains assignment interaction data, not personal student information. Student identity is abstracted through LTI, and only the minimum needed to make the data useful is kept.
Stay out of the way. Learners interact with Ximera the way they always have, through their LMS or on the open web. Instructors do not have to change how they author or assign work.
Be deployable. The project is designed to be installed with minimal configuration, and to be safe to run as a public instance. It targets WCAG 2.1 AA accessibility standards.
Be honest about scope. Modulus is one component in a larger ecosystem. It does not aim to be a complete platform.
## Status
The codebase is available now. Full documentation and deployment guides are still being written, and the project should be considered early in its lifecycle. Feedback, issues, and contributions are welcome through the GitHub repository.
