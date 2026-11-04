import json
from unittest.mock import patch

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from plane.app.serializers.user import UserMeSerializer
from plane.db.models import User
from plane.db.models.virtual_office import OfficeScheduleRequest
from plane.tests.contract.app.test_virtual_office import client, new_member, post
from plane.tests.contract.app.test_virtual_office import office as office_fixture, no_tasks as no_tasks_fixture
from plane.utils.office_schedules import publish_policy


office = office_fixture
no_tasks = no_tasks_fixture
pytestmark = [pytest.mark.contract, pytest.mark.django_db]
SCHEDULE = [{"day": 0, "start": "09:00", "end": "18:00", "ends_next_day": False}]


@pytest.mark.parametrize("role", ["employee", "admin", "unassigned"])
def test_non_owners_cannot_generate_or_apply_email_change_even_with_valid_code(office, role):
    if role == "unassigned":
        user = User.objects.create(email="unassigned@example.test", username="unassigned")
        api = APIClient()
        api.force_authenticate(user=user)
    else:
        member = new_member(role)
        user, api = member.user, client(member)
    original = user.email
    destination = "changed@example.test"
    key = f"magic_email_update_{user.pk}_{destination}"
    cache.set(key, json.dumps({"token": "123456"}))
    with patch("plane.app.views.user.base.send_email_update_magic_code.delay") as send:
        assert api.post("/api/users/me/email/generate-code/", {"email": destination}).status_code == 403
        send.assert_not_called()
    assert api.patch("/api/users/me/email/", {"email": destination, "code": "123456"}).status_code == 403
    assert api.patch("/api/users/me/", {"email": destination}, format="json").status_code == 200
    user.refresh_from_db()
    assert user.email == original
    assert UserMeSerializer(user).data["can_change_email"] is False
    cache.delete(key)


def test_active_owner_keeps_verified_email_change_flow_but_revoked_owner_does_not(office):
    owner = new_member("super_admin")
    api = client(owner)
    assert UserMeSerializer(owner.user).data["can_change_email"] is True
    with patch("plane.app.views.user.base.send_email_update_magic_code.delay") as send:
        assert api.post("/api/users/me/email/generate-code/", {"email": "owner-new@example.test"}).status_code == 200
        send.assert_called_once()
    destination = "owner-new@example.test"
    token = json.loads(cache.get(f"magic_email_update_{owner.user_id}_{destination}"))["token"]
    assert api.patch("/api/users/me/email/", {"email": destination, "code": token}).status_code == 200
    owner.user.refresh_from_db()
    assert owner.user.email == destination
    owner.active = False
    owner.save(update_fields=["active"])
    assert UserMeSerializer(owner.user).data["can_change_email"] is False
    assert api.patch("/api/users/me/email/", {"email": "owner-new@example.test", "code": "123456"}).status_code == 403


def test_admin_cannot_edit_owner_fields_revoke_or_decide_owner_schedule(office):
    admin, owner = new_member("admin"), new_member("super_admin")
    api = client(admin)
    before = (owner.role, owner.active, owner.department_id, owner.job_role_id)
    for changes in [
        {"active": False},
        {"role": "employee"},
        {"department_id": owner.department_id, "job_role_id": owner.job_role_id},
    ]:
        assert post(api, "member", user_id=str(owner.user_id), **changes).status_code == 403
    owner.refresh_from_db()
    assert (owner.role, owner.active, owner.department_id, owner.job_role_id) == before
    assert str(owner.user_id) not in {u["id"] for u in api.get("/api/virtual-office/admin/").data["users"]}
    publish_policy(owner, owner.user, "scheduled", SCHEDULE)
    request = OfficeScheduleRequest.objects.create(member=owner, schedule=SCHEDULE)
    for decision in ["approved", "rejected"]:
        response = api.post(
            f"/api/virtual-office/schedule-requests/{request.pk}/decision/",
            {"decision": decision, "revision": 1, "reason": "Review"},
        )
        assert response.status_code == 403
        request.refresh_from_db()
        assert request.status == "pending"
    assert (
        client(owner)
        .post(f"/api/virtual-office/schedule-requests/{request.pk}/decision/", {"decision": "approved", "revision": 1})
        .status_code
        == 200
    )
