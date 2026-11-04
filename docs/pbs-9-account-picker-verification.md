# PBS-9 account picker and personal notifications

Verified in dev on 2 November 2026, Asia/Manila. This continues the PBS-9 UI requests initially entered in the PBS-11 chat. That chat stopped before this checkout took over; its uncommitted files were copied selectively from the shared base `6ab1f20ea5`.

## Changes

- Replace the native Sync account list and separate search field with the shared Propel searchable combobox. Its popup follows the field width, stays inside the viewport and uses the shared bounded list surface.
- Retain previous account results while server searches load, preserving the selected employee and unsaved editor values.
- Label personal notices **Your account updates** and show their creation time in Asia/Manila. Employee-save feedback identifies the affected account. The backend already addresses notices to the affected employee; recipient permissions were not changed.
- Extend the UI guidelines with account selection and personal-notification patterns.

## Verification

- Candidate application source: `23eff7fafe5390eda4de98e1eed7344253762314`.
- Frontend regressions: **123 tests passed across 22 files**, covering Virtual Office, Structured Updates and Bulk Archive. Includes real PDF rendering, schedules, authorization guards, keyboard selection, empty results, disabled selection, and employee-specific save feedback.
- React Router generation, full web TypeScript checking, production frontend build and all **28 English locale namespaces** passed in the dev-image build.
- Formatting and focused OxLint passed with zero warnings/errors. The local pnpm invocation stalled, including the pre-commit hook; the hook's formatter/linter were run directly on the staged files before committing with that invocation skipped.
- React Doctor's ordinary diff/staged scan could not detect React in its temporary monorepo baseline. Separate scans of the changed production components and their baseline reported the same **12 existing warnings**, with no added warnings or errors after keeping the search element stable. No numeric health score is claimed.
- Initial focused tests needed to wait for popup focus before keyboard input. A broader run also caught the jsdom animation shim being used in the Node PDF environment; the final shim is guarded and the full corrected run passed.
- Chrome desktop (1536px) and mobile (390px): popup follows the field, email search filters to the expected account, keyboard selection loads its department/job role, Escape closes the popup, empty results retain selection and unsaved arrangement. Mobile popup width was 311px, its height 288px, and document width equaled the 390px viewport. The temporary viewport override was reset.
- Personal notices display the new heading and Manila timestamps. Existing unread notices were preserved. Save feedback, pending/disabled behavior and failure paths were checked by automated tests; no live employee save was performed for browser verification.
- Normal dev employee sign-in was verified separately from the admin session. Employee navigation omits management and Attendance-report links. No Time In/Out was performed in this continuation.

## Dev checkpoint and rollback

Dev web image: `pathbuilder-dev-web:pbs9-account-picker-20261102-02`, built from the exact previous `pbs9-notices-20261102-02` image. All 11 overlaid source/test files were hash-verified. The two PBS-11 Bulk Archive application files were byte-identical to that base.

The release directory `/opt/pathbuilder-dev/releases/pbs9-account-picker-20261102-02/` retains the source payload, build log, verified markers and the pre-deployment Compose configuration. Deployment required the expected running image, changed only the web image, and verified HTTP readiness; its error trap restores the saved Compose configuration. The API, workers, database, office configuration and other runtime services were not changed by this rollout. There was no schema migration.

Rollback is a web-only return to the saved Compose configuration and previous image after checking for any intervening deployment. Do not overwrite a newer release's configuration. Keep the earlier image and this checkpoint until review is complete.

Build logs and browser screenshots are private local artifacts under `artifacts/pbs9-account-picker-20261102-02/`; credentials and employee screenshots are excluded from Git and PR attachments. Production was not modified by this continuation.
