# PBS-9 phase 4: attendance controls and exports

Adds own-session indicators and duration, explicit scheduled-shift selection with a nearest suggestion, and an accessible early Time Out dialog with cancellation and an optional reason. Office-floor and management controls use the same component. Output-based employees do not receive schedule classifications or early-departure warnings.

Adds the guarded Directory → Attendance route, date/employee/department filters, frozen report pagination, CSV download and lazy-loaded PDF generation. Downloads include every snapshot row, independently of the displayed page. The PDF embeds the existing Inter fonts, repeats report metadata and page numbers, and keeps each bounded session record together. Whitespace is formatted for readability while CSV preserves multiline field values.

Existing active employees may retain an unconfigured arrangement during identity edits; new grants/reactivations require an arrangement. Historical/revoked members remain available in report filters.

Validation before Linux release checks: 55 UI tests passed, with an additional four-test attendance-control run covering an arrangement change after shift selection. The synthetic full-column PDF included all 53 records across 53 pages, preserving accented names and long reasons; text extraction verified every record and repeated header. Rendered pages were inspected for layout. Focused lint passed; web type checking passed before the last small UI refinements and is rerun in the Linux build.

The default React Doctor installation is blocked by an unavailable transitive npm package version. An isolated diagnostic installation is being attempted without changing application manifests or lockfiles. No React Doctor score is claimed at this checkpoint.

Deploy the phase-3 backend and phase-4 frontend together after restored-data rehearsal and Linux tests/build pass. Operational backups, image references and cutover/rollback scripts remain in private deployment records.
