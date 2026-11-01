# Stage 7 — Content, files, search and collaboration

Implemented and locally verified on 2026-11-01. This is an internal delivery checkpoint,
not owner acceptance or the complete Milestone 1 VP. The next approved stage is **5**;
remaining order **5 → 4 → 6 → 8**.

## Delivered

- Shared rich-text editor for descriptions and comments: headings, emphasis, lists,
  checklists, links, quotes, code blocks, Markdown shortcuts, images and household
  mentions. Old plain text is migrated literally, including HTML-like characters.
- Flat comments with author/time, own-comment editing/deletion, safe deletion Undo,
  retained drafts and conflict feedback. Comments and recorded Activity have separate tabs.
- Configurable 50 MB file limit, multiple file selection, drag/drop, clipboard-image
  paste and camera/photo input. Original files, including HEIC, are retained; images
  have previews/thumbnails and PDF has native browser preview plus download.
- Household-scoped incremental search over existing tasks/descriptions, comments,
  epics and tags, with result navigation, desktop Cmd/Ctrl+K and mobile navigation.
- WebSocket invalidation and REST reconciliation across sessions, reconnect and
  foreground refresh, revoked-session handling and targeted resource refetches.
  Same-field conflicts retain drafts; accepting remote rich text clears stale editor
  Undo. Task Undo/Redo and comment deletion Undo use server version guards.
- Household name/timezone editing with administrator and stale-write guards;
  application version display. Manual consistent database/files backup and restore.

## Verification

- Generated OpenAPI/client contracts; build, lint, strict typecheck and **8 focused
  unit tests** passed.
- **15 database integration tests** cover migrations, account security, household
  isolation, rich content, comment authorship/versioning, scoped search/files, actual
  PNG/HEIC conversions, original bytes, oversized files, household settings, orphan
  cleanup, concurrent edits, stale Undo and revoked WebSocket sessions.
- The full Playwright journey passed in **installed Chrome**, including account setup,
  invitations/recovery, planning, rich text, comment edit/delete/Undo, PNG/HEIC/PDF,
  real clipboard-image paste, mentions, search and a concurrent rich-description
  conflict between desktop and a 390px mobile viewport. Taking the latest version
  followed by editor Undo did not restore the discarded draft. Local Undo survived
  autosave, and household-setting drafts survived a concurrent remote edit.
- A two-session Chrome smoke test also verified task propagation and reconnect after
  an offline change. Desktop/mobile screenshots were reviewed; PDF rendering was
  visually verified after the native viewer finished loading.
- The existing localhost installation was backed up and upgraded. All six original
  task descriptions matched exactly before/after migration. Swedish/light desktop
  and mobile-width content flows ran without uncaught browser errors.
- Backup was restored into an independent local Compose project. Database counts and
  original-file SHA-256 checksums matched. The restored account opened its task,
  comments and rendered PDF successfully through Chrome.

## Acceptance boundaries and next work

AC-19 and AC-21 are exercised for the current task model. AC-20, AC-22, AC-23 and AC-24
remain cross-stage acceptance scenarios; they are not marked globally passed here.

Stage 5 adds shared filter evaluation, quick bars, saved views, Board interactions and
global ordering. Stage 4 adds descendants, inheritance/dependencies and their search/
sync/Undo integration. Stage 6 adds recurrence, archive/Trash, file lifecycle and worker
mutation delivery. Stage 8 includes the full fresh-host restoration drill and real
installed-PWA/phone camera checks over HTTPS; a mobile viewport does not substitute
for a physical phone. Mention notification delivery remains M2.

The local backup/restore scripts are available before evaluation with important data.
No deployment, published release, push notification or complete M1 acceptance is implied.
