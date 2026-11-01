# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# PBS-7: role-based structured updates. Additive only: creates new tables and
# touches no existing table, so `migrate db 0129_virtual_office_appearance`
# rolls it back cleanly.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


ROLE_CHOICES = [("dev", "Dev"), ("qa", "QA"), ("ba", "BA")]
ROOT_CAUSE_CATEGORIES = ["code", "requirement_gap", "data", "config", "environment", "third_party"]


def base_fields():
    return [
        ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
        ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
        ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
        (
            "id",
            models.UUIDField(
                db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True
            ),
        ),
        (
            "created_by",
            models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="%(class)s_created_by",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Created By",
            ),
        ),
        (
            "updated_by",
            models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="%(class)s_updated_by",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Last Modified By",
            ),
        ),
        (
            "project",
            models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="project_%(class)s", to="db.project"
            ),
        ),
        (
            "workspace",
            models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="workspace_%(class)s", to="db.workspace"
            ),
        ),
    ]


def state_fk():
    return models.ForeignKey(
        blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="db.state"
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0129_virtual_office_appearance"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectStructuredUpdateSetting",
            fields=[
                *base_fields(),
                ("is_enabled", models.BooleanField(default=False)),
                ("enforce_state_gate", models.BooleanField(default=True)),
                ("ready_for_qa_state", state_fk()),
                ("ready_for_ba_state", state_fk()),
                ("dev_submit_state", state_fk()),
                ("qa_passed_state", state_fk()),
                ("qa_failed_state", state_fk()),
                ("ba_approved_state", state_fk()),
                ("ba_rejected_state", state_fk()),
            ],
            options={
                "verbose_name": "Project Structured Update Setting",
                "verbose_name_plural": "Project Structured Update Settings",
                "db_table": "project_structured_update_settings",
                "constraints": [
                    models.UniqueConstraint(
                        condition=models.Q(deleted_at__isnull=True),
                        fields=("project",),
                        name="structured_update_setting_unique_project_when_deleted_at_null",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="ProjectMemberFunctionalRole",
            fields=[
                *base_fields(),
                ("role", models.CharField(choices=ROLE_CHOICES, max_length=8)),
                (
                    "member",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_functional_roles",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Project Member Functional Role",
                "verbose_name_plural": "Project Member Functional Roles",
                "db_table": "project_member_functional_roles",
                "ordering": ("created_at",),
                "constraints": [
                    models.UniqueConstraint(
                        condition=models.Q(deleted_at__isnull=True),
                        fields=("project", "member", "role"),
                        name="functional_role_unique_project_member_role_when_deleted_at_null",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(role__in=["dev", "qa", "ba"]), name="functional_role_valid_role"
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="StructuredUpdate",
            fields=[
                *base_fields(),
                ("role", models.CharField(choices=ROLE_CHOICES, max_length=8)),
                ("result", models.CharField(blank=True, default="", max_length=16)),
                ("root_cause_category", models.CharField(blank=True, default="", max_length=32)),
                ("root_cause", models.TextField(blank=True, default="")),
                ("resolution", models.TextField(blank=True, default="")),
                ("validation", models.TextField(blank=True, default="")),
                ("pr_link", models.CharField(blank=True, default="", max_length=2048)),
                ("testmo_ref", models.CharField(blank=True, default="", max_length=255)),
                ("qa_round", models.PositiveIntegerField(default=0)),
                ("state_gate_overridden", models.BooleanField(default=False)),
                ("edited_at", models.DateTimeField(blank=True, null=True)),
                ("correction_reason", models.TextField(blank=True, default="")),
                (
                    "corrects",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="corrections",
                        to="db.structuredupdate",
                    ),
                ),
                (
                    "actor",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="structured_updates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "issue",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="structured_updates", to="db.issue"
                    ),
                ),
                ("from_state", state_fk()),
                ("to_state", state_fk()),
            ],
            options={
                "verbose_name": "Structured Update",
                "verbose_name_plural": "Structured Updates",
                "db_table": "structured_updates",
                "ordering": ("created_at",),
                "indexes": [models.Index(fields=["issue", "created_at"], name="structured_update_issue_idx")],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(role__in=["dev", "qa", "ba"]), name="structured_update_valid_role"
                    ),
                    models.CheckConstraint(
                        condition=(
                            models.Q(role="dev", result="", root_cause_category__in=ROOT_CAUSE_CATEGORIES)
                            | models.Q(role="qa", result__in=["passed", "failed"], root_cause_category="")
                            | models.Q(role="ba", result__in=["approved", "rejected"], root_cause_category="")
                        ),
                        name="structured_update_result_matches_role",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="StructuredUpdateRevision",
            fields=[
                *base_fields(),
                ("changes", models.JSONField(default=dict)),
                (
                    "edited_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "structured_update",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="revisions",
                        to="db.structuredupdate",
                    ),
                ),
            ],
            options={
                "verbose_name": "Structured Update Revision",
                "verbose_name_plural": "Structured Update Revisions",
                "db_table": "structured_update_revisions",
                "ordering": ("created_at",),
            },
        ),
        migrations.CreateModel(
            name="StructuredUpdateLink",
            fields=[
                *base_fields(),
                ("url", models.CharField(max_length=2048)),
                ("title", models.CharField(blank=True, default="", max_length=255)),
                (
                    "structured_update",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="links", to="db.structuredupdate"
                    ),
                ),
            ],
            options={
                "verbose_name": "Structured Update Link",
                "verbose_name_plural": "Structured Update Links",
                "db_table": "structured_update_links",
                "ordering": ("created_at",),
            },
        ),
        migrations.CreateModel(
            name="IssueStructuredSummary",
            fields=[
                *base_fields(),
                ("latest_qa_result", models.CharField(blank=True, max_length=16, null=True)),
                ("qa_round_count", models.PositiveIntegerField(default=0)),
                ("latest_ba_result", models.CharField(blank=True, max_length=16, null=True)),
                ("root_cause_category", models.CharField(blank=True, max_length=32, null=True)),
                (
                    "issue",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE, related_name="structured_summary", to="db.issue"
                    ),
                ),
            ],
            options={
                "verbose_name": "Issue Structured Summary",
                "verbose_name_plural": "Issue Structured Summaries",
                "db_table": "issue_structured_summaries",
                "indexes": [
                    models.Index(fields=["latest_qa_result"], name="structured_summary_qa_idx"),
                    models.Index(fields=["latest_ba_result"], name="structured_summary_ba_idx"),
                    models.Index(fields=["root_cause_category"], name="structured_summary_rcc_idx"),
                ],
            },
        ),
    ]
