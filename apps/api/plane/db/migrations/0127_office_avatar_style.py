from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0126_virtual_office")]
    operations = [
        migrations.AddField(
            model_name="officemember",
            name="avatar_style",
            field=models.CharField(choices=[("male", "Male"), ("female", "Female")], default="male", max_length=10),
        )
    ]
