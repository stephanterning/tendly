# Tendly — Implementation Plan

**Version:** 1.1
**Status:** Milestone scope approved 2026-10-14; internal delivery order revised 2026-11-01
**Delivery model:** Agent-led development, reviewable PRs; **large product milestones**

## 1. Release philosophy

Milestone 1 must be a **Viable Product (VP)**, **not an MVP**: a complete, pleasant, stable household planning application that the family can start using seriously on mobile and desktop. Do not reduce its committed scope or rename missing features "future work" without product-owner approval. Work can be split into small engineering checkpoints/PRs but should not be presented as shipped product milestones.

Prioritize coherent core workflows (capture → plan → find actionable task → complete) rather than a large number of isolated features. Never ship fake buttons, placeholder editing, inaccessible dialogs or fragile data workflows as “complete.” Account security and household isolation are part of the initial product, not polish.

## 2. Milestone overview

| Milestone / indicative release | Outcome | Core distinction |
|---|---|---|
| **M1 / 1.0.0 — Viable Product** | Family can replace its previous task planner | Complete baseline features including automatic Current Place |
| **M2 / 1.1.0 — Smart Assistance** | Proactive reminders | In-app and push notifications/reminders |
| **M3 / 1.2.0 — Stability & Usability** | Improved through real usage | Performance, reliability, measured UX fixes |
| **M4 / 1.3.0 — Automated Backup & Recovery** | Integrated encrypted offsite recovery | Restic/Rclone, Google Drive + Dropbox, admin UI |

Release numbers are indicative; patch releases may occur between milestones. M4 is intentionally planned after ~2–3 months of meaningful test use once app functionality begins to stabilize, not as an early implementation priority.

## 3. M1 — Viable Product (must be cohesive)

### 3.1 Infrastructure and security

- Public AGPL-3.0-or-later GitHub repository, pnpm monorepo, React/Vite PWA, Fastify REST+OpenAPI, PostgreSQL/Drizzle, worker/pg-boss, Docker Compose, CI and GHCR versioned release images.
- Secure initial admin setup using a one-time CLI code, verified email/invitation-only users, passkey-only normal login, email recovery/passkey reenrollment, deployment-owner CLI recovery, secure sessions.
- Separate deployment-administrator privileges and household Admin/Member roles, multiple household data model and strict household isolation; household switcher only where needed.
- SMTP configuration and test-send in deployment-administrator UI.
- Manual consistent PostgreSQL export + attachment backup and documented CLI restoration; no cloud service required for app operation.

### 3.2 Real task domain

- Tasks with six column values (Someday, Within a Year, Within a Month, To Do, In Progress, Done), one column control, separate internal status/planning bucket and restoration of the immediate pre-Done column on reopen.
- Full tasks/subtasks at unlimited depths, drag/menu reparenting, cycle checks, progress and independent completion, warned completion of unfinished parent.
- Dynamic inheritance, including explicit none/false and **item-wise additions/exclusions** for places/resources/tags; inherited dependency blocking and explicit deadline/start overrides.
- Epics (single/optional), globally sorted, curated light/dark colors and icons, configurable Board lanes, Unassigned and archive/delete semantics.
- Named places with optional coordinates and radius, automatic Current Place via browser geolocation, resources, tags, assignees, dates, boolean High, configurable XS–XL and optional exact estimate.
- Finish-to-Start dependencies and Related to links, cycle protection, server-evaluated availability and blocked-start warnings.
- Completion/reopen metadata, activity log, 30d completed auto-archive (only without unfinished descendants) and 30d soft-delete Trash with restore/permanent-delete role constraints.

### 3.3 Everyday UI: usable on phone and desktop

- **Now** as landing view: actionable tasks from Within a Month/To Do/In Progress by default, plus view-scoped quick-filter bar.
- **Board** groups the three planning horizons under Future by default, with a personal toggle per view to show all six columns. Desktop supports drag and drop and epic lanes. Mobile supports swipe, a column selector and expandable epic sections.
- Additional shared Board/List views with base filter, configurable quick chips, personal favorites/toggles, card-metadata choices, sort and optional epic lanes/subtask-as-card mode.
- **Advanced reusable filter builder is M1 core, not later polish:** nested AND/OR/NOT, dynamic values, safe effective-property evaluation, live preview, shared editing and restorable versions.
- One-field title capture, contextual defaults, detailed inline task edits, autosave, focused Undo/Redo, conflict feedback and responsive task panels.
- English/Swedish locale and personal overrides, Light/Dark/System theme, epic-card colored surfaces/monochrome icons and polished accessibility.

### 3.4 Household operating workflows

- Ordinary task templates and recurrence series using shared template model; recurring daily/weekly/monthly/yearly/custom instances, default 14-day lead, relative dates, edit instance/series, internal edge remapping, external edge retention, history and idempotent jobs.
- Rich-text descriptions and flat comments (including @mention editing), file/photo/clipboard uploads and previews, attachments on comments, separate activity history; **notification delivery for mentions is M2**.
- Global text search across tasks/subtasks/epics/tags/comments/archives plus filtering.
- Multiuser REST mutations + household-scoped WebSocket invalidation, optimistic updates and conflict safety; no simultaneous collaborative rich-text editing.
- Admin screens for users, household settings/defaults, epics, places, resources, tags, effort thresholds, SMTP, filters/views and application version.

### 3.5 Internal engineering sequence (not separate releases)

The [approved eight-stage delivery plan](delivery-stages.md) is authoritative for
execution order and stage dependencies. It replaces the earlier 1A–1F sequencing.
Stage identifiers are retained so existing reviews and acceptance mappings stay valid.

| Order | Stage | Focus |
|---|---|---|
| Foundation | 1–3 | Infrastructure/security/accounts, task capture, six columns, ordinary properties and guarded autosave |
| **Implemented — priority 1** | **7** | Rich text, comments/mentions, files/photos, search, multi-device sync/conflicts/Undo and applicable settings |
| **Implemented — priority 2** | **5** | Reusable filters, quick bars, shared views, epic lanes, Board interactions and global ordering |
| **Next** | **4** | Hierarchy, inheritance, dependencies/availability, warnings and integration with existing content/filter/view workflows |
| Then | 6 | Templates, recurrence, archive/Trash, safe jobs and lifecycle integration |
| Final M1 gate | 8 | Complete acceptance, mobile/PWA, accessibility, usability, manual restore drill and release readiness |

**Owner priority, 2026-11-01:** deliver Stage 7 and Stage 5 first so the household
can begin meaningful everyday use and provide useful evaluations. Review those
workflows together on phone and desktop after Stage 5 and use feedback throughout
the remaining work. This is an internal evaluation point, not a reduced M1 release.

The [Stage 5 review](stage-5-review.md) records the completed filter/view checkpoint.
Later-domain integrations remain explicit obligations: Stage 5 now connects search to
shared filters; Stage 4 completes inherited filtering, dependency-aware availability,
subtask views/reparenting and descendant search; Stage 6 completes archived search
and lifecycle/recurrence integration with content, sync, Undo and settings. Use the
same server domain resolvers throughout and preserve existing household data.
See the delivery plan for dependencies and acceptance ownership.

**Stage 8 quality and integration are mandatory** for M1 acceptance.

### 3.6 Definition of Done for M1

A fresh installer can deploy the versioned images behind HTTPS with persisted volumes. The first admin registers by CLI code/passkey, configures email, invites a second user. The household can maintain epics/places/resources/tags, schedule and assign work, create nested tasks, use inheritance/dependencies/recurrences/templates, build filters and use Now/Board and custom views. Both members can use their phones daily, edit descriptions, upload pictures/comments, complete tasks and see each other's changes without lost updates. Data survives container restarts; CLI manual restoration onto a new installation has been proven. All **M1 acceptance scenarios** in `acceptance-criteria.md` pass, UI is coherent and accessible, and no known release-blocking defects remain.

## 4. M2 — Smart Assistance and notifications

- In-app notification center + Web Push in supported browsers/installed PWAs.
- Events: deadline approaching, overdue once by default, assignment, task becomes actionable, comment, @mention.
- Per-user categories, default reminder 24h before deadline, additional per-task reminders, quiet hours with deferred delivery, no deadline reminders after Done.
- Review actual use and simplify quick creation, filter access and task details without changing the approved domain model.

**M2 done when:** users reliably receive configured notifications in supported clients and the notification flow is useful rather than noisy. Deliver with clear guidance about OS/browser push limitations.

## 5. M3 — Stability and usability from actual usage

- Profile real board/filter/hierarchy/availability performance with substantial household data; optimize batched reads/indexes, caching/materialization only if measurements warrant it.
- Improve reconnect handling, errors, migration reliability, worker instrumentation and conflict UX.
- Improve keyboard/touch accessibility, Undo, filter editor, templating or bulk actions **only where observed feedback justifies them**.
- Refine tests and docs around bugs found in real use, not artificial coverage targets.

**M3 done when:** real-world usage remains reliable/responsive after fixes and no simplification regression has been introduced.

## 6. M4 — Automated encrypted cloud backups

- Google Drive first, **Dropbox also included**; share Restic/Rclone integration and admin configuration patterns.
- Consistent PostgreSQL dump + attachments in an encrypted, deduplicated backup set; never back up a live inconsistent database directory.
- Configurable schedule (default daily 03:00), retention (30 daily/12 weekly/12 monthly), weekly integrity checks, retries/failure notifications to admins.
- Admin UI: provider connection, status/history, schedules, retention, test/configure, manual backup and restore initiation.
- Secure recovery secret/key export, separate key storage instructions; restore CLI must work when app/web are down.
- **Test** full restoration to a fresh server and validate records + attached files, not merely backup job exit code.

**M4 done when:** encrypted snapshots reach both supported providers and a fresh install can be recovered using backup material and separately held keys. Multiple simultaneous cloud destinations are a possible future extension, not required in M4.

## 7. Not committed to milestones

Full offline edits/queued uploads/sync conflicts, Home Assistant and calendar integrations, advanced multi-person collaborative rich-text editing. The architecture must not unnecessarily prevent future support, but do not implement these prematurely.

## 8. PR/review discipline

- Small reviewable changes **inside** large milestones; one coherent user-facing feature or domain invariant per PR where practical.
- Prefer test scenarios for critical behavior, especially inheritance, graphs, recurrence, filter correctness, authorization and conflict handling; a **few high-value Playwright journeys**, no test-volume targets.
- Update relevant product/UX/architecture documentation only when a genuine decision changes. Describe important non-obvious invariants close to code with concise why-comments.
- CI gates: typecheck, lint, focused tests, build. Check both narrow/desktop and phone viewports in feature review.
- Do not present mock/placeholder UI as complete and do not silently move approved M1 functionality to later releases.
- If requirements disagree, consult the document precedence in repository README and seek owner clarification for product-level ambiguities.

## 9. Release acceptance gate

M1 is not “done” simply because the required routes and components exist. It is done when the **family can actually use it as its household planner** through the complete capture/plan/do/collaborate lifecycle. M2–M4 each have their own release-specific acceptance suites. See [Acceptance Criteria](acceptance-criteria.md).
