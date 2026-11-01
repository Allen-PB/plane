# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.workflow import WorkflowSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, Workflow, Workspace
from plane.utils.workflow import apply_workflow, workflow_preview
from plane.utils.cache import invalidate_cache_directly


class WorkflowEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, pk=None):
        query = Workflow.objects.filter(workspace__slug=slug)
        if pk:
            return Response(WorkflowSerializer(get_object_or_404(query, pk=pk)).data)
        return Response(WorkflowSerializer(query, many=True).data)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    @transaction.atomic
    def post(self, request, slug):
        workspace = get_object_or_404(Workspace.objects.select_for_update(), slug=slug)
        serializer = WorkflowSerializer(data=request.data, context={"workspace_id": workspace.id})
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace)
        return Response(serializer.data, status=201)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    @transaction.atomic
    def patch(self, request, slug, pk):
        workspace = get_object_or_404(Workspace.objects.select_for_update(), slug=slug)
        workflow = get_object_or_404(Workflow.objects.select_for_update(), pk=pk, workspace=workspace)
        serializer = WorkflowSerializer(
            workflow, data=request.data, partial=True, context={"workspace_id": workspace.id}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    @transaction.atomic
    def delete(self, request, slug, pk):
        workflow = get_object_or_404(Workflow.objects.select_for_update(), pk=pk, workspace__slug=slug)
        workflow.delete()
        return Response(status=204)


class ProjectWorkflowEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def get(self, request, slug, project_id):
        get_object_or_404(Project, pk=project_id, workspace__slug=slug)
        return Response(WorkflowSerializer(Workflow.objects.filter(workspace__slug=slug), many=True).data)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    @transaction.atomic
    def post(self, request, slug, project_id):
        project = get_object_or_404(Project.objects.select_for_update(), pk=project_id, workspace__slug=slug)
        workflow = get_object_or_404(
            Workflow.objects.select_for_update(), pk=request.data.get("workflow_id"), workspace_id=project.workspace_id
        )
        preview = workflow_preview(project, workflow)
        if request.data.get("action") == "preview":
            return Response(preview)
        if request.data.get("action") != "apply":
            raise ValidationError({"error": "Choose preview or apply."})
        if request.data.get("token") != preview["token"]:
            return Response({"error": "Configuration changed. Preview the workflow again."}, status=409)
        apply_workflow(project, workflow, preview, request.data.get("mapping", {}))
        transaction.on_commit(
            lambda: invalidate_cache_directly(
                path=f"/api/workspaces/{slug}/estimates/", user=False, request=request, multiple=True
            )
        )
        return Response({"applied": True})
