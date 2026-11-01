# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Explicit, bounded schema for saved workflows."""

from rest_framework import serializers
from plane.db.models import Workflow


class StateConfigSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(allow_blank=True, default="")
    color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$")
    group = serializers.ChoiceField(choices=["backlog", "unstarted", "started", "completed", "cancelled"])
    default = serializers.BooleanField(default=False)


class LabelConfigSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(allow_blank=True, default="")
    color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$")


class EstimateConfigSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    type = serializers.ChoiceField(choices=["points", "categories"])
    values = serializers.ListField(child=serializers.CharField(max_length=255), min_length=1, max_length=13)

    def validate_values(self, values):
        if len(set(values)) != len(values):
            raise serializers.ValidationError("Estimate values must be unique.")
        return values


class WorkflowConfigSerializer(serializers.Serializer):
    states = StateConfigSerializer(many=True, allow_empty=False, max_length=100)
    labels = LabelConfigSerializer(many=True, max_length=200)
    estimates = EstimateConfigSerializer(allow_null=True)

    def validate(self, data):
        missing = {"states", "labels", "estimates"} - data.keys()
        if missing:
            raise serializers.ValidationError({key: "This field is required." for key in sorted(missing)})
        for key in ("states", "labels"):
            names = [item["name"].casefold() for item in data[key]]
            if len(set(names)) != len(names):
                raise serializers.ValidationError({key: "Names must be unique (case insensitive)."})
        if sum(state["default"] for state in data["states"]) != 1:
            raise serializers.ValidationError({"states": "Choose exactly one default state."})
        return data


class WorkflowSerializer(serializers.ModelSerializer):
    config = WorkflowConfigSerializer()

    class Meta:
        model = Workflow
        fields = ["id", "name", "description", "config", "updated_at"]
        read_only_fields = ["id", "updated_at"]
        validators = []

    def validate_name(self, name):
        query = Workflow.objects.filter(workspace_id=self.context["workspace_id"], name__iexact=name)
        if self.instance:
            query = query.exclude(pk=self.instance.pk)
        if query.exists():
            raise serializers.ValidationError("A workflow with this name already exists.")
        return name
