# PBS-9 Phase 1 — Employee identity and access

Local implementation on `feat/pbs-9-employee-access`, based on `6364ec2b9b`. This phase implements the identity portion of the [approved specification](pbs-9-attendance-specification.md). It is not a complete PBS-9 release and has not been deployed.

## Implemented behavior

- Profile has separate Department and department-filtered Job Role dropdowns. A new authenticated Sync account can complete its own setup without receiving office access or permission roles.
- Any existing office membership, including revoked membership, makes these Profile fields read-only. Admins can complete missing identity when granting access.
- Employee access loads the account's saved Profile identity. Existing members show pending changes separately from their effective assignment.
- Only active office Super Admins can create, rename, archive or restore job roles. Archived roles remain on existing assignments; they cannot be newly selected. Role names do not grant office permissions.
- Department names are fixed; office administrators can still change department colors.
- Admin department/job-role edits save the next assignment without closing an open session. An office notification tells the employee the effective timing and remains visible in Profile/Virtual Office until dismissed.
- After Time Out, Apply changes and choose a desk applies pending identity and releases an old-department reservation without recording attendance. The employee then selects an eligible desk and confirms Time In. If the department has no available desk, attendance can proceed without a workstation. A later desk claim retains the original Time In.
- Existing raw audit events and CSV export remain in place. Identity is required before Time In. Legacy free-text Profile PATCH cannot bypass the dropdown; the new setup endpoint enforces CSRF and own-user scope.

## Phase boundary

Attendance arrangement selection, initial working-hour configuration, employee schedule requests/approval, schedule notifications, classification rules, shift selection, the Attendance module and report exports are later phases. In particular, this phase's Employee access form does not yet require Scheduled shift/Output-based configuration. Do not release it as the finished onboarding workflow described by the full specification.

Office notifications use a dedicated office-owned store because existing Sync notifications require a workspace. They currently appear in Profile and Virtual Office, not the workspace notification inbox.

## Data and migration

`0131_office_employee_identity` adds OfficeJobRole, OfficeNotice, Profile's shared department/job-role references, and OfficeMember's effective job-role reference. The existing position field expands to 300 characters to accommodate Profile role values.

The data migration preserves department IDs, desk relationships and layout order. It maps recognized historical names to the seven canonical departments and refuses unexpected/duplicate mappings rather than guessing. It derives trimmed, case-insensitively deduplicated role options per department, preferring office position over Profile role, and audits both original source values. An open member's original effective position is retained until their next Time In.

Migration reversal does not undo name normalization or rewrite audit history. Operational rollback should restore compatible application images and retain the additive schema. Dropping the new tables/columns would discard new identity data and notices; do not treat reversing the schema as a lossless operational rollback.

## Validation

Checks are run locally without connecting to development or production databases:

- Virtual Office Vitest suite: 46 tests across 11 files passed, including identity selection, Profile lock/setup, pending changes and deskless Time In. One parallel run hit an existing scene test's timeout; the full suite passed with two workers and unchanged assertions/timeouts.
- Web TypeScript check passed. Focused OxLint on office components/service reported zero errors or warnings; Oxfmt passed. The existing general Profile form retains two pre-existing avatar accessibility warnings.
- Ruff passed on changed backend files. Django system check passed, and migration generation dry-run reported no model/schema drift.
- Isolated in-memory SQLite API smoke covering catalog authorization, initial identity setup, office access grant, post-grant Profile lock, pending admin changes, preservation of an open session, department/desk transition, archiving and revocation.
- Full `0131` forward migration from historical `0130` model state in an isolated in-memory SQLite database, checking shared references and source audit preservation.

The SQLite checks deliberately use synthetic data and do not establish PostgreSQL locking/concurrency, all foreign-key behavior, middleware/session integration or real CSRF correctness. Backend contract cases for these paths are added in `plane/tests/contract/app/test_office_identity.py`, with existing Virtual Office expectations updated for the approved department-transition policy.

The required PostgreSQL contract command remains:

```powershell
docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/contract/app/test_virtual_office.py plane/tests/contract/app/test_office_identity.py
```

Docker is not installed/available in the current environment, and no WSL distribution is available. The PostgreSQL suite has not been executed. The migration dry-run used an explicitly overridden unused loopback database address; it reported no model changes but could not check live migration history.

React Doctor was attempted with the required `@latest --verbose --diff` command. The initial sandbox attempt could not resolve npm; a network-enabled retry failed because npm could not find the required `@opentelemetry/sdk-trace-base@^2.9.0` dependency. No Doctor score was obtained and no dependency manifests were changed to work around it.

No live browser walkthrough or deployment verification has been performed. Before a development rollout, run the PostgreSQL suite and migration checks, complete a visual walkthrough, and rerun React Doctor when its dependency is available. Production requires separate explicit approval with backup, rollback and verification evidence.
