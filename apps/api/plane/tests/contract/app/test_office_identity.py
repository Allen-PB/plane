import importlib

import pytest
from django.apps import apps
from django.db import connection, transaction
from rest_framework.test import APIClient

from plane.db.models import Profile, User
from plane.db.models.virtual_office import (
    OfficeAudit,
    OfficeDepartment,
    OfficeDesk,
    OfficeJobRole,
    OfficeMember,
    OfficeNotice,
)
from plane.tests.contract.app.test_virtual_office import new_member, client, post
from plane.tests.contract.app.test_virtual_office import office as office_fixture, no_tasks as no_tasks_fixture

office = office_fixture
no_tasks = no_tasks_fixture

pytestmark = [pytest.mark.contract, pytest.mark.django_db]
URL = "/api/virtual-office/"


def invited_user():
    import uuid

    token = uuid.uuid4().hex
    user = User.objects.create(email=f"{token}@example.test", username=token)
    api = APIClient()
    api.force_authenticate(user=user)
    return user, api


def test_initial_setup_is_shared_but_cannot_grant_access_or_permission(office):
    user, api = invited_user()
    department = OfficeDepartment.objects.first()
    role = OfficeJobRole.objects.create(department=department, name="Developer")
    response = api.patch(
        URL + "profile/",
        {"department_id": department.pk, "job_role_id": role.pk, "role": "super_admin", "user_id": "ignored"},
        format="json",
    )
    assert response.status_code == 200
    assert not OfficeMember.objects.filter(user=user).exists()
    assert api.get(URL + "status/").data["allowed"] is False
    profile = Profile.objects.get(user=user)
    assert profile.office_job_role == role and profile.role == "Developer"
    admin = new_member("admin")
    assert post(client(admin), "member", user_id=str(user.pk), arrangement="output_based").status_code == 200
    assert OfficeMember.objects.get(user=user).job_role == role
    assert (
        api.patch(URL + "profile/", {"department_id": department.pk, "job_role_id": role.pk}, format="json").status_code
        == 403
    )
    assert post(client(admin), "member", user_id=str(user.pk), active=False).status_code == 200
    assert (
        api.patch(URL + "profile/", {"department_id": department.pk, "job_role_id": role.pk}, format="json").status_code
        == 403
    )


def test_admin_change_preserves_open_session_and_applies_before_new_desk(office):
    employee, admin = new_member(), new_member("admin")
    api = client(employee)
    desk = OfficeDesk.objects.filter(department=employee.department).first()
    assert post(api, "reserve", desk_id=desk.pk).status_code == 200
    assert post(api, "time_in").status_code == 200
    employee.refresh_from_db()
    started = employee.timed_in_at
    department = OfficeDepartment.objects.exclude(pk=employee.department_id).first()
    role = OfficeJobRole.objects.create(department=department, name="Analyst")
    assert (
        post(
            client(admin), "member", user_id=str(employee.user_id), department_id=department.pk, job_role_id=role.pk
        ).status_code
        == 200
    )
    employee.refresh_from_db()
    assert employee.timed_in_at == started and employee.department_id == desk.department_id
    assert OfficeDesk.objects.filter(member=employee).exists()
    assert not OfficeAudit.objects.filter(actor=employee.user, action="time_out").exists()
    assert OfficeNotice.objects.filter(user=employee.user).count() == 1
    assert post(api, "prepare_time_in").status_code == 400
    assert post(api, "time_out").status_code == 200
    assert OfficeAudit.objects.get(actor=employee.user, action="time_out").details["department"] == desk.department.name
    assert post(api, "time_in").status_code == 400
    assert post(api, "prepare_time_in").status_code == 200
    employee.refresh_from_db()
    assert employee.department == department and employee.job_role == role
    assert not OfficeDesk.objects.filter(member=employee).exists()
    assert employee.timed_in_at is None


def test_catalog_permission_archive_rename_and_duplicate_validation(office):
    employee, admin, owner = new_member(), new_member("admin"), new_member("super_admin")
    payload = {"department_id": employee.department_id, "name": "  Developer  "}
    assert client(employee).post(URL + "job-roles/", payload).status_code == 403
    assert client(admin).post(URL + "job-roles/", payload).status_code == 403
    api = client(owner)
    response = api.post(URL + "job-roles/", payload)
    assert response.status_code == 200
    role_id = response.data["id"]
    assert api.post(URL + "job-roles/", {**payload, "name": "developer"}).status_code == 400
    assert api.post(URL + "job-roles/", {"id": role_id, "archived": True}).status_code == 200
    user, user_api = invited_user()
    assert (
        user_api.patch(
            URL + "profile/", {"department_id": employee.department_id, "job_role_id": role_id}, format="json"
        ).status_code
        == 400
    )
    original_event = OfficeAudit.objects.create(
        office_id=1, actor=employee.user, action="time_in", details={"position": "Engineer"}
    )
    assert api.post(URL + "job-roles/", {"id": employee.job_role_id, "name": "Software Engineer"}).status_code == 200
    employee.refresh_from_db()
    original_event.refresh_from_db()
    assert employee.position == "Software Engineer"
    assert original_event.details["position"] == "Engineer"


def test_cross_department_free_text_and_legacy_profile_bypasses_are_rejected(office):
    employee, admin = new_member(), new_member("admin")
    department = OfficeDepartment.objects.exclude(pk=employee.department_id).first()
    role = OfficeJobRole.objects.create(department=department, name="Analyst")
    assert (
        post(
            client(admin),
            "member",
            user_id=str(employee.user_id),
            department_id=employee.department_id,
            job_role_id=role.pk,
        ).status_code
        == 404
    )
    assert post(client(admin), "member", user_id=str(employee.user_id), position="Admin").status_code == 400
    profile = Profile.objects.get(user=employee.user)
    client(employee).patch(
        "/api/users/me/profile/",
        {"role": "Admin", "office_department": department.pk, "office_job_role": role.pk},
        format="json",
    )
    profile.refresh_from_db()
    assert profile.office_job_role_id == employee.job_role_id
    assert profile.role == "Engineer"


def test_revocation_is_not_blocked_by_an_archived_pending_assignment(office):
    employee, admin = new_member(), new_member("admin")
    department = OfficeDepartment.objects.exclude(pk=employee.department_id).first()
    role = OfficeJobRole.objects.create(department=department, name="Analyst")
    api = client(admin)
    assert (
        post(api, "member", user_id=str(employee.user_id), department_id=department.pk, job_role_id=role.pk).status_code
        == 200
    )
    role.archived = True
    role.save()
    assert (
        post(
            api, "member", user_id=str(employee.user_id), active=False, department_id=department.pk, job_role_id=role.pk
        ).status_code
        == 200
    )
    employee.refresh_from_db()
    assert employee.active is False


def test_identity_and_notice_mutations_require_csrf_and_notice_ownership(office):
    user, _ = invited_user()
    api = APIClient(enforce_csrf_checks=True)
    api.force_login(user)
    department = OfficeDepartment.objects.first()
    role = OfficeJobRole.objects.create(department=department, name="Tester")
    assert (
        api.patch(URL + "profile/", {"department_id": department.pk, "job_role_id": role.pk}, format="json").status_code
        == 403
    )
    token = api.get(URL + "profile/").data["csrf_token"]
    assert (
        api.patch(
            URL + "profile/",
            {"department_id": department.pk, "job_role_id": role.pk},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        ).status_code
        == 200
    )
    notice = OfficeNotice.objects.create(user=user, message="Pending identity")
    other = new_member()
    assert client(other).post(URL + f"notices/{notice.pk}/read/").status_code == 404
    assert api.post(URL + f"notices/{notice.pk}/read/", HTTP_X_CSRFTOKEN=token).status_code == 200


def test_full_department_allows_deskless_attendance_and_later_claim(office):
    employee, holder = new_member(), new_member()
    OfficeDesk.objects.filter(department=employee.department).exclude(
        pk=OfficeDesk.objects.filter(department=employee.department).first().pk
    ).delete()
    desk = OfficeDesk.objects.filter(department=employee.department).first()
    desk.member = holder
    desk.save()
    api = client(employee)
    assert post(api, "time_in").status_code == 200
    employee.refresh_from_db()
    started = employee.timed_in_at
    desk.member = None
    desk.save()
    assert post(api, "reserve", desk_id=desk.pk).status_code == 200
    employee.refresh_from_db()
    assert employee.timed_in_at == started


def test_data_migration_maps_departments_and_preserves_sources(office):
    OfficeDepartment.objects.filter(order=6).update(name="Chief")
    employee = new_member()
    profile = Profile.objects.get(user=employee.user)
    profile.role = "Different profile title"
    profile.save()
    migration = importlib.import_module("plane.db.migrations.0131_office_employee_identity")
    with transaction.atomic():
        migration.migrate_identity(apps, type("Editor", (), {"connection": connection})())
    employee.refresh_from_db()
    profile.refresh_from_db()
    assert OfficeDepartment.objects.get(name="Quality & Systems")
    assert OfficeDepartment.objects.count() == 7
    assert profile.role == "Engineer"
    assert profile.office_department_id == employee.department_id
    assert OfficeAudit.objects.filter(
        action="identity_migration", details__old_profile_role="Different profile title"
    ).exists()
