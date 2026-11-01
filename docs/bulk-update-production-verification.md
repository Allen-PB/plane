# Bulk Update production verification

Release: `bulk-update-20261027-01`, Asia/Manila.

## Pre-cutover verification

- Read Claude's production handoff and inspected both hosts, their running images, production compose/service names, and the prior production restore and rollback scripts.
- Verified the four backend files match the running tested dev API byte-for-byte.
- Verified the dev and production web base image IDs match: `sha256:64506fd06223898b70933d86fac74a2cf52319162e5af5a279f49d09d9047a67`.
- Confirmed the isolated dev backend regression result: 182 passed, including 57 Bulk Update tests.
- Re-ran all current web component tests: 75 passed in 16 files; TypeScript also passed.
- Built `pathbuilder-sync/backend:bulk-update-20261027-01` on the actual production backend base, copying only the four Bulk Update files and registering the new URL module. Unrelated working-tree changes were excluded.
- Rehearsed that backend on an isolated production database restore, using an internal Docker network. Django system checks, migration-plan checks, both transactional Bulk Update smoke scripts, and existing office/profile/workspace/project/member/workflow/estimate regressions passed.
- No pending migrations were found. All 117 table counts matched after the transactional checks rolled back.
- Exported the exact tested dev web image, `pathbuilder-dev-web:bulk-update-20261027-06`, and streamed it through the local machine to production. Archive SHA-256: `094845cbb56f4559d82d517de4f726d253473e2b321674d294eb4b12fa240a3f`.

## Cutover status

Deployed successfully. The DEPLOYED marker is present; no rollback occurred. Web runs `pathbuilder-dev-web:bulk-update-20261027-06`; API, worker, and beat run `pathbuilder-sync/backend:bulk-update-20261027-01`. All four containers were running with zero restarts after verification.

- Live Django system checks and existing office/status/admin, CSV, access, profile, workspace, project, member, workflow, and estimate regressions passed. Workspace Admin access to Bulk Update passed with no project preselected.
- Verified built access permissions, dropdown placement, all 28 locale namespaces, and hashes of the actual JavaScript served through the production proxy.
- Public HTTPS Bulk Update page returned 200; anonymous API returned 401. Home and virtual office routes returned 200.
- Fresh `cutover-before.dump` is retained in the release directory (2,537,145 bytes, mode 600), along with the previous compose file and image diff. No migration ran.
- Removed only the isolated rehearsal database, Redis containers, and internal network after successful deployment.

## Release records

Production release directory: `/opt/plane-selfhost/releases/bulk-update-20261027-01`.

The rollout saves a fresh protected database backup and the previous compose file, changes only the web/API/worker/beat image references, and restores the prior images automatically if readiness or live checks fail. No schema migration is required. The previous migrator and infrastructure services are retained.

This is an image-pinned promotion. No Git commit or PR was created. Bulk operations record activity history; they do not emit notifications or webhooks.
