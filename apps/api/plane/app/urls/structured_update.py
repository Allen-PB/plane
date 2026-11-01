# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.issue.structured_update import (
    IssueStructuredUpdateEndpoint,
    ProjectFunctionalRoleEndpoint,
    ProjectStructuredUpdateSettingEndpoint,
    StructuredUpdateCorrectionEndpoint,
    StructuredUpdateEvidenceEndpoint,
    StructuredUpdateLinkEndpoint,
    StructuredUpdateRevisionEndpoint,
)

PROJECT = "workspaces/<str:slug>/projects/<uuid:project_id>"
UPDATES = f"{PROJECT}/issues/<uuid:issue_id>/structured-updates"

urlpatterns = [
    path(f"{PROJECT}/structured-updates/settings/", ProjectStructuredUpdateSettingEndpoint.as_view()),
    path(f"{PROJECT}/structured-updates/roles/", ProjectFunctionalRoleEndpoint.as_view()),
    path(f"{UPDATES}/", IssueStructuredUpdateEndpoint.as_view()),
    path(f"{UPDATES}/<uuid:pk>/", IssueStructuredUpdateEndpoint.as_view()),
    path(f"{UPDATES}/<uuid:pk>/correct/", StructuredUpdateCorrectionEndpoint.as_view()),
    path(f"{UPDATES}/<uuid:pk>/revisions/", StructuredUpdateRevisionEndpoint.as_view()),
    path(f"{UPDATES}/<uuid:pk>/links/", StructuredUpdateLinkEndpoint.as_view()),
    path(f"{UPDATES}/<uuid:pk>/links/<uuid:link_id>/", StructuredUpdateLinkEndpoint.as_view()),
    path(f"{UPDATES}/<uuid:pk>/evidence/", StructuredUpdateEvidenceEndpoint.as_view()),
    path(f"{UPDATES}/<uuid:pk>/evidence/<uuid:asset_id>/", StructuredUpdateEvidenceEndpoint.as_view()),
]
