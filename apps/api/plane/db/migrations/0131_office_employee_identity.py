from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.db.models.functions.text


DEPARTMENTS = {
    "Development": "Development",
    "Quality Assurance": "Quality & Systems",
    "Quality & Systems": "Quality & Systems",
    "Project Management": "Project Management",
    "UI/UX": "UI/UX",
    "Business Department": "Business, Sales & Marketing",
    "Business & Marketing": "Business, Sales & Marketing",
    "Business, Sales & Marketing": "Business, Sales & Marketing",
    "Account Managers": "Operations",
    "Operations": "Operations",
    "Leadership": "Leadership",
    "Chief": "Leadership",
}


def migrate_identity(apps, schema_editor):
    alias = schema_editor.connection.alias
    Department = apps.get_model("db", "OfficeDepartment")
    Member = apps.get_model("db", "OfficeMember")
    Profile = apps.get_model("db", "Profile")
    JobRole = apps.get_model("db", "OfficeJobRole")
    Audit = apps.get_model("db", "OfficeAudit")
    departments = list(Department.objects.using(alias).all())
    mapped = [DEPARTMENTS.get(d.name) for d in departments]
    if len(mapped) != 7 or None in mapped or len(set(mapped)) != 7:
        raise RuntimeError("PBS-9: review department mappings before migrating; expected seven recognized departments.")
    # Preserve primary keys, reservations and appearance order.
    for department, name in zip(departments, mapped):
        if department.name != name:
            Audit.objects.using(alias).create(
                office_id=1,
                action="identity_migration",
                details={"department_id": department.pk, "old_name": department.name, "new_name": name},
            )
            Department.objects.using(alias).filter(pk=department.pk).update(name=name)
    for member in Member.objects.using(alias).select_related("user").order_by("pk").iterator():
        profile, _ = Profile.objects.using(alias).get_or_create(user_id=member.user_id)
        old_profile_role = profile.role
        title = (member.position or "").strip() or (profile.role or "").strip()
        job_role = None
        if member.department_id and title:
            job_role = (
                JobRole.objects.using(alias).filter(department_id=member.department_id, name__iexact=title).first()
            )
            if job_role is None:
                job_role = JobRole.objects.using(alias).create(department_id=member.department_id, name=title)
        Profile.objects.using(alias).filter(pk=profile.pk).update(
            office_department_id=member.department_id,
            office_job_role_id=job_role.pk if job_role else None,
            role=job_role.name if job_role else old_profile_role,
        )
        Member.objects.using(alias).filter(pk=member.pk).update(job_role_id=job_role.pk if job_role else None)
        # Keep effective position intact for any open session; refresh it at next Time In.
        Audit.objects.using(alias).create(
            office_id=1,
            action="identity_migration",
            details={
                "member_id": str(member.pk),
                "old_position": member.position,
                "old_profile_role": old_profile_role,
                "job_role_id": job_role.pk if job_role else None,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("db", "0130_structured_updates"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="OfficeJobRole",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=300)),
                ("archived", models.BooleanField(default=False)),
                (
                    "department",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT, related_name="job_roles", to="db.officedepartment"
                    ),
                ),
            ],
            options={
                "db_table": "office_job_roles",
                "ordering": ["department__order", "name", "id"],
                "constraints": [
                    models.UniqueConstraint(
                        django.db.models.functions.text.Lower("name"),
                        models.F("department"),
                        name="vo_department_role_name",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="OfficeNotice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("message", models.CharField(max_length=600)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "office_notices", "ordering": ["-created_at", "-id"]},
        ),
        migrations.AddField(
            model_name="profile",
            name="office_department",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="db.officedepartment"
            ),
        ),
        migrations.AddField(
            model_name="profile",
            name="office_job_role",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="db.officejobrole"
            ),
        ),
        migrations.AddField(
            model_name="officemember",
            name="job_role",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="db.officejobrole"
            ),
        ),
        migrations.AlterField(
            model_name="officemember", name="position", field=models.CharField(blank=True, max_length=300)
        ),
        migrations.RunPython(migrate_identity, migrations.RunPython.noop),
    ]
