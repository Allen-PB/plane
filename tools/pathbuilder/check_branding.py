"""Regression checks against the upstream v1.4.2 source; no database required."""
import ast
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def upstream(path):
    relative = path.relative_to(ROOT).as_posix()
    return subprocess.check_output(
        ["git", "show", f"v1.4.2:{relative}"], cwd=ROOT, text=True
    )


def strings(value, prefix=()):
    if isinstance(value, dict):
        return {key: text for name, child in value.items() for key, text in strings(child, prefix + (name,)).items()}
    if isinstance(value, list):
        return {key: text for index, child in enumerate(value) for key, text in strings(child, prefix + (index,)).items()}
    return {prefix: value}


class BrandingRegressionTests(unittest.TestCase):
    def test_translation_keys_and_placeholders_survive(self):
        paths = sorted((ROOT / "packages/i18n/src/locales").rglob("*.json"))
        self.assertGreater(len(paths), 100)
        for path in paths:
            with self.subTest(file=path.relative_to(ROOT)):
                before = strings(json.loads(upstream(path)))
                after = strings(json.loads(path.read_text()))
                self.assertEqual(before.keys(), after.keys())
                for key in before:
                    if isinstance(before[key], str):
                        self.assertEqual(
                            re.findall(r"\{+[^{}]*\}+", before[key]),
                            re.findall(r"\{+[^{}]*\}+", after[key]),
                            str(key),
                        )

    def test_email_template_control_flow_survives(self):
        paths = list((ROOT / "apps/api/templates/emails").rglob("*.html"))
        for path in paths:
            with self.subTest(file=path.relative_to(ROOT)):
                before, after = upstream(path), path.read_text()
                self.assertEqual(
                    re.findall(r"\{[{%].*?[%}]\}", before, re.S),
                    re.findall(r"\{[{%].*?[%}]\}", after, re.S),
                )
                self.assertNotIn("https://media.docs.plane.so/logo/new-logo-", after)

    def test_python_email_changes_preserve_expressions(self):
        paths = list((ROOT / "apps/api/plane/bgtasks").glob("*.py"))
        for path in paths:
            before, after = ast.parse(upstream(path)), ast.parse(path.read_text())
            expressions = lambda tree: [ast.dump(node.value) for node in ast.walk(tree) if isinstance(node, ast.FormattedValue)]
            self.assertEqual(expressions(before), expressions(after), path.name)

    def test_no_upstream_customer_endorsements_in_login_footer(self):
        text = (ROOT / "apps/web/core/components/auth-screens/footer.tsx").read_text()
        self.assertIn("PathBuilder", text)
        for name in ["AccentureLogo", "SonyLogo", "DolbyLogo", "ZerodhaLogo", "10,000+"]:
            self.assertNotIn(name, text)

    def test_licenses_are_preserved(self):
        for relative in ["packages/propel/src/icons/brand/plane-logo.tsx", "packages/propel/src/icons/brand/plane-lockup.tsx"]:
            text = (ROOT / relative).read_text()
            self.assertIn("Copyright (c) 2023-present Plane Software", text)
            self.assertIn("AGPL-3.0-only", text)

    def test_email_templates_render_with_escaped_user_content(self):
        from django.conf import settings
        from django.template import Context, Engine
        if not settings.configured:
            settings.configure(USE_I18N=False, USE_TZ=True)
        engine = Engine(dirs=[str(ROOT / "apps/api/templates")])
        context = {
            "first_name": "<script>alert(1)</script>", "inviter_first_name": "Test Admin",
            "workspace_name": "<b>Test workspace</b>", "project_name": "Test project",
            "code": "123456", "email": "tester@example.invalid",
            "current_site": "http://localhost:3000", "profile_url": "http://localhost:3000/profile",
            "reset_url": "http://localhost:3000/reset-password", "abs_url": "http://localhost:3000/invitations",
        }
        for path in (ROOT / "apps/api/templates/emails").rglob("*.html"):
            with self.subTest(template=path.name):
                template = engine.get_template(str(path.relative_to(ROOT / "apps/api/templates")))
                rendered = template.render(Context(context))
                self.assertNotIn("<script>alert(1)</script>", rendered)
                self.assertNotIn("<b>Test workspace</b>", rendered)


if __name__ == "__main__":
    unittest.main(verbosity=2)
