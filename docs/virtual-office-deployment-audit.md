# Virtual Office integration audit

The DEV regression displaying `workspace_settings.settings.members.title`,
`settings`, and similar identifiers was missing translations, not intended label
changes. The Windows checkout materialized `packages/i18n/locales` as a regular
file containing `src/locales`, rather than the Git symlink recorded in the repo.
Vite successfully compiled the package with an empty locale-import map.

The correction rebuilds the same deployed feature revision on Linux, where the
symlink resolves, and verifies that all English namespaces are present before
deploying the web image. No PM labels, translation strings, PM business logic,
existing permissions or existing database models are changed by this correction.
The pending original-office visual revision is excluded from the recovery build.

The integration source diff against the deployed `preview` base is limited to:

- New Virtual Office routes, components, service, models, audit records and APIs.
- URL/model exports registering those additions.
- The requested header Help-to-Virtual-Office shortcut replacement.
- Three.js dependencies, office tests, documentation and build validation.

Existing issue, project, workspace-member, invitation, cycle, module, and settings
implementations and their labels remain at the base revision. Virtual Office
permissions are independent; they do not modify workspace or project roles.

Required packaging checks:

```sh
node tools/pathbuilder/check_locale_bundle.mjs --preflight
pnpm exec turbo run build --filter=web --concurrency=1
node tools/pathbuilder/check_locale_bundle.mjs apps/web/build/client
```

Browser checks after recovery must include Members, workspace switcher labels,
project/work-item navigation and settings, alongside the existing API regression
checks. Production is inspected read-only and is not a deployment target.
