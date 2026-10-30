# Office message and navigation fixes

Dev release `office-ui-polish-20261022-01` changes only the web UI.

- The success message dismisses after 3.5 seconds and clears on route changes. Saves that complete after navigation do not reintroduce stale messages. Error messages remain visible until another action or navigation.
- Office floor and Office management use the same header font, size, logo dimensions, navigation spacing, and responsive padding.
- Download Time In/Out CSV is a text link in the Office management navigation row, after Desk assignments. It opens the existing date-selection panel; Cancel or navigating to another page closes it. Date validation and download behavior remain intact.

Validation: the full office UI suite passed (38 tests), followed by all seven root/navigation tests including an additional pending-save navigation race. Web TypeScript, targeted lint, formatting, and the Linux build/locale guard passed. No backend, attendance, appearance schedule, or database migration changes are included. Production is unchanged.

Rollback: previous dev compose retained at `/opt/pathbuilder-dev/office-ui-polish/compose.before.yaml`.
