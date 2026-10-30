# Workflow production deployment

Deployed on 2026-10-21 (Asia/Manila) to sync.pathbuilderedu.com.

- Web: `pathbuilder-sync/web:workflow-20261021-01`, promoted from the tested dev static client (SHA256 e425859e871f3137829b668d24b94972cc4ef90e00307d1562401eac77012013).
- API, worker, beat: `pathbuilder-sync/backend:workflow-20261021-01`, based on the prior production image with only Workflow backend additions and registrations.
- Migration `db.0128_workflow` applied successfully.
- Backup: `/opt/plane-selfhost/backups/workflow-20261021-01` on production, including database dump and previous compose/environment. Previous images retained.
- Release scripts and deployment marker: `/opt/plane-selfhost/releases/workflow-20261021-01`.

Before rollout, restored the production database into an isolated Docker network. Verified the migration was the only pending migration; existing table counts were preserved (excluding expected Django content types/permissions). Transactional API checks passed for create, preview, apply, reapply, original issue-state preservation, default state, active estimates, labels, and anonymous denial. Test data was rolled back. Static frontend canary and 31 entry assets passed.

After rollout, authenticated read-only checks passed for profile, workspaces, projects, members, workflows, and estimates. Anonymous Workflow access returned 401. Public API health returned 200. Temporary staging containers were removed. No saved workflows were copied from dev and no production project had a workflow applied by the deployment.

Prior development verification: 25 backend tests, 10 UI tests, web type checking, targeted lint, production build, and light/dark browser form checks. This deployment did not include a new authenticated production browser walkthrough.
