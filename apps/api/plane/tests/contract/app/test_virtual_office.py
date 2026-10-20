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
    assert api.get(URL).data["me"]["online"] is False
    assert OfficeDesk.objects.get(pk=desk.pk).member_id == member.pk


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
