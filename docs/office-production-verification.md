# Office production release — 22 October 2026

Deployed the scene-only day/night artwork, shared Automatic/Day/Night setting, timed-in desk lighting, dismissing success messages, consistent header typography and selected navigation colors, and CSV export as a management navigation link.

Production web: `pathbuilder-dev-web:office-nav-color-20261022-01` (the exact tested web image). Production API/worker/beat: `pathbuilder-sync/backend:office-scene-20261022-01`, using the previous production base with only the tested office view, model, and migration copied in.

The initial backend image had an incompatible startup script requiring absent system utilities. Previous images were restored, and the corrected backend was built on the existing production base. It passed the isolated appearance/permission/export checks before the second rollout. Final containers have zero restarts and the API is healthy.

Migration 0129 passed on an isolated production restore before being applied live: only the expected migration applied, all table counts and attendance values were preserved, Automatic was the default, and model/migration consistency passed. The existing daytime artwork checksum was preserved.

Final live verification passed: appearance overrides across admin/member sessions, denied employee overrides, Manila schedule metadata, enabled attendance-expiry schedule, date-filtered CSV and validation, denied anonymous/member CSV access, office admin/status/state, profile, workspaces, projects, members, Workflow, and estimates. No migrations remain pending. Home, office floor, management access/settings, and night artwork returned HTTP 200 through the production proxy. API, worker, beat, and web all reported running with zero restarts. Temporary appearance QA data and overrides were rolled back; isolated restore containers and network were removed.

Backup, previous compose, image package, build/deployment scripts and server-side verification logs are retained under `/opt/plane-selfhost/releases/office-scene-20261022-01`. The database backup is mode 600. Rollback uses `compose.before.yaml`; the additive appearance migration can remain when restoring previous images.
