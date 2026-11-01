# Stage 7 — Content, files, search and collaboration

**Status:** Implemented and locally verified, 2026-11-01. See the
[Stage 7 review](stage-7-review.md) for delivered behavior and evidence. Owner
acceptance and the complete Milestone 1 gate remain separate decisions.

The approved order remains **7 → 5 → 4 → 6 → 8**. Stage 5 is next.
Stages 7 and 5 are prioritized for meaningful household use and evaluation.

## Completed work packages

1. **Rich descriptions and collaboration.** Validated Tiptap documents, literal
   preservation of existing plain text, shared editor, formatting/checklists/links,
   Markdown shortcuts, inline images and household mentions. Version-guarded
   description edits preserve drafts during autosave and conflicts. Editor-local
   Undo resets when accepting another version, preventing stale text restoration.
2. **Comments and activity.** Flat, newest-first comments with author/time, explicit
   posting, own-comment edit/delete and guarded deletion Undo. Comment drafts survive
   panel close/reopen in the same browser tab. Activity has its own tab and displays
   recorded actors, timestamps and changed properties; no invented historical values.
3. **Files and photos.** Authenticated uploads/downloads, multiple file selection,
   drag/drop, clipboard images and camera/photo input. Originals, image previews and
   thumbnails persist in the attachment volume; metadata lives in PostgreSQL.
   Failed uploads clean staged files; hourly cleanup removes old unregistered files.
   Database-plus-files backup/restore scripts have been exercised on isolated projects.
4. **Search and everyday integration.** Incremental scoped search over existing
   tasks/descriptions, comments, epics and tags; keyboard shortcut and mobile entry;
   task/entity navigation. Household WebSocket invalidation with targeted refetch,
   reconnect/foreground reconciliation and revoked-access checks. Guarded task
   Undo/Redo, household name/timezone settings and application version are exposed.

## Approved attachment policy — 2026-11-01

The owner approved a configurable **50 MB per file**, image and PDF previews,
original-image retention with separate previews, and HEIC support without manual
conversion. Video is not required in this stage. This policy is implemented and
verified with real PNG, HEIC and PDF files.

## Explicit later integrations

- Stage 5: shared filter engine for search, saved filters/views and their sync,
  version/conflict handling. No competing temporary filter engine in Stage 7.
- Stage 4: descendants, inherited values and dependency-driven changes integrated
  into search, content views, sync and guarded mutations.
- Stage 6: archived search, recurrence/lifecycle settings, attachment ownership and
  retention through archive/Trash/restoration, plus lifecycle sync/Undo where specified.
- Stage 8: full M1 acceptance, installed-PWA/device review and fresh-host restore
  drill, including files. Before using important household data, provide and verify
  the applicable manual database-plus-files backup path; early evaluation does not
  replace the complete AC-24 drill.

## Verification scope

- Focused database/HTTP tests for cross-household file/comment/search access,
  author-only comment edits, revoked WebSocket access, concurrent same/different-field
  edits, stale Undo and migration preserving existing descriptions.
- Validate rich-text structure, safe links/embedded attachment references, upload
  size/type/path handling and temporary-file cleanup without live-file loss.
- A small number of browser journeys: two sessions edit/comment and see updates;
  disconnect/reconnect retains drafts and reconciles server state; add/paste a photo,
  reopen/download it, and find the task through search. Verify persistence after restart.
- Review mobile and desktop in English/Swedish, light/dark themes, keyboard focus,
  text editing during autosave, upload failures and accessible previews. Actual camera
  capture on a phone requires a reachable HTTPS installation, beyond localhost testing.
- Run contract generation, build, lint, typecheck and relevant tests. Record actual
  results and remaining cross-stage scenarios in the Stage 7 review when delivered.
