# PBS-9 phase 2: working schedules and approvals

Adds administrator-assigned Scheduled shift / Output-based arrangements, per-weekday hours with explicit overnight shifts, immutable policy versions, employee schedule requests with revision history, and administrator approval/rejection notifications. New grants require an arrangement; existing members remain unconfigured until an administrator assigns one.

The API serializes mutations using the existing office lock. Requests require the revision actually reviewed, rejection requires a reason, and direct schedule changes supersede pending requests. Weekly overlap validation includes Sunday/Monday. Open attendance and historical schedule classification are implemented in the following phase.

Validation at this checkpoint: 73 backend tests passed on isolated PostgreSQL; 46 existing Virtual Office UI tests and three new schedule-form tests passed; new backend and schedule-component lint passed. Full Linux build, migration rehearsal and dev browser validation remain release gates.

Follow-up validation: the TypeScript compatibility correction is checkpointed separately. Linux UI tests (49), type checking, web build and locale-bundle checks passed. Migration 0132 passed a restored-dev rehearsal with existing row counts preserved. The phase is deployed to dev; health/system/migration checks passed and the schedule controls were verified in the browser.

Migration 0132 is additive. Roll back application images while retaining its tables and recorded requests; do not reverse migrations or restore a database over newer employee writes. Deployment backups and image references are kept in private operational records.
