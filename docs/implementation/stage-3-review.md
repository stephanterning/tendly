# Stage 3 — Task capture and planning foundation

This checkpoint follows the approved eight-stage plan. It is not the completed M1 VP.
The existing approved visual reference remains the design guide, with written specs
controlling labels, columns and behavior.

## Delivered

- English/Swedish responsive workspace: collapsible desktop navigation, mobile
  Now/Board/More navigation, household switching when needed, account appearance.
- Global title-only capture (plus or desktop N) defaults to Someday; column capture
  adopts its column. Details are optional, available through the creation toast.
- Exactly six columns, completion/reopen, and the default actionable Now list.
  Mobile Board has a direct selector and horizontal swipe; desktop scrolls columns.
- Task title, description, epic, boolean High, size, exact estimate, assignees,
  local start/deadline with optional time, places, resources and tags.
- Household-shared epics/places/resources/tags with icon search, curated palette,
  light/dark previews, epic ordering/archive and safe definition deletion. Household
  administrators can adjust effort-size thresholds.
- Autosave retains failed drafts. Same-field conflicts offer latest/mine choices;
  different-field changes merge. Completion Undo and keyboard Undo/Redo use guarded
  writes. They refuse stale reversals instead of overwriting a newer change.
- Twelve paired epic surfaces, monochrome icons, size-first cards, desktop detail
  sheet and full-screen mobile editor. Dialogs trap and restore keyboard focus.

## Verification

- Build, strict typecheck and lint.
- Seven focused unit tests across the project, including workflow, household-local
  DST boundaries/date-only deadlines and effort-size thresholds.
- Twelve database integration scenarios across the project: migrations, account
  security plus task isolation/reference validation, concurrent writes, stale Undo,
  deleted entity references, membership removal and filter-before-pagination.
- Browser journey covers capture, planning, complete/reopen, real conflicting edits,
  mobile layout and themes alongside existing passkey/invitation/recovery flows.
- All twelve rendered epic surfaces measured in both themes; minimum normal-text
  contrast is 13.38:1. This is a palette check, not a claim of complete WCAG certification.
- Runtime dependency audit: no known vulnerabilities.

## Review locally

Open http://localhost:8080 and reload. Existing accounts, passkeys and data are retained.
Use More → Organize your home to define epics, then create a task with the plus button.
Try its details, move it to In Progress, complete it and reopen it from Done on Board.
Change appearance in More → Account & household to compare light and dark.

Synthetic browser-test accounts and sample tasks exist only in the separate disposable
installation, not in the owner's preview household.

## Remaining approved stages

Stage 4 adds hierarchy, inheritance and dependency availability. Stage 5 adds shared
filters/views, configurable metadata, epic lanes, drag/drop and global manual reorder.
Stage 6 adds templates, recurrence, archive and Trash. Stage 7 adds rich descriptions,
comments/files/search, full WebSocket reconciliation and expanded Undo/conflict work.
Stage 8 completes PWA/device, accessibility, operations and the full VP acceptance gate.
No M1 requirement has been moved to a later milestone.
