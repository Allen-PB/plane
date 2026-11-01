# PBS-9 — Employee setup, working schedules and attendance

Status: specification approved in chat; Phase 1 local implementation authorized on 2 November 2026. No deployment authorized.

Prepared: 2 November 2026 (Asia/Manila).

Issue: https://sync.pathbuilderedu.com/pathbuilder/browse/PBS-9/

This document consolidates the issue's 30 acceptance criteria and 30 QA cases with the decisions made in this chat. It does not change the issue itself. Revised requirements below require corresponding issue and QA updates before acceptance testing. No deployment is authorized by this specification.

## 1. Scope and changes to the original issue

PBS-9 originally requires self-service Department, free-text Role and daily Working Hours; attendance indicators; an admin Attendance module; and consistent PDF/CSV reports.

The agreed scope changes are:

- Job Role becomes a department-filtered dropdown instead of free text.
- Department and job Role are editable by employees during initial setup only. After office access is granted, admins manage them.
- Admins configure initial scheduled hours. Later employee changes require approval.
- Attendance arrangements explicitly distinguish Scheduled shift and Output-based employees.
- Role catalog management, schedule-request approvals, notifications, pending employee changes, and deskless attendance are included.

Job Role describes a position such as Developer. It never grants the office permission roles Employee, Admin or Super Admin.

## 2. Invitation and Employee access flow

1. An administrator invites the employee to Sync through the existing invitation flow.
2. The employee accepts, registers/signs in, and their active account becomes available in Office management's account selector. Sync account creation does not automatically grant office membership.
3. Before office access is granted, the employee can choose Department and its job Role in Settings → Profile. An admin can complete those fields in Employee access instead.
4. In Office management → Employee access, an Admin or Super Admin selects the account, reviews or completes Department and job Role, and selects an attendance arrangement.
5. Scheduled shift reveals working days, per-day start/end times, and an explicit Ends next day option. The admin supplies an initial valid schedule before granting new access. Output-based hides schedule fields.
6. The employee receives office access. Department and job Role become read-only in Profile. Existing office permission management remains separate.
7. The employee chooses an eligible desk and records Time In. Department and job Role are required. If the department has no available workstation, attendance can start without a desk and shows No workstation available.

An employee who is already timed in without a desk can claim an eligible desk later without changing the session's original Time In.

## 3. Department and job Role

Both Profile and Virtual Office use these seven fixed department names. Administrators cannot rename them:

- Development
- Project Management
- Quality & Systems
- Business, Sales & Marketing
- Operations
- Leadership
- UI/UX

Only Super Admins create, rename and archive department-specific job-role options. Employees see selectable roles belonging to their selected department. Archiving prevents new selections while preserving existing assignments. Renaming updates current assignments; historical attendance retains the title recorded at the time.

Admins and Super Admins can edit employee Department and job Role after access is granted. They do not have to wait for Time Out. Changes are pending until the employee's next Time In; current attendance retains its original details. Employees receive an in-app notification explaining the effective timing.

For a pending department change, the next Time In flow applies the department change, releases the old reservation, and prompts for an eligible new desk. Attendance is recorded only after confirmation. If no desk is available, attendance can proceed without one. This supersedes the earlier proposal to block department edits while timed in.

## 4. Attendance arrangements and schedules

Admins and Super Admins assign Scheduled shift or Output-based. New access grants require an arrangement. Existing employees migrate as Arrangement not configured until an admin sets it.

| Arrangement                | Recording and classification                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Scheduled shift            | Record actual attendance; compare against the selected shift's approved schedule.                                             |
| Output-based               | Record Time In, Time Out and elapsed duration; show Output-based without schedule classifications or early Time Out warnings. |
| Arrangement not configured | Allow recording; show the missing arrangement and Needs review.                                                               |

All working schedules, classifications and report dates use Asia/Manila. A personal display-timezone preference must not change attendance rules.

Schedules support independent days and start/end times, including explicit next-day endings. Prevent overlapping shifts, including cross-midnight overlaps, and identify the conflicting days. Do not invent default employee hours from QA examples.

Scheduled employees select their scheduled shift at Time In, with the nearest shift suggested. Available scheduled dates are today and tomorrow, plus yesterday's overnight shift only while its scheduled interval remains in progress. Always use the current server timestamp for actual Time In; selecting a date never backdates attendance.

Recording remains available when a Scheduled shift employee has no configured hours or no applicable working day. Show Schedule not configured or Non-working day, flag Needs review, and do not invent Early/Late/Undertime/Overtime classifications.

Each Time In/Out pair is a separate session. Multiple sessions can reference the same scheduled shift and are classified independently. There are no break deductions; disconnected browser time is not a break calculation.

Arrangement changes take effect from the next session. Schedule changes apply from the next shift onward. Open sessions retain their original arrangement, approved schedule and policy; historical classifications do not change.

## 5. Schedule requests and notifications

Employees submit schedule changes from Profile. Their existing approved schedule remains active until approval. Keep one active request per employee; revisions replace its proposed values while retaining revision history.

Admins and Super Admins review requests in Office management → Employee access, with a pending-request badge:

- Approve: retain the decision audit and activate the new schedule for the next eligible shift; never change an open session.
- Reject: require a reason, visible to the employee in Profile.
- Direct admin schedule edit: no second approval required; audit it and apply from the next shift. Mark any pending request Superseded so it cannot overwrite the newer schedule.

Employees see Approved, Rejected or Superseded status in Profile and receive an in-app notification. All active office Admins and Super Admins receive in-app notifications on submission and revision. Notification delivery must not grant additional permissions.

## 6. Classification and Time Out confirmation

Use actual server timestamps and the selected shift's expected timestamps. There is no late grace period and no overtime minimum threshold.

| Comparison                              | Indicator                 |
| --------------------------------------- | ------------------------- |
| Time In before expected start           | Early                     |
| Time In exactly at expected start       | On Time                   |
| Time In after expected start            | Late                      |
| Manual Time Out before expected end     | Undertime                 |
| Manual Time Out exactly at expected end | On Time                   |
| Manual Time Out after expected end      | Overtime and Needs review |

Retain arrival and departure classifications independently. A session may show Late · Overtime. Indicators appear beside the employee's Timed In/Timed Out status and in the admin report.

Before a manual early Time Out, show a confirmation modal with the expected end date/time, Asia/Manila timezone, and the consequence that the session will be Undertime. Provide Keep working and Time Out actions plus an optional reason. Record the timestamp only when the employee confirms. Cancel does not create a Time Out. The reason is visible in the admin report and both exports.

Overtime flags do not block recording or change actual timestamps. Needs review is a flag only; overtime approval/rejection actions are outside this scope. This is separate from schedule-request approval.

Automatic 48-hour Time Outs and administrator-forced closures show Exception — Needs review and their closure reason, without normal departure Undertime/Overtime classification. Preserve the original arrival result where known. The existing 48-hour safety cap remains; its automatic cutoff must not be presented as an employee-confirmed action.

## 7. Attendance module and exports

Virtual Office → Directory includes a dedicated Attendance module and route. Active office Admins and Super Admins can view all office employees, including Output-based employees. Employees, revoked members and users holding only unrelated Plane permissions cannot access the route, report APIs, export data or downloads.

Report rows include employee identification, department/job Role snapshot, arrangement, shift date and expected boundaries where available, actual Time In/Out, arrival/departure indicators, review flag, closure reason, optional early Time Out reason, and elapsed duration. Open sessions show In progress. Duration is elapsed session time without break deductions and is not labeled verified productive work.

Date filtering uses shift start date for scheduled sessions. For Output-based sessions, use Time In date. Overnight shift rows remain on the scheduled start date, including their next-day Time Out. Unscheduled/missing-configuration sessions need an explicit Time In-date fallback in the implementation contract.

PDF and CSV include all rows matching report filters across pagination, using the same row definitions, ordering, classifications and report snapshot. Exports include optional reasons. Clearly identify date range, timezone and generation time. Preserve CSV formula protection, Unicode support and safe filenames. PDF tables must remain readable across page breaks.

Keep the existing raw-event CSV compatible; the new session report is a separate report contract.

## 8. Migration and historical data

- Preserve office department assignments and desk relationships. Map Quality Assurance → Quality & Systems; Business Department → Business, Sales & Marketing; Account Managers → Operations. Preserve Development, Project Management, Leadership and UI/UX. Inspect actual values first; unexpected names require review rather than guessed mapping.
- Derive department-specific role options from existing job positions, trimming outer whitespace and merging case-insensitive duplicates. Prefer OfficeMember.position, falling back to Profile.role. Preserve both source values in a restricted migration audit. Do not turn missing values into invented roles.
- Existing employees start with Arrangement not configured, recording enabled and a review flag. Do not infer arrangement from department.
- Historical attendance remains Legacy attendance with available timestamps and historical snapshots. Do not apply newly entered schedules or classifications retroactively. Pair historical events only where reliable; expose incomplete/unpaired history rather than inventing events.
- Use additive schema changes after the actual migration head. Never edit already-applied migrations to rename departments or change seed data.
- A rollback must preserve attendance, requests and historical evidence. Validate on an isolated database before any rollout. Production requires separate explicit approval and backup/rollback evidence.

## 9. Proposed technical design

These are implementation recommendations, not additional business decisions.

Backend/database:

- Keep permission role separate from the department-scoped job-role foreign key. Give departments stable identifiers and enforce the canonical labels.
- Store approved schedule versions and weekday entries, including explicit next-day offset, effective timing and timezone. Store schedule requests, revisions, reviewer decisions and required rejection reasons.
- Store pending employee assignment/arrangement changes separately from effective values. Apply changes transactionally at the next Time In flow and enforce the new department's role/desk eligibility.
- Introduce attendance sessions linked to original audit events. Snapshot employee details, arrangement, chosen shift, approved schedule version, policy version, classifications and reasons. Enforce at most one open session per member.
- Integrate session writes with existing manual, administrative and automatic closures in one transaction. Preserve idempotence and the exact 48-hour cutoff.
- Provide own-profile/setup APIs, schedule-request APIs, office admin APIs and a shared paginated report service. Validate authorization on every endpoint, independently of UI visibility.
- Use explicit field allowlists, CSRF protection for mutations, server-generated timestamps, bounded inputs and indexed report queries. General Profile currently inherits an authentication class that disables CSRF; resolve that deliberately for new mutations.
- Use one consistent report dataset for view/PDF/CSV. Do not hold the office-wide mutation lock during PDF generation. Keep attendance data private and uncached by shared caches.
- Reuse the existing notification infrastructure where suitable after inspecting its office-recipient support. Use deduplication/transactional delivery so retries do not duplicate request transitions or alerts.

Frontend:

- Extend Profile setup/read-only identity fields and the employee schedule-request editor.
- Extend Employee access with initial arrangement/schedule setup, effective/pending assignment display, request badges and review controls.
- Add Super Admin job-role catalog controls, attendance indicators, selected-shift confirmation and early Time Out dialog.
- Add the guarded Attendance route, shared report filters and export controls. Reuse existing React PDF support with a dedicated table document rather than the rich-text page exporter.

Primary owning files in the reviewed checkout:

- `apps/web/components/settings/profile/content/pages/general/form.tsx`
- `apps/web/store/user/profile.store.ts` and `apps/web/services/user.service.ts`
- `packages/types/src/current-user/profile.ts`
- `apps/web/components/virtual-office/{root,floor,admin-panel,presence-export}.tsx`
- `apps/web/services/virtual-office.service.ts` and `apps/web/app/routes/core.ts`
- `apps/api/plane/db/models/{user,virtual_office}.py`
- `apps/api/plane/app/views/user/base.py` and `apps/api/plane/app/serializers/user.py`
- `apps/api/plane/app/views/virtual_office.py` and `apps/api/plane/app/urls/virtual_office.py`
- `apps/api/plane/utils/office_attendance.py` and `apps/api/plane/bgtasks/office_attendance.py`

## 10. Revised original acceptance criteria and QA cases

Each row replaces or retains the original AC and its matching QA-AC case. These are planned validations, not completed tests. Additional acceptance cases follow in section 11.

| AC / QA-AC | Revised requirement and validation                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01         | Exactly the seven canonical departments appear in initial Profile setup and Employee access; names cannot be renamed through UI or API.                               |
| 02         | An initial department selection persists across refresh/sign-in; after office access, Profile is read-only and subsequent admin changes show pending/effective state. |
| 03         | Replace free text: job Role is a dropdown filtered by Department; arbitrary text and foreign-department role IDs are rejected.                                        |
| 04         | Selected job Role persists and matches Office management's Job position. Permission role is unaffected.                                                               |
| 05         | Revise unrestricted self-service: employees complete initial identity setup; after access, admins control identity and employee hour changes require approval.        |
| 06         | Select independent working days without selecting other days.                                                                                                         |
| 07         | Save and retrieve each selected day's start time.                                                                                                                     |
| 08         | Save and retrieve end time and explicit next-day setting.                                                                                                             |
| 09         | Different daily schedules persist; overlapping overnight/day schedules are rejected.                                                                                  |
| 10         | Approved schedules persist across sign-in. Pending edits do not replace approved hours until approval.                                                                |
| 11         | Manual, automatic and administrative sessions derive timestamps from existing office attendance events, not browser-supplied dates.                                   |
| 12         | Open Time In appears in the admin report with the original recorded timestamp.                                                                                        |
| 13         | Closed Time Out appears with its actual event timestamp and closure reason.                                                                                           |
| 14         | The employee's name and Timed In/Timed Out state are displayed correctly.                                                                                             |
| 15         | Classification uses the approved schedule snapshot for the employee-selected shift in Asia/Manila.                                                                    |
| 16         | Before-start Time In shows Early; exact start shows On Time.                                                                                                          |
| 17         | Any after-start Time In shows Late; no grace period. Test immediately before, at and after the boundary.                                                              |
| 18         | Before-end manual Time Out requires confirmation and shows Undertime; optional reason persists. Cancel creates no event.                                              |
| 19         | Any after-end manual Time Out shows Overtime; exact end shows On Time; no overtime threshold.                                                                         |
| 20         | Arrival and departure indicators remain visible beside attendance state, including combined Late · Overtime.                                                          |
| 21         | Overtime automatically sets Needs review without an overtime approval workflow.                                                                                       |
| 22         | Overtime recording retains the actual timestamps and succeeds regardless of the review flag.                                                                          |
| 23         | Directory exposes a dedicated Attendance module and route.                                                                                                            |
| 24         | Active Office Admin and Super Admin can access all office employees' reports.                                                                                         |
| 25         | Employees, revoked users and unrelated Plane admins are denied via navigation, direct route, report APIs and export endpoints.                                        |
| 26         | Report shows employee identification, actual timestamps, arrangement and elapsed duration; open sessions show In progress.                                            |
| 27         | Report shows applicable independent arrival/departure classifications and explicit configuration/exception/legacy states.                                             |
| 28         | A readable PDF includes all filtered rows, reasons and classifications with legible multi-page layout.                                                                |
| 29         | Valid UTF-8 CSV includes all filtered rows, reasons and classifications with formula-safe cells.                                                                      |
| 30         | View, PDF and CSV use the same report snapshot, filters, ordering and data, including rows beyond the displayed page.                                                 |

## 11. Additional acceptance and QA cases

| ID     | Requirement and validation                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXT-01 | Invitation alone grants no office access; an active account is selectable in Employee access. Admin can complete missing identity fields and configure access.  |
| EXT-02 | New grants require arrangement and, for Scheduled shift, initial valid hours; API rejects incomplete grants.                                                    |
| EXT-03 | Output-based records are included in reports/exports without schedule indicators or early Time Out dialog.                                                      |
| EXT-04 | Missing arrangement, missing schedule and non-working-day attendance remain recordable with the correct review state.                                           |
| EXT-05 | Only Super Admin manages role catalog; archive blocks new selection, preserves assignments, and rename preserves historical labels.                             |
| EXT-06 | Admin identity and arrangement changes do not affect open sessions and take effect at the next Time In; employee notification describes the pending change.     |
| EXT-07 | Department transition releases old reservation, requires eligible desk selection when available, and records no attendance on a canceled Time In flow.          |
| EXT-08 | No desk available permits Time In; later claim preserves original Time In and exclusivity under concurrent claims.                                              |
| EXT-09 | Overnight shift belongs to start date. Picker suggests nearest shift and restricts selectable dates; actual timestamps cannot be backdated.                     |
| EXT-10 | Repeated sessions for the same shift are independently classified with no break deductions. Duplicate open Time In remains denied.                              |
| EXT-11 | Employee request submission/revision retains approved schedule and revision history, with one pending request.                                                  |
| EXT-12 | Admin approval applies prospectively; rejection requires a reason visible to employee; direct admin edit supersedes pending requests.                           |
| EXT-13 | Concurrent revision/approval cannot approve an unseen revision; requests have version checks and immutable decision history.                                    |
| EXT-14 | Employee notifications and all-active-office-admin notifications reach only authorized recipients; retries do not duplicate state changes.                      |
| EXT-15 | Automatic/admin closures show exception and reason without ordinary departure classification; 48-hour cutoff is exact and idempotent.                           |
| EXT-16 | Migration preserves mapped department IDs/relationships, creates deduplicated role options, records source conflicts, and leaves arrangement unassigned.        |
| EXT-17 | Legacy incomplete history is visible without invented pairing or retrospective classifications; snapshots survive role/name edits and account lifecycle events. |
| EXT-18 | Existing office reservations, presence leases, heartbeat recovery, revocation, CSRF and permission boundaries retain their regression behavior.                 |

## 12. Phased implementation and validation

1. Review this specification, resolve section 13, and reconcile the issue's revised requirements and QA cases. Do not silently treat original free-text/self-service cases as unchanged.
2. Implement additive department/job-role identity and Employee access setup, including pending changes. Test ownership, role-catalog authorization, migration mapping, incomplete setup and department/desk transitions.
3. Implement arrangement, approved schedule versions, requests, decisions and notifications. Test overlapping intervals, prospective timing, revision conflicts, supersession, rejection reasons and recipient permissions.
4. Implement transactional attendance sessions and classification functions. Test boundary instants, overnight attribution, selected shifts, repeated sessions, no schedule, deskless attendance, concurrency and closure reasons. Freeze time in tests rather than waiting for real shifts.
5. Implement personal indicators, early Time Out confirmation and admin Attendance. Add component tests for cancellation/reasons, state persistence, route guards, filters and empty/error/loading states. Verify accessibility and narrow screens manually.
6. Implement report snapshots and PDF/CSV. Compare structured values across all three representations, exercise multi-page datasets, special characters and formula injection, and visually inspect rendered PDFs.
7. Run focused Vitest/Testing Library checks, backend unit/contract tests in the isolated Docker test stack, web type/lint checks and required React diagnostics. Run the existing `plane/tests/contract/app/test_virtual_office.py` regression suite. Validate migrations on synthetic/isolated data and carry out all revised QA cases in development. Production rollout remains a separate approval decision.

## 13. Remaining review points

The main business rules are settled. These edge cases must be explicit in implementation contracts; the following are proposals, not already confirmed decisions:

- Same-shift re-entry after a schedule edit: preserve a shift's previously established schedule version rather than interpreting next shift as simply next session.
- Archived job Role during a pending assignment: retain an existing assignment, but require a currently selectable role for a newly proposed assignment.
- Suggestion ties and tomorrow's shift: define deterministic nearest-shift ordering and show expected date/time prominently so tomorrow is not selected accidentally. No early-arrival window was agreed.
- Multiple pending identity edits and revocation: latest edit should replace pending values with audit history; decide whether revocation preserves the setup lock on Profile.
- Unscheduled/legacy report-date fallback: use actual Time In date, and keep unpaired legacy Time Out events accessible without fabricated Time In.
- Timestamp precision: define comparison precision consistently. Proposed rule is exact stored server instants against minute-defined schedule boundaries; do not silently round attendance to the minute.
- Exceptions: this specification retains known arrival classification but replaces departure classification for forced closures; confirm if the entire session should instead show only the exception.
- Report snapshot lifetime, default date range, maximum export size and notification retention need technical limits after inspecting existing infrastructure.

## 14. Review baseline

Repository: `C:\Users\ASUS\Documents\GitHub\plane`.

Branch reviewed: `feat/PBS-7-structured-updates`; HEAD `6364ec2b9b`.

Pre-existing working-tree entries: modified `apps/live/package.json`, `packages/decorators/package.json`, `packages/logger/package.json`; untracked `artifacts/` and `output/`. Git also reported a permission warning for `apps/api/.pytest_cache/`. Existing changes were not overwritten. This document describes reviewed local source, not verified live production behavior.

The initial review added only this specification. Phase 1 subsequently received explicit implementation authorization; see `pbs-9-phase-1.md` for the implementation scope and validation limits. No issue edits or production actions have been authorized.
