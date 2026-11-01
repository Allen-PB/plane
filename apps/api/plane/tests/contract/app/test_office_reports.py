from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from plane.db.models.virtual_office import OfficeAttendanceReport, OfficeAttendanceSession
from plane.tests.contract.app.test_virtual_office import client, new_member
from plane.tests.contract.app.test_virtual_office import office as office_fixture, no_tasks as no_tasks_fixture

office, no_tasks = office_fixture, no_tasks_fixture
pytestmark = [pytest.mark.contract, pytest.mark.django_db]
URL = "/api/virtual-office/attendance/reports/"
FILTERS = {"start_date": "2026-11-02", "end_date": "2026-11-02"}
STAMP = datetime(2026, 11, 2, 22, tzinfo=ZoneInfo("Asia/Manila"))


def row(member, **extra):
    return OfficeAttendanceSession.objects.create(
        member=member,
        time_in=STAMP,
        time_out=STAMP + timedelta(hours=8),
        attendance_date=STAMP.date(),
        arrangement="scheduled",
        identity={
            "employee_name": "=DANGER()",
            "department": "Original department",
            "department_id": member.department_id,
            "position": "Original role",
            "email": "person@example.test",
        },
        **extra,
    )


def test_employees_and_plane_superusers_cannot_read_or_export_reports(office):
    employee, admin = new_member(), new_member("admin")
    employee.user.is_superuser = True
    employee.user.save()
    assert client(employee).post(URL, FILTERS).status_code == 403
    created = client(admin).post(URL, FILTERS).data
    assert client(employee).get(URL + created["id"] + "/").status_code == 403
    assert client(employee).get(URL + created["id"] + "/export.csv").status_code == 403
    another_admin = new_member("admin")
    assert client(another_admin).get(URL + created["id"] + "/export.csv").status_code == 404


def test_snapshot_frozen_all_rows_exports_and_historical_identity(office):
    employee, admin = new_member(), new_member("admin")
    for _ in range(53):
        row(employee, employee_reason="Appointment, then family\nSecond line")
    api = client(admin)
    result = api.post(URL, {**FILTERS, "department_id": employee.department_id})
    assert result.status_code == 200
    report = result.data
    assert len(report["rows"]) == 53
    assert report["rows"][0]["attendance_date"] == "2026-11-02"
    assert report["rows"][0]["time_out"].startswith("2026-11-03T06:00:00")
    assert report["rows"][0]["position"] == "Original role"
    row(employee)
    employee.position = "Changed role"
    employee.save()
    assert api.get(URL + report["id"] + "/").data["rows"] == report["rows"]
    response = api.get(URL + report["id"] + "/export.csv")
    assert response.status_code == 200 and response["Cache-Control"] == "no-store"
    content = b"".join(response.streaming_content).decode("utf-8-sig")
    import csv
    import io

    values = list(csv.DictReader(io.StringIO(content)))
    assert len(values) == 53
    assert all(item["Employee"] == "'=DANGER()" for item in values)
    assert values[-1]["Employee departure reason"] == "Appointment, then family\nSecond line"


def test_report_access_rechecks_revocation_and_expiry(office):
    admin = new_member("super_admin")
    api = client(admin)
    report = api.post(URL, FILTERS).data
    OfficeAttendanceReport.objects.filter(pk=report["id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert api.get(URL + report["id"] + "/export.csv").status_code == 410
    admin.active = False
    admin.save()
    assert api.get(URL + report["id"] + "/").status_code == 403


def test_report_date_validation_and_filtering(office):
    employee, admin = new_member(), new_member("admin")
    row(employee)
    api = client(admin)
    assert api.post(URL, {"start_date": "2026-11-03", "end_date": "2026-11-02"}).status_code == 400
    assert api.post(URL, {"start_date": "2020-01-01", "end_date": "2026-11-02"}).status_code == 400
    result = api.post(URL, {**FILTERS, "member_id": str(admin.pk)})
    assert result.data["rows"] == []
    assert api.post(URL, {"start_date": "2026-11-03", "end_date": "2026-11-03"}).data["rows"] == []


def test_open_duration_is_frozen_at_report_generation(office):
    employee, admin = new_member(), new_member("admin")
    OfficeAttendanceSession.objects.create(
        member=employee, time_in=STAMP, attendance_date=STAMP.date(), arrangement="output_based", is_open=True
    )
    with patch("django.utils.timezone.now", return_value=STAMP + timedelta(hours=2)):
        report = client(admin).post(URL, FILTERS).data
    assert report["rows"][0]["duration_seconds"] == 7200
    assert report["rows"][0]["in_progress"] is True


def test_direct_report_request_applies_overdue_48_hour_cutoff(office):
    employee, admin = new_member(), new_member("admin")
    employee.timed_in_at = STAMP
    employee.save()
    OfficeAttendanceSession.objects.create(
        member=employee, time_in=STAMP, attendance_date=STAMP.date(), arrangement="output_based", is_open=True
    )
    with patch("django.utils.timezone.now", return_value=STAMP + timedelta(hours=50)):
        response = client(admin).post(URL, FILTERS)
    assert response.status_code == 200
    record = response.data["rows"][0]
    assert record["duration_seconds"] == 48 * 3600
    assert record["departure"] == "Exception" and record["in_progress"] is False and record["needs_review"]
