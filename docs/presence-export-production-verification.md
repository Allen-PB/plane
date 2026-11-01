# Attendance export production release

Release: `presence-dates-20261021-01`, 2026-10-21 (Asia/Manila).

Deployment completed. Live read-only regression checks passed after rollout, including filtered attendance export, authorization, office APIs, and existing project/workflow APIs. API, web, worker, and beat containers are running the release. Temporary staging containers were removed.

The API image is based on production's `workflow-20261021-01` image and replaces only `plane/app/views/virtual_office.py`. Comparison with the previous production file showed changes only to datetime imports, the new export query serializer, CSV timestamp filtering, and the range-specific filename. Attendance mutations, access management, office settings, and other view methods are unchanged. No database migration is required.

The web image promotes the exact tested dev static client, SHA256 `dd6c8a733c53155172bf5767e65cdb7f2a1ee9c2fe1043117cac6b7e9a57b79a`. Its source changes are the export selector, its insertion in Office management, and the service URL builder.

Before cutover, a production database backup was restored in an isolated Docker network. Read-only checks passed for office status, office floor data, office administration, filtered CSV headers and filename, invalid ranges, anonymous and employee denial, profile, workspaces, projects, members, workflows, and estimates. No migrations were pending. The frontend canary and 31 entry assets passed.

Prior dev validation: all 22 Virtual Office API tests and two selector tests passed, alongside web TypeScript, targeted lint, Linux build, locale checks, and live dev export smoke checks. These checks do not constitute exhaustive regression testing of the entire application.

Backup and prior compose/environment: `/opt/plane-selfhost/backups/presence-dates-20261021-01`. Previous images are retained. Release scripts and logs: `/opt/plane-selfhost/releases/presence-dates-20261021-01`. No attendance records or project settings are modified by the release scripts.
