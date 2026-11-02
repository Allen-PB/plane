# PBS-9 UI conventions

This checklist extends [the shared UI guidelines](UI_DESIGN_GUIDELINES.md). Use Sync's shared components and semantic theme tokens for every new Office and Profile control. Office artwork may follow its day/night schedule; application controls follow the user's Preferences theme independently.

- Use Inter Variable throughout, including portalled dialogs. Body copy is 13px with a 1.5 line height; supporting labels are 12px; dialog titles are 16px semibold. Use the existing shared typography scale elsewhere.
- Use `--txt-primary`, `--txt-secondary`, `--border-subtle`, `--bg-surface-1`, `--bg-layer-2`, and accent tokens. Avoid fixed light backgrounds, gray borders, or blue focus colors on form controls.
- Keep labels above fields, align controls to a common width and height, and use consistent 12–16px spacing. Group related fields in cards. Read-only fields must not imply an available dropdown action.
- Contain scene overlays in the Office stacking context. Dialogs and backdrops must cover all scene badges, labels, controls, and employee indicators.
- Keep warning content brief, show the scheduled end and timezone, and explain the consequence. An optional reason must remain optional. Cancel and Escape must preserve the open attendance session; confirmation must remain explicit.
- At narrow widths, allow dialog actions to wrap, retain visible padding, and keep all content and focusable controls within the viewport. Long messages must wrap without horizontal scrolling.

Before release, check light, dark, high-contrast, and custom themes; desktop and 390px/320px widths; keyboard focus, Escape, labels, busy states, and cancellation. Restore any preference changed for testing. Record real browser screenshots separately from committed source, and keep reversible release checkpoints.