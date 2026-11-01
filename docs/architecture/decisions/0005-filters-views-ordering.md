# 0005 — Shared filters/views, personal context and global ordering

Date: 2026-11-01

## Decision

Saved filters and views belong to a household. Members may edit shared definitions.
Filter revisions retain name/icon/color/expression and author/time; restoring a
revision creates a new revision. Deletion is reversible and removes a filter from
all effective quick bars, retaining references for restoration. Built-in Now and
Board cannot be deleted and have explicit reset commands. A view's quick-bar order,
sort, card properties and epic-lane configuration are shared; favorites and enabled
chips are versioned separately per user/view. Current Place is personal per household.

The public AST has typed predicates and AND/OR/NOT groups. Validation limits each
expression to 150 nodes, ten nesting levels and 50 children per group; fields,
operators, value types and dynamic operands are allowlisted. The compiler binds
values and JSON property names as SQL parameters. It never interpolates user SQL.
Current User resolves from the session. Today uses the household timezone and an
optional day offset. An unset Current Place produces an explicit warning and no
matches, even beneath NOT; it cannot accidentally broaden a location-dependent view.

A query combines the shared base, enabled/nondeleted quick filters allowed by that
view, and an optional draft with AND. Filter-edit preview replaces the edited chip
rather than intersecting its old and draft versions. The canonical TaskService
hydrator supplies all effective task properties and availability. A parameterized
PostgreSQL predicate evaluates those projections in batches of 256; the matching
set is counted/sorted before paging. There is no second evaluator in React. Reads
use a repeatable-read snapshot and one timestamp. Stage 4 must extend this hydrator
with inheritance/dependencies, so list, Board, preview and search remain consistent.
This currently scans household tasks: it prioritizes one correct domain boundary;
future performance work must preserve that boundary and filter-before-page semantics.

Search can AND reusable task filters over task/comment results; epics/tags are not
task matches and are omitted while task filters are enabled. Without filters global
search retains its original categories. Text matching uses the same plain-text
projection as description filters, preserving inline words, mentions and explicit
line breaks. Content is scanned in bounded batches before result pagination, with
filters and content in the same repeatable-read snapshot. This also scans household
content; future indexing must preserve those text and pagination semantics.
Read-only POST query/search routes never
broadcast mutation events, preventing subscribed previews from refetching themselves.

Manual ordering remains household-global. Column/epic/order moves share one
transaction, scoped anchors and household write lock. A separate order revision
rejects stale reorders and ordering Undo after anyone else's move; per-field task
revisions still allow unrelated text changes to merge. Rank re-spacing changes only
representation. Desktop drop targets and the keyboard/mobile Move dialog use the
same endpoint. Contextual creation supplies only the known column/epic. Hierarchy,
reparenting and separate-subtask-card controls belong to Stage 4 and are not exposed
as unfinished options here.

## Interfaces and storage

- `GET view-catalog`; shared `POST/PUT filters`, filter version history and commands.
- Shared `POST/PUT views` and reset/delete/restore commands; personal `PUT views/:id/state`.
- Personal `PUT view-context`; `POST task-query`, `POST search`, `POST tasks/:id/move`.
- Migration 0005 adds definitions, filter history, personal states/context and order
  revisions. Existing tasks, content and file records are untouched. Built-ins are
  initialized idempotently for existing and new households under a write lock.
- OpenAPI and the generated client describe the interfaces; recursive AST validation
  remains authoritative on the server. Every operation checks fresh household access.
