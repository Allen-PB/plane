# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("db", "0127_office_avatar_style")]
    operations = [
        migrations.CreateModel(
            name="Workflow",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("config", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("workspace", models.ForeignKey(to="db.workspace", on_delete=django.db.models.deletion.CASCADE)),
            ],
            options={
                "db_table": "workflows",
                "ordering": ["name", "id"],
                "constraints": [
                    models.UniqueConstraint(fields=("workspace", "name"), name="workflow_workspace_name_unique")
                ],
            },
        )
    ]
