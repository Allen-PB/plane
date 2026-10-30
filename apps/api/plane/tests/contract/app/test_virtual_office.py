from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch
import uuid

import pytest
from django.core.management import call_command
from django.db import IntegrityError, close_old_connections, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from plane.db.models import User
from plane.db.models.virtual_office import OfficeAudit, OfficeDepartment, OfficeDesk, OfficeMember, VirtualOffice

pytestmark = [pytest.mark.contract, pytest.mark.django_db]
URL = "/api/virtual-office/"


@pytest.fixture(autouse=True)
def no_tasks():
    with patch("celery.app.task.Task.apply_async"):
        yield


@pytest.fixture
def office():
    # Tests normally skip data migrations; reproduce the fixed floor explicitly.
    import importlib
    from django.apps import apps
    from django.db import connection

    if not VirtualOffice.objects.exists():
        importlib.import_module("plane.db.migrations.0126_virtual_office").seed_office(
            apps, type("Editor", (), {"connection": connection})()
        )
    return VirtualOffice.objects.get(pk=1)


def new_member(role="employee", department=None):
    token = uuid.uuid4().hex
    user = User.objects.create(email=f"{token}@example.test", username=token, display_name="Test Colleague")
    return OfficeMember.objects.create(
        user=user,
        office_id=1,
        role=role,
        department=department or OfficeDepartment.objects.first(),
        position="Engineer",
    )


def client(member):
    api = APIClient()
    api.force_authenticate(user=member.user)
    return api


def post(api, action, **data):
    return api.post(URL, {"action": action, **data}, format="json")


def test_default_deny_even_plane_superuser(office, create_user, session_client):
    create_user.is_superuser = True
    create_user.is_staff = True
    create_user.save()
    assert session_client.get(URL + "status/").data["allowed"] is False
    assert session_client.get(URL).status_code == 403
    assert session_client.get(URL + "admin/").status_code == 403
    assert post(session_client, "member", user_id=str(create_user.pk), role="super_admin").status_code == 403
    assert APIClient().get(URL).status_code in (401, 403)


def test_floor_has_required_capacity(office):
    assert OfficeDepartment.objects.count() == 7
    assert OfficeDesk.objects.count() == 39
    assert [OfficeDesk.objects.filter(department=d).count() for d in OfficeDepartment.objects.all()] == [
        10,
        5,
        5,
        3,
        7,
        5,
        4,
    ]


def test_member_can_choose_avatar_without_changing_presence_or_another_member(office):
    member, other = new_member(), new_member()
    api = client(member)
    assert post(api, "avatar", avatar_style="female").status_code == 200
    member.refresh_from_db()
    assert member.avatar_style == "female"
    assert member.timed_in_at is None
    assert api.get(URL).data["me"]["avatar_style"] == "female"
    assert post(api, "avatar", avatar_style="male", member_id=str(other.pk)).status_code == 403
    other.refresh_from_db()
    assert other.avatar_style == "male"
    assert post(api, "avatar", avatar_style="unsupported").status_code == 400
    assert post(api, "avatar").status_code == 400
    member.refresh_from_db()
    assert member.avatar_style == "female"


def test_reservation_presence_and_lease(office):
    member = new_member()
    api = client(member)
    desk = OfficeDesk.objects.filter(department=member.department).first()
    assert post(api, "time_in").status_code == 400
    assert post(api, "reserve", desk_id=desk.pk).status_code == 200
    assert post(api, "time_in").status_code == 200
    assert api.get(URL).data["me"]["online"] is True
    assert post(api, "time_out").status_code == 200
    desk.refresh_from_db()
    assert desk.member_id == member.pk
    assert api.get(URL).data["me"]["online"] is False
    post(api, "time_in")
    OfficeMember.objects.filter(pk=member.pk).update(last_seen_at=timezone.now() - timedelta(seconds=100))
    assert post(api, "heartbeat").status_code == 200
    assert api.get(URL).data["me"]["online"] is True
    assert post(api, "time_in").status_code == 409
    assert OfficeDesk.objects.get(pk=desk.pk).member_id == member.pk


def test_offline_does_not_end_attendance_or_add_time_out(office):
    member = new_member()
    api = client(member)
    desk = OfficeDesk.objects.filter(department=member.department).first()
    post(api, "reserve", desk_id=desk.pk)
    post(api, "time_in")
    OfficeMember.objects.filter(pk=member.pk).update(last_seen_at=timezone.now() - timedelta(minutes=10))
    state = api.get(URL).data["me"]
    assert state["online"] is False and state["timed_in_at"] is not None
    assert not OfficeAudit.objects.filter(action="time_out").exists()
    assert post(api, "time_in").status_code == 409
    assert post(api, "time_out").status_code == 200
    assert post(api, "time_out").status_code == 200
    assert OfficeAudit.objects.filter(action="time_out").count() == 1


def test_48_hour_expiry_is_exact_idempotent_and_exported(office):
    from plane.bgtasks.office_attendance import expire_office_attendance
    from plane.utils.office_attendance import AUTOMATIC_REASON, expire_attendance

    member = new_member("admin")
    api = client(member)
    desk = OfficeDesk.objects.filter(department=member.department).first()
    post(api, "reserve", desk_id=desk.pk)
    post(api, "time_in")
    started = timezone.now() - timedelta(hours=48)
    OfficeMember.objects.filter(pk=member.pk).update(timed_in_at=started)
    assert expire_attendance(started + timedelta(hours=48, microseconds=-1)) == 0
    with patch("plane.utils.office_attendance.timezone.now", return_value=started + timedelta(hours=49)):
        assert expire_office_attendance() == 1
        assert expire_office_attendance() == 0
    member.refresh_from_db()
    assert member.timed_in_at is None and member.last_seen_at is None
    event = OfficeAudit.objects.get(action="time_out")
    assert event.created_at == started + timedelta(hours=48)
    assert event.details["reason"] == AUTOMATIC_REASON
    rows = read_presence_csv(api.get(URL + "records.csv", {"all_time": "true"}))
    assert rows[-1]["Time Out reason"] == AUTOMATIC_REASON
    assert rows[-1]["Timestamp (UTC)"] == event.created_at.isoformat(timespec="seconds")
    assert post(api, "time_in").status_code == 200
    assert OfficeDesk.objects.get(pk=desk.pk).member_id == member.pk


def test_overdue_time_in_is_closed_before_new_time_in(office):
    member = new_member()
    api = client(member)
    desk = OfficeDesk.objects.filter(department=member.department).first()
    post(api, "reserve", desk_id=desk.pk)
    post(api, "time_in")
    OfficeMember.objects.filter(pk=member.pk).update(timed_in_at=timezone.now() - timedelta(hours=49))
    assert post(api, "time_in").status_code == 200
    assert OfficeAudit.objects.filter(action="time_in").count() == 2
    assert OfficeAudit.objects.filter(action="time_out").count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_expiry_records_one_automatic_time_out(office):
    from plane.utils.office_attendance import expire_attendance

    member = new_member()
    OfficeMember.objects.filter(pk=member.pk).update(timed_in_at=timezone.now() - timedelta(hours=49))
    barrier = Barrier(2)

    def expire():
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            return expire_attendance()
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: expire(), range(2)))
    assert sum(results) == 1
    assert OfficeAudit.objects.filter(actor=member.user, action="time_out").count() == 1


def test_cross_department_and_impersonation_denied(office):
    member, other = new_member(), new_member()
    api = client(member)
    wrong = OfficeDesk.objects.exclude(department=member.department).first()
    assert post(api, "reserve", desk_id=wrong.pk).status_code == 400
    for action in ("reserve", "time_in", "time_out", "heartbeat"):
        assert post(api, action, desk_id=1, member_id=str(other.pk)).status_code == 403
    assert api.get(URL + "admin/").status_code == 403
    assert post(api, "release", desk_id=1).status_code == 403


def test_admin_boundaries_last_super_and_revocation(office):
    super_admin, admin, employee = new_member("super_admin"), new_member("admin"), new_member()
    admin_api, super_api = client(admin), client(super_admin)
    assert post(admin_api, "member", user_id=str(employee.user_id), role="admin").status_code == 403
    assert post(admin_api, "member", user_id=str(super_admin.user_id), active=False).status_code == 403
    assert post(super_api, "member", user_id=str(super_admin.user_id), active=False).status_code == 400
    assert post(admin_api, "settings", name="Changed").status_code == 403
    api = client(employee)
    post(api, "reserve", desk_id=OfficeDesk.objects.filter(department=employee.department).first().pk)
    post(api, "time_in")
    assert post(admin_api, "member", user_id=str(employee.user_id), active=False).status_code == 200
    assert api.get(URL).status_code == 403
    assert not OfficeDesk.objects.filter(member=employee).exists()
    employee.refresh_from_db()
    assert employee.timed_in_at is None
    assert OfficeAudit.objects.filter(action="member").exists()


def test_admin_department_change_and_reassignment(office):
    admin, employee = new_member("admin"), new_member()
    api = client(admin)
    desk = OfficeDesk.objects.filter(department=employee.department).first()
    assert post(api, "reserve", desk_id=desk.pk, member_id=str(employee.pk)).status_code == 200
    assert post(api, "release", desk_id=desk.pk).status_code == 200
    assert post(api, "reserve", desk_id=desk.pk, member_id=str(employee.pk)).status_code == 200
    department = OfficeDepartment.objects.exclude(pk=employee.department_id).first()
    assert post(api, "member", user_id=str(employee.user_id), department_id=department.pk).status_code == 200
    assert not OfficeDesk.objects.filter(member=employee).exists()
    assert post(api, "member", user_id=str(employee.user_id), department_id=None).status_code == 400


def test_operator_bootstrap_is_explicit_and_audited(office, create_user):
    call_command("office_super_admin", create_user.email)
    assert OfficeMember.objects.get(user=create_user).role == "super_admin"
    assert OfficeAudit.objects.filter(action="operator_super_admin").count() == 1


def test_department_management_requires_office_admin(office):
    employee, admin = new_member(), new_member("admin")
    department = employee.department
    data = {"department_id": department.pk, "name": "Engineering", "color": "#123abc"}
    assert post(client(employee), "department", **data).status_code == 403
    assert post(client(admin), "department", **data).status_code == 200
    assert post(client(admin), "department", department_id=department.pk, color="invalid").status_code == 400
    assert OfficeDesk.objects.count() == 39
    assert OfficeDepartment.objects.get(pk=department.pk).name == "Engineering"
    assert OfficeAudit.objects.filter(action="department").exists()


def test_database_prevents_multiple_reservations(office):
    member = new_member()
    desks = list(OfficeDesk.objects.filter(department=member.department)[:2])
    OfficeDesk.objects.filter(pk=desks[0].pk).update(member=member)
    with pytest.raises(IntegrityError), transaction.atomic():
        OfficeDesk.objects.filter(pk=desks[1].pk).update(member=member)


def test_session_mutations_require_csrf_and_trusted_origin(office):
    member = new_member("super_admin")
    api = APIClient(enforce_csrf_checks=True)
    api.force_login(member.user)
    response = api.get(URL + "status/")
    assert response.data["allowed"] is True
    assert post(api, "settings", name="Rejected").status_code == 403
    token = response.data["csrf_token"]
    payload = {"action": "settings", "name": "Office"}
    assert (
        api.post(
            URL, payload, format="json", HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="https://untrusted.example"
        ).status_code
        == 403
    )
    assert api.post(URL, payload, format="json", HTTP_X_CSRFTOKEN=token).status_code == 200


@pytest.mark.django_db(transaction=True)
def test_simultaneous_claims_have_one_winner(office):
    members = [new_member(), new_member()]
    desk = OfficeDesk.objects.filter(department=members[0].department).first()
    barrier = Barrier(2)

    def claim(member_id):
        close_old_connections()
        try:
            member = OfficeMember.objects.select_related("user").get(pk=member_id)
            api = client(member)
            barrier.wait(timeout=10)
            return post(api, "reserve", desk_id=desk.pk).status_code
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(claim, [m.pk for m in members]))
    assert sorted(results) == [200, 409]
    assert OfficeDesk.objects.get(pk=desk.pk).member_id in [m.pk for m in members]


def read_presence_csv(response):
    import csv
    import io

    body = b"".join(response.streaming_content).decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(body, newline="")))


def test_presence_csv_permissions_and_empty_header(office):
    employee, admin = new_member(), new_member("admin")
    url = URL + "records.csv"
    assert APIClient().get(url).status_code in (401, 403)
    assert client(employee).get(url).status_code == 403
    response = client(admin).get(url)
    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv; charset=utf-8"
    assert response["Content-Disposition"].startswith('attachment; filename="virtual-office-time-in-out_')
    assert response["Cache-Control"] == "no-store"
    assert read_presence_csv(response) == []


def test_presence_csv_snapshots_quoting_timezone_and_formula_safety(office):
    employee, admin = new_member(), new_member("admin")
    employee.user.display_name = '=HYPERLINK("evil"), Team\nName'
    employee.user.save()
    api = client(employee)
    desk = OfficeDesk.objects.filter(department=employee.department).first()
    post(api, "reserve", desk_id=desk.pk)
    post(api, "time_in")
    post(api, "time_out")
    saved_department = employee.department.name
    employee.user.display_name = "Changed later"
    employee.user.save()
    employee.department = OfficeDepartment.objects.exclude(pk=employee.department_id).first()
    employee.save()
    rows = read_presence_csv(client(admin).get(URL + "records.csv"))
    assert [row["Event"] for row in rows] == ["Time In", "Time Out"]
    assert rows[0]["Employee name"] == '\'=HYPERLINK("evil"), Team\nName'
    assert rows[0]["Email"] == employee.user.email
    assert rows[0]["Department"] == saved_department
    assert rows[0]["Desk"] == f"{saved_department} {desk.number:02d}"
    assert rows[0]["Profile source"] == "Recorded at event"
    assert rows[0]["Timestamp (Asia/Manila)"].endswith("+08:00")
    assert rows[0]["Timestamp (UTC)"].endswith("+00:00")
    assert rows[0]["Timestamp (Asia/Manila)"][:10]
    assert len(rows) == 2  # Reservation and other audit events are excluded.


def test_presence_csv_legacy_events_and_more_than_audit_preview_limit(office):
    employee, admin = new_member(), new_member("admin")
    OfficeAudit.objects.bulk_create(
        [OfficeAudit(office_id=1, actor=employee.user, action="time_in") for _ in range(105)]
    )
    rows = read_presence_csv(client(admin).get(URL + "records.csv"))
    assert len(rows) == 105
    assert rows[0]["Profile source"] == "Current profile (legacy event)"
    assert rows[0]["Desk"] == ""
    assert rows[0]["Email"] == employee.user.email
    OfficeMember.objects.filter(pk=admin.pk).update(active=False)
    assert client(admin).get(URL + "records.csv").status_code == 403


@pytest.mark.parametrize(
    "params",
    [
        {"start_date": "2026-01-01"},
        {"end_date": "2026-01-01"},
        {"start_date": "bad", "end_date": "2026-01-01"},
        {"start_date": "2026-02-02", "end_date": "2026-02-01"},
        {"all_time": "true", "start_date": "2026-01-01", "end_date": "2026-01-02"},
        {"all_time": "invalid"},
    ],
)
def test_presence_csv_rejects_invalid_ranges(office, params):
    assert client(new_member("admin")).get(URL + "records.csv", params).status_code == 400


def test_presence_csv_inclusive_manila_dates_and_all_time(office):
    from datetime import datetime, timezone

    member = new_member("admin")
    for instant in [
        "2026-01-31T15:59:59+00:00",
        "2026-01-31T16:00:00+00:00",
        "2026-02-01T15:59:59.999999+00:00",
        "2026-02-01T16:00:00+00:00",
    ]:
        event = OfficeAudit.objects.create(office_id=1, actor=member.user, action="time_in")
        OfficeAudit.objects.filter(pk=event.pk).update(created_at=datetime.fromisoformat(instant))
    api = client(member)
    response = api.get(URL + "records.csv", {"start_date": "2026-02-01", "end_date": "2026-02-01"})
    assert len(read_presence_csv(response)) == 2
    assert "2026-02-01_to_2026-02-01.csv" in response["Content-Disposition"]
    assert len(read_presence_csv(api.get(URL + "records.csv", {"all_time": "true"}))) == 4
    from unittest.mock import patch

    with patch("plane.app.views.virtual_office.timezone.now", return_value=datetime(2026, 2, 10, tzinfo=timezone.utc)):
        assert len(read_presence_csv(api.get(URL + "records.csv"))) == 3


@pytest.mark.parametrize("age,expired", [(0, False), (47, False), (48, True), (49, True), (240, True)])
@pytest.mark.parametrize("active", [True, False])
def test_expiry_age_and_active_member_matrix(office, age, expired, active):
    from plane.utils.office_attendance import expire_attendance

    member = new_member()
    now = timezone.now()
    started = now - timedelta(hours=age)
    OfficeMember.objects.filter(pk=member.pk).update(timed_in_at=started, last_seen_at=None, active=active)
    assert expire_attendance(now) == int(expired)
    member.refresh_from_db()
    assert (member.timed_in_at is None) == expired
    events = OfficeAudit.objects.filter(actor=member.user, action="time_out")
    assert events.count() == int(expired)
    if expired:
        assert events.get().created_at == started + timedelta(hours=48)


def test_heartbeat_cannot_reopen_closed_or_expired_attendance(office):
    member = new_member()
    api = client(member)
    assert post(api, "heartbeat").status_code == 200
    member.refresh_from_db()
    assert member.timed_in_at is None and member.last_seen_at is None
    OfficeMember.objects.filter(pk=member.pk).update(timed_in_at=timezone.now() - timedelta(hours=49))
    assert post(api, "heartbeat").status_code == 200
    member.refresh_from_db()
    assert member.timed_in_at is None and member.last_seen_at is None
    assert OfficeAudit.objects.filter(actor=member.user, action="time_out").count() == 1


def test_expired_manual_time_out_does_not_add_second_event(office):
    member = new_member()
    OfficeMember.objects.filter(pk=member.pk).update(timed_in_at=timezone.now() - timedelta(hours=49))
    assert post(client(member), "time_out").status_code == 200
    event = OfficeAudit.objects.get(actor=member.user, action="time_out")
    assert event.details["reason"] == "Automatic—48 hr limit"


@pytest.mark.parametrize("operation", ["release", "revoke", "department"])
def test_admin_session_closure_records_old_profile_before_changes(office, operation):
    admin, employee = new_member("admin"), new_member()
    api = client(admin)
    desk = OfficeDesk.objects.filter(department=employee.department).first()
    post(api, "reserve", desk_id=desk.pk, member_id=str(employee.pk))
    post(client(employee), "time_in")
    old_department = employee.department.name
    if operation == "release":
        response = post(api, "release", desk_id=desk.pk)
    elif operation == "revoke":
        response = post(api, "member", user_id=str(employee.user_id), active=False)
    else:
        department = OfficeDepartment.objects.exclude(pk=employee.department_id).first()
        response = post(api, "member", user_id=str(employee.user_id), department_id=department.pk)
    assert response.status_code == 200
    event = OfficeAudit.objects.get(actor=employee.user, action="time_out")
    assert event.details["department"] == old_department
    assert event.details["desk"] == f"{old_department} {desk.number:02d}"
    assert event.details["reason"].startswith("Administrator")
    employee.refresh_from_db()
    assert employee.timed_in_at is None


def test_expiry_failure_preserves_open_session_without_partial_audit(office):
    from plane.utils.office_attendance import expire_attendance

    member = new_member()
    started = timezone.now() - timedelta(hours=49)
    OfficeMember.objects.filter(pk=member.pk).update(timed_in_at=started)
    with patch("plane.utils.office_attendance.OfficeMember.save", side_effect=RuntimeError("simulated failure")):
        with pytest.raises(RuntimeError, match="simulated failure"):
            expire_attendance()
    member.refresh_from_db()
    assert member.timed_in_at == started
    assert not OfficeAudit.objects.filter(actor=member.user, action="time_out").exists()
    assert expire_attendance() == 1


def test_export_reconciles_expiry_before_filtering_by_cutoff_date(office):
    from datetime import datetime, timezone as utc

    member = new_member("admin")
    started = datetime(2026, 1, 29, 16, 0, tzinfo=utc.utc)  # Jan 30, midnight Manila.
    OfficeMember.objects.filter(pk=member.pk).update(timed_in_at=started)
    with patch("plane.utils.office_attendance.timezone.now", return_value=started + timedelta(hours=72)):
        response = client(member).get(URL + "records.csv", {"start_date": "2026-02-01", "end_date": "2026-02-01"})
        rows = read_presence_csv(response)
    assert len(rows) == 1
    assert rows[0]["Timestamp (Asia/Manila)"] == "2026-02-01T00:00:00+08:00"
    assert rows[0]["Time Out reason"] == "Automatic—48 hr limit"


@pytest.mark.django_db(transaction=True)
def test_concurrent_time_in_creates_one_session_and_one_event(office):
    member = new_member()
    desk = OfficeDesk.objects.filter(department=member.department).first()
    OfficeDesk.objects.filter(pk=desk.pk).update(member=member)
    barrier = Barrier(2)

    def time_in(_):
        close_old_connections()
        try:
            current = OfficeMember.objects.select_related("user").get(pk=member.pk)
            barrier.wait(timeout=10)
            return post(client(current), "time_in").status_code
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(time_in, range(2))) == [200, 409]
    assert OfficeAudit.objects.filter(actor=member.user, action="time_in").count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_manual_out_and_expiry_do_not_duplicate(office):
    from plane.utils.office_attendance import expire_attendance

    member = new_member()
    OfficeMember.objects.filter(pk=member.pk).update(timed_in_at=timezone.now() - timedelta(hours=49))
    barrier = Barrier(2)

    def close(kind):
        close_old_connections()
        try:
            current = OfficeMember.objects.select_related("user").get(pk=member.pk)
            barrier.wait(timeout=10)
            if kind == "manual":
                assert post(client(current), "time_out").status_code == 200
            else:
                expire_attendance()
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(close, ["manual", "automatic"]))
    assert OfficeAudit.objects.filter(actor=member.user, action="time_out").count() == 1


@pytest.mark.parametrize("role", ["employee", "admin", "super_admin"])
def test_office_appearance_role_permissions_and_shared_persistence(office, role):
    actor = new_member(role)
    viewer = new_member()
    response = post(client(actor), "appearance", appearance_mode="night")
    if role == "employee":
        assert response.status_code == 403
        office.refresh_from_db()
        assert office.appearance_mode == "automatic"
    else:
        assert response.status_code == 200
        office.refresh_from_db()
        assert office.appearance_mode == "night"
        other = client(viewer).get(URL).data
        assert other["appearance_mode"] == "night" and other["appearance"] == "night"
        assert other["appearance_timezone"] == "Asia/Manila"
        assert OfficeAudit.objects.get(action="appearance").actor_id == actor.user_id
        assert post(client(actor), "appearance", appearance_mode="automatic").status_code == 200


@pytest.mark.parametrize(
    "hour,minute,expected", [(5, 59, "night"), (6, 0, "day"), (17, 59, "day"), (18, 0, "night"), (0, 0, "night")]
)
def test_office_appearance_manila_schedule(office, hour, minute, expected):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    member = new_member()
    instant = datetime(2026, 10, 22, hour, minute, tzinfo=ZoneInfo("Asia/Manila"))
    with patch("plane.app.views.virtual_office.timezone.now", return_value=instant):
        state = client(member).get(URL).data
    assert state["appearance_mode"] == "automatic" and state["appearance"] == expected
    assert state["server_time"] == instant.isoformat()


@pytest.mark.parametrize("payload", [{}, {"appearance_mode": "invalid"}])
def test_office_appearance_rejects_invalid_or_missing_mode(office, payload):
    assert post(client(new_member("admin")), "appearance", **payload).status_code == 400
    office.refresh_from_db()
    assert office.appearance_mode == "automatic"


def test_office_appearance_database_constraint(office):
    with pytest.raises(IntegrityError), transaction.atomic():
        VirtualOffice.objects.filter(pk=1).update(appearance_mode="invalid")
