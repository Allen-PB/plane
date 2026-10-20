"""Virtual Office permissions deliberately do not inherit any Plane role."""

import uuid

from django.conf import settings
from django.db import models


class VirtualOffice(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    name = models.CharField(max_length=120, default="PathBuilder Virtual Office")

    class Meta:
        db_table = "virtual_offices"
        constraints = [models.CheckConstraint(condition=models.Q(id=1), name="vo_single_office")]


class OfficeDepartment(models.Model):
    office = models.ForeignKey(VirtualOffice, on_delete=models.CASCADE)
    name = models.CharField(max_length=80, unique=True)
    color = models.CharField(max_length=7)
    order = models.PositiveSmallIntegerField(unique=True)

    class Meta:
        db_table = "office_departments"
        ordering = ["order"]


class OfficeMember(models.Model):
    class Role(models.TextChoices):
        SUPER_ADMIN = "super_admin", "Super Admin"
        ADMIN = "admin", "Admin"
        EMPLOYEE = "employee", "Employee"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    office = models.ForeignKey(VirtualOffice, on_delete=models.CASCADE)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.EMPLOYEE)
    department = models.ForeignKey(OfficeDepartment, null=True, blank=True, on_delete=models.PROTECT)
    position = models.CharField(max_length=120, blank=True)
    active = models.BooleanField(default=True)
    timed_in_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "office_members"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(role__in=["super_admin", "admin", "employee"]), name="vo_valid_role"
            )
        ]


class OfficeDesk(models.Model):
    department = models.ForeignKey(OfficeDepartment, on_delete=models.PROTECT)
    number = models.PositiveSmallIntegerField()
    # OneToOne enforces one reservation per member; each desk row has one owner.
    member = models.OneToOneField(OfficeMember, null=True, blank=True, on_delete=models.SET_NULL, related_name="desk")

    class Meta:
        db_table = "office_desks"
        ordering = ["department__order", "number"]
        constraints = [models.UniqueConstraint(fields=["department", "number"], name="vo_department_desk_number")]


class OfficeAudit(models.Model):
    office = models.ForeignKey(VirtualOffice, on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=40)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "office_audit"
        ordering = ["-created_at", "-id"]
