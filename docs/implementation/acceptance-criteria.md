# Tendly — Acceptance Criteria

**Version:** 1.0  
**Status:** Functional release gates; not an instruction to generate one automated test per line

These scenarios define **observable behavior**. Use automated coverage for the most failure-prone business invariants and a small set of end-to-end journeys; verify remaining requirements through focused manual review. Passing tests is necessary but insufficient if the daily mobile UI is unusable. The authoritative functional/visual requirements remain in the [Product](../product/product-specification.md) and [UX/UI](../design/ux-ui-specification.md) specs.

## M1 / v1.0 — Viable Product

### AC-01 — Installation and first administrator

**Given** a fresh Docker Compose install behind HTTPS with no users, **when** the operator retrieves a one-time setup code through CLI and opens onboarding, **then** they can register an email address and a passkey, create the first household and become Admin **without requiring configured SMTP**. They can verify the email after SMTP is configured. The code is not reusable and public self-registration is unavailable. **When** containers restart, account/task data remains intact.

### AC-02 — Invitation, roles and account recovery

**Given** SMTP is configured by a deployment administrator using the admin UI and a test email succeeds, **when** Admin invites a member by email, **then** the user can register a passkey without a password. A user who loses a passkey can recover through a single-use short-lived verified-email link and add a new passkey; recovery does not create a password login. Admin-only actions are denied to Members. CLI emergency recovery works when email/UI is unavailable.

### AC-03 — Household isolation

**Given** user A belongs only to household A, **when** they forge task IDs, file IDs, dependency IDs, query scopes, WebSocket subscriptions or write payloads belonging to household B, **then** no household-B data is disclosed or modified. Cross-household parenting/dependency/relations are denied, including in bulk operations and worker jobs.

### AC-04 — Exactly six columns, correct lifecycle

**Given** task T in Within a Year, **when** moved to In Progress and then Done, **then** it visually appears in the correct columns and retains its planning bucket internally. **When** T is reopened from Done, **then** it returns to **In Progress** (the immediately prior visible column), not Within a Year. **When** a deadline passes, its column does not auto-change. Neither `Waiting` nor separate UI `Planning Horizon`/`Work Status` selectors appear.

### AC-05 — Quick create and contextual defaults

**When** a Member enters only a title using global `+` or desktop `N`, **then** a complete editable task is created in Someday by default. **When** created inside a known To Do epic lane, **then** its column and epic match that context. Users can open details to add properties; no forced multi-step form appears.

### AC-06 — Unlimited hierarchy and completion independence

**Given** parent P with deeply nested descendants, **when** a child is completed, **then** the parent remains in its existing column and shows updated progress. **When** a user completes P with unfinished subtasks, **then** a warning is shown and the user may confirm. A subtask can appear as an independent card when that view enables it. Parent/child cycles are rejected before persistence.

### AC-07 — Dynamic item-wise inheritance

**Given** P requires `Car` and `Ladder`, child C locally excludes `Car`, **when** P later adds `Trailer`, **then** C effectively requires `Ladder` and `Trailer`, not `Car`; P's resources remain unchanged. **When** P removes `Ladder`, it disappears from C unless C also added it locally. Behavior is identical at deeper levels, on card/details and in filters. Same add/exclude semantics apply to places and tags.

### AC-08 — Scalar overrides and inherited dates

**Given** P has deadline Oct 30 and high priority, **when** C inherits both, **then** both appear as inherited. **When** C sets an explicit deadline Nov 5 and explicitly disables high priority, **then** the values stay independent of later changes to P. A later child deadline is allowed with a warning. **When** C returns to Inherit, P's current values become effective. A child can explicitly have no inherited deadline and can override earliest-start to an earlier date.

### AC-09 — Dependency evaluation and manual override

**Given** B is in To Do and is blocked by incomplete A, **then** B is excluded from the default Now list. **When** A is completed, **then** B appears in Now if its effective earliest-start is reached. **When** A is reopened, **then** B becomes blocked again, but if B was already In Progress its column remains In Progress. Starting blocked B manually requires a warning and does not falsely mark its dependencies complete.

### AC-10 — Inherited dependencies and cycle checks

**Given** parent P is blocked by permit task A, **then** P's descendants are unavailable unless A is complete. A subtask may also have its own blockers. Adding explicit dependency loops, dependency loops induced by ancestry, reparenting that makes a loop, and same-task dependencies are all rejected transactionally.

### AC-11 — Now view and child independence

**Given** tasks distributed among all six columns, **then** the default Now view includes only actionable Within a Month/To Do/In Progress and excludes Done, Someday, Within a Year, archived, future-start or blocked tasks. **Given** a child in To Do beneath a parent in Within a Year, **when** the child has satisfied conditions (including inherited blockers and effective date), **then** the child can appear independently in Now. Other filters may narrow but not widen the base view.

### AC-12 — Places OR and resources semantics

**Given** manually selected current place Sandvreten and a place-compatibility filter, **then** a task with places `[Grankottevägen 30, Sandvreten]` matches; one with only Grankottevägen 30 does not; a task with no place matches everywhere. **Given** available resources include `Car` but not `Trailer`, a task requiring Car is feasible, one requiring both Car and Trailer is not, and one requiring neither is feasible. A `Requires Car` filter has different meaning from `Feasible with Car`.

### AC-13 — Epic colors and lanes

**Given** epics assigned palette hues/icons, **when** lanes are disabled and cards from different epics intermix, **then** each card retains its epic-colored background and monochrome icon with appropriate contrast in Light/Dark themes. With lanes enabled, desktop horizontal swimlanes and mobile collapsible sections follow the same global order, Unassigned last, empty lanes hidden by default. Deleting an epic does not delete its tasks.

### AC-14 — Reusable nested filter

**When** user creates a saved filter expressing `(Column IN [Within a Month, To Do]) AND (Size IN [XS,S]) AND Available=true`, **then** the builder offers nested group controls and **live result/count preview**. **Cancel** leaves the saved definition unchanged; **Save** updates it and a new version is restorable. The visual builder exposes `Column`, not an extra editable planning horizon field.

### AC-15 — Shared filters, per-view quick bars, personal state

**Given** two users and two saved views, **when** an Admin puts filters A and B on View1's quick bar, **then** both users can use those shared definitions; active A+B match their intersection plus View1's base predicate. View2 may have a different quick bar. User A's chip on/off state is remembered per view without affecting user B. Editing shared A changes all views referencing it, and a previous version can be restored. Filter creator remains visible.

### AC-16 — Custom views and sorting

**When** a Member saves a Board/List view with base filter, quick chips, sort, epic lanes, subtask display and card metadata settings, **then** those settings persist and are shared. Each user can separately favorite it. Built-in Now and Board can be customized/reset but not deleted. Drag/manual order is stable when a view uses manual sorting.

### AC-17 — Recurrence and template integrity

**Given** recurring yearly task tree scheduled Oct 1 with 14-day advance creation and child B blocked by child A, **when** Sep 17 arrives, **then** exactly one occurrence tree is created with the upcoming October 1 occurrence’s relative start/deadline and B depending on the **new** A, not last year's A. An external dependency remains targeted at its external task. A worker retry does not duplicate the occurrence. An unfinished prior year's task does not block new occurrence creation by default.

### AC-18 — Editing recurrence vs instance

**Given** an existing recurrence instance with a locally added subtask, **when** the user selects Edit this occurrence, **then** the series/template remains unchanged. **When** they edit the series, future uncreated instances use new template values while already created/historical instances remain intact unless a separate explicit operation changes them. Standard task templates are likewise copy-on-create.

### AC-19 — Comments, rich content and files

**When** a user adds formatted text, a checklist, a flat comment with @mention, a pasted screenshot (`Cmd/Ctrl+V`), a camera image and a file, **then** they persist and appear correctly across phone and desktop. A comment may be edited/deleted by its author. The history view remains distinct from comments. Attachment download is only permitted for authorized household members. v1.0 does not claim working push delivery for mentions.

### AC-20 — Search, archive and Trash

**When** user searches, **then** matches can include task titles, descendants, epics, tags, comments and archived tasks, with standard filtering. A Done task is auto-archived after household-configured completion age (30 days default) only if it has no unfinished descendants, and remains searchable and restorable. Permanently deleted blockers remain unresolved until explicitly handled. A deleted task subtree enters Trash, is restorable by Members and is eligible for cleanup after 30 days. Only Admin can force immediate permanent deletion; dependent-task warnings appear where needed.

### AC-21 — Multiuser changes, conflicts and Undo

**Given** two sessions edit the same task, **when** one changes deadline and one assignee, **then** both values can be preserved without unnecessary conflict. **When** both change the same field concurrently, **then** the second write does not silently erase the first; a conflict-resolution choice is presented. Successful changes propagate via WebSocket/refetch. Undo may reverse a recent own change only if it does not erase another user's newer change.

### AC-22 — Production mobile and desktop experience

**Given** an installed mobile PWA, a user can open Now, toggle view-specific quick filters, open a task, mark it Done, add a comment/photo and navigate Board one column at a time by swipe or direct selector. Desktop can manage multiple columns/epic lanes, filter-builder live preview and long-form editing. Task attributes use the approved visual hierarchy: epic color/icon, size XS–XL, boolean High badge, small secondary deadline; no invented priority levels or Waiting column.

### AC-23 — Locale, settings and role safety

**Given** device locale Swedish, the UI defaults to Swedish; otherwise English is available as fallback and the person can change language. Light/Dark/System mode persists independently for two users. Members can edit normal shared tasks/filters/views but not administrator-only actions. Multi-household users see only permitted household records. Household Admins cannot change installation-wide settings unless separately designated deployment administrators.

### AC-24 — Basic manual disaster recovery

**Given** a v1.0 installation with tasks, users, attachments, recurring series and filters, **when** the operator follows documented PostgreSQL dump/file export and restores onto a compatible fresh Docker host with necessary secrets, **then** the application data and file attachments are usable. Automated Google Drive/Dropbox backup is **not** required for M1.

### AC-25 — CI and code quality

**Before** merging a release PR, type checking, linting, relevant behavior tests and builds pass. Focus tests on security isolation, inheritance, cycles, filtering, recurrence, conflict logic and persistence. There is **no required coverage percentage** and no requirement to automate every acceptance scenario as a distinct test. Nontrivial invariants are documented in understandable source comments.

## M2 / v1.1 — Smart Assistance

### AC-26 — Automatic current place

With location permission granted and coordinates inside a configured place radius, Current Place is detected; a manual override is honored. Without permission, the app continues functioning with manual selection. Current location matching respects task-place OR semantics. No movement history is retained.

### AC-27 — Notification relevance

Assigned users get their chosen deadline reminders (default 24h), configurable one-time overdue reminders, assignment/availability/comment/@mention events, in-app notifications and supported-platform Web Push. Quiet hours defer delivery, users can disable each category, and completed tasks do not get further deadline reminders. OS/browser limitations are communicated accurately.

## M3 / v1.2 — Stability and usability

### AC-28 — Performance and reliability by measurement

Representative real household data with deep subtasks and complex filters remains responsive in ordinary flows. Measures from real usage guide query/index/cache optimizations. Reconnects, jobs and concurrency recover without data loss. Improvements preserve the established simple UI; avoid arbitrary numeric benchmarks invented before real measurements.

## M4 / v1.3 — Cloud backup

### AC-29 — Encrypted offsite recovery

An Admin can configure encrypted automated backups using **Google Drive** and **Dropbox** through the UI. Default schedule/retention/integrity checks are configurable; failures are visible/announced. A full PostgreSQL-plus-attachments backup is restored on a fresh compatible Docker host through a CLI pathway **without depending on a running application UI** and using separately stored encryption keys. The recovery drill verifies representative tasks, users and attached files.

## Automation guidance — intentionally small

- **Domain unit tests:** compact table-driven cases for scalar/multi-value inheritance, workflow column mapping, dependency validation and filter AST semantics.
- **Database integration tests:** a few representative cross-household attack attempts, recurrence materialization/idempotency, subtree transactions, optimistic concurrency and archive/Trash lifecycle.
- **E2E:** a **small handful** of complete user journeys (admin onboarding; create/plan/filter/complete; recurring setup; mobile comment/photo), only where realistic automation has value.
- **Manual UX review:** focus, responsive layout, colors/contrast, gestures and usability. Do not turn every screenshot/label into a brittle automated test.

**Release principle:** A user-usable coherent M1 is required even if every low-level function has a passing unit test. Conversely, do not make large test counts or coverage percentages a goal in themselves.
