# PBS-9 phase 6: production verification

PBS-9 was deployed and verified in production on November 2, 2026 (Asia/Manila), following the user's authorization to finish dev validation and deploy. [PR #12](https://github.com/Allen-PB/plane/pull/12) merged the implementation into `preview`. Application source revision `2a6ac6e80ce2901d6f7f58f694aa2cb3e273775b` matches the merged application source.

## Verified release

- Dev and production-target backend runs each passed all 223 Virtual Office and structured-updates tests, including 103 Virtual Office tests.
- Both environment-specific web builds passed 88 tests, strict TypeScript checks, bundling and 28 English locale namespace checks. Production metadata and public-origin checks passed.
- Restored production data was migrated on an isolated network. Existing identity and audit rows were preserved, and 116 unaffected tables matched their original hashes. Legacy projection and repeat reconciliation passed.
- The previous production image recorded an open and a closed session against the additive schema in the isolated rehearsal. PBS-9 recovered both exactly once, preserving timestamps and audit links.
- The final production-base backend passed a full entrypoint canary and actual-runtime management bootstrap checks before cutover.
- Live cutover validation preserved existing records. API, worker, scheduler and web were running with zero restarts at verification. Runtime configuration changes were limited to those four service images.
- Live production authentication, schedule endpoint, admin report/CSV parity, employee direct/download denial, public routes and crawler metadata checks passed. API verification writes were rolled back.
- Chrome's existing administrator session generated a live report. Actual CSV and PDF downloads contained all three displayed records, including the final PDF record. No employee Time In/Out was performed for production verification.
- Dev manual checks covered Chrome desktop and a 390-pixel viewport, with no page overflow and an independently scrollable report table. Profile identity locking, working-hours placement and dedicated-shift time inputs were checked. Other browser/OS combinations were not manually exercised.

Detailed logs, screenshots, employee exports and operational backups remain private and are not committed.

## Deployment corrections

The first attempt automatically restored the previous images because the dev backend base lacked system utilities used by production's entrypoint. The final backend uses the existing production base with unchanged PBS-9 application source. It was retested, rehearsed and exercised through the full entrypoint.

A second attempt automatically restored the previous images because the validation runner omitted Django's settings bootstrap. The final runner uses `manage.py shell`; its bootstrap and database target were checked against actual production configuration before the successful cutover. Evidence from all attempts was retained. Neither rollback reversed migrations or restored a database over newer writes.

## Checkpoints and recovery

| Phase | Source checkpoint |
| --- | --- |
| 1: employee identity and access | `pbs9-phase1-20261102` |
| 2: work arrangements and approvals | `pbs9-phase2-20261102` |
| 3: attendance sessions and reports | `pbs9-phase3-validated-20261102` |
| 4: indicators, confirmation and exports | `pbs9-phase4-20261102` |
| 5: validated dev release | `pbs9-phase5-20261102`, `pbs9-dev-verified-20261102` |
| 6: verified production release | `pbs9-phase6-20261102` |

Private preflight and stopped-write cutover dumps, checksums, original compose/environment files and previous images are retained. Source tags do not reverse database schema or data. For ordinary rollback, restore prior image references while retaining the additive schema and newer attendance writes. On roll-forward after older-image attendance writes, run `python manage.py reconcile_office_sessions`. Do not reverse the migrations or overwrite newer attendance with a pre-release restore.

## Operational setup

Administrators must deliberately assign each existing employee's scheduled or output-based arrangement; no schedules were invented during deployment. New grants and reactivations require a valid arrangement. Legacy and missing-configuration attendance remain marked for review.

Historical snapshot fields that were never recorded remain blank. Unpaired raw events and a separately established open-session state remain explicit review records when reliable pairing is impossible. Current profile values are not retroactively substituted for unknown historical data.
