# PBS-11 implementation and verification

Verified 2 November 2026, Asia/Manila. Prepared for the authorized PBS-11 commit and PR; no merge or deployment was performed.

## Scope and isolation

Approved scope: replace Delete with Archive only in Settings > Bulk Update. Other delete actions remain unchanged. This overrides the ticket's original requirement to retain Delete in this wizard.

- Worktree: `C:\Users\ASUS\.codex\worktrees\pbs-11-bulk-archive\plane`
- Branch: `feat/pbs-11-bulk-archive`
- Tested base: `origin/preview` at `d25b012baa7c9f241df619c84a68b69e39c87b23`. Before committing, a fresh fetch found `origin/preview` at `ff58054b4f` (14 commits ahead, including PBS-9). None of those changes overlaps the PBS-11 files. The tested branch was preserved; combined-head integration testing remains for PR review.
- No PBS-9 files, production hosts, shared services, application databases or deployment configuration were modified.

The user explicitly approved uploading the PBS-11 snapshot to the verified development host for disposable tests. Testing used a unique internal Docker network (`pbs11-isolated-20261102`), dedicated PostgreSQL 15.7 and Valkey containers, synthetic credentials, PostgreSQL data on tmpfs, and no published ports or shared volumes. API source was mounted only from `/tmp/pbs11-isolated-20261102/api`. The frontend ran with networking disabled in a disposable copy of an existing image. Existing images were immutable runtime inputs; no dependencies were installed. Shared dev services and PBS-9 containers were neither stopped nor restarted.

All four disposable PBS-11 containers and their private network were removed after verification. Logs/source/build artifacts remain in the task-specific temporary directory; no running test services or test database remain.

## Behavior

Workspace Admin and project membership checks remain enforced on the server and through the existing UI route guard. The Bulk Update endpoint rejects `delete` and accepts `archive`; other deletion endpoints are unchanged.

The selection table, operation-details step, signed 15-minute review and Confirm and Apply action are reused. Archive adds no extra confirmation dialog. Selection includes non-draft, non-archived tickets in all state groups, including triage. Existing Update and Move application validation remains unchanged.

Archive sets the existing `archived_at` field and records history, preserving ticket data and relationships. Project Archives and Restore already use that field. Only selected tickets change; children are not implicitly archived.

Each ticket and its history write use a savepoint. A ticket failure does not prevent later tickets from processing. Changed, unavailable, draft and already archived tickets are identified as skipped. Results count only archived tickets. A request-level/database failure can still roll back the outer request transaction.

## Results

| Check | Result |
| --- | --- |
| PostgreSQL unit/contract suite | **72 passed**; final rerun 84.52 seconds |
| Linux frontend component suite | **103 passed across 18 files** |
| Workspace dependency builds | **9 tasks passed** |
| React Router type generation and full web TypeScript check | **Passed** |
| Production frontend build | **Passed**, including SPA index generation |
| Bundled wizard check | Archive description present; old bulk-delete description absent |
| Focused Ruff, OxLint, oxfmt and Git whitespace checks | **Passed** |
| Focused React Doctor lint comparison | Same four warnings in base and current snapshots; no errors or new warnings |

Archive/Restore integration exercises real Django endpoints with synthetic PostgreSQL records: Bulk Archive succeeds; the active-ticket API excludes the ticket; project Archives lists it; the existing Restore API returns 204; the active-ticket API includes it again. A manual desktop browser walkthrough subsequently passed; see the browser section below.

Other coverage includes Admin/non-Admin access, permission revocation after review, every status and mixed-status batches, partial failure with rollback of the failed ticket, stale/unavailable selections, signed-selection binding, parent/child handling, Bulk Delete rejection and existing Update/Move regressions.

The backend emitted 52 warnings for an absent test static-assets directory. The web build emitted tooling/chunk-size warnings. None failed the checks.

React Doctor's ordinary monorepo diff command cannot find React in its generated repository-root baseline. A focused lint comparison instead used standalone snapshots of the three changed product files. Existing warnings concern component size, related state hooks, status-role preference and chained array iterations. Score and dead-code analysis were disabled for that comparison; no full numeric health score is claimed.

## Evidence

Local evidence directory:

`C:\Users\ASUS\.codex\visualizations\2026\11\01\01a198f8-71c6-7741-afc3-b6c78e2947d4\pbs11-isolated`

- `backend-tests-final.log`: passing PostgreSQL suite, including real active/archived/restore API assertions.
- `web-tests.log`: frontend tests, nine dependency builds, full type check and completed build.
- `doctor-baseline.log` / `doctor-current.log`: focused lint comparison.
- Source archives and isolated frontend execution script.

Remote evidence directory on the verified development host: `/tmp/pbs11-isolated-20261102/`.

API archive SHA-256: `377530b2efaa9b0e73d3f60f1d6e21908375ee6a9b22623a5261eafa52a18a49`. The final contract test was uploaded separately after adding real active-ticket API assertions. Frontend archive SHA-256: `8f34c31730b1307b59fd3c6514d8d0da39465a9eaa758ebaa4a5bc8b64de4ebc`.

## Integration

Review the isolated diff and coordinate integration with the updated preview head. No observed changed source file overlaps the PBS-9 attendance work inspected at the start. The isolated desktop UI walkthrough passed. Any additional device-specific acceptance review can be coordinated before integration. Production deployment still requires separate explicit authorization. No merge, push or deployment was performed.


## Manual browser walkthrough (2 November 2026)

**Passed** in the in-app browser at a dedicated `localhost:18411` tunnel to a fresh private PBS-11 container. This used the tested PBS-11 source and production frontend bundle, a disposable PostgreSQL/Valkey stack, and a synthetic Admin/workspace/project. No production session or data was used. Browser authentication used the ordinary email/password sign-in flow with a disposable account.

Verified through visible UI at 1280 × 720:

1. Selected synthetic tickets PBA-1 (Ready), PBA-2 (In Progress), and PBA-3 (Done).
2. Choose Operation showed Update, Move and Archive, with Delete absent.
3. Reached the existing review/confirmation step. Cancel returned to the start; selecting the project again still showed all three unchanged tickets.
4. Confirm and Apply archived all three in one operation, without an additional archive-specific modal. The result screen reported three archived and identified every ticket individually.
5. The active project work-item view was empty. Project Archives displayed all three tickets with their original statuses.
6. Used each archived ticket's existing More actions > Restore menu. Each showed Restore success and reduced the archive count.
7. After the last restore, Archives displayed No archived work items yet. Active work items displayed all three tickets, preserving Ready, In Progress and Done.

The walkthrough found a test-artifact packaging problem: the Windows-generated source tar treated the Git-tracked `packages/i18n/locales` symlink as a regular file. The initial isolated build therefore showed raw translation keys. Restored the symlink to `src/locales` only inside a fresh disposable Linux build, rebuilt successfully, and verified all **28 English namespaces** in the bundle. The corrected frontend was used for the final translated Archives/Restore and active-view checks. No locale JSON, shared build or repository symlink was changed. Future build transport must preserve Git symlinks; run `node tools/pathbuilder/check_locale_bundle.mjs` as a build gate.

Evidence in the local evidence directory above:

- `browser-archive-result.jpg`: three per-ticket archive successes.
- `browser-archives-translated.jpg`: remaining archived Ready/In Progress tickets after the first restore, with translated labels.
- `browser-archives-empty.jpg`: empty Archives following the final Restore.
- `browser-restored-all-three.jpg`: all three restored tickets in active work, with original statuses.
- `walkthrough-server.log`: real browser API requests; isolated harness exited successfully.
- `locale-corrected-build.log`: successful build including the restored locale symlink.

Removed all four PBS-11 browser/build containers and their private network after collecting evidence. Closed only the dedicated walkthrough tunnel and temporary browser tab. The disposable database was discarded. PBS-9, the shared dev application and production were not modified. No commit, push, merge or deployment was performed.


## Review fixes and latest-preview integration (2 November 2026)

Resolved both P2 review findings without changing PBS-9 or the existing project Archives workflow:

- The selection response includes `state_group`. With any triage ticket selected, the wizard explains that Update/Move are unavailable, disables those choices and blocks Next until Archive is selected. Removing triage tickets re-enables existing operations. Server-side Update/Move restrictions are preserved; Archive still accepts every state group.
- Epic-type items are explicitly reported as skipped and left unchanged because the current project Archives view cannot display them. Preview warns about this limitation. Supported tickets continue and only successful archives count. Type eligibility is rechecked before writing. The type join locks only issue rows to avoid PostgreSQL's nullable-join locking restriction.

New coverage includes the triage UI restriction/recovery path, triage Archive eligibility, mixed epic/regular batches, an all-skipped batch, and a type change between preview and apply.

Tested the working fixes over a temporary combined snapshot of PR head `118b372dec` and latest `preview` `2ce8bea124e85175e4c636e3bdee5aff9d577f7e`. No branch was rebased or merged. Git archive preserved the locale symlink, and only PBS-11 working changes were overlaid. Application-source hashes are retained with evidence.

- Isolated PostgreSQL integration/unit regressions: **135 passed** (135 selected; no failures). Includes Bulk Update, Archive/Restore, workflows, CSV import, cycles, project/workspace APIs and active-membership authorization.
- Combined frontend suite: **130 passed across 26 files**.
- Local focused checks: **20 backend unit tests and 23 Bulk Update frontend tests passed**; Ruff, OxLint, oxfmt and whitespace checks passed.
- Nine dependency builds, full React Router type generation/TypeScript checking, production frontend build and all **28 English namespace checks passed**.
- React Doctor's monorepo scan again encountered its known baseline React-detection error. The optional focused retry stalled and was interrupted; no new health score or completed Doctor regression result is claimed. Focused OxLint and full integration checks are the applicable recorded validation.

Evidence is outside the repository at `C:\Users\ASUS\.codex\visualizations\2026\11\01\01a198f8-71c6-7741-afc3-b6c78e2947d4\pbs11-review-fixes`, including source snapshots, source hashes and test/build logs. Remote task-only evidence is at `/tmp/pbs11-fixes-20261102/`. The disposable stack uses its own PostgreSQL/Valkey/RabbitMQ containers, private network, synthetic credentials, no published ports and no shared data volumes. No dependency installation or shared-service change was required.

All five disposable review-fix containers, their owned anonymous volumes and the private network were removed after validation. No merge, deployment, dependency installation or shared-service change was performed.
