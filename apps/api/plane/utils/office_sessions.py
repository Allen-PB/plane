from datetime import timedelta

from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from plane.db.models.virtual_office import OfficeAttendanceSession, OfficeShiftOccurrence
from plane.utils.office_schedules import OFFICE_ZONE, latest_policy, shift_bounds


def shift_choices(member, now=None):
    now = now or timezone.now()
    today = now.astimezone(OFFICE_ZONE).date()
    latest = latest_policy(member)
    if not latest or latest.arrangement != "scheduled":
        return []
    choices = []
    policies = list(member.work_policies.all())
    frozen = {
        shift.date: shift
        for shift in member.shift_occurrences.filter(date__range=(today - timedelta(days=1), today + timedelta(days=1)))
    }
    for day in (today - timedelta(days=1), today, today + timedelta(days=1)):
        shift = frozen.get(day)
        if shift:
            start, end, policy = shift.expected_start, shift.expected_end, shift.policy
        else:
            policy = None
            for candidate in policies:
                entry = next((item for item in candidate.schedule if item["day"] == day.weekday()), None)
                if candidate.arrangement != "scheduled":
                    # An intervening output-based version ends older schedules.
                    if candidate.effective_from <= now:
                        break
                    continue
                if entry:
                    lower, upper = shift_bounds(entry, day)
                    if candidate.effective_from <= lower:
                        start, end, policy = lower, upper, candidate
                        break
                elif candidate.effective_from.astimezone(OFFICE_ZONE).date() <= day:
                    break
            if policy is None:
                continue
        if day < today and not (start <= now < end):
            continue
        choices.append(
            {"date": day.isoformat(), "expected_start": start, "expected_end": end, "policy": policy, "shift": shift}
        )
    choices.sort(key=lambda item: (abs((item["expected_start"] - now).total_seconds()), item["date"]))
    return choices


def start_session(member, event, identity, selected_date=None):
    """Caller owns the office lock; snapshot before any later identity/policy edit."""
    now = member.timed_in_at
    policy = latest_policy(member)
    arrangement = policy.arrangement if policy else "unconfigured"
    choices = shift_choices(member, now)
    shift = None
    state = ""
    if arrangement == "scheduled":
        today = now.astimezone(OFFICE_ZONE).date()
        unscheduled_today = selected_date == today and not any(item["date"] == today.isoformat() for item in choices)
        if unscheduled_today:
            state = "Non-working day"
        elif choices:
            choice = next((item for item in choices if item["date"] == str(selected_date)), None)
            if not choice:
                raise ValidationError("Select a scheduled shift from the current choices before Time In.")
            shift = choice["shift"]
            if not shift:
                shift = OfficeShiftOccurrence.objects.create(
                    member=member,
                    date=selected_date,
                    policy=choice["policy"],
                    expected_start=choice["expected_start"],
                    expected_end=choice["expected_end"],
                )
        else:
            if selected_date:
                raise ValidationError("The selected shift is no longer available. Refresh and try again.")
            state = "Non-working day"
    elif selected_date:
        raise ValidationError("This attendance arrangement does not use scheduled shifts.")
    if arrangement == "unconfigured":
        state = "Arrangement not configured"
    arrival = (
        ("Early" if now < shift.expected_start else "Late" if now > shift.expected_start else "On Time")
        if shift
        else state
    )
    return OfficeAttendanceSession.objects.create(
        member=member,
        shift=shift,
        time_in_event=event,
        time_in=now,
        attendance_date=shift.date if shift else now.astimezone(OFFICE_ZONE).date(),
        arrangement=arrangement,
        identity=identity,
        arrival=arrival,
        needs_review=bool(state),
        reason=state,
        is_open=True,
    )


def current_session(member):
    return member.attendance_sessions.filter(is_open=True).select_related("shift").first()


def finish_session(member, event, ended_at, reason, employee_reason=""):
    session = current_session(member)
    if not session:
        # Safety for an already-open session created by an older application image.
        from plane.utils.office_attendance import presence_details

        session = OfficeAttendanceSession.objects.create(
            member=member,
            time_in=member.timed_in_at,
            attendance_date=member.timed_in_at.astimezone(OFFICE_ZONE).date(),
            arrangement="legacy",
            identity=presence_details(member),
            legacy=True,
            needs_review=True,
            reason="Legacy session: schedule unknown",
        )
    session.time_out, session.time_out_event = ended_at, event
    session.is_open = False
    session.employee_reason = employee_reason
    if reason != "Manual":
        session.departure, session.needs_review, session.reason = "Exception", True, reason
    elif not session.legacy and session.shift:
        end = session.shift.expected_end
        session.departure = "Undertime" if ended_at < end else "Overtime" if ended_at > end else "On Time"
        if session.departure == "Overtime":
            session.needs_review = True
    session.save()
    return session


def session_data(session, now=None):
    if not session:
        return None
    duration = (
        max(0, int(((session.time_out or now or timezone.now()) - session.time_in).total_seconds()))
        if session.time_in and (session.time_out or session.is_open)
        else None
    )
    return {
        "id": session.pk,
        "time_in": session.time_in,
        "time_out": session.time_out,
        "attendance_date": session.attendance_date,
        "arrangement": session.arrangement,
        "expected_start": session.shift.expected_start if session.shift else None,
        "expected_end": session.shift.expected_end if session.shift else None,
        "arrival": session.arrival,
        "departure": session.departure,
        "needs_review": session.needs_review,
        "reason": session.reason,
        "employee_reason": session.employee_reason,
        "legacy": session.legacy,
        "duration_seconds": duration,
        "in_progress": session.is_open,
    }


def attendance_data(member):
    active = current_session(member)
    latest = (
        active
        or member.attendance_sessions.select_related("shift")
        .order_by(Coalesce("time_in", "time_out").desc(), "-id")
        .first()
    )
    choices = shift_choices(member) if not member.timed_in_at else []
    return {
        "session": session_data(latest),
        "choices": [{key: value for key, value in item.items() if key not in ("policy", "shift")} for item in choices],
        "suggested_date": choices[0]["date"] if choices else None,
    }
