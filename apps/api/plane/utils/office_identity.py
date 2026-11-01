from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from plane.db.models import Profile
from plane.db.models.virtual_office import OfficeAudit, OfficeDesk, OfficeJobRole, OfficeNotice


def validated_job_role(department_id, job_role_id, current_job_role_id=None):
    job_role = get_object_or_404(OfficeJobRole, pk=job_role_id, department_id=department_id, department__office_id=1)
    if job_role.archived and job_role.pk != current_job_role_id:
        raise ValidationError("This job role is archived. Choose an active role.")
    return job_role


def identity_pending(member):
    profile = getattr(member.user, "profile", None)
    return bool(
        profile
        and (profile.office_department_id != member.department_id or profile.office_job_role_id != member.job_role_id)
    )


def apply_identity(member):
    """Caller holds the singleton office lock; never modify an open session."""
    if member.timed_in_at:
        raise ValidationError("Your new department and job role apply at your next Time In.")
    profile = Profile.objects.select_related("office_job_role").filter(user_id=member.user_id).first()
    if not profile:
        return
    if profile.office_job_role_id:
        validated_job_role(profile.office_department_id, profile.office_job_role_id, member.job_role_id)
    if profile.office_department_id != member.department_id:
        OfficeDesk.objects.filter(member=member).update(member=None)
    member.department_id = profile.office_department_id
    member.job_role_id = profile.office_job_role_id
    member.position = profile.office_job_role.name if profile.office_job_role else ""
    member.save(update_fields=["department", "job_role", "position"])


def save_identity(user, department_id, job_role, actor, member=None):
    profile, _ = Profile.objects.get_or_create(user=user)
    changed = profile.office_department_id != department_id or profile.office_job_role_id != job_role.pk
    profile.office_department_id = department_id
    profile.office_job_role = job_role
    profile.role = job_role.name
    profile.save(update_fields=["office_department", "office_job_role", "role", "updated_at"])
    OfficeAudit.objects.create(
        office_id=1,
        actor=actor,
        action="employee_identity",
        details={
            "user_id": str(user.pk),
            "department_id": department_id,
            "job_role_id": job_role.pk,
            "effective": "next_time_in" if member else "initial_setup",
        },
    )
    if changed and member:
        OfficeNotice.objects.create(
            user=user,
            message=(
                "Your department or job role was updated. The change takes effect at your next Time In. "
                "Review your Profile for details."
            ),
        )


def identity_data(user, member=None):
    profile = getattr(user, "profile", None)
    member = member or getattr(user, "officemember", None)
    return {
        "department_id": profile.office_department_id if profile else None,
        "job_role_id": profile.office_job_role_id if profile else None,
        "job_role_name": profile.office_job_role.name if profile and profile.office_job_role else "",
        # Revocation does not reopen self-service identity editing.
        "locked": member is not None,
        "pending": identity_pending(member) if member else False,
    }
