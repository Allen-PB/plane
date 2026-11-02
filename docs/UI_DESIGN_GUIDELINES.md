# PathBuilder Sync UI guidelines

Read this guide before adding or changing product UI. Extend the existing design system and shared components; avoid introducing a new visual style for each feature.

## Typography and color

- Inherit the application's Inter font stack on inputs, selects, buttons and textareas. Never rely on a browser's default form font.
- Follow the owning surface's established hierarchy and shared semantic typography classes. Virtual Office uses 13px body text, 28px page titles, 14px card headings, 13px semibold form/section headings, and 12px field labels/helper text. Use 1.5–1.6 line height for readable wrapping. Avoid oversized nested headings or unstyled paragraphs falling back to a different font size.
- Use the owning surface's semantic tokens. Virtual Office uses `--vo-ink` for primary text, `--vo-muted` for supporting text, `--vo-border`, `--vo-surface`, `--vo-field-bg` and `--vo-accent`. Define palette values at the surface, rather than inventing feature-specific blue/gray shades.
- Virtual Office's accent inherits the shared design system's `--bg-accent-primary`, keeping links, selected days, focus and Propel radio/button accents aligned.
- Reserve accent color for selected states, links, focus and primary actions. Convey errors and status with text/icons as well as color. Do not change the office scene's day/night appearance setting to style management forms.

## Preference themes and dialogs

Application chrome must follow the theme selected in Preferences, including light, dark, high-contrast and custom palettes. Office day/night artwork is independent of that preference. Bind Office foregrounds, surfaces, borders and fields to Sync's semantic tokens; check headings and navigation as well as body text. Restore any preference changed for testing.

Dialogs render through a document-level portal and need their own inherited Inter typography and semantic colors. Use 13px body copy, 12px labels and a 16px semibold warning title. Contain the illustrated Office's floating layers in its stacking context so badges, employee indicators and controls cannot overlap a modal or backdrop. Allow action buttons to wrap at narrow widths, retain visible focus, and check 320px as well as 390px layouts.

An early Time Out warning shows the scheduled end and timezone, explains the attendance consequence, and keeps the reason optional. Stay timed in and Escape must preserve attendance. Only explicit confirmation may submit Time Out. Test confirmation with mocked or disposable sessions; never end an active employee session to verify layout.

## Layout and controls

- Use the published `@makeplane/propel` primitives and existing Plane composites. Extend a shared component when the same interaction occurs in Profile and Office management.
- Use a 4px spacing rhythm: 8px between related controls, 12px between fields, 16px between groups, and 20–24px between cards. Keep label-to-control spacing consistent.
- Place field labels above their controls. Group each label and input in its own layout wrapper. Do not alternate bare labels and inputs in a grid: this misaligns fields when a label wraps.
- Keep short headings inside the card. A long fieldset legend must not break across the card border. Give the fieldset an accessible name even when its visual heading is an internal heading.
- Display supporting metadata, such as timezone, in a compact secondary badge. Keep instructions separate from headings.
- Set controls to inherit typography and use consistent border, background, radius and minimum height. Checkbox/radio controls must keep their own dimensions; broad form-input rules must not stretch them.
- Adapt to the component's available width, including a narrow desktop sidebar. Use container queries for multi-column fields; viewport breakpoints alone do not solve narrow-card layouts. Use `min-width: 0` for grid/flex children and keep time controls fully visible.
- Preserve visible keyboard focus, associated labels, grouped choices, disabled states and descriptive errors. Do not use placeholder text as the only label.

## Working-hours pattern

Use `ScheduleFields` for every working-hours editor. Offer **Same hours across days** and **Different hours each day**. Shared mode applies start/end and overnight settings to selected days and copies those hours when another day is selected. Per-day mode allows independent times. Existing differing schedules must open in per-day mode without changing saved values. Switching explicitly to shared mode uses the first selected weekday's hours; explain that behavior next to the choice.

The editor still submits the existing per-day API format. Timezone, approval, prospective changes, overlap validation and attendance calculations remain backend rules. A UI convenience must not bypass them.

## Notification pattern

Notifications must use the shared `OfficeNotices` layout: an inset panel aligned with page gutters, readable message text, separated review/dismiss actions and a bounded, keyboard-scrollable list. Return no panel when empty. Keep persistent account updates distinct from transient action feedback; neither may overlap the header or obscure the Office scene.

Use **Your account updates** for notices addressed to the signed-in person and show when each update occurred. Admin save feedback must name the employee or account edited, so it cannot be confused with a personal notification.

## Account selection pattern

Use the shared searchable combobox for long account lists. Keep the popup aligned to the field width, bounded by the viewport, and vertically scrollable. Place email search inside the popup. Preserve the selected account and unsaved form values while search results load. Support keyboard selection and Escape, provide an empty state, and disable the picker during saves. Selecting or searching must never submit the form.

## Profile pattern

Keep Profile identity and working-hours sections consistent with the surrounding account settings: inherited Inter typography, 13px control text, 12px labels, compact shared controls, and grouped labels above fields. Scope styles to Profile so management forms retain their own layout. Check long dropdown values at 390px and narrow 320px widths. Non-editable Profile fields must not show dropdown arrows; retain their disabled state and readable value. Employee-facing guidance should refer to an administrator rather than expose internal privileged-role names. Hide restricted actions using server-provided capabilities, and enforce the same restriction in the API.

## Required visual review

Before handoff, check the changed surface in a real browser at desktop width, at a narrow card width, and at a 390px viewport. Inspect empty, populated, long-label, validation and disabled states. Confirm matching font, type hierarchy, text colors, border/radius, spacing, alignment, focus and absence of page overflow. Capture screenshots of the actual implementation. Run relevant interaction tests, types, lint and the React Doctor regression check; record material limits rather than claiming untested browsers.

Keep employee screenshots, report exports, credentials and deployment configuration out of public Git history and PR attachments.
