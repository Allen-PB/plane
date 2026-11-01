# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch
import pytest
from plane.db.models import (
    EstimatePoint,
    Issue,
    Label,
    Project,
    ProjectMember,
    State,
    Workflow,
    Workspace,
    WorkspaceMember,
)

pytestmark = [pytest.mark.contract, pytest.mark.django_db]


@pytest.fixture(autouse=True)
def no_external_tasks():
    with patch("celery.app.task.Task.apply_async"):
        yield


@pytest.fixture
def workflow_project(workspace, create_user):
    project = Project.objects.create(name="Workflow project", identifier="WFL", workspace=workspace)
    ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
    return project


def config():
    return {
        "states": [{"name": "Ready", "color": "#60646C", "group": "unstarted", "default": True}],
        "labels": [{"name": "Bug", "color": "#FF0000"}],
        "estimates": {"name": "Workflow points", "type": "points", "values": ["1", "3", "5"]},
    }


def url(workspace, workflow=None):
    return f"/api/workspaces/{workspace.slug}/workflows/" + (f"{workflow}/" if workflow else "")


def project_url(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/workflows/"


def create(client, workspace):
    response = client.post(url(workspace), {"name": "Engineering", "config": config()}, format="json")
    assert response.status_code == 201, response.data
    return response.data["id"]


def apply(client, workspace, project, workflow, **kwargs):
    endpoint = project_url(workspace, project)
    review = client.post(endpoint, {"action": "preview", "workflow_id": workflow}, format="json")
    assert review.status_code == 200, review.data
    return client.post(
        endpoint, {"action": "apply", "workflow_id": workflow, "token": review.data["token"], **kwargs}, format="json"
    )


@pytest.mark.parametrize("role", [5, 15])
def test_only_workspace_admins_manage(session_client, workspace, create_user, role):
    workflow = create(session_client, workspace)
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=role)
    assert session_client.get(url(workspace)).status_code == 403
    assert session_client.post(url(workspace), {}, format="json").status_code == 403
    assert session_client.patch(url(workspace, workflow), {"name": "No"}, format="json").status_code == 403
    assert session_client.delete(url(workspace, workflow)).status_code == 403


def test_independent_idempotent_copy_preserves_assignments(session_client, workspace, workflow_project):
    state = State.objects.create(project=workflow_project, name="Existing", color="#60646C")
    issue = Issue.objects.create(project=workflow_project, name="Keep me", state=state)
    workflow = create(session_client, workspace)
    for _ in range(2):
        assert apply(session_client, workspace, workflow_project, workflow).status_code == 200
    assert State.objects.filter(project=workflow_project, name="Ready").count() == 1
    assert Label.objects.filter(project=workflow_project, name="Bug").count() == 1
    assert EstimatePoint.objects.filter(project=workflow_project).count() == 3
    workflow_project.refresh_from_db()
    assert workflow_project.estimate.last_used is True
    estimates = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{workflow_project.id}/estimates/").data
    assert sum(estimate["last_used"] for estimate in estimates) == 1
    issue.refresh_from_db()
    assert issue.state_id == state.id
    changed = config()
    changed["states"][0]["name"] = "Changed template"
    assert session_client.patch(url(workspace, workflow), {"config": changed}, format="json").status_code == 200
    assert not State.objects.filter(project=workflow_project, name="Changed template").exists()
    assert session_client.delete(url(workspace, workflow)).status_code == 204
    assert State.objects.filter(project=workflow_project, name="Ready").exists()


def test_stale_preview_rejected(session_client, workspace, workflow_project):
    workflow = create(session_client, workspace)
    endpoint = project_url(workspace, workflow_project)
    review = session_client.post(endpoint, {"action": "preview", "workflow_id": workflow}, format="json").data
    Label.objects.create(project=workflow_project, name="New label")
    response = session_client.post(
        endpoint, {"action": "apply", "workflow_id": workflow, "token": review["token"]}, format="json"
    )
    assert response.status_code == 409
    assert not State.objects.filter(project=workflow_project, name="Ready").exists()


def test_estimate_mapping_required_and_applied(session_client, workspace, workflow_project):
    from plane.db.models import Estimate

    old = Estimate.objects.create(project=workflow_project, name="Old", last_used=True)
    point = EstimatePoint.objects.create(project=workflow_project, estimate=old, key=0, value="Small")
    state = State.objects.create(project=workflow_project, name="Existing", color="#60646C")
    issue = Issue.objects.create(project=workflow_project, name="Estimated", state=state, estimate_point=point)
    workflow = create(session_client, workspace)
    assert apply(session_client, workspace, workflow_project, workflow).status_code == 400
    assert not State.objects.filter(project=workflow_project, name="Ready").exists()
    assert apply(session_client, workspace, workflow_project, workflow, mapping={str(point.id): "3"}).status_code == 200
    issue.refresh_from_db()
    workflow_project.refresh_from_db()
    assert issue.estimate_point.value == "3"
    assert issue.estimate_point.estimate_id == workflow_project.estimate_id
    old.refresh_from_db()
    assert old.last_used is False
    assert workflow_project.estimate.last_used is True


def test_cross_workspace_access_denied(session_client, workspace, workflow_project, create_user):
    other = Workspace.objects.create(name="Other", slug="other-workflows", owner=create_user)
    workflow = Workflow.objects.create(workspace=other, name="Secret", config=config())
    response = session_client.post(
        project_url(workspace, workflow_project), {"action": "preview", "workflow_id": str(workflow.id)}, format="json"
    )
    assert response.status_code == 404


def test_project_member_cannot_apply(session_client, workspace, workflow_project, create_user):
    workflow = create(session_client, workspace)
    ProjectMember.objects.filter(project=workflow_project, member=create_user).update(role=15)
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
    endpoint = project_url(workspace, workflow_project)
    assert session_client.get(endpoint).status_code == 403
    assert (
        session_client.post(endpoint, {"action": "preview", "workflow_id": workflow}, format="json").status_code == 403
    )


def test_failed_application_rolls_back_all_changes(session_client, workspace, workflow_project):
    from django.db import IntegrityError

    workflow = create(session_client, workspace)
    with patch("plane.utils.workflow.Label.objects.create", side_effect=IntegrityError("simulated failure")):
        response = apply(session_client, workspace, workflow_project, workflow)
    assert response.status_code == 400
    assert not State.objects.filter(project=workflow_project, name="Ready").exists()
    workflow_project.refresh_from_db()
    assert workflow_project.estimate_id is None


def test_project_admin_can_read_and_apply_without_workspace_admin(
    session_client, workspace, workflow_project, create_user
):
    workflow = create(session_client, workspace)
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
    assert session_client.get(url(workspace)).status_code == 403
    assert session_client.get(project_url(workspace, workflow_project)).status_code == 200
    assert apply(session_client, workspace, workflow_project, workflow).status_code == 200


def test_workflow_names_are_unique_case_insensitive(session_client, workspace):
    create(session_client, workspace)
    response = session_client.post(url(workspace), {"name": "ENGINEERING", "config": config()}, format="json")
    assert response.status_code == 400
    assert Workflow.objects.filter(workspace=workspace).count() == 1


def test_apply_invalidates_cached_workspace_estimates_for_all_users(
    session_client, workspace, workflow_project, django_capture_on_commit_callbacks
):
    from django.core.cache import cache

    workflow = create(session_client, workspace)
    key = f"/api/workspaces/{workspace.slug}/estimates/:another-user"
    cache.set(key, {"data": [], "status": 200}, 60)
    with django_capture_on_commit_callbacks(execute=True):
        assert apply(session_client, workspace, workflow_project, workflow).status_code == 200
    assert cache.get(key) is None
