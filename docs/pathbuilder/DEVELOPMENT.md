# PathBuilder development

This fork is based on Plane Community Edition `v1.4.2`. Application identifiers,
Python imports, package names, database tables, and required copyright notices
remain upstream-compatible. UI branding and email content use PathBuilder.
References to the upstream vendor's telemetry, commercial products, support links,
and legal attribution are not renamed as if they were PathBuilder services.

## Windows frontend setup

Use Node 24 LTS (minimum supported by upstream: 22.18) and pnpm 11.3.0.
From the repository root:

```powershell
npm.cmd install --global pnpm@11.3.0
pnpm.cmd install --frozen-lockfile
pnpm.cmd exec turbo run build --filter=web --filter=admin --filter=space --concurrency=1
pnpm.cmd --filter web start
```

Keep the terminal open and open http://localhost:3000 in your Windows browser.
The SPA server's scoped dependency override restores `serve-handler`'s supported
`path-to-regexp` version. Other consumers retain the upstream security override.
`verifyDepsBeforeRun: false` prevents pnpm from attempting nested reinstalls after
workspace build outputs change. Run the explicit frozen install after each pull.
The pre-commit formatter/linter still runs; lint errors block a commit, while
existing whole-file warnings are reported without blocking text-only changes.

A frontend-only preview can inspect logos and layout but cannot authenticate
without a separate backend. Do not configure it against the production database.
No WSL is required for the frontend build. Docker Desktop with a working WSL2
backend (or a separate Linux development host) is required for the existing
Docker-based full stack described in the upstream README and setup.sh.

For a full development stack, use the upstream `docker-compose-local.yml` with
separate local `.env` files. Its sample database/storage passwords are development
values, not production secrets. Keep the stack private, restrict published ports,
use synthetic data, and configure email capture before inviting anyone. Never
copy production `plane.env` into Git. Some mail tasks open SMTP connections
directly, so EMAIL_BACKEND alone does not guarantee that every mail task is safe;
use a local capture SMTP server and development-only SMTP settings.

## Checks

```powershell
pnpm.cmd exec turbo run check:lint check:types --filter=web --filter=admin --filter=space --filter=@plane/propel --filter=@plane/constants --filter=@plane/i18n --concurrency=1
python tools/pathbuilder/check_branding.py
```

The Python regression suite requires Django 5.2.15 and the upstream `v1.4.2` tag.
It checks translation keys/placeholders, email template control flow and escaping,
Python email expressions, upstream attribution, and the company login footer.

## Branding assets

The shared icon exports keep the `PlaneLogo`, `PlaneLockup`, and `PlaneWordmark`
names to avoid rewriting imports. Their artwork and accessible names are
PathBuilder. `currentColor` lets the vector components follow the theme.
The wordmark uses live Inter/Arial text rather than outlined glyphs.
Favicons have a white background to remain visible in dark browser tabs.

Email PNGs are served at:

- https://sync.pathbuilderedu.com/branding/pathbuilder-email-dark.png
- https://sync.pathbuilderedu.com/branding/pathbuilder-email-white.png

The customized frontend must serve these assets anonymously before a customized
backend sends emails referencing them. Staging emails should point to the staging
asset host when testing before production deployment. SMTP credentials are not
changed. The sender fallback is PathBuilder <notifications@sync.pathbuilderedu.com>;
an existing instance-level EMAIL_FROM setting takes precedence and should be
reviewed in the instance admin portal without changing working SMTP credentials.

## Keeping up with upstream

Fetch upstream release tags, merge a selected release into a separate update
branch, resolve conflicts, and run CI plus staging checks. Use versioned custom
Docker images; do not use `latest` for production. Never edit containers in place.

Browser regression: install tools/pathbuilder/requirements.txt, run `python -m playwright install chromium`, start the web preview, then run `python tools/pathbuilder/check_browser.py`. It checks themes, mobile overflow, branded assets, deep links, and absence of runtime errors.
