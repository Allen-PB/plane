import hashlib
import json
from datetime import date
from uuid import UUID

from django.core import signing
from django.db import transaction
from django.db.models import Exists, OuterRef, Q, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.utils.exception_logger import log_exception
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueLabel,
    Cycle,
    CycleIssue,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    WorkspaceMember,
)
from plane.utils.bulk_update import move_plan, move_work_item
from plane.utils.bulk_update_fields import apply_update, project_labels, validate_update


class ChangesSerializer(serializers.Serializer):
    state_id = serializers.UUIDField(required=False)
    priority = serializers.ChoiceField(choices=[p[0] for p in Issue.PRIORITY_CHOICES], required=False)
    assignee_ids = serializers.ListField(child=serializers.UUIDField(), max_length=100, required=False)
    label_ids = serializers.ListField(child=serializers.UUIDField(), max_length=100, required=False)
    module_ids = serializers.ListField(child=serializers.UUIDField(), max_length=100, required=False)
    start_date = serializers.DateField(required=False, allow_null=True)
    target_date = serializers.DateField(required=False, allow_null=True)
    cycle_id = serializers.UUIDField(required=False, allow_null=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True)

    def to_internal_value(self, data):
        unknown = set(data) - set(self.fields) if isinstance(data, dict) else set()
        if unknown:
            raise serializers.ValidationError({key: "Unsupported bulk update field." for key in unknown})
        return super().to_internal_value(data)


class OperationSerializer(serializers.Serializer):
    project_id = serializers.UUIDField()
    issue_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=100)
    operation = serializers.ChoiceField(choices=["update", "move", "archive"])
    action = serializers.ChoiceField(choices=["preview", "apply"])
    changes = ChangesSerializer(required=False, default=dict)
    destinations = serializers.DictField(child=serializers.UUIDField(), required=False, default=dict)
    token = serializers.CharField(required=False, max_length=200000)

    def validate_issue_ids(self, value):
        if len(value) != len(set(value)):
            raise ValidationError("Select each work item only once.")
        return value


def admin_projects(user, slug):
    memberships = ProjectMember.objects.filter(
        member=user,
        workspace__slug=slug,
        is_active=True,
        workspace__workspace_member__member=user,
        workspace__workspace_member__is_active=True,
    )
    if not WorkspaceMember.objects.filter(member=user, workspace__slug=slug, role=20, is_active=True).exists():
        memberships = memberships.filter(role=20)
    return Project.objects.filter(
        workspace__slug=slug, id__in=memberships.values("project_id"), archived_at__isnull=True
    ).order_by("name", "id")


def member_name(member):
    return member.display_name or member.first_name or member.email


def id_filter(params, name):
    """Comma-separated UUIDs; "none" selects work items without a value."""
    values = {v.strip() for v in params.get(name, "").split(",") if v.strip()}
    include_none = "none" in values
    try:
        return {UUID(v) for v in values - {"none"}}, include_none
    except ValueError:
        raise ValidationError({name: "Choose valid filter values."})


def date_filter(params, name):
    value = params.get(name, "").strip()
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationError({name: "Choose a valid date."})


def filter_items(items, params):
    """Values within one filter match any; different filters must all match."""
    state_ids, _ = id_filter(params, "state_ids")
    if state_ids:
        items = items.filter(state_id__in=state_ids)
    priorities = {v.strip() for v in params.get("priorities", "").split(",") if v.strip()}
    if priorities - {p[0] for p in Issue.PRIORITY_CHOICES}:
        raise ValidationError({"priorities": "Choose valid filter values."})
    if priorities:
        items = items.filter(priority__in=priorities)
    for name, model, field in [
        ("assignee_ids", IssueAssignee, "assignee_id"),
        ("label_ids", IssueLabel, "label_id"),
    ]:
        ids, include_none = id_filter(params, name)
        if ids or include_none:
            query = Q(id__in=model.objects.filter(**{f"{field}__in": ids}).values("issue_id"))
            if include_none:
                query |= ~Exists(model.objects.filter(issue=OuterRef("pk")))
            items = items.filter(query)
    parent_ids, include_none = id_filter(params, "parent_ids")
    if parent_ids or include_none:
        query = Q(parent_id__in=parent_ids)
        if include_none:
            query |= Q(parent__isnull=True)
        items = items.filter(query)
    for field, prefix, label in [("start_date", "start_date", "Start Date"), ("target_date", "due_date", "Due Date")]:
        start, end = date_filter(params, f"{prefix}_from"), date_filter(params, f"{prefix}_to")
        if start and end and start > end:
            raise ValidationError({f"{prefix}_from": f"{label} From must be on or before {label} To."})
        if start:
            items = items.filter(**{f"{field}__gte": start})
        if end:
            items = items.filter(**{f"{field}__lte": end})
    return items


class BulkUpdateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        projects = admin_projects(request.user, slug)
        selected = request.query_params.get("project_id")
        if not selected:
            return Response({"projects": list(projects.values("id", "name", "identifier"))})
        try:
            selected = UUID(selected)
        except (ValueError, TypeError):
            raise ValidationError({"project_id": "Choose a valid project."})
        project = get_object_or_404(projects, pk=selected)
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (TypeError, ValueError):
            raise ValidationError({"page": "Choose a valid page."})
        items = (
            filter_items(
                Issue.objects.filter(project=project, archived_at__isnull=True, is_draft=False), request.query_params
            )
            .select_related("state", "parent")
            .prefetch_related(
                Prefetch("issue_assignee", queryset=IssueAssignee.objects.select_related("assignee")),
                Prefetch("label_issue", queryset=IssueLabel.objects.select_related("label").order_by("label__name")),
            )
            .order_by("sequence_id")
        )
        search = request.query_params.get("search", "").strip()[:255]
        if search:
            query = Q(name__icontains=search)
            sequence = search.removeprefix(project.identifier + "-")
            if sequence.isdigit() and len(sequence) < 10:
                query |= Q(sequence_id=int(sequence))
            items = items.filter(query)
        return Response(
            {
                "count": items.count(),
                "results": [
                    {
                        "id": item.id,
                        "key": f"{project.identifier}-{item.sequence_id}",
                        "name": item.name,
                        "state": item.state.name if item.state else "",
                        "state_group": item.state.group if item.state else "",
                        "priority": item.priority,
                        "assignees": [member_name(row.assignee) for row in item.issue_assignee.all()],
                        "labels": [row.label.name for row in item.label_issue.all()],
                        "start_date": item.start_date,
                        "target_date": item.target_date,
                        "parent": f"{project.identifier}-{item.parent.sequence_id}" if item.parent else "",
                    }
                    for item in items[(page - 1) * 25 : page * 25]
                ],
                "metadata": {
                    "states": list(State.objects.filter(project=project).values("id", "name")),
                    "members": [
                        {"id": row.member_id, "name": member_name(row.member)}
                        for row in ProjectMember.objects.filter(
                            project=project, is_active=True, member__is_active=True, role__gte=15
                        ).select_related("member")
                    ],
                    "labels": list(project_labels(project).order_by("name", "id").values("id", "name")),
                    "cycles": list(
                        Cycle.objects.filter(project=project, archived_at__isnull=True)
                        .filter(Q(end_date__isnull=True) | Q(end_date__gte=timezone.now()))
                        .order_by("name", "id")
                        .values("id", "name")
                    ),
                    "modules": list(
                        Module.objects.filter(project=project, archived_at__isnull=True)
                        .order_by("name", "id")
                        .values("id", "name")
                    ),
                    "parents": [
                        {"id": parent.id, "name": f"{project.identifier}-{parent.sequence_id} · {parent.name}"}
                        for parent in Issue.issue_objects.filter(
                            project=project,
                            id__in=Issue.issue_objects.filter(project=project, parent__isnull=False).values(
                                "parent_id"
                            ),
                        ).order_by("sequence_id")
                    ],
                },
            }
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    @transaction.atomic
    def post(self, request, slug):
        serializer = OperationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        projects = admin_projects(request.user, slug)
        source = get_object_or_404(projects.select_for_update(), pk=data["project_id"])
        if data["operation"] == "archive":
            return archive_operation(request, source, data)
        items = list(
            Issue.issue_objects.select_for_update(of=("self",))
            .filter(project=source, id__in=data["issue_ids"])
            .order_by("id")
        )
        if len(items) != len(data["issue_ids"]):
            raise ValidationError("Some work items are unavailable. Choose the work items again.")
        changes = data["changes"]
        operation = data["operation"]
        summary, plans = [], {}
        config = {}
        if operation == "update":
            summary, config = validate_update(source, items, changes)
        elif operation == "move":
            if set(data["destinations"]) != {str(item.id) for item in items}:
                raise ValidationError("Choose one destination for every selected work item.")
            destination_ids = set(data["destinations"].values())
            destinations = {p.id: p for p in projects.select_for_update().filter(id__in=destination_ids).order_by("id")}
            if set(destinations) != destination_ids:
                raise PermissionDenied("Admin access is required in every destination project.")
            for item in items:
                destination = destinations[data["destinations"][str(item.id)]]
                if destination.id == source.id:
                    raise ValidationError("Choose a different destination project.")
                plans[str(item.id)] = move_plan(item, destination, data["destinations"])
                summary.append(
                    f"{source.identifier}-{item.sequence_id} → {destination.name}; "
                    f"State: {plans[str(item.id)]['state_name']}"
                )
            summary.append(
                "Work item keys change in destination projects. "
                "Titles, descriptions and compatible assignments are preserved."
            )

        snapshot = {
            "user": str(request.user.id),
            "project": str(source.id),
            "operation": operation,
            "changes": changes,
            "destinations": data["destinations"],
            "plans": plans,
            "summary": summary,
            "configuration": config,
            "items": [
                {
                    "id": str(i.id),
                    "updated_at": str(i.updated_at),
                    "name": i.name,
                    "state": str(i.state_id),
                    "priority": i.priority,
                    "start_date": str(i.start_date),
                    "target_date": str(i.target_date),
                    "parent": str(i.parent_id),
                    "labels": sorted(
                        str(v) for v in IssueLabel.objects.filter(issue=i).values_list("label_id", flat=True)
                    ),
                    "cycles": sorted(
                        str(v) for v in CycleIssue.objects.filter(issue=i).values_list("cycle_id", flat=True)
                    ),
                    "modules": sorted(
                        str(v) for v in ModuleIssue.objects.filter(issue=i).values_list("module_id", flat=True)
                    ),
                    "assignees": sorted(
                        str(v) for v in IssueAssignee.objects.filter(issue=i).values_list("assignee_id", flat=True)
                    ),
                }
                for i in items
            ],
        }
        digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode()).hexdigest()
        if data["action"] == "preview":
            return Response(
                {
                    "token": signing.dumps(digest, salt="bulk-update"),
                    "count": len(items),
                    "summary": summary,
                    "items": [{"key": f"{source.identifier}-{i.sequence_id}", "name": i.name} for i in items],
                }
            )
        try:
            current = signing.loads(data.get("token", ""), salt="bulk-update", max_age=900)
        except signing.BadSignature:
            return Response({"error": "Review expired. Go back and review the operation again."}, status=409)
        if current != digest:
            return Response({"error": "Work items or configuration changed. Go back and review again."}, status=409)
        for item in items:
            if operation == "update":
                before = apply_update(item, source, changes, request.user)
                IssueActivity.objects.create(
                    issue=item,
                    project=source,
                    actor=request.user,
                    verb="updated",
                    field="bulk_update",
                    old_value=json.dumps(before),
                    comment="Bulk Update: " + "; ".join(summary),
                )
            elif operation == "move":
                move_work_item(
                    item, destinations[data["destinations"][str(item.id)]], plans[str(item.id)], request.user
                )
        return Response({"count": len(items)})


def archive_operation(request, source, data):
    """Keep each reviewed ticket's archive and history inside its own savepoint."""
    selected_ids = [str(value) for value in data["issue_ids"]]
    items = {
        str(item.id): item
        for item in (
            Issue.objects.select_for_update(of=("self",))
            .select_related("type")
            .filter(project=source, id__in=selected_ids)
            .order_by("id")
        )
    }
    if data["action"] == "preview":
        reviewed = [
            {
                "id": value,
                "key": f"{source.identifier}-{items[value].sequence_id}",
                "name": items[value].name,
                "version": str(items[value].updated_at),
            }
            if value in items and not items[value].is_draft and items[value].archived_at is None
            else {"id": value, "key": value, "name": "Unavailable work item", "version": None}
            for value in selected_ids
        ]
        token = signing.dumps(
            {"user": str(request.user.id), "project": str(source.id), "operation": "archive", "items": reviewed},
            salt="bulk-archive",
            compress=True,
        )
        return Response(
            {
                "token": token,
                "count": len(reviewed),
                "items": reviewed,
                "summary": [
                    f"Archive {len(reviewed)} selected work items. Restore them later from project Archives.",
                    "Unavailable, unsupported, or changed work items will be skipped and identified in the results.",
                    *(
                        ["Epic work items are not supported by project Archives and will be skipped."]
                        if any(item.type and item.type.is_epic for item in items.values())
                        else []
                    ),
                ],
            }
        )
    try:
        review = signing.loads(data.get("token", ""), salt="bulk-archive", max_age=900)
    except signing.BadSignature:
        return Response({"error": "Review expired. Go back and review the operation again."}, status=409)
    if (
        review["user"] != str(request.user.id)
        or review["project"] != str(source.id)
        or review["operation"] != "archive"
        or [row["id"] for row in review["items"]] != selected_ids
    ):
        return Response({"error": "Selection changed. Go back and review again."}, status=409)
    results = []
    for row in review["items"]:
        item = items.get(row["id"])
        result = {"id": row["id"], "key": row["key"], "name": row["name"]}
        if item is None or item.is_draft or item.archived_at is not None or row["version"] is None:
            results.append({**result, "status": "skipped", "reason": "Work item is unavailable or already archived."})
            continue
        if item.type and item.type.is_epic:
            results.append(
                {
                    **result,
                    "status": "skipped",
                    "reason": "Epic work items cannot appear in project Archives and were left unchanged.",
                }
            )
            continue
        if str(item.updated_at) != row["version"]:
            results.append(
                {**result, "status": "skipped", "reason": "Work item changed since review. Review it again."}
            )
            continue
        try:
            with transaction.atomic():
                archived_at = timezone.now().date()
                item.archived_at = archived_at
                item.updated_by = request.user
                item.save(update_fields=["archived_at", "updated_at", "updated_by"])
                IssueActivity.objects.create(
                    issue=item,
                    project=source,
                    actor=request.user,
                    verb="updated",
                    field="archived_at",
                    old_value=None,
                    new_value=str(archived_at),
                    comment="Bulk Update: archived",
                )
        except Exception as exc:
            log_exception(exc)
            results.append({**result, "status": "failed", "reason": "Unable to archive this work item. Try again."})
        else:
            results.append({**result, "status": "archived", "reason": ""})
    return Response({"count": sum(row["status"] == "archived" for row in results), "results": results})
