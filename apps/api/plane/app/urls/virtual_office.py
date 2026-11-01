from django.urls import path

from plane.app.views.virtual_office import OfficeAdminView, OfficePresenceExportView, OfficeStatusView, OfficeView
from plane.app.views.office_identity import OfficeIdentityView, OfficeJobRoleView, OfficeNoticeReadView
from plane.app.views.office_schedules import OfficeScheduleView, OfficeScheduleDecisionView

urlpatterns = [
    path("virtual-office/schedule/", OfficeScheduleView.as_view()),
    path("virtual-office/schedule-requests/<int:pk>/decision/", OfficeScheduleDecisionView.as_view()),
    path("virtual-office/profile/", OfficeIdentityView.as_view()),
    path("virtual-office/job-roles/", OfficeJobRoleView.as_view()),
    path("virtual-office/notices/<int:pk>/read/", OfficeNoticeReadView.as_view()),
    path("virtual-office/status/", OfficeStatusView.as_view()),
    path("virtual-office/", OfficeView.as_view()),
    path("virtual-office/admin/", OfficeAdminView.as_view()),
    path("virtual-office/records.csv", OfficePresenceExportView.as_view()),
]
