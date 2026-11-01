from django.urls import path
from plane.app.views.workspace.bulk_update import BulkUpdateEndpoint

urlpatterns = [
    path("workspaces/<str:slug>/bulk-update/", BulkUpdateEndpoint.as_view()),
]
