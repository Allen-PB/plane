# PBS-9 phase 3: attendance sessions and report data

Adds immutable shift occurrences, attendance sessions linked to original audit events, separate arrival/departure indicators, server-enforced early Time Out confirmation, optional departure reasons, and exception handling for automatic/administrator closures. Same-shift re-entry reuses the frozen shift; durations include breaks.

Migrations 0133–0135 add session/shift/report tables and conservatively import legacy records. Ambiguous or incomplete events remain visible for review. Recorded presence timestamps can precede the corresponding audit write; reliable sequential pairing retains those recorded timestamps without rewriting audits. Legacy records receive no retrospective schedule classifications.

Reports are admin-only, owned snapshots with a one-hour lifetime. Date filtering uses the scheduled start date or actual Time In date; an unpaired legacy Time Out uses its recorded date. Snapshots include every matching row, with a 10,000-session limit that requires narrower filters instead of truncation. Date ranges are limited to 367 days and each administrator can retain ten active snapshots. CSV uses UTF-8, formula protection and snapshot metadata.

Validation: 91 backend tests passed on isolated PostgreSQL, covering existing regressions, schedule boundaries, early-exit confirmation, overnight attribution, re-entry, legacy import, report authorization, snapshot consistency and CSV exports. New backend lint passed. Restored-data migration rehearsal remains a deployment gate.

This is a code checkpoint. Deploy it together with phase 4's matching frontend; a phase-2 frontend cannot select the new scheduled-shift input. Retain additive tables on image rollback. Before rolling forward from an older image, run `python manage.py reconcile_office_sessions` under the controlled deployment procedure, then verify session/audit consistency. The command preserves raw audits and original snapshots; recovered older-image closures are flagged for review. Its idempotence is tested.
