# Saved workflows

Workspace admins manage reusable templates in **Workspace Settings / Workflow** (replaces the Billing & Plans navigation item). Each template stores states, labels, and an optional estimate system. Create, edit, duplicate, and delete templates here.

Project admins open **Project Settings / Work Structure / Workflow**, choose **Manual setup** or **Apply saved workflow**, select a template, and preview the changes. The same page works immediately after creating a project and for existing projects.

## Application rules

- Application copies configuration; subsequent template edits and deletions do not propagate to projects.
- States and labels match case-insensitively by name. Matches retain their IDs and update their configuration. Missing entries are created. Existing entries absent from the template remain available, preserving work-item assignments.
- Template state order and default are applied. Intake states are managed separately.
- Omitting estimates keeps the project's current estimate system.
- A matching estimate system is reused only when its type and ordered values match. Otherwise rename the template estimate system to create an independent system. Applying activates the selected estimate system, archives the previous active system, and refreshes cached workspace estimates.
- When switching estimate systems, every estimate value assigned to an existing work item must map to a target value. Identical values are suggested, and confirmation is still required. Existing estimate systems are retained.
- Conflicting duplicate names block application. Resolve the conflicts and preview again.
- Every application requires a current preview token and project admin permission. Writes run in one database transaction. A changed template or project configuration requires a fresh preview.

## Deployment

Apply the included database migration before using the feature:

```sh
cd apps/api
uv run python manage.py migrate
```

Rebuild the shared types, constants, translations, and web app through the normal application build/deployment process.

## Verification

Backend tests:

```sh
docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/utils/test_workflow.py plane/tests/contract/app/test_workflow.py
```

Frontend tests:

```sh
pnpm --filter web test -- components/workflows/root.test.tsx
pnpm --filter web check:types
```
