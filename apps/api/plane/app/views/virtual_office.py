import csv
import io
from datetime import datetime, time, timedelta, timezone as datetime_timezone
from zoneinfo import ZoneInfo

from django.db import transaction
from django.http import StreamingHttpResponse
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.db.models import User, Profile
from plane.db.models.virtual_office import (
    OfficeAudit,
    OfficeDepartment,
    OfficeDesk,
    OfficeJobRole,
    OfficeMember,
    VirtualOffice,
)
from plane.utils.office_attendance import close_attendance, expire_attendance, presence_details
from plane.utils.office_identity import (
    apply_identity,
    identity_data,
    identity_pending,
    save_identity,
    validated_job_role,
)
from plane.utils.office_schedules import ScheduleConflict, latest_policy, publish_policy, validate_schedule, work_data
from plane.utils.office_sessions import attendance_data, current_session, start_session


class ActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=[
            "member",
            "reserve",
            "release",
            "time_in",
            "time_out",
            "heartbeat",
            "settings",
            "department",
            "avatar",
            "appearance",
            "prepare_time_in",
        ]
    )
    user_id = serializers.UUIDField(required=False)
    member_id = serializers.UUIDField(required=False)
    desk_id = serializers.IntegerField(min_value=1, required=False)
    department_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    position = serializers.CharField(max_length=120, required=False, allow_blank=True)
    job_role_id = serializers.IntegerField(min_value=1, required=False)
    arrangement = serializers.ChoiceField(choices=["scheduled", "output_based"], required=False)
    schedule = serializers.ListField(required=False)
    policy_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    shift_date = serializers.DateField(required=False)
    confirmed = serializers.BooleanField(default=False)
    employee_reason = serializers.CharField(max_length=500, allow_blank=True, required=False)
    role = serializers.ChoiceField(choices=OfficeMember.Role.choices, required=False)
    active = serializers.BooleanField(required=False)
    name = serializers.CharField(max_length=120, required=False)
    color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$", required=False)
    avatar_style = serializers.ChoiceField(choices=["male", "female"], required=False)
    appearance_mode = serializers.ChoiceField(choices=["automatic", "day", "night"], required=False)


def office_member(user):
    member = OfficeMember.objects.select_related("department", "user__profile").filter(user=user, active=True).first()
    if not member:
        raise PermissionDenied("Virtual Office access has not been granted. Contact an office administrator.")
    expire_attendance()
    member.refresh_from_db()
    return member


def audit(actor, action, **details):
    return OfficeAudit.objects.create(office_id=1, actor=actor, action=action, details=details)


def person(member):
    return {
        "id": str(member.id),
        "user_id": str(member.user_id),
        "name": member.user.display_name or member.user.first_name or "Colleague",
        "role": member.role,
        "department_id": member.department_id,
        "position": member.position,
        "job_role_id": member.job_role_id,
        "identity_pending": identity_pending(member),
        "active": member.active,
        "avatar_style": member.avatar_style,
        "online": bool(
            member.active
            and member.timed_in_at
            and member.last_seen_at
            and member.last_seen_at > timezone.now() - timedelta(seconds=90)
        ),
        "timed_in_at": member.timed_in_at,
    }


class OfficeStatusView(BaseAPIView):
    def get(self, request):
        member = OfficeMember.objects.select_related("user__profile").filter(user=request.user, active=True).first()
        if member:
            expire_attendance()
            member.refresh_from_db()
        return Response(
            {
                "allowed": member is not None,
                "member": person(member) if member else None,
                "csrf_token": get_token(request),
            }
        )


class OfficeView(BaseAPIView):
    authentication_classes = [SessionAuthentication]

    def get(self, request):
        member = office_member(request.user)
        members = OfficeMember.objects.select_related("user__profile").filter(active=True)
        office = VirtualOffice.objects.get(pk=1)
        now = timezone.now()
        hour = now.astimezone(ZoneInfo("Asia/Manila")).hour
        appearance = (
            office.appearance_mode
            if office.appearance_mode != "automatic"
            else ("night" if hour >= 18 or hour < 6 else "day")
        )
        return Response(
            {
                "name": office.name,
                "appearance_mode": office.appearance_mode,
                "appearance": appearance,
                "appearance_timezone": "Asia/Manila",
                "server_time": now.isoformat(),
                "me": person(member),
                "work": work_data(member),
                "attendance": attendance_data(member),
                "departments": list(OfficeDepartment.objects.values("id", "name", "color", "order")),
                "desks": list(OfficeDesk.objects.values("id", "department_id", "number", "member_id")),
                "members": [person(m) for m in members],
                "presence_lease_seconds": 90,
            }
        )

    def post(self, request):
        serializer = ActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # All writes lock the singleton office first. This also serializes role
        # changes, revocations, last-super-admin checks and competing desk claims.
        with transaction.atomic():
            get_object_or_404(VirtualOffice.objects.select_for_update(), pk=1)
            actor = office_member(request.user)
            action = data["action"]
            admin = actor.role in ("admin", "super_admin")
            if action in ("member", "release", "settings", "department", "appearance") and not admin:
                raise PermissionDenied("Office administrator access required.")
            if action == "appearance":
                if "appearance_mode" not in data:
                    raise ValidationError("Choose Automatic, Day, or Night.")
                VirtualOffice.objects.filter(pk=1).update(appearance_mode=data["appearance_mode"])
                audit(request.user, action, appearance_mode=data["appearance_mode"])
            elif action == "member":
                self.update_member(request, actor, data)
            elif action == "department":
                department = get_object_or_404(OfficeDepartment, pk=data.get("department_id"), office_id=1)
                if "name" in data and data["name"] != department.name:
                    raise ValidationError("Department names are fixed and cannot be changed.")
                department.color = data.get("color", department.color)
                department.save(update_fields=["color"])
                audit(request.user, action, department_id=department.pk, name=department.name, color=department.color)
            elif action == "settings":
                if actor.role != "super_admin":
                    raise PermissionDenied("Super Admin access required.")
                if "name" not in data:
                    raise ValidationError("Office name is required.")
                VirtualOffice.objects.filter(pk=1).update(name=data["name"])
                audit(request.user, action, name=data["name"])
            elif action == "release":
                desk = get_object_or_404(OfficeDesk, pk=data.get("desk_id"))
                if desk.member_id:
                    close_attendance(desk.member, "Administrator released desk")
                    audit(request.user, action, desk_id=desk.id, member_id=str(desk.member_id))
                    desk.member = None
                    desk.save(update_fields=["member"])
            else:
                target = actor
                if "member_id" in data and str(data["member_id"]) != str(actor.id):
                    if not admin or action != "reserve":
                        raise PermissionDenied("You cannot change another employee's presence.")
                    target = get_object_or_404(OfficeMember, pk=data["member_id"], active=True)
                if action == "reserve":
                    desk = get_object_or_404(OfficeDesk.objects.select_for_update(), pk=data.get("desk_id"))
                    if desk.department_id != target.department_id:
                        raise ValidationError("Choose a desk in the employee's assigned department.")
                    if desk.member_id and desk.member_id != target.id:
                        return Response({"detail": "This desk has already been reserved."}, status=409)
                    OfficeDesk.objects.filter(member=target).exclude(pk=desk.pk).update(member=None)
                    desk.member = target
                    desk.save(update_fields=["member"])
                    audit(request.user, action, desk_id=desk.id, member_id=str(target.id))
                elif action == "avatar":
                    if "avatar_style" not in data:
                        raise ValidationError("Choose an avatar style.")
                    actor.avatar_style = data["avatar_style"]
                    actor.save(update_fields=["avatar_style"])
                    audit(request.user, action, member_id=str(actor.pk), avatar_style=actor.avatar_style)
                elif action == "time_in":
                    if actor.timed_in_at:
                        return Response(
                            {"detail": "You are already timed in. Time out before starting again."}, status=409
                        )
                    if identity_pending(actor):
                        raise ValidationError("Apply your pending department and job role before choosing a desk.")
                    apply_identity(actor)
                    if not actor.department_id or not actor.job_role_id:
                        raise ValidationError("Complete your department and job role before timing in.")
                    if (
                        not OfficeDesk.objects.filter(member=actor).exists()
                        and OfficeDesk.objects.filter(department_id=actor.department_id, member__isnull=True).exists()
                    ):
                        raise ValidationError("Reserve a desk before timing in.")
                    actor.timed_in_at = timezone.now()
                    actor.last_seen_at = timezone.now()
                    actor.save(update_fields=["timed_in_at", "last_seen_at"])
                    details = presence_details(actor)
                    event = audit(request.user, action, **details)
                    OfficeAudit.objects.filter(pk=event.pk).update(created_at=actor.timed_in_at)
                    start_session(
                        actor, event, {**details, "department_id": actor.department_id}, data.get("shift_date")
                    )
                elif action == "prepare_time_in":
                    apply_identity(actor)
                    audit(request.user, action, member_id=str(actor.pk))
                elif action == "time_out":
                    session = current_session(actor)
                    if (
                        session
                        and session.shift
                        and timezone.now() < session.shift.expected_end
                        and not data["confirmed"]
                    ):
                        return Response(
                            {
                                "detail": "You are leaving before your scheduled shift ends. "
                                "Confirm Time Out to continue.",
                                "expected_end": session.shift.expected_end,
                                "confirmation_required": True,
                            },
                            status=409,
                        )
                    close_attendance(actor, "Manual", employee_reason=data.get("employee_reason", ""))
                elif action == "heartbeat":
                    # Presence can resume without starting another attendance session.
                    if actor.timed_in_at:
                        OfficeMember.objects.filter(pk=actor.pk).update(last_seen_at=timezone.now())
        return Response({"ok": True})

    def update_member(self, request, actor, data):
        user = get_object_or_404(User, pk=data.get("user_id"), is_active=True, is_bot=False)
        target = OfficeMember.objects.filter(user=user).first()
        role = data.get("role", target.role if target else "employee")
        if actor.role != "super_admin" and (role != "employee" or (target and target.role != "employee")):
            raise PermissionDenied("Only Super Admins manage office administrators.")
        active = data.get("active", target.active if target else True)
        if target is None and not active:
            raise ValidationError("This account has not been granted office access.")
        if target and target.role == "super_admin" and target.active and (role != "super_admin" or not active):
            if (
                not OfficeMember.objects.filter(role="super_admin", active=True, user__is_active=True)
                .exclude(pk=target.pk)
                .exists()
            ):
                raise ValidationError("The office must retain an active Super Admin.")
        profile = Profile.objects.filter(user=user).first()
        department_id = data.get("department_id", profile.office_department_id if profile else None)
        if active and role == "employee" and department_id is None:
            raise ValidationError("Employees require a department and job role.")
        if active and department_id is not None:
            get_object_or_404(OfficeDepartment, pk=department_id, office_id=1)
        if "position" in data:
            raise ValidationError("Choose a job role from the department dropdown.")
        job_role_id = data.get("job_role_id", profile.office_job_role_id if profile else None)
        job_role = None
        if active and job_role_id:
            job_role = validated_job_role(department_id, job_role_id, target.job_role_id if target else None)
        if active and role == "employee" and (department_id is None or job_role is None):
            raise ValidationError("Employees require a department and job role.")
        if target is None:
            target = OfficeMember(office_id=1, user=user)
        if not active:
            close_attendance(target, "Administrator revoked access")
            OfficeDesk.objects.filter(member=target).update(member=None)
            target.timed_in_at = target.last_seen_at = None
        new_member = target._state.adding
        previous_policy = latest_policy(target) if not new_member else None
        if active and "policy_id" in data and ("arrangement" in data or "schedule" in data):
            if data["policy_id"] != (previous_policy.pk if previous_policy else None):
                raise ScheduleConflict("This employee's working schedule changed. Refresh and review the latest hours.")
        arrangement = data.get("arrangement", previous_policy.arrangement if previous_policy else None)
        schedule = data.get("schedule", previous_policy.schedule if previous_policy else [])
        if active and (new_member or not target.active) and not arrangement:
            raise ValidationError("Select an attendance arrangement before granting access.")
        if active and arrangement == "scheduled":
            validate_schedule(schedule)
        if job_role:
            save_identity(user, department_id, job_role, request.user, None if new_member else target)
        if new_member:
            target.department_id = department_id
            target.job_role = job_role
            target.position = job_role.name if job_role else ""
        target.role, target.active = role, active
        target.save()
        if active and arrangement and ("arrangement" in data or "schedule" in data or new_member):
            publish_policy(target, request.user, arrangement, schedule)
        audit(
            request.user,
            "member",
            member_id=str(target.id),
            user_id=str(user.id),
            role=role,
            active=active,
            department_id=department_id,
            position=job_role.name if job_role else target.position,
            job_role_id=job_role.pk if job_role else target.job_role_id,
            assignment_effective="initial_setup" if new_member else "next_time_in",
        )


class OfficeAdminView(BaseAPIView):
    def get(self, request):
        actor = office_member(request.user)
        if actor.role not in ("admin", "super_admin"):
            raise PermissionDenied("Office administrator access required.")
        query = request.GET.get("q", "").strip()[:100]
        users = (
            User.objects.select_related("profile__office_job_role", "officemember__user__profile")
            .filter(is_active=True, is_bot=False)
            .order_by("email")
        )
        if query:
            users = users.filter(email__icontains=query)
        members = list(OfficeMember.objects.select_related("user__profile__office_job_role").all())
        return Response(
            {
                "members": [person(m) for m in members],
                "users": [
                    {
                        "id": str(user.pk),
                        "email": user.email,
                        "display_name": user.display_name,
                        "identity": identity_data(user),
                    }
                    for user in users[:50]
                ],
                "identities": {str(m.user_id): identity_data(m.user, m) for m in members},
                "work": {str(m.pk): work_data(m) for m in members},
                "job_roles": list(OfficeJobRole.objects.values("id", "department_id", "name", "archived")),
                "audit": list(OfficeAudit.objects.values("id", "actor_id", "action", "details", "created_at")[:100]),
            }
        )


class PresenceExportSerializer(serializers.Serializer):
    start_date = serializers.DateField(required=False, input_formats=["%Y-%m-%d"])
    end_date = serializers.DateField(required=False, input_formats=["%Y-%m-%d"])
    all_time = serializers.BooleanField(default=False)

    def validate(self, attrs):
        start, end = attrs.get("start_date"), attrs.get("end_date")
        if attrs["all_time"] and (start or end):
            raise serializers.ValidationError("Choose all time or a date range, not both.")
        if bool(start) != bool(end):
            raise serializers.ValidationError("Provide both start and end dates.")
        if start and start > end:
            raise serializers.ValidationError("Start date must be on or before end date.")
        if not attrs["all_time"] and not start:
            today = timezone.localdate(timezone=ZoneInfo("Asia/Manila"))
            attrs.update(start_date=today.replace(day=1), end_date=today)
        return attrs


class OfficePresenceExportView(BaseAPIView):
    def get(self, request):
        actor = office_member(request.user)
        if actor.role not in ("admin", "super_admin"):
            raise PermissionDenied("Office administrator access required.")
        filters = PresenceExportSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        selection = filters.validated_data
        events = OfficeAudit.objects.filter(office_id=1, action__in=["time_in", "time_out"])
        if not selection["all_time"]:
            start, end = selection["start_date"], selection["end_date"]
            zone = ZoneInfo("Asia/Manila")
            lower = datetime.combine(start, time.min, tzinfo=zone)
            # A half-open interval includes the entire end date, including fractional seconds.
            try:
                upper = datetime.combine(end + timedelta(days=1), time.min, tzinfo=zone)
            except OverflowError:
                raise ValidationError("End date is outside the supported range.")
            events = events.filter(created_at__gte=lower, created_at__lt=upper)
            suffix = f"{start.isoformat()}_to_{end.isoformat()}"
        else:
            suffix = "all-time"
        events = events.select_related("actor").order_by("created_at", "id")
        # Historical events predate profile snapshots. Mark current-profile
        # fallbacks explicitly rather than presenting them as historical facts.
        members = {
            member.user_id: member
            for member in OfficeMember.objects.select_related("user", "department").filter(office_id=1)
        }

        def safe_cell(value):
            value = str(value or "")
            return (
                "'" + value
                if value.lstrip().startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n"))
                else value
            )

        def rows():
            buffer = io.StringIO(newline="")
            writer = csv.writer(buffer)

            def row(values):
                buffer.seek(0)
                buffer.truncate(0)
                writer.writerow([safe_cell(value) for value in values])
                return buffer.getvalue()

            yield "\ufeff"
            yield row(
                [
                    "Event ID",
                    "Employee ID",
                    "Employee name",
                    "Email",
                    "Department",
                    "Job position",
                    "Desk",
                    "Event",
                    "Timestamp (Asia/Manila)",
                    "Timestamp (UTC)",
                    "Profile source",
                    "Time Out reason",
                ]
            )
            for event in events.iterator(chunk_size=1000):
                details = event.details
                member = members.get(event.actor_id)
                snapshot = "employee_id" in details
                fallback = {
                    "employee_id": str(event.actor_id or ""),
                    "employee_name": (event.actor.display_name or event.actor.first_name) if event.actor else "",
                    "email": event.actor.email if event.actor else "",
                    "department": member.department.name if member and member.department else "",
                    "position": member.position if member else "",
                    "desk": "",
                }
                profile = details if snapshot else fallback
                yield row(
                    [
                        event.id,
                        *[
                            profile.get(key, "")
                            for key in ("employee_id", "employee_name", "email", "department", "position", "desk")
                        ],
                        "Time In" if event.action == "time_in" else "Time Out",
                        event.created_at.astimezone(ZoneInfo("Asia/Manila")).isoformat(timespec="seconds"),
                        event.created_at.astimezone(datetime_timezone.utc).isoformat(timespec="seconds"),
                        "Recorded at event" if snapshot else "Current profile (legacy event)",
                        details.get("reason", "Manual") if event.action == "time_out" else "",
                    ]
                )

        response = StreamingHttpResponse(rows(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="virtual-office-time-in-out_{suffix}.csv"'
        response["Cache-Control"] = "no-store"
        return response
