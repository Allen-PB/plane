"""Virtual Office permissions deliberately do not inherit any Plane role."""

import uuid

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class VirtualOffice(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    name = models.CharField(max_length=120, default="PathBuilder Virtual Office")
    appearance_mode = models.CharField(
        max_length=9, default="automatic", choices=[("automatic", "Automatic"), ("day", "Day"), ("night", "Night")]
    )

    class Meta:
        db_table = "virtual_offices"
        constraints = [
            models.CheckConstraint(condition=models.Q(id=1), name="vo_single_office"),
            models.CheckConstraint(
                condition=models.Q(appearance_mode__in=["automatic", "day", "night"]), name="vo_valid_appearance_mode"
            ),
        ]


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
    position = models.CharField(max_length=300, blank=True)
    job_role = models.ForeignKey("db.OfficeJobRole", null=True, blank=True, on_delete=models.PROTECT)
    avatar_style = models.CharField(max_length=10, choices=[("male", "Male"), ("female", "Female")], default="male")
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


class OfficeJobRole(models.Model):
    department = models.ForeignKey(OfficeDepartment, on_delete=models.PROTECT, related_name="job_roles")
    name = models.CharField(max_length=300)
    archived = models.BooleanField(default=False)

    class Meta:
        db_table = "office_job_roles"
        ordering = ["department__order", "name", "id"]
        constraints = [models.UniqueConstraint(Lower("name"), "department", name="vo_department_role_name")]


class OfficeNotice(models.Model):
    """Office notices are independent of workspace membership."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    message = models.CharField(max_length=600)
    href = models.CharField(max_length=255, default="/settings/profile/general/")
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "office_notices"
        ordering = ["-created_at", "-id"]


class OfficeWorkPolicy(models.Model):
    """Immutable approved arrangement/schedule versions; never edit past versions."""

    member = models.ForeignKey(OfficeMember, on_delete=models.PROTECT, related_name="work_policies")
    arrangement = models.CharField(
        max_length=20, choices=[("scheduled", "Scheduled shift"), ("output_based", "Output-based")]
    )
    schedule = models.JSONField(default=list)
    timezone = models.CharField(max_length=64, default="Asia/Manila")
    effective_from = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = "office_work_policies"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(arrangement__in=["scheduled", "output_based"]), name="vo_policy_arrangement"
            )
        ]


class OfficeScheduleRequest(models.Model):
    member = models.ForeignKey(OfficeMember, on_delete=models.PROTECT, related_name="schedule_requests")
    schedule = models.JSONField(default=list)
    revision = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=12,
        default="pending",
        choices=[
            ("pending", "Pending"),
            ("approved", "Approved"),
            ("rejected", "Rejected"),
            ("superseded", "Superseded"),
        ],
    )
    reason = models.CharField(max_length=500, blank=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    decided_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "office_schedule_requests"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["member"], condition=models.Q(status="pending"), name="vo_one_pending_schedule"
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=["pending", "approved", "rejected", "superseded"]),
                name="vo_request_status",
            ),
        ]


class OfficeScheduleRevision(models.Model):
    request = models.ForeignKey(OfficeScheduleRequest, on_delete=models.PROTECT, related_name="revisions")
    revision = models.PositiveIntegerField()
    schedule = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "office_schedule_revisions"
        ordering = ["revision"]
        constraints = [models.UniqueConstraint(fields=["request", "revision"], name="vo_schedule_revision")]
