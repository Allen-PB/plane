# Structured updates (PBS-7): dev verification

Release kit: `/opt/pathbuilder-dev/releases/structured-updates-20261030-01` on `dev-plane-sync-sgp1`. Verified 2026-10-30.

## What was deployed

| Service           | Image                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| api, worker, beat | `pathbuilder-dev-backend:structured-updates-20261030-01` (layered on `bulk-update-20261027-04`)                                                                |
| web               | `pathbuilder-dev-web:structured-updates-20261030-01` (layered on `bulk-update-20261027-06`)                                                                    |
| admin (God Mode)  | Same image as web. Admin was previously on `pathbuilder-dev-frontend:local`; its source and `VITE_*` build settings were confirmed identical before switching. |

The kit copies only PBS-7 files (`manifest.txt`). Each shared file was compared with the running image first. Unrelated uncommitted work (SEO metadata in `root.tsx`, `page-title.tsx`, `metadata.ts`) was left out.

## Checks

| Check                                                                                                                                                                                                                                                                                                                                                                                | Result                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Isolated test stack (tmpfs Postgres, Redis, RabbitMQ, MinIO): structured update unit and contract tests plus workflow, bulk update, cycle, project and scope regression tests                                                                                                                                                                                                        | 233 passed (`backend-tests.log`)          |
| Migration round trip: apply 0130, roll back to 0129, apply again; `makemigrations --check`; `manage.py check`                                                                                                                                                                                                                                                                        | Passed (`migration-roundtrip.log`)        |
| Web and admin build, locale bundle check, feature strings present in both bundles                                                                                                                                                                                                                                                                                                    | Passed (`web-build.log`)                  |
| Rollout: compose and `pg_dump` backup, `migrate db`, `configure_instance`, `check`, image swap                                                                                                                                                                                                                                                                                       | Passed (`rollout.log`)                    |
| Health: `/` 200, `/god-mode/features/` 200, `/api/instances/` 200, anonymous structured update endpoint 401                                                                                                                                                                                                                                                                          | Passed                                    |
| `ENABLE_STRUCTURED_UPDATES` registered as `1`                                                                                                                                                                                                                                                                                                                                        | Passed                                    |
| End-to-end smoke against the dev database in a rolled-back transaction (`dev-smoke.py`): 36 checks covering flags, role and permission rules, required fields, link scheme, the full Dev → QA → BA flow with state changes, correction, QA rounds, summary, edit rules, the work item filter, comments, response privacy, and the God Mode switch through the real God Mode endpoint | 36 passed, nothing kept (`dev-smoke.log`) |

## Rollback

```sh
cd /opt/pathbuilder-dev/runtime
# 0130 only exists in the new image, so reverse it before switching back.
docker compose run --rm --no-deps -T api python manage.py migrate db 0129_virtual_office_appearance
cp /opt/pathbuilder-dev/releases/structured-updates-20261030-01/compose.before.yaml compose.yaml
docker compose up -d --no-deps --pull never api worker beat web admin
```

To switch the feature off without a rollback, use **God Mode / Feature flags**.
