# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Rules for role-based structured updates: permissions, state gates, transitions and QA rounds."""

import os
from urllib.parse import urlparse

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.db.models import Q
from rest_framework.exceptions import ValidationError

from plane.license.models import InstanceConfiguration
from plane.db.models import (
    BAResult,
    FunctionalRole,
    IssueStructuredSummary,
    ProjectMember,
    ProjectMemberFunctionalRole,
    ProjectStructuredUpdateSetting,
    QAResult,
    RootCauseCategory,
    State,
    StateGroup,
    WorkspaceMember,
)

NOTE_MAX_LENGTH = 10000
MAX_LINKS_PER_UPDATE = 20
EVIDENCE_SIZE_LIMIT = int(os.environ.get("STRUCTURED_UPDATE_EVIDENCE_SIZE_LIMIT", 50 * 1024 * 1024))
# SVG is deliberately excluded: it can carry script.
EVIDENCE_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
]

ADMIN, MEMBER = 20, 15

REQUIRED_FIELDS = {
    FunctionalRole.DEV: ("root_cause_category", "root_cause", "resolution"),
    FunctionalRole.QA: ("result", "validation"),
    FunctionalRole.BA: ("result", "validation"),
}
OPTIONAL_FIELDS = {
    FunctionalRole.DEV: ("pr_link",),
    FunctionalRole.QA: ("testmo_ref",),
    FunctionalRole.BA: (),
}
# Result and root cause category are locked once posted; corrections are new updates.
LOCKED_FIELDS = ("role", "result", "root_cause_category")
RESULT_CHOICES = {
    FunctionalRole.DEV: (),
    FunctionalRole.QA: tuple(QAResult.values),
    FunctionalRole.BA: tuple(BAResult.values),
}

MAPPING_FIELDS = (
    "ready_for_qa_state",
    "ready_for_ba_state",
    "dev_submit_state",
    "qa_passed_state",
    "qa_failed_state",
    "ba_approved_state",
    "ba_rejected_state",
)


def editable_fields(role):
    return tuple(f for f in REQUIRED_FIELDS[role] + OPTIONAL_FIELDS[role] if f not in LOCKED_FIELDS)


def validate_http_url(value):
    """Return a stripped http(s) URL or raise. Rejects javascript:, data:, ftp:, etc."""
    value = (value or "").strip()
    if not value:
        return ""
    if len(value) > 2048 or urlparse(value).scheme.lower() not in ("http", "https"):
        raise ValidationError("Only http and https links are allowed.")
    try:
        URLValidator(schemes=["http", "https"])(value)
    except DjangoValidationError:
        raise ValidationError("Enter a valid http or https link.")
    return value


INSTANCE_SWITCH_KEY = "ENABLE_STRUCTURED_UPDATES"


def instance_enabled():
    """Instance-wide kill switch (God Mode > General). Read on every request so turning it off is immediate."""
    value = InstanceConfiguration.objects.filter(key=INSTANCE_SWITCH_KEY).values_list("value", flat=True).first()
    if value is None:
        value = os.environ.get(INSTANCE_SWITCH_KEY, "1")
    return str(value).strip() == "1"


def get_project_setting(project_id):
    return ProjectStructuredUpdateSetting.objects.filter(project_id=project_id, deleted_at__isnull=True).first()


def is_enabled(project_id):
    if not instance_enabled():
        return False
    setting = get_project_setting(project_id)
    return bool(setting and setting.is_enabled)


def suggested_mapping(project_id):
    """Default mapping by state name, falling back to the first state of the matching group."""
    states = list(State.objects.filter(project_id=project_id).order_by("sequence"))

    def by_name(*names):
        wanted = [n.lower() for n in names]
        return next((s for s in states if s.name.strip().lower() in wanted), None)

    def by_group(group):
        return next((s for s in states if s.group == group), None)

    ready_for_qa = by_name("Ready for QA")
    ready_for_ba = by_name("Ready for BA")
    in_progress = by_name("In Progress") or by_group(StateGroup.STARTED.value)
    done = by_name("Done") or by_group(StateGroup.COMPLETED.value)
    mapping = {
        "ready_for_qa_state": ready_for_qa,
        "ready_for_ba_state": ready_for_ba,
        "dev_submit_state": ready_for_qa,
        "qa_passed_state": ready_for_ba,
        "qa_failed_state": in_progress,
        "ba_approved_state": done,
        "ba_rejected_state": in_progress,
    }
    return {key: (state.id if state else None) for key, state in mapping.items()}


def get_membership(project_id, user):
    return ProjectMember.objects.filter(project_id=project_id, member=user, is_active=True).first()


def is_project_admin(project_id, user):
    """Project admin, or workspace admin who is a project member (same rule as `allow_permission`)."""
    membership = get_membership(project_id, user)
    if membership is None:
        return False
    if membership.role == ADMIN:
        return True
    return WorkspaceMember.objects.filter(
        workspace_id=membership.workspace_id, member=user, role=ADMIN, is_active=True
    ).exists()


def user_functional_roles(project_id, user):
    return set(
        ProjectMemberFunctionalRole.objects.filter(project_id=project_id, member=user).values_list("role", flat=True)
    )


def can_submit(project_id, user, role):
    """Members/Admins only (Guests never), and only for a functional role they hold."""
    membership = get_membership(project_id, user)
    if membership is None or membership.role not in (ADMIN, MEMBER):
        return False
    return role in user_functional_roles(project_id, user)


def check_state_gate(setting, role, issue):
    """Return an error message when the work item is not in the state this role may post from."""
    if role == FunctionalRole.DEV:
        if issue.state and issue.state.group in (StateGroup.COMPLETED.value, StateGroup.CANCELLED.value):
            return "Dev updates cannot be posted on completed or cancelled work items."
        return None
    if not setting.enforce_state_gate:
        return None
    is_qa = role == FunctionalRole.QA
    gate_id = setting.ready_for_qa_state_id if is_qa else setting.ready_for_ba_state_id
    # A gate that was never configured cannot be enforced.
    if gate_id is None or issue.state_id == gate_id:
        return None
    gate = setting.ready_for_qa_state if is_qa else setting.ready_for_ba_state
    return f"A {'QA' if is_qa else 'BA'} result can only be posted while the work item is in '{gate.name}'."


def target_state_id(setting, role, result):
    field = {
        (FunctionalRole.DEV, ""): "dev_submit_state_id",
        (FunctionalRole.QA, QAResult.PASSED): "qa_passed_state_id",
        (FunctionalRole.QA, QAResult.FAILED): "qa_failed_state_id",
        (FunctionalRole.BA, BAResult.APPROVED): "ba_approved_state_id",
        (FunctionalRole.BA, BAResult.REJECTED): "ba_rejected_state_id",
    }[(role, result)]
    return getattr(setting, field)


# Default step names shown when a project has no state mapped for a result.
EXPECTED_STEP_LABELS = {
    (FunctionalRole.DEV, ""): "Ready for QA",
    (FunctionalRole.QA, QAResult.PASSED): "Ready for BA",
    (FunctionalRole.QA, QAResult.FAILED): "In Progress",
    (FunctionalRole.BA, BAResult.APPROVED): "Done",
    (FunctionalRole.BA, BAResult.REJECTED): "In Progress",
}


def expected_step_label(role, result):
    return EXPECTED_STEP_LABELS[(role, result)]


def qa_round_for_next_result(last_qa_round, last_qa_result, rejected_by_ba_since):
    """QA rounds start at 1. A QA failure, or a BA rejection after the last QA result, starts a new round."""
    if not last_qa_result:
        return 1
    if last_qa_result == QAResult.FAILED or rejected_by_ba_since:
        return last_qa_round + 1
    return max(last_qa_round, 1)


def next_qa_round(issue):
    from plane.db.models import StructuredUpdate

    last_qa = StructuredUpdate.objects.filter(issue=issue, role=FunctionalRole.QA).order_by("-created_at").first()
    if last_qa is None:
        return 1
    # A rejection that was later corrected to Approved does not count.
    rejected = (
        StructuredUpdate.objects.filter(
            issue=issue, role=FunctionalRole.BA, result=BAResult.REJECTED, created_at__gt=last_qa.created_at
        )
        .filter(corrections__isnull=True)
        .exists()
    )
    return qa_round_for_next_result(last_qa.qa_round, last_qa.result, rejected)


def correction_error(original, latest_update_id, user_id, result, root_cause_category):
    """Return why `original` cannot be corrected with the new value, or None.

    Only the author may correct, only their most recent update while it is still the latest one on the
    work item (so results can't be rewritten after later steps), and the corrected value must differ.
    """
    if original.actor_id != user_id:
        return "Only the author can correct this update."
    if original.id != latest_update_id:
        return "Only the most recent update on this work item can be corrected. Post a new update instead."
    if original.role == FunctionalRole.DEV:
        if root_cause_category not in RootCauseCategory.values:
            return f"Choose one of: {', '.join(RootCauseCategory.values)}."
        if root_cause_category == original.root_cause_category:
            return "Choose a different root cause category."
        return None
    if result not in RESULT_CHOICES[original.role]:
        return f"Choose one of: {', '.join(RESULT_CHOICES[original.role])}."
    if result == original.result:
        return "Choose a different result."
    return None


def apply_to_summary(issue, update):
    summary, _ = IssueStructuredSummary.objects.select_for_update().get_or_create(
        issue=issue, defaults={"project_id": issue.project_id}
    )
    if update.role == FunctionalRole.DEV:
        summary.root_cause_category = update.root_cause_category
    elif update.role == FunctionalRole.QA:
        summary.latest_qa_result = update.result
        summary.qa_round_count = update.qa_round
    else:
        summary.latest_ba_result = update.result
    summary.save()
    return summary


def valid_mapping_state_ids(project_id):
    return set(State.objects.filter(project_id=project_id).filter(~Q(is_triage=True)).values_list("id", flat=True))
