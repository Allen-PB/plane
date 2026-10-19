# CSV Import

Workspace administrators and owners can open **Workspace Settings → CSV Import**.
Choose an active project, upload a CSV, map its columns, validate, review, and import
the valid rows. Invalid rows are skipped and can be downloaded with their source
line numbers and errors. Re-upload the corrected rows to import them.

The project selector includes public workspace projects and private projects the
administrator actively belongs to. Every endpoint checks workspace administrator
membership, project access, and the import initiator. The worker checks access
again before each row.

## Supported data

- UTF-8 CSV, including BOM, quoted commas, escaped quotes, and multiline cells.
- At most 5 MB, 10,000 nonempty data rows, and 100 columns per upload.
- Name (required), plain-text description, priority, state, labels, start date, and
  due date. Dates use `YYYY-MM-DD`; priorities are none, urgent, high, medium, low.
- Headers can have arbitrary or duplicate names. Columns are mapped by position;
  each Plane field can be mapped once. Unneeded columns can be skipped.
- State and label names match within the selected project, ignoring case. Ambiguous
  names produce errors. Missing labels require explicit permission to create them.
  Multiple labels use a configurable separator (default `|`, matching the desktop importer).
- Empty cells leave optional fields at Plane's defaults. Entirely empty rows are
  ignored. Malformed rows are reported; their source content is retained for
  correction. Failed-row exports use Plane's CSV formula sanitization.

The API owns parsing and validation, so preview and the Celery worker share the
same mapping rules. Issues are created through `IssueCreateSerializer`, preserving
Plane's issue numbering, default state and assignee, label relations, audit actor,
and issue activity notifications.

The original desktop sources were found at
`C:\Users\ASUS\Documents\Codex\2026-10-08\how\outputs` (`import_plane.py`,
`plane_update.py`, and `plane_desktop.py`). The integrated importer adapts their
trimmed, case-insensitive state/label matching, escaped plain-text description
conversion (including literal `\n` sequences), `State Name` header, and pipe-separated
labels. Their API-token transport and local journal are replaced by Plane sessions,
the issue serializer, and atomic database checkpoints. The desktop update/export
operations remain outside this create-only CSV import flow.

## Background jobs and recovery

Imports run on the existing Celery worker. Keep the message broker and worker
running. Progress and input are persisted in `csv_imports`; recent imports can be
reopened after a browser refresh. Input and error data remain in the database.

Starting the same import ID repeatedly queues it once. Each issue and its progress
checkpoint commit in one database transaction. Concurrent task deliveries and
redelivery after worker loss resume from that checkpoint without duplicating
issues. Uploading the same CSV as a new import intentionally creates new issues.

A failed issue rolls back its label creation and the worker continues with later
rows. If the job stops, download failed and unprocessed rows and import corrections
as a new CSV. Previously successful rows are excluded from that download.

## Deployment

1. Apply migration `db.0125_csvimport` using the normal deployment migration step
   (`cd apps/api` then `uv run python manage.py migrate`).
2. Deploy/restart the API and Celery worker so the worker registers
   `plane.bgtasks.csv_import_task.import_csv`.
3. Rebuild and deploy the web application.

No new runtime dependency or environment variable is required.

## Tests

Using the repository's isolated Docker test stack:

```sh
docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/unit/utils/test_csv_import.py plane/tests/contract/app/test_csv_import.py
```

Coverage includes malformed CSV, arbitrary mappings, limits, label matching and
creation, authorization and workspace/project scoping, issue creation, row rollback,
interrupted workers, concurrent deliveries, and safe failed-row exports.
