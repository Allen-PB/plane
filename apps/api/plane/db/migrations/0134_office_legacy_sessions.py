from datetime import datetime
from zoneinfo import ZoneInfo

from django.db import migrations


def backfill(apps, schema_editor):
    alias = schema_editor.connection.alias
    Audit = apps.get_model("db", "OfficeAudit")
    Session = apps.get_model("db", "OfficeAttendanceSession")
    Member = apps.get_model("db", "OfficeMember")
    Department = apps.get_model("db", "OfficeDepartment")
    departments = {department.name: department.pk for department in Department.objects.using(alias).all()}
    for old, new in {
        "Quality Assurance": "Quality & Systems",
        "Business Department": "Business, Sales & Marketing",
        "Business & Marketing": "Business, Sales & Marketing",
        "Account Managers": "Operations",
        "Chief": "Leadership",
    }.items():
        if new in departments:
            departments[old] = departments[new]
    members = {str(member.user_id): member for member in Member.objects.using(alias).all()}
    pending = {}
    user_ids = {member.pk: user_id for user_id, member in members.items()}
    for row in Session.objects.using(alias).filter(time_in__isnull=False, time_out__isnull=True):
        if row.member_id in user_ids:
            pending.setdefault(user_ids[row.member_id], []).append(row)
    # Idempotent projection also supports a controlled roll-forward after an older
    # image recorded raw events without the new session table.
    Session.objects.using(alias).filter(is_open=True).update(is_open=False)
    zone = ZoneInfo("Asia/Manila")
    for event in (
        Audit.objects.using(alias).filter(action__in=["time_in", "time_out"]).order_by("created_at", "id").iterator()
    ):
        details = dict(event.details or {})
        if details.get("department") in departments:
            details["department_id"] = departments[details["department"]]
        user_id = str(details.get("employee_id") or event.actor_id)
        member = members.get(user_id)
        if event.action == "time_in":
            if Session.objects.using(alias).filter(time_in_event_id=event.pk).exists():
                continue
            row = Session.objects.using(alias).create(
                member=member,
                time_in_event=event,
                time_in=event.created_at,
                attendance_date=event.created_at.astimezone(zone).date(),
                arrangement="legacy",
                identity=details,
                legacy=True,
                needs_review=True,
                reason="Legacy: schedule unknown; Time Out not paired",
            )
            # A second Time In makes a sequential pair ambiguous. Only an explicit
            # matching timestamp can recover it; never invent an end timestamp.
            pending.setdefault(user_id, []).append(row)
            continue
        if Session.objects.using(alias).filter(time_out_event_id=event.pk).exists():
            continue
        candidates = [row for row in pending.get(user_id, []) if row.time_in <= event.created_at]
        explicit = details.get("timed_in_at")
        match = None
        if explicit:
            try:
                stamp = datetime.fromisoformat(explicit)
                match = next((row for row in candidates if row.time_in == stamp), None)
                # Older images wrote the audit just after the presence timestamp.
                # A single sequential candidate plus the recorded start is reliable;
                # keep the original audit timestamp untouched and use that recorded
                # start for the session. Multiple candidates remain ambiguous.
                if (
                    not match
                    and len(candidates) == 1
                    and stamp.tzinfo
                    and stamp <= candidates[0].time_in <= event.created_at
                ):
                    match = candidates[0]
                    match.time_in = stamp
                    match.attendance_date = stamp.astimezone(zone).date()
            except (ValueError, TypeError):
                pass
        elif len(candidates) == 1:
            match = candidates[0]
        if match and match.time_in <= event.created_at:
            match.time_out, match.time_out_event = event.created_at, event
            match.is_open = False
            match.reason = (
                "Legacy: schedule unknown"
                if match.legacy
                else "Recovered closure recorded by an older application version"
            )
            closure_reason = str(details.get("reason", ""))[:300]
            if closure_reason and closure_reason != "Manual":
                match.reason += f"; {closure_reason}"
                match.departure = "Exception"
            if not match.legacy:
                match.departure, match.needs_review = "Exception", True
            match.employee_reason = str(details.get("employee_reason", ""))[:500]
            match.save(using=alias)
            pending[user_id].remove(match)
        else:
            Session.objects.using(alias).create(
                member=member,
                time_out_event=event,
                time_out=event.created_at,
                attendance_date=event.created_at.astimezone(zone).date(),
                arrangement="legacy",
                identity=details,
                legacy=True,
                needs_review=True,
                reason="Legacy: Time In not paired",
            )
    for member in members.values():
        if not member.timed_in_at:
            continue
        row = (
            Session.objects.using(alias)
            .filter(member=member, time_in=member.timed_in_at, time_out__isnull=True)
            .first()
        )
        if not row:
            candidates = pending.get(str(member.user_id), [])
            if len(candidates) == 1 and member.timed_in_at <= candidates[0].time_in:
                row = candidates[0]
                row.time_in = member.timed_in_at
                row.attendance_date = member.timed_in_at.astimezone(zone).date()
                row.save(using=alias, update_fields=["time_in", "attendance_date"])
        if not row:
            row = Session.objects.using(alias).create(
                member=member,
                time_in=member.timed_in_at,
                attendance_date=member.timed_in_at.astimezone(zone).date(),
                arrangement="legacy",
                identity={"employee_id": str(member.user_id), "position": member.position},
                legacy=True,
                needs_review=True,
                reason="Legacy open session: schedule unknown",
            )
        row.is_open = True
        row.save(using=alias, update_fields=["is_open"])


class Migration(migrations.Migration):
    dependencies = [("db", "0133_office_attendance_sessions")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
