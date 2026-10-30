# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Preview and atomically copy workflow configuration into a locked project."""

import hashlib
import json
from rest_framework.exceptions import ValidationError
from plane.db.models import Estimate, EstimatePoint, Issue, Label, State


def project_snapshot(project):
    return {
        "states": list(
            State.objects.filter(project=project)
            .order_by("sequence", "id")
            .values("id", "name", "color", "group", "default", "sequence", "description")
        ),
        "labels": list(
            Label.objects.filter(project=project).order_by("id").values("id", "name", "color", "description")
        ),
        "estimate_id": project.estimate_id,
        "default_state_id": project.default_state_id,
        "estimates": list(
            Estimate.objects.filter(project=project).order_by("id").values("id", "name", "type", "last_used")
        ),
        "points": list(
            EstimatePoint.objects.filter(project=project).order_by("id").values("id", "estimate_id", "key", "value")
        ),
    }


def workflow_preview(project, workflow):
    current = project_snapshot(project)
    token = hashlib.sha256(
        json.dumps([current, workflow.config, str(workflow.updated_at)], sort_keys=True, default=str).encode()
    ).hexdigest()
    changes = []
    for key in ("states", "labels"):
        existing = {item["name"].casefold(): item for item in current[key]}
        for item in workflow.config[key]:
            changes.append(
                {
                    "section": key,
                    "name": item["name"],
                    "action": "update" if item["name"].casefold() in existing else "create",
                }
            )
    estimate = workflow.config["estimates"]
    conflicts = []
    for key in ("states", "labels"):
        names = [item["name"].casefold() for item in current[key]]
        if len(names) != len(set(names)):
            conflicts.append(f"Resolve existing {key} with duplicate names (case insensitive) before applying.")
    triage_names = {
        name.casefold() for name in State.triage_objects.filter(project=project).values_list("name", flat=True)
    }
    if any(item["name"].casefold() in triage_names for item in workflow.config["states"]):
        conflicts.append("A workflow state name conflicts with the project's intake state. Rename it before applying.")
    mapping = []
    if estimate:
        targets = Estimate.objects.filter(project=project, name__iexact=estimate["name"])
        if targets.count() > 1:
            conflicts.append("Resolve estimate systems with duplicate names before applying.")
        target = targets.first()
        if target and (
            target.type != estimate["type"]
            or list(target.points.order_by("key").values_list("value", flat=True)) != estimate["values"]
        ):
            conflicts.append(
                "An estimate system with this name has different values. "
                "Rename the workflow estimate system before applying."
            )
        for point in EstimatePoint.all_objects.filter(project=project).exclude(estimate=target).order_by("key", "id"):
            if Issue.all_objects.filter(project=project, estimate_point=point).exists():
                mapping.append(
                    {
                        "id": str(point.id),
                        "value": point.value,
                        "suggested": point.value if point.value in estimate["values"] else "",
                    }
                )
        changes.append({"section": "estimates", "name": estimate["name"], "action": "use" if target else "create"})
    return {"token": token, "changes": changes, "estimate_mapping": mapping, "conflicts": conflicts}


def apply_workflow(project, workflow, preview, mapping):
    if preview["conflicts"]:
        raise ValidationError({"error": preview["conflicts"]})
    config = workflow.config
    estimate = config["estimates"]
    if not isinstance(mapping, dict):
        raise ValidationError({"error": "Estimate mapping must be an object."})
    if estimate:
        for point in preview["estimate_mapping"]:
            if mapping.get(point["id"]) not in estimate["values"]:
                raise ValidationError({"error": "Map every existing estimate value before applying."})
    State.objects.filter(project=project, default=True).update(default=False)
    for index, item in enumerate(config["states"]):
        state = State.objects.filter(project=project, name__iexact=item["name"]).first()
        if state is None:
            state = State.objects.create(project=project, **item)
        # QuerySet.update preserves the template order (State.save assigns its own sequence).
        State.objects.filter(pk=state.pk).update(**item, sequence=(index + 1) * 15000)
        if item["default"]:
            project.default_state_id = state.id
    for item in config["labels"]:
        label = Label.objects.filter(project=project, name__iexact=item["name"]).first()
        if label:
            Label.objects.filter(pk=label.pk).update(**item)
        else:
            Label.objects.create(project=project, **item)
    if estimate:
        target = Estimate.objects.filter(project=project, name__iexact=estimate["name"]).first()
        if target is None:
            target = Estimate.objects.create(project=project, name=estimate["name"], type=estimate["type"])
            for key, value in enumerate(estimate["values"]):
                EstimatePoint.objects.create(project=project, estimate=target, key=key, value=value)
        points = {p.value: p.id for p in target.points.all()}
        for old in preview["estimate_mapping"]:
            Issue.all_objects.filter(project=project, estimate_point_id=old["id"]).update(
                estimate_point_id=points[mapping[old["id"]]]
            )
        Estimate.objects.filter(project=project).exclude(pk=target.pk).update(last_used=False)
        Estimate.objects.filter(pk=target.pk).update(last_used=True)
        project.estimate = target
    project.save(update_fields=["default_state", "estimate", "updated_at"])
