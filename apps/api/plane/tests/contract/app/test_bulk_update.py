import json
import time
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from django.core import signing
from django.utils import timezone
from rest_framework.test import APIClient

from plane.db.models import (
    Cycle,
    CycleIssue,
    Estimate,
    EstimatePoint,
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueLabel,
    IssueComment,
    IssueSequence,
    IssueType,
    FileAsset,
    Label,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceMember,
)
from plane.db.models.issue_type import ProjectIssueType

pytestmark = [pytest.mark.contract, pytest.mark.django_db]


@pytest.fixture(autouse=True)
def no_tasks():
    with patch("celery.app.task.Task.apply_async"):
        yield


@pytest.fixture
def bulk_project(workspace, create_user):
    project = Project.objects.create(workspace=workspace, name="Bulk source", identifier="BULK")
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    State.objects.create(project=project, name="Ready", color="#60646C", group="unstarted", default=True)
    return project


def url(workspace, project):
    return f"/api/workspaces/{workspace.slug}/bulk-update/"


def payload(project, items, **extra):
    return {
        "project_id": str(project.id),
        "issue_ids": [str(i.id) for i in items],
        "operation": "update",
        "changes": {"priority": "high"},
        "action": "preview",
        **extra,
    }


def apply(client, endpoint, data):
    response = client.post(endpoint, data, format="json")
    assert response.status_code == 200, response.data
    return client.post(endpoint, {**data, "action": "apply", "token": response.data["token"]}, format="json")


def test_selection_is_explicit_and_paginated(session_client, workspace, bulk_project):
    for n in range(27):
        Issue.objects.create(project=bulk_project, name=f"Work {n}")
    endpoint = url(workspace, bulk_project)
    response = session_client.get(endpoint)
    assert response.status_code == 200
    assert "results" not in response.data
    page = session_client.get(endpoint, {"project_id": bulk_project.id, "page": 2})
    assert page.status_code == 200, page.data
    assert page.data["count"] == 27
    assert len(page.data["results"]) == 2


@pytest.mark.parametrize("operation", ["update", "move", "archive"])
def test_member_cannot_preview_or_execute(session_client, workspace, bulk_project, create_user, operation):
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
    ProjectMember.objects.filter(project=bulk_project, member=create_user).update(role=15)
    endpoint = url(workspace, bulk_project)
    assert session_client.get(endpoint).status_code == 403
    assert (
        session_client.post(endpoint, {"operation": operation, "action": "preview"}, format="json").status_code == 403
    )
    assert session_client.post(endpoint, {"operation": operation, "action": "apply"}, format="json").status_code == 403


def test_preview_no_write_multi_field_apply_and_replay(session_client, workspace, bulk_project):
    items = [Issue.objects.create(project=bulk_project, name=f"Work {i}") for i in range(2)]
    untouched = Issue.objects.create(project=bulk_project, name="Untouched")
    state = State.objects.create(project=bulk_project, name="Done", color="#60646C", group="completed")
    data = payload(bulk_project, items, changes={"priority": "urgent", "state_id": str(state.id), "assignee_ids": []})
    endpoint = url(workspace, bulk_project)
    review = session_client.post(endpoint, data, format="json")
    assert review.status_code == 200, review.data
    assert Issue.objects.filter(id__in=[i.id for i in items], priority="none").count() == 2
    execute = {**data, "action": "apply", "token": review.data["token"]}
    assert session_client.post(endpoint, execute, format="json").status_code == 200
    for item in items:
        item.refresh_from_db()
        assert item.priority == "urgent"
        assert item.state_id == state.id
        assert item.completed_at is not None
    untouched.refresh_from_db()
    assert untouched.priority == "none"
    assert session_client.post(endpoint, execute, format="json").status_code == 409


def test_changed_item_requires_new_review(session_client, workspace, bulk_project):
    item = Issue.objects.create(project=bulk_project, name="Before")
    data = payload(bulk_project, [item])
    endpoint = url(workspace, bulk_project)
    review = session_client.post(endpoint, data, format="json")
    item.name = "Changed"
    item.save()
    assert (
        session_client.post(
            endpoint, {**data, "action": "apply", "token": review.data["token"]}, format="json"
        ).status_code
        == 409
    )
    item.refresh_from_db()
    assert item.priority == "none"


def test_bulk_delete_is_disabled(session_client, workspace, bulk_project):
    item = Issue.objects.create(project=bulk_project, name="Keep")
    for action in ["preview", "apply"]:
        response = session_client.post(
            url(workspace, bulk_project),
            payload(bulk_project, [item], operation="delete", action=action),
            format="json",
        )
        assert response.status_code == 400
    item.refresh_from_db()
    assert item.deleted_at is None


def test_each_item_can_move_to_a_different_project(session_client, workspace, bulk_project, create_user):
    items = [Issue.objects.create(project=bulk_project, name=f"Work {i}") for i in range(2)]
    destinations = []
    for n in range(2):
        destination = Project.objects.create(workspace=workspace, name=f"Destination {n}", identifier=f"DST{n}")
        ProjectMember.objects.create(project=destination, member=create_user, role=20)
        State.objects.create(project=destination, name="Ready", color="#60646C", group="unstarted")
        destinations.append(destination)
    data = payload(
        bulk_project,
        items,
        operation="move",
        changes={},
        destinations={str(i.id): str(p.id) for i, p in zip(items, destinations)},
    )
    response = apply(session_client, url(workspace, bulk_project), data)
    assert response.status_code == 200, response.data
    for item, destination in zip(items, destinations):
        item.refresh_from_db()
        assert item.project_id == destination.id
        assert item.state.project_id == destination.id
        assert item.sequence_id == 1


def test_invalid_or_foreign_item_aborts_entire_batch(session_client, workspace, bulk_project):
    from uuid import uuid4

    item = Issue.objects.create(project=bulk_project, name="Keep")
    data = payload(bulk_project, [item])
    data["issue_ids"].append(str(uuid4()))
    assert session_client.post(url(workspace, bulk_project), data, format="json").status_code == 400
    item.refresh_from_db()
    assert item.priority == "none"


def test_assignment_is_explicit_replacement(session_client, workspace, bulk_project, create_user):
    item = Issue.objects.create(project=bulk_project, name="Assigned")
    IssueAssignee.objects.create(project=bulk_project, issue=item, assignee=create_user)
    response = apply(
        session_client, url(workspace, bulk_project), payload(bulk_project, [item], changes={"assignee_ids": []})
    )
    assert response.status_code == 200, response.data
    assert not IssueAssignee.objects.filter(issue=item).exists()


def test_labels_dates_cycle_modules_and_parent_update_and_clear(session_client, workspace, bulk_project, create_user):
    label = Label.objects.create(project=bulk_project, name="Request")
    module = Module.objects.create(project=bulk_project, name="Student App")
    cycle = Cycle.objects.create(project=bulk_project, name="Sprint", owned_by=create_user)
    parent = Issue.objects.create(project=bulk_project, name="Parent")
    item = Issue.objects.create(project=bulk_project, name="Change fields")
    response = apply(
        session_client,
        url(workspace, bulk_project),
        payload(
            bulk_project,
            [item],
            changes={
                "label_ids": [str(label.id)],
                "module_ids": [str(module.id)],
                "cycle_id": str(cycle.id),
                "parent_id": str(parent.id),
                "start_date": "2026-10-27",
                "target_date": "2026-10-30",
            },
        ),
    )
    assert response.status_code == 200, response.data
    item.refresh_from_db()
    assert item.parent_id == parent.id
    assert str(item.start_date) == "2026-10-27"
    assert str(item.target_date) == "2026-10-30"
    assert IssueLabel.objects.filter(issue=item, label=label).exists()
    assert ModuleIssue.objects.filter(issue=item, module=module).exists()
    assert CycleIssue.objects.filter(issue=item, cycle=cycle).exists()
    response = apply(
        session_client,
        url(workspace, bulk_project),
        payload(
            bulk_project,
            [item],
            changes={
                "label_ids": [],
                "module_ids": [],
                "cycle_id": None,
                "parent_id": None,
                "start_date": None,
                "target_date": None,
            },
        ),
    )
    assert response.status_code == 200, response.data
    item.refresh_from_db()
    assert item.parent_id is None and item.start_date is None and item.target_date is None
    assert not IssueLabel.objects.filter(issue=item).exists()
    assert not ModuleIssue.objects.filter(issue=item).exists()
    assert not CycleIssue.objects.filter(issue=item).exists()


def test_partial_date_change_checks_unchanged_other_date_for_whole_batch(session_client, workspace, bulk_project):
    first = Issue.objects.create(project=bulk_project, name="Valid", target_date="2026-11-10")
    second = Issue.objects.create(project=bulk_project, name="Invalid", target_date="2026-10-30")
    data = payload(bulk_project, [first, second], changes={"start_date": "2026-11-01", "priority": "urgent"})
    response = session_client.post(url(workspace, bulk_project), data, format="json")
    assert response.status_code == 400, response.data
    assert Issue.objects.filter(id__in=[first.id, second.id], priority="none", start_date__isnull=True).count() == 2


def test_descendant_parent_and_foreign_project_relations_are_rejected(
    session_client, workspace, bulk_project, create_user
):
    parent = Issue.objects.create(project=bulk_project, name="Parent")
    child = Issue.objects.create(project=bulk_project, name="Child", parent=parent)
    foreign = Project.objects.create(workspace=workspace, name="Other", identifier="OTH")
    label = Label.objects.create(project=foreign, name="Other")
    module = Module.objects.create(project=foreign, name="Other")
    cycle = Cycle.objects.create(project=foreign, name="Other", owned_by=create_user)
    other_parent = Issue.objects.create(project=foreign, name="Other parent")
    for changes in [
        {"parent_id": str(child.id)},
        {"parent_id": str(other_parent.id)},
        {"label_ids": [str(label.id)]},
        {"module_ids": [str(module.id)]},
        {"cycle_id": str(cycle.id)},
    ]:
        response = session_client.post(
            url(workspace, bulk_project), payload(bulk_project, [parent], changes=changes), format="json"
        )
        assert response.status_code == 400, response.data


def test_source_admin_cannot_move_to_a_project_they_do_not_administer(
    session_client,
    workspace,
    bulk_project,
    create_user,
):
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
    destination = Project.objects.create(workspace=workspace, name="Restricted", identifier="SEC")
    ProjectMember.objects.create(project=destination, member=create_user, role=15)
    item = Issue.objects.create(project=bulk_project, name="Keep here")
    data = payload(bulk_project, [item], operation="move", changes={}, destinations={str(item.id): str(destination.id)})
    response = session_client.post(url(workspace, bulk_project), data, format="json")
    assert response.status_code == 403, response.data
    item.refresh_from_db()
    assert item.project_id == bulk_project.id


def test_project_admin_without_workspace_admin_cannot_open_workspace_tool(
    session_client,
    workspace,
    bulk_project,
    create_user,
):
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
    endpoint = url(workspace, bulk_project)
    assert session_client.get(endpoint).status_code == 403
    assert session_client.post(endpoint, {"action": "preview"}, format="json").status_code == 403


def test_move_preserves_resources_and_completed_date(session_client, workspace, bulk_project, create_user):
    from django.utils import timezone
    from datetime import timedelta

    destination = Project.objects.create(workspace=workspace, name="Destination", identifier="DST")
    ProjectMember.objects.create(project=destination, member=create_user, role=20)
    state = State.objects.create(project=bulk_project, name="Done", color="#60646C", group="completed")
    State.objects.create(project=destination, name="Done", color="#60646C", group="completed")
    source_label = Label.objects.create(project=bulk_project, name="Request")
    target_label = Label.objects.create(project=destination, name="Request")
    source_module = Module.objects.create(project=bulk_project, name="Student App")
    target_module = Module.objects.create(project=destination, name="Student App")
    source_cycle = Cycle.objects.create(project=bulk_project, name="Sprint", owned_by=create_user)
    target_cycle = Cycle.objects.create(project=destination, name="Sprint", owned_by=create_user)
    item = Issue.objects.create(project=bulk_project, name="Keep all data", state=state)
    completed = timezone.now() - timedelta(days=7)
    Issue.objects.filter(pk=item.pk).update(completed_at=completed)
    IssueAssignee.objects.create(project=bulk_project, issue=item, assignee=create_user)
    IssueLabel.objects.create(project=bulk_project, issue=item, label=source_label)
    ModuleIssue.objects.create(project=bulk_project, issue=item, module=source_module)
    CycleIssue.objects.create(project=bulk_project, issue=item, cycle=source_cycle)
    asset = FileAsset.objects.create(
        project=bulk_project,
        workspace=workspace,
        issue=item,
        asset="bulk-test.png",
        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
    )
    comment = IssueComment.objects.create(
        project=bulk_project, issue=item, actor=create_user, comment_html="<p>Keep comment</p>"
    )
    data = payload(bulk_project, [item], operation="move", changes={}, destinations={str(item.id): str(destination.id)})
    response = apply(session_client, url(workspace, bulk_project), data)
    assert response.status_code == 200, response.data
    item.refresh_from_db()
    asset.refresh_from_db()
    comment.refresh_from_db()
    assert item.project_id == asset.project_id == comment.project_id == destination.id
    assert item.completed_at == completed
    assert item.name == "Keep all data" and comment.comment_html == "<p>Keep comment</p>"
    assert IssueLabel.objects.filter(issue=item, project=destination, label=target_label).exists()
    assert ModuleIssue.objects.filter(issue=item, project=destination, module=target_module).exists()
    assert CycleIssue.objects.filter(issue=item, project=destination, cycle=target_cycle).exists()
    assert IssueAssignee.objects.filter(issue=item, project=destination, assignee=create_user).exists()
    assert IssueSequence.objects.filter(issue=item, project=bulk_project).exists()
    assert IssueSequence.objects.filter(issue=item, project=destination).exists()


def test_move_parent_and_child_together(session_client, workspace, bulk_project, create_user):
    destination = Project.objects.create(workspace=workspace, name="Destination", identifier="DST")
    ProjectMember.objects.create(project=destination, member=create_user, role=20)
    State.objects.create(project=destination, name="Ready", color="#60646C", group="unstarted")
    parent = Issue.objects.create(project=bulk_project, name="Parent")
    child = Issue.objects.create(project=bulk_project, name="Child", parent=parent)
    endpoint = url(workspace, bulk_project)
    bad = payload(
        bulk_project, [parent], operation="move", changes={}, destinations={str(parent.id): str(destination.id)}
    )
    assert session_client.post(endpoint, bad, format="json").status_code == 400
    good = payload(
        bulk_project,
        [parent, child],
        operation="move",
        changes={},
        destinations={str(i.id): str(destination.id) for i in [parent, child]},
    )
    response = apply(session_client, endpoint, good)
    assert response.status_code == 200, response.data
    child.refresh_from_db()
    parent.refresh_from_db()
    assert child.parent_id == parent.id and child.project_id == parent.project_id == destination.id


def make_user(workspace, name, role=15):
    user = User.objects.create(email=f"{name}@example.com", username=name, first_name=name.title())
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    return user


@pytest.fixture
def destination(workspace, create_user):
    project = Project.objects.create(workspace=workspace, name="Destination", identifier="DST")
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    State.objects.create(project=project, name="Ready", color="#60646C", group="unstarted", default=True)
    return project


def move(project, items, target, **extra):
    return payload(
        project, items, operation="move", changes={}, destinations={str(i.id): str(target.id) for i in items}, **extra
    )


def test_update_rejects_unavailable_choices_without_writing(session_client, workspace, bulk_project, create_user):
    now = timezone.now()
    foreign = Project.objects.create(workspace=workspace, name="Other", identifier="OTH")
    foreign_state = State.objects.create(project=foreign, name="Other", color="#60646C", group="started")
    outsider = make_user(workspace, "outsider")
    guest = make_user(workspace, "guest", role=5)
    ProjectMember.objects.create(project=bulk_project, member=guest, role=5)
    inactive = make_user(workspace, "inactive")
    ProjectMember.objects.create(project=bulk_project, member=inactive, role=15, is_active=False)
    completed = Cycle.objects.create(
        project=bulk_project,
        name="Done sprint",
        owned_by=create_user,
        start_date=now - timedelta(days=14),
        end_date=now - timedelta(days=1),
    )
    archived_cycle = Cycle.objects.create(
        project=bulk_project, name="Archived sprint", owned_by=create_user, archived_at=now
    )
    archived_module = Module.objects.create(project=bulk_project, name="Archived", archived_at=now)
    item = Issue.objects.create(project=bulk_project, name="Keep")
    for changes, error in [
        ({}, "Choose at least one field"),
        ({"state_id": str(foreign_state.id)}, "Choose a state"),
        ({"assignee_ids": [str(outsider.id)]}, "Choose available assignees"),
        ({"assignee_ids": [str(guest.id)]}, "Choose available assignees"),
        ({"assignee_ids": [str(inactive.id)]}, "Choose available assignees"),
        ({"cycle_id": str(completed.id)}, "Choose an available cycle"),
        ({"cycle_id": str(archived_cycle.id)}, "Choose an available cycle"),
        ({"module_ids": [str(archived_module.id)]}, "Choose available modules"),
    ]:
        data = payload(bulk_project, [item], changes=changes)
        for action in ("preview", "apply"):
            response = session_client.post(
                url(workspace, bulk_project), {**data, "action": action, "token": "unused"}, format="json"
            )
            assert response.status_code == 400, (changes, response.data)
            assert error in str(response.data), (changes, response.data)
    item.refresh_from_db()
    assert item.priority == "none" and item.state.project_id == bulk_project.id
    assert not IssueAssignee.objects.filter(issue=item).exists()
    assert not CycleIssue.objects.filter(issue=item).exists()
    assert not ModuleIssue.objects.filter(issue=item).exists()


def test_workspace_labels_are_listed_and_assignable(session_client, workspace, bulk_project):
    shared = Label.objects.create(workspace=workspace, name="Shared")
    foreign = Project.objects.create(workspace=workspace, name="Other", identifier="OTH")
    Label.objects.create(project=foreign, name="Hidden")
    endpoint = url(workspace, bulk_project)
    labels = session_client.get(endpoint, {"project_id": bulk_project.id}).data["metadata"]["labels"]
    assert [label["name"] for label in labels] == ["Shared"]
    item = Issue.objects.create(project=bulk_project, name="Shared label")
    response = apply(session_client, endpoint, payload(bulk_project, [item], changes={"label_ids": [str(shared.id)]}))
    assert response.status_code == 200, response.data
    assert IssueLabel.objects.filter(issue=item, label=shared).exists()


def test_reapplying_current_assignments_keeps_one_active_row(session_client, workspace, bulk_project, create_user):
    label = Label.objects.create(project=bulk_project, name="Request")
    item = Issue.objects.create(project=bulk_project, name="Already assigned")
    IssueAssignee.objects.create(project=bulk_project, issue=item, assignee=create_user)
    IssueLabel.objects.create(project=bulk_project, issue=item, label=label)
    changes = {"assignee_ids": [str(create_user.id)], "label_ids": [str(label.id)]}
    for _ in range(2):
        response = apply(session_client, url(workspace, bulk_project), payload(bulk_project, [item], changes=changes))
        assert response.status_code == 200, response.data
    assert IssueAssignee.objects.filter(issue=item, assignee=create_user).count() == 1
    assert IssueLabel.objects.filter(issue=item, label=label).count() == 1


def test_update_records_bulk_history(session_client, workspace, bulk_project, create_user):
    item = Issue.objects.create(project=bulk_project, name="History")
    response = apply(session_client, url(workspace, bulk_project), payload(bulk_project, [item]))
    assert response.status_code == 200, response.data
    activity = IssueActivity.objects.get(issue=item, field="bulk_update")
    assert activity.verb == "updated" and activity.actor_id == create_user.id
    assert json.loads(activity.old_value) == {"priority": "none"}
    assert activity.comment == "Bulk Update: Priority: High"


MOVE_CONFLICTS = {
    "missing_state": "one matching state",
    "ambiguous_state": "one matching state",
    "label": "one matching label",
    "cycle": "one matching cycle",
    "module": "one matching module",
    "estimate": "one matching estimate value",
    "type": "Enable this work item type",
    "assignee": "All assignees must be active members",
    "stateless": "Assign a state",
    "same_project": "Choose a different destination",
    "missing_destination": "Choose one destination for every",
}


@pytest.mark.parametrize("conflict", MOVE_CONFLICTS)
def test_incompatible_move_blocks_whole_batch(
    conflict, session_client, workspace, bulk_project, destination, create_user
):
    compatible = Issue.objects.create(project=bulk_project, name="Compatible")
    item = Issue.objects.create(project=bulk_project, name="Conflict")
    data = move(bulk_project, [compatible, item], destination)
    if conflict in ("missing_state", "ambiguous_state"):
        review = State.objects.create(project=bulk_project, name="Review", color="#60646C", group="started")
        Issue.objects.filter(pk=item.pk).update(state=review)
        if conflict == "ambiguous_state":
            State.objects.create(project=destination, name="Review", color="#60646C", group="started")
            State.objects.create(project=destination, name="review", color="#60646C", group="started")
    elif conflict == "label":
        IssueLabel.objects.create(
            project=bulk_project, issue=item, label=Label.objects.create(project=bulk_project, name="Only here")
        )
    elif conflict == "cycle":
        cycle = Cycle.objects.create(project=bulk_project, name="Only here", owned_by=create_user)
        CycleIssue.objects.create(project=bulk_project, issue=item, cycle=cycle)
    elif conflict == "module":
        ModuleIssue.objects.create(
            project=bulk_project, issue=item, module=Module.objects.create(project=bulk_project, name="Only here")
        )
    elif conflict == "estimate":
        source_estimate = Estimate.objects.create(project=bulk_project, name="Points")
        point = EstimatePoint.objects.create(project=bulk_project, estimate=source_estimate, key=1, value="3")
        target_estimate = Estimate.objects.create(project=destination, name="Points")
        EstimatePoint.objects.create(project=destination, estimate=target_estimate, key=1, value="5")
        Project.objects.filter(pk=destination.pk).update(estimate=target_estimate)
        Issue.objects.filter(pk=item.pk).update(estimate_point=point)
    elif conflict == "type":
        bug = IssueType.objects.create(workspace=workspace, name="Bug")
        task = IssueType.objects.create(workspace=workspace, name="Task")
        ProjectIssueType.objects.create(project=destination, issue_type=task)
        Issue.objects.filter(pk=item.pk).update(type=bug)
    elif conflict == "assignee":
        source_only = make_user(workspace, "source-only")
        ProjectMember.objects.create(project=bulk_project, member=source_only, role=15)
        IssueAssignee.objects.create(project=bulk_project, issue=item, assignee=source_only)
    elif conflict == "stateless":
        Issue.objects.filter(pk=item.pk).update(state=None)
    elif conflict == "same_project":
        data["destinations"][str(item.id)] = str(bulk_project.id)
    elif conflict == "missing_destination":
        del data["destinations"][str(item.id)]
    endpoint = url(workspace, bulk_project)
    for action in ("preview", "apply"):
        response = session_client.post(endpoint, {**data, "action": action, "token": "unused"}, format="json")
        assert response.status_code == 400, response.data
        assert MOVE_CONFLICTS[conflict] in str(response.data)
    assert Issue.objects.filter(id__in=[compatible.id, item.id], project=bulk_project).count() == 2
    assert not IssueSequence.objects.filter(project=destination).exists()


def test_move_maps_estimates_rewrites_assets_and_allocates_next_key(
    session_client, workspace, bulk_project, destination, create_user
):
    existing = Issue.objects.create(project=destination, name="Already there")
    shared = Label.objects.create(workspace=workspace, name="Shared")
    source_estimate = Estimate.objects.create(project=bulk_project, name="Points")
    source_point = EstimatePoint.objects.create(project=bulk_project, estimate=source_estimate, key=1, value="3")
    target_estimate = Estimate.objects.create(project=destination, name="Points")
    target_point = EstimatePoint.objects.create(project=destination, estimate=target_estimate, key=1, value="3")
    Project.objects.filter(pk=destination.pk).update(estimate=target_estimate)
    asset_url = f"/api/assets/v2/workspaces/{workspace.slug}/projects/{bulk_project.id}/issues/asset/"
    moved_url = asset_url.replace(str(bulk_project.id), str(destination.id))
    item = Issue.objects.create(
        project=bulk_project,
        name="Rich",
        description_html=f'<p><img src="{asset_url}"></p>',
        description_binary=b"editor-state",
        estimate_point=source_point,
    )
    old_key = f"BULK-{item.sequence_id}"
    IssueLabel.objects.create(project=bulk_project, issue=item, label=shared)
    comment = IssueComment.objects.create(
        project=bulk_project, issue=item, actor=create_user, comment_html=f'<p><img src="{asset_url}"></p>'
    )
    comment_asset = FileAsset.objects.create(
        project=bulk_project,
        workspace=workspace,
        comment=comment,
        asset="bulk-comment.png",
        entity_type=FileAsset.EntityTypeContext.COMMENT_DESCRIPTION,
    )
    response = apply(session_client, url(workspace, bulk_project), move(bulk_project, [item], destination))
    assert response.status_code == 200, response.data
    item.refresh_from_db()
    comment.refresh_from_db()
    comment_asset.refresh_from_db()
    assert item.sequence_id == existing.sequence_id + 1
    assert item.estimate_point_id == target_point.id
    assert moved_url in item.description_html and str(bulk_project.id) not in item.description_html
    assert item.description_binary is None
    assert moved_url in comment.comment_html
    assert comment_asset.project_id == destination.id
    assert IssueLabel.objects.filter(issue=item, label=shared, project=destination).exists()
    activity = IssueActivity.objects.get(issue=item, field="project")
    assert activity.old_value == old_key
    assert activity.new_value == f"DST-{item.sequence_id}"
    assert activity.project_id == destination.id


def test_expired_foreign_altered_or_forged_reviews_are_rejected(session_client, workspace, bulk_project):
    item = Issue.objects.create(project=bulk_project, name="Reviewed")
    endpoint = url(workspace, bulk_project)
    data = payload(bulk_project, [item])
    expired = signing.b62_encode(int(time.time()) - 901)
    with patch.object(signing.TimestampSigner, "timestamp", return_value=expired):
        stale = session_client.post(endpoint, data, format="json").data["token"]
    fresh = session_client.post(endpoint, data, format="json").data["token"]
    other_admin = make_user(workspace, "other-admin", role=20)
    ProjectMember.objects.create(project=bulk_project, member=other_admin, role=20)
    other_client = APIClient()
    other_client.force_authenticate(user=other_admin)
    attempts = [
        (session_client, {**data, "token": stale}),
        (session_client, {**data, "token": "forged"}),
        (session_client, {**data, "token": fresh, "changes": {"priority": "urgent"}}),
        (other_client, {**data, "token": fresh}),
    ]
    for client, attempt in attempts:
        response = client.post(endpoint, {**attempt, "action": "apply"}, format="json")
        assert response.status_code == 409, (attempt, response.data)
    item.refresh_from_db()
    assert item.priority == "none"


def test_search_matches_title_or_key_and_rejects_bad_queries(session_client, workspace, bulk_project):
    Issue.objects.create(project=bulk_project, name="Alpha report")
    second = Issue.objects.create(project=bulk_project, name="Beta")
    endpoint = url(workspace, bulk_project)

    def keys(search):
        response = session_client.get(endpoint, {"project_id": bulk_project.id, "search": search})
        assert response.status_code == 200, response.data
        return [row["key"] for row in response.data["results"]]

    second_key = f"BULK-{second.sequence_id}"
    assert keys("alpha") == ["BULK-1"]
    assert keys(second_key) == [second_key]
    assert keys(str(second.sequence_id)) == [second_key]
    assert keys("missing") == []
    assert session_client.get(endpoint, {"project_id": bulk_project.id, "page": "x"}).status_code == 400
    assert session_client.get(endpoint, {"project_id": "not-a-project"}).status_code == 400


def test_filters_match_any_value_within_a_field_and_all_fields_together(
    session_client, workspace, bulk_project, create_user
):
    ready = State.objects.get(project=bulk_project, name="Ready")
    doing = State.objects.create(project=bulk_project, name="Doing", color="#60646C", group="started")
    first_label = Label.objects.create(project=bulk_project, name="Alpha")
    second_label = Label.objects.create(project=bulk_project, name="Beta")
    member = make_user(workspace, "member")
    ProjectMember.objects.create(project=bulk_project, member=member, role=15)
    parent = Issue.objects.create(project=bulk_project, name="Parent", state=ready)
    first = Issue.objects.create(
        project=bulk_project,
        name="First",
        state=ready,
        priority="high",
        start_date="2026-11-01",
        target_date="2026-11-10",
        parent=parent,
    )
    second = Issue.objects.create(project=bulk_project, name="Second", state=doing, priority="low")
    third = Issue.objects.create(
        project=bulk_project, name="Third", state=doing, priority="high", target_date="2026-12-01"
    )
    IssueLabel.objects.create(project=bulk_project, issue=first, label=first_label)
    IssueLabel.objects.create(project=bulk_project, issue=second, label=second_label)
    IssueAssignee.objects.create(project=bulk_project, issue=first, assignee=create_user)
    IssueAssignee.objects.create(project=bulk_project, issue=third, assignee=member)
    # A removed assignment must not count as assigned.
    IssueAssignee.objects.create(project=bulk_project, issue=second, assignee=member).delete()
    endpoint = url(workspace, bulk_project)

    def keys(**params):
        response = session_client.get(endpoint, {"project_id": bulk_project.id, **params})
        assert response.status_code == 200, (params, response.data)
        return {row["id"] for row in response.data["results"]}

    p, a, b, c = parent.id, first.id, second.id, third.id
    assert keys(state_ids=str(doing.id)) == {b, c}
    assert keys(priorities="high") == {a, c}
    assert keys(priorities="high,low") == {a, b, c}
    assert keys(state_ids=str(doing.id), priorities="high") == {c}
    assert keys(assignee_ids=str(create_user.id)) == {a}
    assert keys(assignee_ids="none") == {p, b}
    assert keys(assignee_ids=f"{member.id},none") == {p, b, c}
    assert keys(label_ids=f"{first_label.id},{second_label.id}") == {a, b}
    assert keys(label_ids="none") == {p, c}
    assert keys(parent_ids=str(parent.id)) == {a}
    assert keys(parent_ids="none") == {p, b, c}
    assert keys(start_date_from="2026-11-01") == {a}
    assert keys(due_date_to="2026-11-30") == {a}
    assert keys(due_date_from="2026-11-05", due_date_to="2026-12-31") == {a, c}
    assert keys(search="Third", priorities="low") == set()
    response = session_client.get(endpoint, {"project_id": bulk_project.id, "parent_ids": str(parent.id)})
    row = response.data["results"][0]
    assert row["labels"] == ["Alpha"] and row["parent"] == f"BULK-{parent.sequence_id}"
    assert str(row["start_date"]) == "2026-11-01" and str(row["target_date"]) == "2026-11-10"
    assert response.data["metadata"]["parents"] == [{"id": parent.id, "name": f"BULK-{parent.sequence_id} · Parent"}]
    for params in [
        {"state_ids": "not-a-state"},
        {"label_ids": f"{first_label.id},bad"},
        {"priorities": "highest"},
        {"start_date_from": "2026-02-30"},
        {"due_date_from": "2026-12-01", "due_date_to": "2026-11-01"},
    ]:
        response = session_client.get(endpoint, {"project_id": bulk_project.id, **params})
        assert response.status_code == 400, (params, response.data)


def test_metadata_lists_only_assignable_choices(session_client, workspace, bulk_project, create_user):
    now = timezone.now()
    Cycle.objects.create(
        project=bulk_project,
        name="Active",
        owned_by=create_user,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=7),
    )
    Cycle.objects.create(project=bulk_project, name="Open", owned_by=create_user)
    Cycle.objects.create(
        project=bulk_project,
        name="Done",
        owned_by=create_user,
        start_date=now - timedelta(days=14),
        end_date=now - timedelta(days=1),
    )
    Cycle.objects.create(project=bulk_project, name="Archived", owned_by=create_user, archived_at=now)
    Module.objects.create(project=bulk_project, name="Live")
    Module.objects.create(project=bulk_project, name="Old", archived_at=now)
    guest = make_user(workspace, "guest", role=5)
    ProjectMember.objects.create(project=bulk_project, member=guest, role=5)
    member = make_user(workspace, "member")
    ProjectMember.objects.create(project=bulk_project, member=member, role=15)
    response = session_client.get(url(workspace, bulk_project), {"project_id": bulk_project.id})
    assert response.status_code == 200, response.data
    metadata = response.data["metadata"]
    assert [c["name"] for c in metadata["cycles"]] == ["Active", "Open"]
    assert [m["name"] for m in metadata["modules"]] == ["Live"]
    assert {m["id"] for m in metadata["members"]} == {create_user.id, member.id}
    assert [s["name"] for s in metadata["states"]] == ["Ready"]


def test_workspace_admin_needs_active_project_membership(session_client, workspace, bulk_project, create_user):
    hidden = Project.objects.create(workspace=workspace, name="Hidden", identifier="HID")
    hidden_item = Issue.objects.create(project=hidden, name="Hidden work")
    endpoint = url(workspace, bulk_project)
    assert [p["name"] for p in session_client.get(endpoint).data["projects"]] == ["Bulk source"]
    assert session_client.get(endpoint, {"project_id": hidden.id}).status_code == 404
    assert session_client.post(endpoint, payload(hidden, [hidden_item]), format="json").status_code == 404
    ProjectMember.objects.filter(project=bulk_project, member=create_user).update(is_active=False)
    assert session_client.get(endpoint, {"project_id": bulk_project.id}).status_code == 404
    # Workspace Admins keep access as project Members, matching existing project rules.
    ProjectMember.objects.filter(project=bulk_project, member=create_user).update(is_active=True, role=15)
    item = Issue.objects.create(project=bulk_project, name="Member role")
    assert apply(session_client, endpoint, payload(bulk_project, [item])).status_code == 200
    item.refresh_from_db()
    assert item.priority == "high"


def test_archived_and_foreign_workspace_records_are_unavailable(session_client, workspace, bulk_project, create_user):
    archived = Project.objects.create(
        workspace=workspace, name="Archived", identifier="ARC", archived_at=timezone.now()
    )
    ProjectMember.objects.create(project=archived, member=create_user, role=20)
    other_workspace = Workspace.objects.create(name="Other", owner=create_user, slug="other-workspace")
    WorkspaceMember.objects.create(workspace=other_workspace, member=create_user, role=20)
    foreign = Project.objects.create(workspace=other_workspace, name="Foreign", identifier="FOR")
    ProjectMember.objects.create(project=foreign, member=create_user, role=20)
    archived_item = Issue.objects.create(project=bulk_project, name="Archived item", archived_at=date.today())
    draft_item = Issue.objects.create(project=bulk_project, name="Draft item", is_draft=True)
    endpoint = url(workspace, bulk_project)
    assert [p["name"] for p in session_client.get(endpoint).data["projects"]] == ["Bulk source"]
    for project in (archived, foreign):
        assert session_client.get(endpoint, {"project_id": project.id}).status_code == 404
    listed = session_client.get(endpoint, {"project_id": bulk_project.id}).data["results"]
    assert {row["id"] for row in listed}.isdisjoint({archived_item.id, draft_item.id})
    for hidden in (archived_item, draft_item):
        response = session_client.post(endpoint, payload(bulk_project, [hidden]), format="json")
        assert response.status_code == 400, response.data


@pytest.mark.parametrize("group", ["backlog", "unstarted", "started", "completed", "cancelled", "triage"])
def test_archive_every_status_and_active_visibility(session_client, workspace, bulk_project, group):
    state = State.objects.create(project=bulk_project, name=group, color="#60646C", group=group)
    item = Issue.objects.create(project=bulk_project, name="Archive me", state=state)
    untouched = Issue.objects.create(project=bulk_project, name="Keep me")
    endpoint = url(workspace, bulk_project)
    listing = session_client.get(endpoint, {"project_id": str(bulk_project.id)})
    assert str(item.id) in [str(row["id"]) for row in listing.data["results"]]
    data = payload(bulk_project, [item], operation="archive", changes={})
    preview = session_client.post(endpoint, data, format="json")
    item.refresh_from_db()
    assert item.archived_at is None
    assert session_client.post(endpoint, {**data, "action": "apply"}, format="json").status_code == 409
    response = session_client.post(endpoint, {**data, "action": "apply", "token": preview.data["token"]}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["count"] == 1
    assert response.data["results"][0]["status"] == "archived"
    item.refresh_from_db()
    assert item.archived_at is not None
    assert item.deleted_at is None
    assert item.state_id == state.id
    assert not Issue.issue_objects.filter(pk=item.pk).exists()
    assert Issue.objects.filter(project=bulk_project, archived_at__isnull=False, pk=item.pk).exists()
    listing = session_client.get(endpoint, {"project_id": str(bulk_project.id)})
    assert str(item.id) not in [str(row["id"]) for row in listing.data["results"]]
    untouched.refresh_from_db()
    assert untouched.archived_at is None
    assert IssueActivity.objects.filter(issue=item, field="archived_at").count() == 1
    replay = session_client.post(endpoint, {**data, "action": "apply", "token": preview.data["token"]}, format="json")
    assert replay.data["count"] == 0
    assert replay.data["results"][0]["status"] == "skipped"


def test_archive_partial_failure_rolls_back_only_failed_ticket(session_client, workspace, bulk_project):
    items = [Issue.objects.create(project=bulk_project, name=f"Ticket {i}") for i in range(3)]
    original_create = IssueActivity.objects.create

    def fail_one(**kwargs):
        if kwargs["issue"].id == items[1].id:
            raise RuntimeError("Controlled history failure")
        return original_create(**kwargs)

    with patch("plane.app.views.workspace.bulk_update.IssueActivity.objects.create", side_effect=fail_one):
        response = apply(
            session_client, url(workspace, bulk_project), payload(bulk_project, items, operation="archive", changes={})
        )
    assert response.status_code == 200, response.data
    assert response.data["count"] == 2
    assert [row["status"] for row in response.data["results"]] == ["archived", "failed", "archived"]
    for index, item in enumerate(items):
        item.refresh_from_db()
        assert (item.archived_at is None) == (index == 1)
        assert item.deleted_at is None
        assert IssueActivity.objects.filter(issue=item, field="archived_at").count() == (0 if index == 1 else 1)


def test_archive_skips_changed_or_unavailable_tickets(session_client, workspace, bulk_project):
    items = [Issue.objects.create(project=bulk_project, name=f"Ticket {i}") for i in range(4)]
    endpoint = url(workspace, bulk_project)
    data = payload(bulk_project, items, operation="archive", changes={})
    preview = session_client.post(endpoint, data, format="json")
    items[1].name = "Changed"
    items[1].save()
    Issue.objects.filter(pk=items[2].pk).update(archived_at=timezone.now().date())
    Issue.objects.filter(pk=items[3].pk).update(deleted_at=timezone.now())
    response = session_client.post(endpoint, {**data, "action": "apply", "token": preview.data["token"]}, format="json")
    assert response.data["count"] == 1
    assert [row["status"] for row in response.data["results"]] == ["archived", "skipped", "skipped", "skipped"]
    items[1].refresh_from_db()
    assert items[1].archived_at is None


def test_archive_token_cannot_change_selection(session_client, workspace, bulk_project):
    items = [Issue.objects.create(project=bulk_project, name=f"Ticket {i}") for i in range(2)]
    endpoint = url(workspace, bulk_project)
    data = payload(bulk_project, [items[0]], operation="archive", changes={})
    preview = session_client.post(endpoint, data, format="json")
    changed = {**data, "action": "apply", "issue_ids": [str(items[1].id)], "token": preview.data["token"]}
    assert session_client.post(endpoint, changed, format="json").status_code == 409
    assert not Issue.objects.filter(project=bulk_project, archived_at__isnull=False).exists()


def test_archive_mixed_statuses_in_one_execution(session_client, workspace, bulk_project):
    items = []
    for group in ["backlog", "unstarted", "started", "completed", "cancelled", "triage"]:
        state = State.objects.create(project=bulk_project, name=f"Mixed {group}", group=group, color="#60646C")
        items.append(Issue.objects.create(project=bulk_project, name=group, state=state))
    response = apply(
        session_client, url(workspace, bulk_project), payload(bulk_project, items, operation="archive", changes={})
    )
    assert response.status_code == 200, response.data
    assert response.data["count"] == 6
    assert all(row["status"] == "archived" for row in response.data["results"])
    assert Issue.objects.filter(id__in=[item.id for item in items], archived_at__isnull=False).count() == 6


def test_archive_parent_leaves_unselected_child_unchanged(session_client, workspace, bulk_project):
    parent = Issue.objects.create(project=bulk_project, name="Parent")
    child = Issue.objects.create(project=bulk_project, name="Child", parent=parent)
    response = apply(
        session_client, url(workspace, bulk_project), payload(bulk_project, [parent], operation="archive", changes={})
    )
    assert response.data["count"] == 1
    child.refresh_from_db()
    assert child.archived_at is None
    assert child.deleted_at is None
    assert child.parent_id == parent.id


def test_archive_appears_in_project_archives_and_can_be_restored(session_client, workspace, bulk_project):
    item = Issue.objects.create(project=bulk_project, name="Recoverable")
    response = apply(
        session_client, url(workspace, bulk_project), payload(bulk_project, [item], operation="archive", changes={})
    )
    assert response.data["count"] == 1
    base = f"/api/workspaces/{workspace.slug}/projects/{bulk_project.id}"
    active = session_client.get(f"{base}/issues/")
    assert active.status_code == 200, active.data
    assert str(item.id) not in json.dumps(active.data, default=str)
    archived = session_client.get(f"{base}/archived-issues/")
    assert archived.status_code == 200, archived.data
    assert str(item.id) in json.dumps(archived.data, default=str)
    restored = session_client.delete(f"{base}/issues/{item.id}/archive/")
    assert restored.status_code == 204, restored.data
    item.refresh_from_db()
    assert item.archived_at is None
    assert Issue.issue_objects.filter(pk=item.pk).exists()
    active = session_client.get(f"{base}/issues/")
    assert active.status_code == 200, active.data
    assert str(item.id) in json.dumps(active.data, default=str)


def test_archive_rechecks_admin_access_after_preview(session_client, workspace, bulk_project, create_user):
    item = Issue.objects.create(project=bulk_project, name="Keep")
    data = payload(bulk_project, [item], operation="archive", changes={})
    endpoint = url(workspace, bulk_project)
    preview = session_client.post(endpoint, data, format="json")
    assert preview.status_code == 200
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
    response = session_client.post(endpoint, {**data, "action": "apply", "token": preview.data["token"]}, format="json")
    assert response.status_code == 403
    item.refresh_from_db()
    assert item.archived_at is None


@pytest.mark.parametrize("operation", ["update", "move"])
def test_triage_selection_exposes_group_and_preserves_existing_operation_restrictions(
    session_client, workspace, bulk_project, operation
):
    state = State.objects.create(project=bulk_project, name="Triage", group="triage", color="#60646C")
    item = Issue.objects.create(project=bulk_project, state=state, name="Triage selection")
    endpoint = url(workspace, bulk_project)
    listing = session_client.get(endpoint, {"project_id": str(bulk_project.id)})
    row = next(row for row in listing.data["results"] if str(row["id"]) == str(item.id))
    assert row["state_group"] == "triage"
    denied = session_client.post(endpoint, payload(bulk_project, [item], operation=operation), format="json")
    assert denied.status_code == 400
    item.refresh_from_db()
    assert item.priority == "none"
    assert item.archived_at is None
    archived = apply(session_client, endpoint, payload(bulk_project, [item], operation="archive", changes={}))
    assert archived.data["count"] == 1
    assert archived.data["results"][0]["status"] == "archived"


def test_archive_skips_epics_and_continues_with_supported_tickets(session_client, workspace, bulk_project):
    epic_type = IssueType.objects.create(workspace=workspace, name="Epic", is_epic=True)
    ProjectIssueType.objects.create(project=bulk_project, issue_type=epic_type)
    epic = Issue.objects.create(project=bulk_project, name="Keep epic visible", type=epic_type)
    normal = Issue.objects.create(project=bulk_project, name="Archive regular ticket")
    endpoint = url(workspace, bulk_project)
    data = payload(bulk_project, [epic, normal], operation="archive", changes={})
    preview = session_client.post(endpoint, data, format="json")
    assert preview.status_code == 200
    assert any("Epic" in line for line in preview.data["summary"])
    response = session_client.post(endpoint, {**data, "action": "apply", "token": preview.data["token"]}, format="json")
    assert response.data["count"] == 1
    assert [row["status"] for row in response.data["results"]] == ["skipped", "archived"]
    assert "Epic" in response.data["results"][0]["reason"]
    epic.refresh_from_db()
    assert epic.archived_at is None
    assert epic.deleted_at is None
    assert not IssueActivity.objects.filter(issue=epic, field="archived_at").exists()
    assert Issue.issue_objects.filter(pk=epic.pk).exists()
    archived = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{bulk_project.id}/archived-issues/")
    assert archived.status_code == 200
    assert str(normal.id) in json.dumps(archived.data, default=str)


def test_archive_all_epics_reports_zero_successes(session_client, workspace, bulk_project):
    epic_type = IssueType.objects.create(workspace=workspace, name="Epic", is_epic=True)
    item = Issue.objects.create(project=bulk_project, name="Epic", type=epic_type)
    response = apply(
        session_client, url(workspace, bulk_project), payload(bulk_project, [item], operation="archive", changes={})
    )
    assert response.data["count"] == 0
    assert response.data["results"][0]["status"] == "skipped"
    item.refresh_from_db()
    assert item.archived_at is None


def test_archive_rechecks_type_before_writing(session_client, workspace, bulk_project):
    item = Issue.objects.create(project=bulk_project, name="Changed to epic")
    endpoint = url(workspace, bulk_project)
    data = payload(bulk_project, [item], operation="archive", changes={})
    preview = session_client.post(endpoint, data, format="json")
    epic_type = IssueType.objects.create(workspace=workspace, name="Epic", is_epic=True)
    Issue.objects.filter(pk=item.pk).update(type=epic_type)
    response = session_client.post(endpoint, {**data, "action": "apply", "token": preview.data["token"]}, format="json")
    assert response.data["count"] == 0
    assert response.data["results"][0]["status"] == "skipped"
    assert "Epic" in response.data["results"][0]["reason"]
    item.refresh_from_db()
    assert item.archived_at is None
