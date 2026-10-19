# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import csv
import io
from uuid import UUID

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.app.serializers.issue import IssueCreateSerializer
from plane.db.models import CSVImport, Label, Project, State
from plane.utils.csv_import import FIELDS, MAX_BYTES, map_row, name_index, parse_csv, validate_mapping
from plane.utils.csv_utils import sanitize_csv_row
from plane.utils.host import base_host


def accessible_projects(slug, user):
    return (
        Project.objects.filter(workspace__slug=slug, archived_at__isnull=True)
        .filter(
            Q(network=2)
            | Q(
                project_projectmember__member=user,
                project_projectmember__is_active=True,
                project_projectmember__deleted_at__isnull=True,
            )
        )
        .distinct()
    )


def project_lookups(project):
    return (
        name_index(Label.objects.filter(project=project, workspace_id=project.workspace_id)),
        name_index(State.objects.filter(project=project, workspace_id=project.workspace_id)),
    )


def selected_project(slug, user, project_id):
    try:
        project_id = UUID(str(project_id))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValidationError({"error": "Select a valid project before uploading a CSV."}) from exc
    return get_object_or_404(accessible_projects(slug, user), pk=project_id)


def validate_rows(job, config):
    labels, states = project_lookups(job.project)
    errors = []
    missing = set()
    for row in job.rows:
        data, names, reasons = map_row(
            row, config["mapping"], config["separator"], labels, states, config["create_labels"]
        )
        if not reasons:
            serializer = IssueCreateSerializer(
                data=data,
                context={
                    "project_id": job.project_id,
                    "workspace_id": job.workspace_id,
                    "default_assignee_id": job.project.default_assignee_id,
                },
            )
            if not serializer.is_valid():
                reasons.extend(f"{field}: {detail}" for field, detail in serializer.errors.items())
        missing.update(name for name in names if name.casefold() not in labels)
        if reasons:
            errors.append({"line": row["line"], "errors": reasons})
    return {"errors": errors, "valid_count": len(job.rows) - len(errors), "missing_labels": sorted(missing)}


def job_data(job):
    return {
        "id": str(job.id),
        "project_id": str(job.project_id),
        "project_name": job.project.name,
        "status": job.status,
        "headers": job.headers,
        "sample": job.rows[:5],
        "total": len(job.rows),
        "processed": job.processed,
        "succeeded": job.succeeded,
        "errors": job.errors,
        "config": job.config,
        "failure_reason": job.failure_reason,
    }


class CSVImportEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, pk=None):
        if pk:
            job = self.get_job(request, slug, pk)
            if request.query_params.get("download") == "errors":
                return self.download_errors(job)
            return Response(job_data(job))
        project_id = request.query_params.get("project_id")
        if project_id:
            project = selected_project(slug, request.user, project_id)
            return Response(
                {
                    "fields": FIELDS,
                    "labels": list(Label.objects.filter(project=project).values("id", "name")),
                    "states": list(State.objects.filter(project=project).values("id", "name")),
                }
            )
        return Response(
            {
                "projects": list(accessible_projects(slug, request.user).order_by("name").values("id", "name")),
                "jobs": [
                    job_data(job)
                    for job in CSVImport.objects.filter(
                        workspace__slug=slug,
                        initiated_by=request.user,
                        project__in=accessible_projects(slug, request.user),
                    ).select_related("project")[:10]
                ],
            }
        )

    def get_job(self, request, slug, pk):
        return get_object_or_404(
            CSVImport.objects.select_related("project").filter(
                workspace__slug=slug,
                initiated_by=request.user,
                project__in=accessible_projects(slug, request.user),
            ),
            pk=pk,
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk=None):
        if not pk:
            project = selected_project(slug, request.user, request.data.get("project_id"))
            upload = request.FILES.get("file")
            if not upload:
                raise ValidationError({"error": "Select a CSV file."})
            try:
                headers, rows, mapping = parse_csv(upload.read(MAX_BYTES + 1))
            except ValueError as exc:
                raise ValidationError({"error": str(exc)}) from exc
            job = CSVImport.objects.create(
                workspace_id=project.workspace_id,
                project=project,
                initiated_by=request.user,
                headers=headers,
                rows=rows,
                config={"mapping": mapping, "separator": "|", "create_labels": False},
            )
            return Response(job_data(job), status=201)
        with transaction.atomic():
            job = self.get_job(request, slug, pk)
            job = CSVImport.objects.select_for_update().select_related("project").get(pk=job.pk)
            action = request.data.get("action")
            if action not in {"validate", "start"}:
                raise ValidationError({"error": "Choose validate or start."})
            if job.status != "draft":
                # Starting the same persisted job again is idempotent.
                return Response(job_data(job))
            config = {
                "mapping": request.data.get("mapping"),
                "separator": request.data.get("separator", job.config.get("separator", "|")),
                "create_labels": request.data.get("create_labels", False),
            }
            try:
                validate_mapping(config["mapping"], len(job.headers), config["separator"])
                if not isinstance(config["create_labels"], bool):
                    raise ValueError("Create missing labels must be true or false.")
            except ValueError as exc:
                raise ValidationError({"error": str(exc)}) from exc
            review = validate_rows(job, config)
            job.config = config
            if action == "start":
                if not review["valid_count"]:
                    return Response({"error": "Correct the CSV: no valid rows to import.", **review}, status=400)
                job.status = "queued"
                job.config["origin"] = base_host(request=request, is_app=True)
                from plane.bgtasks.csv_import_task import import_csv

                transaction.on_commit(lambda: enqueue_import(job.id, import_csv))
            job.save()
            return Response({**job_data(job), "review": review})

    @staticmethod
    def download_errors(job):
        errors = {item["line"]: item["errors"] for item in job.errors}
        if job.status == "draft":
            errors = {item["line"]: item["errors"] for item in validate_rows(job, job.config)["errors"]}
        if job.status == "failed":
            for row in job.rows[job.processed :]:
                errors[row["line"]] = [job.failure_reason or "Import stopped before this row."]
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(sanitize_csv_row([*job.headers, "CSV source line", "Import errors"]))
        for row in job.rows:
            if row["line"] in errors:
                values = row["values"]
                # Keep malformed extra cells in the error detail rather than shifting the error columns.
                detail = "; ".join(errors[row["line"]])
                if len(values) > len(job.headers):
                    detail += f" Extra cells: {values[len(job.headers) :]!r}"
                cells = (values + [""] * len(job.headers))[: len(job.headers)]
                writer.writerow(sanitize_csv_row([*cells, row["line"], detail]))
        response = HttpResponse("\ufeff" + stream.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="plane-import-errors.csv"'
        return response


def enqueue_import(job_id, task):
    from plane.utils.exception_logger import log_exception

    try:
        task.delay(str(job_id))
    except Exception as exc:
        log_exception(exc)
        CSVImport.objects.filter(pk=job_id, status="queued").update(
            status="failed", failure_reason="Could not queue import. Check the Celery worker and message broker."
        )
