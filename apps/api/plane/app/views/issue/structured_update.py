# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import uuid
from collections import defaultdict

# Django imports
from django.db import transaction
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.structured_update import (
    FunctionalRoleAssignmentSerializer,
    IssueStructuredSummarySerializer,
    ProjectStructuredUpdateSettingSerializer,
    StructuredUpdateCorrectionSerializer,
    StructuredUpdateCreateSerializer,
    StructuredUpdateEditSerializer,
    StructuredUpdateLinkInputSerializer,
    StructuredUpdateRevisionSerializer,
    StructuredUpdateSerializer,
)
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import (
    FileAsset,
    FunctionalRole,
    Issue,
    IssueStructuredSummary,
    ProjectMember,
    ProjectMemberFunctionalRole,
    ProjectStructuredUpdateSetting,
    StructuredUpdate,
    StructuredUpdateLink,
    StructuredUpdateRevision,
)
from plane.settings.storage import S3Storage
from plane.utils.host import base_host
from plane.utils.path_validator import sanitize_filename
from plane.utils.structured_update import (
    ADMIN,
    EVIDENCE_MIME_TYPES,
    EVIDENCE_SIZE_LIMIT,
    MAX_LINKS_PER_UPDATE,
    MEMBER,
    apply_to_summary,
    can_submit,
    check_state_gate,
    correction_error,
    expected_step_label,
    get_project_setting,
    instance_enabled,
    is_project_admin,
    next_qa_round,
    suggested_mapping,
    target_state_id,
    user_functional_roles,
)

DISABLED_ERROR = {"error": "Structured updates are not enabled for this project."}
INSTANCE_DISABLED_ERROR = {"error": "Structured updates are turned off for this instance."}


def disabled_response(project_id):
    if not instance_enabled():
        return Response(INSTANCE_DISABLED_ERROR, status=status.HTTP_403_FORBIDDEN)
    setting = get_project_setting(project_id)
    if setting is None or not setting.is_enabled:
        return Response(DISABLED_ERROR, status=status.HTTP_403_FORBIDDEN)
    return None


def get_issue(slug, project_id, issue_id):
    return get_object_or_404(Issue.issue_objects, pk=issue_id, project_id=project_id, workspace__slug=slug)


def updates_queryset(issue_id):
    return (
        StructuredUpdate.objects.filter(issue_id=issue_id)
        .select_related("actor")
        .prefetch_related("links", "revisions", "corrections")
        .order_by("created_at")
    )


def evidence_context(slug, update_ids):
    assets = (
        FileAsset.objects.filter(
            entity_type=FileAsset.EntityTypeContext.STRUCTURED_UPDATE_EVIDENCE,
            entity_identifier__in=[str(i) for i in update_ids],
            workspace__slug=slug,
            is_uploaded=True,
            is_deleted=False,
        )
        .select_related("workspace")
        .order_by("created_at")
    )
    grouped = defaultdict(list)
    for asset in assets:
        grouped[asset.entity_identifier].append(asset)
    return {"evidence": grouped}


def serialize_update(slug, update):
    return StructuredUpdateSerializer(update, context=evidence_context(slug, [update.id])).data


def get_own_update(slug, project_id, issue_id, pk, user):
    """Only the author may change an update, its notes or its evidence."""
    update = get_object_or_404(
        StructuredUpdate.objects.select_for_update(of=("self",)),
        pk=pk,
        issue_id=issue_id,
        project_id=project_id,
        workspace__slug=slug,
    )
    if update.actor_id != user.id:
        return None, Response({"error": "Only the author can edit this update."}, status=status.HTTP_403_FORBIDDEN)
    return update, None


def move_issue(request, issue, update, mapped):
    """Move the work item to the update's mapped state. Returns a warning when no state is mapped."""
    from_state_id = update.from_state_id
    if not mapped:
        expected = expected_step_label(update.role, update.result)
        return (
            f"Next step: {expected}. This state is not set up in this project's structured update "
            "settings, so the state was not changed."
        )
    to_state_id = update.to_state_id
    if to_state_id == from_state_id:
        return None
    issue.state_id = to_state_id
    issue.save(update_fields=["state", "updated_at", "updated_by"])
    origin = base_host(request=request, is_app=True)
    actor_id = str(request.user.id)
    transaction.on_commit(
        lambda: issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({"state_id": str(to_state_id)}),
            actor_id=actor_id,
            issue_id=str(issue.id),
            project_id=str(issue.project_id),
            current_instance=json.dumps({"state_id": str(from_state_id) if from_state_id else None}),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=origin,
        )
    )
    return None


def created_response(slug, issue, update, warning):
    body = serialize_update(slug, updates_queryset(issue.id).get(pk=update.id))
    body["warning"] = warning
    body["expected_step"] = expected_step_label(update.role, update.result)
    body["state_id"] = str(issue.state_id) if issue.state_id else None
    return Response(body, status=status.HTTP_201_CREATED)


class ProjectStructuredUpdateSettingEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        setting = get_project_setting(project_id)
        suggested = suggested_mapping(project_id)
        if setting is None:
            data = {"id": None, "project_id": str(project_id), "is_enabled": False, "enforce_state_gate": True}
            data.update(suggested)
        else:
            data = ProjectStructuredUpdateSettingSerializer(setting).data
        data["suggested_mapping"] = suggested
        data["my_roles"] = sorted(user_functional_roles(project_id, request.user))
        data["is_project_admin"] = is_project_admin(project_id, request.user)
        data["instance_enabled"] = instance_enabled()
        return Response(data)

    @allow_permission([ROLE.ADMIN])
    @transaction.atomic
    def patch(self, request, slug, project_id):
        setting = get_project_setting(project_id)
        if setting is None:
            # First save: start from the suggested mapping unless the request overrides it.
            initial = {**suggested_mapping(project_id), **request.data}
            serializer = ProjectStructuredUpdateSettingSerializer(data=initial, context={"project_id": project_id})
        else:
            serializer = ProjectStructuredUpdateSettingSerializer(
                setting, data=request.data, partial=True, context={"project_id": project_id}
            )
        serializer.is_valid(raise_exception=True)
        serializer.save(project_id=project_id)
        return Response(serializer.data)


class ProjectFunctionalRoleEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        roles = defaultdict(list)
        for member_id, role in (
            ProjectMemberFunctionalRole.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                member__member_project__project_id=project_id,
                member__member_project__is_active=True,
                member__member_project__deleted_at__isnull=True,
            )
            .order_by("role")
            .values_list("member_id", "role")
            .distinct()
        ):
            roles[str(member_id)].append(role)
        return Response([{"member_id": member_id, "roles": r} for member_id, r in roles.items()])

    @allow_permission([ROLE.ADMIN])
    @transaction.atomic
    def put(self, request, slug, project_id):
        """Replace one member's functional roles."""
        serializer = FunctionalRoleAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member_id = serializer.validated_data["member_id"]
        roles = set(serializer.validated_data["roles"])
        membership = ProjectMember.objects.filter(
            project_id=project_id, workspace__slug=slug, member_id=member_id, is_active=True
        ).first()
        if membership is None:
            return Response({"error": "User is not a member of this project."}, status=status.HTTP_400_BAD_REQUEST)
        if roles and membership.role not in (ADMIN, MEMBER):
            return Response(
                {"error": "Functional roles can only be given to project Admins and Members."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        existing = ProjectMemberFunctionalRole.objects.filter(project_id=project_id, member_id=member_id)
        existing.exclude(role__in=roles).delete()
        current = set(existing.values_list("role", flat=True))
        for role in roles - current:
            ProjectMemberFunctionalRole.objects.create(project_id=project_id, member_id=member_id, role=role)
        return Response({"member_id": str(member_id), "roles": sorted(roles)})


class IssueStructuredUpdateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id, pk=None):
        if blocked := disabled_response(project_id):
            return blocked
        issue = get_issue(slug, project_id, issue_id)
        if pk:
            return Response(serialize_update(slug, get_object_or_404(updates_queryset(issue.id), pk=pk)))
        updates = list(updates_queryset(issue.id))
        summary = IssueStructuredSummary.objects.filter(issue=issue).first()
        return Response(
            {
                "results": StructuredUpdateSerializer(
                    updates, many=True, context=evidence_context(slug, [u.id for u in updates])
                ).data,
                "summary": IssueStructuredSummarySerializer(summary).data if summary else None,
            }
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        if blocked := disabled_response(project_id):
            return blocked
        serializer = StructuredUpdateCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        role = data["role"]
        if not can_submit(project_id, request.user, role):
            return Response(
                {"error": f"You do not have the {FunctionalRole(role).label} role on this project."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            issue = get_object_or_404(
                Issue.issue_objects.select_for_update(of=("self",)).select_related("state"),
                pk=issue_id,
                project_id=project_id,
                workspace__slug=slug,
            )
            setting = ProjectStructuredUpdateSetting.objects.select_for_update().get(
                project_id=project_id, deleted_at__isnull=True
            )
            gate_error = check_state_gate(setting, role, issue)
            overridden = False
            if gate_error:
                if not (data["override_state_gate"] and is_project_admin(project_id, request.user)):
                    return Response({"error": gate_error}, status=status.HTTP_409_CONFLICT)
                overridden = True

            from_state_id = issue.state_id
            to_state_id = target_state_id(setting, role, data["result"])
            update = StructuredUpdate.objects.create(
                project_id=project_id,
                issue=issue,
                role=role,
                actor=request.user,
                result=data["result"],
                root_cause_category=data["root_cause_category"],
                root_cause=data["root_cause"],
                resolution=data["resolution"],
                validation=data["validation"],
                pr_link=data["pr_link"],
                testmo_ref=data["testmo_ref"],
                from_state_id=from_state_id,
                to_state_id=to_state_id or from_state_id,
                qa_round=next_qa_round(issue) if role == FunctionalRole.QA else 0,
                state_gate_overridden=overridden,
            )
            for link in data["links"]:
                StructuredUpdateLink.objects.create(
                    project_id=project_id, structured_update=update, url=link["url"], title=link["title"]
                )
            apply_to_summary(issue, update)

            warning = move_issue(request, issue, update, mapped=to_state_id is not None)

        return created_response(slug, issue, update, warning)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @transaction.atomic
    def patch(self, request, slug, project_id, issue_id, pk):
        if blocked := disabled_response(project_id):
            return blocked
        update, denied = get_own_update(slug, project_id, issue_id, pk, request.user)
        if denied:
            return denied
        serializer = StructuredUpdateEditSerializer(update, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changes = {
            field: {"old": getattr(update, field), "new": value}
            for field, value in serializer.validated_data.items()
            if getattr(update, field) != value
        }
        if changes:
            for field, change in changes.items():
                setattr(update, field, change["new"])
            update.edited_at = timezone.now()
            update.save()
            StructuredUpdateRevision.objects.create(
                project_id=project_id, structured_update=update, edited_by=request.user, changes=changes
            )
        return Response(serialize_update(slug, updates_queryset(issue_id).get(pk=update.id)))


class StructuredUpdateCorrectionEndpoint(BaseAPIView):
    """Correct the author's latest result or root cause category with a new, linked update.

    The state check is skipped (the wrong result already moved the work item), the QA round is kept,
    and the work item moves to the state mapped for the corrected value.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, pk):
        if blocked := disabled_response(project_id):
            return blocked
        serializer = StructuredUpdateCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            issue = get_object_or_404(
                Issue.issue_objects.select_for_update(of=("self",)).select_related("state"),
                pk=issue_id,
                project_id=project_id,
                workspace__slug=slug,
            )
            setting = ProjectStructuredUpdateSetting.objects.select_for_update().get(
                project_id=project_id, deleted_at__isnull=True
            )
            original = get_object_or_404(StructuredUpdate, pk=pk, issue=issue, project_id=project_id)
            if original.actor_id != request.user.id:
                return Response({"error": "Only the author can correct this update."}, status=status.HTTP_403_FORBIDDEN)
            if not can_submit(project_id, request.user, original.role):
                return Response(
                    {"error": f"You no longer have the {FunctionalRole(original.role).label} role on this project."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            latest_id = (
                StructuredUpdate.objects.filter(issue=issue)
                .order_by("-created_at")
                .values_list("id", flat=True)
                .first()
            )
            is_dev = original.role == FunctionalRole.DEV
            result = "" if is_dev else data["result"].strip()
            category = data["root_cause_category"].strip() if is_dev else ""
            if error := correction_error(original, latest_id, request.user.id, result, category):
                return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

            from_state_id = issue.state_id
            to_state_id = target_state_id(setting, original.role, result)
            update = StructuredUpdate.objects.create(
                project_id=project_id,
                issue=issue,
                role=original.role,
                actor=request.user,
                result=result,
                root_cause_category=category,
                root_cause=original.root_cause,
                resolution=original.resolution,
                validation=original.validation,
                pr_link=original.pr_link,
                testmo_ref=original.testmo_ref,
                from_state_id=from_state_id,
                to_state_id=to_state_id or from_state_id,
                qa_round=original.qa_round,
                corrects=original,
                correction_reason=data["reason"],
            )
            apply_to_summary(issue, update)
            warning = move_issue(request, issue, update, mapped=to_state_id is not None)

        return created_response(slug, issue, update, warning)


class StructuredUpdateRevisionEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id, pk):
        if blocked := disabled_response(project_id):
            return blocked
        update = get_object_or_404(
            StructuredUpdate, pk=pk, issue_id=issue_id, project_id=project_id, workspace__slug=slug
        )
        revisions = update.revisions.select_related("edited_by").order_by("created_at")
        return Response(StructuredUpdateRevisionSerializer(revisions, many=True).data)


class StructuredUpdateLinkEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @transaction.atomic
    def post(self, request, slug, project_id, issue_id, pk):
        if blocked := disabled_response(project_id):
            return blocked
        update, denied = get_own_update(slug, project_id, issue_id, pk, request.user)
        if denied:
            return denied
        serializer = StructuredUpdateLinkInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if update.links.count() >= MAX_LINKS_PER_UPDATE:
            return Response(
                {"error": f"At most {MAX_LINKS_PER_UPDATE} links are allowed."}, status=status.HTTP_400_BAD_REQUEST
            )
        StructuredUpdateLink.objects.create(
            project_id=project_id, structured_update=update, **serializer.validated_data
        )
        return Response(serialize_update(slug, updates_queryset(issue_id).get(pk=update.id)), status=201)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @transaction.atomic
    def delete(self, request, slug, project_id, issue_id, pk, link_id):
        if blocked := disabled_response(project_id):
            return blocked
        update, denied = get_own_update(slug, project_id, issue_id, pk, request.user)
        if denied:
            return denied
        get_object_or_404(StructuredUpdateLink, pk=link_id, structured_update=update).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StructuredUpdateEvidenceEndpoint(BaseAPIView):
    """Image/video evidence via presigned upload, scoped to one structured update."""

    def get_asset(self, slug, project_id, issue_id, pk, asset_id):
        return get_object_or_404(
            FileAsset,
            pk=asset_id,
            workspace__slug=slug,
            project_id=project_id,
            issue_id=issue_id,
            entity_type=FileAsset.EntityTypeContext.STRUCTURED_UPDATE_EVIDENCE,
            entity_identifier=str(pk),
            is_deleted=False,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @transaction.atomic
    def post(self, request, slug, project_id, issue_id, pk):
        if blocked := disabled_response(project_id):
            return blocked
        update, denied = get_own_update(slug, project_id, issue_id, pk, request.user)
        if denied:
            return denied
        name = sanitize_filename(request.data.get("name")) or "unnamed"
        file_type = request.data.get("type")
        try:
            size = int(request.data.get("size", 0))
        except (TypeError, ValueError):
            size = 0
        if file_type not in EVIDENCE_MIME_TYPES:
            return Response(
                {"error": "Only image (JPEG, PNG, GIF, WebP) and video (MP4, WebM, MOV) files are allowed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if size <= 0 or size > EVIDENCE_SIZE_LIMIT:
            return Response(
                {"error": f"File must be smaller than {EVIDENCE_SIZE_LIMIT // (1024 * 1024)} MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        asset_key = f"{update.workspace_id}/{uuid.uuid4().hex}-{name}"
        asset = FileAsset.objects.create(
            attributes={"name": name, "type": file_type, "size": size},
            asset=asset_key,
            size=size,
            workspace_id=update.workspace_id,
            project_id=project_id,
            issue_id=issue_id,
            created_by=request.user,
            entity_type=FileAsset.EntityTypeContext.STRUCTURED_UPDATE_EVIDENCE,
            entity_identifier=str(update.id),
        )
        # The presigned policy pins both content type and maximum length, so storage rejects anything else.
        presigned = S3Storage(request=request).generate_presigned_post(
            object_name=asset_key, file_type=file_type, file_size=size
        )
        return Response({"upload_data": presigned, "asset_id": str(asset.id)}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @transaction.atomic
    def patch(self, request, slug, project_id, issue_id, pk, asset_id):
        if blocked := disabled_response(project_id):
            return blocked
        update, denied = get_own_update(slug, project_id, issue_id, pk, request.user)
        if denied:
            return denied
        asset = self.get_asset(slug, project_id, issue_id, update.id, asset_id)
        if not asset.is_uploaded:
            asset.is_uploaded = True
            asset.save(update_fields=["is_uploaded", "updated_at"])
            transaction.on_commit(lambda: get_asset_object_metadata.delay(str(asset.id)))
        return Response(serialize_update(slug, updates_queryset(issue_id).get(pk=update.id)))

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id, pk, asset_id):
        if blocked := disabled_response(project_id):
            return blocked
        asset = self.get_asset(slug, project_id, issue_id, pk, asset_id)
        if not asset.is_uploaded:
            return Response({"error": "The asset is not uploaded."}, status=status.HTTP_400_BAD_REQUEST)
        url = S3Storage(request=request).generate_presigned_url(
            object_name=asset.asset.name,
            disposition="inline" if request.GET.get("inline") == "true" else "attachment",
            filename=asset.attributes.get("name"),
        )
        return HttpResponseRedirect(url)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @transaction.atomic
    def delete(self, request, slug, project_id, issue_id, pk, asset_id):
        if blocked := disabled_response(project_id):
            return blocked
        update, denied = get_own_update(slug, project_id, issue_id, pk, request.user)
        if denied:
            return denied
        asset = self.get_asset(slug, project_id, issue_id, update.id, asset_id)
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
