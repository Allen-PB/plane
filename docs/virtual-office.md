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

The scene uses CSS 3D transforms and keyboard-accessible desk buttons, with a
table view for smaller screens and assistive technology. No browser storage
authorizes access or stores reservations. The existing Sync auth wrapper handles
session expiry. The header building icon opens `/virtual-office`.

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
| Host | `152.42.166.16`, `dev-plane-sync-sgp1` | `178.128.26.53`, `plane-sync-sgp1` |
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

The handoff ZIP was not available in the supplied attachments. The implementation
uses the written requirements; visual comparison against that prototype remains
pending if the ZIP is supplied later.
