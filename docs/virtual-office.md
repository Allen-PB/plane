# PathBuilder Virtual Office

Virtual Office reuses the Sync session and has its own default-deny membership
table. Plane workspace, staff, superuser and `/god-mode` roles grant no office
permissions. There is one office with seven departments and 39 seeded desks.

## Operator setup

After migration, explicitly designate an existing active Sync account:

```sh
python manage.py office_super_admin existing-account@example.com
```

This operator command is audited. There is no public bootstrap or invitation
endpoint. `/virtual-office/setup` explains the access requirement. A Super Admin
can then grant Admin or Employee access through `/virtual-office/admin/access`.
Admins manage employees; only Super Admins manage office administrators. The
last active Super Admin cannot be revoked or demoted through the API.
Admins can also edit department names and colors in office settings. Department
count and workstation capacity remain fixed; only Super Admins edit office identity.

Employees require a department and job position. Changing department or revoking
access releases their desk and ends presence. Admins can release or assign desks
from the office floor; assignments must match the employee's department.

## Reservations and presence

All mutations lock the office row inside a PostgreSQL transaction before checking
the actor's current permissions. Unique desk numbers and a one-to-one reservation
constraint enforce exclusive desks and one desk per employee. Competing claims
return one success and one HTTP 409. Audit records are written in the transaction.

The floor polls every 10 seconds. A timed-in browser renews presence every 25
seconds; a lease expires after 90 seconds without a heartbeat. A sleeping or
disconnected browser therefore loses its avatar, but retains its reservation.
An expired lease requires an explicit time-in. Time-out ends presence across all
tabs. This is office presence, not a payroll attendance system.

The scene adapts the supplied prototype's floor layout into a lazy-loaded Three.js
WebGL renderer with orbit, pan, pinch/scroll zoom, and reset controls. Names,
presence and reservations come exclusively from the office API. Camera movement
does not reset on presence polling. Graphics resources and event listeners are
released on unmount. No external models, fonts or texture URLs are loaded.

The original `makarius-virtual-office-v0.1.zip` is the design reference for the
full-height floor, dark header, compact directory, department filter and original
`Time In` / `Time Out` wording. PathBuilder branding replaces the prototype name.
Existing Sync button labels are outside this visual change. Primary drag or swipe
moves the view; Rotate switches that gesture to orbit. Direction and zoom buttons
provide visible alternatives to gestures. A missing department or desk is explained
next to the presence buttons rather than leaving an unexplained disabled action.

An isometric fallback and keyboard-accessible desk buttons remain available, with a
table view for smaller screens and assistive technology. No browser storage
authorizes access or stores reservations. The existing Sync auth wrapper handles
session expiry. The header building icon opens `/virtual-office`.
Office mutations use Django's CSRF-enforcing session authentication. The status
endpoint supplies a masked CSRF token for the client header while retaining the
existing HttpOnly cookie policy. Missing tokens and untrusted origins are denied.

## Validation

```sh
pnpm --filter web test
pnpm --filter web check:types
pnpm --filter web build
docker compose -f docker-compose-test.yml run --rm --build api-tests \
  pytest plane/tests/contract/app/test_virtual_office.py
```

Run migration checks on an isolated PostgreSQL database, including forward,
reverse to `0125`, and forward to `0126`. The tests cover default deny even for
Plane superusers, role boundaries, revocation, the last Super Admin, department
changes, presence expiry, uniqueness and real concurrent desk claims.

## Environment inspection — 20 October 2026

| Resource | DEV | Production (read-only inspection) |
| --- | --- | --- |
| Host | `dev-plane-sync-sgp1` | `plane-sync-sgp1` |
| Compose project | `pathbuilder-dev` | `plane-app` |
| Database endpoint / name | `db:5432/pathbuilder` | `plane-db/plane` |
| PostgreSQL volume | `pathbuilder-dev_pgdata` | `plane-app_pgdata` |
| Source before feature | `preview`, `8fa9f53639578fc84f2d90878fec5e5fa86c390d` | Web release metadata: same `preview` commit |
| Backend image before feature | `pathbuilder-dev-backend:local` | `pathbuilder-sync/backend:4ff23181a` |
| Web image before feature | `pathbuilder-dev-frontend:local` | `pathbuilder-sync/web:8fa9f5363-static3000` |

DEV uses separate Redis, RabbitMQ, MinIO and Mailpit containers and named volumes.
Its app and mail ports bind to loopback. Both environments have released from
`preview`; that branch is not exclusively DEV. The PathBuilder GitHub workflow
validates and does not deploy. Feature deployment must target DEV explicitly;
never merge into `preview` as a substitute for selecting a deployment environment.

DEV is reached through the existing SSH tunnel in `tools/connect-dev.ps1`, then
`http://localhost:8080/virtual-office`. Production must not be changed without
explicit approval. No production data or credentials are copied for this feature.

The supplied `pathbuilder-sync-virtual-office-dev-handoff.zip` was reviewed after
the initial rollout. Only the visual reference informed the scene update; its
placeholder routes, invitation flow, simulated presence, and localStorage logic
were not imported. Existing PathBuilder SVG branding remains in use.

## DEV rollout and rollback

Feature source lives in `artifacts/virtual-office-worktree` locally on
`company/virtual-office-phase-1`, based on the verified deployed `preview` commit.
This clean worktree excludes unrelated edits in the original checkout.

DEV releases are under `/opt/pathbuilder-dev/releases/`. Each feature image has
an immutable `vo-<commit>` tag and an OCI source revision label. The runtime
Compose file references those tags explicitly. API, worker and beat share the
same backend image; only web uses the new frontend image. Admin, space and live
retain their original images. The main DEV checkout remains on its original
`preview` revision; consult the running image labels for feature provenance.

The first rollout backup is in `releases/79296727d8/dev-before.dump`, alongside
`compose.before.yaml`. To roll the feature back, restore that Compose file into
`/opt/pathbuilder-dev/runtime/compose.yaml`, then run
`docker compose up -d --no-deps --pull never api worker beat web` there. Keep the
additive office tables so no office data is lost. Do not restore an old database
over newer Sync writes. The old images remain tagged locally. Do not run the
generic DEV `launch.sh` when intending to retain the feature release.

The office owns its scroll container inside Sync's fixed application shell.
Management pages scroll vertically; on desktop the directory and workstation list
scroll independently. Narrow screens scroll the stacked floor and directory as one
page, including the presence controls. Fallback floor and list regions can receive
keyboard focus for native arrow/Page Down scrolling. Wheel/pinch over the WebGL
canvas zooms; dragging/swiping moves the camera by default. These handlers are
attached only to that canvas and disposed when leaving the office.

The renderer skips GPU draws while the scene is unchanged, disables live shadow
maps and caps pixel density at 1.25. Camera damping and server-driven changes
invalidate the scene. Office management shows account emails beside employee
names; selecting an existing account loads its saved role and department.

## Downloadable Time In/Out records

Office administrators can choose **Download Time In/Out CSV** in office management.
`GET /api/virtual-office/records.csv` exports all explicit Time In and Time Out audit
events, ordered by timestamp and event ID, independent of the 100-row audit preview.
Employees and revoked office members cannot download this report.

The UTF-8 CSV includes an Excel BOM, quoted cells, employee ID/name/email,
department, position, desk, event, and ISO timestamps in Asia/Manila and UTC.
New events snapshot profile details so later name/department changes do not alter
history. Older events are marked `Current profile (legacy event)` and leave the
historical desk blank. Lease expiry and administrator releases are separate audit
events, not explicit Time Out button events. Spreadsheet formula cells are escaped.
The download is streamed and marked `Cache-Control: no-store`.

## Seated avatar anchors

The active floor is a fixed isometric illustration with seated avatar sprites; the previous WebGL renderer is not mounted. Camera controls pan and zoom rather than orbiting the illustration.

Each workstation resolves its avatar anchor from the department bank and chair row. The anchor is a local seat-cushion offset and keyboard-facing direction. Leadership has alternating front/back rows, so facing is derived from the row configuration rather than the department or employee/desk ID. Missing anchor metadata defaults to the existing north-west chair convention.

The avatar is parented to the workstation's local origin. A dedicated child applies the sprite-facing correction once. Each male/female seated image has calibrated pixel dimensions, hip origin, opaque height and head position; transparent padding no longer changes the apparent seat position. Foreground illustration masks restore chair backrests and the desk edge over the body where appropriate. Employee nameplates are rendered in a separate upright layer and avoid other names and department badges.

Selecting a desk still inspects it. The live avatar follows the server-confirmed reservation; an unsuccessful claim cannot move it. Time Out removes the avatar while preserving the reservation. No backend model, permission or attendance changes are required for anchor placement.

Validation includes all visible chair anchors, opposing Leadership rows, repeated reservation switches, male/female poses, nameplate overlap avoidance, and stable orientation through selection/pan/zoom. Free camera rotation cannot be validated against this fixed-view artwork; a future orbiting renderer must use actual 3D workstations and skeletal avatar poses.
