# Bulk Update dev verification

Verified on 2026-10-26, Asia/Manila.

## Deployed scope

- Workspace settings → Administration → Bulk Update, directly below CSV Import.
- Workspace Admin access, with an empty initial project selection.
- State, Priority, Assignees, Labels, Start Date, Due Date, Cycle, Modules, and Parent updates.
- Per-work-item destination projects, reviewed operations, and a separate delete confirmation modal.
- Visible bulk update and move entries in work-item history.
- Existing source files were patched only at URL registration, workspace navigation, and activity rendering. The release was layered on the previously running dev images. Unrelated pending local changes were excluded.

## Evidence

- All 159 selected backend tests passed in isolated PostgreSQL, Redis, RabbitMQ, and MinIO services. Coverage includes Bulk Update, CSV Import, workflows, project/workspace APIs, cycles, modules, parent relationships, and permission/security regressions.
- All 67 web component tests passed, including sidebar ordering and Member restrictions, all nine update fields, clearing values, invalid dates, parent selection, delete cancellation, and history rendering.
- TypeScript and targeted lint passed.
- The release web build passed. All 28 English translation namespaces were verified in the bundle.
- Django's deployed system check reported no issues.
- Isolated and post-deployment transactional smoke checks passed: explicit project selection, normal work-item API reads after multi-field changes and clearing, unchanged unselected work items, Member denial, different move destinations, and preview/signed deletion behavior. Disposable records were rolled back.
- Dev returned HTTP 200 for the web app and HTTP 401 for an anonymous request to the Bulk Update API.
- The browser opened the actual dev site successfully and reached sign-in. A signed-in browser walkthrough remains for manual review. Port 3000 is a separate sample-data layout preview.

Database integration exposed and fixed PostgreSQL row locking across a nullable join; only the issue row is now locked. Move verification also checks that completion dates, comments, attachments, assignments, and historical identifier allocations survive a move. Existing API test failures caused by the initial test stack's missing application URL were resolved in the test configuration; the final suite has no failures.

## Release and rollback

- Verified host: `dev-plane-sync-sgp1`.
- Release directory: `/opt/pathbuilder-dev/releases/bulk-update-20261026-01`.
- Backend/API/worker/beat image: `pathbuilder-dev-backend:bulk-update-20261026-01`.
- Web image: `pathbuilder-dev-web:bulk-update-20261026-01`.
- Previous compose configuration: `compose.before.yaml` in the release directory.
- Protected pre-release database backup: `db-before.sql.gz` in the release directory.
- Logs: `backend-tests.log`, `web-build.log`, `isolated-smoke.log`, `dev-system-check.log`, `dev-smoke.log`, and `rollout.log`.
- Rollout readiness/system/smoke checks were configured to restore the previous compose images on failure. The successful rollout did not require rollback.

No schema migration was introduced or run. Database, Redis, storage, proxy, admin, space, and live service versions were retained. Production was not accessed or modified by the release operations. The temporary isolated test stack was removed after verification.

Dev review URL: http://localhost:8080/pathbuilder/settings/bulk-update/ while the SSH tunnel is running.

## Coverage follow-up (2026-10-26)

Added 22 backend and 1 web test for previously untested paths: every move incompatibility (missing or ambiguous state, label, cycle, module, estimate value, work item type, ineligible assignee, missing state, same project, missing destination) blocking the whole batch with its specific error; unavailable update choices (foreign state, non-member/Guest/inactive assignees, completed or archived cycles, archived modules, empty changes); workspace labels; re-applying current assignments under the soft-delete constraints; update, move and delete history rows; deleting a parent with its children and scheduling cleanup after commit; estimate mapping, asset URL rewrites, cleared editor state and next-key allocation on move; expired, forged, altered and other-user review tokens; search, query validation and assignable metadata; project membership, archived projects, archived and draft work items, and other workspaces; and web search, select-page and cross-page selection.

- Isolated suite in `/opt/pathbuilder-dev/releases/bulk-update-20261026-02`: 181 passed (`backend-tests.log`), including all 56 Bulk Update tests. The temporary stack was removed.
- Web: 21 Bulk Update, routing and sidebar tests passed.
- No defects were found and no application code changed. The 13 deployed source files were verified identical to the tested source, so the `bulk-update-20261026-01` images were kept and no rollout was needed.
- The transactional smoke test passed again against live dev and rolled back (`dev-smoke.log`). Dev web 200, Bulk Update page 200, anonymous API 401.

## Route access fix (bulk-update-20261026-03)

The `-01` web image was built without the Admin-only `/settings/bulk-update` entry in `WORKSPACE_SETTINGS_ACCESS` (`packages/constants/src/settings/workspace.ts` was not in the release manifest), so the Workspace Settings route guard blocked everyone, Admins included, even though the sidebar showed the link. The file comparison above only covered manifest files and missed it.

- Web image `pathbuilder-dev-web:bulk-update-20261026-03`, layered on `-01` with only that one-line constants change. The build verified the entry and all 28 English namespaces in the compiled bundle.
- Rollout replaced only the web service. Previous compose and a database backup are in `/opt/pathbuilder-dev/releases/bulk-update-20261026-03`. Post-rollout checks: web 200, Bulk Update page 200, anonymous API 401, and the served bundle contains the access entry. No rollback was needed.
- Backend, worker and beat remain on `bulk-update-20261026-01`. No migration ran.

## Jira-style work item filters (bulk-update-20261027-04)

Deployed on 2026-10-27, Asia/Manila. Choose Work Items now filters by State, Priority, Assignee (including Unassigned), Label (including No labels), Parent (including No parent), and Start/Due Date ranges, alongside search. The table adds Labels, Start Date, Due Date, and Parent.

- Backend image `pathbuilder-dev-backend:bulk-update-20261027-04` (only the Bulk Update view changed) and web image `pathbuilder-dev-web:bulk-update-20261027-04`, layered on `-03` so the route access fix is kept.
- Isolated suite: 182 passed, including 57 Bulk Update tests. Web: 22 tests, TypeScript, and lint passed. The build verified the filters, route access entry, and all 28 English namespaces in the bundle.
- The first rollout attempt was rolled back automatically because the new filter smoke script was missing the dev host header (Django returned 400 before reaching the view). Its logs are in `attempt-1/`. The script was fixed and the second attempt passed: web 200, Bulk Update page 200, anonymous API 401, Django system check clean, and both transactional smoke scripts passed and rolled back.
- Previous compose and a database backup are in `/opt/pathbuilder-dev/releases/bulk-update-20261027-04`. No migration ran. Production was not changed.

## List-style filter dropdowns (bulk-update-20261027-05)

Filter dropdowns now show a search box and one full-width row per option, with a divider after Unassigned, No labels, or No parent, a hover state, and highlighted checked rows. Chips are highlighted while their dropdown is open and while they have selections. This was a web-only release (`pathbuilder-dev-web:bulk-update-20261027-05`). Backend stays on `-04`. Web tests (22), lint, and TypeScript passed. After rollout: web 200, Bulk Update page 200, anonymous API 401, and the new styles were served. Backups are in `/opt/pathbuilder-dev/releases/bulk-update-20261027-05`.

## Below-chip filter dropdowns (bulk-update-20261027-06)

Filter dropdowns stay anchored below and left-aligned to the chip that opened them (`collisionAvoidance` side `none`, align `shift`) instead of flipping above and covering the filter row. The search box stays fixed, and the option list scrolls within the available height. This was a web-only release (`pathbuilder-dev-web:bulk-update-20261027-06`). Backend stays on `-04`. Lint, TypeScript, and the Bulk Update component tests passed. After rollout: web 200, Bulk Update page 200, anonymous API 401, and the new positioning was served. Backups are in `/opt/pathbuilder-dev/releases/bulk-update-20261027-06`.
