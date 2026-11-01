import importlib
from types import SimpleNamespace

from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import connection, transaction

from plane.db.models.virtual_office import OfficeAttendanceSession, VirtualOffice


class Command(BaseCommand):
    help = "Reconcile retained office audit events after rolling forward from an older application image."

    def handle(self, *args, **options):
        # Reuse the frozen importer so initial migration and rollback recovery
        # apply identical conservative pairing rules. No raw audit is rewritten.
        with transaction.atomic():
            VirtualOffice.objects.select_for_update().get(pk=1)
            before = OfficeAttendanceSession.objects.count()
            importer = importlib.import_module("plane.db.migrations.0134_office_legacy_sessions")
            importer.backfill(apps, SimpleNamespace(connection=connection))
            added = OfficeAttendanceSession.objects.count() - before
        self.stdout.write(
            self.style.SUCCESS(f"Office session projection reconciled; {added} rows added; audits retained.")
        )
