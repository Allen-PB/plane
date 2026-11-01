# PBS-9 phase 5: release validation

Status: dev acceptance passed for application revision `2a6ac6e80ce2901d6f7f58f694aa2cb3e273775b`. The subsequent authorized production rollout and final verification are recorded in [phase 6](pbs-9-phase-6.md). Earlier specification documents retain their initial review-stage authorization language.

## Automated and rehearsal evidence

- Backend: 103 tests passed on isolated PostgreSQL, including existing Virtual Office regressions, schedule requests/decisions, attendance sessions, report/export permissions, lifecycle handling and concurrency checks. Migration/model consistency passed.
- Integration regression: the combined PBS-9 and structured-updates backend run passed all 223 tests. The isolated runner supplies standard synthetic app URL/storage settings, independent of deployment secrets.
- Frontend: the final Linux image passed all 88 Virtual Office and structured-updates tests across 18 files, strict type checking, the production build and all 28 English locale namespace checks. Virtual Office contributes 64 tests across 17 files. Focused lint passed.
- React Doctor: current scanner installed in an ignored, isolated tooling directory. The regression scan passed with zero errors. Telemetry and external scoring were disabled; no numeric score is claimed. Application dependencies and lockfiles were not changed for the scanner.
- Restored-dev rehearsal: existing table counts and core data hashes were preserved; every Time In/Out audit was represented; no retrospective schedule classifications were added. Reconciliation was idempotent.
- Rollback/roll-forward rehearsal: the prior phase image recorded an open and a closed session against the additive schema. The current importer recovered both exactly once, retaining audit links and actual timestamps.
- PDF: a synthetic full-column export contained all 53 sessions, accented names and long reasons, with repeated metadata and complete records kept together. Extracted text and rendered pages were inspected. Private artifacts contain the detailed evidence.

## Acceptance and QA mapping

The table maps the original 30 acceptance/QA positions to the approved revised expectations. Free-text roles and unrestricted self-service from the original issue are superseded by the user's dropdown and approval decisions.

| ID | Approved expectation | Evidence |
| --- | --- | --- |
| 01 | Profile exposes Department setup | Identity API and component tests |
| 02 | Seven canonical departments, preserving identifiers | Migration tests and restored-data checks |
| 03 | Department-filtered job-role dropdown | Identity field/catalog tests |
| 04 | Reject free-text and cross-department role assignments | Identity contract tests |
| 05 | Initial self-service; identity locked after an office grant | Identity and existing-office regressions |
| 06 | Independent working weekdays | Schedule validation/components; live multi-day smoke gate |
| 07 | Per-day start times persist | Schedule request/approval tests; live persistence gate |
| 08 | End times and explicit next-day settings persist | Schedule and overnight-session tests |
| 09 | Different daily hours; overlapping intervals rejected | Weekly/Sunday-boundary overlap tests; live multi-day gate |
| 10 | Approved hours persist; pending edits remain separate | Revision, approval, supersession and stale-editor tests |
| 11 | Actual server timestamps; no client backdating | Attendance boundary and audit tests |
| 12 | Open Time In appears in reports | Open-duration snapshot tests |
| 13 | Actual Time Out and closure cause appear | Manual/automatic/administrator closure tests |
| 14 | Employee identity and attendance state display correctly | Floor/control tests; dev browser gate |
| 15 | Selected shift and frozen policy use Asia/Manila | Session, same-shift re-entry and date-format tests |
| 16 | Before/exact-start arrival is Early/On Time | Frozen-clock boundary tests |
| 17 | Any after-start arrival is Late | No-grace boundary tests |
| 18 | Early exit requires confirmation; cancellation makes no event | API confirmation and dialog tests |
| 19 | Exact-end is On Time; any later manual exit is Overtime | Departure boundary tests |
| 20 | Independent arrival/departure results are retained | Late plus On Time/Overtime cases and control rendering |
| 21 | Overtime automatically needs review | Session classification tests |
| 22 | Overtime preserves actual timestamps and is not blocked | Successful after-end Time Out tests |
| 23 | Dedicated Directory → Attendance route | Route configuration, guard tests; dev browser gate |
| 24 | Both active office administrator roles can report | API authorization and route tests |
| 25 | Employees, revoked accounts and unrelated Plane admins are denied | Direct-route, API, ownership and download-denial tests |
| 26 | Identification, actual times and elapsed duration are reported | Report contracts and snapshot tests |
| 27 | Missing configuration, exceptions and legacy records are explicit | Configuration, cap, deactivation and importer tests |
| 28 | Readable PDF includes every filtered session and reason | Real renderer, text extraction and visual review |
| 29 | UTF-8 CSV includes all rows and protects spreadsheet formulas | CSV parsing, multiline and formula-injection cases |
| 30 | Screen/PDF/CSV share the same frozen dataset across pages | 53-row pagination/export tests and immutable snapshot tests |

Additional cases cover output-based work, invite-first access, no-desk attendance, pending department transitions, role-catalog permissions, notifications, unseen request revisions, repeated schedule edits, account deactivation, last active Super Admin protection and the exact 48-hour cap.

## Validation hardening

An approved schedule cannot redefine a calendar shift that has already begun, including before an employee's first Time In. Repeated edits do not pull a queued policy forward. A schedule decision clears the previous employee editor, and version-aware admin saves reject stale hours; revocation remains available despite a stale policy version.

Account deactivation closes attendance and releases the desk in the same transaction while retaining history. Existing deactivation for accounts without office membership is preserved. The last active Office Super Admin is protected across office-role changes and account deactivation; inactive accounts do not count as alternate administrators.

CSV filenames identify the range, generation time and Manila timezone even for empty reports. Report filter identifiers retain their declared API types. Personal, audit, report and PDF timestamps use the office timezone consistently.

## React diagnostic triage

The remaining non-blocking warnings were inspected without suppressing rules:

- Form/control complexity and component-file helper exports are maintainability suggestions; no behavior change is required for this release.
- The PDF eager-load warning is a false positive: the entire PDF module is dynamically imported only after the user requests an export.
- The catalog's initial department state is intentional user selection. The department catalog has fixed stable identifiers; a catalog refresh should not replace the user's selection.

The render-time ref mutation and repeated Intl formatter construction were corrected. Unchanged general-profile warnings are outside this feature's changed-code regression results.

## Remaining release gates

The final Linux build and real dev session/CSRF smoke passed. The smoke exercised invite-first access, identity locking, multi-day and overnight schedules, revised approvals, stale-editor rejection, persistence across sign-in, early exit confirmation, prospective identity changes, output-based attendance, frozen report/CSV parity and employee download denial. Every synthetic write was rolled back.

Chrome desktop and 390-pixel responsive report checks passed. The report remained within the viewport with an independently scrollable results table. Native date editing generated the requested historical range. Actual CSV and PDF downloads both contained all 22 displayed sessions; the PDF included the final record. The 53-row automated fixture separately verifies pagination and full exports. Browser evidence and downloaded employee data remain private.

Production still needs a fresh private backup, isolated restore/migration verification, image/configuration rollback references and post-deployment health/auth/report checks. Never reverse the additive migrations or restore over newer attendance writes as an ordinary image rollback.

Frontend builds must use their target environment's public origins. Dev images contain localhost links and are not suitable for direct production web promotion. Backend images must not contain application environment files; deployment secrets remain runtime configuration.
