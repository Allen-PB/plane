from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from plane.db.models.virtual_office import OfficeAudit, OfficeDesk, OfficeMember, VirtualOffice

MAX_ATTENDANCE = timedelta(hours=48)
AUTOMATIC_REASON = "Automatic—48 hr limit"


def presence_details(member):
    desk = OfficeDesk.objects.select_related("department").filter(member=member).first()
    return {
        "employee_id": str(member.user_id),
        "employee_name": member.user.display_name or member.user.first_name or "Colleague",
        "email": member.user.email or "",
        "department": member.department.name if member.department else "",
        "position": member.position,
        "desk": f"{desk.department.name} {desk.number:02d}" if desk else "",
    }


def close_attendance(member, reason, ended_at=None):
    """Caller holds the singleton office lock, shared by all attendance mutations."""
    if member.timed_in_at is None:
        return False
    recorded_at = timezone.now()
    ended_at = ended_at or recorded_at
    event = OfficeAudit.objects.create(
        office_id=1,
        actor=member.user,
        action="time_out",
        details={
            **presence_details(member),
            "reason": reason,
            "timed_in_at": member.timed_in_at.isoformat(),
            "recorded_at": recorded_at.isoformat(),
        },
    )
    # The event time is the actual 48-hour cutoff, even after delayed processing.
    OfficeAudit.objects.filter(pk=event.pk).update(created_at=ended_at)
    member.timed_in_at = member.last_seen_at = None
    member.save(update_fields=["timed_in_at", "last_seen_at"])
    return True


def expire_attendance(now=None):
    now = now or timezone.now()
    due = OfficeMember.objects.filter(office_id=1, timed_in_at__lte=now - MAX_ATTENDANCE)
    if not due.exists():
        return 0
    with transaction.atomic():
        # Use the same lock order as the office API to serialize expiry/time-in/out.
        VirtualOffice.objects.select_for_update().get(pk=1)
        count = 0
        for member in due.select_related("user", "department").order_by("pk").iterator():
            count += close_attendance(member, AUTOMATIC_REASON, member.timed_in_at + MAX_ATTENDANCE)
        return count
