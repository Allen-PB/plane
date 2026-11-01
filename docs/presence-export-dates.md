# Attendance CSV date selection

Office admins and super admins can expand **Download Time In/Out CSV** in Office management. The selector defaults to this month through today and supports Today, This week (Monday through today), Last month, Custom range, and explicit All time. Date boundaries use Asia/Manila to match the existing CSV timestamps. Both selected dates are inclusive. Filtering is by individual event timestamp; the CSV remains an event log rather than a paired-shift or payroll report.

The API accepts `start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`, or `all_time=true`. Requests without filters default to the current month through today. Missing, invalid, reversed, or conflicting filters return 400. Existing office admin authorization remains enforced. Filenames identify the selected range. Empty ranges return column headers only. CSV columns, profile snapshots, spreadsheet formula escaping, ordering, and streaming are retained.

Validation: all 22 Virtual Office API tests passed on isolated PostgreSQL/Redis; two selector tests passed; web TypeScript passed; targeted frontend and backend lint passed. Cases cover Manila midnight boundaries, end-of-day fractions, leap years, year rollover, invalid ranges, explicit full-history export, and permissions. Deployed to production on 2026-10-21; see presence-export-production-verification.md.

Dev release images: `pathbuilder-dev-web:presence-dates-20261021-01` and `pathbuilder-dev-backend:presence-dates-20261021-01`. The Linux frontend build and locale bundle checks passed. Previous dev compose is retained at `/opt/pathbuilder-dev/presence-export/compose.before.yaml`. No database migration is required. A new browser visual walkthrough was not performed.
