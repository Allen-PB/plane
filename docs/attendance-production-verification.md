# Attendance production release

Release: `attendance-48h-20261021-01` (2026-10-21, Asia/Manila).

Deployment completed successfully. The public API and office page returned 200. Live API regression checks passed, the production worker registered the attendance task, and the minute schedule is enabled. No attendance was left open beyond the 48-hour cutoff at verification. Web, API, worker, and beat are running the release. Temporary staging containers were removed.

Expanded automated verification passed: **70 backend tests** across Virtual Office and Workflow, plus **33 UI tests** across all Virtual Office and Workflow test files. Web TypeScript passed. Backend and frontend lint and the Linux frontend build/locale guard passed. This is a targeted regression suite, not an exhaustive test of the entire application.

Coverage includes the 48-hour boundary, recent and inactive members, missing heartbeats, heartbeat recovery, duplicate Time In prevention, repeated Time Out, delayed expiry with exact cutoff timestamps, retry after database failure, administrator closures with historical snapshots, CSV date boundaries and automatic reason, authorization/CSRF, simultaneous Time In, simultaneous expiry, and manual/automatic Time Out races. Existing Workflow application, estimates, cache invalidation, and permissions tests also passed.

Production images are built from `presence-dates-20261021-01`, overlaying only attendance code and additive task registration. The frontend is the exact tested dev client archive, SHA256 `d7ab5613e01606387ef7df05601a254c630f53eca032048bf5c8573aa84f9526`. No schema migration is required. Existing open sessions beyond 48 hours are closed at their stored Time In plus 48 hours and labeled `Automatic—48 hr limit` in the appended CSV reason column.

Before cutover, the production database backup was restored on an isolated network. Attendance and existing API checks passed in a rolled-back transaction, and all table counts were preserved. Task configuration and 31 frontend entry assets passed staging verification. An initial staging harness error caused by closing a test response inside its transaction was corrected; the full stage rerun passed without application changes.

Release scripts and server-side logs: `/opt/plane-selfhost/releases/attendance-48h-20261021-01`. Database and prior configuration backup: `/opt/plane-selfhost/backups/attendance-48h-20261021-01`. Previous images retained for rollback. Raw server logs were not copied locally.
