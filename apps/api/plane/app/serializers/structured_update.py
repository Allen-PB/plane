# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import (
    FunctionalRole,
    IssueStructuredSummary,
    ProjectStructuredUpdateSetting,
    RootCauseCategory,
    StructuredUpdate,
    StructuredUpdateRevision,
)
from plane.utils.structured_update import (
    LOCKED_FIELDS,
    MAPPING_FIELDS,
    MAX_LINKS_PER_UPDATE,
    NOTE_MAX_LENGTH,
    OPTIONAL_FIELDS,
    REQUIRED_FIELDS,
    RESULT_CHOICES,
    editable_fields,
    valid_mapping_state_ids,
    validate_http_url,
)

NOTE_FIELDS = ("root_cause", "resolution", "validation")
TEXT_FIELDS = ("result", "root_cause_category", *NOTE_FIELDS, "pr_link", "testmo_ref")


def note_field():
    # DRF trims whitespace by default, so a spaces-only note arrives as "" and is caught as blank.
    return serializers.CharField(required=False, allow_blank=True, max_length=NOTE_MAX_LENGTH)


class StructuredUpdateActorSerializer(serializers.Serializer):
    # Deliberately excludes email and other personal fields.
    id = serializers.UUIDField()
    display_name = serializers.CharField()
    avatar_url = serializers.CharField(allow_null=True)


class StructuredUpdateLinkInputSerializer(serializers.Serializer):
    url = serializers.CharField(max_length=2048)
    title = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")

    def validate_url(self, value):
        return validate_http_url(value)


def evidence_url(asset):
    return (
        f"/api/workspaces/{asset.workspace.slug}/projects/{asset.project_id}/issues/{asset.issue_id}"
        f"/structured-updates/{asset.entity_identifier}/evidence/{asset.id}/"
    )


class StructuredUpdateSerializer(serializers.ModelSerializer):
    actor = StructuredUpdateActorSerializer(read_only=True)
    links = serializers.SerializerMethodField()
    evidence = serializers.SerializerMethodField()
    revision_count = serializers.SerializerMethodField()
    corrected_by_id = serializers.SerializerMethodField()

    class Meta:
        model = StructuredUpdate
        fields = [
            "id",
            "issue_id",
            "project_id",
            "role",
            "actor",
            "result",
            "root_cause_category",
            "root_cause",
            "resolution",
            "validation",
            "pr_link",
            "testmo_ref",
            "from_state_id",
            "to_state_id",
            "qa_round",
            "state_gate_overridden",
            "edited_at",
            "corrects_id",
            "correction_reason",
            "corrected_by_id",
            "created_at",
            "updated_at",
            "links",
            "evidence",
            "revision_count",
        ]
        read_only_fields = fields

    def get_links(self, obj):
        return [
            {"id": str(link.id), "url": link.url, "title": link.title}
            for link in obj.links.all()
            if link.deleted_at is None
        ]

    def get_evidence(self, obj):
        assets = self.context.get("evidence", {}).get(str(obj.id), [])
        return [
            {
                "id": str(asset.id),
                "name": asset.attributes.get("name"),
                "type": asset.attributes.get("type"),
                "size": asset.size,
                "created_at": asset.created_at,
                "url": evidence_url(asset),
            }
            for asset in assets
        ]

    def get_revision_count(self, obj):
        return len([r for r in obj.revisions.all() if r.deleted_at is None])

    def get_corrected_by_id(self, obj):
        correction = next((c for c in obj.corrections.all() if c.deleted_at is None), None)
        return str(correction.id) if correction else None


class StructuredUpdateCreateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=FunctionalRole.choices)
    result = serializers.CharField(required=False, allow_blank=True, max_length=16)
    root_cause_category = serializers.CharField(required=False, allow_blank=True, max_length=32)
    root_cause = note_field()
    resolution = note_field()
    validation = note_field()
    pr_link = serializers.CharField(required=False, allow_blank=True, max_length=2048)
    testmo_ref = serializers.CharField(required=False, allow_blank=True, max_length=255)
    links = StructuredUpdateLinkInputSerializer(many=True, required=False, default=list)
    override_state_gate = serializers.BooleanField(required=False, default=False)

    def validate_pr_link(self, value):
        return validate_http_url(value)

    def validate_links(self, value):
        if len(value) > MAX_LINKS_PER_UPDATE:
            raise serializers.ValidationError(f"At most {MAX_LINKS_PER_UPDATE} links are allowed.")
        return value

    def validate(self, attrs):
        role = attrs["role"]
        allowed = REQUIRED_FIELDS[role] + OPTIONAL_FIELDS[role]
        # Fields that do not belong to this role's template are dropped, never stored.
        for field in TEXT_FIELDS:
            attrs[field] = (attrs.get(field) or "").strip() if field in allowed else ""
        errors = {field: "This field is required." for field in REQUIRED_FIELDS[role] if not attrs[field]}
        if attrs["result"] and attrs["result"] not in RESULT_CHOICES[role]:
            errors["result"] = f"Choose one of: {', '.join(RESULT_CHOICES[role])}."
        if attrs["root_cause_category"] and attrs["root_cause_category"] not in RootCauseCategory.values:
            errors["root_cause_category"] = f"Choose one of: {', '.join(RootCauseCategory.values)}."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class StructuredUpdateEditSerializer(serializers.Serializer):
    root_cause = note_field()
    resolution = note_field()
    validation = note_field()
    pr_link = serializers.CharField(required=False, allow_blank=True, max_length=2048)
    testmo_ref = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate_pr_link(self, value):
        return validate_http_url(value)

    def validate(self, attrs):
        instance = self.instance
        locked = [
            field
            for field in LOCKED_FIELDS
            if field in self.initial_data and str(self.initial_data[field]).strip() != getattr(instance, field)
        ]
        if locked:
            raise serializers.ValidationError(
                {field: "Locked once posted. Post a new update to correct it." for field in locked}
            )
        allowed = editable_fields(instance.role)
        attrs = {field: value.strip() for field, value in attrs.items() if field in allowed}
        errors = {
            field: "This field is required."
            for field in REQUIRED_FIELDS[instance.role]
            if field in attrs and not attrs[field]
        }
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class StructuredUpdateCorrectionSerializer(serializers.Serializer):
    """The corrected locked value plus a required reason. Notes are copied from the original."""

    result = serializers.CharField(required=False, allow_blank=True, max_length=16, default="")
    root_cause_category = serializers.CharField(required=False, allow_blank=True, max_length=32, default="")
    reason = serializers.CharField(max_length=NOTE_MAX_LENGTH)


class StructuredUpdateRevisionSerializer(serializers.ModelSerializer):
    edited_by = StructuredUpdateActorSerializer(read_only=True)

    class Meta:
        model = StructuredUpdateRevision
        fields = ["id", "edited_by", "changes", "created_at"]
        read_only_fields = fields


class IssueStructuredSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = IssueStructuredSummary
        fields = ["issue_id", "latest_qa_result", "qa_round_count", "latest_ba_result", "root_cause_category"]
        read_only_fields = fields


class ProjectStructuredUpdateSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectStructuredUpdateSetting
        fields = ["id", "project_id", "is_enabled", "enforce_state_gate", *MAPPING_FIELDS]
        read_only_fields = ["id", "project_id"]

    def validate(self, attrs):
        valid_ids = valid_mapping_state_ids(self.context["project_id"])
        errors = {
            field: "State does not belong to this project."
            for field in MAPPING_FIELDS
            if attrs.get(field) is not None and attrs[field].id not in valid_ids
        }
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class FunctionalRoleAssignmentSerializer(serializers.Serializer):
    member_id = serializers.UUIDField()
    roles = serializers.ListField(child=serializers.ChoiceField(choices=FunctionalRole.choices), allow_empty=True)
