import csv
import io
from datetime import timedelta

from django.db import transaction
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.db.models.virtual_office import OfficeAttendanceReport, OfficeAttendanceSession, OfficeMember, VirtualOffice
from plane.utils.office_schedules import OFFICE_ZONE
from plane.utils.office_attendance import expire_attendance
from plane.utils.office_sessions import session_data

COLUMNS = [
    ("attendance_date", "Attendance date"),
    ("employee_name", "Employee"),
    ("email", "Email"),
    ("department", "Department"),
    ("position", "Job role"),
    ("desk", "Workstation"),
    ("arrangement", "Arrangement"),
    ("expected_start", "Scheduled start (Asia/Manila)"),
    ("expected_end", "Scheduled end (Asia/Manila)"),
    ("time_in", "Time In (Asia/Manila)"),
    ("time_out", "Time Out (Asia/Manila)"),
    ("duration_seconds", "Duration (seconds)"),
    ("arrival", "Arrival"),
    ("departure", "Departure"),
    ("needs_review", "Needs review"),
    ("reason", "Review / closure reason"),
    ("employee_reason", "Employee departure reason"),
    ("legacy", "Legacy"),
    ("in_progress", "In progress"),
]


def require_admin(user):
    if not OfficeMember.objects.filter(
        user=user, user__is_active=True, active=True, role__in=["admin", "super_admin"]
    ).exists():
        raise PermissionDenied("Office administrator access required.")


class ReportFilterSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    member_id = serializers.UUIDField(required=False)
    department_id = serializers.IntegerField(min_value=1, required=False)

    def validate(self, data):
        if not 0 <= (data["end_date"] - data["start_date"]).days <= 366:
            raise ValidationError("Select a date range of up to 367 days, with the start before the end.")
        return data


def report_data(snapshot):
    return {
        "id": str(snapshot.pk),
        "filters": snapshot.filters,
        "rows": snapshot.rows,
        "generated_at": snapshot.generated_at,
        "expires_at": snapshot.expires_at,
        "timezone": "Asia/Manila",
        "columns": COLUMNS,
    }


class OfficeReportsView(BaseAPIView):
    authentication_classes = [SessionAuthentication]

    def post(self, request):
        require_admin(request.user)
        serializer = ReportFilterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        filters = serializer.validated_data
        with transaction.atomic():
            # Match attendance's lock order: the snapshot has one consistent cutoff
            # even if a Time Out or access revocation is happening concurrently.
            get_object_or_404(VirtualOffice.objects.select_for_update(), pk=1)
            require_admin(request.user)
            now = timezone.now()
            expire_attendance(now)
            OfficeAttendanceReport.objects.filter(expires_at__lte=now).delete()
            if OfficeAttendanceReport.objects.filter(owner=request.user).count() >= 10:
                raise ValidationError("You already have ten active reports. Reuse one or wait for expiry.")
            query = OfficeAttendanceSession.objects.select_related("shift").filter(
                attendance_date__range=(filters["start_date"], filters["end_date"])
            )
            if filters.get("member_id"):
                query = query.filter(member_id=filters["member_id"])
            if filters.get("department_id"):
                query = query.filter(identity__department_id=filters["department_id"])
            sessions = list(query.order_by("attendance_date", "time_in", "id")[:10001])
            if len(sessions) > 10000:
                raise ValidationError("More than 10,000 matching sessions. Narrow the filters; no rows were omitted.")
            rows = []
            for session in sessions:
                row = session_data(session, now)
                for key in ("employee_name", "email", "department", "position", "desk"):
                    row[key] = session.identity.get(key, "")
                for key in ("time_in", "time_out", "expected_start", "expected_end"):
                    stamp = row[key]
                    row[key] = stamp.astimezone(OFFICE_ZONE).isoformat(timespec="seconds") if stamp else ""
                row["attendance_date"] = str(row["attendance_date"])
                rows.append(row)
            stored_filters = {key: value if key == "department_id" else str(value) for key, value in filters.items()}
            snapshot = OfficeAttendanceReport.objects.create(
                owner=request.user,
                filters=stored_filters,
                rows=rows,
                generated_at=now,
                expires_at=now + timedelta(hours=1),
            )
        response = Response(report_data(snapshot))
        response["Cache-Control"] = "no-store"
        return response


class ExpiredReport(APIException):
    status_code = 410
    default_detail = "This report expired. Generate a fresh report before viewing or downloading it."


def authorized_snapshot(user, pk):
    require_admin(user)
    report = get_object_or_404(OfficeAttendanceReport, pk=pk, owner=user)
    if report.expires_at <= timezone.now():
        raise ExpiredReport()
    return report


class OfficeReportView(BaseAPIView):
    authentication_classes = [SessionAuthentication]

    def get(self, request, pk):
        response = Response(report_data(authorized_snapshot(request.user, pk)))
        response["Cache-Control"] = "no-store"
        return response


class OfficeReportCSVView(BaseAPIView):
    authentication_classes = [SessionAuthentication]

    def get(self, request, pk):
        snapshot = authorized_snapshot(request.user, pk)

        def lines():
            yield "\ufeff"
            buffer = io.StringIO(newline="")
            writer = csv.writer(buffer)
            metadata_titles = ["Report start date", "Report end date", "Report timezone", "Report generated at"]
            writer.writerow(metadata_titles + [title for _, title in COLUMNS])
            yield buffer.getvalue()
            for row in snapshot.rows:
                buffer.seek(0)
                buffer.truncate(0)
                values = []
                for key, _ in COLUMNS:
                    value = "" if row.get(key) is None else str(row.get(key))
                    if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
                        value = "'" + value
                    values.append(value)
                writer.writerow(
                    [
                        snapshot.filters["start_date"],
                        snapshot.filters["end_date"],
                        "Asia/Manila",
                        snapshot.generated_at.astimezone(OFFICE_ZONE).isoformat(timespec="seconds"),
                    ]
                    + values
                )
                yield buffer.getvalue()

        response = StreamingHttpResponse(lines(), content_type="text/csv; charset=utf-8")
        generated = snapshot.generated_at.astimezone(OFFICE_ZONE).strftime("%Y%m%dT%H%M%S")
        filename = (
            f"attendance-{snapshot.filters['start_date']}_{snapshot.filters['end_date']}-"
            f"{generated}-Manila-{snapshot.pk}.csv"
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
