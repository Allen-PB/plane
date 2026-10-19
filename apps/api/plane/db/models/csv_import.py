# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

from django.conf import settings
from django.db import models


class CSVImport(models.Model):
    """Persist input and checkpoints so browser refreshes cannot resubmit a job."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE)
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE)
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    status = models.CharField(max_length=20, default="draft")
    headers = models.JSONField(default=list)
    rows = models.JSONField(default=list)
    config = models.JSONField(default=dict)
    errors = models.JSONField(default=list)
    processed = models.PositiveIntegerField(default=0)
    succeeded = models.PositiveIntegerField(default=0)
    failure_reason = models.TextField(blank=True)

    class Meta:
        db_table = "csv_imports"
        ordering = ["-created_at"]
