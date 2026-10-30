"""Compatibility checks and transactional moves for the Bulk Update wizard."""

import re

from django.db import connection
from django.db.models import Max
from rest_framework.exceptions import ValidationError

from plane.db.models import (
    Cycle,
    CycleIssue,
    EstimatePoint,
    FileAsset,
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueLabel,
    IssueSequence,
    IssueType,
    Label,
    Module,
    ModuleIssue,
    ProjectMember,
    State,
)
from plane.db.models.issue_type import ProjectIssueType
from plane.utils.uuid import convert_uuid_to_integer


def available_types(project):
    """Respect project type configuration where present; otherwise use workspace types."""
    links = ProjectIssueType.objects.filter(project=project)
    types = IssueType.objects.filter(workspace_id=project.workspace_id, is_active=True)
    return types.filter(id__in=links.values("issue_type_id")) if links.exists() else types


def unique_match(query, description):
    matches = list(query[:2])
    if len(matches) != 1:
        raise ValidationError(
            f"Destination requires one matching {description}. Configure it before moving these work items."
        )
    return matches[0]


def move_plan(item, destination, destinations):
    """Never silently discard a project-specific assignment."""
    if item.state is None:
        raise ValidationError("Assign a state to the work item before moving it.")
    if item.parent_id and destinations.get(str(item.parent_id)) != destination.id:
        raise ValidationError("Move parent and child work items together to the same destination.")
    children = list(Issue.objects.filter(parent=item).values_list("id", flat=True))
    if any(destinations.get(str(child)) != destination.id for child in children):
        raise ValidationError("Move parent and child work items together to the same destination.")
    state = unique_match(
        State.objects.filter(project=destination, name__iexact=item.state.name, group=item.state.group), "state"
    )
    if item.type_id and not available_types(destination).filter(id=item.type_id).exists():
        raise ValidationError("Enable this work item type in the destination project first.")
    assignees = set(IssueAssignee.objects.filter(issue=item).values_list("assignee_id", flat=True))
    eligible = set(
        ProjectMember.objects.filter(
            project=destination, is_active=True, role__gte=15, member__is_active=True, member_id__in=assignees
        ).values_list("member_id", flat=True)
    )
    if assignees != eligible:
        raise ValidationError("All assignees must be active members of the destination project.")
    plan = {
        "state_id": str(state.id),
        "state_name": state.name,
        "labels": {},
        "cycles": {},
        "modules": {},
        "estimate_point_id": None,
        "children": sorted(str(child) for child in children),
        "parent": str(item.parent_id),
        "type": str(item.type_id),
        "assignees": sorted(str(a) for a in assignees),
    }
    for bridge in IssueLabel.objects.filter(issue=item).select_related("label"):
        label = bridge.label
        if label.project_id is None:
            mapped = label
        else:
            mapped = unique_match(Label.objects.filter(project=destination, name__iexact=label.name), "label")
        plan["labels"][str(bridge.id)] = str(mapped.id)
    for bridge in CycleIssue.objects.filter(issue=item).select_related("cycle"):
        mapped = unique_match(Cycle.objects.filter(project=destination, name__iexact=bridge.cycle.name), "cycle")
        plan["cycles"][str(bridge.id)] = str(mapped.id)
    for bridge in ModuleIssue.objects.filter(issue=item).select_related("module"):
        mapped = unique_match(Module.objects.filter(project=destination, name__iexact=bridge.module.name), "module")
        plan["modules"][str(bridge.id)] = str(mapped.id)
    if item.estimate_point_id:
        mapped = unique_match(
            EstimatePoint.objects.filter(
                project=destination, estimate=destination.estimate, value=item.estimate_point.value
            ),
            "estimate value",
        )
        plan["estimate_point_id"] = str(mapped.id)
    return plan


def replace_project_urls(value, old, new):
    if isinstance(value, str):
        # Rewrite asset routes only. Links to other work items must stay intact.
        return re.sub(
            rf"(/api/assets/v2/workspaces/[^/]+/projects/){re.escape(str(old))}/",
            lambda match: f"{match.group(1)}{new}/",
            value,
        )
    if isinstance(value, list):
        return [replace_project_urls(v, old, new) for v in value]
    if isinstance(value, dict):
        return {k: replace_project_urls(v, old, new) for k, v in value.items()}
    return value


def move_work_item(item, destination, plan, actor):
    """Called only inside the endpoint transaction after the full batch is validated."""
    source_id = item.project_id
    completed_at = item.completed_at
    old_key = f"{item.project.identifier}-{item.sequence_id}"
    with connection.cursor() as cursor:
        # Same lock used by Issue.save when allocating identifiers.
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [convert_uuid_to_integer(destination.id)])
    sequence = (IssueSequence.objects.filter(project=destination).aggregate(value=Max("sequence"))["value"] or 0) + 1
    item.project = destination
    item.sequence_id = sequence
    item.state_id = plan["state_id"]
    item.estimate_point_id = plan["estimate_point_id"]
    item.updated_by = actor
    item.description_html = replace_project_urls(item.description_html, source_id, destination.id)
    item.description_json = replace_project_urls(item.description_json, source_id, destination.id)
    # Binary editor state may contain source project URLs. Rebuild it from HTML on next edit.
    item.description_binary = None
    item.save()
    if completed_at is not None and item.state.group == "completed":
        Issue.objects.filter(pk=item.pk).update(completed_at=completed_at)
        item.completed_at = completed_at
    IssueSequence.objects.create(issue=item, sequence=sequence, project=destination)
    for model, field, key in [
        (IssueLabel, "label_id", "labels"),
        (CycleIssue, "cycle_id", "cycles"),
        (ModuleIssue, "module_id", "modules"),
    ]:
        for bridge_id, target_id in plan[key].items():
            model.objects.filter(id=bridge_id).update(**{field: target_id})
    # Move project-scoped issue resources, retaining historical sequence allocations.
    for relation in Issue._meta.related_objects:
        model = relation.related_model
        fields = {field.name for field in model._meta.fields}
        if model in (Issue, IssueSequence) or "project" not in fields:
            continue
        if relation.field.name != "issue":
            continue
        rows = model.objects.filter(issue=item)
        rows.update(project=destination)
        # Comment bodies can contain asset URLs scoped to the original project.
        for row in rows if "comment_html" in fields else []:
            row.comment_html = replace_project_urls(row.comment_html, source_id, destination.id)
            row.comment_json = replace_project_urls(row.comment_json, source_id, destination.id)
            row.save()
    # Some inline comment assets reference the comment rather than the issue directly.
    FileAsset.objects.filter(comment__issue=item).update(project=destination)
    IssueActivity.objects.create(
        issue=item,
        project=destination,
        actor=actor,
        verb="updated",
        field="project",
        old_value=old_key,
        new_value=f"{destination.identifier}-{sequence}",
        comment="Bulk Update: moved to " + destination.name,
    )
