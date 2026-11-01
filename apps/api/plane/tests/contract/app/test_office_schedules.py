from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest

from plane.db.models import Profile, User
from plane.db.models.virtual_office import OfficeJobRole, OfficeNotice, OfficeScheduleRequest, OfficeWorkPolicy
from plane.tests.contract.app.test_virtual_office import client, new_member, post
from plane.tests.contract.app.test_virtual_office import office as office_fixture, no_tasks as no_tasks_fixture
from plane.utils.office_schedules import publish_policy, validate_schedule

office = office_fixture
no_tasks = no_tasks_fixture
pytestmark = [pytest.mark.contract, pytest.mark.django_db]
URL = "/api/virtual-office/"
SCHEDULE = [{"day": 0, "start": "09:00", "end": "18:00", "ends_next_day": False}]


def request(api, schedule=SCHEDULE, revision=0):
    return api.post(URL + "schedule/", {"schedule": schedule, "revision": revision}, format="json")


def test_new_grant_requires_arrangement_and_valid_initial_hours(office):
    admin = new_member("admin")
    user = User.objects.create(email="new-schedule@example.test", username="new-schedule")
    role = OfficeJobRole.objects.filter(department=admin.department).first()
    Profile.objects.get_or_create(user=user)
    payload = {"user_id": str(user.pk), "department_id": admin.department_id, "job_role_id": role.pk}
    assert post(client(admin), "member", **payload).status_code == 400
    assert post(client(admin), "member", **payload, arrangement="scheduled", schedule=[]).status_code == 400
    assert post(client(admin), "member", **payload, arrangement="scheduled", schedule=SCHEDULE).status_code == 200
    assert OfficeWorkPolicy.objects.get(member__user=user).schedule == SCHEDULE


@pytest.mark.parametrize(
    "schedule",
    [
        [],
        SCHEDULE * 2,
        [{"day": 0, "start": "18:00", "end": "09:00", "ends_next_day": False}],
        [
            {"day": 6, "start": "22:00", "end": "06:00", "ends_next_day": True},
            {"day": 0, "start": "05:00", "end": "09:00", "ends_next_day": False},
        ],
        [{"day": 0, "start": "25:00", "end": "09:00"}],
    ],
)
def test_invalid_and_week_boundary_overlapping_schedules_are_rejected(schedule):
    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        validate_schedule(schedule)


def test_request_revisions_permissions_approval_and_notifications(office):
    employee, admin, owner = new_member(), new_member("admin"), new_member("super_admin")
    publish_policy(employee, admin.user, "scheduled", SCHEDULE)
    api = client(employee)
    response = request(api)
    assert response.status_code == 200
    pk = response.data["id"]
    assert request(api).status_code == 409
    changed = [{**SCHEDULE[0], "start": "10:00", "end": "19:00"}]
    assert request(api, changed, 1).status_code == 200
    pending = OfficeScheduleRequest.objects.get(pk=pk)
    assert pending.revision == 2 and pending.revisions.count() == 2
    decision_url = URL + f"schedule-requests/{pk}/decision/"
    assert api.post(decision_url, {"revision": 2, "decision": "approved"}).status_code == 403
    assert client(admin).post(decision_url, {"revision": 1, "decision": "approved"}).status_code == 409
    assert client(admin).post(decision_url, {"revision": 2, "decision": "rejected", "reason": " "}).status_code == 400
    assert client(admin).post(decision_url, {"revision": 2, "decision": "approved"}).status_code == 200
    pending.refresh_from_db()
    assert pending.status == "approved"
    assert employee.work_policies.first().schedule == changed
    assert OfficeNotice.objects.filter(user=admin.user, href="/virtual-office/admin/access/").count() == 2
    assert OfficeNotice.objects.filter(user=owner.user, href="/virtual-office/admin/access/").count() == 2
    assert OfficeNotice.objects.filter(user=employee.user, message__contains="approved").exists()


def test_direct_admin_edit_supersedes_pending_request_and_rejection_reason_persists(office):
    employee, admin = new_member(), new_member("admin")
    publish_policy(employee, admin.user, "scheduled", SCHEDULE)
    first = request(client(employee)).data
    changed = [{**SCHEDULE[0], "end": "17:00"}]
    assert (
        post(
            client(admin), "member", user_id=str(employee.user_id), arrangement="scheduled", schedule=changed
        ).status_code
        == 200
    )
    assert OfficeScheduleRequest.objects.get(pk=first["id"]).status == "superseded"
    assert (
        client(admin)
        .post(URL + f"schedule-requests/{first['id']}/decision/", {"revision": 1, "decision": "approved"})
        .status_code
        == 409
    )
    second = request(client(employee)).data
    assert (
        client(admin)
        .post(
            URL + f"schedule-requests/{second['id']}/decision/",
            {"revision": 1, "decision": "rejected", "reason": "Coverage required"},
        )
        .status_code
        == 200
    )
    history = client(employee).get(URL + "schedule/").data["requests"]
    assert history[0]["reason"] == "Coverage required"


def test_policy_change_during_current_shift_is_prospective(office):
    employee, admin = new_member(), new_member("admin")
    zone = ZoneInfo("Asia/Manila")
    with patch("plane.utils.office_schedules.timezone.now", return_value=datetime(2026, 11, 2, 8, tzinfo=zone)):
        old = publish_policy(employee, admin.user, "scheduled", SCHEDULE)
    with patch("plane.utils.office_schedules.timezone.now", return_value=datetime(2026, 11, 2, 10, tzinfo=zone)):
        new = publish_policy(employee, admin.user, "scheduled", [{**SCHEDULE[0], "start": "11:00"}])
    assert new.effective_from == datetime(2026, 11, 2, 18, tzinfo=zone)
    old.refresh_from_db()
    assert old.schedule == SCHEDULE


def test_unconfigured_output_based_and_revoked_members_cannot_submit_hours(office):
    employee, admin = new_member(), new_member("admin")
    assert request(client(employee)).status_code == 400
    publish_policy(employee, admin.user, "output_based", [])
    assert request(client(employee)).status_code == 400
    employee.active = False
    employee.save()
    assert request(client(employee)).status_code == 404
