from plane.db.models.virtual_office import OfficeMember


def can_change_account_email(user):
    """Email ownership changes are restricted to active Office owners."""
    return bool(user.is_active) and OfficeMember.objects.filter(user=user, active=True, role="super_admin").exists()
