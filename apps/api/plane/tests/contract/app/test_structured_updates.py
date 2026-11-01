# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from unittest.mock import patch
from uuid import uuid4

import pytest
from rest_framework.test import APIClient

from plane.license.models import InstanceConfiguration
from plane.db.models import (
    FileAsset,
    Issue,
    IssueComment,
    IssueStructuredSummary,
    Project,
    ProjectMember,
    ProjectMemberFunctionalRole,
    ProjectStructuredUpdateSetting,
    State,
    StructuredUpdate,
    StructuredUpdateRevision,
    User,
    WorkspaceMember,
)

pytestmark = [pytest.mark.contract, pytest.mark.django_db]


@pytest.fixture(autouse=True)
def no_external_tasks():
    with patch("celery.app.task.Task.apply_async"):
        yield


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Structured", identifier="STU", workspace=workspace)
    ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
    return project


@pytest.fixture
def states(project):
    def make(name, group, sequence):
        return State.objects.create(project=project, name=name, group=group, color="#60646C", sequence=sequence)

    return {
        "todo": make("Todo", "unstarted", 1),
        "in_progress": make("In Progress", "started", 2),
        "ready_for_qa": make("Ready for QA", "started", 3),
        "ready_for_ba": make("Ready for BA", "started", 4),
        "done": make("Done", "completed", 5),
        "cancelled": make("Cancelled", "cancelled", 6),
    }


@pytest.fixture
def setting(project, states):
    return ProjectStructuredUpdateSetting.objects.create(
        project=project,
        is_enabled=True,
        ready_for_qa_state=states["ready_for_qa"],
        ready_for_ba_state=states["ready_for_ba"],
        dev_submit_state=states["ready_for_qa"],
        qa_passed_state=states["ready_for_ba"],
        qa_failed_state=states["in_progress"],
        ba_approved_state=states["done"],
        ba_rejected_state=states["in_progress"],
    )


@pytest.fixture
def issue(project, states, setting):
    return Issue.objects.create(project=project, name="Login bug", state=states["in_progress"])


def make_user(workspace, project=None, project_role=15, functional_roles=(), workspace_role=15):
    handle = uuid4().hex[:10]
    user = User.objects.create(email=f"{handle}@example.com", username=handle, first_name="Test")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=workspace_role)
    if project is not None:
        ProjectMember.objects.create(project=project, workspace=workspace, member=user, role=project_role)
        for role in functional_roles:
            ProjectMemberFunctionalRole.objects.create(project=project, member=user, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


def updates_url(workspace, project, issue, pk=None, suffix=""):
    base = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/structured-updates/"
    return base + (f"{pk}/" if pk else "") + suffix


def settings_url(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/structured-updates/settings/"


def roles_url(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/structured-updates/roles/"


DEV = {
    "role": "dev",
    "root_cause_category": "code",
    "root_cause": "Null check missing",
    "resolution": "Added guard",
    "pr_link": "https://github.com/org/repo/pull/1",
}
QA_PASS = {"role": "qa", "result": "passed", "validation": "Verified on staging", "testmo_ref": "TM-12"}
QA_FAIL = {"role": "qa", "result": "failed", "validation": "Still broken on Safari"}
BA_APPROVE = {"role": "ba", "result": "approved", "validation": "Matches requirement"}
BA_REJECT = {"role": "ba", "result": "rejected", "validation": "Copy is wrong"}


def set_state(issue, state):
    Issue.objects.filter(pk=issue.pk).update(state=state)


# ---------------------------------------------------------------- permissions


@pytest.mark.parametrize(
    "role,payload,start",
    [("dev", DEV, "in_progress"), ("qa", QA_PASS, "ready_for_qa"), ("ba", BA_APPROVE, "ready_for_ba")],
)
def test_each_role_can_submit_own_template(workspace, project, states, issue, role, payload, start):
    set_state(issue, states[start])
    _, client = make_user(workspace, project, functional_roles=[role])
    response = client.post(updates_url(workspace, project, issue), payload, format="json")
    assert response.status_code == 201, response.data
    assert response.data["role"] == role


@pytest.mark.parametrize(
    "held,payload,start",
    [
        ("dev", QA_PASS, "ready_for_qa"),
        ("dev", BA_APPROVE, "ready_for_ba"),
        ("qa", DEV, "in_progress"),
        ("qa", BA_APPROVE, "ready_for_ba"),
        ("ba", DEV, "in_progress"),
        ("ba", QA_PASS, "ready_for_qa"),
    ],
)
def test_wrong_role_is_rejected_by_api(workspace, project, states, issue, held, payload, start):
    set_state(issue, states[start])
    _, client = make_user(workspace, project, functional_roles=[held])
    response = client.post(updates_url(workspace, project, issue), payload, format="json")
    assert response.status_code == 403
    assert not StructuredUpdate.objects.exists()


def test_member_with_multiple_roles_can_submit_each(workspace, project, states, issue):
    _, client = make_user(workspace, project, functional_roles=["dev", "qa"])
    assert client.post(updates_url(workspace, project, issue), DEV, format="json").status_code == 201
    assert client.post(updates_url(workspace, project, issue), QA_PASS, format="json").status_code == 201


def test_admin_without_functional_role_cannot_submit(session_client, workspace, project, issue):
    response = session_client.post(updates_url(workspace, project, issue), DEV, format="json")
    assert response.status_code == 403


def test_guest_cannot_submit_even_with_role(workspace, project, issue):
    _, client = make_user(workspace, project, project_role=5, functional_roles=["dev"], workspace_role=5)
    assert client.post(updates_url(workspace, project, issue), DEV, format="json").status_code == 403


def test_non_member_cannot_read_or_submit(workspace, project, issue):
    _, client = make_user(workspace)  # workspace member, not in the project
    assert client.get(updates_url(workspace, project, issue)).status_code == 403
    assert client.post(updates_url(workspace, project, issue), DEV, format="json").status_code == 403


def test_unauthenticated_direct_call_is_rejected(workspace, project, issue):
    response = APIClient().post(updates_url(workspace, project, issue), DEV, format="json")
    assert response.status_code in (401, 403)


def test_issue_from_another_project_is_not_reachable(workspace, project, states, issue):
    other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace)
    other_issue = Issue.objects.create(project=other, name="Elsewhere")
    _, client = make_user(workspace, project, functional_roles=["dev"])
    response = client.post(updates_url(workspace, project, other_issue), DEV, format="json")
    assert response.status_code == 404


def test_feature_flag_off_blocks_everything(workspace, project, states, issue, setting):
    setting.is_enabled = False
    setting.save()
    _, client = make_user(workspace, project, functional_roles=["dev"])
    assert client.post(updates_url(workspace, project, issue), DEV, format="json").status_code == 403
    assert client.get(updates_url(workspace, project, issue)).status_code == 403


def test_feature_flag_defaults_off(session_client, workspace, project, states):
    response = session_client.get(settings_url(workspace, project))
    assert response.status_code == 200
    assert response.data["is_enabled"] is False
    assert response.data["dev_submit_state"] == states["ready_for_qa"].id


def set_instance_switch(value):
    InstanceConfiguration.objects.update_or_create(
        key="ENABLE_STRUCTURED_UPDATES", defaults={"value": value, "category": "FEATURES"}
    )


def test_instance_switch_on_by_default(session_client, workspace, project, setting):
    assert session_client.get(settings_url(workspace, project)).data["instance_enabled"] is True


def test_instance_switch_off_blocks_everything(session_client, workspace, project, states, issue, posted):
    _, client, pk = posted
    set_instance_switch("0")
    settings_response = session_client.get(settings_url(workspace, project))
    assert settings_response.data["instance_enabled"] is False
    assert settings_response.data["is_enabled"] is True  # project setting is kept as is
    assert client.get(updates_url(workspace, project, issue)).status_code == 403
    response = client.post(updates_url(workspace, project, issue), DEV, format="json")
    assert response.status_code == 403
    assert "instance" in response.data["error"]
    assert (
        client.patch(updates_url(workspace, project, issue, pk), {"resolution": "x"}, format="json").status_code == 403
    )
    assert correct(client, workspace, project, issue, pk, root_cause_category="data", reason="x").status_code == 403
    assert StructuredUpdate.objects.filter(issue=issue).count() == 1  # data is kept
    # Free-text comments are not affected.
    comment = session_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/comments/",
        {"comment_html": "<p>still works</p>"},
        format="json",
    )
    assert comment.status_code == 201

    set_instance_switch("1")
    assert client.get(updates_url(workspace, project, issue)).status_code == 200


def test_only_admins_change_settings_and_roles(workspace, project, setting):
    member, client = make_user(workspace, project, functional_roles=["dev"])
    assert client.patch(settings_url(workspace, project), {"is_enabled": False}, format="json").status_code == 403
    response = client.put(roles_url(workspace, project), {"member_id": str(member.id), "roles": ["qa"]}, format="json")
    assert response.status_code == 403


def test_admin_assigns_roles(session_client, workspace, project, setting):
    member, _ = make_user(workspace, project)
    response = session_client.put(
        roles_url(workspace, project), {"member_id": str(member.id), "roles": ["dev", "ba"]}, format="json"
    )
    assert response.status_code == 200, response.data
    assert set(ProjectMemberFunctionalRole.objects.filter(member=member).values_list("role", flat=True)) == {
        "dev",
        "ba",
    }
    session_client.put(roles_url(workspace, project), {"member_id": str(member.id), "roles": ["qa"]}, format="json")
    assert list(ProjectMemberFunctionalRole.objects.filter(member=member).values_list("role", flat=True)) == ["qa"]


def test_roles_cannot_be_given_to_guests(session_client, workspace, project, setting):
    guest, _ = make_user(workspace, project, project_role=5, workspace_role=5)
    response = session_client.put(
        roles_url(workspace, project), {"member_id": str(guest.id), "roles": ["qa"]}, format="json"
    )
    assert response.status_code == 400


def test_settings_reject_states_from_other_projects(session_client, workspace, project, setting):
    other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace)
    foreign = State.objects.create(project=other, name="Foreign", color="#000000")
    response = session_client.patch(
        settings_url(workspace, project), {"qa_passed_state": str(foreign.id)}, format="json"
    )
    assert response.status_code == 400


# ------------------------------------------------------------ required fields


@pytest.mark.parametrize("blank", ["", "   ", "\n\t "])
@pytest.mark.parametrize(
    "role,payload,field",
    [
        ("dev", DEV, "root_cause"),
        ("dev", DEV, "resolution"),
        ("dev", DEV, "root_cause_category"),
        ("qa", QA_PASS, "validation"),
        ("qa", QA_PASS, "result"),
        ("ba", BA_APPROVE, "validation"),
        ("ba", BA_APPROVE, "result"),
    ],
)
def test_required_fields_reject_blank_and_spaces(workspace, project, states, issue, role, payload, field, blank):
    set_state(issue, states["ready_for_qa" if role == "qa" else "ready_for_ba" if role == "ba" else "in_progress"])
    _, client = make_user(workspace, project, functional_roles=[role])
    response = client.post(updates_url(workspace, project, issue), {**payload, field: blank}, format="json")
    assert response.status_code == 400
    assert field in response.data


def test_invalid_result_and_category_rejected(workspace, project, states, issue):
    set_state(issue, states["ready_for_qa"])
    _, client = make_user(workspace, project, functional_roles=["dev", "qa"])
    url = updates_url(workspace, project, issue)
    assert client.post(url, {**QA_PASS, "result": "approved"}, format="json").status_code == 400
    assert client.post(url, {**DEV, "root_cause_category": "luck"}, format="json").status_code == 400


@pytest.mark.parametrize(
    "link", ["javascript:alert(1)", "data:text/html,<script>", "ftp://files.example.com/x", "not a url"]
)
def test_only_http_links_allowed(workspace, project, states, issue, link):
    _, client = make_user(workspace, project, functional_roles=["dev"])
    url = updates_url(workspace, project, issue)
    assert client.post(url, {**DEV, "pr_link": link}, format="json").status_code == 400
    assert client.post(url, {**DEV, "links": [{"url": link}]}, format="json").status_code == 400


def test_html_is_stored_and_returned_literally(workspace, project, states, issue):
    _, client = make_user(workspace, project, functional_roles=["dev"])
    response = client.post(updates_url(workspace, project, issue), {**DEV, "root_cause": "<b>bold</b>"}, format="json")
    assert response.status_code == 201
    assert response.data["root_cause"] == "<b>bold</b>"


def test_fields_from_other_templates_are_dropped(workspace, project, states, issue):
    _, client = make_user(workspace, project, functional_roles=["dev"])
    response = client.post(
        updates_url(workspace, project, issue), {**DEV, "result": "passed", "validation": "x"}, format="json"
    )
    assert response.status_code == 201
    assert response.data["result"] == "" and response.data["validation"] == ""


# --------------------------------------------------- transitions and QA rounds


def summary(issue):
    return IssueStructuredSummary.objects.get(issue=issue)


def test_full_mapping_and_round_counter(workspace, project, states, issue):
    _, dev = make_user(workspace, project, functional_roles=["dev"])
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    _, ba = make_user(workspace, project, functional_roles=["ba"])
    url = updates_url(workspace, project, issue)

    assert dev.post(url, DEV, format="json").status_code == 201
    issue.refresh_from_db()
    assert issue.state == states["ready_for_qa"]
    assert summary(issue).root_cause_category == "code"

    response = qa.post(url, QA_FAIL, format="json")
    assert response.data["qa_round"] == 1
    issue.refresh_from_db()
    assert issue.state == states["in_progress"]
    assert (summary(issue).latest_qa_result, summary(issue).qa_round_count) == ("failed", 1)

    dev.post(url, DEV, format="json")
    response = qa.post(url, QA_PASS, format="json")
    assert response.data["qa_round"] == 2
    issue.refresh_from_db()
    assert issue.state == states["ready_for_ba"]
    assert (summary(issue).latest_qa_result, summary(issue).qa_round_count) == ("passed", 2)

    assert ba.post(url, BA_REJECT, format="json").status_code == 201
    issue.refresh_from_db()
    assert issue.state == states["in_progress"]
    assert summary(issue).latest_ba_result == "rejected"

    set_state(issue, states["ready_for_ba"])
    assert ba.post(url, BA_APPROVE, format="json").status_code == 201
    issue.refresh_from_db()
    assert issue.state == states["done"]
    assert issue.completed_at is not None
    assert summary(issue).latest_ba_result == "approved"


def test_ba_rejection_starts_new_qa_round(workspace, project, states, issue):
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    _, ba = make_user(workspace, project, functional_roles=["ba"])
    url = updates_url(workspace, project, issue)
    set_state(issue, states["ready_for_qa"])
    assert qa.post(url, QA_PASS, format="json").data["qa_round"] == 1
    assert ba.post(url, BA_REJECT, format="json").status_code == 201
    set_state(issue, states["ready_for_qa"])
    response = qa.post(url, QA_PASS, format="json")
    assert response.data["qa_round"] == 2
    assert summary(issue).qa_round_count == 2


def test_qa_gate_blocks_wrong_state(workspace, project, states, issue):
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    response = qa.post(updates_url(workspace, project, issue), QA_PASS, format="json")
    assert response.status_code == 409
    response = qa.post(updates_url(workspace, project, issue), {**QA_PASS, "override_state_gate": True}, format="json")
    assert response.status_code == 409  # only project admins may override


def test_ba_gate_blocks_wrong_state(workspace, project, states, issue):
    set_state(issue, states["ready_for_qa"])
    _, ba = make_user(workspace, project, functional_roles=["ba"])
    assert ba.post(updates_url(workspace, project, issue), BA_APPROVE, format="json").status_code == 409


def test_admin_can_override_gate(workspace, project, states, issue):
    _, admin = make_user(workspace, project, project_role=20, functional_roles=["qa"])
    response = admin.post(
        updates_url(workspace, project, issue), {**QA_PASS, "override_state_gate": True}, format="json"
    )
    assert response.status_code == 201, response.data
    assert response.data["state_gate_overridden"] is True


def test_gate_can_be_disabled(workspace, project, states, issue, setting):
    setting.enforce_state_gate = False
    setting.save()
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    assert qa.post(updates_url(workspace, project, issue), QA_PASS, format="json").status_code == 201


def test_dev_blocked_on_completed_items(workspace, project, states, issue):
    set_state(issue, states["done"])
    _, dev = make_user(workspace, project, functional_roles=["dev"])
    assert dev.post(updates_url(workspace, project, issue), DEV, format="json").status_code == 409


def test_unmapped_target_saves_without_state_change(workspace, project, states, issue, setting):
    setting.dev_submit_state = None
    setting.save()
    _, dev = make_user(workspace, project, functional_roles=["dev"])
    response = dev.post(updates_url(workspace, project, issue), DEV, format="json")
    assert response.status_code == 201
    assert response.data["expected_step"] == "Ready for QA"
    assert "Ready for QA" in response.data["warning"]
    issue.refresh_from_db()
    assert issue.state == states["in_progress"]


# ------------------------------------------------------------------ edit rules


@pytest.fixture
def posted(workspace, project, states, issue):
    user, client = make_user(workspace, project, functional_roles=["dev"])
    response = client.post(updates_url(workspace, project, issue), DEV, format="json")
    return user, client, response.data["id"]


def test_notes_editable_with_history(workspace, project, issue, posted):
    _, client, pk = posted
    response = client.patch(updates_url(workspace, project, issue, pk), {"resolution": "Better guard"}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["resolution"] == "Better guard"
    assert response.data["edited_at"] is not None
    assert response.data["revision_count"] == 1
    revision = StructuredUpdateRevision.objects.get(structured_update_id=pk)
    assert revision.changes == {"resolution": {"old": "Added guard", "new": "Better guard"}}
    history = client.get(updates_url(workspace, project, issue, pk, "revisions/"))
    assert history.status_code == 200 and len(history.data) == 1


@pytest.mark.parametrize("field,value", [("root_cause_category", "data"), ("role", "qa"), ("result", "passed")])
def test_locked_fields_cannot_change(workspace, project, issue, posted, field, value):
    _, client, pk = posted
    response = client.patch(updates_url(workspace, project, issue, pk), {field: value}, format="json")
    assert response.status_code == 400
    assert StructuredUpdate.objects.get(pk=pk).root_cause_category == "code"


def test_qa_result_locked(workspace, project, states, issue):
    set_state(issue, states["ready_for_qa"])
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    pk = qa.post(updates_url(workspace, project, issue), QA_PASS, format="json").data["id"]
    response = qa.patch(updates_url(workspace, project, issue, pk), {"result": "failed"}, format="json")
    assert response.status_code == 400
    assert (
        qa.patch(updates_url(workspace, project, issue, pk), {"validation": "Re-checked"}, format="json").status_code
        == 200
    )
    assert StructuredUpdate.objects.get(pk=pk).result == "passed"


def test_edit_rejects_blank_required_note(workspace, project, issue, posted):
    _, client, pk = posted
    response = client.patch(updates_url(workspace, project, issue, pk), {"root_cause": "   "}, format="json")
    assert response.status_code == 400


def test_only_author_can_edit(workspace, project, issue, posted, session_client):
    _, client, pk = posted
    _, other = make_user(workspace, project, functional_roles=["dev"])
    assert (
        other.patch(updates_url(workspace, project, issue, pk), {"resolution": "x"}, format="json").status_code == 403
    )
    assert (
        session_client.patch(updates_url(workspace, project, issue, pk), {"resolution": "x"}, format="json").status_code
        == 403
    )


# ----------------------------------------------------------------- corrections


def correct(client, workspace, project, issue, pk, **data):
    return client.post(updates_url(workspace, project, issue, pk, "correct/"), data, format="json")


def test_qa_can_correct_wrong_failure(workspace, project, states, issue):
    set_state(issue, states["ready_for_qa"])
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    pk = qa.post(updates_url(workspace, project, issue), QA_FAIL, format="json").data["id"]
    issue.refresh_from_db()
    assert issue.state == states["in_progress"]

    # The state check is skipped: the item is no longer in Ready for QA.
    response = correct(qa, workspace, project, issue, pk, result="passed", reason="Clicked the wrong result")
    assert response.status_code == 201, response.data
    assert str(response.data["corrects_id"]) == pk
    assert response.data["correction_reason"] == "Clicked the wrong result"
    assert response.data["qa_round"] == 1  # same round, not a new one
    assert response.data["validation"] == QA_FAIL["validation"]  # notes copied from the original
    issue.refresh_from_db()
    assert issue.state == states["ready_for_ba"]
    assert (summary(issue).latest_qa_result, summary(issue).qa_round_count) == ("passed", 1)
    original = qa.get(updates_url(workspace, project, issue, pk)).data
    assert original["result"] == "failed"  # the original is kept as posted
    assert original["corrected_by_id"] == response.data["id"]


def test_corrected_ba_rejection_does_not_start_new_qa_round(workspace, project, states, issue):
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    _, ba = make_user(workspace, project, functional_roles=["ba"])
    url = updates_url(workspace, project, issue)
    set_state(issue, states["ready_for_qa"])
    qa.post(url, QA_PASS, format="json")
    pk = ba.post(url, BA_REJECT, format="json").data["id"]
    assert correct(ba, workspace, project, issue, pk, result="approved", reason="Wrong item").status_code == 201
    issue.refresh_from_db()
    assert issue.state == states["done"]
    set_state(issue, states["ready_for_qa"])
    assert qa.post(url, QA_PASS, format="json").data["qa_round"] == 1


def test_dev_can_correct_root_cause_category(workspace, project, issue, posted):
    _, client, pk = posted
    response = correct(client, workspace, project, issue, pk, root_cause_category="config", reason="It was a flag")
    assert response.status_code == 201, response.data
    assert response.data["root_cause_category"] == "config"
    assert summary(issue).root_cause_category == "config"


def test_only_author_can_correct(workspace, project, states, issue):
    set_state(issue, states["ready_for_qa"])
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    _, other_qa = make_user(workspace, project, functional_roles=["qa"])
    _, admin = make_user(workspace, project, project_role=20, functional_roles=["qa"])
    pk = qa.post(updates_url(workspace, project, issue), QA_FAIL, format="json").data["id"]
    assert correct(other_qa, workspace, project, issue, pk, result="passed", reason="x").status_code == 403
    assert correct(admin, workspace, project, issue, pk, result="passed", reason="x").status_code == 403


def test_author_who_lost_role_cannot_correct(workspace, project, states, issue):
    set_state(issue, states["ready_for_qa"])
    user, qa = make_user(workspace, project, functional_roles=["qa"])
    pk = qa.post(updates_url(workspace, project, issue), QA_FAIL, format="json").data["id"]
    ProjectMemberFunctionalRole.objects.filter(project=project, member=user).delete()
    assert correct(qa, workspace, project, issue, pk, result="passed", reason="x").status_code == 403


def test_only_latest_update_can_be_corrected(workspace, project, states, issue):
    set_state(issue, states["ready_for_qa"])
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    _, dev = make_user(workspace, project, functional_roles=["dev"])
    pk = qa.post(updates_url(workspace, project, issue), QA_FAIL, format="json").data["id"]
    dev.post(updates_url(workspace, project, issue), DEV, format="json")
    response = correct(qa, workspace, project, issue, pk, result="passed", reason="x")
    assert response.status_code == 400
    assert "most recent" in response.data["error"]


@pytest.mark.parametrize(
    "data",
    [
        {"result": "failed", "reason": "same"},  # unchanged result
        {"result": "approved", "reason": "x"},  # not a QA result
        {"result": "passed", "reason": "   "},  # blank reason
        {"result": "passed"},  # missing reason
    ],
)
def test_invalid_corrections_rejected(workspace, project, states, issue, data):
    set_state(issue, states["ready_for_qa"])
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    pk = qa.post(updates_url(workspace, project, issue), QA_FAIL, format="json").data["id"]
    assert correct(qa, workspace, project, issue, pk, **data).status_code == 400
    assert StructuredUpdate.objects.filter(issue=issue).count() == 1


def test_correction_blocked_when_flag_off(workspace, project, states, issue, setting):
    set_state(issue, states["ready_for_qa"])
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    pk = qa.post(updates_url(workspace, project, issue), QA_FAIL, format="json").data["id"]
    setting.is_enabled = False
    setting.save()
    assert correct(qa, workspace, project, issue, pk, result="passed", reason="x").status_code == 403


def test_evidence_links_can_be_added_later(workspace, project, issue, posted):
    _, client, pk = posted
    url = updates_url(workspace, project, issue, pk, "links/")
    response = client.post(url, {"url": "https://example.com/log", "title": "Log"}, format="json")
    assert response.status_code == 201
    assert response.data["links"][0]["url"] == "https://example.com/log"
    assert client.post(url, {"url": "javascript:alert(1)"}, format="json").status_code == 400


# -------------------------------------------------------------------- evidence


@pytest.mark.parametrize(
    "file_type,size",
    [("image/svg+xml", 100), ("application/pdf", 100), ("text/html", 100), ("image/png", 51 * 1024 * 1024)],
)
def test_evidence_type_and_size_limits(workspace, project, issue, posted, file_type, size):
    _, client, pk = posted
    response = client.post(
        updates_url(workspace, project, issue, pk, "evidence/"),
        {"name": "x", "type": file_type, "size": size},
        format="json",
    )
    assert response.status_code == 400
    assert not FileAsset.objects.filter(entity_identifier=pk).exists()


@patch("plane.app.views.issue.structured_update.S3Storage")
def test_evidence_upload_flow(storage, workspace, project, issue, posted):
    storage.return_value.generate_presigned_post.return_value = {"url": "https://s3/", "fields": {}}
    _, client, pk = posted
    response = client.post(
        updates_url(workspace, project, issue, pk, "evidence/"),
        {"name": "screen.png", "type": "image/png", "size": 1024},
        format="json",
    )
    assert response.status_code == 200, response.data
    storage.return_value.generate_presigned_post.assert_called_once()
    assert storage.return_value.generate_presigned_post.call_args.kwargs["file_size"] == 1024
    asset_id = response.data["asset_id"]
    done = client.patch(updates_url(workspace, project, issue, pk, f"evidence/{asset_id}/"), {}, format="json")
    assert done.status_code == 200
    assert done.data["evidence"][0]["name"] == "screen.png"


# ------------------------------------------------------------- data exposure


def test_response_does_not_leak_user_details(workspace, project, issue, posted):
    _, client, _ = posted
    response = client.get(updates_url(workspace, project, issue))
    assert response.status_code == 200
    actor = response.data["results"][0]["actor"]
    assert set(actor) == {"id", "display_name", "avatar_url"}
    assert "@" not in json.dumps(response.data, default=str)


# ------------------------------------------------------ comments still work


def test_free_text_comments_unchanged(session_client, workspace, project, issue, posted):
    url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/comments/"
    response = session_client.post(url, {"comment_html": "<p>Plain comment</p>"}, format="json")
    assert response.status_code == 201, response.data
    assert IssueComment.objects.filter(issue=issue).count() == 1
    edit = session_client.patch(f"{url}{response.data['id']}/", {"comment_html": "<p>Edited</p>"}, format="json")
    assert edit.status_code == 200
    activity = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/history/")
    assert activity.status_code == 200


# --------------------------------------------------------------------- filters


def test_issue_list_filters_on_results(session_client, workspace, project, states, issue):
    other = Issue.objects.create(project=project, name="Untouched", state=states["todo"])
    set_state(issue, states["ready_for_qa"])
    _, qa = make_user(workspace, project, functional_roles=["qa"])
    qa.post(updates_url(workspace, project, issue), QA_FAIL, format="json")
    url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"
    for filters in ({"qa_result__in": "failed"}, {"qa_round": 1}):
        response = session_client.get(url, {"filters": json.dumps(filters)})
        assert response.status_code == 200, response.data
        body = json.dumps(response.data, default=str)
        assert str(issue.id) in body and str(other.id) not in body
