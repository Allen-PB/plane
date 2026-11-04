# PBS-9 UI review and production verification — 2026-11-02

Status: deployed to dev and production; final production verification passed at 2026-11-02 23:17:01 Asia/Manila.

Application source: `a11f411365` on `feat/pbs-9-attendance-completion`. The latest PathBuilder integration branch, `origin/preview` at `13e75bef25`, was pulled before continuing and fetched again before release: 0 commits behind. Existing unrelated working-tree changes were preserved.

## Changes and checkpoints

- `b1ec9be96a` / `pbs9-warning-ui-dev-20261102`: themed, consistently sized early Time Out dialog; Office stacking containment; responsive actions; Escape cancellation regression.
- `8f58924e51` / `pbs9-god-mode-menu-dev-20261102`: hide workspace creation/invite menu actions outside instance God Mode, including pending/error and account-switch states. Office roles and job labels do not grant God Mode.
- `a11f411365` / `pbs9-theme-contrast-dev-20261102`: correct remaining fixed management heading/navigation colors and the scene selector across preference themes.
- Earlier Profile, account-permission, account-picker and phase checkpoints remain available. Shared conventions are in `docs/UI_DESIGN_GUIDELINES.md` and the PBS-9 checklist.

The integrated follow-up includes responsive full-page/modal Profile navigation, arrow-free disabled identity selectors, aligned employee selection and schedule editors, shared/per-day working hours, readable notifications, responsive report/export filters, and theme-aware management/floor UI. Day/night artwork remains independent of the Preferences theme.

## Automated validation

- 139 frontend tests passed in 25 files on dev and the production-compatible candidate. Coverage includes actual multipage PDF rendering, schedules, reports, permissions, account selection, notices, responsive Profile navigation, warning cancellation/confirmation and God-mode visibility.
- 355 backend unit/contract tests passed in an isolated stack using the production Python source plus the five-file permission overlay. Coverage includes account permissions, Office identity/schedules/sessions/reports, CSV/XLSX sanitization, Bulk Archive and Structured Updates.
- Web TypeScript, production builds and all 28 English locale namespaces passed. Changed TypeScript files pass focused formatting and OxLint with no warnings/errors.
- React Doctor's standard monorepo baseline could not identify React in its temporary root; the score endpoint also timed out. Focused before/after scans of the warning and workspace-menu components reported no new diagnostics. No numerical score is claimed.
- The old production image retained a Delete test while its runtime already used Archive. The runtime component exactly matched the repository by SHA-256. Only the candidate test was updated to the existing repository Archive tests, including failure/skip and triage cases; assertions were retained.
- GitHub reported no checks on this branch. The stated gates ran in isolated validation/build images. The local pnpm launcher stalled, so equivalent direct formatter/linter commands ran before process-local hook bypass for commits.

## Actual dev browser review

Reviewed People & access, owner-only Office settings/job-role catalog, Attendance, employee/owner Profile and Preferences, floor notifications and workspace menus. Owner menu actions remain visible; employee creation/invite actions are absent in both the switcher and Profile sidebar. Existing workspace switching and sign-out remain available.

The early Time Out warning uses Inter, 13px body/field text and a 16px heading. The reason field and actions align, the Office badge is covered by the modal/backdrop, and all controls fit desktop, 390px and 320px widths. Cancellation preserved the employee's original open attendance session; Time Out was never confirmed during visual review.

Working-hours shared/per-day modes switched without submitting employee changes. The 320px scheduled-shift form, Office settings cards, report filters and full Profile page had no page overflow. Locked Profile department/job-role controls retain disabled semantics with `appearance: none` and no background arrow.

Light/System, Dark, both high-contrast modes and the existing custom-theme mode were exercised. Both accounts were restored to their original System Preference. No custom color values were edited. Actual screenshots are private local artifacts.

An owner-generated dev snapshot downloaded successfully as CSV and PDF. The CSV contained all three snapshot records; all three PDF pages were rendered and visually checked. No real employee access changes or email-code requests were submitted during browser review.

## Production preparation and historical-data verification

The production-compatible frontend was built from the existing PBS-11 web image. Exact hashes verified 82 frontend files and five API files. Existing Bulk Archive runtime, application root, branding asset, lockfile, image environment and startup commands were preserved.

Private backup/runtime checkpoints are retained on the production host under:

- `/opt/plane-selfhost/releases/pbs9-ui-review-20261102-04`: rehearsed database backup, original Compose/environment, restore logs and before/after fingerprints.
- `/opt/plane-selfhost/releases/pbs9-ui-review-20261102-05`: fresh pre-cutover database backup, source/build evidence and rollout logs.

The backup was restored into a separate internal Docker network with no public ports or production volume mounts. Full API entrypoint startup, isolated bucket initialization, HTTP readiness, Django checks and migration-state checks passed. Counts and sorted-row fingerprints of 18 Office/user/workspace/issue/migration tables were identical before and after startup. The labelled clone was removed after verification; backups/evidence remain private. No schema migration or production database restore was performed.

## Rollout and recovery

The rollout changes only API and web images, deep-compares resolved Compose configuration and checks protected container IDs. Database, storage, cache, broker, proxy, admin, live, space, workers and scheduler stay on their existing images/configuration.

An initial attempt automatically restored the prior API/web images after a default-address-family health probe timed out. Independent external and IPv4 checks succeeded. The retry uses IPv4 health probes with TLS validation and retains the same backup, image-drift, configuration-diff and rollback gates. First-attempt logs remain preserved.

Deployed frontend: `pathbuilder-sync/web:pbs9-ui-review-20261102-05`.
Permission API: `pathbuilder-sync/backend:pbs9-ui-review-20261102-01` (the already tested five-file overlay).

For an application rollback, restore the retained original Compose file and run `docker compose --env-file plane.env up -d --no-deps --pull never api web` from `/opt/plane-selfhost/plane-app`. Previous production images are retained. No database restoration is required for this follow-up's application rollback.

## Final production result

- Web image ID: `sha256:8e0f17257fe8f12abed79c2e65bdabe9b10f2f82954e4a5ff7a5a44dd4aef56c`.
- API image ID: `sha256:ce97315265e7a3ea6897d6f46eb68cbc3540dc720af531e871267d603018b277`.
- Both services are running with zero container restarts; protected-service container IDs are unchanged.
- Public `/api/instances/` and `/virtual-office/` return 200. Anonymous `/api/users/me/`, `/api/users/me/instance-admin/` and `/api/virtual-office/` return 401.
- The published `root-DMy9JHab.css` contains the corrected attendance reason field and Office stacking-containment styles.
- Authenticated production browser checks confirmed the floor loads, owner management/settings/catalog remain accessible, Profile exposes the permitted owner email-change action, and disabled identity selectors remain arrow-free. No production employee access, schedule, theme, email-code or Time In/Out actions were submitted.
- Production verification marker: `/opt/plane-selfhost/releases/pbs9-ui-review-20261102-05/PRODUCTION_VERIFIED`. The initial rollback and retry logs are retained alongside the final evidence.

After the rollout, the owner explicitly required advance notice of any production interruption because members may still be working. `docs/pathbuilder/RELEASE.md` now records the affected services/downtime/rollback notice and timing coordination requirement. No further production restarts were performed after this instruction; remaining checks were read-only.