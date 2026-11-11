# Tendly — UX/UI Specification

**Version:** 1.0  
**Status:** Approved visual direction; normative interaction guidelines  
**Reference:** [approved-visual-direction.png](references/approved-visual-direction.png)

> This document specifies **how** the product should look and behave in use. The [Product Specification](../product/product-specification.md) defines **what** it must do. Concept art shows the desired visual mood but contains potentially incorrect generated text/controls; written specs always win.

## 1. Design intent

**Things 3 simplicity × Linear precision**, without the visual or operational complexity of ClickUp. Feel calm, deliberate, polished and fast. Every frequent action should be easy to discover; sophisticated planning controls should appear only when opened. Do not add dashboard counters, decorative charts or enterprise navigation by default.

Design for a household member opening a phone to see **what can I do now**, check something off, add a comment/photo or quickly capture a task. Desktop should excel at longer writing, large boards, filter construction and settings. **No important feature is desktop-only.**

### Interaction principles

- **Progressive disclosure:** Title-first capture; secondary metadata tucked into details; advanced configuration behind predictable controls.
- **Recognizable context:** Epic color/icon remains visible on mixed, ungrouped cards.
- **Density hierarchy:** Prominent titles; effort **XS–XL** next; date/assignee/progress as unobtrusive metadata; exact duration secondary.
- **Direct manipulation:** Tap to open, tap/keyboard to complete, drag where helpful, always offer an accessible equivalent.
- **Immediate feedback:** Optimistic response, subtle save/conflict/error feedback, Undo where applicable.
- **Consistent semantics:** Never add extra workflow states like `Waiting`, `Urgent`, `Normal` or `Blocked` as columns/priority levels. Blocking is an availability indicator, not a workflow column.

## 2. Colors, identity, typography and icons

### 2.1 Epic palette (normative)

- Each epic chooses **one hue** from a **curated 12–16-hue palette** with consistent perceived lightness/saturation. Users do **not** choose arbitrary epic background hex values independently for each theme.
- Generate theme variants using **OKLCH** or equivalent perceptually uniform color transforms. Preview each option in both themes.
- **Light:** very light, softly tinted card fill; dark/near-black title and monochrome icon. **Dark:** deliberately darker tinted card fill; white/near-white foreground and icon. Preserve readable WCAG contrast in both.
- A card without an epic has a neutral surface. Card color is determined by effective epic, even when epic lanes are disabled or cards are sorted across epics.
- A restrained left edge/accent may reinforce epic identity but must not add visual clutter. Epic background is the primary color carrier.
- Semantic colors for errors, deadline warnings and focus must remain distinguishable from epic identity; include an icon/text indicator rather than color alone.

### 2.2 Icon language

Use **Lucide or a comparably coherent monochrome outline set** for UI actions and selectable entity icons. No colorful emoji-style icon collage. The effective epic icon is the primary icon on a task card; **a separate custom task-icon property is not required in v1.0**.

Provide one searchable icon picker for epics, places, tags, resources, filters and views. Non-epic entities can select predefined color swatches and (where appropriate) custom color via picker; the **epic palette restriction takes precedence** for epics. Keep stroke, sizing and spacing consistent. Icon foreground on colored epic cards is dark in Light and light in Dark.

### 2.3 Layout system

- Neutral app chrome, consistent spacing scale, modest rounded corners, subtle borders and very limited shadow use. Rounded cards with enough whitespace to tap confidently on a phone.
- Use a readable contemporary sans (e.g. **Inter**), responsive type scale and clear focus states. Avoid large empty headline regions or dense metadata matrices.
- Support **System** (default), **Light**, **Dark** themes per user. Support English and Swedish UI with appropriate locale formats and account-level language override.
- Touch targets should be comfortable; do not rely on hover, color alone or drag alone.

## 3. Shared navigation and page shell

### Mobile

Fixed bottom navigation: **Now | Board | More** (localized); one prominent global **+** quick-capture action. Search and saved views are reachable through More; user favorites should not force extra permanent tabs. Keep the main task list and filter bar visible without a large dashboard header.

### Desktop

Collapsible left navigation with Now, Board, favorite shared views, search and settings. Compact icon-only mode when collapsed. Keyboard shortcuts: `N` for quick task, `Cmd/Ctrl+K` for global search, normal platform Undo/Redo shortcuts. Hide the household switcher if there is only one membership.

Both form factors share the same underlying view/filter/task behavior; switching devices must not change the underlying data. Navigation favorites and active filter toggles are personal, while view/filter definitions are shared.

Workspaces and tasks have bookmarkable addresses scoped to a household. Task cards and task search results are native links, supporting a new tab and copying the address. Opening a task preserves its underlying view, search text/filters and selected board column. Back/Forward and the task's Back action respect the same autosave/draft guard; cancelling navigation preserves both the document and its address. Closing a direct link with no originating workspace stays within the app. Return focus to the originating task/search link when it remains available.

Comment search results open and focus the matching comment, loading additional comment pages if necessary. Description matches scroll into view and use presentation-only highlights, never rich-text changes. Search snippets include the matching passage. Missing comments and unavailable tasks have explicit feedback and a way back.

## 4. Task cards

A default compact card should expose only the fields that help someone decide/act:

1. **Title** — visually primary, legible at a glance.
2. **Effective epic** — tinted background + monochrome epic icon; no requirement to spell out the epic on every card.
3. **Effort size** — XS/S/M/L/XL chip if set. Do not display exact minutes prominently.
4. **High priority** — a discrete single badge/icon **only when checked**; no priority lanes or extra levels.
5. **Deadline** — only if present, with clear overdue/near-due treatment; not a separate status.
6. **Subtask progress** — e.g. `2/5`, only if relevant.
7. **Assignees** — small avatars/initials where helpful.

Each saved view can control which metadata is visible on cards and whether subtasks are separate cards. Blocked/unavailable cards, when intentionally shown on planning boards, can have a subtle indicator and an explanation in details. Do not clutter default Now cards with unavailable/blocked work.

Tap/click card opens details. Provide a fast completion affordance. DnD actions show previews and drop-zone differences (reorder, move column, epic transfer, convert to child); accidental reparenting must be difficult. Mobile provides menu-driven equivalents.

## 5. Now view

The home screen is a **vertical task list**, not a board, KPI panel or agenda calendar. The purpose is actionable tasks with minimum distractions.

- Apply the Product Specification's default base filter: **Within a Month, To Do, In Progress**, with satisfied dependencies and effective earliest-start date reached.
- Render a horizontal **view-specific quick-filter chip bar** above tasks. Chips are saved filters, not hardcoded property dropdowns. Multiple active chips narrow via AND.
- Use the app-wide detected Current Place when an explicit base or quick filter references it.
- Support simple sensible empty states: *no actionable tasks* versus *filters have zero matches*; show active chips and a clear reset action.
- When the household has no current tasks, invite the user to create the first one. An empty Now view with other tasks offers Board. Show the **View settings** button beside the view heading.
- Keep create-task easy to reach regardless of scroll position.

## 6. Board and saved views

### Workflow display

The board defaults to **Future**, **To Do**, **In Progress** and **Done**, translated by locale. Place the **View settings** button beside the Board heading, followed by the **Show separate future columns** checkbox. The checkbox replaces Future with Someday, Within a Year and Within a Month, in that order. Save this choice per user and board view. The single task `Column` field continues to expose the six exact choices.

**Desktop:** multiple columns side by side, horizontal overflow on smaller desktops, drag between columns and optional epic swimlanes. **Mobile:** exactly one active column shown at once, with swipe between columns **and** a direct column selector. With epic grouping, use collapsible sections within the active mobile column; desktop lanes are collapsible horizontal swimlanes. Global epic ordering applies everywhere. The Unassigned epic lane is last, empty lanes hidden unless that view requests them.

At tablet widths up to 1024px, use the single-column board with a direct selector and compact navigation. The selector and swipe order use the current four- or six-column layout. Selecting Future shows the combined results for the three planning horizons. Column counts reflect the currently loaded results. The workspace address retains the selected task column and shows Future in grouped mode when that column is Someday, Within a Year or Within a Month.

A view can be **Board** or **List** and records base filter, selected quick-filter chips, sorting (manual/default, deadline, High, effort, created date), epic lanes on/off, empty-lane visibility, visible card properties and subtask-as-card mode. Only group by epic; assignee/place are filter predicates, not lanes. All views are shared; users personally favorite views for their navigation.

Built-in Now/Board views are editable and resettable but not deletable. View editing should show shared impact and support a restore-default command for built-ins.

## 7. Filter experience (core differentiator)

### Quick-filter bar

A horizontal, scrollable set of **saved filter chips**, specific to the active view. A tap/click toggles. Selected chips remain active across sessions for **that user and that view**. A `+` opens the shared filter library / create flow. Right-click or long-press opens Edit, Duplicate and Delete. Ensure buttons work equally well on touch and keyboard. Do not invent permanent `All / Now` segmented controls inconsistent with the underlying saved filter model.

**At my current place** matches tasks that can be done at the automatically detected place or anywhere. Turning on the filter triggers the browser's location permission request when needed. If a saved or draft filter needs permission, offer **Use my location** with the results. Place coordinates and radii are edited in the library.

After creating a filter from this bar, offer an explicit **Add to this view** action. Saving the definition and attaching it to a view are separate, recoverable operations; other views and personal active toggles remain unchanged. Closing, cancelling or navigating away from an edited filter/view asks whether to keep editing or discard the unsaved changes. Reload/close warns about these in-memory drafts; unlike task recovery copies, filter/view drafts are not persisted across reloads. Dialog replacement must move focus into the new dialog.

### Visual filter builder

Use nested groups and typed controls for AND/OR/NOT, field choice, operator and values. Fields are expressed in domain/user terms (`Column`, `Size`, `Place`, `Available`, `Requires resource`, etc.); never expose `planningBucket` as a second task selection. Dynamic operands include Today, Current User and automatically detected Current Place.

- **Live matching count and results** as edits are made, without committing changes to a saved definition.
- **Desktop:** a side panel/adjacent editor leaves results visible; **mobile:** full-screen editor with a preview switch/area.
- Filter creation/editing needs **explicit Save or Cancel**, unlike normal task field autosave. Shared-filter edits clearly warn they update all views that reference the definition; filter version history supports restoring an older definition.
- The view's base predicate always applies, and active chips combine by AND. If zero results, show an intelligible empty state, never silently remove selected filters.

## 8. Task details, creation and editing

### Details layout

**Desktop:** expandable right-side panel, board/list remains in context. Open in the expanded writing view; allow switching to a compact side panel without remounting the editor or losing the current draft. **Mobile:** full-screen task details with an obvious Back action. Edit values in place; keep advanced values collapsed or categorized without hiding essential state.

**Owner-approved content-first layout, 2026-11-01:** the title leads into the rich description as a living document for ideas, links, decisions, small checklists and inline inspiration images. In the expanded desktop view, planning properties occupy a secondary right column. In the compact panel and on mobile, a collapsed planning summary above the description shows column, size, epic, High when set and deadline when set; expanding it exposes the same property controls. Validation errors reveal the relevant planning controls. Titles grow to fit rather than clipping long task names.

The rich-text toolbar keeps **Bold, Italic, Checklist, Image and Link** directly accessible, with other formatting and mentions under **More formatting**. On narrow screens, labelled icons keep the primary row compact with 44px touch targets. Active formatting follows the selection. Enter continues a checklist; Enter on an empty item returns to a paragraph. Existing Markdown shortcuts remain available. Normal autosave acknowledgements preserve selection, cursor, scroll and local undo history.

Clicking a link in editable content, or pressing Cmd/Ctrl+K inside the editor, opens link options. Opening the saved address in a new tab is separate from editing its address or removing the link while retaining its text. Cancelling returns focus to the editor without changing content. Outside the editor, Cmd/Ctrl+K remains global search. Descriptions and comments share these editing controls.

Images in the document can be enlarged, and attachments appear in a thumbnail gallery below the description, with preview, image navigation and original download. Multiple selections, pasted images and file drops use a per-file queue with transfer progress, preview-processing state and individual retry/dismiss actions. Successful files continue after a failed file; completed attempts collapse into a summary. Delayed images keep their mapped insertion positions and batch order while the user writes elsewhere. If that position is removed, keep the uploaded file in the gallery and offer explicit insertion at a newly chosen cursor position. Removing an inline image keeps its original; gallery images can be inserted again without another upload. Unfinished entries must be retried or dismissed before closing the task or submitting/switching the affected comment editor. **Comments** and **Activity** remain separate tabs below the task content. Checklist items inside a description remain part of that document, distinct from full subtasks. Present inherited values as inherited when hierarchy is implemented, offer per-property override controls, and distinguish intentionally excluded inherited multi-values. Users should be able to return to inheriting.

A task's **High** input is a single checkbox/toggle, not a three-level picker. Place names are physical locations such as Grankottevägen 30 and Sandvreten; generic Outdoors should be a tag. Size (XS–XL) remains the primary estimate signal; exact hours/minutes live deeper in details.

### Quick capture

Global `+` or desktop `N`, immediate title-entry, Enter to create. Without context use Someday; in a known column/epic lane adopt that column/epic. Optional expansion permits description and all properties. Avoid a modal demanding fields for an ordinary household task.

### Editing behavior

Normal fields use autosave. Indicate pending/saved/failed subtly; allow retry and avoid losing text. Provide Undo/Redo for meaningful recent changes, mobile Undo toast after completion/move/delete, and a conflict dialog only for actual conflicting concurrent field edits. Ordinary drag and drop is undoable; do not force confirmation unless the action is consequential (blocked start, later child deadline warning, finishing parent with incomplete descendants, dependency-affecting deletion, etc.).

Task autosave serializes pending edits: closing waits for changes made while an earlier save was in flight. Empty-title and estimate errors appear at their fields. If saving fails, the user can continue editing or keep an explicit recovery draft and close; known unsaved changes may also be discarded. Recovery copies are scoped to the user, household and task in the current browser tab (`sessionStorage`), survive reload, and require review before saving resumes. They are not offline synchronization and are not guaranteed after closing the browser tab. If recovery storage is unavailable, say so rather than claiming a copy was kept.

A task write times out after 12 seconds. A timeout/lost response leaves the outcome uncertain: retry reads the saved version first and uses the original guarded revision if the request needs repeating. Discard is unavailable until an uncertain request is reconciled; keeping the draft and closing remains available. Same-field conflicts show both the local and saved content, including formatted descriptions and copyable text. Accepting the latest version replaces only the conflicting logical fields (date and time form one field), preserving other local edits. Users can combine content in the editor before applying their version. Pending content uploads/comment operations prevent closing the task before the operation completes.

### Subtasks

Initially display as simple checklists with nested reveal on demand, but each item opens full-featured task details. Show `n/N` completion on parent card; finishing a subtask does not auto-complete the parent. Where subtasks appear independently, provide a compact visible parent breadcrumb/context.

## 9. Rich content, search and notifications

Use a consistent rich-text control for descriptions and comments: headlines, formatting, list, checklist, links, images, quote, code, Markdown shortcuts and user mentions. Support paste from clipboard and camera/photo attachments in task/comments. Use thumbnail browsing and full-size viewing. Comments remain a **flat chronological list**; Activity is a separate history tab. Mention notification delivery arrives in v1.1, though mention editing is in v1.0.

Global search is incremental, includes archived results and supports the same filters. Mobile and desktop search affordances must be equally discoverable; desktop `Cmd/Ctrl+K`.

**v1.1 only:** in-app notification center and device Web Push settings, quiet hours and notification category preferences. Do not put dead notification controls into the v1.0 user interface as if they were active.

## 10. Administration and settings

Settings include household, members, account/passkeys, locale/theme, epics, places, resources, tags, size thresholds, saved views/filters, house defaults, SMTP and About/version. Installation-wide settings such as SMTP require separate deployment-administrator privileges. Household Admin membership does not grant them. Admin-only operations are identified without crowding Member UI. Epic management offers manual reorder and preview of light/dark swatches.

Backup UI is **not** part of v1.0; CLI manual backup/restore documentation is. Cloud provider connection/backup scheduling/restoration UI appears in **v1.3**.

## 11. Accessibility, resilience and motion

Aim for WCAG 2.2 AA with effective contrast checked against every palette card surface; screen-reader labels and semantics, visible keyboard focus, responsive touch targets and alternatives to gestures/drag. Respect reduced-motion preferences. Focus behavior should remain predictable when details open/close. API errors and lack of connectivity should show actionable text; no fake offline write support in v1.0.

## 12. UX acceptance checkpoints

- An epic-colored card has its **light** background with dark icon/text and **dark** background with light icon/text, remaining recognizable with lanes off.
- A user can create and finish a task from mobile without visiting Settings or opening a complex multi-step form.
- Selecting two saved quick filters narrows results via AND; switching views preserves that view's distinct filter bar and personal toggle state.
- A task detail shows a single `Column` control with six valid options, boolean High, prominently displayed size, and actual named place(s).
- On mobile Board, the user sees one column at a time and can swipe or jump directly to another.
- Filter Builder previews live results but does not modify a shared definition until Save.
- Completing, moving or deleting a task provides appropriate feedback and near-term Undo without wiping other users' changes.

## 13. Design reference limitations

![Approved visual direction — illustrative only](references/approved-visual-direction.png)

The image illustrates visual rhythm, tinted epic cards, light/dark surfaces and density, **not** literal labels, states or features. An implementation that copies a hallucinated status/priority from an image violates the Product Specification. Implementers should create **real interactive UI** to fine-tune spacings/contrast instead of using generated mockups as pixel-perfect assets.

## Invitation codes — owner addition, 2026-10-14

Household invitation forms offer email delivery or a copyable one-use code, with a visible 30-minute countdown. Show the recipient address, explain that joining must finish before expiry, and replace expired codes with a clear create-again message. Codes use text fields, not password fields. Provide manual selection when clipboard access is unavailable. Recipients paste a code from the sign-in screen or account settings; existing accounts authenticate before accepting.

### Owner review clarification — place maps and icon search (2026-10-14)

Place editing supports a manually placed, draggable map pin and a visible radius,
with a slider and exact metre input. Coordinates remain editable without map tiles;
opening or cancelling the editor does not change saved geodata. This is manual place
configuration, not automatic location detection. Map tiles load only when opened.

The shared icon picker searches the full bundled Lucide catalog, not just the visible
page. Include open and covered utility trailers, with English and Swedish search
terms (`trailer`, `släp`); keep the coherent monochrome outline style. Browse results
in manageable batches and show the result count. English icon names remain searchable
in either UI language; common household terms have Swedish aliases.
