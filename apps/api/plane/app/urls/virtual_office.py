from django.urls import path

from plane.app.views.virtual_office import OfficeAdminView, OfficeStatusView, OfficeView

urlpatterns = [
    path("virtual-office/status/", OfficeStatusView.as_view()),
    path("virtual-office/", OfficeView.as_view()),
    path("virtual-office/admin/", OfficeAdminView.as_view()),
]
