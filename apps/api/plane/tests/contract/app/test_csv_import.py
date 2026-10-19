# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from plane.bgtasks.csv_import_task import import_csv
from plane.db.models import CSVImport, Issue, Label, Project, ProjectMember, State, Workspace, WorkspaceMember

pytestmark = [pytest.mark.contract, pytest.mark.django_db]


@pytest.fixture(autouse=True)
def no_external_tasks():
    with patch("celery.app.task.Task.apply_async"):
        yield


@pytest.fixture
def csv_project(workspace, create_user):
    project = Project.objects.create(name="CSV Project", identifier="CSV", workspace=workspace, network=0)
    ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)
    return project


def endpoint(workspace, job=None):
    return f"/api/workspaces/{workspace.slug}/csv-imports/" + (f"{job}/" if job else "")


def upload(client, workspace, project, content=b"Title,Issue Type\nOne,Bug\nTwo,Feature\n,Missing"):
    return client.post(
        endpoint(workspace),
        {
            "project_id": str(project.id),
            "file": SimpleUploadedFile("issues.csv", content, content_type="text/csv"),
        },
        format="multipart",
    )


@pytest.mark.parametrize("role", [5, 15])
def test_members_cannot_list_upload_validate_start_or_download(
    session_client, workspace, csv_project, create_user, role
):
    response = upload(session_client, workspace, csv_project)
    job_id = response.data["id"]
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=role)
    assert session_client.get(endpoint(workspace)).status_code == 403
    assert upload(session_client, workspace, csv_project).status_code == 403
    assert session_client.get(endpoint(workspace, job_id), {"download": "errors"}).status_code == 403
    for action in ("validate", "start"):
        assert session_client.post(endpoint(workspace, job_id), {"action": action}, format="json").status_code == 403


def test_cross_workspace_and_private_project_access(session_client, workspace, csv_project, create_user):
    secret = Project.objects.create(name="Secret", identifier="SEC", workspace=workspace, network=0)
    other = Workspace.objects.create(name="Other", slug="other", owner=create_user)
    foreign = Project.objects.create(name="Foreign", identifier="FOR", workspace=other)
    for project in (secret, foreign):
        assert upload(session_client, workspace, project).status_code == 404
        assert session_client.get(endpoint(workspace), {"project_id": str(project.id)}).status_code == 404
    response = upload(session_client, workspace, csv_project)
    WorkspaceMember.objects.create(workspace=other, member=create_user, role=20)
    assert session_client.get(endpoint(other, response.data["id"])).status_code == 404
    assert session_client.get(endpoint(workspace)).data["projects"] == [
        {"id": csv_project.id, "name": csv_project.name}
    ]


def test_preview_mapping_validation_and_creation(
    session_client, workspace, csv_project, create_user, django_capture_on_commit_callbacks
):
    Label.objects.create(name="Bug", project=csv_project, workspace=workspace)
    response = upload(session_client, workspace, csv_project)
    assert response.status_code == 201
    job_id = response.data["id"]
    config = {"mapping": ["name", "labels"], "separator": ";", "create_labels": False}
    review = session_client.post(endpoint(workspace, job_id), {"action": "validate", **config}, format="json")
    assert review.data["review"]["valid_count"] == 1
    config["create_labels"] = True
    review = session_client.post(endpoint(workspace, job_id), {"action": "validate", **config}, format="json")
    assert review.data["review"]["valid_count"] == 2
    assert review.data["review"]["errors"][0]["line"] == 4
    with patch("plane.bgtasks.csv_import_task.import_csv.delay") as queued:
        with django_capture_on_commit_callbacks(execute=True):
            assert (
                session_client.post(
                    endpoint(workspace, job_id), {"action": "start", **config}, format="json"
                ).status_code
                == 200
            )
        with django_capture_on_commit_callbacks(execute=True):
            session_client.post(endpoint(workspace, job_id), {"action": "start", **config}, format="json")
        queued.assert_called_once_with(job_id)
    with patch("plane.bgtasks.csv_import_task.publish_activity"):
        import_csv(job_id)
        import_csv(job_id)
    job = CSVImport.objects.get(pk=job_id)
    assert (job.status, job.processed, job.succeeded) == ("completed", 3, 2)
    assert Issue.objects.filter(project=csv_project).count() == 2
    assert set(Issue.objects.filter(project=csv_project).values_list("created_by_id", flat=True)) == {create_user.id}
    assert set(Label.objects.filter(project=csv_project).values_list("name", flat=True)) == {"Bug", "Feature"}
    assert set(Issue.objects.get(project=csv_project, name="Two").labels.values_list("name", flat=True)) == {"Feature"}
    download = session_client.get(endpoint(workspace, job_id), {"download": "errors"})
    assert download.status_code == 200
    assert "Name is required" in download.content.decode("utf-8-sig")


def test_worker_rechecks_access_before_writing(session_client, workspace, csv_project, create_user):
    job_id = upload(session_client, workspace, csv_project).data["id"]
    CSVImport.objects.filter(pk=job_id).update(
        status="queued", config={"mapping": ["name", "labels"], "separator": ";", "create_labels": True}
    )
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(is_active=False)
    import_csv(job_id)
    assert CSVImport.objects.get(pk=job_id).status == "failed"
    assert not Issue.objects.filter(project=csv_project).exists()


def test_failed_row_rolls_back_created_labels_and_continues(session_client, workspace, csv_project):
    job_id = upload(session_client, workspace, csv_project, b"Title,Labels\nBad,Rollback\nGood,Keep").data["id"]
    CSVImport.objects.filter(pk=job_id).update(
        status="queued", config={"mapping": ["name", "labels"], "separator": ";", "create_labels": True}
    )
    from plane.app.serializers.issue import IssueCreateSerializer

    original = IssueCreateSerializer.create

    def create(serializer, data):
        if data["name"] == "Bad":
            raise ValueError("Simulated row failure")
        return original(serializer, data)

    with patch.object(IssueCreateSerializer, "create", create), patch("plane.bgtasks.csv_import_task.publish_activity"):
        import_csv(job_id)
    job = CSVImport.objects.get(pk=job_id)
    assert job.succeeded == 1
    assert job.errors[0]["line"] == 2
    assert not Label.objects.filter(project=csv_project, name="Rollback").exists()
    assert Label.objects.filter(project=csv_project, name="Keep").exists()


def test_failed_download_escapes_formula_cells(session_client, workspace, csv_project):
    job_id = upload(session_client, workspace, csv_project, b"Title,Labels\n=SUM(1),Unknown").data["id"]
    CSVImport.objects.filter(pk=job_id).update(
        config={"mapping": ["name", "labels"], "separator": ";", "create_labels": False}
    )
    response = session_client.get(endpoint(workspace, job_id), {"download": "errors"})
    assert "'=SUM(1)" in response.content.decode("utf-8-sig")


def test_anonymous_and_inactive_members_are_denied(session_client, workspace, create_user):
    assert APIClient().get(endpoint(workspace)).status_code in {401, 403}
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(is_active=False)
    assert session_client.get(endpoint(workspace)).status_code == 403


def test_invalid_mapping_and_missing_project_are_rejected(session_client, workspace, csv_project):
    assert session_client.post(endpoint(workspace), {}, format="multipart").status_code == 400
    job_id = upload(session_client, workspace, csv_project).data["id"]
    for mapping in (["labels", ""], ["name", "name"], ["name", "unsupported"]):
        response = session_client.post(
            endpoint(workspace, job_id), {"action": "start", "mapping": mapping}, format="json"
        )
        assert response.status_code == 400
    assert CSVImport.objects.get(pk=job_id).status == "draft"


def test_mapped_fields_and_labels_use_selected_project(session_client, workspace, csv_project):
    other = Project.objects.create(name="Other project", identifier="OTH", workspace=workspace)
    foreign_label = Label.objects.create(project=other, workspace=workspace, name="New")
    State.objects.create(project=other, workspace=workspace, name="Remote state", color="#000000")
    state = State.objects.create(project=csv_project, workspace=workspace, name="CSV ready", color="#000000")
    existing = Label.objects.create(project=csv_project, workspace=workspace, name="Bug")
    metadata = session_client.get(endpoint(workspace), {"project_id": str(csv_project.id)}).data
    assert foreign_label.id not in [label["id"] for label in metadata["labels"]]
    job_id = upload(
        session_client,
        workspace,
        csv_project,
        b"Title,Details,Status,Priority,Due Date,Start Date,Issue Type\n"
        b'Task,"<b>text</b>",CSV ready,HIGH,2026-11-03,2026-11-01,bug|New',
    ).data["id"]
    config = {
        "mapping": ["name", "description", "state", "priority", "target_date", "start_date", "labels"],
        "separator": "|",
        "create_labels": True,
    }
    response = session_client.post(endpoint(workspace, job_id), {"action": "validate", **config}, format="json")
    assert response.data["review"]["valid_count"] == 1
    CSVImport.objects.filter(pk=job_id).update(status="queued")
    with patch("plane.bgtasks.csv_import_task.publish_activity"):
        import_csv(job_id)
    issue = Issue.objects.get(project=csv_project, name="Task")
    assert issue.state_id == state.id
    assert issue.priority == "high"
    assert issue.target_date.isoformat() == "2026-11-03"
    assert issue.start_date.isoformat() == "2026-11-01"
    assert "&lt;b&gt;" in issue.description_html
    assert existing.id in issue.labels.values_list("id", flat=True)
    assert foreign_label.id not in issue.labels.values_list("id", flat=True)
    assert issue.labels.filter(project=csv_project, name="New").exists()


@pytest.mark.django_db(transaction=True)
def test_worker_redelivery_resumes_after_committed_row(session_client, workspace, csv_project):
    job_id = upload(session_client, workspace, csv_project, b"Title\nFirst\nSecond").data["id"]
    CSVImport.objects.filter(pk=job_id).update(
        status="queued", config={"mapping": ["name"], "separator": ";", "create_labels": False}
    )

    class WorkerLost(BaseException):
        pass

    with patch("plane.bgtasks.csv_import_task.publish_activity", side_effect=WorkerLost):
        with pytest.raises(WorkerLost):
            import_csv(job_id)
    job = CSVImport.objects.get(pk=job_id)
    assert (job.processed, job.succeeded) == (1, 1)
    with patch("plane.bgtasks.csv_import_task.publish_activity"):
        import_csv(job_id)
    assert Issue.objects.filter(project=csv_project).count() == 2
    assert CSVImport.objects.get(pk=job_id).succeeded == 2


@pytest.mark.django_db(transaction=True)
def test_concurrent_task_deliveries_do_not_duplicate_issues(session_client, workspace, csv_project):
    from concurrent.futures import ThreadPoolExecutor
    from django.db import connections

    job_id = upload(session_client, workspace, csv_project, b"Title\nFirst\nSecond\nThird\nFourth").data["id"]
    CSVImport.objects.filter(pk=job_id).update(
        status="queued", config={"mapping": ["name"], "separator": ";", "create_labels": False}
    )

    def run():
        try:
            import_csv(job_id)
        finally:
            connections.close_all()

    with patch("plane.bgtasks.csv_import_task.publish_activity"), ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run), pool.submit(run)]
        for future in futures:
            future.result(timeout=30)
    assert Issue.objects.filter(project=csv_project).count() == 4
    job = CSVImport.objects.get(pk=job_id)
    assert (job.status, job.processed, job.succeeded) == ("completed", 4, 4)
