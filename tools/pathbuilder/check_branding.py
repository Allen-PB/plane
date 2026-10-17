# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Regression checks against the preview source before branding; no database required."""
import ast
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = "4e0e4038a176c335509b7d474f7cac4046b90e34"


def upstream(path):
    relative = path.relative_to(ROOT).as_posix()
    return subprocess.check_output(
        ["git", "show", f"{BASELINE}:{relative}"], cwd=ROOT, text=True, encoding="utf-8"
    )


def strings(value, prefix=()):
    if isinstance(value, dict):
        return {key: text for name, child in value.items() for key, text in strings(child, prefix + (name,)).items()}
    if isinstance(value, list):
        return {key: text for index, child in enumerate(value) for key, text in strings(child, prefix + (index,)).items()}
    return {prefix: value}


class BrandingRegressionTests(unittest.TestCase):
    def test_auth_header_uses_pathbuilder_asset(self):
        text = (ROOT / "apps/web/components/auth-screens/header.tsx").read_text(encoding="utf-8")
        self.assertIn('src="/branding/pathbuilder-lockup.svg"', text)
        self.assertIn('alt="PathBuilder"', text)
        self.assertNotIn("PlaneLockup", text)

    def test_main_header_has_no_github_star_button(self):
        text = (ROOT / "apps/web/components/navigation/top-navigation-root.tsx").read_text(encoding="utf-8")
        self.assertNotIn("StarUsOnGitHubLink", text)

    def test_translation_keys_and_placeholders_survive(self):
        paths = sorted((ROOT / "packages/i18n/src/locales").rglob("*.json"))
        self.assertGreater(len(paths), 100)
        for path in paths:
            with self.subTest(file=path.relative_to(ROOT)):
                before = strings(json.loads(upstream(path)))
                after = strings(json.loads(path.read_text(encoding="utf-8")))
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
        text = (ROOT / "apps/web/components/auth-screens/footer.tsx").read_text()
        self.assertIn("PathBuilder", text)
        for name in ["AccentureLogo", "SonyLogo", "DolbyLogo", "ZerodhaLogo", "10,000+"]:
            self.assertNotIn(name, text)

    def test_licenses_are_preserved(self):
        for relative in ["packages/blocks/src/icons/brand/plane-logo.tsx", "packages/blocks/src/icons/brand/plane-lockup.tsx"]:
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
