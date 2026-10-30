import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_office(apps, schema_editor):
    alias = schema_editor.connection.alias
    apps.get_model("db", "VirtualOffice").objects.using(alias).create(id=1)
    departments = [
        ("Development", 10, "#4775e7"),
        ("Quality Assurance", 5, "#21a68d"),
        ("Project Management", 5, "#a576dc"),
        ("UI/UX", 3, "#e39252"),
        ("Business Department", 7, "#dc729b"),
        ("Account Managers", 5, "#39a9c0"),
        ("Leadership", 4, "#d5ad3d"),
    ]
    for order, (name, count, color) in enumerate(departments):
        department = (
            apps.get_model("db", "OfficeDepartment")
            .objects.using(alias)
            .create(office_id=1, name=name, color=color, order=order)
        )
        apps.get_model("db", "OfficeDesk").objects.using(alias).bulk_create(
            [apps.get_model("db", "OfficeDesk")(department=department, number=number) for number in range(1, count + 1)]
        )


class Migration(migrations.Migration):
    dependencies = [("db", "0125_csvimport"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="VirtualOffice",
            fields=[
                ("id", models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False, serialize=False)),
                ("name", models.CharField(max_length=120, default="PathBuilder Virtual Office")),
            ],
            options={
                "db_table": "virtual_offices",
                "constraints": [models.CheckConstraint(condition=models.Q(id=1), name="vo_single_office")],
            },
        ),
        migrations.CreateModel(
            name="OfficeDepartment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80, unique=True)),
                ("color", models.CharField(max_length=7)),
                ("order", models.PositiveSmallIntegerField(unique=True)),
                ("office", models.ForeignKey(to="db.virtualoffice", on_delete=django.db.models.deletion.CASCADE)),
            ],
            options={"db_table": "office_departments", "ordering": ["order"]},
        ),
        migrations.CreateModel(
            name="OfficeMember",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                (
                    "role",
                    models.CharField(
                        max_length=20,
                        choices=[("super_admin", "Super Admin"), ("admin", "Admin"), ("employee", "Employee")],
                        default="employee",
                    ),
                ),
                ("position", models.CharField(max_length=120, blank=True)),
                ("active", models.BooleanField(default=True)),
                ("timed_in_at", models.DateTimeField(null=True, blank=True)),
                ("last_seen_at", models.DateTimeField(null=True, blank=True)),
                (
                    "department",
                    models.ForeignKey(
                        to="db.officedepartment", null=True, blank=True, on_delete=django.db.models.deletion.PROTECT
                    ),
                ),
                ("office", models.ForeignKey(to="db.virtualoffice", on_delete=django.db.models.deletion.CASCADE)),
                (
                    "user",
                    models.OneToOneField(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.CASCADE),
                ),
            ],
            options={
                "db_table": "office_members",
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(role__in=["super_admin", "admin", "employee"]), name="vo_valid_role"
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="OfficeDesk",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("number", models.PositiveSmallIntegerField()),
                (
                    "department",
                    models.ForeignKey(to="db.officedepartment", on_delete=django.db.models.deletion.PROTECT),
                ),
                (
                    "member",
                    models.OneToOneField(
                        to="db.officemember",
                        null=True,
                        blank=True,
                        related_name="desk",
                        on_delete=django.db.models.deletion.SET_NULL,
                    ),
                ),
            ],
            options={
                "db_table": "office_desks",
                "ordering": ["department__order", "number"],
                "constraints": [
                    models.UniqueConstraint(fields=("department", "number"), name="vo_department_desk_number")
                ],
            },
        ),
        migrations.CreateModel(
            name="OfficeAudit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=40)),
                ("details", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        to=settings.AUTH_USER_MODEL, null=True, on_delete=django.db.models.deletion.SET_NULL
                    ),
                ),
                ("office", models.ForeignKey(to="db.virtualoffice", on_delete=django.db.models.deletion.PROTECT)),
            ],
            options={"db_table": "office_audit", "ordering": ["-created_at", "-id"]},
        ),
        migrations.RunPython(seed_office, migrations.RunPython.noop),
    ]
