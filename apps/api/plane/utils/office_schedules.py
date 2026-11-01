from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import APIException, ValidationError

from plane.db.models.virtual_office import (
    OfficeAudit,
    OfficeMember,
    OfficeNotice,
    OfficeWorkPolicy,
)

OFFICE_ZONE = ZoneInfo("Asia/Manila")
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class ScheduleConflict(APIException):
    status_code = 409
    default_detail = "This request changed. Refresh and review the latest revision."


class ScheduleDaySerializer(serializers.Serializer):
    day = serializers.IntegerField(min_value=0, max_value=6)
    start = serializers.RegexField(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end = serializers.RegexField(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    ends_next_day = serializers.BooleanField(default=False)


def validate_schedule(value):
    serializer = ScheduleDaySerializer(data=value, many=True)
    serializer.is_valid(raise_exception=True)
    entries = serializer.validated_data
    if not 1 <= len(entries) <= 7 or len({entry["day"] for entry in entries}) != len(entries):
        raise ValidationError("Select one to seven distinct working days.")
    intervals = []
    for entry in entries:
        start = time.fromisoformat(entry["start"])
        end = time.fromisoformat(entry["end"])
        lower = entry["day"] * 1440 + start.hour * 60 + start.minute
        upper = entry["day"] * 1440 + end.hour * 60 + end.minute + (1440 if entry["ends_next_day"] else 0)
        if upper <= lower or upper - lower > 1440:
            raise ValidationError(
                f"{DAYS[entry['day']]} must end after its start, within 24 hours. "
                "Choose Ends next day for overnight shifts."
            )
        intervals.append((lower, upper, entry["day"]))
    for index, (lower, upper, day) in enumerate(intervals):
        for other_lower, other_upper, other_day in intervals[index + 1 :]:
            if any(
                max(lower, other_lower + offset) < min(upper, other_upper + offset) for offset in (-10080, 0, 10080)
            ):
                raise ValidationError(f"{DAYS[day]} overlaps {DAYS[other_day]}.")
    return sorted([dict(entry) for entry in entries], key=lambda entry: entry["day"])


def shift_bounds(entry, day):
    start = datetime.combine(day, time.fromisoformat(entry["start"]), tzinfo=OFFICE_ZONE)
    end = datetime.combine(
        day + timedelta(days=int(entry["ends_next_day"])), time.fromisoformat(entry["end"]), tzinfo=OFFICE_ZONE
    )
    return start, end


def latest_policy(member):
    return member.work_policies.first()


def notice(user_id, message, href="/settings/profile/general/"):
    OfficeNotice.objects.create(user_id=user_id, message=message, href=href)


def request_data(request):
    return {
        "id": request.pk,
        "member_id": str(request.member_id),
        "schedule": request.schedule,
        "revision": request.revision,
        "status": request.status,
        "reason": request.reason,
        "created_at": request.created_at,
        "decided_at": request.decided_at,
        "revisions": list(request.revisions.values("revision", "schedule", "created_at")),
    }


def work_data(member):
    policy = latest_policy(member)
    requests = member.schedule_requests.prefetch_related("revisions")[:10]
    return {
        "arrangement": policy.arrangement if policy else None,
        "schedule": policy.schedule if policy else [],
        "policy_id": policy.pk if policy else None,
        "effective_from": policy.effective_from if policy else None,
        "timezone": "Asia/Manila",
        "requests": [request_data(request) for request in requests],
    }


def publish_policy(member, actor, arrangement, schedule, *, supersede=True):
    """Caller holds the office lock. Immutable versions make changes prospective."""
    if arrangement not in ("scheduled", "output_based"):
        raise ValidationError("Choose Scheduled shift or Output-based.")
    schedule = validate_schedule(schedule) if arrangement == "scheduled" else []
    previous = latest_policy(member)
    now = timezone.now()
    local_now = now.astimezone(OFFICE_ZONE)
    effective = (
        datetime.combine(local_now.date(), time.min, tzinfo=OFFICE_ZONE)
        if previous is None or previous.arrangement != arrangement
        else now
    )
    if previous and previous.arrangement == arrangement == "scheduled":
        # A schedule edit during a shift does not redefine that shift.
        for day in (local_now.date() - timedelta(days=1), local_now.date()):
            for entry in previous.schedule:
                if entry["day"] == day.weekday():
                    start, end = shift_bounds(entry, day)
                    if start <= now < end:
                        effective = max(effective, end)
    if previous and previous.arrangement == arrangement and previous.schedule == schedule:
        return previous
    policy = OfficeWorkPolicy.objects.create(
        member=member, arrangement=arrangement, schedule=schedule, effective_from=effective, created_by=actor
    )
    if supersede:
        for request in member.schedule_requests.filter(status="pending"):
            request.status, request.decided_by, request.decided_at = "superseded", actor, now
            request.save(update_fields=["status", "decided_by", "decided_at", "updated_at"])
            notice(member.user_id, "Your pending schedule request was superseded by an administrator's newer schedule.")
    OfficeAudit.objects.create(
        office_id=1,
        actor=actor,
        action="work_policy",
        details={
            "member_id": str(member.pk),
            "policy_id": policy.pk,
            "arrangement": arrangement,
            "schedule": schedule,
            "effective_from": effective.isoformat(),
        },
    )
    notice(
        member.user_id,
        "Your attendance arrangement or working schedule was updated. "
        "Open sessions keep their original rules; new hours apply from the next shift.",
    )
    return policy


def notify_admins(request):
    for user_id in OfficeMember.objects.filter(
        active=True, user__is_active=True, role__in=["admin", "super_admin"]
    ).values_list("user_id", flat=True):
        notice(
            user_id,
            f"A schedule request is awaiting review (request {request.pk}, revision {request.revision}).",
            "/virtual-office/admin/access/",
        )
