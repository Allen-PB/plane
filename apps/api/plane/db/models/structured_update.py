# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Role-based structured updates (Dev / QA / BA) posted on work items."""

from django.conf import settings
from django.db import models
from django.db.models import Q

from .project import ProjectBaseModel


class FunctionalRole(models.TextChoices):
    DEV = "dev", "Dev"
    QA = "qa", "QA"
    BA = "ba", "BA"


class RootCauseCategory(models.TextChoices):
    CODE = "code", "Code"
    REQUIREMENT_GAP = "requirement_gap", "Requirement gap"
    DATA = "data", "Data"
    CONFIG = "config", "Config"
    ENVIRONMENT = "environment", "Environment"
    THIRD_PARTY = "third_party", "Third-party"


class QAResult(models.TextChoices):
    PASSED = "passed", "Passed"
    FAILED = "failed", "Failed"


class BAResult(models.TextChoices):
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


def _state_fk(related_name):
    return models.ForeignKey("db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name=related_name)


class ProjectStructuredUpdateSetting(ProjectBaseModel):
    """Per-project flag, result-to-state mapping and state gates."""

    is_enabled = models.BooleanField(default=False)
    enforce_state_gate = models.BooleanField(default=True)
    ready_for_qa_state = _state_fk("+")
    ready_for_ba_state = _state_fk("+")
    dev_submit_state = _state_fk("+")
    qa_passed_state = _state_fk("+")
    qa_failed_state = _state_fk("+")
    ba_approved_state = _state_fk("+")
    ba_rejected_state = _state_fk("+")

    class Meta:
        verbose_name = "Project Structured Update Setting"
        verbose_name_plural = "Project Structured Update Settings"
        db_table = "project_structured_update_settings"
        constraints = [
            models.UniqueConstraint(
                fields=["project"],
                condition=Q(deleted_at__isnull=True),
                name="structured_update_setting_unique_project_when_deleted_at_null",
            )
        ]


class ProjectMemberFunctionalRole(ProjectBaseModel):
    """Maps a project member to Dev / QA / BA. Independent of Admin/Member/Guest."""

    member = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_functional_roles"
    )
    role = models.CharField(max_length=8, choices=FunctionalRole.choices)

    class Meta:
        verbose_name = "Project Member Functional Role"
        verbose_name_plural = "Project Member Functional Roles"
        db_table = "project_member_functional_roles"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "member", "role"],
                condition=Q(deleted_at__isnull=True),
                name="functional_role_unique_project_member_role_when_deleted_at_null",
            ),
            models.CheckConstraint(condition=Q(role__in=FunctionalRole.values), name="functional_role_valid_role"),
        ]


class StructuredUpdate(ProjectBaseModel):
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="structured_updates")
    role = models.CharField(max_length=8, choices=FunctionalRole.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="structured_updates"
    )
    # Locked once posted
    result = models.CharField(max_length=16, blank=True, default="")
    root_cause_category = models.CharField(max_length=32, blank=True, default="")
    # Editable notes
    root_cause = models.TextField(blank=True, default="")
    resolution = models.TextField(blank=True, default="")
    validation = models.TextField(blank=True, default="")
    pr_link = models.CharField(max_length=2048, blank=True, default="")
    testmo_ref = models.CharField(max_length=255, blank=True, default="")
    # Workflow context captured at submission
    from_state = _state_fk("+")
    to_state = _state_fk("+")
    qa_round = models.PositiveIntegerField(default=0)
    state_gate_overridden = models.BooleanField(default=False)
    edited_at = models.DateTimeField(null=True, blank=True)
    # Set when this update corrects the author's earlier result or root cause category.
    corrects = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="corrections")
    correction_reason = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Structured Update"
        verbose_name_plural = "Structured Updates"
        db_table = "structured_updates"
        ordering = ("created_at",)
        indexes = [models.Index(fields=["issue", "created_at"], name="structured_update_issue_idx")]
        constraints = [
            models.CheckConstraint(condition=Q(role__in=FunctionalRole.values), name="structured_update_valid_role"),
            models.CheckConstraint(
                condition=(
                    Q(role=FunctionalRole.DEV, result="", root_cause_category__in=RootCauseCategory.values)
                    | Q(role=FunctionalRole.QA, result__in=QAResult.values, root_cause_category="")
                    | Q(role=FunctionalRole.BA, result__in=BAResult.values, root_cause_category="")
                ),
                name="structured_update_result_matches_role",
            ),
        ]


class StructuredUpdateRevision(ProjectBaseModel):
    """One row per edit; `changes` holds {field: {"old": ..., "new": ...}}."""

    structured_update = models.ForeignKey(StructuredUpdate, on_delete=models.CASCADE, related_name="revisions")
    edited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    changes = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Structured Update Revision"
        verbose_name_plural = "Structured Update Revisions"
        db_table = "structured_update_revisions"
        ordering = ("created_at",)


class StructuredUpdateLink(ProjectBaseModel):
    structured_update = models.ForeignKey(StructuredUpdate, on_delete=models.CASCADE, related_name="links")
    url = models.CharField(max_length=2048)
    title = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        verbose_name = "Structured Update Link"
        verbose_name_plural = "Structured Update Links"
        db_table = "structured_update_links"
        ordering = ("created_at",)


class IssueStructuredSummary(ProjectBaseModel):
    """Denormalized latest results so work item lists can filter on them."""

    issue = models.OneToOneField("db.Issue", on_delete=models.CASCADE, related_name="structured_summary")
    latest_qa_result = models.CharField(max_length=16, null=True, blank=True)
    qa_round_count = models.PositiveIntegerField(default=0)
    latest_ba_result = models.CharField(max_length=16, null=True, blank=True)
    root_cause_category = models.CharField(max_length=32, null=True, blank=True)

    class Meta:
        verbose_name = "Issue Structured Summary"
        verbose_name_plural = "Issue Structured Summaries"
        db_table = "issue_structured_summaries"
        indexes = [
            models.Index(fields=["latest_qa_result"], name="structured_summary_qa_idx"),
            models.Index(fields=["latest_ba_result"], name="structured_summary_ba_idx"),
            models.Index(fields=["root_cause_category"], name="structured_summary_rcc_idx"),
        ]
