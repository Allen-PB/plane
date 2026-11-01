from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest

from plane.db.models.virtual_office import OfficeAttendanceSession, OfficeAudit, OfficeDesk
from plane.tests.contract.app.test_virtual_office import client, new_member, post
from plane.tests.contract.app.test_virtual_office import office as office_fixture, no_tasks as no_tasks_fixture
from plane.utils.office_attendance import close_attendance, expire_attendance
from plane.utils.office_schedules import publish_policy
from plane.utils.office_sessions import shift_choices

office, no_tasks = office_fixture, no_tasks_fixture
pytestmark = [pytest.mark.contract, pytest.mark.django_db]
ZONE = ZoneInfo("Asia/Manila")
START = datetime(2026, 11, 2, 9, tzinfo=ZONE)
SCHEDULE = [{"day": 0, "start": "09:00", "end": "18:00", "ends_next_day": False}]


def setup_employee(arrangement="scheduled", schedule=SCHEDULE):
    member = new_member()
    desk = OfficeDesk.objects.filter(department=member.department, member__isnull=True).first()
    desk.member = member
    desk.save()
    with patch("django.utils.timezone.now", return_value=START - timedelta(hours=1)):
        publish_policy(member, member.user, arrangement, schedule)
    return member


@pytest.mark.parametrize("offset,arrival", [(-60, "Early"), (0, "On Time"), (1, "Late")])
def test_server_clock_arrival_no_grace_or_backdating(office, offset, arrival):
    member = setup_employee()
    stamp = START + timedelta(seconds=offset)
    with patch("django.utils.timezone.now", return_value=stamp):
        assert post(client(member), "time_in", shift_date="2026-11-02", time_in="2000-01-01").status_code == 200
    row = OfficeAttendanceSession.objects.get(member=member)
    assert row.time_in == stamp and row.arrival == arrival and row.is_open
    assert row.identity["position"] == "Engineer"


def test_early_exit_requires_confirmation_and_preserves_optional_reason(office):
    member = setup_employee()
    api = client(member)
    with patch("django.utils.timezone.now", return_value=START):
        assert post(api, "time_in", shift_date="2026-11-02").status_code == 200
    with patch("django.utils.timezone.now", return_value=START + timedelta(hours=1)):
        assert post(api, "time_out").status_code == 409
    assert not OfficeAudit.objects.filter(action="time_out").exists()
    member.refresh_from_db()
    assert member.timed_in_at == START
    confirmed_at = START + timedelta(hours=2)
    with patch("django.utils.timezone.now", return_value=confirmed_at):
        assert post(api, "time_out", confirmed=True, employee_reason="Medical appointment").status_code == 200
    row = OfficeAttendanceSession.objects.get(member=member)
    assert row.time_out == confirmed_at and row.departure == "Undertime" and not row.is_open
    assert row.employee_reason == "Medical appointment"


@pytest.mark.parametrize("offset,departure,review", [(0, "On Time", False), (1, "Overtime", True)])
def test_departure_classification_and_elapsed_duration(office, offset, departure, review):
    member = setup_employee()
    with patch("django.utils.timezone.now", return_value=START):
        assert post(client(member), "time_in", shift_date="2026-11-02").status_code == 200
    with patch("django.utils.timezone.now", return_value=START + timedelta(hours=9, seconds=offset)):
        assert post(client(member), "time_out").status_code == 200
    row = OfficeAttendanceSession.objects.get(member=member)
    assert row.departure == departure and row.needs_review == review
    assert (row.time_out - row.time_in).total_seconds() == 9 * 3600 + offset


def test_same_shift_reentry_keeps_frozen_schedule_after_edit(office):
    member = setup_employee()
    api = client(member)
    with patch("django.utils.timezone.now", return_value=START):
        post(api, "time_in", shift_date="2026-11-02")
    with patch("django.utils.timezone.now", return_value=START + timedelta(hours=1)):
        post(api, "time_out", confirmed=True)
        publish_policy(member, member.user, "scheduled", [{**SCHEDULE[0], "end": "12:00"}])
    with patch("django.utils.timezone.now", return_value=START + timedelta(hours=2)):
        assert post(api, "time_in", shift_date="2026-11-02").status_code == 200
    rows = list(member.attendance_sessions.order_by("id"))
    assert len(rows) == 2 and rows[0].shift_id == rows[1].shift_id
    assert rows[1].shift.expected_end == START + timedelta(hours=9)


def test_output_based_and_forced_closure_have_distinct_rules(office):
    member = setup_employee("output_based", [])
    with patch("django.utils.timezone.now", return_value=START):
        assert post(client(member), "time_in").status_code == 200
        member.refresh_from_db()
        close_attendance(member, "Administrator revoked office access", START + timedelta(hours=1))
    row = OfficeAttendanceSession.objects.get(member=member)
    assert row.arrival == "" and row.departure == "Exception" and row.needs_review


def test_overnight_previous_day_only_while_active_and_shift_date_preserved(office):
    schedule = [{"day": 0, "start": "22:00", "end": "06:00", "ends_next_day": True}]
    member = setup_employee(schedule=schedule)
    with patch("django.utils.timezone.now", return_value=START + timedelta(hours=16)):
        choices = shift_choices(member)
        assert [item["date"] for item in choices] == ["2026-11-02"]
        assert post(client(member), "time_in", shift_date="2026-11-02").status_code == 200
    with patch("django.utils.timezone.now", return_value=START + timedelta(hours=21)):
        post(client(member), "time_out")
        assert not shift_choices(member)
    row = OfficeAttendanceSession.objects.get(member=member)
    assert str(row.attendance_date) == "2026-11-02" and row.departure == "On Time"


def test_nonworking_day_and_unconfigured_recording_require_review(office):
    member = setup_employee()
    with patch("django.utils.timezone.now", return_value=START + timedelta(days=1)):
        assert post(client(member), "time_in").status_code == 200
    row = OfficeAttendanceSession.objects.get(member=member)
    assert row.arrival == "Non-working day" and row.needs_review


def test_48_hour_closure_is_exception_with_exact_cutoff(office):
    member = setup_employee()
    with patch("django.utils.timezone.now", return_value=START):
        post(client(member), "time_in", shift_date="2026-11-02")
    with patch("django.utils.timezone.now", return_value=START + timedelta(hours=50)):
        assert expire_attendance() == 1
    row = OfficeAttendanceSession.objects.get(member=member)
    assert row.time_out == START + timedelta(hours=48)
    assert row.departure == "Exception" and row.arrival == "On Time" and row.needs_review


def test_legacy_backfill_pairs_only_reliable_events_and_preserves_audit(office):
    import importlib
    from django.apps import apps
    from django.db import connection

    member = new_member()
    first = OfficeAudit.objects.create(
        office_id=1,
        actor=member.user,
        action="time_in",
        details={"employee_id": str(member.user_id), "position": "Historical title"},
    )
    second = OfficeAudit.objects.create(
        office_id=1,
        actor=member.user,
        action="time_out",
        details={"employee_id": str(member.user_id), "timed_in_at": START.isoformat()},
    )
    orphan = OfficeAudit.objects.create(
        office_id=1, actor=member.user, action="time_out", details={"employee_id": str(member.user_id)}
    )
    for event, stamp in [
        (first, START + timedelta(milliseconds=20)),
        (second, START + timedelta(hours=8)),
        (orphan, START + timedelta(hours=9)),
    ]:
        OfficeAudit.objects.filter(pk=event.pk).update(created_at=stamp)
    before = list(OfficeAudit.objects.values("id", "created_at", "details"))
    importlib.import_module("plane.db.migrations.0134_office_legacy_sessions").backfill(
        apps, type("Editor", (), {"connection": connection})()
    )
    assert list(OfficeAudit.objects.values("id", "created_at", "details")) == before
    pair = OfficeAttendanceSession.objects.get(time_in_event=first)
    assert pair.time_out_event_id == second.pk and pair.legacy and pair.needs_review
    assert pair.time_in == START
    assert pair.identity["position"] == "Historical title" and pair.arrival == pair.departure == ""
    missing = OfficeAttendanceSession.objects.get(time_out_event=orphan)
    assert missing.time_in is None and not missing.is_open
    count = OfficeAttendanceSession.objects.count()
    importlib.import_module("plane.db.migrations.0134_office_legacy_sessions").backfill(
        apps, type("Editor", (), {"connection": connection})()
    )
    assert OfficeAttendanceSession.objects.count() == count


def test_roll_forward_reconciles_old_image_closure_without_losing_new_snapshot(office):
    from django.core.management import call_command

    member = setup_employee()
    with patch("django.utils.timezone.now", return_value=START):
        post(client(member), "time_in", shift_date="2026-11-02")
    event = OfficeAudit.objects.create(
        office_id=1,
        actor=member.user,
        action="time_out",
        details={"employee_id": str(member.user_id), "timed_in_at": START.isoformat(), "reason": "Manual"},
    )
    OfficeAudit.objects.filter(pk=event.pk).update(created_at=START + timedelta(hours=1))
    member.timed_in_at = member.last_seen_at = None
    member.save()
    call_command("reconcile_office_sessions")
    session = OfficeAttendanceSession.objects.get(member=member)
    assert not session.is_open and session.time_out_event_id == event.pk
    assert session.departure == "Exception" and session.needs_review
    assert session.identity["position"] == "Engineer" and session.shift.expected_start == START
    call_command("reconcile_office_sessions")
    assert OfficeAttendanceSession.objects.filter(member=member).count() == 1
