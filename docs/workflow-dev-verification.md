# Workflow development verification

Verified on 2026-10-21 (Asia/Manila) in the existing development environment.

- Backend image: pathbuilder-dev-backend:workflow-20261021-02
- Web image: pathbuilder-dev-web:workflow-20261021-02
- Release directory: /opt/pathbuilder-dev/releases/workflow-20261021-01
- Development database backup and previous compose configurations are retained in the release directory.

## Automated results

- 25 backend tests passed: 14 configuration-validation tests and 11 API integration tests, using separate PostgreSQL and Redis containers.
- 6 frontend interaction tests passed; web TypeScript and targeted lint checks passed.
- Full migration chain passed on an empty isolated database. The new db.0128_workflow migration also passed independently on the test schema, and model/migration consistency checks reported no changes.
- The normal production web build passed on Linux, including translation namespace packaging checks.
- Dev db.0128_workflow was applied successfully.

## Browser and live API checks

A dedicated project, **Workflow QA** (WFQA), and template, **Engineering QA Workflow**, remain available for manual review.

- Created the QA project and an existing work item through the browser.
- Created and saved the workflow with states, a Bug label, and ordered Story points.
- Selected manual/saved setup in Project Settings / Work Structure / Workflow.
- Previewed and confirmed application, then repeated application and confirmed settings were reused.
- Verified states and labels in the existing settings pages.
- Verified Ready is the project default and WFQA-1 retains its original Backlog state.
- Verified the selected estimate system is active and workspace estimate caches refresh.
- Authenticated profile, workspaces, members, projects, and workflow API checks passed. Anonymous workflow access was denied.

## Fixes found during browser verification

1. Moved the Workflow translation into the nested common.workflow key and added a locale packaging assertion.
2. Activated the copied estimate system using last_used, deactivated previous systems, and invalidated cached workspace estimates after commit. Added API regression assertions and a cross-user cache test.

Dev URLs:

- Workspace workflows: http://localhost:8080/pathbuilder/settings/workflow/
- QA project workflow: http://localhost:8080/pathbuilder/settings/projects/b39ec635-4704-4959-a4c9-d0533cc2a4f1/workflow/

Verification logs are saved under artifacts/workflow-dev. Production was not changed.
