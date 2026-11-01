# Structured Updates — Quick Guide

Structured Updates lets Dev, QA and BA record their work in a consistent format inside a ticket’s **Activity** area. Each update captures the outcome, supporting details and evidence, and can move the ticket to the next project state. Regular comments remain available.

## Set up a project

1. Confirm **God Mode → Feature flags → Structured updates** is on. This controls availability across Sync.
2. Open **Project Settings → Work Structure → Structured updates** and turn on **Enable structured updates** for the project.
3. Review the state mapping so each outcome moves tickets to the correct state.
4. Assign **Dev**, **QA** or **BA** functional roles to project members. A member can hold more than one role.

The feature was released to production on **31 October 2026**, with every project initially switched off for a controlled pilot.

## What each role submits

| Role | Required details                               | Typical next state                          |
| ---- | ---------------------------------------------- | ------------------------------------------- |
| Dev  | Root cause category, root cause and resolution | Ready for QA                                |
| QA   | Passed or Failed, with QA validation notes     | Passed → Ready for BA; Failed → In Progress |
| BA   | Approved or Rejected, with BA validation notes | Approved → Done; Rejected → In Progress     |

State destinations are configurable per project. For example, a developer records a fix and submits it for QA. QA records the test result. If it passes, BA validates the outcome and approves or rejects it.

## Post an update

Open a ticket, go to **Activity**, choose your assigned role and complete the required fields. Add supporting links or evidence, then submit. The update records its author, outcome and state change.

Evidence can include JPEG, PNG, GIF, WebP, MP4, WebM or MOV files, up to **50 MB per file**. Links must use HTTP or HTTPS.

## Rules to know

- Only active project Admins or Members with the relevant functional role can post. Admin access alone does not grant a functional role; guests cannot post structured updates.
- QA and BA submissions normally require the ticket to be in the configured review state. Project admins can override this check, and the override is recorded. Dev submissions are blocked on completed or cancelled tickets.
- Authors can edit their notes, links and evidence. Edits retain a revision history; updates cannot be deleted.
- To correct a result or root cause category, the author uses **Correct result** or **Correct category** on their latest ticket update, while still holding that role. A reason is required. The original stays visible, and the correction can change the ticket’s state.
- QA rounds track repeat testing after QA failure or an uncorrected BA rejection.

## Track progress

Use **QA result**, **QA round**, **BA result** and **Root cause category** filters in project work items, Cycles, Modules and project Views.

Turning off the instance or project switch hides and blocks structured updates while preserving existing data. Regular comments continue to work.
