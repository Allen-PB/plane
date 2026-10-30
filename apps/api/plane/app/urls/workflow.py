# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path
from plane.app.views.workspace.workflow import WorkflowEndpoint, ProjectWorkflowEndpoint

urlpatterns = [
    path("workspaces/<str:slug>/workflows/", WorkflowEndpoint.as_view()),
    path("workspaces/<str:slug>/workflows/<uuid:pk>/", WorkflowEndpoint.as_view()),
    path("workspaces/<str:slug>/projects/<uuid:project_id>/workflows/", ProjectWorkflowEndpoint.as_view()),
]
