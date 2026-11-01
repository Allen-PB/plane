# Structured updates (PBS-7): production verification

Deployed successfully to `sync.pathbuilderedu.com` on **31 October 2026 at 02:27:53 Asia/Manila**. Release: `structured-updates-20261031-01`. The `DEPLOYED` marker is present; no rollback occurred.

The instance switch is registered as `ENABLE_STRUCTURED_UPDATES = 1`. **Zero projects have the feature enabled**, and zero structured updates remain after the transactional smoke checks. The owner will enable one pilot project manually.

## Deployed images

| Services          | Image                                                     | Image ID                                                                  |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Web               | `pathbuilder-sync/web:structured-updates-20261031-01`     | `sha256:f2fe2c0e0721ef9ac1d6b21776967ca307e8180bcbdc8437625c197d6437faf1` |
| Admin / God Mode  | `pathbuilder-sync/admin:structured-updates-20261031-01`   | `sha256:ceaf4a9f1dd390dc3adedd121fbe85e2f3c09748c9b4504601682575152518c8` |
| API, worker, beat | `pathbuilder-sync/backend:structured-updates-20261031-01` | `sha256:f94fda562f497029ecef70a521bbe2875571f00bc0634ead33d982e0c909dd3c` |

All five application containers were running with zero restarts after rollout and cleanup. Infrastructure services were not replaced.

## Release construction

- Built the backend on the actual production base, `pathbuilder-sync/backend:bulk-update-20261027-01`. Copied six new PBS-7 modules and five shared files; no test files were added to the runtime image.
- Reviewed every shared backend diff. Changes were limited to PBS-7 URL/model registration, evidence entity type, result filters and instance feature-switch registration. Diffs are retained in `backend-shared.diff`.
- Compared release application sources with the tested dev containers, normalizing Windows line endings. The checkout's route differences were indentation only; the candidate uses the tested route file. Two additional checkout UI tests were retained.
- The tested dev web image started from the older Bulk Update image and contained the old page title. With owner approval, built the replacement on production's `pathbuilder-sync/web:social-metadata-20261027-01` to preserve that release. The three metadata source files and sharing image were preserved byte-for-byte.
- Built God Mode separately on its existing Caddy image, `pathbuilder-sync/admin:d2f1fb6ee`. Preserved Caddy configuration and the exact production branding, favicon and manifest files. Matched the existing admin bundle's public `VITE_*` settings, including the public Sync URL; the web image's localhost defaults were not used for admin.
- The Compose diff changes only five application image references: web, admin, API, worker and beat.
- Final source kit: `release-kit.tar`, SHA-256 **`8e997fff2bd61cb0598b43840700c58a0c00eec908111bf84f043ea6e675846b`**, matching locally and on the server. This was a production-compatible rebuild, not a promotion of the dev image archive.

## Pre-cutover verification

- Read-only inspection confirmed migration 0129 applied, persistent MinIO uploads using `plane-app_uploads`, and approximately 39 GB free. Evidence uploads support up to 50 MB per file.
- Backend module compilation passed.
- Restored production data onto an isolated internal Docker network. The only pending migration was `db.0130_structured_updates`.
- Applied 0130, ran `configure_instance`, reversed to 0129, then reapplied 0130 successfully.
- Django system checks and `makemigrations --check --dry-run` passed.
- Existing business table counts and instance configuration values were preserved. Expected migration/content-type/permission bookkeeping and the new instance flag were accounted for separately.
- The 36-check PBS-7 smoke script passed, including the real God Mode switch endpoint. All test records were rolled back.
- Earlier Bulk Update/filter and office/status/admin/CSV/profile/workspace/project/member/Workflow/estimate regressions passed in rolled-back transactions.
- Fresh backend unit/contract run: **287 passed**, 269.74 seconds (`backend-tests.log`).
- Full frontend suite: **102 passed across 18 files**. Web and admin production builds, route type generation and TypeScript checks passed.
- Locale packaging verified all 28 English namespaces. Built bundles contain `Choose files` and the God Mode feature flag.
- Loopback web/admin canaries passed: unchanged metadata, sharing image, Caddy configuration and admin branding; matching admin build settings; served feature asset hashes.

## Resolved preparation issues

The first frontend attempt inherited an older Vitest configuration without the `@/` alias and an outdated Virtual Office fixture without `timed_in_at`. Including the checkout's current test configuration and complete suite resolved the import and Time Out failures without changing application behavior. All 102 tests passed without skips.

The metadata checker was added explicitly to the verification context. An admin canary also caught a different lockup SVG in the build source; the final admin image restores the exact existing production branding, favicon and manifest files. Successful test/build/type-check layers were reused while adjusting these packaging-only inputs. Prior attempt logs remain in the release directory.

## Backups and cutover

Production release directory: `/opt/plane-selfhost/releases/structured-updates-20261031-01`.

Before migration or service replacement, the rollout saved:

- `cutover-before.dump`: PostgreSQL custom-format dump, **3,673,203 bytes**, mode **600**.
- `compose.before.yaml`: previous production Compose file, mode **600**.
- `plane.env.before`: previous environment file, mode **600**, retained only on the server.

The rollout applied 0130, ran `configure_instance` and Django checks, then replaced only the five application services. Readiness passed after the backend's normal startup/configuration/static-file steps. Automatic rollback remained armed until every live check passed.

Previous production images, volumes and backups were retained. Temporary canary/rehearsal containers and the isolated network were removed after success; no production volumes were deleted.

## Live verification

- Migration 0130 applied; no pending migrations. Django system checks passed.
- The 36-check transactional PBS-7 smoke and earlier API regressions passed against the live backend. No smoke records were retained.
- An authenticated existing project admin received settings with `is_enabled = false` and `instance_enabled = true`.
- Anonymous structured-update settings access returned **401**, including an independent public HTTPS check.
- Home, `/god-mode/features/`, `/api/instances/`, Virtual Office and Bulk Update routes returned **200**.
- Public web/admin feature bundles matched verified canary hashes and contain the file-picker and God Mode switch strings.
- Public initial HTML metadata passed for Facebook/Messenger, Facebot, Twitterbot and MicrosoftPreview. The existing sharing image was preserved.
- All five application containers had zero restarts. Fresh public checks also passed after canary cleanup.
- A final read-only database check confirmed instance flag `"1"`, **0 enabled projects**, and **0 structured updates**.

Logs include `restore-check.log`, `backend-tests.log`, `web-build.log`, `canary.log`, `live-migration.log`, `live-check.log`, `public-check.log`, `public-metadata.log`, `live-migrations.log`, `container-status.log`, `deployed-images.json` and `post-deploy-check.log`.

No authenticated production browser walkthrough or real production evidence-file upload was performed. Evidence-upload validation is covered by the passing backend tests. No Git commit, push or PR merge was performed for this deployment.

## Rollback

The executed rollout script reverses 0130 using the new backend image before restoring the previous Compose file and images if a release check fails. No rollback was needed. Manual rollback, if separately authorized:

```sh
cd /opt/plane-selfhost/plane-app
release=/opt/plane-selfhost/releases/structured-updates-20261031-01
# Reverse while the new backend, which contains migration 0130, is selected.
docker compose -p plane-app --env-file plane.env run --rm --no-deps -T --entrypoint python api manage.py migrate db 0129_virtual_office_appearance --noinput
cp "$release/compose.before.yaml" docker-compose.yaml
docker compose -p plane-app --env-file plane.env up -d --no-deps --pull never api worker beat-worker web admin
```

Reversing 0130 drops its six tables and any structured-update data subsequently entered. To disable the feature without dropping data, use **God Mode → Feature flags → Structured updates**.

For the pilot, a project admin can open **Project Settings → Work Structure → Structured updates** and enable it after reviewing the state mapping and functional roles.
