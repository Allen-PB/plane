# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hashlib
from secrets import compare_digest
from uuid import UUID

from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed, NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from plane.db.models import Issue, ProjectMember, User
from plane.utils.host import base_host


class AtlasAuthentication(BaseAuthentication):
    def authenticate(self, request):
        key = request.headers.get("X-Api-Key")
        expected = settings.ATLAS_SYNC_KEY_SHA256
        if (
            not key
            or not key.startswith("atlas_sync_")
            or not compare_digest(hashlib.sha256(key.encode()).hexdigest().encode(), expected.encode())
        ):
            raise AuthenticationFailed("Invalid integration credential.")

        try:
            user_id = UUID(settings.ATLAS_SYNC_USER_ID)
        except ValueError:
            raise AuthenticationFailed("Invalid integration credential.") from None

        user = User.objects.filter(pk=user_id, is_active=True).first()
        if user is None:
            raise AuthenticationFailed("Invalid integration credential.")
        return user, None


class AtlasRateThrottle(UserRateThrottle):
    scope = "atlas_sync"
    rate = settings.API_KEY_RATE_LIMIT


class AtlasTicketEndpoint(APIView):
    authentication_classes = [AtlasAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [AtlasRateThrottle]
    renderer_classes = [JSONRenderer]
    http_method_names = ["get"]

    def get(self, request, slug, project_id, ticket_id):
        if (
            str(project_id) != settings.ATLAS_SYNC_PROJECT_ID
            or not ProjectMember.objects.filter(
                workspace__slug=slug, project_id=project_id, member=request.user, is_active=True
            ).exists()
        ):
            raise NotFound()

        ticket = (
            Issue.issue_objects.select_related("state")
            .filter(
                workspace__slug=slug,
                project_id=project_id,
                pk=ticket_id,
            )
            .first()
        )
        if ticket is None:
            raise NotFound()

        origin = base_host(request, is_app=True).rstrip("/")
        state = ticket.state
        response = Response(
            {
                "id": str(ticket.id),
                "title": ticket.name,
                "status": state.name if state and state.project_id == project_id else None,
                "link": f"{origin}/{slug}/projects/{project_id}/issues/{ticket.id}",
            }
        )
        response["Cache-Control"] = "private, no-store"
        return response
