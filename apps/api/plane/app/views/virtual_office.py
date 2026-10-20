from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.db.models import User
from plane.db.models.virtual_office import OfficeAudit, OfficeDepartment, OfficeDesk, OfficeMember, VirtualOffice


class ActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=["member", "reserve", "release", "time_in", "time_out", "heartbeat", "settings", "department"]
    )
    user_id = serializers.UUIDField(required=False)
    member_id = serializers.UUIDField(required=False)
    desk_id = serializers.IntegerField(min_value=1, required=False)
    department_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    position = serializers.CharField(max_length=120, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=OfficeMember.Role.choices, required=False)
    active = serializers.BooleanField(required=False)
    name = serializers.CharField(max_length=120, required=False)
    color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$", required=False)


def office_member(user):
    member = OfficeMember.objects.select_related("department", "user").filter(user=user, active=True).first()
    if not member:
        raise PermissionDenied("Virtual Office access has not been granted. Contact an office administrator.")
    return member


def audit(actor, action, **details):
    OfficeAudit.objects.create(office_id=1, actor=actor, action=action, details=details)


def person(member):
    return {
        "id": str(member.id),
        "user_id": str(member.user_id),
        "name": member.user.display_name or member.user.first_name or "Colleague",
        "role": member.role,
        "department_id": member.department_id,
        "position": member.position,
        "active": member.active,
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
        member = OfficeMember.objects.select_related("user").filter(user=request.user, active=True).first()
        return Response({"allowed": member is not None, "member": person(member) if member else None})


class OfficeView(BaseAPIView):
    def get(self, request):
        member = office_member(request.user)
        members = OfficeMember.objects.select_related("user").filter(active=True)
        return Response(
            {
                "name": VirtualOffice.objects.get(pk=1).name,
                "me": person(member),
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
            if action in ("member", "release", "settings", "department") and not admin:
                raise PermissionDenied("Office administrator access required.")
            if action == "member":
                self.update_member(request, actor, data)
            elif action == "department":
                department = get_object_or_404(OfficeDepartment, pk=data.get("department_id"), office_id=1)
                name = data.get("name", department.name)
                if len(name) > 80 or OfficeDepartment.objects.filter(name=name).exclude(pk=department.pk).exists():
                    raise ValidationError("Department names must be unique and at most 80 characters.")
                department.name = name
                department.color = data.get("color", department.color)
                department.save(update_fields=["name", "color"])
                audit(request.user, action, department_id=department.pk, name=name, color=department.color)
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
                    OfficeMember.objects.filter(pk=desk.member_id).update(timed_in_at=None, last_seen_at=None)
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
                elif action == "time_in":
                    if not OfficeDesk.objects.filter(member=actor).exists():
                        raise ValidationError("Reserve a desk before timing in.")
                    actor.timed_in_at = timezone.now()
                    actor.last_seen_at = timezone.now()
                    actor.save(update_fields=["timed_in_at", "last_seen_at"])
                    audit(request.user, action)
                elif action == "time_out":
                    actor.timed_in_at = actor.last_seen_at = None
                    actor.save(update_fields=["timed_in_at", "last_seen_at"])
                    audit(request.user, action)
                elif action == "heartbeat":
                    # Expired leases require an explicit time-in, preventing a
                    # sleeping tab from silently restoring a stale attendance.
                    if (
                        actor.timed_in_at
                        and actor.last_seen_at
                        and actor.last_seen_at > timezone.now() - timedelta(seconds=90)
                    ):
                        OfficeMember.objects.filter(pk=actor.pk).update(last_seen_at=timezone.now())
        return Response({"ok": True})

    def update_member(self, request, actor, data):
        user = get_object_or_404(User, pk=data.get("user_id"), is_active=True, is_bot=False)
        target = OfficeMember.objects.filter(user=user).first()
        role = data.get("role", target.role if target else "employee")
        if actor.role != "super_admin" and (role != "employee" or (target and target.role != "employee")):
            raise PermissionDenied("Only Super Admins manage office administrators.")
        active = data.get("active", target.active if target else True)
        if target and target.role == "super_admin" and target.active and (role != "super_admin" or not active):
            if not OfficeMember.objects.filter(role="super_admin", active=True).exclude(pk=target.pk).exists():
                raise ValidationError("The office must retain an active Super Admin.")
        department_id = data.get("department_id", target.department_id if target else None)
        if department_id is not None:
            get_object_or_404(OfficeDepartment, pk=department_id, office_id=1)
        if role == "employee" and (
            department_id is None or not data.get("position", target.position if target else "")
        ):
            raise ValidationError("Employees require a department and job position.")
        if target is None:
            target = OfficeMember(office_id=1, user=user)
        if target.department_id != department_id or not active:
            OfficeDesk.objects.filter(member=target).update(member=None)
            target.timed_in_at = target.last_seen_at = None
        target.role, target.active, target.department_id = role, active, department_id
        target.position = data.get("position", target.position)
        target.save()
        audit(
            request.user,
            "member",
            member_id=str(target.id),
            user_id=str(user.id),
            role=role,
            active=active,
            department_id=department_id,
            position=target.position,
        )


class OfficeAdminView(BaseAPIView):
    def get(self, request):
        actor = office_member(request.user)
        if actor.role not in ("admin", "super_admin"):
            raise PermissionDenied("Office administrator access required.")
        query = request.GET.get("q", "").strip()[:100]
        users = User.objects.filter(is_active=True, is_bot=False).order_by("email")
        if query:
            users = users.filter(email__icontains=query)
        return Response(
            {
                "members": [person(m) for m in OfficeMember.objects.select_related("user").all()],
                "users": list(users.values("id", "email", "display_name")[:50]),
                "audit": list(OfficeAudit.objects.values("id", "actor_id", "action", "details", "created_at")[:100]),
            }
        )
