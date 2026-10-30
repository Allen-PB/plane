# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0124_intakeissue_intake_issue_snoozed_till_idx"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CSVImport",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("status", models.CharField(max_length=20, default="draft")),
                ("headers", models.JSONField(default=list)),
                ("rows", models.JSONField(default=list)),
                ("config", models.JSONField(default=dict)),
                ("errors", models.JSONField(default=list)),
                ("processed", models.PositiveIntegerField(default=0)),
                ("succeeded", models.PositiveIntegerField(default=0)),
                ("failure_reason", models.TextField(blank=True)),
                ("workspace", models.ForeignKey(to="db.workspace", on_delete=django.db.models.deletion.CASCADE)),
                ("project", models.ForeignKey(to="db.project", on_delete=django.db.models.deletion.CASCADE)),
                (
                    "initiated_by",
                    models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.CASCADE),
                ),
            ],
            options={"db_table": "csv_imports", "ordering": ["-created_at"]},
        ),
    ]
