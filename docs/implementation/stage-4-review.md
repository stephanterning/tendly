# Stage 4 review — hierarchy, inheritance and dependencies

Stage 3 (PR #3) was accepted and merged with the owner's explicit approval.
Stage 4 is the next review checkpoint inside the complete Milestone 1 VP.

## Available for review

- Full subtasks with independent columns, editable parent, breadcrumb navigation,
  direct-child progress and a warning before completing a parent with any unfinished
  descendant. Completing a parent never completes its children.
- Dynamic scalar inheritance with explicit own/none/false values and a return-to-inheritance
  control. Places/resources/tags follow the parent plus local additions/exclusions.
  Moving an existing task preserves its own values/overrides; inherited values follow
  its new parent. New subtasks inherit unspecified scalar fields automatically.
- Direct and ancestor-inherited blockers, cycle-safe edits and warnings before starting
  blocked tasks. Reopening a blocker changes availability without changing columns.
- Bidirectional Related to links remain nonblocking. Deleted blocker identities remain
  unresolved until the edge is explicitly removed.
- Now can display independently actionable children. Board defaults to parent cards;
  its subtask-card toggle provides the Stage 4 preview of the persisted view setting
  that ships with the shared view editor in Stage 5.

## Verification

Eight unit scenarios, including a 3,000-level tree without recursive stack overflow;
sixteen database integration scenarios across the project, including effective cycles,
concurrent edge/reparent races, isolation, exclusions, scalar/date overrides, direct
progress versus descendant warnings, peer relation conflicts and missing blockers.
The browser journey exercises child creation, inherited identity/priority, a resource
exclusion surviving parent edits, mobile layout, parent completion confirmation and
Now availability following a reopened blocker, alongside the existing account flows.
Build, lint, typecheck and generated API consistency are required as usual.

## Try locally

Open an existing task and add a subtask. Open the subtask, move it to To Do and compare
its inherited properties with its parent. Under Planning details choose Exclude for
one inherited resource, then add another resource to the parent. Inspect the child's
current effective resources. Try linking a blocker and completing/reopening it.

Stage 5 remains filters, quick-filter bars, shared views, epic lanes and full Board
interactions (including drag/drop). No Milestone 1 requirement was dropped.
