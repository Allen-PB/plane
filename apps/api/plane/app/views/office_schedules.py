from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.db.models.virtual_office import (
    OfficeAudit,
    OfficeMember,
    OfficeScheduleRequest,
    OfficeScheduleRevision,
    VirtualOffice,
)
from plane.utils.office_schedules import (
    ScheduleConflict,
    latest_policy,
    notice,
    notify_admins,
    publish_policy,
    request_data,
    validate_schedule,
    work_data,
)


class ScheduleRequestSerializer(serializers.Serializer):
    schedule = serializers.ListField()
    revision = serializers.IntegerField(min_value=0, default=0)


class OfficeScheduleView(BaseAPIView):
    authentication_classes = [SessionAuthentication]

    def get(self, request):
        member = get_object_or_404(OfficeMember, user=request.user, active=True)
        response = Response(work_data(member))
        response["Cache-Control"] = "no-store"
        return response

    def post(self, request):
        serializer = ScheduleRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        schedule = validate_schedule(serializer.validated_data["schedule"])
        with transaction.atomic():
            get_object_or_404(VirtualOffice.objects.select_for_update(), pk=1)
            member = get_object_or_404(OfficeMember, user=request.user, active=True)
            policy = latest_policy(member)
            if not policy or policy.arrangement != "scheduled":
                raise ValidationError("An administrator must assign Scheduled shift before you request working hours.")
            pending = member.schedule_requests.filter(status="pending").first()
            revision = serializer.validated_data["revision"]
            if (pending and pending.revision != revision) or (not pending and revision != 0):
                raise ScheduleConflict()
            if pending:
                pending.schedule, pending.revision = schedule, pending.revision + 1
                pending.save(update_fields=["schedule", "revision", "updated_at"])
            else:
                pending = OfficeScheduleRequest.objects.create(member=member, schedule=schedule)
            OfficeScheduleRevision.objects.create(request=pending, revision=pending.revision, schedule=schedule)
            OfficeAudit.objects.create(
                office_id=1,
                actor=request.user,
                action="schedule_requested",
                details={"request_id": pending.pk, "revision": pending.revision},
            )
            notify_admins(pending)
        return Response(request_data(pending))


class DecisionSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=1)
    decision = serializers.ChoiceField(choices=["approved", "rejected"])
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class OfficeScheduleDecisionView(BaseAPIView):
    authentication_classes = [SessionAuthentication]

    def post(self, request, pk):
        serializer = DecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            get_object_or_404(VirtualOffice.objects.select_for_update(), pk=1)
            if not OfficeMember.objects.filter(
                user=request.user, active=True, role__in=["admin", "super_admin"]
            ).exists():
                raise PermissionDenied("Office administrator access required.")
            pending = get_object_or_404(OfficeScheduleRequest.objects.select_related("member"), pk=pk)
            if pending.member.role == "super_admin" and not OfficeMember.objects.filter(
                user=request.user, active=True, role="super_admin"
            ).exists():
                raise PermissionDenied("You do not have permission to edit this account.")
            if pending.status != "pending" or pending.revision != data["revision"]:
                raise ScheduleConflict()
            if not pending.member.active:
                raise ValidationError("This employee's office access has been revoked.")
            reason = data.get("reason", "").strip()
            if data["decision"] == "rejected" and not reason:
                raise ValidationError("A rejection reason is required.")
            if data["decision"] == "approved":
                policy = latest_policy(pending.member)
                if not policy or policy.arrangement != "scheduled":
                    raise ValidationError("This employee is no longer assigned Scheduled shift.")
                publish_policy(pending.member, request.user, "scheduled", pending.schedule, supersede=False)
            pending.status, pending.reason = data["decision"], reason
            pending.decided_by, pending.decided_at = request.user, timezone.now()
            pending.save(update_fields=["status", "reason", "decided_by", "decided_at", "updated_at"])
            notice(
                pending.member.user_id,
                f"Your schedule request was {pending.status}." + (f" Reason: {reason}" if reason else ""),
            )
            OfficeAudit.objects.create(
                office_id=1,
                actor=request.user,
                action="schedule_decided",
                details={
                    "request_id": pending.pk,
                    "revision": pending.revision,
                    "decision": pending.status,
                    "reason": reason,
                },
            )
        return Response(request_data(pending))
