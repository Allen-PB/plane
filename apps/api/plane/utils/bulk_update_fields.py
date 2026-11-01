"""Validation and related-field writes for bulk work item updates."""

from uuid import UUID

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    Label,
    Module,
    ModuleIssue,
    ProjectMember,
    State,
)

RELATION_FIELDS = {"assignee_ids", "label_ids", "module_ids", "cycle_id"}


def validate_dates(start, due):
    if start is not None and due is not None and start > due:
        raise ValidationError("Start Date must be on or before Due Date for every selected work item.")


def parent_chain(parent_id, selected_ids, links):
    """Validate the resulting hierarchy and return its ancestry for the review token."""
    seen, chain = set(), []
    while parent_id is not None:
        if parent_id in selected_ids or parent_id in seen:
            raise ValidationError("Parent cannot be a selected work item or one of its descendants.")
        if parent_id not in links:
            raise ValidationError("Parent must be an available work item in the same project.")
        seen.add(parent_id)
        chain.append((str(parent_id), str(links[parent_id])))
        parent_id = links[parent_id]
    return chain


def project_labels(project):
    return Label.objects.filter(workspace_id=project.workspace_id).filter(Q(project=project) | Q(project__isnull=True))


def validate_update(project, items, changes):
    summary, config = [], {}
    if not changes:
        raise ValidationError("Choose at least one field to update.")
    if "state_id" in changes:
        state = State.objects.filter(project=project, id=changes["state_id"]).first()
        if not state:
            raise ValidationError("Choose a state in the selected project.")
        summary.append(f"State: {state.name}")
        config["state_group"] = state.group
    if "priority" in changes:
        summary.append(f"Priority: {changes['priority'].capitalize()}")
    multiple = [
        (
            "assignee_ids",
            "assignees",
            ProjectMember.objects.filter(project=project, is_active=True, member__is_active=True, role__gte=15),
            "member_id",
        ),
        ("label_ids", "labels", project_labels(project), "id"),
        ("module_ids", "modules", Module.objects.filter(project=project, archived_at__isnull=True), "id"),
    ]
    for field, label, query, id_field in multiple:
        if field not in changes:
            continue
        ids = set(changes[field])
        rows = list(query.filter(**{f"{id_field}__in": ids}).order_by(id_field))
        if len(rows) != len(ids):
            raise ValidationError(f"Choose available {label} in the selected project.")
        if field == "assignee_ids":
            names = [row.member.display_name or row.member.first_name or row.member.email for row in rows]
        else:
            names = [row.name for row in rows]
        summary.append(f"Replace {label}: " + (", ".join(names) or "Clear all"))
    for field, label in [("start_date", "Start Date"), ("target_date", "Due Date")]:
        if field in changes:
            summary.append(f"{label}: {changes[field].isoformat() if changes[field] else 'Clear date'}")
    if "start_date" in changes or "target_date" in changes:
        for item in items:
            validate_dates(changes.get("start_date", item.start_date), changes.get("target_date", item.target_date))
    if "cycle_id" in changes:
        if changes["cycle_id"] is None:
            summary.append("Cycle: Remove existing cycle")
        else:
            cycle = Cycle.objects.filter(project=project, id=changes["cycle_id"], archived_at__isnull=True).first()
            if not cycle or (cycle.end_date is not None and cycle.end_date < timezone.now()):
                raise ValidationError("Choose an available cycle that has not completed in this project.")
            summary.append(f"Cycle: {cycle.name}")
            config["cycle_end"] = str(cycle.end_date)
    if "parent_id" in changes:
        if changes["parent_id"] is None:
            summary.append("Parent: Remove existing parent")
        else:
            parent = Issue.issue_objects.filter(project=project, id=changes["parent_id"]).first()
            if not parent:
                raise ValidationError("Choose an available parent in the same project.")
            links = dict(Issue.objects.filter(project=project).values_list("id", "parent_id"))
            config["parent_chain"] = parent_chain(parent.id, {i.id for i in items}, links)
            ancestor_ids = [UUID(id) for id, _ in config["parent_chain"]]
            locked_links = dict(
                Issue.objects.select_for_update()
                .filter(project=project, id__in=ancestor_ids)
                .order_by("id")
                .values_list("id", "parent_id")
            )
            if any(id not in locked_links or locked_links[id] != links[id] for id in ancestor_ids):
                raise ValidationError("The parent hierarchy changed. Review the operation again.")
            summary.append(f"Parent: {project.identifier}-{parent.sequence_id} · {parent.name}")
    return summary, config


def apply_update(item, project, changes, actor):
    before = {field: str(getattr(item, field)) for field in changes if field not in RELATION_FIELDS}
    for field, value in changes.items():
        if field not in RELATION_FIELDS:
            setattr(item, field, value)
    item.updated_by = actor
    item.save()
    relations = [
        ("assignee_ids", IssueAssignee, "assignee_id"),
        ("label_ids", IssueLabel, "label_id"),
        ("module_ids", ModuleIssue, "module_id"),
        ("cycle_id", CycleIssue, "cycle_id"),
    ]
    for field, model, target in relations:
        if field not in changes:
            continue
        value = changes[field]
        ids = set(value) if field != "cycle_id" else ({value} if value else set())
        before[field] = [str(id) for id in model.objects.filter(issue=item).values_list(target, flat=True)]
        model.objects.filter(issue=item).delete()
        model.objects.bulk_create(
            [
                model(
                    issue=item,
                    project=project,
                    workspace_id=project.workspace_id,
                    created_by=actor,
                    updated_by=actor,
                    **{target: id},
                )
                for id in ids
            ]
        )
    return before
