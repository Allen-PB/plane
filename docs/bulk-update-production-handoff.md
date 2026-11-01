# Bulk Update — production release handoff

Handoff from Claude Code, 2026-10-27 (Asia/Manila). The user approved a production release after any checks needed. Claude Code stopped before touching production because its permission system blocked commands on the production host. **Nothing has been changed on production.**

Feature docs: `docs/bulk-update.md`. Dev release history and evidence: `docs/bulk-update-dev-verification.md`.

## Current state

|                     | Dev (`root@152.42.166.16`, `dev-plane-sync-sgp1`) | Production (`root@178.128.26.53`, `plane-sync-sgp1`) |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Web                 | `pathbuilder-dev-web:bulk-update-20261027-06`     | `pathbuilder-dev-web:office-nav-color-20261022-01`   |
| API / worker / beat | `pathbuilder-dev-backend:bulk-update-20261027-04` | `pathbuilder-sync/backend:office-scene-20261022-01`  |
| Compose             | `/opt/pathbuilder-dev/runtime/compose.yaml`       | `/opt/plane-selfhost/plane-app` (inspect before use) |

Production container names: `plane-app-web-1`, `plane-app-api-1`, `plane-app-worker-1`, `plane-app-beat-worker-1`, `plane-app-plane-db-1`. These come from a single read-only `docker ps`. Nothing else on production was inspected.

The dev web chain started from `pathbuilder-dev-web:office-nav-color-20261022-01`, the same tag production runs. The dev backend chain started from `pathbuilder-dev-backend:office-scene-20261022-01`, which is **not** the production backend. Per `docs/office-production-verification.md`, a dev-built backend once failed on production's startup script, so build the backend on the production base.

## Verification already done (pre-production)

- Backend: 182 tests passed in an isolated stack on the dev host (`/opt/pathbuilder-dev/releases/bulk-update-20261027-04/backend-tests.log`), including 57 Bulk Update tests (`apps/api/plane/tests/{unit/utils,contract/app}/test_bulk_update.py`).
- Web: full suite 75/75 (16 files), `pnpm --filter web check:types`, and oxlint/oxfmt on `apps/web/components/bulk-update` all pass.
- Live dev: transactional smoke scripts pass and roll back (`dev-smoke.py` in release `-01`, `filter-smoke.py` in release `-04`). Web 200, Bulk Update page 200, anonymous API 401. The user has used the wizard and filters on dev while signed in.
- The 4 backend files in the working tree are byte-identical to `/code` in the running dev API container.
- No database migration is needed.

## What the release consists of

**Backend.** Copy these into `/code/` on the production base:

- `apps/api/plane/app/urls/bulk_update.py`
- `apps/api/plane/app/views/workspace/bulk_update.py`
- `apps/api/plane/utils/bulk_update.py`
- `apps/api/plane/utils/bulk_update_fields.py`

Then register the URLs in `plane/app/urls/__init__.py`. Dev used this patch, which asserts the file isn't already patched:

```dockerfile
RUN python -c "from pathlib import Path; p=Path('/code/plane/app/urls/__init__.py'); s=p.read_text(); assert 'bulk_update_urls' not in s; s=s.replace('urlpatterns = [', 'from .bulk_update import urlpatterns as bulk_update_urls\n\nurlpatterns = [\n    *bulk_update_urls,', 1); p.write_text(s)" \
  && python -m compileall -q /code/plane/app/views/workspace/bulk_update.py /code/plane/utils/bulk_update.py /code/plane/utils/bulk_update_fields.py
```

Do **not** copy the working tree's `urls/__init__.py`. It also registers unreleased features.

**Web.** The tested image `pathbuilder-dev-web:bulk-update-20261027-06` contains, on top of `office-nav-color-20261022-01`:

- `apps/web/components/bulk-update/` (root, selection, filters, update-fields, parent-field, use-data, activity) and `apps/web/services/bulk-update.service.ts`
- `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/bulk-update/page.tsx`
- `apps/web/components/settings/workspace/sidebar/item-categories.tsx` (sidebar entry)
- `packages/constants/src/settings/workspace.ts`: the `"/settings/bulk-update": [EUserWorkspaceRoles.ADMIN]` entry in `WORKSPACE_SETTINGS_ACCESS`
- Route registration in `apps/web/app/routes/core.ts` and the `bulk_update`/`project` cases in `issue-activity/activity/activity-list.tsx`, applied by `patch-routes.mjs` (dev host, release `-01`)

Release kits with all Dockerfiles and scripts are on the dev host under `/opt/pathbuilder-dev/releases/bulk-update-20261026-01`, `-03`, `bulk-update-20261027-04`, `-05` and `-06`.

## Recommended steps

1. **Commit first (ask the user).** Nothing is committed, and the working tree mixes in unreleased CSV Import, Workflow and Virtual Office changes. Release from a reviewed, bulk-update-only commit if the user agrees.
2. **Inspect production before building.** Read `/opt/plane-selfhost/releases/office-scene-20261022-01` and reuse its staging, restore and rollout scripts. Read the production compose file to find the exact image references and service names.
3. **Web image.** Compare `docker image inspect --format '{{.Id}}' pathbuilder-dev-web:office-nav-color-20261022-01` on both hosts.
   - **IDs match:** promote the exact tested `bulk-update-20261027-06` image, using `docker save` on dev and `docker load` on production through your machine, then verify the ID after loading.
   - **IDs differ:** rebuild on production from its web image, applying the same files, `patch-routes.mjs` and constants change, and stop to tell the user.
   - **Either way,** the built bundle must contain `"/settings/bulk-update":[` and the dropdown positioning (`side:"none",align:"shift"`). The locale check (`tools/pathbuilder/check_locale_bundle.mjs`) must report 28 namespaces.
4. **Backend image.** Build `FROM pathbuilder-sync/backend:office-scene-20261022-01` with the 4 files and the URL patch above. Tag it with a new release name (e.g. `pathbuilder-sync/backend:bulk-update-YYYYMMDD-01`).
5. **Rehearse on an isolated production restore,** as in earlier production releases:
   - Run `python manage.py showmigrations` / `migrate --plan`: no pending migrations expected.
   - Run `manage.py check`.
   - Run `dev-smoke.py` and `filter-smoke.py` from the dev release kits against the restore.
   - Confirm table counts are unchanged and everything rolled back.
6. **Back up, then cut over:** copy the compose file and `pg_dump` (mode 600), swap only the web, api, worker and beat images, and roll back automatically on failure.
7. **Live checks:**
   - Home 200; `/<workspace-slug>/settings/bulk-update/` 200.
   - Anonymous `GET /api/workspaces/<slug>/bulk-update/` returns 401.
   - The served bundle contains the access entry.
   - Containers show zero restarts.
   - Existing read-only checks pass: profile, workspaces, projects, members, Workflow, estimates, office.
   - Optionally run the transactional smoke scripts live; they roll back.
8. **Document** in `docs/bulk-update-production-verification.md`, matching the earlier production docs.

## Pitfalls already hit on dev

- **Shared files missed by the manifest:** release `-01` left out `packages/constants/src/settings/workspace.ts`, so the route guard blocked everyone, Admins included, from Bulk Update. Verify the built artifact (grep the bundle and `/code`), not just the release manifest.
- **Smoke script host header:** `APIClient` must use an allowed host (`APIClient(HTTP_HOST="localhost")` on dev). Otherwise Django returns a bare 400 before reaching the view. Check production's `ALLOWED_HOSTS`.
- **Sidebar placement:** Bulk Update sits directly below CSV Import, Admin-only. CSV Import appears to be released already (`/opt/plane-selfhost/last-csv-production-release.txt`), but confirm production's sidebar before promoting the web image.

## Still outstanding (not blockers for the build, but tell the user)

- Bulk operations write their own activity history entries. They do **not** send notifications or fire webhooks.
- No commit or PR exists for this work yet.
