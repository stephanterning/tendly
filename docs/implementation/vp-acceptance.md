# VP 1.0.0 acceptance record

The owner authorized the remaining stages as one complete VP delivery, without
intermediate owner approval gates. This record tracks the final engineering gate;
passing individual unit tests is not treated as a substitute for the daily UI.

## Implemented scope

- Existing onboarding, passkeys, recovery, roles, invitations and SMTP remain intact.
- Six columns, hierarchy/inheritance, graph validation, completion warnings and guarded
  task edits use the existing authoritative task resolver.
- Shared visual filters, previews, history, saved views, personal chips/favorites,
  manual current place, global ordering, drag/reparent targets and epic lanes.
- Copy-on-create templates, calendar recurrence with original-anchor clamping,
  independent occurrences, internal-edge remapping and retry deduplication.
- Archive/Trash, administrator retention settings, restoration, dependent warnings
  and unresolved permanently deleted blockers.
- Rich descriptions/comments, mentions, files/photos, searchable archived content,
  activity, authenticated downloads and reconnecting WebSocket invalidation.
- Online-first PWA, optional profile photos, household settings and consistent manual
  PostgreSQL/file backup with empty-target restore protection.

## Verification

Critical automated checks cover effective filtering, personal/shared state, injection
resistance, optimistic conflicts, recurrence retry races, clone remapping, unfinished
parent retention, subtree restore, deleted blockers, rich-text validation, file isolation
and comment authorship, in addition to existing account/hierarchy checks.

The browser journey includes onboarding, map/icon selection, task editing/conflicts,
parent/child behavior, saved filter/view editing, board drag, mobile comments and photo
upload, template creation and search, followed by invitation and account recovery.

Verified locally on 2026-10-14:

- `pnpm check`: production build, lint, strict typechecking and 10 focused unit tests passed.
- PostgreSQL integration suite: 19 tests passed, including live WebSocket session
  revocation, archived/deleted template references and retained inline images.
- Full Playwright journey passed against isolated Docker services with actual WebAuthn
  verification and STARTTLS email delivery. Production rate limits stay enabled; the
  accelerated journey pauses between planning and account workflows.
- OpenAPI regeneration produces no contract drift. Dependency audit reported no known
  vulnerabilities; the license inventory contains no unknown licenses.
- Desktop/mobile and light/dark screenshots were inspected. The final desktop board
  preserves readable card widths with horizontal overflow; touch completion and move
  menus have separate targets.
- The documented backup/restore scripts restored a populated installation into a fresh
  Compose project: 3 users, 9 tasks, 1 filter, 3 views, 1 recurring template and 1 file
  matched the source. CLI recovery, newly enrolled passkey sign-in, comment search,
  recurrence configuration and exact downloaded image bytes worked after restoration.
  Anonymous file access remained denied. A second restore refused the non-empty target.

The 1.0.0 code and local images are the VP review candidate. Publishing a GitHub release
and multi-architecture registry images remains a separate release action after merge.
Real-device camera capture and iOS home-screen installation require device validation;
the corresponding browser controls and PWA manifest are implemented, not mocked.
