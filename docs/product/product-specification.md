# Tendly — Product Specification

**Version:** 1.0  
**Status:** Baseline approved decisions, consolidated 2026-10-14  
**Audience:** Product owner, designers, implementation agents

## 1. Purpose and product rules

A shared, self-hosted household planner combining Kanban, GTD-style capture and actionable task filtering. It must feel exceptionally simple day to day, while offering extensive planning controls when deliberately opened. A normal task must be creatable by entering only a title. There is no expectation that users learn project-management terminology to use the app.

Two core questions drive the product: **What can I do now?** and **What do we need to plan or complete later?** The principal clients are mobile phones for doing/closing work and desktop browsers for planning; both must be functionally complete. English and Swedish are supported, with English as fallback.

The product is household-owned, not tied to a proprietary cloud service. It initially runs on the owner's Mac mini through Docker and is accessible over HTTPS, but installation must work for other self-hosters.

**Release meaning:** Milestone 1 / v1.0 is a **viable product**, not a stripped-down MVP. The initial release must be usable for the household's real tasks. Geolocation automation, push notifications and cloud backup come in later releases; the implementation plan is authoritative about when features ship.

## 2. Accounts, households and roles

- One deployment can contain multiple **households**, with strict data isolation. A user may join multiple households. Do not display a household switcher when the user belongs to only one.
- Each household owns its tasks, epics, places, resources, tags, templates, filters, views, preferences/defaults and memberships.
- **Deployment administrators** manage installation-wide settings (including SMTP and future backup configuration). This privilege is separate from household membership. Household Admins do not automatically receive deployment privileges.
- **Admin** can manage their household users, roles, household settings, and permanent deletion. **Member** can manage all tasks, epics, places, resources, tags, shared filters/views and restore trashed records.
- Users have a name, optional profile picture, and individual preferences: language, appearance, navigation favorites, active quick-filter selections, reminder preferences and quiet hours.
- An email address is required for every account; new accounts are invitation-only. Normal sign-in is **passkey-only** (WebAuthn; Face ID/Touch ID/device authenticator), with support for multiple passkeys.
- Household Admins may also copy a single-use invitation code valid for **30 minutes**, without SMTP (owner request, 2026-10-14). The code is bound to the invited email address and role. Joining must finish before expiration; code-created accounts can use passkeys immediately but retain unverified email until separately verified. Existing accounts sign in before accepting.
- Email-based account recovery may issue single-use time-limited recovery links to enroll a new passkey; this is an exceptional recovery flow, not password sign-in. Admin-assisted and deployment-owner CLI recovery are available. Do **not** require backup/recovery codes.
- On an uninitialized installation, the first admin creates their account and the first household using a one-time setup code obtained from Docker CLI. This must work **before SMTP is configured**; first-admin email verification can be completed afterward. No open sign-up endpoint remains afterward.

## 3. Workflow and task data

### 3.1 One user-facing column

The task UI has **exactly six columns**, in this order:

| Internal column identifier | English | Swedish |
|---|---|---|
| `someday` | Someday | I framtiden |
| `within_year` | Within a Year | Inom ett år |
| `within_month` | Within a Month | Inom en månad |
| `todo` | To Do | Att göra |
| `in_progress` | In Progress | Pågår |
| `done` | Done | Klart |

No `Waiting` column, and no separate planning-horizon selector in the task UI. A column represents **intention**, not a literal date range: the system must not move cards between these columns merely because time passes or a deadline expires.

Internally `status` is `todo | in_progress | done` and, while `status=todo`, `planningBucket` selects `someday | within_year | within_month | ready` (`ready` renders as **To Do**). The planning bucket is retained even when work starts or completes. A completion transition remembers the **immediately preceding user-facing column**; reopening a completed task restores that column, normally **In Progress** if that is where it was just before completion. A deliberate direct move to another column supersedes automatic reopening. The UI always exposes a single `Column` field; filters use that same six-value abstraction.

### 3.2 Task properties

Each task has at least: required title; optional rich-text description; column; optional parent task; optional epic (at most one); zero or more assignees, places, resources, tags, dependencies, related tasks, comments, file attachments and subtasks; boolean high priority; optional size and exact effort estimate; optional earliest-start and deadline (date or date-time); creation/change/completion metadata; optional recurrence-instance reference; and archive/trash metadata.

- **Priority** is only `High` or `None` (default): a boolean, never Low/Normal/Urgent.
- **Effort** uses the named sizes XS, S, M, L, XL as its prominent display. Household-configurable thresholds default to XS ≤1 hour, S 1–4 hours, M 4–8 hours, L 1–3 days, XL >3 days. One effort day equals 8 hours. Exact duration may suggest a size only when no size is assigned; it never overwrites an explicitly selected size. Exact duration may be entered separately but is less visually prominent. There is no inherited effort estimate; a parent may show an aggregate estimate for descendants separately from its own estimate.
- **Dates** are both optional and independent. A task may have just a start date, just a deadline, both or neither. A time-of-day may optionally be specified. Household timezone governs date calculations and recurrence. Date-only deadlines cover the entire local day. Dates are not reminders or workflow columns. Deadline passing highlights the task but never changes its column.
- **Assignment** may include multiple household members or nobody. Anyone in the household may complete an assigned task. Record who completed it and when.

### 3.3 Actionability / availability

Availability is **derived**, not a manually controlled workflow state. A task is actionable when its effective earliest-start date is absent or reached **and** all its own and ancestor-inherited blocking dependencies are complete. An overridden earlier start date on a subtask may make it available before its parent's start date, unless a blocking dependency prevents it; parents do not impose status-based gating on descendants. A task can be manually moved to In Progress while blocked, but a warning is required; no automatic status changes occur when dependencies change.

A task's **place and required resources** are contextual filter criteria, not intrinsic blockers: a task can be actionable but irrelevant to the user's current location or available equipment. No GPS detection is needed in v1.0; the user can manually choose a current place.

**Default Now view:** only tasks in `within_month`, `todo` or `in_progress` that are actionable and not trashed/archived. Other constraints (size, place, resources, assignees) come from saved quick filters. The base filter can be customized by users with normal view-edit permissions.

## 4. Tasks and unlimited subtasks

- Every subtask is a **full task** with its own column, dates, estimate, dependencies, assignments and history. Nesting depth is not artificially limited.
- Default presentation shows subtasks as a checklist inside their parent; the card shows completion count of direct children (e.g. 3/5); completion warnings inspect all descendants. A view can enable subtasks as independent cards; the Now view can show an actionable subtask even if its parent is in Someday/Within a Year, provided the subtask matches the view and is not otherwise blocked.
- A subtask is **not** automatically completed when its siblings are complete. Finishing all subtasks does not complete the parent. Finishing a parent that has unfinished subtasks requires a warning/confirmation.
- A task can be converted to a subtask or moved to another parent. Prevent parent cycles and cross-household references.

### 4.1 Dynamic, overridable inheritance

The following effective properties inherit dynamically from the nearest applicable ancestor unless explicitly overridden: **epic, places, resources, tags, assignees, high priority, earliest-start date, deadline**. Blocking dependencies on any ancestor also affect descendants, but dependencies are not copied to child rows.

For scalar or single-value fields, distinguish **inherit**, **explicit value**, and where applicable **explicitly none/false**. Therefore, a child can intentionally have no deadline or no high priority even when the parent has one. A child may override its start date to be earlier than its parent's. A child deadline later than its parent's is allowed with a warning, not rejected.

For the **multi-value collections places, resources and tags**, inheritance is **item-by-item** (approved option B): inherit the parent's effective set, add local items, or exclude particular inherited items. If the parent later adds another item, the child inherits it unless explicitly excluded. Removing an inherited item from a child is a local exclusion and must not modify the parent. The same mechanism must work at arbitrary nesting depths. Assignees can inherit and be overridden, but their exact multi-value override UI is less prescriptive than places/resources/tags; see the technical spec's tri-state/override requirements and the decision notes.

All effective values shown on a card, in details or used by filters must agree. Bulk ancestor changes must take effect without copying changed values into descendants' rows.

## 5. Epics, places, resources and tags

### Epics

Epics are **organizational groupings, not task cards**. They have name, optional description, icon, palette color, global ordering and archived state; they have **no assignees or deadlines**. A task belongs to at most one epic, possibly inherited from its parent. Epics are created/edited/reordered/archived/deleted from management screens. Deleting an epic preserves tasks and makes them Unassigned. Archived epics remain attached to existing tasks but are hidden from normal new assignments.

When epic lanes are enabled in a Board: desktop shows collapsible horizontal swimlanes, mobile shows collapsible sections inside the active column; both obey the global epic sort order. Unassigned is last. Empty lanes are hidden by default, configurable per view. No group-by-assignee or group-by-place; these are filter criteria.

### Places

Places mean **specific usable locations**, e.g. `Grankottevägen 30`, `Sandvreten`, not categorical descriptions such as `Outdoor` (use a tag for Outdoor). A place has name, icon, color and optionally coordinates/radius. A task may match multiple places with **OR semantics**: it can be performed at any one of them. No place means anywhere. Users may manually select current place in v1; automatic geolocation is later.

### Resources

Resources are named requirements such as `Car`, `Trailer`, `Ladder`, each with name/icon/color. A task can require multiple resources (meaning all required resources are needed). A filter may select tasks that **require** a given resource or tasks feasible given a set of **available** resources; these are distinct semantics. Tasks with no requirements are feasible regardless of available resources.

### Tags

Unlimited household-defined tags, each with name/icon/color. Multiple per task; one shared ungrouped tag list. Tags support item-by-item dynamic inheritance and filtering.

## 6. Dependencies and related tasks

- **Blocked by** is Finish-to-Start: a task is blocked until all its blocking tasks are Done. Availability checks only completion of direct and ancestor-inherited blockers, not those blockers’ own dependencies. Transitive traversal is used for cycle detection. Dependencies can connect any hierarchy levels within the same household, and blocking dependencies on ancestors apply to descendants.
- Direct and indirect cycles, including those emerging from hierarchy changes, must be rejected. No cross-household dependencies. A task must not be allowed to depend on itself through ancestry or through a dependency chain.
- A blocked task can be manually started after a warning. When a completed dependency is reopened, its dependents become blocked again without being automatically moved back from In Progress.
- **Related to** is a separate nonblocking, bidirectional link. It affects neither columns nor availability.

## 7. Recurrence and shared templates

The same template mechanism supports ordinary task templates and recurring-task series. A template can include task metadata, subtasks, tags, resources, dates and internal dependencies. Creating a task from a template does not create a live link that changes the task when the template changes.

- Recurrence supports daily/weekly/monthly/yearly/custom intervals. Custom intervals mean every N days, weeks, months, or years. Missing calendar dates use the last valid day of the scheduled month/year, calculated from the original schedule anchor to avoid drift.
- Each occurrence is an **independent task tree** with its own history. A new occurrence is created even if the previous one remains incomplete.
- Occurrences are materialized **14 days before their scheduled start by default**, with per-series configuration. Materialized future occurrences can be seen in planning views, but not in Now before actionable.
- Relative earliest-start/deadline rules apply to each occurrence (e.g. starts Oct 1, due Oct 15).
- **Edit this occurrence** modifies only that instance; **Edit entire series** changes its template/series for future instances, not historical instances.
- Dependencies between nodes **inside** the template must be remapped to the corresponding nodes in the new occurrence. Dependencies on **external** tasks retain their target; warn about deleted or invalid external targets.
- Job execution must be idempotent, preventing duplicate instances for the same scheduled occurrence.

## 8. Reusable advanced filters

Filters are household-wide saved entities with name, icon, color, creator, current definition and restorable version history. Members may create, edit, duplicate, delete and use each other's filters. Edits to a shared filter update all views referencing it; clearly indicate that fact before saving changes. Built-in filters can be restored to their defaults.

Definitions support typed operators, nested **AND/OR/NOT**, multiple values, comparisons, and dynamic operands such as Current User, Today and Current Place. Logical expressions are constructed in a **visual builder**; the user need not write syntax. Names like “This Week” are just labels: the expression, e.g. `Column IN [Within a Month, To Do]`, determines behavior. No separate “Planning Horizon” input in the UI: use the six-value **Column** predicate.

The editor displays a **live result preview and count**; edits remain a draft until Save. On desktop prefer a side panel showing results alongside; mobile uses a full-screen editor and a preview affordance.

### View-scoped quick-filter bars

Each saved view selects which filters appear as chips in its **horizontal quick-filter bar**. Tapping a chip toggles it; right-click/long-press offers Edit, Duplicate and Delete. Active chips combine with **AND** and further narrow that view's **base filter**:

`result = baseFilter AND quickFilterA AND quickFilterB …`

The definition of each filter and the list of chips assigned to the view are shared. Which chips are currently enabled is **personal per user and view** and persists across sessions. Quick chips are not hardcoded one-off dropdowns; complex conditions live in their reusable saved definitions. Filters should make missing or contradictory matches understandable and offer clear reset actions.

## 9. Views, sorting and cards

Every household may have shared saved views with name, icon, color, creator, Board/List presentation, base filter, quick-filter bar contents, sort order, epic-lane mode, whether subtasks show as separate cards, and chosen visible card properties. Each user selects navigation favorites independently.

The built-in **Now** and **Board** views are customizable and resettable but not deletable. Board normally shows all six workflow columns, optionally narrowed by its base/quick filters. Manual ordering is shared globally across views. A saved view can configure manual order (default), deadline, priority, effort or creation date sorting. Do not group by place/assignee.

Cards prioritize title, epic identity, high-priority badge when present, size (not precise minutes), deadline (if set), subtask progress and assignee chips/avatars. Other metadata is configurable per view or shown in details. No task-specific icon editor is required for v1; the epic icon is the primary card icon.

### Creating/editing tasks

- One-field quick capture, global `+`, desktop shortcut `N`. When created without context, new tasks go to **Someday**; in a known column/epic lane, inherit that context. Creating from a filtered view may prefill *unambiguous* filter properties, but must not silently invent ambiguous ones.
- Optional expanded creation for all task properties and immediate subtasks.
- Desktop drag to reorder/change column/move epic, or drop onto another task to reparent with a clear affordance; mobile uses menus and long-press for appropriate local rearrangements.
- Autosave for normal task editing, with discreet pending/error state. Support multi-step Undo/Redo where practical; Undo must not overwrite another user's concurrent changes. Filter building is an explicit Save/Cancel exception.

## 10. Content, collaboration and search

- Tiptap-style rich descriptions and comments: headings, emphasis, lists, checklists, hyperlinks, quotes, code blocks, inline images, Markdown shortcuts, and `@mentions`.
- Chronological **flat** comments with author/timestamp, editing/deleting one's own comment, attached images/files; **no threaded replies**. Separate tabs for Comments and Activity. `@mentions` generate notifications when that capability ships.
- Attach several images/files per task, camera uploads on mobile, drag-and-drop and pasted screenshots (`Cmd/Ctrl+V`), thumbnails and full-size viewing. Files belong in backup/export.
- Activity history records who changed status, assignments, deadlines, completion and other significant properties; not every historical change must be undoable.
- Search while typing across tasks/subtasks, epics, tags, comments and archived tasks; support filter expressions over results. Desktop `Cmd/Ctrl+K`. No AI/semantic search requirement.
- REST mutations + WebSocket change signals keep multiple devices synchronized. Concurrent same-field edits require conflict resolution; different-field edits should merge when safe. No Google-Docs-style co-editing in v1.

## 11. Lifecycle and housekeeping

- Done records the completing person/time. Completing an unfinished-parent requires warning but is allowed. All subtasks done does not automatically complete the parent.
- Reopening Done restores the immediate previous column and reevaluates all dependent tasks; never auto-move dependents out of In Progress.
- Completed tasks with unfinished descendants must not be automatically archived. Otherwise completed tasks are **auto-archived 30 days after completion** by default; household setting can change or disable it. Archived tasks are retained, searchable and restorable.
- Soft deletion moves an entire selected parent subtree to Trash, restorable by all members. Trash retention defaults to **30 days**; afterwards deletion is permanent. Only Admin can explicitly delete permanently. Warn when other tasks depend on an item to be deleted. Permanently deleted blockers remain unresolved until explicitly handled; deleting them does not satisfy the dependency. Provide immediate Undo for supported destructive actions.

## 12. User notifications and localization

Notifications are planned for **v1.1**, not the initial production-ready v1.0. Scope: in-app and device push for upcoming deadlines, one-time overdue reminders, newly assigned tasks, becoming available, comments and @mentions. Assigned users get deadline reminders according to their own settings; default 24 hours prior. Users can add per-task reminders, toggle each category, and set quiet hours (defer delivery rather than drop notifications). Completed tasks send no further deadline reminders. Notification behavior remains defined even while its implementation is deferred.

Language follows browser/device locale initially; personal setting can override. English and Swedish; English fallback. Locale-appropriate dates/times/numbers. Appearance modes: System (default), Light and Dark, per user.

## 13. Deployment, recovery and phases

The first release is self-hosted using Docker Compose and persistent PostgreSQL plus file storage; the full app works through HTTPS. Initial install includes secure passkeys, household roles, SMTP configuration, CLI manual PostgreSQL/file backup and documented restore. The app is an online-first installable PWA; full offline edits/sync are **future only**.

**Milestone 1 / v1.0:** all core task, hierarchy, availability, dependencies, epics, manual place selection, resources, tags, dates, estimates, filter/view builder, recurrence/templates, collaboration, rich text, attachments, search, admin/users/passkeys, localization, themes and everyday mobile/desktop UI.

**Milestone 2 / v1.1:** automatic GPS-based current place, notification center, device push and personal deadline/event reminders, plus UX improvements.

**Milestone 3 / v1.2:** measured performance and usability/reliability refinements from real use.

**Milestone 4 / v1.3:** encrypted automated cloud backups/restores with Restic/Rclone; **both Google Drive and Dropbox**, Google Drive implemented first. Admin UI controls schedules (default 03:00), retention (30 daily, 12 weekly, 12 monthly), integrity checks (weekly), failure alerts and restore. Independent CLI disaster recovery remains essential. Plan this after roughly 2–3 months of test usage; avoid bringing it into Milestone 1.

Unscheduled future concepts (not commitments): offline modifications and conflict sync, Home Assistant/calendar integrations and advanced collaborative editing.

## 14. Normative examples

1. **Parent with resources Car and Ladder:** child locally excludes Car. Parent later adds Trailer; child effectively requires Ladder and Trailer, not Car.
2. **Deadline:** parent due Oct 30; child explicitly due Nov 5. The system warns about the later deadline but allows it. Parent changing its own date does not change the child's explicit override.
3. **Dependency:** B depends on A; B is excluded by Now until A is completed (assuming other conditions pass); reopened A reblocks B without forcing any column changes.
4. **Current location:** with manually chosen Sandvreten and the corresponding place-compatibility filter, include tasks tagged Sandvreten or no place; exclude those tagged only Grankottevägen 30. A multi-place task matches any listed place.
5. **Recurring chain:** a winterization template's `Drain pipes` depends on its `Turn off pump`. Next year's `Drain pipes` must depend on next year's `Turn off pump`, not last year's.
6. **Multiuser saved filter:** editing the shared filter definition changes every view that uses it, but does not reset anyone's individual on/off toggle state.

## 15. Product decisions intentionally left to implementation details

Exact text labels, individual component dimensions and accent palette values belong to the UX/UI specification. Internal representation of a nullable explicit override, conflict-resolution protocol, migrations and query planning belong to Technical Architecture, subject to all behavioral rules above. If a behavior is not defined in these specifications and would alter what users experience, the implementing agent must ask rather than silently invent a feature.

### Owner addition — automatic planning progression (2026-10-15)

Active tasks with an effective earliest-start date automatically move forward through
Someday → Within a Year → Within a Month → To Do. Horizons are inclusive calendar
years/months in the household timezone, clamping missing dates to the last valid day.
The To Do transition occurs when the effective start date/time is reached (local
midnight for date-only starts). Inherited starts use the same rule. The maintenance
worker checks every minute, including catch-up after downtime. It never moves a task
backward or changes In Progress, Done, archived or trashed tasks. Missing starts do
not trigger a move. Dependency blockers continue to govern availability independently
of the planning column. Automatic changes record activity and advance the column
revision so stale edits and Undo cannot silently overwrite them.
