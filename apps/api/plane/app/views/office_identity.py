from django.db import transaction
from django.http import Http404
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.db.models.virtual_office import OfficeDepartment, OfficeJobRole, OfficeMember, OfficeNotice, VirtualOffice
from plane.utils.office_identity import identity_data, save_identity, validated_job_role
from plane.utils.office_schedules import work_data


class IdentitySerializer(serializers.Serializer):
    department_id = serializers.IntegerField(min_value=1)
    job_role_id = serializers.IntegerField(min_value=1)


class OfficeIdentityView(BaseAPIView):
    authentication_classes = [SessionAuthentication]

    def get(self, request):
        member = OfficeMember.objects.filter(user=request.user, active=True).first()
        response = Response(
            {
                **identity_data(request.user),
                "work": work_data(member) if member else None,
                "departments": list(
                    OfficeDepartment.objects.filter(office_id=1).values("id", "name", "color", "order")
                ),
                "job_roles": list(
                    OfficeJobRole.objects.filter(department__office_id=1).values(
                        "id", "department_id", "name", "archived"
                    )
                ),
                "csrf_token": get_token(request),
                "notices": list(
                    OfficeNotice.objects.filter(user=request.user, read_at__isnull=True).values(
                        "id", "message", "href", "created_at"
                    )[:50]
                ),
            }
        )
        response["Cache-Control"] = "no-store"
        return response

    def patch(self, request):
        serializer = IdentitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            get_object_or_404(VirtualOffice.objects.select_for_update(), pk=1)
            if OfficeMember.objects.filter(user=request.user).exists():
                raise PermissionDenied("An office administrator manages your department and job role.")
            data = serializer.validated_data
            job_role = validated_job_role(data["department_id"], data["job_role_id"])
            save_identity(request.user, data["department_id"], job_role, request.user)
        return Response(identity_data(request.user))


class OfficeNoticeReadView(BaseAPIView):
    authentication_classes = [SessionAuthentication]

    def post(self, request, pk):
        if not OfficeNotice.objects.filter(pk=pk, user=request.user).update(read_at=timezone.now()):
            raise Http404
        return Response({"ok": True})


class JobRoleSerializer(serializers.Serializer):
    id = serializers.IntegerField(min_value=1, required=False)
    department_id = serializers.IntegerField(min_value=1, required=False)
    name = serializers.CharField(max_length=300, required=False)
    archived = serializers.BooleanField(required=False)


class OfficeJobRoleView(BaseAPIView):
    authentication_classes = [SessionAuthentication]

    def post(self, request):
        serializer = JobRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            get_object_or_404(VirtualOffice.objects.select_for_update(), pk=1)
            if not OfficeMember.objects.filter(user=request.user, active=True, role="super_admin").exists():
                raise PermissionDenied("Only Super Admins manage job roles.")
            job_role = get_object_or_404(OfficeJobRole, pk=data["id"]) if "id" in data else None
            department_id = job_role.department_id if job_role else data.get("department_id")
            get_object_or_404(OfficeDepartment, pk=department_id, office_id=1)
            if job_role and "department_id" in data and data["department_id"] != department_id:
                raise ValidationError("A job role cannot be moved to another department.")
            name = data.get("name", job_role.name if job_role else "").strip()
            if not name:
                raise ValidationError("A job role name is required.")
            duplicate = OfficeJobRole.objects.filter(department_id=department_id, name__iexact=name)
            if job_role:
                duplicate = duplicate.exclude(pk=job_role.pk)
            if duplicate.exists():
                raise ValidationError("This department already has a job role with that name.")
            if not job_role:
                job_role = OfficeJobRole(department_id=department_id)
            job_role.name, job_role.archived = name, data.get("archived", job_role.archived)
            job_role.save()
            from plane.db.models import Profile
            from plane.db.models.virtual_office import OfficeAudit

            Profile.objects.filter(office_job_role=job_role).update(role=name)
            OfficeMember.objects.filter(job_role=job_role, timed_in_at__isnull=True).update(position=name)
            OfficeAudit.objects.create(
                office_id=1,
                actor=request.user,
                action="job_role",
                details={
                    "job_role_id": job_role.pk,
                    "department_id": department_id,
                    "name": name,
                    "archived": job_role.archived,
                },
            )
        return Response(
            {"id": job_role.pk, "department_id": department_id, "name": name, "archived": job_role.archived}
        )
