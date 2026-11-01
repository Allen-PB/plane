# Bulk Update

Workspace settings → Administration → Bulk Update, directly below CSV Import, provides a five-step wizard using Sync's theme and controls:

1. Choose Project — always starts with an empty selection, regardless of the settings URL.
2. Choose Work Items — search by title or key, and filter Jira-style by State, Priority, Assignee (including Unassigned), Label (including No labels), Parent (including No parent), and Start/Due Date ranges. Choices within one filter match any; different filters must all match. Selections are kept across filters and pages. The table shows Labels, Start Date, Due Date, and Parent.
3. Choose Operation — Update, Move, or Archive.
4. Operation Details — enable fields to update or choose a destination project per work item.
5. Confirmation — review the server-validated selection and operation before applying.

Only Workspace Admins can access the page and endpoint. The source project and every destination must also be projects the user administers. Existing Sync rules allow a workspace Admin who is an active member of the project. Members, including project Admins without Workspace Admin access, cannot execute this endpoint by calling it directly.

Updates support State, Priority, Assignees, Labels, Start Date, Due Date, Cycle, Modules, and Parent, including several fields in one operation. Assignees, Labels, and Modules are replaced; an empty selection clears their existing assignments. Enabled empty dates clear the date. Cycle and Parent have explicit removal options. Unchecked fields remain unchanged. Dates are validated against both changed and unchanged values on every work item. Parents must be in the same project and cannot create a circular hierarchy. Completed or archived cycles and archived modules cannot be assigned.

Typography, spacing, selected backgrounds, hover states, and field controls follow the existing Workspace Settings styles. No project route or preselected project is needed to open the wizard.

Moves stay within the current workspace. They preserve the work item UUID while assigning a new destination project key. Matching states (name and group), labels, cycles, modules, estimate values, enabled types, and eligible assignees are required. Incompatible assignments block the entire batch instead of silently discarding data. Parents and children must move together to the same destination. Project-scoped resources follow the work item.

Archive replaces Delete in this wizard and endpoint. Other Delete actions are unchanged. It uses the same review and Confirm and Apply flow as Update and Move, with no extra modal. Tickets in every status are eligible. Only selected tickets are archived; unselected children are unchanged. Archived tickets remain in their project Archives and can be restored. Each result identifies the ticket as archived, skipped, or failed. Changed, unavailable, draft, or already archived tickets are skipped; a failure rolls back that ticket and its history while other tickets continue.

The first version supports up to 100 selected work items per operation, with 25 rows per selection page. A signed review expires after 15 minutes; Update and Move require a fresh review if work items change, and remain atomic. Archive skips changed tickets and uses a savepoint for each ticket within the request transaction. A database or request-level failure can still roll back the request.

## Verification

```powershell
pnpm --filter web test -- components/bulk-update/root.test.tsx
pnpm --filter web check:types
docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/utils/test_bulk_update.py plane/tests/contract/app/test_bulk_update.py
```

The database contract tests cover Admin permissions and project membership, explicit selection, search and pagination, multi-field updates, unavailable choices, stale, expired, forged and replayed reviews, unassignment, history, archive outcomes and Bulk Delete rejection, per-item destinations, every move incompatibility, and batch rejection. No database migrations are required for this feature.

Verified and deployed to dev on 2026-10-26: 159 backend regression tests and 67 web component tests passed, along with TypeScript, targeted lint, the release web build, and translation packaging. Transactional smoke checks passed both in the isolated test environment and against the deployed dev backend, including normal work-item API reads after updating, clearing, and moving. All disposable smoke records were rolled back. No migration ran. Production was not changed.

The actual dev page is http://localhost:8080/pathbuilder/settings/bulk-update/ through the dev SSH tunnel. The separate layout-only preview remains on port 3000. A signed-in browser walkthrough remains for manual review; the dev browser currently shows sign-in. See `bulk-update-dev-verification.md` for release evidence and rollback locations.
