# Workflow field update

The workflow create/edit form now wraps all single-line controls in Propel InputGroup so they receive the standard themed border, fill, padding, hover, focus, and disabled treatments. Required-field validation marks the input and frame invalid. The workflow description uses the framed multiline TextArea control. Placeholders identify the expected input.

New estimate configurations default to Fibonacci with values 1, 2, 3, 5, 8. Saved names are retained. Turning estimates off and on retains any custom name entered in the current edit.

Validation: 10 workflow UI tests passed, web TypeScript passed, targeted OxLint reported zero warnings/errors, and the Linux web build and locale guard passed.

Dev image: pathbuilder-dev-web:workflow-fields-20261021-01. Previous dev compose is saved at /opt/pathbuilder-dev/releases/workflow-fields-20261021-01/compose.before.yaml. This update requires no database migration.

Browser verification on dev passed for light and dark themes, empty and populated controls, multiline editing, required-field styling, and the Fibonacci default. Existing saved workflows were inspected without saving changes. Screenshots: artifacts/workflow-dev/fields-light.png and fields-dark.png.
