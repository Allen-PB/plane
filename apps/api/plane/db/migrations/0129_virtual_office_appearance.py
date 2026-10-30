from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0128_workflow")]
    operations = [
        migrations.AddField(
            model_name="virtualoffice",
            name="appearance_mode",
            field=models.CharField(
                max_length=9,
                default="automatic",
                choices=[("automatic", "Automatic"), ("day", "Day"), ("night", "Night")],
            ),
        ),
        migrations.AddConstraint(
            model_name="virtualoffice",
            constraint=models.CheckConstraint(
                condition=models.Q(appearance_mode__in=["automatic", "day", "night"]), name="vo_valid_appearance_mode"
            ),
        ),
    ]
