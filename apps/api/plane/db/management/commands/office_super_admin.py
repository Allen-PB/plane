"""Explicit, operator-only bootstrap; god-mode never grants office access."""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from plane.db.models import User
from plane.db.models.virtual_office import OfficeAudit, OfficeMember, VirtualOffice


class Command(BaseCommand):
    help = "Grant Virtual Office Super Admin to an existing Sync account (operator action)."

    def add_arguments(self, parser):
        parser.add_argument("email")

    @transaction.atomic
    def handle(self, *args, **options):
        VirtualOffice.objects.select_for_update().get(pk=1)
        user = User.objects.filter(email__iexact=options["email"], is_active=True, is_bot=False).first()
        if not user:
            raise CommandError("An existing active Sync account is required.")
        member, _ = OfficeMember.objects.update_or_create(
            user=user, defaults={"office_id": 1, "role": "super_admin", "active": True}
        )
        OfficeAudit.objects.create(
            office_id=1, actor=user, action="operator_super_admin", details={"member_id": str(member.id)}
        )
        self.stdout.write(self.style.SUCCESS("Virtual Office Super Admin granted."))
