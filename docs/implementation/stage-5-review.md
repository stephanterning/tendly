# Stage 5 — Filters and views

Implemented and locally verified on 2026-11-01. This is the second priority checkpoint
for household evaluation, not owner acceptance or the complete Milestone 1 VP.
The next approved stage is **4**, followed by **6 → 8**.

## Delivered

- Household-wide reusable filters with typed visual AND/OR/NOT groups, comparisons,
  multiple values, Current User, household-local Today/day offsets and Current Place.
  Place compatibility includes tasks without places and uses OR across selected
  places; resource feasibility is a subset check distinct from requiring a resource.
- Live task/count preview, explicit Save/Cancel, name/icon/color/creator, duplication,
  reversible deletion, immutable version history and restoration, built-in reset.
  Concurrent shared edits preserve the local draft and require loading the latest
  version before retrying.
- Shared ordered quick bars per view; persistent personal active chips and favorites.
  Active chips AND with the view base. Right-click, keyboard context menu and touch
  long-press expose shared actions. Missing Current Place has an explicit message.
- Shared Board/List views with editable base, presentation, sort, lane/empty-lane
  settings and card metadata. Now/Board are customizable/resettable, not deletable.
  Favorites appear in desktop navigation and More on mobile. XS–XL precedes precise
  minutes when both are shown; epic colors remain independent of metadata selection.
- Household-global manual order; deadline, High, effort and newest-first sorts.
  Horizontal collapsible epic lanes on desktop, collapsible sections in the active
  mobile column, global epic order, Unassigned last and empty lanes hidden by default.
- Atomic desktop drag/drop across columns/epics and manual positions, with a Move
  dialog for keyboard/mobile. Contextual capture uses the known column/epic.
  Immediate move Undo is guarded by task fields and a global order revision; a later
  move by another user cannot be silently overwritten. Normal task-field editing
  retains its existing multi-step Undo/Redo.
- One canonical server query path for Now, Board, saved views, preview and filtered
  task/comment search, with filtering before sort/count/pagination. Household-scoped
  WebSocket updates refresh shared definitions without changing others' personal
  toggles. Read-only POST queries do not broadcast mutation events.

## Verification

- Generated OpenAPI/client; build, lint, strict typecheck and **11 unit tests**.
- **24 database integration tests**, including typed/set/dynamic predicates, household
  timezone, missing-context NOT, SQL-like text as data, matches beyond a 256-row batch,
  sorting before pagination, base/chip AND, personal state, shared version races,
  history restoration, every new route's authenticated household scope, atomic
  moves, stale ordering Undo, filtered task/comment search and query-loop prevention.
- Two high-value Playwright journeys in installed Chrome: the full existing account/
  task/content journey and a new two-user filter/view journey. The latter exercises
  nested preview, Save/Cancel, personal chip persistence after reload, favorites,
  live shared edits, history restore, native drag/drop and Undo, mobile Move/Undo,
  contextual capture, shared Board→List/effort changes, retained conflict drafts and
  filtered search. Desktop and 390px mobile layouts were visually reviewed, including
  the full-screen filter editor, preview shortcut and persistent Save/Cancel controls.
- The existing local installation was backed up and upgraded with migration 0005.
  All 7 tasks, 1 comment, 1 attachment and 6 entities had identical record hashes
  before/after; every stored attachment/preview byte also matched the backup.
  No existing content conversion was needed. A final read-only Chrome smoke on
  localhost verified Swedish desktop/mobile views and the editor preview without
  browser errors; its temporary test session was removed afterwards.

## Self-review

Reviewed household isolation, file access, rich-text validation, shared-edit conflicts,
filter compilation, pagination, atomic moves/Undo, migrations and backup/restore.
Corrected global search inserting spaces between formatted text fragments and omitting
mentions. Search and description filters now share the same plain-text projection,
including explicit line breaks; focused unit/database regressions cover these cases
and matching content beyond a scan batch. Filter definitions, effective task values
and searched content are read from one repeatable-read snapshot. No known blocking
finding remains from this self-review; this is not an independent review.

## Acceptance and next work

The current-model portions of AC-12–16 and AC-21–23 are covered. The combined Stage 7
and Stage 5 workflows are ready for household evaluation. Findings should inform the
remaining work, without waiving the complete VP gate.

Stage **4** adds hierarchy, item-level dynamic inheritance/exclusions, direct and
ancestor dependency blockers, availability/warnings, reparenting, separate subtask
cards and descendant search through this same resolver. Those controls are not
presented as completed Stage 5 features. Stage **6** adds templates, recurrence and
archive/Trash lifecycle integration. Stage **8** remains the complete M1 acceptance,
physical-device/PWA/accessibility, restoration and release gate.

See [decision 0005](../architecture/decisions/0005-filters-views-ordering.md) for the
storage/API design and the deliberate canonical-projection query boundary. No new
runtime dependency, deployed release or complete M1 acceptance is implied here.
