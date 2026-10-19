# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

from celery import shared_task
from crum import impersonate
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

from plane.app.serializers.issue import IssueCreateSerializer
from plane.db.models import CSVImport, Label, Project, WorkspaceMember
from plane.utils.csv_import import map_row
from plane.utils.exception_logger import log_exception


def publish_activity(job, issue, data):
    from plane.bgtasks.issue_activities_task import issue_activity

    try:
        issue_activity.delay(
            type="issue.activity.created",
            requested_data=json.dumps(data, cls=DjangoJSONEncoder),
            actor_id=str(job.initiated_by_id),
            issue_id=str(issue.id),
            project_id=str(job.project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=job.config.get("origin"),
        )
    except Exception as exc:
        log_exception(exc)


@shared_task(acks_late=True, reject_on_worker_lost=True)
def import_csv(job_id):
    """Issue creation and cursor advancement commit together; redelivery is safe."""
    from plane.app.views.workspace.csv_import import accessible_projects, project_lookups

    try:
        rows = CSVImport.objects.only("rows").get(pk=job_id).rows
        while True:
            with transaction.atomic():
                job = (
                    CSVImport.objects.select_for_update(of=("self",))
                    .select_related("project", "initiated_by")
                    .defer("rows", "headers")
                    .get(pk=job_id)
                )
                if job.status not in {"queued", "processing"}:
                    return
                if (
                    not WorkspaceMember.objects.filter(
                        workspace_id=job.workspace_id,
                        member_id=job.initiated_by_id,
                        role=20,
                        is_active=True,
                    ).exists()
                    or not accessible_projects(job.project.workspace.slug, job.initiated_by)
                    .filter(pk=job.project_id)
                    .exists()
                ):
                    job.status = "failed"
                    job.failure_reason = (
                        "Workspace admin or project access was revoked. Remaining rows were not imported."
                    )
                    job.save(update_fields=["status", "failure_reason", "updated_at"])
                    return
                if job.processed == len(rows):
                    job.status = "completed"
                    job.save(update_fields=["status", "updated_at"])
                    return
                job.status = "processing"
                row = rows[job.processed]
                # Serialize label creation within a project (also protects case-insensitive matching).
                project = Project.objects.select_for_update(no_key=True).get(pk=job.project_id)
                labels, states = project_lookups(project)
                data, names, errors = map_row(
                    row,
                    job.config["mapping"],
                    job.config["separator"],
                    labels,
                    states,
                    job.config["create_labels"],
                )
                if not errors:
                    try:
                        with transaction.atomic(), impersonate(job.initiated_by):
                            label_ids = []
                            for name in names:
                                label_id = labels.get(name.casefold())
                                if label_id is None:
                                    label = Label(
                                        project=project, workspace_id=job.workspace_id, name=name, color="#6B7280"
                                    )
                                    label.save(created_by_id=job.initiated_by_id)
                                    label_id = label.id
                                    labels[name.casefold()] = label_id
                                label_ids.append(str(label_id))
                            data["label_ids"] = list(dict.fromkeys(label_ids))
                            serializer = IssueCreateSerializer(
                                data=data,
                                context={
                                    "project_id": project.id,
                                    "workspace_id": project.workspace_id,
                                    "default_assignee_id": project.default_assignee_id,
                                },
                            )
                            serializer.is_valid(raise_exception=True)
                            issue = serializer.save(created_by_id=job.initiated_by_id)
                            transaction.on_commit(lambda j=job, i=issue, d=data: publish_activity(j, i, d))
                        job.succeeded += 1
                    except Exception as exc:
                        log_exception(exc)
                        from rest_framework.exceptions import ValidationError

                        errors = (
                            [str(exc.detail)]
                            if isinstance(exc, ValidationError)
                            else ["Issue creation failed. Check server logs, correct the row, and import it again."]
                        )
                if errors:
                    job.errors = [*job.errors, {"line": row["line"], "errors": errors}]
                job.processed += 1
                job.save(update_fields=["status", "processed", "succeeded", "errors", "updated_at"])
    except Exception as exc:
        log_exception(exc)
        CSVImport.objects.filter(pk=job_id, status__in=["queued", "processing"]).update(
            status="failed",
            failure_reason="Import interrupted. Check server logs; download unimported rows for correction.",
        )
