# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from hashlib import sha256
from uuid import uuid4

import pytest
from django.urls import reverse

from plane.db.models import Issue, ProjectMember, State
from plane.tests.factories import ProjectFactory, ProjectMemberFactory


@pytest.fixture
def atlas_pilot(settings, api_client, workspace, create_user):
    pilot = ProjectFactory(workspace=workspace, identifier="PILOT")
    other = ProjectFactory(workspace=workspace, identifier="OTHER")
    for project in (pilot, other):
        # Deliberately grant membership to both projects to test the credential boundary.
        ProjectMemberFactory(project=project, member=create_user)

    key = "atlas_sync_fixture"
    settings.ATLAS_SYNC_KEY_SHA256 = sha256(key.encode()).hexdigest()
    settings.ATLAS_SYNC_USER_ID = str(create_user.id)
    settings.ATLAS_SYNC_PROJECT_ID = str(pilot.id)
    settings.APP_BASE_URL = "https://sync.example.test"
    api_client.credentials(HTTP_X_API_KEY=key)
    return pilot, other


def create_ticket(project, title):
    state = State.objects.create(project=project, name="In progress", group="started")
    return Issue.objects.create(project=project, name=title, state=state)


def atlas_url(project, ticket_id):
    return reverse("atlas-ticket", args=[project.workspace.slug, project.id, ticket_id])


@pytest.mark.contract
@pytest.mark.django_db
class TestAtlasTicketEndpoint:
    def test_pilot_ticket_has_only_requested_fields(self, api_client, atlas_pilot):
        pilot, _ = atlas_pilot
        ticket = create_ticket(pilot, "Pilot ticket")
        response = api_client.get(atlas_url(pilot, ticket.id), {"expand": "project,state"})
        assert response.status_code == 200
        assert response.json() == {
            "id": str(ticket.id),
            "title": "Pilot ticket",
            "status": "In progress",
            "link": f"https://sync.example.test/{pilot.workspace.slug}/projects/{pilot.id}/issues/{ticket.id}",
        }
        assert response["Cache-Control"] == "private, no-store"

    def test_other_project_ticket_is_hidden(self, api_client, atlas_pilot):
        pilot, other = atlas_pilot
        ticket = create_ticket(other, "Private title")
        missing = api_client.get(atlas_url(pilot, uuid4()))
        for url in (atlas_url(other, ticket.id), atlas_url(pilot, ticket.id)):
            response = api_client.get(url)
            assert response.status_code == missing.status_code == 404
            assert response.json() == missing.json()

    def test_updates_are_denied_and_ticket_remains_unchanged(self, api_client, atlas_pilot):
        pilot, _ = atlas_pilot
        ticket = create_ticket(pilot, "Disposable staging ticket")
        integration_url = atlas_url(pilot, ticket.id)
        normal_url = reverse("work-item-detail", args=[pilot.workspace.slug, pilot.id, ticket.id])
        before = Issue.objects.filter(pk=ticket.id).values().get()
        for url, expected in ((integration_url, 405), (normal_url, 403)):
            assert api_client.patch(url, {"name": "Changed"}, format="json").status_code == expected
        assert Issue.objects.filter(pk=ticket.id).values().get() == before
        assert api_client.get(normal_url).status_code == 403

    def test_revoked_membership_is_denied(self, api_client, atlas_pilot, create_user):
        pilot, _ = atlas_pilot
        ticket = create_ticket(pilot, "Pilot ticket")
        ProjectMember.objects.filter(project=pilot, member=create_user).update(is_active=False)
        assert api_client.get(atlas_url(pilot, ticket.id)).status_code == 404

    def test_disabled_integration_identity_is_denied(self, api_client, atlas_pilot, create_user):
        pilot, _ = atlas_pilot
        ticket = create_ticket(pilot, "Pilot ticket")
        create_user.is_active = False
        create_user.save(update_fields=["is_active"])
        assert api_client.get(atlas_url(pilot, ticket.id)).status_code == 403

    def test_wrong_key_is_denied(self, api_client, atlas_pilot):
        pilot, _ = atlas_pilot
        api_client.credentials(HTTP_X_API_KEY="atlas_sync_wrong")
        assert api_client.get(atlas_url(pilot, uuid4())).status_code == 403
