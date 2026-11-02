# Profile account permissions verification

Initially implemented on `fix/pbs-9-profile-account-permissions`, based on `9c1b257e81bec90dbc9228058cd5464d3b6d519b`, in a separate managed worktree. After the user requested handoff, its scoped changes were integrated into `feat/pbs-9-attendance-completion`. The source worktree remains intact. Forgotten-Time-In requests remain on hold.

## Behavior

- Employee-facing help refers to an office administrator rather than exposing the Super Admin title. Internal role names and authorization remain intact.
- Profile controls inherit Inter, use consistent 13px input text, and have scoped heading, label, spacing, border and keyboard-focus styles. Identity labels and controls are grouped for narrow layouts.
- The user endpoint exposes `can_change_email`. Only an active Office Super Admin with an active account can use the existing self-service email-change flow. Employees, ordinary admins and accounts without Office membership cannot generate a code or apply an email change, including with a previously valid code. General profile PATCH keeps email read-only.
- Ordinary admins cannot select protected accounts for editing. Existing member-update authorization is preserved, and schedule approval/rejection now also protects Super Admin accounts.

## Verification

- 82 backend contract tests passed on synthetic data in a uniquely named private PostgreSQL/Redis stack. This includes a successful owner email change, valid-code bypass denial, owner revocation and ordinary-admin attempts to change an owner's fields, access and schedule.
- 33 frontend tests passed across six files, covering account selection, Profile identity, schedule editing, email-action visibility, revocation and existing Office behavior.
- The types package build and full web TypeScript checks passed, including a final check after input-sizing changes. Ruff and whitespace checks passed. OxLint reported no errors; the existing profile-avatar click/role warnings remain unchanged.
- The installed React Doctor was attempted. Its monorepo baseline could not detect the React dependency, and its score API was unreachable, so no score or successful comparison is claimed.
- A compiled synthetic browser fixture rendered the actual changed Profile identity/schedule components and shared input controls at desktop, 390px mobile and 320px narrow widths. Visible fields fit without horizontal page overflow, labels stayed above controls, keyboard focus was visible, and controls used Inter with 13px text. Empty required fields correctly disabled saving; long department/job-role names remained inside the fields at mobile width. No settings or attendance were submitted. This fixture is not a live-account end-to-end walkthrough.

The initial isolated test containers, anonymous volumes and internal network were removed after verification. That phase did not modify shared dev or production. The integrated dev rollout is recorded below. No schema changes or dependency installation were needed.

Private test logs and screenshot evidence are retained outside Git under the task's `profile-account-permissions` evidence directory and `/opt/pathbuilder-dev/releases/profile-permissions-20261102-01/` on the dev host.

## Integrated dev rollout — 2 November 2026

- Checkpoints: backend permission enforcement `583a2f4a0e`, Profile UI `ade006e88a`, and final test source `b9d6878f408e20f948bea844467e2656bf353b24`. Tag `pbs9-profile-permissions-dev-20261102` identifies the tested application source. Earlier PBS-9 phase tags remain available.
- All six integrated backend source/test files match the isolated 82-test backend run. The integrated Linux frontend build passed **128 tests across 23 files**, the types-package build, full web TypeScript checking, production frontend build and all **28 locale namespaces**.
- The broader run exposed a picker test race when Escape followed reopening before focus settled. The test now waits for selection closure and renewed input focus before Escape, retaining all selection, no-submit and close assertions. The corrected full run passed. No product picker behavior was changed for this test correction.
- Ruff and focused formatting passed. OxLint has no errors and the same two existing Profile-avatar accessibility warnings. The normal React Doctor monorepo baseline remains unavailable; isolated comparisons of the seven changed production components reported the same **18 existing warnings**, with no new warnings or errors. No numeric score is claimed.
- Dev images: `pathbuilder-dev-backend:pbs9-profile-permissions-20261102-01` and `pathbuilder-dev-web:pbs9-profile-permissions-20261102-01`. Five overlaid API files and 13 web/types files were hash-verified against the committed source. PBS-11 Bulk Archive frontend and backend files are unchanged.
- Deployment updated only API and web. API receives an explicit Compose image override because its previous image was inherited from the shared backend definition; worker and scheduler images remain unchanged. A deep configuration comparison verified that only these two image values changed.
- Django system checks and HTTP readiness passed. Live synthetic employee/admin requests confirm both email endpoints deny access before email/code processing. The active owner capability remains true; the admin account picker excludes the protected owner. The smoke checks use empty mutation bodies so a guard regression cannot change an email. No email, member permission or attendance changes were submitted during this verification.
- The release directory `/opt/pathbuilder-dev/releases/pbs9-profile-permissions-20261102-01/` retains the previous Compose configuration, source archive, build/check logs and verified markers. Automatic rollback restores the old API/web images on rollout failure. To revert later, inspect intervening deployments first and restore the saved configuration only if it still represents the intended checkpoint.
- The deployment guard initially stopped before mutation because API inherited its image rather than declaring it in its service block. The guarded rollout was corrected to add a service-local override; no shared backend-image override was changed.
- The original synthetic browser fixture was inspected at desktop and mobile size and retains its earlier 320px, long-label, empty and disabled-state evidence. **Fresh authenticated full-app visual review is still outstanding:** computer-use connections timed out in both Chrome and the in-app browser. No fresh live screenshot or full browser end-to-end pass is claimed. Review the deployed Profile in dev when browser control is available.
- Private integrated evidence is under `artifacts/pbs9-profile-permissions-20261102-01/`. Credentials, employee screenshots and runtime configuration are not committed or attached to the PR. Production was not modified by this continuation.
