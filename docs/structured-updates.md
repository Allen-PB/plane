# Structured updates (PBS-7)

Dev, QA and BA post structured updates from a work item's Activity area. Results are stored as data, move the work item through the project's states, and can be used in filters and Views. Free-text comments are unchanged.

## Enabling it on a project

1. Apply the migration (see below), run `python manage.py configure_instance` (registers the instance flag), and deploy the API, web app and admin app.
2. Check **God Mode / Feature flags / Structured updates**. It is on by default (`ENABLE_STRUCTURED_UPDATES`, env default `1`). This is the instance-wide kill switch: turning it off hides the feature in every project and makes every structured-update endpoint return 403, immediately and without a restart. Project settings and existing updates are kept, and free-text comments are not affected.
3. A project admin opens **Project Settings / Work Structure / Structured updates**.
4. Turn on **Enable structured updates**. It is off by default for every project.
5. Check the **State mapping**. When the page is first saved, steps are pre-filled by state name ("Ready for QA", "Ready for BA", "In Progress", "Done"). If a name is missing, the first state in the started or completed group is used instead. When a step is set to **Not set**, the result is still saved, but the state does not change and the poster sees which step was expected.
6. Under **Functional roles**, tick Dev, QA or BA for each member. A member can hold more than one role. Guests cannot hold functional roles.

## Rules (enforced by the API)

| Rule            | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Who can post    | Active project Admins or Members, and only for the functional roles they hold. Admins without a role cannot post. Guests and non-members get a 403.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Required fields | Dev: root cause category, root cause and resolution. QA: result and QA validation. BA: result and BA validation. Blank and spaces-only values are rejected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Links           | PR/commit link and evidence links must be http or https.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Evidence files  | JPEG, PNG, GIF, WebP, MP4, WebM or MOV, up to 50 MB each (`STRUCTURED_UPDATE_EVIDENCE_SIZE_LIMIT`, in bytes). The presigned upload pins the content type and maximum size. SVG is not allowed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| State checks    | A QA result is accepted only in the "QA results allowed in" state, and a BA result only in the "BA results allowed in" state. Project admins can tick **Override the state check**, and the update records that the check was overridden. Dev updates are blocked on completed and cancelled work items. If a check state is not set, that check is skipped. The **Enforce state checks** toggle turns the checks off.                                                                                                                                                                                                                                                                                                                           |
| Transitions     | Dev submit → Ready for QA. QA Passed → Ready for BA. QA Failed → In Progress. BA Approved → Done. BA Rejected → In Progress. Each target is configurable per project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| QA rounds       | The first QA result is round 1. The next QA result starts a new round after a QA failure, or after a BA rejection that came after the last QA result and was not corrected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Editing         | Only the author can edit an update. Notes, links and evidence can be edited at any time, show an "Edited" label, and keep a revision history. Result and root cause category are locked. Updates cannot be deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Corrections     | To fix a wrong result (QA/BA) or root cause category (Dev), the author uses **Correct result** / **Correct category** on their update. This only works while it is the most recent structured update on the work item, and only while they still hold the role. A reason is required. It posts a new update linked to the original (labeled "Correction"; the original stays as posted and is labeled "Corrected") with the original's notes copied. The state check is skipped, the QA round is kept, and the work item moves to the state mapped for the corrected value. A corrected BA rejection does not start a new QA round. Once later updates exist, corrections go through a new update (project admins can override the state check). |
| Feature flags   | Two switches, both must be on. **God Mode / Feature flags** (instance-wide, on by default) is the kill switch. **Project Settings / Structured updates** (per project, off by default) turns it on for one project. When either is off, every structured-update endpoint returns 403 and the UI is hidden. Existing data is kept.                                                                                                                                                                                                                                                                                                                                                                                                                |

## Filters

The summary for each work item is stored in `issue_structured_summaries`. The work item filters **QA result**, **QA round**, **BA result** and **Root cause category** are available in the project work item, Cycle, Module and project View filters when the feature is on. API filter keys: `qa_result`, `ba_result`, `root_cause_category`, `qa_round` (plus `__in`).

## Migration and rollback

`0130_structured_updates` is additive. It creates six new tables and changes no existing table:

- `project_structured_update_settings`
- `project_member_functional_roles`
- `structured_updates`
- `structured_update_revisions`
- `structured_update_links`
- `issue_structured_summaries`

Evidence files are stored as `file_assets` rows with `entity_type = STRUCTURED_UPDATE_EVIDENCE` (no schema change).

```sh
cd apps/api
uv run python manage.py migrate db 0130_structured_updates      # apply
uv run python manage.py migrate db 0129_virtual_office_appearance  # roll back (drops the six tables and their data)
```

Rolling back does not delete evidence files from storage or their `file_assets` rows. To clean them up:

```sql
UPDATE file_assets SET is_deleted = true, deleted_at = now()
WHERE entity_type = 'STRUCTURED_UPDATE_EVIDENCE';
```

## Verification

```sh
# backend
docker compose -f docker-compose-test.yml run --rm --build api-tests \
  pytest plane/tests/unit/utils/test_structured_update.py plane/tests/contract/app/test_structured_updates.py
# frontend
pnpm --filter web test -- components/structured-updates
pnpm --filter web check:types
```
